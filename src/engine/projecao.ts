// src/engine/projecao.ts
import { dataDaReuniao, vigenciaDaDecisao, type ReuniaoCopom } from './copom';
import { criarCurva, valorEm, type Curva, type PontoCurva } from './curva';
import { type DataISO, paraDia, somarMeses } from './datas';
import { OfertaInvalidaError } from './erros';
import type { Cenario } from './indexadores';

/** Estatísticas do Focus em PERCENTUAL, como vêm da API (13.25 = 13,25%). */
export interface EstatisticaFocus { mediana: number; desvioPadrao: number; minimo: number; maximo: number }

export interface DadosFocus {
  dataColeta: DataISO;
  selicPorReuniao: readonly { reuniao: string; est: EstatisticaFocus }[]; // % a.a.
  ipcaMensal: readonly { anoMes: string; est: EstatisticaFocus }[]; // AAAA-MM, % a.m.
  selicAnual: readonly { ano: number; est: EstatisticaFocus }[]; // % a.a., fim de ano
  ipcaAnual: readonly { ano: number; est: EstatisticaFocus }[]; // % a.a.
}

/** Valores atuais do SGS, já em fração. */
export interface Atuais { dataReferencia: DataISO; selicMetaAA: number; trAM: number }

export interface Premissas {
  /** Quantos desvios-padrão afastam os cenários "sobem/caem" da mediana. */
  k: number;
  ipcaLongoPrazoAA: number;
  juroRealLongoPrazoAA: number;
  /** Anos, depois do último ano do Focus, para convergir às premissas (inteiro ≥ 0). */
  anosConvergencia: number;
  /** CDI = Selic meta − spread. */
  spreadCDI: number;
}

export const PREMISSAS_PADRAO: Premissas = {
  k: 1, ipcaLongoPrazoAA: 0.03, juroRealLongoPrazoAA: 0.05, anosConvergencia: 5, spreadCDI: 0.001,
};

export type TipoCenario = 'SOBEM' | 'BASE' | 'CAEM';
const SINAL: Record<TipoCenario, number> = { SOBEM: 1, BASE: 0, CAEM: -1 };

export interface CenarioProjetado extends Cenario {
  tipo: TipoCenario;
  curvaSelic: Curva;
  /** Taxa mensal (fração) por mês civil. */
  curvaIpcaMensal: Curva;
  ultimoAnoFocus: number;
  /** A partir desta data a projeção é premissa, não expectativa de mercado. */
  inicioPremissa: DataISO;
  reunioesEstimadas: readonly string[];
  /** Reuniões do Focus que não puderam ser datadas (nem pelo calendário oficial, nem por estimativa). */
  reunioesSemData: readonly string[];
}

interface Ancora { data: DataISO; valor: number }

function validarPremissas(p: Premissas): void {
  const ok = Number.isFinite(p.k) && p.k >= 0
    && Number.isFinite(p.ipcaLongoPrazoAA) && p.ipcaLongoPrazoAA > -1
    && Number.isFinite(p.juroRealLongoPrazoAA) && p.juroRealLongoPrazoAA > -1
    && Number.isInteger(p.anosConvergencia) && p.anosConvergencia >= 0 && p.anosConvergencia <= 30
    && Number.isFinite(p.spreadCDI) && p.spreadCDI >= 0 && p.spreadCDI < 0.05;
  if (!ok) throw new OfertaInvalidaError('Premissas do cenário inválidas');
}

const ajustar = (e: EstatisticaFocus, tipo: TipoCenario, k: number): number =>
  Math.min(e.maximo, Math.max(e.minimo, e.mediana + SINAL[tipo] * k * e.desvioPadrao)) / 100;

/** Primeiros dias de mês m com inicioExclusivo < m ≤ fimInclusivo. */
function primeirosDosMeses(inicioExclusivo: DataISO, fimInclusivo: DataISO): DataISO[] {
  const meses: DataISO[] = [];
  for (let m = somarMeses(`${inicioExclusivo.slice(0, 7)}-01`, 1); m <= fimInclusivo; m = somarMeses(m, 1)) meses.push(m);
  return meses;
}

/** Interpolação linear por dias corridos entre âncoras ordenadas; fora do intervalo, o extremo. */
function interpolar(ancoras: readonly Ancora[], data: DataISO): number {
  const d = paraDia(data);
  const primeira = ancoras[0] as Ancora;
  if (d <= paraDia(primeira.data)) return primeira.valor;
  for (let i = 1; i < ancoras.length; i++) {
    const a = ancoras[i - 1] as Ancora;
    const b = ancoras[i] as Ancora;
    const da = paraDia(a.data);
    const db = paraDia(b.data);
    if (d <= db) return db === da ? b.valor : a.valor + (b.valor - a.valor) * ((d - da) / (db - da));
  }
  return (ancoras.at(-1) as Ancora).valor;
}

/** Há reunião (oficial ou estimada) no mesmo ano, anunciada depois de `r`? */
function temReuniaoDepois(r: ReuniaoCopom, oficiais: readonly ReuniaoCopom[]): boolean {
  const ano = r.anuncio.slice(0, 4);
  for (let n = 1; n <= 8; n++) {
    const outra = dataDaReuniao(`R${n}/${ano}`, oficiais);
    if (outra && outra.anuncio > r.anuncio) return true;
  }
  return false;
}

export function montarCenario(
  tipo: TipoCenario, focus: DadosFocus, atuais: Atuais, reunioesOficiais: readonly ReuniaoCopom[], premissas: Premissas,
): CenarioProjetado {
  validarPremissas(premissas);
  if (focus.selicAnual.length === 0 || focus.ipcaAnual.length === 0) {
    throw new OfertaInvalidaError('O Focus não trouxe projeções anuais');
  }
  const { k, anosConvergencia: anos } = premissas;
  const selicLP = (1 + premissas.ipcaLongoPrazoAA) * (1 + premissas.juroRealLongoPrazoAA) - 1;

  // Selic: degraus por reunião
  const pontosSelic: PontoCurva[] = [{ inicio: atuais.dataReferencia, valor: atuais.selicMetaAA }];
  const estimadas: string[] = [];
  let ultima: Ancora = { data: atuais.dataReferencia, valor: atuais.selicMetaAA };
  const datadas = focus.selicPorReuniao.map((r) => ({ r, reuniao: dataDaReuniao(r.reuniao, reunioesOficiais) }));
  const semData = datadas.flatMap(({ r, reuniao }) => (reuniao ? [] : [r.reuniao]));
  if (focus.selicPorReuniao.length > 0 && semData.length === focus.selicPorReuniao.length) {
    throw new OfertaInvalidaError('Sem o calendário do Copom não dá para posicionar as reuniões do Focus');
  }
  const reunioes = datadas
    .flatMap(({ r, reuniao }) => (reuniao ? [{ r, reuniao, vigencia: vigenciaDaDecisao(reuniao.anuncio) }] : []))
    .filter((x) => x.reuniao.anuncio > atuais.dataReferencia) // anunciada até a data de referência: já está na 432
    .sort((a, b) => (a.vigencia < b.vigencia ? -1 : 1));
  for (const { r, reuniao, vigencia } of reunioes) {
    const valor = ajustar(r.est, tipo, k);
    pontosSelic.push({ inicio: vigencia, valor });
    if (reuniao.estimada) estimadas.push(reuniao.id);
    ultima = { data: vigencia, valor };
  }

  // Selic: anual (fim de ano) e convergência, mês a mês.
  // Se a última reunião do Focus é a última do ano (nenhuma reunião oficial ou estimada depois dela no mesmo
  // ano), a âncora anual desse ano criaria um degrau em 1º/jan sem Copom: ela fica de fora.
  const ultimaReuniao = reunioes.at(-1)?.reuniao;
  const anoSemMaisReunioes = ultimaReuniao && !temReuniaoDepois(ultimaReuniao, reunioesOficiais) ? Number(ultimaReuniao.anuncio.slice(0, 4)) : null;
  const ultimoAno = Math.max(...focus.selicAnual.map((a) => a.ano));
  const ancorasSelic: Ancora[] = [
    ultima,
    ...[...focus.selicAnual]
      .filter((a) => `${a.ano}-12-31` > ultima.data && a.ano !== anoSemMaisReunioes)
      .sort((a, b) => a.ano - b.ano)
      .map((a) => ({ data: `${a.ano}-12-31`, valor: ajustar(a.est, tipo, k) })),
  ];
  if (anos > 0) ancorasSelic.push({ data: `${ultimoAno + anos}-12-31`, valor: selicLP });
  for (const m of primeirosDosMeses(ultima.data, (ancorasSelic.at(-1) as Ancora).data)) {
    pontosSelic.push({ inicio: m, valor: interpolar(ancorasSelic, m) });
  }
  pontosSelic.push({ inicio: `${ultimoAno + anos + 1}-01-01`, valor: selicLP });

  // IPCA: mensal do Focus, depois anual distribuído, depois convergência.
  // Nos cenários sobem/caem, o mês com Focus mensal recebe a abertura do ANUAL do seu ano, distribuída
  // em 12 avos: (1 + mensal) × ((1 + anual_k) / (1 + anual_base))^(1/12) − 1. Somar ±k·DP a cada mês
  // acumularia ~12 desvios no ano e faria a abertura encolher quando o mensal acaba.
  // Mês sem Focus mensal (antes do primeiro, lacuna ou depois do último): o anual do ano, em 12 avos.
  // Ano sem Focus anual: interpolação linear entre os anos vizinhos; fora do intervalo, o ano mais próximo.
  const anuaisIpca = [...focus.ipcaAnual].sort((a, b) => a.ano - b.ano);
  const primeiroAnual = anuaisIpca[0] as (typeof anuaisIpca)[number];
  const ultimoAnual = anuaisIpca.at(-1) as (typeof anuaisIpca)[number];
  const ultimoAnoIpca = ultimoAnual.ano;
  const anualIpca = (ano: number, t: TipoCenario): number => {
    if (ano <= primeiroAnual.ano) return ajustar(primeiroAnual.est, t, k);
    if (ano >= ultimoAnoIpca) return ajustar(ultimoAnual.est, t, k);
    const i = anuaisIpca.findIndex((x) => x.ano >= ano);
    const depois = anuaisIpca[i] as (typeof anuaisIpca)[number];
    const antes = anuaisIpca[i - 1] as (typeof anuaisIpca)[number];
    const va = ajustar(antes.est, t, k);
    return depois.ano === ano ? ajustar(depois.est, t, k) : va + (ajustar(depois.est, t, k) - va) * ((ano - antes.ano) / (depois.ano - antes.ano));
  };
  const mensais = new Map(focus.ipcaMensal.map((m) => [`${m.anoMes}-01`, m.est]));
  const convergenciaIpca: Ancora[] = [
    { data: `${ultimoAnoIpca}-12-31`, valor: anualIpca(ultimoAnoIpca, tipo) },
    { data: `${ultimoAnoIpca + anos}-12-31`, valor: premissas.ipcaLongoPrazoAA },
  ];
  const mesesMensais = [...mensais.keys()].sort();
  const mesReferencia = `${atuais.dataReferencia.slice(0, 7)}-01`;
  const inicioIpca = mesesMensais[0] !== undefined && mesesMensais[0] < mesReferencia ? mesesMensais[0] : mesReferencia;
  const fimConvergencia = `${ultimoAnoIpca + anos}-12-01`;
  const fimIpca = mesesMensais.at(-1) !== undefined && (mesesMensais.at(-1) as DataISO) > fimConvergencia ? (mesesMensais.at(-1) as DataISO) : fimConvergencia;
  const pontosIpca: PontoCurva[] = [];
  for (let m = inicioIpca; m <= fimIpca; m = somarMeses(m, 1)) {
    const ano = Number(m.slice(0, 4));
    const mensal = mensais.get(m);
    let valor: number;
    if (mensal) {
      const abertura = Math.pow((1 + anualIpca(ano, tipo)) / (1 + anualIpca(ano, 'BASE')), 1 / 12);
      valor = (1 + ajustar(mensal, 'BASE', k)) * abertura - 1;
    } else {
      const taxaAnual = ano <= ultimoAnoIpca ? anualIpca(ano, tipo) : interpolar(convergenciaIpca, m);
      valor = Math.pow(1 + taxaAnual, 1 / 12) - 1;
    }
    pontosIpca.push({ inicio: m, valor });
  }
  pontosIpca.push({ inicio: somarMeses(fimIpca, 1), valor: Math.pow(1 + premissas.ipcaLongoPrazoAA, 1 / 12) - 1 });

  const curvaSelic = criarCurva(pontosSelic);
  const curvaIpcaMensal = criarCurva(pontosIpca);
  const cdi = (d: DataISO) => valorEm(curvaSelic, d) - premissas.spreadCDI;
  return {
    tipo, curvaSelic, curvaIpcaMensal, ultimoAnoFocus: ultimoAno, inicioPremissa: `${ultimoAno + 1}-01-01`,
    reunioesEstimadas: estimadas,
    reunioesSemData: semData,
    selicMetaAA: (d) => valorEm(curvaSelic, d),
    cdiAA: cdi,
    selicOverAA: cdi,
    // fatorIPCA distribui (1 + ipcaAA)^(1/12) no mês; assim o mês rende exatamente 1 + taxa mensal.
    ipcaAA: (d) => Math.pow(1 + valorEm(curvaIpcaMensal, d), 12) - 1,
    trAM: () => atuais.trAM,
  };
}

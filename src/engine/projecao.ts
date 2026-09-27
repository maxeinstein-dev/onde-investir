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
  const reunioes = focus.selicPorReuniao
    .map((r) => ({ r, reuniao: dataDaReuniao(r.reuniao, reunioesOficiais) }))
    .flatMap(({ r, reuniao }) => (reuniao ? [{ r, reuniao, vigencia: vigenciaDaDecisao(reuniao.anuncio) }] : []))
    .filter((x) => x.vigencia > atuais.dataReferencia)
    .sort((a, b) => (a.vigencia < b.vigencia ? -1 : 1));
  for (const { r, reuniao, vigencia } of reunioes) {
    const valor = ajustar(r.est, tipo, k);
    pontosSelic.push({ inicio: vigencia, valor });
    if (reuniao.estimada) estimadas.push(reuniao.id);
    ultima = { data: vigencia, valor };
  }

  // Selic: anual (fim de ano) e convergência, mês a mês
  const ultimoAno = Math.max(...focus.selicAnual.map((a) => a.ano));
  const ancorasSelic: Ancora[] = [
    ultima,
    ...[...focus.selicAnual]
      .filter((a) => `${a.ano}-12-31` > ultima.data)
      .sort((a, b) => a.ano - b.ano)
      .map((a) => ({ data: `${a.ano}-12-31`, valor: ajustar(a.est, tipo, k) })),
  ];
  if (anos > 0) ancorasSelic.push({ data: `${ultimoAno + anos}-12-31`, valor: selicLP });
  for (const m of primeirosDosMeses(ultima.data, (ancorasSelic.at(-1) as Ancora).data)) {
    pontosSelic.push({ inicio: m, valor: interpolar(ancorasSelic, m) });
  }
  pontosSelic.push({ inicio: `${ultimoAno + anos + 1}-01-01`, valor: selicLP });

  // IPCA: mensal do Focus, depois anual distribuído, depois convergência
  const pontosIpca: PontoCurva[] = [...focus.ipcaMensal]
    .sort((a, b) => (a.anoMes < b.anoMes ? -1 : 1))
    .map((m) => ({ inicio: `${m.anoMes}-01`, valor: ajustar(m.est, tipo, k) }));
  const ultimoAnoIpca = Math.max(...focus.ipcaAnual.map((a) => a.ano));
  const anual = new Map(focus.ipcaAnual.map((a) => [a.ano, ajustar(a.est, tipo, k)]));
  const anualFinal = anual.get(ultimoAnoIpca) as number;
  const convergenciaIpca: Ancora[] = [
    { data: `${ultimoAnoIpca}-12-31`, valor: anualFinal },
    { data: `${ultimoAnoIpca + anos}-12-31`, valor: premissas.ipcaLongoPrazoAA },
  ];
  const ultimoMesFocus = pontosIpca.at(-1)?.inicio ?? `${atuais.dataReferencia.slice(0, 7)}-01`;
  for (const m of primeirosDosMeses(ultimoMesFocus, `${ultimoAnoIpca + anos}-12-31`)) {
    const ano = Number(m.slice(0, 4));
    const taxaAnual = ano <= ultimoAnoIpca ? (anual.get(ano) ?? anualFinal) : interpolar(convergenciaIpca, m);
    pontosIpca.push({ inicio: m, valor: Math.pow(1 + taxaAnual, 1 / 12) - 1 });
  }
  pontosIpca.push({ inicio: `${ultimoAnoIpca + anos + 1}-01-01`, valor: Math.pow(1 + premissas.ipcaLongoPrazoAA, 1 / 12) - 1 });

  const curvaSelic = criarCurva(pontosSelic);
  const curvaIpcaMensal = criarCurva(pontosIpca);
  const cdi = (d: DataISO) => valorEm(curvaSelic, d) - premissas.spreadCDI;
  return {
    tipo, curvaSelic, curvaIpcaMensal, ultimoAnoFocus: ultimoAno, inicioPremissa: `${ultimoAno + 1}-01-01`,
    reunioesEstimadas: estimadas,
    selicMetaAA: (d) => valorEm(curvaSelic, d),
    cdiAA: cdi,
    selicOverAA: cdi,
    // fatorIPCA distribui (1 + ipcaAA)^(1/12) no mês; assim o mês rende exatamente 1 + taxa mensal.
    ipcaAA: (d) => Math.pow(1 + valorEm(curvaIpcaMensal, d), 12) - 1,
    trAM: () => atuais.trAM,
  };
}

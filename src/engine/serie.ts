// src/engine/serie.ts
import { type DataISO, deDia, paraDia, somarDias, somarMeses } from './datas';
import { OfertaInvalidaError } from './erros';
import type { Cenario } from './indexadores';
import { ofertaDeReinvestimento, projetar, type OfertaCadastrada, type Projecao, type RegraReinvestimento } from './ofertas';
import { inicioEfetivoPoupanca, simular } from './produtos';

/** Por que o ponto não pode ser resgatado: só no vencimento, prazo mínimo da LCI/LCA ou marcação a mercado. */
export type MotivoSemResgate = 'NO_VENCIMENTO' | 'PRAZO_MINIMO' | 'MARCACAO_A_MERCADO';

export interface PontoSerie {
  data: DataISO;
  /** null quando nem o valor de referência existe (ex.: antes do prazo mínimo legal da LCI/LCA). */
  liquido: number | null;
  /** false: o valor é só referência para a linha tracejada (sem liquidez ou com marcação a mercado). */
  resgatavel: boolean;
  /**
   * Só nos pontos não resgatáveis que passam a ser resgatáveis em alguma data. Ausente nos resgatáveis e quando
   * não há data de liberação (ex.: a oferta vence antes da aplicação).
   */
  motivo?: MotivoSemResgate;
}
export interface Serie { ofertaIndice: number; pontos: PontoSerie[] }

const PASSO_DIAS = 7;
/** Últimos dias de cada faixa do IR regressivo e o dia seguinte, onde a alíquota cai. */
const LIMITES_IR = [180, 181, 360, 361, 720, 721];

/**
 * Datas do gráfico: a cada 7 dias corridos, os degraus do IR (da aplicação e de cada reaplicação), os
 * vencimentos e o dia seguinte, os aniversários da poupança e o fim. Ordenadas, sem duplicatas e dentro de
 * (aplicação, fim]. Nenhum intervalo entre duas datas seguidas passa de 7 dias.
 */
export function datasDaSerie(dataAplicacao: DataISO, fim: DataISO, ofertas: readonly OfertaCadastrada[]): DataISO[] {
  if (fim <= dataAplicacao) return [];
  const datas = new Set<DataISO>([fim]);
  for (let d = somarDias(dataAplicacao, PASSO_DIAS); d <= fim; d = somarDias(d, PASSO_DIAS)) datas.add(d);
  const inicios = [dataAplicacao];
  for (const o of ofertas) {
    if (o.vencimento === undefined || o.vencimento <= dataAplicacao || o.vencimento > fim) continue;
    datas.add(o.vencimento);
    datas.add(somarDias(o.vencimento, 1));
    inicios.push(o.vencimento); // a reaplicação recomeça a contagem do IR
  }
  for (const inicio of inicios) for (const n of LIMITES_IR) datas.add(somarDias(inicio, n));
  if (ofertas.some((o) => o.produto === 'POUPANCA')) {
    // A poupança só rende no aniversário mensal: o valor sobe em degrau. Com a véspera, entre dois pontos seguidos
    // o valor dela fica parado, e uma troca com ela não fica escondida entre duas pontas com o mesmo líder.
    const inicio = inicioEfetivoPoupanca(dataAplicacao);
    for (let k = 1, d = somarMeses(inicio, 1); d <= fim; k++, d = somarMeses(inicio, k)) datas.add(d).add(somarDias(d, -1));
  }
  return [...datas].filter((d) => d > dataAplicacao && d <= fim).sort();
}

/**
 * Valor de referência quando a oferta não pode ser resgatada na data: o líquido como se desse para resgatar,
 * ignorando a liquidez e a marcação a mercado. Só até o vencimento (depois dele não há o que simular sem
 * reinvestir) e só se a simulação existir (antes do prazo mínimo legal, não existe).
 */
function referencia(o: OfertaCadastrada, valor: number, dataAplicacao: DataISO, data: DataISO, cen: Cenario): number | null {
  if (o.vencimento !== undefined && data > o.vencimento) return null;
  try {
    return simular({ produto: o.produto, indexacao: o.indexacao, valor, dataAplicacao }, data, cen).valorLiquido;
  } catch (e) {
    if (e instanceof OfertaInvalidaError) return null;
    throw e;
  }
}

function motivoDe(p: Projecao, o: OfertaCadastrada): MotivoSemResgate | undefined {
  if (p.estado === 'MARCACAO_A_MERCADO') return 'MARCACAO_A_MERCADO';
  if (p.estado !== 'INDISPONIVEL' || p.disponivelEm === undefined) return undefined;
  return o.liquidez === 'NO_VENCIMENTO' && p.disponivelEm === o.vencimento ? 'NO_VENCIMENTO' : 'PRAZO_MINIMO';
}

/**
 * O ponto da série de uma oferta numa data.
 *
 * Depois do vencimento, a série fixa a estratégia de reaplicação: o dinheiro vai sempre para a mesma oferta de
 * reinvestimento (`ofertaDeReinvestimento`), em todos os pontos. Se essa oferta ainda não pode ser resgatada na
 * data (a LCI/LCA reaplicada dentro do prazo mínimo), o ponto fica não resgatável, com o valor de referência da
 * própria reaplicação (simulada ignorando o prazo mínimo) e o motivo PRAZO_MINIMO.
 *
 * `projetar` (a tabela) responde outra pergunta, "e se eu resgatar nessa data?", e por isso pode cair no CDB 100%
 * quando a preferida não é resgatável: cada coluna é uma decisão separada. Na série, trocar de CDB para LCI de um
 * ponto para o outro juntaria duas trajetórias diferentes numa linha só.
 */
function pontoNaData(o: OfertaCadastrada, valor: number, dataAplicacao: DataISO, data: DataISO, cen: Cenario, regra: RegraReinvestimento): PontoSerie {
  const p = projetar(o, valor, dataAplicacao, data, cen, regra);
  if (p.estado === 'DISPONIVEL') {
    const etapa1 = p.etapas[0];
    if (!p.reinvestimento?.fallback || !etapa1) return { data, liquido: p.liquido, resgatavel: true };
    // O fallback só acontece quando a preferida lança OfertaInvalidaError: o prazo mínimo da LCI/LCA.
    const preferida = ofertaDeReinvestimento(o, regra);
    const liquido = simular({ ...preferida, valor: etapa1.valorLiquido, dataAplicacao: p.reinvestimento.data }, data, cen, { ignorarPrazoMinimo: true }).valorLiquido;
    return { data, liquido, resgatavel: false, motivo: 'PRAZO_MINIMO' };
  }
  const motivo = motivoDe(p, o);
  return { data, liquido: referencia(o, valor, dataAplicacao, data, cen), resgatavel: false, ...(motivo ? { motivo } : {}) };
}

/**
 * Líquido de cada oferta em cada data de {@link datasDaSerie}, com reinvestimento depois do vencimento na mesma
 * oferta de reinvestimento em todos os pontos (ver {@link pontoNaData}).
 */
export function seriesDeValorLiquido(
  ofertas: readonly OfertaCadastrada[], valor: number, dataAplicacao: DataISO, fim: DataISO, cen: Cenario, regra: RegraReinvestimento,
): Serie[] {
  const datas = datasDaSerie(dataAplicacao, fim, ofertas);
  return ofertas.map((o, ofertaIndice) => ({
    ofertaIndice,
    pontos: datas.map((data) => pontoNaData(o, valor, dataAplicacao, data, cen, regra)),
  }));
}

export interface TrocaDeLider { data: DataISO; de: number[]; para: number[] }

/** O que é preciso para recalcular a série num dia qualquer e achar a data exata de uma troca. */
export interface ContextoProjecao {
  ofertas: readonly OfertaCadastrada[];
  valor: number;
  dataAplicacao: DataISO;
  cen: Cenario;
  regra: RegraReinvestimento;
}

const mesmoConjunto = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Os índices com o maior líquido resgatável, em centavos (a regra de `lideres`), em ordem crescente. */
function lideresEntre(pontos: readonly (readonly [indice: number, ponto: PontoSerie | undefined])[]): number[] {
  let maximo = -Infinity;
  let indices: number[] = [];
  for (const [i, p] of pontos) {
    if (!p || !p.resgatavel || p.liquido === null) continue;
    const centavos = Math.round(p.liquido * 100);
    if (centavos > maximo) { maximo = centavos; indices = [i]; } else if (centavos === maximo) indices.push(i);
  }
  return indices.sort((a, b) => a - b);
}

/**
 * Líderes no k-ésimo ponto: os índices de oferta com o maior líquido RESGATÁVEL, comparado em centavos (a regra
 * de `lideres`). Empate inclui todos; sem ninguém resgatável, lista vazia.
 */
export function lideresNoPonto(series: readonly Serie[], k: number): number[] {
  return lideresEntre(series.map((s) => [s.ofertaIndice, s.pontos[k]] as const));
}

/** Líderes num dia qualquer, com TODAS as ofertas e a mesma regra dos pontos da série ({@link pontoNaData}). */
function lideresNoDia(ctx: ContextoProjecao, data: DataISO): number[] {
  return lideresEntre(ctx.ofertas.map((o, i) => [i, pontoNaData(o, ctx.valor, ctx.dataAplicacao, data, ctx.cen, ctx.regra)] as const));
}

/**
 * Trocas no intervalo (anterior, posterior], dia a dia. Uma busca binária acha UMA troca, mas não necessariamente
 * a primeira quando o líder muda mais de uma vez no intervalo. Como nenhum intervalo passa de 7 dias
 * ({@link datasDaSerie}), a varredura custa no máximo 6 dias × ofertas e acha todas, em ordem.
 */
function varrer(ctx: ContextoProjecao, anterior: DataISO, posterior: DataISO, de: number[], para: number[]): TrocaDeLider[] {
  const trocas: TrocaDeLider[] = [];
  let atual = de;
  const fim = paraDia(posterior);
  for (let dia = paraDia(anterior) + 1; dia < fim; dia++) {
    const data = deDia(dia);
    const novo = lideresNoDia(ctx, data);
    if (mesmoConjunto(novo, atual)) continue;
    trocas.push({ data, de: atual, para: novo });
    atual = novo;
  }
  if (!mesmoConjunto(atual, para)) trocas.push({ data: posterior, de: atual, para });
  return trocas;
}

/**
 * Cada data em que o conjunto de líderes (maior líquido resgatável, em centavos) muda. O conjunto do primeiro
 * ponto é o ponto de partida, não uma troca. Com `ctx`, cada intervalo entre dois pontos em que o conjunto muda é
 * varrido dia a dia, com todas as ofertas: as datas saem exatas, inclusive as das trocas que duram poucos dias.
 * Sem `ctx`, fica o ponto em que a mudança aparece. As séries precisam ter as mesmas datas (as de
 * {@link seriesDeValorLiquido}). Devolve TODAS as trocas; o que exibir sai de {@link trocasRelevantes}.
 */
export function trocasDeLider(series: readonly Serie[], ctx?: ContextoProjecao): TrocaDeLider[] {
  if (ctx && ctx.ofertas.length !== series.length) {
    throw new RangeError(`O contexto tem ${ctx.ofertas.length} ofertas e há ${series.length} séries`);
  }
  const datas = series[0]?.pontos.map((p) => p.data) ?? [];
  const trocas: TrocaDeLider[] = [];
  let atual = lideresNoPonto(series, 0);
  for (let k = 1; k < datas.length; k++) {
    const novo = lideresNoPonto(series, k);
    if (mesmoConjunto(novo, atual)) continue;
    const data = datas[k] as DataISO;
    trocas.push(...(ctx ? varrer(ctx, datas[k - 1] as DataISO, data, atual, novo) : [{ data, de: atual, para: novo }]));
    atual = novo;
  }
  return trocas;
}

/** Lideranças curtas fundidas num trecho: o líder alterna dentro dele. */
export interface Oscilacao {
  oscilante: true;
  /** Quantas trocas o trecho absorveu. */
  alternancias: number;
  /** As ofertas que passam pela liderança no trecho, o líder do trecho incluído, em ordem crescente. */
  alternam: number[];
}

/** Uma troca que abre um trecho; com `oscilante`, o trecho absorveu lideranças curtas. */
export type TrocaRelevante = TrocaDeLider & Partial<Oscilacao>;

export interface TrocasRelevantes {
  /** Presente quando o trecho antes da primeira troca (o do começo) absorveu lideranças curtas. */
  inicial?: Oscilacao;
  trocas: TrocaRelevante[];
}

export interface OpcoesRelevantes {
  /** Liderança mais curta que isto (em dias corridos) é transitória e se funde num vizinho. */
  duracaoMinimaDias: number;
  /**
   * Última data da série. Sem ela, o último trecho não tem duração conhecida e nunca é curto. Com ela, o último
   * trecho curto só se funde se for a volta de um líder que já alternava, nunca um líder novo no fim.
   */
  fim?: DataISO;
}

interface Trecho { inicio: number | null; lideres: number[]; alternancias: number; alternam: Set<number> }

/**
 * As trocas para exibir (gráfico e resumo). Funde as lideranças mais curtas que `duracaoMinimaDias`, a mais curta
 * primeiro: se os vizinhos têm o mesmo líder (A, B curto, A), os três viram um trecho só de A; senão, a curta
 * entra no trecho anterior. O trecho que absorve fica `oscilante`. O primeiro trecho (o do começo) nunca some.
 */
export function trocasRelevantes(trocas: readonly TrocaDeLider[], opcoes: OpcoesRelevantes): TrocasRelevantes {
  const { duracaoMinimaDias: minimo, fim } = opcoes;
  if (!Number.isFinite(minimo) || minimo < 0) throw new RangeError(`Duração mínima inválida: ${minimo}`);
  const primeira = trocas[0];
  if (!primeira) return { trocas: [] };
  const trechos: Trecho[] = [
    { inicio: null, lideres: primeira.de, alternancias: 0, alternam: new Set() },
    ...trocas.map((t) => ({ inicio: paraDia(t.data), lideres: t.para, alternancias: 0, alternam: new Set<number>() })),
  ];
  const diaDepoisDoFim = fim === undefined ? null : paraDia(fim) + 1;
  const duracao = (j: number): number | null => {
    const inicio = trechos[j]?.inicio ?? null;
    const proximo = j + 1 < trechos.length ? (trechos[j + 1]?.inicio ?? null) : diaDepoisDoFim;
    return inicio === null || proximo === null ? null : proximo - inicio;
  };
  /** O último trecho só é transitório se for a volta de quem já alternava no anterior. */
  const eVolta = (j: number): boolean => {
    const ultimo = trechos[j] as Trecho;
    const anterior = trechos[j - 1] as Trecho;
    const antesDele = trechos[j - 2];
    return ultimo.lideres.every((i) => anterior.alternam.has(i)) || (antesDele !== undefined && mesmoConjunto(antesDele.lideres, ultimo.lideres));
  };
  const absorver = (destino: Trecho, origem: Trecho) => {
    destino.alternancias += origem.alternancias + 1;
    for (const i of [...origem.lideres, ...origem.alternam]) destino.alternam.add(i);
  };
  for (;;) {
    let alvo = -1;
    let menor = Infinity;
    for (let j = 1; j < trechos.length; j++) {
      const d = duracao(j);
      if (d === null || d >= minimo || d >= menor) continue;
      if (j === trechos.length - 1 && !eVolta(j)) continue;
      alvo = j;
      menor = d;
    }
    if (alvo < 0) break;
    const anterior = trechos[alvo - 1] as Trecho;
    const seguinte = trechos[alvo + 1];
    absorver(anterior, trechos[alvo] as Trecho);
    if (seguinte && mesmoConjunto(anterior.lideres, seguinte.lideres)) {
      absorver(anterior, seguinte);
      trechos.splice(alvo, 2);
    } else {
      trechos.splice(alvo, 1);
    }
  }
  const oscilacao = (t: Trecho): Oscilacao | null => (t.alternancias === 0 ? null : {
    oscilante: true, alternancias: t.alternancias, alternam: [...new Set([...t.alternam, ...t.lideres])].sort((a, b) => a - b),
  });
  const [inicial, ...resto] = trechos as [Trecho, ...Trecho[]];
  const oscInicial = oscilacao(inicial);
  return {
    ...(oscInicial ? { inicial: oscInicial } : {}),
    trocas: resto.map((t, k) => ({ data: deDia(t.inicio as number), de: (trechos[k] as Trecho).lideres, para: t.lideres, ...oscilacao(t) })),
  };
}

// src/engine/serie.ts
import { lideres } from './comparacao';
import { type DataISO, deDia, paraDia, somarDias } from './datas';
import { OfertaInvalidaError } from './erros';
import type { Cenario } from './indexadores';
import { projetar, type OfertaCadastrada, type Projecao, type RegraReinvestimento } from './ofertas';
import { simular } from './produtos';

export interface PontoSerie {
  data: DataISO;
  /** null quando nem o valor de referência existe (ex.: antes do prazo mínimo legal da LCI/LCA). */
  liquido: number | null;
  /** false: o valor é só referência para a linha tracejada (sem liquidez ou com marcação a mercado). */
  resgatavel: boolean;
}
export interface Serie { ofertaIndice: number; pontos: PontoSerie[] }

const PASSO_DIAS = 7;
/** Últimos dias de cada faixa do IR regressivo e o dia seguinte, onde a alíquota cai. */
const LIMITES_IR = [180, 181, 360, 361, 720, 721];

/**
 * Datas do gráfico: a cada 7 dias corridos, os degraus do IR (da aplicação e de cada reaplicação), os
 * vencimentos e o dia seguinte e o fim. Ordenadas, sem duplicatas e dentro de (aplicação, fim].
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

function ponto(p: Projecao, o: OfertaCadastrada, valor: number, dataAplicacao: DataISO, data: DataISO, cen: Cenario): PontoSerie {
  if (p.estado === 'DISPONIVEL') return { data, liquido: p.liquido, resgatavel: true };
  return { data, liquido: referencia(o, valor, dataAplicacao, data, cen), resgatavel: false };
}

/** Líquido de cada oferta em cada data de {@link datasDaSerie}, com reinvestimento depois do vencimento. */
export function seriesDeValorLiquido(
  ofertas: readonly OfertaCadastrada[], valor: number, dataAplicacao: DataISO, fim: DataISO, cen: Cenario, regra: RegraReinvestimento,
): Serie[] {
  const datas = datasDaSerie(dataAplicacao, fim, ofertas);
  return ofertas.map((o, ofertaIndice) => ({
    ofertaIndice,
    pontos: datas.map((data) => ponto(projetar(o, valor, dataAplicacao, data, cen, regra), o, valor, dataAplicacao, data, cen)),
  }));
}

export interface TrocaDeLider { data: DataISO; de: number[]; para: number[] }

/** O que `projetar` precisa para refinar a data de uma troca dia a dia. */
export interface ContextoProjecao {
  ofertas: readonly OfertaCadastrada[];
  valor: number;
  dataAplicacao: DataISO;
  cen: Cenario;
  regra: RegraReinvestimento;
}

const mesmoConjunto = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Líderes no k-ésimo ponto: os índices de oferta com o maior líquido RESGATÁVEL, comparado em centavos (a regra
 * de `lideres`). Empate inclui todos; sem ninguém resgatável, lista vazia.
 */
export function lideresNoPonto(series: readonly Serie[], k: number): number[] {
  let maximo = -Infinity;
  let indices: number[] = [];
  for (const s of series) {
    const p = s.pontos[k];
    if (!p || !p.resgatavel || p.liquido === null) continue;
    const centavos = Math.round(p.liquido * 100);
    if (centavos > maximo) { maximo = centavos; indices = [s.ofertaIndice]; } else if (centavos === maximo) indices.push(s.ofertaIndice);
  }
  return indices.sort((a, b) => a - b);
}

/** Líderes no dia entre as ofertas envolvidas, pela mesma regra (DISPONIVEL = resgatável). */
function lideresNoDia(ctx: ContextoProjecao, envolvidas: readonly number[], data: DataISO): number[] {
  const projecoes = envolvidas.map((i) => projetar(ctx.ofertas[i] as OfertaCadastrada, ctx.valor, ctx.dataAplicacao, data, ctx.cen, ctx.regra));
  return lideres(projecoes).map((j) => envolvidas[j] as number);
}

/**
 * Trocas no intervalo (anterior, posterior], dia a dia por busca binária. A busca mantém "o conjunto ainda é o
 * atual" no limite de baixo e "já mudou" no de cima, então sempre para num par de dias vizinhos com a troca, mesmo
 * que o líder mude mais de uma vez no intervalo; depois continua dali até chegar ao conjunto do ponto posterior.
 */
function refinar(ctx: ContextoProjecao, anterior: DataISO, posterior: DataISO, de: number[], para: number[]): TrocaDeLider[] {
  const envolvidas = [...new Set([...de, ...para])].sort((a, b) => a - b);
  const trocas: TrocaDeLider[] = [];
  let atual = de;
  let lo = paraDia(anterior);
  const fim = paraDia(posterior);
  while (!mesmoConjunto(atual, para)) {
    let hi = fim;
    let noHi = para;
    while (hi - lo > 1) {
      const meio = (lo + hi) >> 1;
      const noMeio = lideresNoDia(ctx, envolvidas, deDia(meio));
      if (mesmoConjunto(noMeio, atual)) lo = meio;
      else { hi = meio; noHi = noMeio; }
    }
    trocas.push({ data: deDia(hi), de: atual, para: noHi });
    atual = noHi;
    lo = hi;
  }
  return trocas;
}

/**
 * Cada data em que o conjunto de líderes (maior líquido resgatável, em centavos) muda de um ponto para o seguinte.
 * O conjunto do primeiro ponto é o ponto de partida, não uma troca. Com `ctx`, a data sai exata: a busca por dia
 * entre os dois pontos chama `projetar` só para as ofertas envolvidas; sem `ctx`, fica o ponto em que a mudança
 * aparece. As séries precisam ter as mesmas datas (as de {@link seriesDeValorLiquido}).
 */
export function trocasDeLider(series: readonly Serie[], ctx?: ContextoProjecao): TrocaDeLider[] {
  const datas = series[0]?.pontos.map((p) => p.data) ?? [];
  const trocas: TrocaDeLider[] = [];
  let atual = lideresNoPonto(series, 0);
  for (let k = 1; k < datas.length; k++) {
    const novo = lideresNoPonto(series, k);
    if (mesmoConjunto(novo, atual)) continue;
    const data = datas[k] as DataISO;
    trocas.push(...(ctx ? refinar(ctx, datas[k - 1] as DataISO, data, atual, novo) : [{ data, de: atual, para: novo }]));
    atual = novo;
  }
  return trocas;
}

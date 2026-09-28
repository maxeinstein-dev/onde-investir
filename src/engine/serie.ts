// src/engine/serie.ts
import { type DataISO, somarDias } from './datas';
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

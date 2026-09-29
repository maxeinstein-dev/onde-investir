// src/engine/equivalencia.ts
import { ehDiaUtil } from './calendario';
import { type DataISO, deDia, paraDia } from './datas';
import { OfertaInvalidaError, RegraNaoEncontradaError } from './erros';
import { type Cenario, fatorIPCA, taxaDiaria } from './indexadores';
import { ehIsentoIR, simular, validarAplicacao, type Aplicacao } from './produtos';
import { aliquotaIOF } from './regras/iof';
import { aliquotaIR } from './regras/ir';

/** Taxa equivalente calculada, ou o motivo de não existir uma. */
export type Equivalente = { disponivel: true; taxa: number } | { disponivel: false; motivo: string };

/**
 * Aproximação de mercado para trocar de lado entre tributado e isento, usando a alíquota de IR do prazo (a):
 * - origem isenta pós-CDI (LCI/LCA) → destino TRIBUTADO, taxa p ÷ (1 − a);
 * - origem tributada pós-CDI (CDB/RDB/LC) → destino ISENTO, taxa p × (1 − a).
 * Ignora que o IR incide sobre juros compostos, por isso difere da conta exata.
 */
export interface RegraDeBolso { destino: 'TRIBUTADO' | 'ISENTO'; taxa: number }

export interface ResultadoEquivalencia {
  liquidoAlvo: number;
  /** % do CDI de um CDB (tributado) que empata. 0.9257 = 92,57%. */
  tributadoPosCDI: Equivalente;
  /** Taxa a.a. de um CDB prefixado que empata. */
  tributadoPre: Equivalente;
  /** Taxa real a.a. de um CDB IPCA+ que empata. */
  tributadoIpcaMais: Equivalente;
  /** % do CDI de uma LCI (isenta) que empata; indisponível se o prazo não cumpre o mínimo legal. */
  isentoPosCDI: Equivalente;
  /**
   * Regra de bolso do mercado (ver {@link RegraDeBolso}). É null se a origem não for pós-CDI, se tiver custo
   * extra (a regra ignora o custo e daria uma taxa otimista) ou se o equivalente exato do destino estiver
   * indisponível (não faz sentido aproximar o que não existe).
   */
  regraDeBolso: RegraDeBolso | null;
  /** Alíquota de IR do prazo; null se a regra não estiver cadastrada para a data de resgate. */
  aliquotaIR: number | null;
}

const SEM_DIAS_UTEIS = 'sem dias úteis no período';
const SEM_RENDIMENTO = 'a origem não rende nada nesse prazo';
const FORA_DO_ALCANCE = 'não há taxa equivalente com esse cenário';
const TOLERANCIA_RELATIVA = 1e-13;
const MAX_ITERACOES = 100;
const PERCENTUAL_TETO_BUSCA = 1e6;

export const disponivel = (taxa: number): Equivalente =>
  Number.isFinite(taxa) ? { disponivel: true, taxa } : { disponivel: false, motivo: FORA_DO_ALCANCE };
export const indisponivel = (motivo: string): Equivalente => ({ disponivel: false, motivo });

/** Executa um cálculo; erros de regra ou de oferta viram indisponibilidade com a mensagem do erro. */
function tentar(calculo: () => Equivalente): Equivalente {
  try {
    return calculo();
  } catch (erro) {
    if (erro instanceof OfertaInvalidaError || erro instanceof RegraNaoEncontradaError) return indisponivel(erro.message);
    throw erro;
  }
}

/** Taxas diárias do CDI nos dias úteis de [inicio, fim), na ordem em que o pós-fixado acumula. */
export function taxasDiariasCDI(cen: Cenario, inicio: DataISO, fim: DataISO): Float64Array {
  const taxas: number[] = [];
  const fimDia = paraDia(fim);
  for (let d = paraDia(inicio); d < fimDia; d++) {
    const data = deDia(d);
    if (ehDiaUtil(data)) taxas.push(taxaDiaria(cen.cdiAA(data)));
  }
  return Float64Array.from(taxas);
}

/** ∏(1 + dᵢ·p), com a mesma expressão e ordem de fatorPercentualCDI. */
function produtoPos(taxas: Float64Array, p: number): number {
  let fator = 1;
  for (const d of taxas) fator *= 1 + d * p;
  return fator;
}

/** Percentual p > 0 com ∏(1 + dᵢ·p) = fatorAlvo (> 1), por bisseção; NaN se não houver. */
export function resolverPercentual(taxas: Float64Array, fatorAlvo: number): number {
  let lo = 0;
  let hi = 1;
  while (produtoPos(taxas, hi) < fatorAlvo) {
    lo = hi;
    hi *= 2;
    if (hi > PERCENTUAL_TETO_BUSCA) return Number.NaN;
  }
  for (let i = 0; i < MAX_ITERACOES && hi - lo > TOLERANCIA_RELATIVA * hi; i++) {
    const meio = (lo + hi) / 2;
    if (produtoPos(taxas, meio) < fatorAlvo) lo = meio;
    else hi = meio;
  }
  return (lo + hi) / 2;
}

/**
 * Taxas que fariam outros produtos terminarem com o mesmo líquido da origem, no mesmo valor e datas.
 * Nunca lança para uma origem válida: o que não existe volta como indisponível, com o motivo.
 */
export function calcularEquivalencias(origem: Aplicacao, dataResgate: DataISO, cen: Cenario): ResultadoEquivalencia {
  const r = simular(origem, dataResgate, cen);
  const liquidoAlvo = r.valorLiquido;
  const V = origem.valor;
  const dc = r.diasCorridos;
  const DU = r.diasUteis;
  const ini = origem.dataAplicacao;

  let aliquota: number | null = null;
  try {
    aliquota = aliquotaIR(dc, dataResgate);
  } catch (erro) {
    if (!(erro instanceof RegraNaoEncontradaError)) throw erro;
  }

  let taxasCDI: Float64Array | undefined;
  const cdi = () => (taxasCDI ??= taxasDiariasCDI(cen, ini, dataResgate));

  // CDB: líquido = V + R·(1 − aIOF)·(1 − aIR), R = V·(F − 1), sem custódia.
  const fatorTributado = (): number => {
    const aIOF = aliquotaIOF(dc, dataResgate);
    const aIR = aliquotaIR(dc, dataResgate);
    return 1 + (liquidoAlvo - V) / (V * (1 - aIOF) * (1 - aIR));
  };
  const tributado = (deFator: (fator: number) => number): Equivalente => {
    if (DU === 0) return indisponivel(SEM_DIAS_UTEIS);
    if (!(liquidoAlvo > V)) return indisponivel(SEM_RENDIMENTO);
    return tentar(() => disponivel(deFator(fatorTributado())));
  };

  const tributadoPosCDI = tributado((f) => resolverPercentual(cdi(), f));
  const tributadoPre = tributado((f) => Math.pow(f, 252 / DU) - 1);
  const tributadoIpcaMais = tributado((f) => Math.pow(f / fatorIPCA(cen, ini, dataResgate), 252 / DU) - 1);

  const isentoPosCDI: Equivalente = DU === 0 ? indisponivel(SEM_DIAS_UTEIS) : tentar(() => {
    validarAplicacao({ produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 }, valor: V, dataAplicacao: ini }, dataResgate);
    if (!(liquidoAlvo > V)) return indisponivel(SEM_RENDIMENTO);
    return disponivel(resolverPercentual(cdi(), liquidoAlvo / V));
  });

  const ix = origem.indexacao;
  let regraDeBolso: RegraDeBolso | null = null;
  const semCusto = !((origem.custoExtraAA ?? 0) > 0);
  if (ix.tipo === 'POS_CDI' && aliquota !== null && semCusto) {
    if (ehIsentoIR(origem.produto)) {
      if (tributadoPosCDI.disponivel) regraDeBolso = { destino: 'TRIBUTADO', taxa: ix.percentualCDI / (1 - aliquota) };
    } else if (isentoPosCDI.disponivel) {
      regraDeBolso = { destino: 'ISENTO', taxa: ix.percentualCDI * (1 - aliquota) };
    }
  }

  return { liquidoAlvo, tributadoPosCDI, tributadoPre, tributadoIpcaMais, isentoPosCDI, regraDeBolso, aliquotaIR: aliquota };
}

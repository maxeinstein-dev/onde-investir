// src/engine/equivalencia.ts
import { type DataISO, diasCorridos } from './datas';
import { OfertaInvalidaError } from './erros';
import type { Cenario } from './indexadores';
import { ehIsentoIR, PERCENTUAL_CDI_MAXIMO, simular, type Aplicacao, type Oferta } from './produtos';
import { aliquotaIR } from './regras/ir';

export interface ResultadoEquivalencia {
  liquidoAlvo: number;
  /** % do CDI de um CDB (tributado) que empata. 0.9257 = 92,57%. */
  tributadoPosCDI: number;
  /** Taxa a.a. de um CDB prefixado que empata. */
  tributadoPre: number;
  /** Taxa real a.a. de um CDB IPCA+ que empata. */
  tributadoIpcaMais: number;
  /** % do CDI de uma LCI (isenta) que empata; null se o prazo não cumpre o mínimo legal. */
  isentoPosCDI: number | null;
  /** Aproximação de mercado p ÷ (1 − IR) ou p × (1 − IR); só para origem pós-CDI. */
  regraDeBolso: number | null;
  aliquotaIR: number;
}

const ITERACOES = 80;

/** Bisseção: acha x em [min, max] com f(x) = alvo, para f crescente. */
function resolver(f: (x: number) => number, alvo: number, min: number, max: number): number {
  if (f(min) > alvo || f(max) < alvo) throw new OfertaInvalidaError('Não existe taxa equivalente no intervalo pesquisado');
  let lo = min;
  let hi = max;
  for (let i = 0; i < ITERACOES; i++) {
    const meio = (lo + hi) / 2;
    if (f(meio) < alvo) lo = meio;
    else hi = meio;
  }
  return (lo + hi) / 2;
}

export function calcularEquivalencias(origem: Aplicacao, dataResgate: DataISO, cen: Cenario): ResultadoEquivalencia {
  const liquidoAlvo = simular(origem, dataResgate, cen).valorLiquido;
  const liquido = (o: Oferta) =>
    simular({ ...o, valor: origem.valor, dataAplicacao: origem.dataAplicacao }, dataResgate, cen).valorLiquido;

  let isentoPosCDI: number | null;
  try {
    isentoPosCDI = resolver((p) => liquido({ produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: p } }), liquidoAlvo, 1e-6, PERCENTUAL_CDI_MAXIMO);
  } catch (erro) {
    if (!(erro instanceof OfertaInvalidaError)) throw erro;
    isentoPosCDI = null;
  }

  const aliquota = aliquotaIR(diasCorridos(origem.dataAplicacao, dataResgate), dataResgate);
  const ix = origem.indexacao;
  const regraDeBolso = ix.tipo !== 'POS_CDI' ? null
    : ehIsentoIR(origem.produto) ? ix.percentualCDI / (1 - aliquota) : ix.percentualCDI * (1 - aliquota);

  return {
    liquidoAlvo,
    tributadoPosCDI: resolver((p) => liquido({ produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: p } }), liquidoAlvo, 1e-6, PERCENTUAL_CDI_MAXIMO),
    tributadoPre: resolver((t) => liquido({ produto: 'CDB', indexacao: { tipo: 'PRE', taxaAA: t } }), liquidoAlvo, -0.5, 3),
    tributadoIpcaMais: resolver((t) => liquido({ produto: 'CDB', indexacao: { tipo: 'IPCA_MAIS', taxaRealAA: t } }), liquidoAlvo, -0.5, 3),
    isentoPosCDI,
    regraDeBolso,
    aliquotaIR: aliquota,
  };
}

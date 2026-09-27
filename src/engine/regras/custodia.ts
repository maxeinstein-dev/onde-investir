// src/engine/regras/custodia.ts
import type { DataISO } from '../datas';
import { resolverRegra, type VersaoRegra } from './tipos';

interface RegraCustodia { taxaAA: number; isencaoSelic: number }

export const VERSOES_CUSTODIA: readonly VersaoRegra<RegraCustodia>[] = [
  {
    vigenciaInicio: '2024-12-31',
    fonte: 'https://www.b3.com.br/pt_br/produtos-e-servicos/tarifas/tarifas-de-tesouro-direto/',
    valor: { taxaAA: 0.002, isencaoSelic: 10_000 },
  },
];

export const FONTE_CUSTODIA = VERSOES_CUSTODIA[0]?.fonte ?? '';

export interface EntradaCustodia {
  selic: boolean;
  valorAplicado: number;
  valorBruto: number;
  diasCorridos: number;
  dataResgate: DataISO;
}

/** Custódia descontada no resgate (aproximação pela média entre aplicado e bruto). */
export function custodiaTesouro(e: EntradaCustodia): number {
  const regra = resolverRegra('custódia B3 Tesouro', VERSOES_CUSTODIA, e.dataResgate);
  const media = (e.valorAplicado + e.valorBruto) / 2;
  const isencao = e.selic ? regra.isencaoSelic : 0;
  return regra.taxaAA * (e.diasCorridos / 365) * Math.max(0, media - isencao);
}

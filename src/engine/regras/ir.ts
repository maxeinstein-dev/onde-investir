// src/engine/regras/ir.ts
import type { DataISO } from '../datas';
import { resolverRegra, type VersaoRegra } from './tipos';

export interface FaixaIR { ateDias: number; aliquota: number }

export const VERSOES_IR: readonly VersaoRegra<readonly FaixaIR[]>[] = [
  {
    vigenciaInicio: '2005-01-01',
    fonte: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11033.htm',
    valor: [
      { ateDias: 180, aliquota: 0.225 },
      { ateDias: 360, aliquota: 0.2 },
      { ateDias: 720, aliquota: 0.175 },
      { ateDias: Infinity, aliquota: 0.15 },
    ],
  },
];

export const FONTE_IR = VERSOES_IR[0]?.fonte ?? '';

/** Alíquota de IR sobre o rendimento, pelo prazo em dias corridos, na regra vigente no resgate. */
export function aliquotaIR(diasCorridos: number, dataResgate: DataISO): number {
  const faixas = resolverRegra('IR renda fixa', VERSOES_IR, dataResgate);
  const faixa = faixas.find((f) => diasCorridos <= f.ateDias);
  if (!faixa) throw new Error(`Faixa de IR não encontrada para ${diasCorridos} dias`);
  return faixa.aliquota;
}

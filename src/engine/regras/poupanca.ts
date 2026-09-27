// src/engine/regras/poupanca.ts
import type { DataISO } from '../datas';
import { resolverRegra, type VersaoRegra } from './tipos';

interface RegraPoupanca { limiarSelicAA: number; taxaFixaAM: number; fracaoSelic: number }

export const VERSOES_POUPANCA: readonly VersaoRegra<RegraPoupanca>[] = [
  {
    vigenciaInicio: '2012-05-04',
    fonte: 'https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2012/lei/l12703.htm',
    valor: { limiarSelicAA: 0.085, taxaFixaAM: 0.005, fracaoSelic: 0.7 },
  },
];

export const FONTE_POUPANCA = VERSOES_POUPANCA[0]?.fonte ?? '';

/** Compara em micro-pontos inteiros (1e-6), para que 8,5% calculado com erro de float não mude de regra. */
const acimaDoLimiar = (selic: number, limiar: number): boolean => Math.round(selic * 1e6) > Math.round(limiar * 1e6);

/** Remuneração básica mensal da poupança, sem a TR. */
export function taxaBasePoupancaAM(selicMetaAA: number, data: DataISO): number {
  const r = resolverRegra('poupança', VERSOES_POUPANCA, data);
  return acimaDoLimiar(selicMetaAA, r.limiarSelicAA) ? r.taxaFixaAM : Math.pow(1 + r.fracaoSelic * selicMetaAA, 1 / 12) - 1;
}

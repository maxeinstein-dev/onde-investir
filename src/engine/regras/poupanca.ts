// src/engine/regras/poupanca.ts
import type { DataISO } from '../datas';
import { paraDia } from '../datas';
import { resolverRegra, type VersaoRegra } from './tipos';

/**
 * `limiarSelicAA` e `fracaoSelic` null: a taxa fixa vale sempre, sem depender da Selic (a regra dos depósitos
 * anteriores a 04/05/2012).
 */
interface RegraPoupanca { limiarSelicAA: number | null; taxaFixaAM: number; fracaoSelic: number | null }

/**
 * A versão é escolhida pela DATA DO DEPÓSITO, não pela do aniversário: o depósito feito antes de 04/05/2012 rende
 * 0,5% ao mês + TR para sempre (a Lei 12.703/2012 só alcança os depósitos a partir da vigência dela).
 */
export const VERSOES_POUPANCA: readonly VersaoRegra<RegraPoupanca>[] = [
  {
    // Lei 8.177/1991, art. 12: 0,5% ao mês + TR.
    vigenciaInicio: '1991-03-01',
    vigenciaFim: '2012-05-04',
    fonte: 'https://www.planalto.gov.br/ccivil_03/leis/l8177.htm',
    valor: { limiarSelicAA: null, taxaFixaAM: 0.005, fracaoSelic: null },
  },
  {
    vigenciaInicio: '2012-05-04',
    fonte: 'https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2012/lei/l12703.htm',
    valor: { limiarSelicAA: 0.085, taxaFixaAM: 0.005, fracaoSelic: 0.7 },
  },
];

/** A fonte da regra vigente para depósitos novos. */
export const FONTE_POUPANCA = VERSOES_POUPANCA.at(-1)?.fonte ?? '';

/** Compara em micro-pontos inteiros (1e-6), para que 8,5% calculado com erro de float não mude de regra. */
const acimaDoLimiar = (selic: number, limiar: number): boolean => Math.round(selic * 1e6) > Math.round(limiar * 1e6);

/**
 * Remuneração básica mensal da poupança, sem a TR. `dataDeposito` escolhe a regra (ver {@link VERSOES_POUPANCA});
 * `selicMetaAA` é a meta no aniversário.
 */
export function taxaBasePoupancaAM(selicMetaAA: number, dataDeposito: DataISO): number {
  const r = resolverRegra('poupança', VERSOES_POUPANCA, dataDeposito);
  if (r.limiarSelicAA === null || r.fracaoSelic === null) return r.taxaFixaAM;
  return acimaDoLimiar(selicMetaAA, r.limiarSelicAA) ? r.taxaFixaAM : Math.pow(1 + r.fracaoSelic * selicMetaAA, 1 / 12) - 1;
}

/**
 * Para a explicação: a regra do depósito rende a taxa fixa sempre (depósito anterior a 04/05/2012)? E a fonte
 * dela. Lança RegraNaoEncontradaError como {@link taxaBasePoupancaAM}.
 */
export function regraDoDeposito(dataDeposito: DataISO): { taxaFixaSempre: boolean; fonte: string } {
  const r = resolverRegra('poupança', VERSOES_POUPANCA, dataDeposito);
  const dia = paraDia(dataDeposito);
  const versao = VERSOES_POUPANCA.find((v) => paraDia(v.vigenciaInicio) <= dia && (v.vigenciaFim === undefined || dia < paraDia(v.vigenciaFim)));
  return { taxaFixaSempre: r.limiarSelicAA === null, fonte: versao?.fonte ?? FONTE_POUPANCA };
}

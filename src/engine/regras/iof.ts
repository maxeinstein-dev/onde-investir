// src/engine/regras/iof.ts
import type { DataISO } from '../datas';
import { OfertaInvalidaError } from '../erros';
import { resolverRegra, type VersaoRegra } from './tipos';

/** Percentual do rendimento retido por IOF, do 1º ao 29º dia corrido (Decreto 6.306/2007, anexo). */
export const VERSOES_IOF: readonly VersaoRegra<readonly number[]>[] = [
  {
    vigenciaInicio: '2007-12-14',
    fonte: 'https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2007/decreto/d6306.htm',
    valor: [96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3],
  },
];

export const FONTE_IOF = VERSOES_IOF[0]?.fonte ?? '';

export function aliquotaIOF(diasCorridos: number, dataResgate: DataISO): number {
  if (diasCorridos < 1) throw new OfertaInvalidaError('O resgate precisa ser pelo menos 1 dia depois da aplicação');
  const tabela = resolverRegra('IOF regressivo', VERSOES_IOF, dataResgate);
  if (diasCorridos >= 30) return 0;
  return (tabela[diasCorridos - 1] ?? 0) / 100;
}

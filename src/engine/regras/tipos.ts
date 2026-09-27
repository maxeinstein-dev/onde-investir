// src/engine/regras/tipos.ts
import { type DataISO, paraDia } from '../datas';
import { RegraNaoEncontradaError } from '../erros';

export interface VersaoRegra<T> {
  /** Primeiro dia de vigência (inclusive). */
  vigenciaInicio: DataISO;
  /** Primeiro dia em que deixa de valer (exclusive). Ausente = ainda vigente. */
  vigenciaFim?: DataISO;
  /** URL da norma ou da página oficial. */
  fonte: string;
  valor: T;
}

export function resolverRegra<T>(nome: string, versoes: readonly VersaoRegra<T>[], data: DataISO): T {
  const dia = paraDia(data);
  const versao = versoes.find(
    (v) => paraDia(v.vigenciaInicio) <= dia && (v.vigenciaFim === undefined || dia < paraDia(v.vigenciaFim)),
  );
  if (!versao) throw new RegraNaoEncontradaError(nome, data);
  return versao.valor;
}

// src/engine/regras/fgc.ts
import type { DataISO } from '../datas';
import { resolverRegra, type VersaoRegra } from './tipos';

export interface RegraFGC {
  /** R$ garantidos por pessoa contra a mesma instituição ou o mesmo conglomerado financeiro (art. 2º, § 2º). */
  porConglomerado: number;
  /** R$ garantidos por pessoa contra todas as instituições associadas, a cada janela (art. 2º, § 3º). */
  tetoGlobal: number;
  /** A janela do teto global, em anos consecutivos contados do primeiro evento de pagamento (art. 2º, § 4º, VIII). */
  janelaAnos: number;
}

// Regulamento do FGC: Anexo II da Resolução CMN 4.222, de 23/05/2013, com as alterações posteriores (o texto
// consolidado na fonte). O limite de R$ 250 mil vale desde 23/05/2013; o teto global de R$ 1 milhão a cada
// quatro anos entrou por alteração posterior do regulamento, com data ainda não conferida em texto oficial. Esta
// versão serve às aplicações de agora; posições antigas (M3a) podem precisar de uma versão anterior sem o teto.
export const VERSOES_FGC: readonly VersaoRegra<RegraFGC>[] = [
  {
    vigenciaInicio: '2013-05-23',
    fonte: 'https://fgc.org.br/documents/d/asset-library-52554/regulamento-fgc',
    valor: { porConglomerado: 250_000, tetoGlobal: 1_000_000, janelaAnos: 4 },
  },
];

export const FONTE_FGC = VERSOES_FGC[0]?.fonte ?? '';

/** A garantia ordinária do FGC vigente na data (o limite que vale é o da data da quebra, art. 2º, § 10). */
export function regraFGC(data: DataISO): RegraFGC {
  return resolverRegra('garantia do FGC', VERSOES_FGC, data);
}

// src/engine/regras/prazoMinimo.ts
import { type DataISO, somarMesesPrazoLegal } from '../datas';
import { resolverRegra, type VersaoRegra } from './tipos';

export type ProdutoImobiliarioAgro = 'LCI' | 'LCA';
type Prazos = Record<ProdutoImobiliarioAgro, { comIPCA: number; demais: number }>;

// Versões anteriores (Res. CMN 5.118/2024 e alteração de fev/2025) entram no M3, com posições.
export const VERSOES_PRAZO_MINIMO: readonly VersaoRegra<Prazos>[] = [
  {
    vigenciaInicio: '2025-05-23',
    fonte: 'https://www.b3.com.br/data/files/63/43/8C/0B/43FF69106B8BCB69AC094EA8/CE%20016-2025-VPC%20PLATAFORMA%20NOME%20BALCAO%20B3_LCA_LCI.pdf',
    valor: { LCI: { comIPCA: 36, demais: 6 }, LCA: { comIPCA: 12, demais: 6 } },
  },
];

export const FONTE_PRAZO_MINIMO = VERSOES_PRAZO_MINIMO[0]?.fonte ?? '';

/** Prazo mínimo em meses, pela regra vigente na data de emissão. */
export function prazoMinimoMeses(produto: ProdutoImobiliarioAgro, comIPCA: boolean, dataEmissao: DataISO): number {
  const prazos = resolverRegra('prazo mínimo LCI/LCA', VERSOES_PRAZO_MINIMO, dataEmissao)[produto];
  return comIPCA ? prazos.comIPCA : prazos.demais;
}

/** Primeira data de resgate permitida, contando o prazo em meses pela regra civil (ver somarMesesPrazoLegal). */
export function dataMinimaResgate(produto: ProdutoImobiliarioAgro, comIPCA: boolean, dataEmissao: DataISO): DataISO {
  return somarMesesPrazoLegal(dataEmissao, prazoMinimoMeses(produto, comIPCA, dataEmissao));
}

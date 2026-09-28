// src/conteudo/licoes/ofertas.ts
// Ofertas de exemplo dos "Experimente" e dos casos clássicos. Emissores fictícios; as taxas são só para a conta,
// e o texto das lições não as repete (os números saem da comparação).
import type { OfertaDoExperimente } from './tipos';

const alfa = { emissor: 'Banco Alfa', conglomerado: 'Alfa' } as const;
const beta = { emissor: 'Banco Beta', conglomerado: 'Beta' } as const;
const tesouro = { emissor: 'Tesouro Nacional', conglomerado: 'Tesouro Nacional' } as const;

export const cdbPos = (percentualCDI: number, meses?: number, o: Partial<OfertaDoExperimente> = {}): OfertaDoExperimente => ({
  ...alfa, produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI }, liquidez: 'DIARIA',
  ...(meses === undefined ? {} : { vencimentoEmMeses: meses }), ...o,
});

export const cdbPre = (taxaAA: number, meses: number): OfertaDoExperimente => ({
  ...beta, produto: 'CDB', indexacao: { tipo: 'PRE', taxaAA }, liquidez: 'NO_VENCIMENTO', vencimentoEmMeses: meses,
});

export const cdbIPCA = (taxaRealAA: number, meses: number): OfertaDoExperimente => ({
  ...beta, produto: 'CDB', indexacao: { tipo: 'IPCA_MAIS', taxaRealAA }, liquidez: 'NO_VENCIMENTO', vencimentoEmMeses: meses,
});

export const letra = (produto: 'LCI' | 'LCA', percentualCDI: number, meses: number, o: Partial<OfertaDoExperimente> = {}): OfertaDoExperimente => ({
  ...alfa, produto, indexacao: { tipo: 'POS_CDI', percentualCDI }, liquidez: 'DIARIA', vencimentoEmMeses: meses, ...o,
});

export const poupanca: OfertaDoExperimente = { ...alfa, produto: 'POUPANCA', indexacao: { tipo: 'POUPANCA' }, liquidez: 'DIARIA' };

export const tesouroSelic = (meses: number): OfertaDoExperimente => ({
  ...tesouro, produto: 'TESOURO_SELIC', indexacao: { tipo: 'SELIC' }, liquidez: 'DIARIA', vencimentoEmMeses: meses,
});

export const tesouroPrefixado = (taxaAA: number, meses: number): OfertaDoExperimente => ({
  ...tesouro, produto: 'TESOURO_PREFIXADO', indexacao: { tipo: 'PRE', taxaAA }, liquidez: 'DIARIA', vencimentoEmMeses: meses,
});

export const tesouroIPCA = (taxaRealAA: number, meses: number): OfertaDoExperimente => ({
  ...tesouro, produto: 'TESOURO_IPCA', indexacao: { tipo: 'IPCA_MAIS', taxaRealAA }, liquidez: 'DIARIA', vencimentoEmMeses: meses,
});

export const BETA = beta;

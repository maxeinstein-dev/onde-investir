import { describe, expect, it } from 'vitest';
import { INDEXACOES_PERMITIDAS, simular, type Aplicacao } from '../../src/engine/produtos';
import { OfertaInvalidaError } from '../../src/engine/erros';
import { CEN, INI } from './cenarioPadrao';

const lci: Aplicacao = { produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 }, valor: 10000, dataAplicacao: INI };

describe('validação de aplicações', () => {
  it('LCI antes do prazo mínimo → erro explicando a data mínima', () => {
    expect(() => simular(lci, '2027-03-27', CEN)).toThrow(OfertaInvalidaError);
    expect(() => simular(lci, '2027-03-27', CEN)).toThrow(/28\/03\/2027/);
    expect(() => simular(lci, '2027-03-28', CEN)).not.toThrow();
  });
  it('LCI IPCA+ exige 36 meses', () => {
    const ipca = { ...lci, indexacao: { tipo: 'IPCA_MAIS', taxaRealAA: 0.06 } } as const;
    expect(() => simular(ipca, '2029-09-27', CEN)).toThrow(OfertaInvalidaError);
    expect(() => simular(ipca, '2029-09-28', CEN)).not.toThrow();
  });
  it('indexação incompatível com o produto', () => {
    expect(() => simular({ ...lci, produto: 'TESOURO_SELIC' }, '2027-09-28', CEN)).toThrow(OfertaInvalidaError);
    expect(INDEXACOES_PERMITIDAS.TESOURO_SELIC).toEqual(['SELIC']);
  });
  it('valores e datas inválidos', () => {
    expect(() => simular({ ...lci, valor: 0 }, '2027-09-28', CEN)).toThrow(OfertaInvalidaError);
    expect(() => simular({ ...lci, valor: Number.NaN }, '2027-09-28', CEN)).toThrow(OfertaInvalidaError);
    expect(() => simular(lci, INI, CEN)).toThrow(OfertaInvalidaError);
    expect(() => simular({ ...lci, indexacao: { tipo: 'POS_CDI', percentualCDI: 0 } }, '2027-09-28', CEN)).toThrow(OfertaInvalidaError);
  });
});

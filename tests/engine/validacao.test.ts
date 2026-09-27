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
  it('taxa prefixada ou real em −100% ou abaixo → erro (−1,5 geraria NaN)', () => {
    const pre = (taxaAA: number): Aplicacao => ({ ...lci, produto: 'CDB', indexacao: { tipo: 'PRE', taxaAA } });
    const ipca = (taxaRealAA: number): Aplicacao => ({ ...lci, produto: 'CDB', indexacao: { tipo: 'IPCA_MAIS', taxaRealAA } });
    expect(() => simular(pre(-1.5), '2027-09-28', CEN)).toThrow(OfertaInvalidaError);
    expect(() => simular(pre(-1), '2027-09-28', CEN)).toThrow(OfertaInvalidaError);
    expect(() => simular(ipca(-1.5), '2027-09-28', CEN)).toThrow(OfertaInvalidaError);
    expect(() => simular(ipca(-1), '2027-09-28', CEN)).toThrow(OfertaInvalidaError);
    expect(() => simular(pre(-0.02), '2027-09-28', CEN)).not.toThrow();
    expect(() => simular(ipca(-0.02), '2027-09-28', CEN)).not.toThrow();
  });
  it('percentual do CDI finito, > 0 e até 500% (pega 103 digitado no lugar de 1,03)', () => {
    const pos = (percentualCDI: number): Aplicacao => ({ ...lci, produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI } });
    expect(() => simular(pos(103), '2027-09-28', CEN)).toThrow(OfertaInvalidaError);
    expect(() => simular(pos(103), '2027-09-28', CEN)).toThrow('percentual do CDI acima de 500%: confira a taxa');
    expect(() => simular(pos(5.0001), '2027-09-28', CEN)).toThrow(OfertaInvalidaError);
    expect(() => simular(pos(Number.POSITIVE_INFINITY), '2027-09-28', CEN)).toThrow(OfertaInvalidaError);
    expect(() => simular(pos(Number.NaN), '2027-09-28', CEN)).toThrow(OfertaInvalidaError);
    expect(() => simular(pos(-0.5), '2027-09-28', CEN)).toThrow(OfertaInvalidaError);
    expect(() => simular(pos(5), '2027-09-28', CEN)).not.toThrow();
  });
  it('produto desconhecido → OfertaInvalidaError, não TypeError', () => {
    const desconhecido = { ...lci, produto: 'FII' } as unknown as Aplicacao;
    expect(() => simular(desconhecido, '2027-09-28', CEN)).toThrow(OfertaInvalidaError);
    const herdado = { ...lci, produto: 'toString' } as unknown as Aplicacao;
    expect(() => simular(herdado, '2027-09-28', CEN)).toThrow(OfertaInvalidaError);
  });
});

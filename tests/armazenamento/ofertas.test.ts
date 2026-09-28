import { describe, expect, it } from 'vitest';
import { CHAVE_OFERTAS, lerOfertas, salvarOfertas } from '../../src/armazenamento/ofertas';
import type { Armazenamento } from '../../src/dados/cache';
import type { OfertaCadastrada } from '../../src/engine/ofertas';

const memoria = (): Armazenamento & { dados: Map<string, string> } => {
  const dados = new Map<string, string>();
  return { dados, getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => void dados.set(k, v) };
};
const quebrado: Armazenamento = {
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
};

const cdb: OfertaCadastrada = {
  id: 'a', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, emissor: 'Banco X', conglomerado: 'X',
  liquidez: 'NO_VENCIMENTO', vencimento: '2028-09-28',
};
const tesouro: OfertaCadastrada = {
  id: 'b', produto: 'TESOURO_IPCA', indexacao: { tipo: 'IPCA_MAIS', taxaRealAA: 0.075 }, emissor: 'Tesouro Nacional',
  conglomerado: 'Tesouro Nacional', liquidez: 'DIARIA', vencimento: '2035-05-15',
};
const poupanca: OfertaCadastrada = {
  id: 'c', produto: 'POUPANCA', indexacao: { tipo: 'POUPANCA' }, emissor: 'Banco Y', conglomerado: 'Y', liquidez: 'DIARIA',
};

describe('lerOfertas / salvarOfertas', () => {
  it('ida e volta na chave rende:ofertas:v1', () => {
    const arm = memoria();
    expect(salvarOfertas(arm, [cdb, tesouro, poupanca])).toBe(true);
    expect(CHAVE_OFERTAS).toBe('rende:ofertas:v1');
    expect(arm.dados.has('rende:ofertas:v1')).toBe(true);
    expect(lerOfertas(arm)).toEqual([cdb, tesouro, poupanca]);
  });
  it('custo extra sobrevive à ida e volta; fora de 0 a 5% a oferta é descartada', () => {
    const arm = memoria();
    const comCusto: OfertaCadastrada = { ...cdb, id: 'k', custoExtraAA: 0.005 };
    salvarOfertas(arm, [comCusto, { ...cdb, id: 'l', custoExtraAA: 0.06 }, { ...cdb, id: 'm', custoExtraAA: -0.01 }]);
    expect(lerOfertas(arm)).toEqual([comCusto]);
  });
  it('sem nada salvo: lista vazia', () => {
    expect(lerOfertas(memoria())).toEqual([]);
  });
  it('storage que lança: lista vazia na leitura e false na gravação', () => {
    expect(lerOfertas(quebrado)).toEqual([]);
    expect(salvarOfertas(quebrado, [cdb])).toBe(false);
  });
  it('JSON corrompido ou fora do formato: lista vazia', () => {
    const arm = memoria();
    arm.setItem(CHAVE_OFERTAS, '{nao é json');
    expect(lerOfertas(arm)).toEqual([]);
    arm.setItem(CHAVE_OFERTAS, JSON.stringify({ ofertas: 'x' }));
    expect(lerOfertas(arm)).toEqual([]);
  });
  it('descarta só as ofertas inválidas (esquema ou validarOfertaCadastrada)', () => {
    const arm = memoria();
    const semVencimento = { ...cdb, id: 'd', vencimento: undefined }; // NO_VENCIMENTO sem vencimento
    const extra = { ...cdb, id: 'e', cor: 'azul' };
    const indexacaoErrada = { ...cdb, id: 'f', indexacao: { tipo: 'POS_CDI', taxaAA: 0.1 } };
    const dataImpossivel = { ...cdb, id: 'g', vencimento: '2027-02-30' };
    arm.setItem(CHAVE_OFERTAS, JSON.stringify([cdb, semVencimento, extra, indexacaoErrada, dataImpossivel, poupanca]));
    expect(lerOfertas(arm)).toEqual([cdb, poupanca]);
  });
});

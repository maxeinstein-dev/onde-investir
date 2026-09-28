import { describe, expect, it } from 'vitest';
import { CHAVE_POSICOES, LIMITE_POSICOES, lerPosicoes, novoIdPosicao, salvarPosicoes } from '../../src/armazenamento/posicoes';
import type { Armazenamento } from '../../src/dados/cache';
import type { Posicao } from '../../src/engine/posicoes';

const HOJE = '2026-09-28';

const memoria = (): Armazenamento & { dados: Map<string, string> } => {
  const dados = new Map<string, string>();
  return { dados, getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => void dados.set(k, v) };
};
const quebrado: Armazenamento = {
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
};

const cdbPosicao: Posicao = {
  id: 'p-a', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, emissor: 'Banco X', conglomerado: 'X',
  liquidez: 'NO_VENCIMENTO', vencimento: '2028-09-28', valorAplicado: 10_000, dataAplicacao: '2025-01-02', eventos: [],
};
const comExtrato: Posicao = {
  ...cdbPosicao, id: 'p-b', custoExtraAA: 0.005, valorExtrato: 11_234.56, dataExtrato: '2026-09-01', baseExtrato: 'LIQUIDO',
};
const poupanca: Posicao = {
  id: 'p-c', produto: 'POUPANCA', indexacao: { tipo: 'POUPANCA' }, emissor: 'Banco Y', conglomerado: 'Y', liquidez: 'DIARIA',
  valorAplicado: 500, dataAplicacao: '2026-09-28', eventos: [],
};

describe('lerPosicoes / salvarPosicoes', () => {
  it('ida e volta na chave rende:posicoes:v1', () => {
    const arm = memoria();
    expect(CHAVE_POSICOES).toBe('rende:posicoes:v1');
    expect(salvarPosicoes(arm, [cdbPosicao, comExtrato, poupanca])).toBe(true);
    expect(arm.dados.has('rende:posicoes:v1')).toBe(true);
    expect(lerPosicoes(arm, HOJE)).toEqual([cdbPosicao, comExtrato, poupanca]);
  });
  it('sem nada salvo: lista vazia', () => {
    expect(lerPosicoes(memoria(), HOJE)).toEqual([]);
  });
  it('storage que lança: lista vazia na leitura e false na gravação', () => {
    expect(lerPosicoes(quebrado, HOJE)).toEqual([]);
    expect(salvarPosicoes(quebrado, [cdbPosicao])).toBe(false);
  });
  it('JSON corrompido ou fora do formato: lista vazia', () => {
    const arm = memoria();
    arm.setItem(CHAVE_POSICOES, '{nao é json');
    expect(lerPosicoes(arm, HOJE)).toEqual([]);
    arm.setItem(CHAVE_POSICOES, JSON.stringify({ posicoes: [] }));
    expect(lerPosicoes(arm, HOJE)).toEqual([]);
  });
  it('descarta só as posições inválidas (esquema, validarPosicao e ids repetidos)', () => {
    const arm = memoria();
    const invalidas = [
      { ...cdbPosicao, id: 'e1', cor: 'azul' }, // campo extra
      { ...cdbPosicao, id: 'e2', valorAplicado: 0 },
      { ...cdbPosicao, id: 'e3', valorAplicado: '10000' },
      { ...cdbPosicao, id: 'e4', dataAplicacao: '2026-09-29' }, // depois de hoje
      { ...cdbPosicao, id: 'e5', dataAplicacao: '2025-02-30' },
      { ...cdbPosicao, id: 'e6', eventos: [{ tipo: 'APORTE', data: '2025-06-01', valor: 100 }] }, // M3a: sem eventos
      { ...cdbPosicao, id: 'e7', valorExtrato: 10_500 }, // extrato sem data
      { ...cdbPosicao, id: 'e8', baseExtrato: 'MEDIO', valorExtrato: 1, dataExtrato: '2026-01-01' },
      { ...cdbPosicao, id: 'e9', custoExtraAA: 0.06 },
      { ...cdbPosicao, id: 'e10', eventos: undefined },
      { ...cdbPosicao }, // id repetido
    ];
    arm.setItem(CHAVE_POSICOES, JSON.stringify([cdbPosicao, ...invalidas, poupanca]));
    expect(lerPosicoes(arm, HOJE)).toEqual([cdbPosicao, poupanca]);
  });
  it('a validação usa o hoje dado: a mesma posição some se hoje for antes da aplicação', () => {
    const arm = memoria();
    salvarPosicoes(arm, [poupanca]);
    expect(lerPosicoes(arm, '2026-09-27')).toEqual([]);
  });
  it(`corta em ${LIMITE_POSICOES} posições`, () => {
    expect(LIMITE_POSICOES).toBe(50);
    const arm = memoria();
    salvarPosicoes(arm, Array.from({ length: 51 }, (_, i) => ({ ...cdbPosicao, id: `p-${i}` })));
    expect(lerPosicoes(arm, HOJE)).toHaveLength(50);
  });
});

describe('novoIdPosicao', () => {
  it('ids com prefixo p- e diferentes a cada chamada', () => {
    const a = novoIdPosicao();
    const b = novoIdPosicao();
    expect(a).toMatch(/^p-/);
    expect(a).not.toBe(b);
    expect(a.length).toBeLessThanOrEqual(80);
  });
});

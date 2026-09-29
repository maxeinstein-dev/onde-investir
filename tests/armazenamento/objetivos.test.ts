import { describe, expect, it } from 'vitest';
import type { Armazenamento } from '../../src/dados/cache';
import {
  CHAVE_OBJETIVOS, LIMITE_OBJETIVOS, lerObjetivos, novoIdObjetivo, salvarObjetivos, type ObjetivoSalvo,
} from '../../src/armazenamento/objetivos';

const memoria = (): Armazenamento & { dados: Map<string, string> } => {
  const dados = new Map<string, string>();
  return { dados, getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => void dados.set(k, v) };
};

const objetivo = (over: Partial<ObjetivoSalvo> = {}): ObjetivoSalvo => ({
  id: novoIdObjetivo(), criadoEm: '2026-09-29',
  entradas: { tipo: 'RESERVA', gastoMensal: 2000, rendaEstavel: true }, ...over,
});

describe('objetivos', () => {
  it('ida e volta', () => {
    const arm = memoria();
    const o = objetivo({ nome: 'Minha reserva' });
    salvarObjetivos(arm, [o]);
    expect(lerObjetivos(arm)).toEqual([o]);
  });
  it('storage vazio ou corrompido → lista vazia', () => {
    const arm = memoria();
    expect(lerObjetivos(arm)).toEqual([]);
    arm.setItem(CHAVE_OBJETIVOS, '{não-json');
    expect(lerObjetivos(arm)).toEqual([]);
  });
  it('campo extra é rejeitado (esquema estrito)', () => {
    const arm = memoria();
    arm.setItem(CHAVE_OBJETIVOS, JSON.stringify([{ ...objetivo(), extra: true }]));
    expect(lerObjetivos(arm)).toEqual([]);
  });
  it('entradas de cada tipo passam no esquema', () => {
    const arm = memoria();
    const lista = [
      objetivo({ entradas: { tipo: 'RESERVA', gastoMensal: 1000, rendaEstavel: false } }),
      objetivo({ entradas: { tipo: 'COM_DATA', valorAlvo: 5000, data: '2030-01-01' } }),
      objetivo({ entradas: { tipo: 'LONGO_PRAZO', horizonteAnos: 20 } }),
      objetivo({ entradas: { tipo: 'SEM_OBJETIVO', horizonteAnos: 3 } }),
      objetivo({ entradas: { tipo: 'RENDA_MENSAL', principal: 100000, rendaMensalDesejada: 1000 } }),
      objetivo({ entradas: { tipo: 'CARTEIRA_COMBINADA', principal: 100000, gastoMensal: 3000, rendaEstavel: true, horizonteAnos: 20 } }),
    ];
    salvarObjetivos(arm, lista);
    expect(lerObjetivos(arm)).toHaveLength(6);
  });
  it('respeita o limite de 20 na leitura', () => {
    const arm = memoria();
    arm.setItem(CHAVE_OBJETIVOS, JSON.stringify(Array.from({ length: 25 }, () => objetivo())));
    expect(lerObjetivos(arm)).toHaveLength(LIMITE_OBJETIVOS);
  });
  it('storage que lança não derruba o app', () => {
    const quebrado: Armazenamento = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('cheio'); } };
    expect(lerObjetivos(quebrado)).toEqual([]);
    expect(() => salvarObjetivos(quebrado, [objetivo()])).not.toThrow();
    expect(salvarObjetivos(quebrado, [objetivo()])).toBe(false);
  });
});

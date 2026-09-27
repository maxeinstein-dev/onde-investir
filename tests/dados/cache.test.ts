import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { gravarCache, lerCache, type Armazenamento } from '../../src/dados/cache';

const memoria = (): Armazenamento & { dados: Map<string, string> } => {
  const dados = new Map<string, string>();
  return { dados, getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => void dados.set(k, v) };
};
const Esquema = z.object({ x: z.number() });

describe('cache', () => {
  it('grava e lê; marca vencido depois da validade', () => {
    const arm = memoria();
    gravarCache(arm, 'teste', { x: 1 }, 100, 200);
    expect(lerCache(arm, 'teste', Esquema, 150)).toEqual({ dados: { x: 1 }, obtidoEm: 100, vencido: false });
    expect(lerCache(arm, 'teste', Esquema, 200)?.vencido).toBe(true);
  });
  it('conteúdo corrompido, de outra versão ou fora do esquema → null', () => {
    const arm = memoria();
    arm.setItem('rende:cache:v1:a', '{nao-json');
    arm.setItem('rende:cache:v1:b', JSON.stringify({ versao: 99, obtidoEm: 1, validoAte: 2, dados: { x: 1 } }));
    arm.setItem('rende:cache:v1:c', JSON.stringify({ versao: 1, obtidoEm: 1, validoAte: 2, dados: { x: 'um' } }));
    for (const k of ['a', 'b', 'c', 'inexistente']) expect(lerCache(arm, k, Esquema, 0)).toBeNull();
  });
  it('storage que lança erro não derruba o app', () => {
    const quebrado: Armazenamento = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('cheio'); } };
    expect(() => gravarCache(quebrado, 'k', { x: 1 }, 0, 1)).not.toThrow();
    expect(lerCache(quebrado, 'k', Esquema, 0)).toBeNull();
  });
});

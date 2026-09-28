// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { armazenamentoLocal } from '../../src/armazenamento/navegador';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('armazenamentoLocal', () => {
  it('lê e grava no localStorage', () => {
    armazenamentoLocal().setItem('k', 'v');
    expect(localStorage.getItem('k')).toBe('v');
    expect(armazenamentoLocal().getItem('k')).toBe('v');
  });
  it('localStorage inacessível: leitura null, gravação lança (quem grava trata)', () => {
    vi.stubGlobal('localStorage', undefined);
    const arm = armazenamentoLocal();
    expect(arm.getItem('k')).toBeNull();
    expect(() => arm.setItem('k', 'v')).toThrow();
  });
});

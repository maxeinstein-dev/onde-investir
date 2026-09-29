// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEsquemaDeCores } from '../../../src/ui/graficos/useEsquemaDeCores';

afterEach(() => vi.unstubAllGlobals());

describe('useEsquemaDeCores', () => {
  it('sem matchMedia (jsdom): devolve "claro" e não lança', () => {
    const { result } = renderHook(() => useEsquemaDeCores());
    expect(result.current).toBe('claro');
  });

  it('acompanha a mudança do tema do sistema', () => {
    let ouvinte: (() => void) | undefined;
    const mql = { matches: false, addEventListener: (_: string, f: () => void) => { ouvinte = f; }, removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', () => mql);
    const { result } = renderHook(() => useEsquemaDeCores());
    expect(result.current).toBe('claro');
    mql.matches = true;
    act(() => ouvinte?.());
    expect(result.current).toBe('escuro');
  });
});

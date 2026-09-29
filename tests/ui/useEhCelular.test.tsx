// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEhCelular } from '../../src/ui/useEhCelular';

afterEach(() => vi.unstubAllGlobals());

describe('useEhCelular', () => {
  it('sem matchMedia (jsdom): false, o layout de desktop', () => {
    expect(renderHook(() => useEhCelular()).result.current).toBe(false);
  });
  it('true quando a tela tem até 639px, e acompanha a mudança', () => {
    let ouvinte: (() => void) | undefined;
    const mql = { matches: true, media: '(max-width: 639px)', addEventListener: (_: string, f: () => void) => { ouvinte = f; }, removeEventListener: vi.fn() };
    const chamadas: string[] = [];
    vi.stubGlobal('matchMedia', (q: string) => { chamadas.push(q); return mql; });
    const { result } = renderHook(() => useEhCelular());
    expect(result.current).toBe(true);
    expect(chamadas[0]).toBe('(max-width: 639px)');
    mql.matches = false;
    act(() => ouvinte?.());
    expect(result.current).toBe(false);
  });
  it('Safari antigo (sem addEventListener): usa addListener/removeListener', () => {
    let ouvinte: (() => void) | undefined;
    const removeListener = vi.fn();
    const mql = { matches: true, media: '(max-width: 639px)', addListener: (f: () => void) => { ouvinte = f; }, removeListener };
    vi.stubGlobal('matchMedia', () => mql);
    const { result, unmount } = renderHook(() => useEhCelular());
    expect(result.current).toBe(true);
    mql.matches = false;
    act(() => ouvinte?.());
    expect(result.current).toBe(false);
    unmount();
    expect(removeListener).toHaveBeenCalledWith(ouvinte);
  });
});

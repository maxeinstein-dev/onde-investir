// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ABA_DO_LINK, lerEstadoDoHash, limparEstadoDoHash, urlCompartilhavel } from '../../src/armazenamento/link';

beforeEach(() => history.replaceState(null, '', '/app/?x=1'));

describe('link compartilhável no hash (#comparar/c1.…)', () => {
  it('a aba do link é a comparar', () => {
    expect(ABA_DO_LINK).toBe('comparar');
  });

  it('lerEstadoDoHash devolve o fragmento depois de #comparar/', () => {
    history.replaceState(null, '', '#comparar/c1.abc_-9');
    expect(lerEstadoDoHash()).toBe('c1.abc_-9');
    history.replaceState(null, '', '#comparar/j1.eyJ');
    expect(lerEstadoDoHash()).toBe('j1.eyJ');
  });

  it('lerEstadoDoHash aceita o hash por parâmetro', () => {
    expect(lerEstadoDoHash('#comparar/c1.zz')).toBe('c1.zz');
  });

  it('sem estado, com estado vazio ou em outra aba: null', () => {
    for (const h of ['', '#', '#comparar', '#comparar/', '#catalogo/c1.abc', '#carteira', '#comparar-x/c1.a']) {
      expect(lerEstadoDoHash(h)).toBeNull();
    }
  });

  it('limparEstadoDoHash troca a URL por #comparar com replaceState, sem entrada nova nem hashchange', () => {
    history.replaceState(null, '', '#comparar/c1.abc');
    const tamanho = history.length;
    const aoMudar = vi.fn();
    window.addEventListener('hashchange', aoMudar);
    const replace = vi.spyOn(history, 'replaceState');
    const push = vi.spyOn(history, 'pushState');
    limparEstadoDoHash();
    expect(location.hash).toBe('#comparar');
    expect(location.pathname).toBe('/app/');
    expect(location.search).toBe('?x=1');
    expect(replace).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(history.length).toBe(tamanho);
    expect(lerEstadoDoHash()).toBeNull();
    window.removeEventListener('hashchange', aoMudar);
    expect(aoMudar).not.toHaveBeenCalled();
    replace.mockRestore();
    push.mockRestore();
  });

  it('limparEstadoDoHash sem estado no hash não mexe na URL', () => {
    history.replaceState(null, '', '#carteira');
    const replace = vi.spyOn(history, 'replaceState');
    limparEstadoDoHash();
    expect(replace).not.toHaveBeenCalled();
    expect(location.hash).toBe('#carteira');
    replace.mockRestore();
  });

  it('urlCompartilhavel monta a URL da página atual com #comparar/ e o fragmento (sem a query)', () => {
    history.replaceState(null, '', '#carteira');
    expect(urlCompartilhavel('c1.abc')).toBe(`${location.origin}/app/#comparar/c1.abc`);
  });
});

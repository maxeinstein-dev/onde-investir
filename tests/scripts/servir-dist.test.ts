import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolverArquivo } from '../../scripts/servir-dist.mjs';

const raiz = resolve('dist');

describe('servir-dist: o caminho do arquivo pedido', () => {
  it('a raiz vira o index.html, e o resto fica dentro de dist/', () => {
    expect(resolverArquivo(raiz, '/')).toEqual({ arquivo: join(raiz, 'index.html') });
    expect(resolverArquivo(raiz, '/assets/app.js?v=1')).toEqual({ arquivo: join(raiz, 'assets', 'app.js') });
    expect(resolverArquivo(raiz, '/a/../index.html')).toEqual({ arquivo: join(raiz, 'index.html') });
  });

  it.each([
    '/..%2Fdist-secreto%2Fx.txt', // pasta vizinha que começa com "dist": o startsWith(raiz) deixava passar
    '/..%5Cdist.bak%5Cy', // barra invertida codificada
    '/..%2F..%2Fpackage.json',
  ])('%s: fora de dist/ dá 403', (url) => {
    expect(resolverArquivo(raiz, url)).toEqual({ status: 403 });
  });

  it('URL malformada dá 400, sem lançar', () => {
    expect(resolverArquivo(raiz, '/%E0')).toEqual({ status: 400 });
  });
});

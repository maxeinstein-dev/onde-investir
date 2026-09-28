import type { Armazenamento } from '../dados/cache';

/**
 * O localStorage do navegador. Acessar `localStorage` pode lançar (aba anônima, cookies bloqueados):
 * a leitura vira null e a gravação lança, e quem grava já trata a falha.
 */
export function armazenamentoLocal(): Armazenamento {
  return {
    getItem(chave) {
      try {
        return localStorage.getItem(chave);
      } catch {
        return null;
      }
    },
    setItem(chave, valor) {
      localStorage.setItem(chave, valor);
    },
  };
}

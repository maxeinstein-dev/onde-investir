import { describe, expect, it } from 'vitest';
import {
  CHAVE_COMPARACAO, LIMITE_COMPARACAO, adicionar, lerSelecao, remover, salvarSelecao, sincronizarSelecao,
} from '../../src/armazenamento/comparacao';
import type { Armazenamento } from '../../src/dados/cache';

const memoria = (): Armazenamento & { dados: Map<string, string> } => {
  const dados = new Map<string, string>();
  return { dados, getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => void dados.set(k, v) };
};
const quebrado: Armazenamento = {
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
};

describe('seleção da comparação', () => {
  it('limite de 5 e chave versionada', () => {
    expect(LIMITE_COMPARACAO).toBe(5);
    expect(CHAVE_COMPARACAO).toBe('rende:comparacao:v1');
  });

  it('ida e volta, na ordem', () => {
    const arm = memoria();
    expect(salvarSelecao(arm, ['c', 'a', 'b'])).toBe(true);
    expect(JSON.parse(arm.dados.get(CHAVE_COMPARACAO) ?? 'null')).toEqual(['c', 'a', 'b']);
    expect(lerSelecao(arm)).toEqual(['c', 'a', 'b']);
  });

  it('sem nada salvo: vazia', () => {
    expect(lerSelecao(memoria())).toEqual([]);
  });

  it('storage que lança: vazia na leitura e false na gravação', () => {
    expect(lerSelecao(quebrado)).toEqual([]);
    expect(salvarSelecao(quebrado, ['a'])).toBe(false);
  });

  it('fora do esquema: vazia', () => {
    const arm = memoria();
    for (const ruim of ['{', '"a"', '{"ids":["a"]}', '[1,2]', '[""]', JSON.stringify(['a', 'b', 'c', 'd', 'e', 'f'])]) {
      arm.setItem(CHAVE_COMPARACAO, ruim);
      expect(lerSelecao(arm), ruim).toEqual([]);
    }
  });

  it('ids repetidos no storage entram uma vez só', () => {
    const arm = memoria();
    arm.setItem(CHAVE_COMPARACAO, JSON.stringify(['a', 'b', 'a']));
    expect(lerSelecao(arm)).toEqual(['a', 'b']);
  });

  describe('sincronizarSelecao', () => {
    const catalogo = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id }));
    it('ids que sumiram do catálogo saem, e a ordem fica', () => {
      expect(sincronizarSelecao(['c', 'x', 'a'], catalogo)).toEqual(['c', 'a']);
    });
    it('sem duplicados', () => {
      expect(sincronizarSelecao(['a', 'b', 'a'], catalogo)).toEqual(['a', 'b']);
    });
    it('corta em 5', () => {
      expect(sincronizarSelecao(['a', 'b', 'c', 'd', 'e', 'f'], catalogo)).toEqual(['a', 'b', 'c', 'd', 'e']);
    });
    it('catálogo vazio: seleção vazia', () => {
      expect(sincronizarSelecao(['a'], [])).toEqual([]);
    });
  });

  describe('adicionar e remover', () => {
    it('adiciona no fim', () => {
      expect(adicionar(['a'], 'b')).toEqual({ ids: ['a', 'b'] });
    });
    it('duplicado não entra', () => {
      expect(adicionar(['a', 'b'], 'a')).toEqual({ ids: ['a', 'b'] });
    });
    it('o 6º devolve erro e não muda a seleção', () => {
      const cinco = ['a', 'b', 'c', 'd', 'e'];
      expect(adicionar(cinco, 'f')).toEqual({ ids: cinco, erro: 'A comparação já tem 5 ofertas. Tire uma para adicionar outra.' });
    });
    it('remover tira o id e mantém a ordem', () => {
      expect(remover(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
      expect(remover(['a'], 'x')).toEqual(['a']);
    });
    it('não altera o array recebido', () => {
      const ids = ['a'];
      adicionar(ids, 'b');
      remover(ids, 'a');
      expect(ids).toEqual(['a']);
    });
  });
});

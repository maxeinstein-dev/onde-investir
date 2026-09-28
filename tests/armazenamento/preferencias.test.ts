import { describe, expect, it } from 'vitest';
import {
  CHAVE_PALPITES, CHAVE_PREFERENCIAS, PREFERENCIAS_PADRAO, lerPalpitesLigados, lerPreferencias, salvarPalpitesLigados, salvarPreferencias,
} from '../../src/armazenamento/preferencias';
import type { Armazenamento } from '../../src/dados/cache';
import { CENARIO_INICIAL } from '../../src/dados/cenarioInicial';
import { PREMISSAS_PADRAO } from '../../src/engine/projecao';

const memoria = (): Armazenamento & { dados: Map<string, string> } => {
  const dados = new Map<string, string>();
  return { dados, getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => void dados.set(k, v) };
};
const quebrado: Armazenamento = {
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
};

describe('palpites (chave do M1)', () => {
  it('ligados por padrão e com storage quebrado', () => {
    expect(lerPalpitesLigados(memoria())).toBe(true);
    expect(lerPalpitesLigados(quebrado)).toBe(true);
    expect(() => salvarPalpitesLigados(quebrado, false)).not.toThrow();
  });
  it('mantém a chave e os valores do M1', () => {
    expect(CHAVE_PALPITES).toBe('rende:palpites');
    const arm = memoria();
    arm.setItem('rende:palpites', 'desligados'); // gravado pelo M1
    expect(lerPalpitesLigados(arm)).toBe(false);
    salvarPalpitesLigados(arm, true);
    expect(arm.dados.get('rende:palpites')).toBe('ligados');
    salvarPalpitesLigados(arm, false);
    expect(arm.dados.get('rende:palpites')).toBe('desligados');
  });
});

describe('preferências do cenário', () => {
  it('padrão: Base, premissas padrão e valores manuais de referência', () => {
    expect(PREFERENCIAS_PADRAO).toEqual({ escolha: 'BASE', premissas: PREMISSAS_PADRAO, manual: CENARIO_INICIAL.valores });
    expect(lerPreferencias(memoria())).toEqual(PREFERENCIAS_PADRAO);
    expect(lerPreferencias(quebrado)).toEqual(PREFERENCIAS_PADRAO);
  });
  it('ida e volta', () => {
    const arm = memoria();
    const prefs = {
      escolha: 'SOBEM' as const,
      premissas: { ...PREMISSAS_PADRAO, k: 1.5, anosConvergencia: 3 },
      manual: { cdi: 10, selicMeta: 10.1, ipca: 4, tr: 0.1 },
    };
    expect(salvarPreferencias(arm, prefs)).toBe(true);
    expect(arm.dados.has(CHAVE_PREFERENCIAS)).toBe(true);
    expect(lerPreferencias(arm)).toEqual(prefs);
  });
  it('gravação com storage quebrado devolve false', () => {
    expect(salvarPreferencias(quebrado, PREFERENCIAS_PADRAO)).toBe(false);
  });
  it('cada parte inválida volta ao padrão sem apagar as outras', () => {
    const arm = memoria();
    arm.setItem(CHAVE_PREFERENCIAS, JSON.stringify({
      escolha: 'MANUAL',
      premissas: { ...PREMISSAS_PADRAO, anosConvergencia: 2.5 }, // não inteiro
      manual: { cdi: 11, selicMeta: 11.1, ipca: 5, tr: 0 },
    }));
    expect(lerPreferencias(arm)).toEqual({
      escolha: 'MANUAL', premissas: PREMISSAS_PADRAO, manual: { cdi: 11, selicMeta: 11.1, ipca: 5, tr: 0 },
    });
    arm.setItem(CHAVE_PREFERENCIAS, JSON.stringify({ escolha: 'OUTRO', premissas: PREMISSAS_PADRAO, manual: { cdi: -100, selicMeta: 1, ipca: 1, tr: 0 } }));
    expect(lerPreferencias(arm)).toEqual(PREFERENCIAS_PADRAO);
  });
  it('premissas fora dos limites do engine voltam ao padrão', () => {
    const arm = memoria();
    for (const ruim of [{ k: -1 }, { spreadCDI: 0.05 }, { anosConvergencia: 31 }, { ipcaLongoPrazoAA: -1 }, { extra: 1 }]) {
      arm.setItem(CHAVE_PREFERENCIAS, JSON.stringify({ ...PREFERENCIAS_PADRAO, escolha: 'CAEM', premissas: { ...PREMISSAS_PADRAO, ...ruim } }));
      expect(lerPreferencias(arm).premissas, JSON.stringify(ruim)).toEqual(PREMISSAS_PADRAO);
      expect(lerPreferencias(arm).escolha).toBe('CAEM');
    }
  });
  it('JSON corrompido: padrão', () => {
    const arm = memoria();
    arm.setItem(CHAVE_PREFERENCIAS, '{');
    expect(lerPreferencias(arm)).toEqual(PREFERENCIAS_PADRAO);
  });
});

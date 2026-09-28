import { describe, expect, it } from 'vitest';
import { FONTE_FGC, regraFGC, VERSOES_FGC } from '../../../src/engine/regras/fgc';

describe('regra do FGC', () => {
  it('R$ 250 mil por conglomerado, teto de R$ 1 milhão a cada 4 anos, com a fonte do regulamento', () => {
    expect(regraFGC('2026-09-28')).toEqual({ porConglomerado: 250000, tetoGlobal: 1000000, janelaAnos: 4 });
    expect(FONTE_FGC).toBe('https://fgc.org.br/documents/d/asset-library-52554/regulamento-fgc');
    expect(VERSOES_FGC[0]?.vigenciaInicio).toBe('2013-05-23');
  });
  it('antes da vigência não há regra', () => {
    expect(() => regraFGC('2013-05-22')).toThrow();
  });
});

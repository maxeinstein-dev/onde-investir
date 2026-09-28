import { describe, expect, it } from 'vitest';
import { REGRAS } from '../../src/conteudo/licoes/regras';

describe('REGRAS.rendaVariavel', () => {
  it('lê os valores da regra vigente, formatados', () => {
    expect(REGRAS.rendaVariavel.minimoCotistasFII).toBe(100);
    expect(REGRAS.rendaVariavel.participacaoMaximaFII).toBe('10%');
    expect(REGRAS.rendaVariavel.aliquotaVendaFII).toBe('20%');
    expect(REGRAS.rendaVariavel.limiteVendaAcoes).toBe('R$ 20 mil');
    expect(REGRAS.rendaVariavel.fonteFII).toMatch(/^https:\/\//);
    expect(REGRAS.rendaVariavel.fonteVendaAcoes).toMatch(/^https:\/\//);
  });
});

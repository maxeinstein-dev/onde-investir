import { describe, expect, it } from 'vitest';
import { RegraNaoEncontradaError } from '../../../src/engine/erros';
import { regraFII, regraVendaAcoes } from '../../../src/engine/regras/rendaVariavel';

describe('regraFII', () => {
  it('vigente desde 2023-12-13: 100 cotistas, participação até 10%, venda sempre a 20%', () => {
    expect(regraFII('2026-09-29')).toEqual({ minimoCotistas: 100, participacaoMaximaFracao: 0.1, aliquotaVendaCotas: 0.2 });
    expect(regraFII('2023-12-13')).toEqual({ minimoCotistas: 100, participacaoMaximaFracao: 0.1, aliquotaVendaCotas: 0.2 });
  });
  it('antes da vigência, lança RegraNaoEncontradaError', () => {
    expect(() => regraFII('2023-12-12')).toThrow(RegraNaoEncontradaError);
  });
});

describe('regraVendaAcoes', () => {
  it('vigente desde 2004-12-21: R$ 20 mil por mês', () => {
    expect(regraVendaAcoes('2026-09-29')).toEqual({ limiteMensalIsento: 20_000 });
  });
  it('antes da vigência, lança RegraNaoEncontradaError', () => {
    expect(() => regraVendaAcoes('2004-12-20')).toThrow(RegraNaoEncontradaError);
  });
});

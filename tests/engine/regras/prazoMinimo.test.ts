import { describe, expect, it } from 'vitest';
import { dataMinimaResgate, prazoMinimoMeses } from '../../../src/engine/regras/prazoMinimo';
import { RegraNaoEncontradaError } from '../../../src/engine/erros';

describe('prazo mínimo LCI/LCA (Res. CMN 5.215/2025)', () => {
  it('sem índice de preços: 6 meses', () => {
    expect(prazoMinimoMeses('LCI', false, '2025-05-23')).toBe(6);
    expect(prazoMinimoMeses('LCA', false, '2026-09-28')).toBe(6);
  });
  it('com IPCA: LCI 36 meses, LCA 12 meses', () => {
    expect(prazoMinimoMeses('LCI', true, '2026-09-28')).toBe(36);
    expect(prazoMinimoMeses('LCA', true, '2026-09-28')).toBe(12);
  });
  it('emissão antes de 23/05/2025 ainda não está cadastrada (entra no M3)', () => {
    expect(() => prazoMinimoMeses('LCI', false, '2025-05-22')).toThrow(RegraNaoEncontradaError);
  });
  it('data mínima de resgate', () => {
    expect(dataMinimaResgate('LCI', false, '2026-09-28')).toBe('2027-03-28');
  });
  it('data mínima pela regra civil: sem o dia correspondente, vale o dia 1º do mês seguinte', () => {
    expect(dataMinimaResgate('LCI', false, '2026-08-29')).toBe('2027-03-01');
    expect(dataMinimaResgate('LCI', false, '2026-08-30')).toBe('2027-03-01');
    expect(dataMinimaResgate('LCI', false, '2026-08-31')).toBe('2027-03-01');
    expect(dataMinimaResgate('LCA', false, '2027-08-29')).toBe('2028-02-29');
    expect(dataMinimaResgate('LCA', false, '2027-03-31')).toBe('2027-10-01');
  });
});

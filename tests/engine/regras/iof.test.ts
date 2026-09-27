import { describe, expect, it } from 'vitest';
import { aliquotaIOF } from '../../../src/engine/regras/iof';
import { OfertaInvalidaError } from '../../../src/engine/erros';

describe('IOF regressivo', () => {
  it.each([[1, 0.96], [2, 0.93], [10, 0.66], [15, 0.5], [29, 0.03], [30, 0], [400, 0]])(
    '%i dias → %f', (dias, aliquota) => expect(aliquotaIOF(dias, '2026-09-28')).toBeCloseTo(aliquota, 10),
  );
  it.each([Number.NaN, 1.5, 0, -5])('prazo degenerado (%f dias) → OfertaInvalidaError', (dias) => {
    expect(() => aliquotaIOF(dias, '2026-09-28')).toThrow(OfertaInvalidaError);
  });
  it('resgate no mesmo dia não é um prazo válido', () => {
    expect(() => aliquotaIOF(0, '2026-09-28')).toThrow(OfertaInvalidaError);
  });
});

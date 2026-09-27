import { describe, expect, it } from 'vitest';
import { aliquotaIR } from '../../../src/engine/regras/ir';

describe('IR regressivo', () => {
  it.each([
    [1, 0.225], [180, 0.225], [181, 0.2], [360, 0.2], [361, 0.175], [720, 0.175], [721, 0.15], [5000, 0.15],
  ])('%i dias corridos → %f', (dias, aliquota) => {
    expect(aliquotaIR(dias, '2026-09-28')).toBe(aliquota);
  });
});

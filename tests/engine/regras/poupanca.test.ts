// tests/engine/regras/poupanca.test.ts
import { describe, expect, it } from 'vitest';
import { taxaBasePoupancaAM } from '../../../src/engine/regras/poupanca';

describe('regra da poupança', () => {
  it('Selic acima de 8,5%: 0,5% ao mês', () => {
    expect(taxaBasePoupancaAM(0.1375, '2026-09-28')).toBe(0.005);
  });
  it('Selic até 8,5%: 70% da Selic, mensalizada', () => {
    expect(taxaBasePoupancaAM(0.08, '2026-09-28')).toBeCloseTo(Math.pow(1.056, 1 / 12) - 1, 12);
    expect(taxaBasePoupancaAM(0.085, '2026-09-28')).toBeCloseTo(Math.pow(1 + 0.7 * 0.085, 1 / 12) - 1, 12);
  });
});

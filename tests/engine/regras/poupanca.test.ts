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
  it('limiar de 8,5% robusto a erro de ponto flutuante', () => {
    const selic = 0.0775 + 0.0075; // 0,08499999999999999
    expect(taxaBasePoupancaAM(selic, '2026-09-28')).toBeCloseTo(Math.pow(1 + 0.7 * selic, 1 / 12) - 1, 12);
    const selicAcima = 0.1254 - 0.0404; // 0,08500000000000002: é 8,5% e precisa cair na regra dos 70%
    expect(taxaBasePoupancaAM(selicAcima, '2026-09-28')).toBeCloseTo(Math.pow(1 + 0.7 * selicAcima, 1 / 12) - 1, 12);
    expect(taxaBasePoupancaAM(0.085, '2026-09-28')).toBeCloseTo(Math.pow(1 + 0.7 * 0.085, 1 / 12) - 1, 12);
    expect(taxaBasePoupancaAM(0.0851, '2026-09-28')).toBe(0.005);
  });
  it('depósito antes de 04/05/2012: 0,5% ao mês sempre, qualquer que seja a Selic (Lei 8.177/1991, art. 12)', () => {
    expect(taxaBasePoupancaAM(0.02, '2011-06-10')).toBe(0.005);
    expect(taxaBasePoupancaAM(0.02, '2012-05-03')).toBe(0.005);
    expect(taxaBasePoupancaAM(0.02, '2015-06-10')).toBeCloseTo(Math.pow(1 + 0.7 * 0.02, 1 / 12) - 1, 12);
  });
});

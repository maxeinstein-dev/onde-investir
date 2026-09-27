// tests/engine/regras/custodia.test.ts
import { describe, expect, it } from 'vitest';
import { custodiaTesouro } from '../../../src/engine/regras/custodia';

describe('custódia B3 do Tesouro', () => {
  const base = { diasCorridos: 365, dataResgate: '2027-09-28' };
  it('Tesouro Selic até R$ 10 mil é isento', () => {
    expect(custodiaTesouro({ ...base, selic: true, valorAplicado: 8000, valorBruto: 9082.771734 })).toBe(0);
  });
  it('Tesouro Selic paga só sobre o excedente de R$ 10 mil', () => {
    expect(custodiaTesouro({ ...base, selic: true, valorAplicado: 10100, valorBruto: 11466.999314 })).toBeCloseTo(1.566999, 5);
  });
  it('demais títulos pagam sobre tudo', () => {
    // média 9.000 × 0,2% × 365/365
    expect(custodiaTesouro({ ...base, selic: false, valorAplicado: 8000, valorBruto: 10000 })).toBeCloseTo(18, 10);
  });
});

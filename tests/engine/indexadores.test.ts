// tests/engine/indexadores.test.ts
import { describe, expect, it } from 'vitest';
import { fatorIPCA, fatorPercentualCDI, fatorPrefixado, fatorSelic, taxaDiaria } from '../../src/engine/indexadores';
import { CEN, INI } from './cenarioPadrao';

describe('indexadores', () => {
  it('taxa diária base 252', () => {
    expect(Math.pow(1 + taxaDiaria(0.1365), 252)).toBeCloseTo(1.1365, 12);
  });
  it('100% do CDI em 21 dias úteis = (1 + CDI)^(21/252)', () => {
    expect(fatorPercentualCDI(CEN, 1, INI, '2026-10-28')).toBeCloseTo(Math.pow(1.1365, 21 / 252), 12);
  });
  it('103% do CDI em 1 ano (250 dias úteis) — referência', () => {
    expect(10000 * fatorPercentualCDI(CEN, 1.03, INI, '2027-09-28')).toBeCloseTo(11396.771285, 4);
  });
  it('prefixado 13% a.a. em 2 anos (502 dias úteis) — referência', () => {
    expect(10000 * fatorPrefixado(0.13, INI, '2028-09-28')).toBeCloseTo(12756.620315, 4);
  });
  it('IPCA 4,22% + 7% a.a. em 3 anos — referência', () => {
    expect(10000 * fatorIPCA(CEN, INI, '2029-09-28') * fatorPrefixado(0.07, INI, '2029-09-28')).toBeCloseTo(13837.746047, 3);
  });
  it('Selic over constante = CDI no cenário padrão', () => {
    expect(fatorSelic(CEN, INI, '2027-09-28')).toBeCloseTo(Math.pow(1.1365, 250 / 252), 10);
  });
});

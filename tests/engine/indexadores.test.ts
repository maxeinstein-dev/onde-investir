// tests/engine/indexadores.test.ts
import { describe, expect, it } from 'vitest';
import { ehDiaUtil } from '../../src/engine/calendario';
import { diaDaSemana } from '../../src/engine/datas';
import { type Cenario, fatorIPCA, fatorPercentualCDI, fatorPrefixado, fatorSelic, taxaDiaria } from '../../src/engine/indexadores';
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
    expect(10000 * fatorIPCA(CEN, INI, '2029-09-28') * fatorPrefixado(0.07, INI, '2029-09-28')).toBeCloseTo(13853.403968, 3);
  });
  it('IPCA: um ano civil inteiro rende exatamente 1 + IPCA (2026 tem 249 dias úteis, mas a regra é mensal)', () => {
    expect(fatorIPCA(CEN, '2026-01-01', '2027-01-01')).toBeCloseTo(1.0422, 12);
  });
  it('IPCA: um mês civil inteiro rende exatamente (1 + IPCA)^(1/12)', () => {
    expect(fatorIPCA(CEN, '2026-10-01', '2026-11-01')).toBeCloseTo(Math.pow(1.0422, 1 / 12), 12);
    // Dezembro/2026 tem 22 dias úteis: a regra mensal não depende da contagem de dias do mês.
    expect(fatorIPCA(CEN, '2026-12-01', '2027-01-01')).toBeCloseTo(Math.pow(1.0422, 1 / 12), 12);
  });
  it('Selic over constante = CDI no cenário padrão', () => {
    expect(fatorSelic(CEN, INI, '2027-09-28')).toBeCloseTo(Math.pow(1.1365, 250 / 252), 10);
  });
  it('cenário que varia no tempo: cada dia útil usa a taxa vigente naquele dia', () => {
    const cen: Cenario = {
      cdiAA: (d) => (d < '2026-10-15' ? 0.1 : 0.12),
      selicOverAA: () => 0.1,
      selicMetaAA: () => 0.1,
      ipcaAA: () => 0.04,
      trAM: () => 0,
    };
    expect(diaDaSemana('2026-10-14')).toBe(3); // quarta
    expect(diaDaSemana('2026-10-15')).toBe(4); // quinta
    expect(ehDiaUtil('2026-10-14')).toBe(true);
    expect(ehDiaUtil('2026-10-15')).toBe(true);
    expect(fatorPercentualCDI(cen, 1, '2026-10-14', '2026-10-15')).toBeCloseTo(Math.pow(1.1, 1 / 252), 14);
    expect(fatorPercentualCDI(cen, 1, '2026-10-15', '2026-10-16')).toBeCloseTo(Math.pow(1.12, 1 / 252), 14);
  });
});

import { describe, expect, it } from 'vitest';
import { calcularEquivalencias } from '../../src/engine/equivalencia';
import { simular, type Aplicacao } from '../../src/engine/produtos';
import { CEN, INI } from './cenarioPadrao';

const lci80: Aplicacao = { produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 }, valor: 10000, dataAplicacao: INI };

describe('equivalência', () => {
  it('LCI 80% por 2 anos: exata 92,57% × regra de bolso 94,12%', () => {
    const eq = calcularEquivalencias(lci80, '2028-09-28', CEN);
    expect(eq.tributadoPosCDI).toBeCloseTo(0.925707, 5);
    expect(eq.regraDeBolso).toBeCloseTo(0.8 / 0.85, 10);
    expect(eq.tributadoPre).toBeCloseTo(0.12575, 5);
    expect(eq.tributadoIpcaMais).toBeCloseTo(0.079909, 5);
    expect(eq.isentoPosCDI).toBeCloseTo(0.8, 6);
    expect(eq.aliquotaIR).toBe(0.15);
  });
  it('LCI 80% por 1 ano: exata 95,98% × regra de bolso 96,97%', () => {
    const eq = calcularEquivalencias(lci80, '2027-09-28', CEN);
    expect(eq.tributadoPosCDI).toBeCloseTo(0.959773, 5);
    expect(eq.regraDeBolso).toBeCloseTo(0.8 / 0.825, 10);
    expect(eq.tributadoPre).toBeCloseTo(0.130667, 5);
    expect(eq.tributadoIpcaMais).toBeCloseTo(0.084526, 5);
  });
  it('CDB 103% por 2 anos equivale a LCI 89,17% (bolso 87,55%)', () => {
    const cdb: Aplicacao = { ...lci80, produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 } };
    const eq = calcularEquivalencias(cdb, '2028-09-28', CEN);
    expect(eq.isentoPosCDI).toBeCloseTo(0.891676, 5);
    expect(eq.regraDeBolso).toBeCloseTo(1.03 * 0.85, 10);
  });
  it('ida e volta: o CDB na taxa exata reproduz o líquido da LCI', () => {
    const eq = calcularEquivalencias(lci80, '2028-09-28', CEN);
    const cdb = simular({ ...lci80, produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: eq.tributadoPosCDI } }, '2028-09-28', CEN);
    expect(Math.abs(cdb.valorLiquido - eq.liquidoAlvo)).toBeLessThan(1e-6);
  });
  it('prazo menor que o mínimo da LCI → sem equivalente isento', () => {
    const cdb: Aplicacao = { ...lci80, produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 } };
    expect(calcularEquivalencias(cdb, '2026-12-28', CEN).isentoPosCDI).toBeNull();
  });
  it('origem prefixada não tem regra de bolso', () => {
    const pre: Aplicacao = { ...lci80, produto: 'CDB', indexacao: { tipo: 'PRE', taxaAA: 0.13 } };
    expect(calcularEquivalencias(pre, '2028-09-28', CEN).regraDeBolso).toBeNull();
  });
});

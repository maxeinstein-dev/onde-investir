import { describe, expect, it } from 'vitest';
import { decidirVencedor, duelar } from '../../src/engine/comparador';
import type { Cenario } from '../../src/engine/indexadores';
import type { Oferta } from '../../src/engine/produtos';
import { CEN, INI } from './cenarioPadrao';

const cdb103: Oferta = { produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 } };
const lci = (p: number): Oferta => ({ produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: p } });

describe('duelo', () => {
  it('CDB 103% vence LCI 80% em 2 anos com CDI a 13,65%', () => {
    const d = duelar(10000, INI, '2028-09-28', cdb103, lci(0.8), CEN);
    expect(d.vencedor).toBe('A');
    expect(d.diferenca).toBeCloseTo(289.856027, 4);
    expect(d.diferencaPercentual).toBeCloseTo(289.856027 / 12262.041408, 8);
  });
  it('LCI 95% vence CDB 103%', () => {
    expect(duelar(10000, INI, '2028-09-28', cdb103, lci(0.95), CEN).vencedor).toBe('B');
  });
  it('mesma oferta dos dois lados → empate', () => {
    expect(duelar(10000, INI, '2028-09-28', cdb103, cdb103, CEN).vencedor).toBe('EMPATE');
  });
});

describe('decidirVencedor: comparação em centavos arredondados', () => {
  it('100,0051 × 100,0111 arredondam para os mesmos 100,01 → empate', () => {
    expect(decidirVencedor(100.0051, 100.0111)).toBe('EMPATE');
    expect(decidirVencedor(100.0111, 100.0051)).toBe('EMPATE');
  });
  it('centavos diferentes decidem o vencedor', () => {
    expect(decidirVencedor(100.0149, 100.0151)).toBe('B');
    expect(decidirVencedor(100.02, 100.01)).toBe('A');
    expect(decidirVencedor(100, 100)).toBe('EMPATE');
  });
});

describe('duelar: defesa em profundidade', () => {
  it('líquido não finito → erro', () => {
    const cenNaN: Cenario = { ...CEN, cdiAA: () => Number.NaN };
    expect(() => duelar(10000, INI, '2028-09-28', cdb103, lci(0.8), cenNaN)).toThrow(/não é finito/);
  });
  it('diferença continua em reais, sem arredondar', () => {
    const d = duelar(10000, INI, '2028-09-28', cdb103, lci(0.8), CEN);
    expect(d.diferenca).toBe(Math.abs(d.a.valorLiquido - d.b.valorLiquido));
  });
});

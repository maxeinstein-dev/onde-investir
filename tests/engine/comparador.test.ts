import { describe, expect, it } from 'vitest';
import { duelar } from '../../src/engine/comparador';
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

import { describe, expect, it } from 'vitest';
import { criarCurva, valorEm } from '../../src/engine/curva';

describe('curva degrau', () => {
  const c = criarCurva([
    { inicio: '2026-11-05', valor: 0.1325 },
    { inicio: '2026-09-24', valor: 0.1375 },
    { inicio: '2026-12-10', valor: 0.13 },
  ]);
  it('ordena e vale a partir do início (inclusive)', () => {
    expect(valorEm(c, '2026-09-24')).toBe(0.1375);
    expect(valorEm(c, '2026-11-04')).toBe(0.1375);
    expect(valorEm(c, '2026-11-05')).toBe(0.1325);
    expect(valorEm(c, '2030-01-01')).toBe(0.13);
  });
  it('antes do primeiro ponto usa o primeiro valor', () => {
    expect(valorEm(c, '2020-01-01')).toBe(0.1375);
  });
  it('mesmo início: vale o último informado', () => {
    expect(valorEm(criarCurva([{ inicio: '2026-01-01', valor: 1 }, { inicio: '2026-01-01', valor: 2 }]), '2026-06-01')).toBe(2);
  });
  it('curva vazia ou valor não finito → erro', () => {
    expect(() => criarCurva([])).toThrow();
    expect(() => criarCurva([{ inicio: '2026-01-01', valor: Number.NaN }])).toThrow();
  });
});

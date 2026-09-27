// tests/engine/calendario.test.ts
import { describe, expect, it } from 'vitest';
import { diasUteis, ehDiaUtil, feriadosNacionais, pascoa } from '../../src/engine/calendario';

describe('calendário', () => {
  it('Páscoa 2024–2035', () => {
    const esperado = ['2024-03-31', '2025-04-20', '2026-04-05', '2027-03-28', '2028-04-16', '2029-04-01',
      '2030-04-21', '2031-04-13', '2032-03-28', '2033-04-17', '2034-04-09', '2035-03-25'];
    expect(esperado.map((_, i) => pascoa(2024 + i))).toEqual(esperado);
  });
  it('feriados móveis derivados da Páscoa (2026)', () => {
    const f = feriadosNacionais(2026);
    for (const d of ['2026-02-16', '2026-02-17', '2026-04-03', '2026-06-04']) expect(f.has(d)).toBe(true);
  });
  it('20/11 é feriado nacional a partir de 2024', () => {
    expect(feriadosNacionais(2023).has('2023-11-20')).toBe(false);
    expect(feriadosNacionais(2024).has('2024-11-20')).toBe(true);
  });
  it('dia útil', () => {
    expect(ehDiaUtil('2026-09-28')).toBe(true);  // segunda
    expect(ehDiaUtil('2026-09-27')).toBe(false); // domingo
    expect(ehDiaUtil('2026-02-16')).toBe(false); // Carnaval
    expect(ehDiaUtil('2026-11-20')).toBe(false); // Consciência Negra
  });
  it('dias úteis em [início, fim)', () => {
    expect(diasUteis('2025-01-01', '2026-01-01')).toBe(252);
    expect(diasUteis('2026-01-01', '2027-01-01')).toBe(249);
    expect(diasUteis('2027-01-01', '2028-01-01')).toBe(251);
    expect(diasUteis('2026-09-28', '2026-10-28')).toBe(21);
    expect(diasUteis('2026-02-13', '2026-02-20')).toBe(3); // semana do Carnaval
    expect(diasUteis('2026-09-28', '2026-09-28')).toBe(0);
  });
});

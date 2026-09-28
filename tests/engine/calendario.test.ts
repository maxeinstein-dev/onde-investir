// tests/engine/calendario.test.ts
import { describe, expect, it } from 'vitest';
import { diasUteis, diasUteisDoAno, diasUteisEntre, ehDiaUtil, feriadosNacionais, pascoa } from '../../src/engine/calendario';
import { deDia, paraDia } from '../../src/engine/datas';

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
    expect(() => diasUteis('2026-09-28', '2026-09-27')).toThrow(RangeError);
  });
  it('índice anual: dias úteis do ano em ordem, iguais à varredura dia a dia', () => {
    for (const ano of [2026, 2027, 2048]) {
      const varredura: string[] = [];
      for (let d = paraDia(`${ano}-01-01`); d < paraDia(`${ano + 1}-01-01`); d++) if (ehDiaUtil(deDia(d))) varredura.push(deDia(d));
      expect(diasUteisDoAno(ano)).toEqual(varredura);
    }
    expect(diasUteisDoAno(2026)).toBe(diasUteisDoAno(2026)); // cache
  });
  it('diasUteisEntre: [início, fim), atravessando anos', () => {
    expect(diasUteisEntre('2026-12-30', '2027-01-05')).toEqual(['2026-12-30', '2026-12-31', '2027-01-04']);
    expect(diasUteisEntre('2026-09-26', '2026-09-29')).toEqual(['2026-09-28']); // começa no sábado
    expect(diasUteisEntre('2026-09-28', '2026-09-28')).toEqual([]);
    expect(diasUteisEntre('2026-01-01', '2029-01-01')).toHaveLength(diasUteis('2026-01-01', '2029-01-01'));
    expect(() => diasUteisEntre('2026-09-28', '2026-09-27')).toThrow(RangeError);
  });
});

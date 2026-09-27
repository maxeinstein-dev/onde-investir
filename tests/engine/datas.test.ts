// tests/engine/datas.test.ts
import { describe, expect, it } from 'vitest';
import { dataBR, deDia, diaDaSemana, diasCorridos, paraDia, somarDias, somarMeses } from '../../src/engine/datas';
import { DataInvalidaError } from '../../src/engine/erros';

describe('datas', () => {
  it('converte ida e volta', () => {
    expect(paraDia('1970-01-02')).toBe(1);
    expect(deDia(paraDia('2026-09-28'))).toBe('2026-09-28');
  });
  it('rejeita datas inválidas', () => {
    expect(() => paraDia('2026-02-30')).toThrow(DataInvalidaError);
    expect(() => paraDia('2026-9-1')).toThrow(DataInvalidaError);
    expect(() => paraDia('28/09/2026')).toThrow(DataInvalidaError);
  });
  it('soma dias e conta dias corridos', () => {
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(diasCorridos('2026-09-28', '2027-09-28')).toBe(365);
    expect(diasCorridos('2026-09-28', '2028-09-28')).toBe(731); // passa por 29/02/2028
  });
  it('dia da semana (0 = domingo)', () => {
    expect(diaDaSemana('2026-09-27')).toBe(0);
    expect(diaDaSemana('2026-09-28')).toBe(1);
  });
  it('soma meses, ajustando para o último dia do mês quando necessário', () => {
    expect(somarMeses('2026-09-28', 6)).toBe('2027-03-28');
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29');
    expect(somarMeses('2026-11-15', -12)).toBe('2025-11-15');
    expect(somarMeses('2026-12-10', 1)).toBe('2027-01-10');
  });
  it('formata DD/MM/AAAA para mensagens', () => {
    expect(dataBR('2027-03-28')).toBe('28/03/2027');
  });
});

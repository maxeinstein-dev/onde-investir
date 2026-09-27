import { describe, expect, it } from 'vitest';
import { formatarData, formatarMoeda, formatarNumero, formatarPercentual } from '../src/formato';

describe('formato pt-BR', () => {
  it('moeda', () => expect(formatarMoeda(12551.897435)).toMatch(/^R\$\s12\.551,90$/));
  it('percentual com até 2 casas', () => {
    expect(formatarPercentual(0.175)).toBe('17,5%');
    expect(formatarPercentual(0.925707)).toBe('92,57%');
    expect(formatarPercentual(1.03)).toBe('103%');
  });
  it('número com até 2 casas, sem símbolo', () => {
    expect(formatarNumero(1.6123)).toBe('1,61');
    expect(formatarNumero(1)).toBe('1');
    expect(formatarNumero(0.5)).toBe('0,5');
    expect(formatarNumero(1234.567)).toBe('1.234,57');
  });
  it('data', () => expect(formatarData('2027-03-28')).toBe('28/03/2027'));
});

import { describe, expect, it } from 'vitest';
import { OfertaInvalidaError } from '../../src/engine/erros';
import { validarObjetivo, valorAlvo, type Objetivo } from '../../src/engine/sugestao';

const HOJE = '2026-09-29';

describe('valorAlvo', () => {
  it('reserva: gasto × 6 (estável) ou × 12 (variável)', () => {
    expect(valorAlvo({ tipo: 'RESERVA', gastoMensal: 3000, rendaEstavel: true })).toBe(18000);
    expect(valorAlvo({ tipo: 'RESERVA', gastoMensal: 3000, rendaEstavel: false })).toBe(36000);
  });
  it('com data: o próprio valor-alvo', () => {
    expect(valorAlvo({ tipo: 'COM_DATA', valorAlvo: 50000, data: '2028-01-01' })).toBe(50000);
  });
  it('longo prazo e sem objetivo: sem valor-alvo (só horizonte)', () => {
    expect(valorAlvo({ tipo: 'LONGO_PRAZO', horizonteAnos: 15 })).toBeNull();
    expect(valorAlvo({ tipo: 'SEM_OBJETIVO', horizonteAnos: 3 })).toBeNull();
  });
});

describe('validarObjetivo', () => {
  it('reserva: gasto mensal precisa ser positivo', () => {
    expect(() => validarObjetivo({ tipo: 'RESERVA', gastoMensal: 0, rendaEstavel: true }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ tipo: 'RESERVA', gastoMensal: Number.NaN, rendaEstavel: true }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ tipo: 'RESERVA', gastoMensal: 2000, rendaEstavel: true }, HOJE)).not.toThrow();
  });
  it('com data: valor positivo, data válida e no futuro', () => {
    const base: Objetivo = { tipo: 'COM_DATA', valorAlvo: 1000, data: '2028-01-01' };
    expect(() => validarObjetivo({ ...base, valorAlvo: 0 }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ ...base, data: '2026-13-01' }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ ...base, data: '2026-01-01' }, HOJE)).toThrow(OfertaInvalidaError); // no passado
    expect(() => validarObjetivo({ ...base, data: HOJE }, HOJE)).toThrow(OfertaInvalidaError); // hoje não é "no futuro"
    expect(() => validarObjetivo(base, HOJE)).not.toThrow();
  });
  it('longo prazo e sem objetivo: horizonte inteiro maior que zero', () => {
    expect(() => validarObjetivo({ tipo: 'LONGO_PRAZO', horizonteAnos: 0 }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ tipo: 'LONGO_PRAZO', horizonteAnos: 5.5 }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ tipo: 'SEM_OBJETIVO', horizonteAnos: 10 }, HOJE)).not.toThrow();
  });
});

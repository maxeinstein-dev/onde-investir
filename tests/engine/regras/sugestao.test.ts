import { describe, expect, it } from 'vitest';
import { faixaLongoPrazo, MULTIPLICADOR_RESERVA } from '../../../src/engine/regras/sugestao';

describe('regras de sugestão', () => {
  it('multiplicador da reserva: 6× estável, 12× variável', () => {
    expect(MULTIPLICADOR_RESERVA.estavel).toBe(6);
    expect(MULTIPLICADOR_RESERVA.variavel).toBe(12);
  });

  it('faixa de longo prazo por horizonte, com as fronteiras exatas', () => {
    expect(faixaLongoPrazo(1)).toEqual({ ateAnos: 10, ipca: 0.6, pos: 0.4 });
    expect(faixaLongoPrazo(10)).toEqual({ ateAnos: 10, ipca: 0.6, pos: 0.4 });
    expect(faixaLongoPrazo(11)).toEqual({ ateAnos: 20, ipca: 0.7, pos: 0.3 });
    expect(faixaLongoPrazo(20)).toEqual({ ateAnos: 20, ipca: 0.7, pos: 0.3 });
    expect(faixaLongoPrazo(21)).toEqual({ ateAnos: Infinity, ipca: 0.8, pos: 0.2 });
    expect(faixaLongoPrazo(50)).toEqual({ ateAnos: Infinity, ipca: 0.8, pos: 0.2 });
  });

  it('cada faixa soma 100%', () => {
    for (const anos of [5, 10, 15, 20, 30]) {
      const f = faixaLongoPrazo(anos);
      expect(f.ipca + f.pos).toBeCloseTo(1, 10);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { cenarioConstante, fatorIPCA, fatorPercentualCDI } from '../../src/engine/indexadores';
import {
  analisarRendaVariavel,
  drawdownMaximo,
  rentabilidade,
  volatilidadeAnualizada,
} from '../../src/engine/rendaVariavel';

describe('rentabilidade', () => {
  it('fechamento final / inicial − 1', () => {
    expect(rentabilidade([100, 110, 121])).toBeCloseTo(0.21, 12);
  });
  it('queda vira negativo', () => {
    expect(rentabilidade([100, 80])).toBeCloseTo(-0.2, 12);
  });
  it('menos de 2 pontos: null (sem período)', () => {
    expect(rentabilidade([100])).toBeNull();
    expect(rentabilidade([])).toBeNull();
  });
});

describe('volatilidadeAnualizada', () => {
  it('série constante: zero', () => {
    expect(volatilidadeAnualizada([10, 10, 10, 10])).toBe(0);
  });
  it('desvio-padrão amostral dos retornos diários × √252', () => {
    const esperado = Math.sqrt(0.02) * Math.sqrt(252);
    expect(volatilidadeAnualizada([100, 110, 99])).toBeCloseTo(esperado, 10);
  });
  it('menos de 3 pontos (menos de 2 retornos): null', () => {
    expect(volatilidadeAnualizada([100, 110])).toBeNull();
  });
});

describe('drawdownMaximo', () => {
  it('maior queda de um pico até o vale seguinte', () => {
    expect(drawdownMaximo([100, 120, 90, 130, 117])).toBeCloseTo(-0.25, 12);
  });
  it('série sempre subindo: zero', () => {
    expect(drawdownMaximo([1, 2, 3])).toBe(0);
  });
  it('vazio: null', () => {
    expect(drawdownMaximo([])).toBeNull();
  });
});

describe('analisarRendaVariavel', () => {
  const cen = cenarioConstante({ cdiAA: 0.1365, selicMetaAA: 0.1375, ipcaAA: 0.0422, trAM: 0.001646 });
  const candles = [
    { data: '2026-07-01', fechamento: 100 },
    { data: '2026-08-03', fechamento: 105 },
    { data: '2026-09-29', fechamento: 110 },
  ];

  it('monta o período a partir do primeiro e último candle', () => {
    const a = analisarRendaVariavel(candles, cen);
    expect(a?.inicio).toBe('2026-07-01');
    expect(a?.fim).toBe('2026-09-29');
    expect(a?.rentabilidade).toBeCloseTo(0.1, 12);
  });

  it('CDI e IPCA no mesmo período, com os fatores que o motor já usa', () => {
    const a = analisarRendaVariavel(candles, cen);
    expect(a?.cdi).toBeCloseTo(fatorPercentualCDI(cen, 1, '2026-07-01', '2026-09-29') - 1, 12);
    expect(a?.ipca).toBeCloseTo(fatorIPCA(cen, '2026-07-01', '2026-09-29') - 1, 12);
  });

  it('ordena por data antes de calcular (a API não garante ordem)', () => {
    const a = analisarRendaVariavel([candles[2]!, candles[0]!, candles[1]!], cen);
    expect(a?.inicio).toBe('2026-07-01');
    expect(a?.rentabilidade).toBeCloseTo(0.1, 12);
  });

  it('menos de 2 candles: null', () => {
    expect(analisarRendaVariavel([candles[0]!], cen)).toBeNull();
  });
});

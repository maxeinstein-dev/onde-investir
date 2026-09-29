import { describe, expect, it } from 'vitest';
import {
  orcamentoDiario, segundosAteProximoBoundary, validarTicker,
} from '../../functions/_lib/mercado';

describe('validarTicker', () => {
  it('aceita o padrão B3 (4 letras + 1-2 números)', () => {
    expect(validarTicker('PETR4')).toBe(true);
    expect(validarTicker('HGLG11')).toBe(true);
  });
  it('rejeita o que não bate no padrão', () => {
    expect(validarTicker('petr4')).toBe(false); // minúsculo
    expect(validarTicker('PETR')).toBe(false); // sem número
    expect(validarTicker('PE4')).toBe(false); // menos de 4 letras
    expect(validarTicker('PETR4; DROP TABLE')).toBe(false);
    expect(validarTicker('')).toBe(false);
  });
});

describe('segundosAteProximoBoundary', () => {
  // BRT = UTC-3, sem horário de verão desde 2019.
  it('em pregão (dia útil, 10h-18h BRT): 30 minutos', () => {
    const agora = new Date('2026-09-29T15:00:00Z'); // 12h BRT, terça-feira
    expect(segundosAteProximoBoundary(agora)).toBe(30 * 60);
  });
  it('fora do pregão, mesmo dia útil (antes das 10h BRT): até a abertura', () => {
    const agora = new Date('2026-09-29T11:00:00Z'); // 8h BRT
    expect(segundosAteProximoBoundary(agora)).toBe(2 * 60 * 60); // até 10h BRT
  });
  it('fora do pregão, depois das 18h BRT num dia útil: até a abertura do próximo dia útil', () => {
    const agora = new Date('2026-09-29T22:00:00Z'); // 19h BRT, terça
    // próxima abertura: quarta 10h BRT = 13h UTC do dia seguinte
    const esperado = Math.round((Date.parse('2026-09-30T13:00:00Z') - agora.getTime()) / 1000);
    expect(segundosAteProximoBoundary(agora)).toBe(esperado);
  });
  it('fim de semana: até a abertura de segunda', () => {
    const agora = new Date('2026-10-03T15:00:00Z'); // sábado, 12h BRT
    const esperado = Math.round((Date.parse('2026-10-05T13:00:00Z') - agora.getTime()) / 1000); // segunda 10h BRT
    expect(segundosAteProximoBoundary(agora)).toBe(esperado);
  });
});

describe('orcamentoDiario', () => {
  it('divide o restante do mês pelos dias restantes', () => {
    expect(orcamentoDiario(0, 15, 1000)).toBe(1000); // 15000/15 = 1000, sem teto
  });
  it('nunca passa do teto', () => {
    expect(orcamentoDiario(0, 5, 500)).toBe(500); // 15000/5 = 3000, teto corta pra 500
  });
  it('cota já estourada no mês: zero', () => {
    expect(orcamentoDiario(15000, 10, 1000)).toBe(0);
  });
  it('nunca negativo mesmo se o uso passar de 15000', () => {
    expect(orcamentoDiario(20000, 10, 1000)).toBe(0);
  });
});

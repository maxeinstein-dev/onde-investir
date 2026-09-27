// src/engine/comparador.ts
import type { DataISO } from './datas';
import type { Cenario } from './indexadores';
import { simular, type Oferta, type ResultadoSimulacao } from './produtos';

/**
 * Vencedor pela comparação em centavos arredondados: dois líquidos que viram o mesmo valor em
 * centavos empatam (o que a pessoa vê na tela é igual).
 */
export function decidirVencedor(liquidoA: number, liquidoB: number): 'A' | 'B' | 'EMPATE' {
  const centavosA = Math.round(liquidoA * 100);
  const centavosB = Math.round(liquidoB * 100);
  return centavosA === centavosB ? 'EMPATE' : centavosA > centavosB ? 'A' : 'B';
}

export interface Duelo {
  a: ResultadoSimulacao;
  b: ResultadoSimulacao;
  vencedor: 'A' | 'B' | 'EMPATE';
  /** Em reais, sem arredondar, sempre positiva. */
  diferenca: number;
  /** Diferença sobre o líquido do perdedor. */
  diferencaPercentual: number;
}

/** Compara duas ofertas com o MESMO valor e datas (base igual). */
export function duelar(
  valor: number, dataAplicacao: DataISO, dataResgate: DataISO, a: Oferta, b: Oferta, cen: Cenario,
): Duelo {
  const ra = simular({ ...a, valor, dataAplicacao }, dataResgate, cen);
  const rb = simular({ ...b, valor, dataAplicacao }, dataResgate, cen);
  return montarDuelo(ra, rb);
}

/** O duelo entre duas simulações já feitas (mesma base). */
export function montarDuelo(ra: ResultadoSimulacao, rb: ResultadoSimulacao): Duelo {
  if (!Number.isFinite(ra.valorLiquido) || !Number.isFinite(rb.valorLiquido)) {
    throw new Error('O valor líquido de uma das ofertas não é finito: confira o cenário e as taxas');
  }
  const diferenca = Math.abs(ra.valorLiquido - rb.valorLiquido);
  return {
    a: ra,
    b: rb,
    vencedor: decidirVencedor(ra.valorLiquido, rb.valorLiquido),
    diferenca,
    diferencaPercentual: diferenca / Math.min(ra.valorLiquido, rb.valorLiquido),
  };
}

// src/engine/comparador.ts
import type { DataISO } from './datas';
import type { Cenario } from './indexadores';
import { simular, type Oferta, type ResultadoSimulacao } from './produtos';

/** Diferença abaixo de meio centavo conta como empate. */
export const LIMIAR_EMPATE = 0.005;

export interface Duelo {
  a: ResultadoSimulacao;
  b: ResultadoSimulacao;
  vencedor: 'A' | 'B' | 'EMPATE';
  /** Em reais, sempre positiva. */
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
  const bruta = ra.valorLiquido - rb.valorLiquido;
  const diferenca = Math.abs(bruta);
  return {
    a: ra,
    b: rb,
    vencedor: diferenca < LIMIAR_EMPATE ? 'EMPATE' : bruta > 0 ? 'A' : 'B',
    diferenca,
    diferencaPercentual: diferenca / Math.min(ra.valorLiquido, rb.valorLiquido),
  };
}

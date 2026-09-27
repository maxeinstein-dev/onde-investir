// src/engine/curva.ts
import { type DataISO, paraDia } from './datas';

/** Ponto de uma função degrau: `valor` vale de `inicio` (inclusive) até o próximo ponto. */
export interface PontoCurva { inicio: DataISO; valor: number }
export type Curva = readonly PontoCurva[];

export function criarCurva(pontos: readonly PontoCurva[]): Curva {
  if (pontos.length === 0) throw new RangeError('Curva sem pontos');
  const porInicio = new Map<DataISO, number>();
  for (const p of pontos) {
    paraDia(p.inicio); // valida a data
    if (!Number.isFinite(p.valor)) throw new RangeError(`Valor inválido na curva em ${p.inicio}`);
    porInicio.set(p.inicio, p.valor);
  }
  return Object.freeze([...porInicio].map(([inicio, valor]) => ({ inicio, valor })).sort((a, b) => (a.inicio < b.inicio ? -1 : 1)));
}

/** Busca binária: último ponto com início ≤ data; antes do primeiro, o primeiro. */
export function valorEm(curva: Curva, data: DataISO): number {
  let lo = 0;
  let hi = curva.length - 1;
  let achado = 0;
  while (lo <= hi) {
    const meio = (lo + hi) >> 1;
    if ((curva[meio] as PontoCurva).inicio <= data) { achado = meio; lo = meio + 1; } else hi = meio - 1;
  }
  return (curva[achado] as PontoCurva).valor;
}

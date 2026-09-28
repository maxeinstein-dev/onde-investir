import type { DataISO } from '../engine/datas';
/** Data local do navegador (não UTC). */
export function hoje(): DataISO {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Limites de todo `input type=date`: o Chrome aceita ano com 5 dígitos ("20277-01-01"), que o engine não
 * aceita. O `max` impede o seletor de oferecer esses anos; a validação de cada formulário cobre o que for digitado.
 */
export const DATA_MINIMA = '1990-01-01';
export const DATA_MAXIMA = '9999-12-31';

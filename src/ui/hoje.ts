import type { DataISO } from '../engine/datas';
/** Data local do navegador (não UTC). */
export function hoje(): DataISO {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

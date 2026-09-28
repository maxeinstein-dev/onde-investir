/** Letra de cada oferta nas listas e na comparação: A, B, … Z, AA, AB, … */
export function letraDaOferta(indice: number): string {
  const letra = (n: number) => String.fromCharCode(65 + n);
  return indice < 26 ? letra(indice) : letra(Math.floor(indice / 26) - 1) + letra(indice % 26);
}

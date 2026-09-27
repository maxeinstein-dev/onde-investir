// A seleção da comparação (os ids das ofertas do catálogo, na ordem das colunas), validada por esquema (spec §7.2).
import { z } from '../zod';
import type { Armazenamento } from '../dados/cache';

export const CHAVE_COMPARACAO = 'rende:comparacao:v1';
export const LIMITE_COMPARACAO = 5;

const LIMITE_ID = 80;
const ERRO_LIMITE = `A comparação já tem ${LIMITE_COMPARACAO} ofertas. Tire uma para adicionar outra.`;
const EsquemaSelecao = z.array(z.string().min(1).max(LIMITE_ID)).max(LIMITE_COMPARACAO);

const semRepetidos = (ids: readonly string[]): string[] => [...new Set(ids)];

/** Os ids salvos, na ordem. Storage indisponível, corrompido ou fora do esquema → seleção vazia. */
export function lerSelecao(arm: Armazenamento): string[] {
  try {
    const bruto = arm.getItem(CHAVE_COMPARACAO);
    if (bruto === null) return [];
    const r = EsquemaSelecao.safeParse(JSON.parse(bruto));
    return r.success ? semRepetidos(r.data) : [];
  } catch {
    return [];
  }
}

/** Grava a seleção; false se o storage recusar (cheio ou bloqueado). */
export function salvarSelecao(arm: Armazenamento, ids: readonly string[]): boolean {
  try {
    arm.setItem(CHAVE_COMPARACAO, JSON.stringify(ids));
    return true;
  } catch {
    return false;
  }
}

/** Tira os ids que não estão mais no catálogo e os repetidos, e corta no limite. */
export function sincronizarSelecao(ids: readonly string[], catalogo: readonly { id: string }[]): string[] {
  const existentes = new Set(catalogo.map((o) => o.id));
  return semRepetidos(ids).filter((id) => existentes.has(id)).slice(0, LIMITE_COMPARACAO);
}

/** Acrescenta no fim. Id repetido não entra; com a comparação cheia, devolve o erro e a seleção como estava. */
export function adicionar(ids: readonly string[], id: string): { ids: string[]; erro?: string } {
  if (ids.includes(id)) return { ids: [...ids] };
  if (ids.length >= LIMITE_COMPARACAO) return { ids: [...ids], erro: ERRO_LIMITE };
  return { ids: [...ids, id] };
}

export function remover(ids: readonly string[], id: string): string[] {
  return ids.filter((x) => x !== id);
}

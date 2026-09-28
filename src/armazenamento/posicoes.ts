// Posições da carteira (spec §5.3): localStorage, validadas por esquema e pelo engine (spec §7.2).
// As posições nunca entram no link compartilhável (M3c): ver tests/seguranca/linkSemPosicoes.test.ts.
import { z } from '../zod';
import type { Armazenamento } from '../dados/cache';
import { OfertaInvalidaError } from '../engine/erros';
import { type DataISO } from '../engine/datas';
import { type Posicao, validarPosicao } from '../engine/posicoes';
import { DataIso, LIMITE_TEXTO, camposOferta } from './ofertas';

export const CHAVE_POSICOES = 'rende:posicoes:v1';
export const LIMITE_POSICOES = 50;
/** Guarda do tamanho da lista de eventos; no M3a o engine só aceita a lista vazia. */
const LIMITE_EVENTOS = 100;

const EsquemaEvento = z.strictObject({ tipo: z.enum(['APORTE', 'RESGATE']), data: DataIso, valor: z.number() });

/** Os campos da posição, sem o id. As faixas (valor positivo, datas até hoje etc.) ficam com validarPosicao. */
export const camposPosicao = {
  ...camposOferta,
  valorAplicado: z.number(),
  dataAplicacao: DataIso,
  valorExtrato: z.number().optional(),
  dataExtrato: DataIso.optional(),
  baseExtrato: z.enum(['BRUTO', 'LIQUIDO']).optional(),
  eventos: z.array(EsquemaEvento).max(LIMITE_EVENTOS),
};
const EsquemaPosicao = z.strictObject({ id: z.string().min(1).max(LIMITE_TEXTO), ...camposPosicao });

let sequencia = 0;
/** Id novo, com o prefixo "p-" (as ofertas usam "o-"). */
export function novoIdPosicao(): string {
  sequencia += 1;
  const aleatorio = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `p-${sequencia}-${aleatorio}`;
}

/** A posição passa em validarPosicao no dia `hoje`? */
export function posicaoValida(p: Posicao, hoje: DataISO): boolean {
  try {
    validarPosicao(p, hoje);
    return true;
  } catch (e) {
    if (e instanceof OfertaInvalidaError) return false;
    throw e;
  }
}

/**
 * Posições salvas, até {@link LIMITE_POSICOES}; as inválidas em `hoje` (esquema ou validarPosicao) e os ids
 * repetidos são descartados um a um. Storage indisponível ou corrompido → lista vazia.
 */
export function lerPosicoes(arm: Armazenamento, hoje: DataISO): Posicao[] {
  try {
    const bruto = arm.getItem(CHAVE_POSICOES);
    if (bruto === null) return [];
    const lista: unknown = JSON.parse(bruto);
    if (!Array.isArray(lista)) return [];
    const ids = new Set<string>();
    return lista.slice(0, LIMITE_POSICOES).flatMap((item) => {
      const r = EsquemaPosicao.safeParse(item);
      if (!r.success || !posicaoValida(r.data, hoje) || ids.has(r.data.id)) return [];
      ids.add(r.data.id);
      return [r.data];
    });
  } catch {
    return [];
  }
}

/** Grava as posições; false se o storage recusar (cheio ou bloqueado). */
export function salvarPosicoes(arm: Armazenamento, posicoes: readonly Posicao[]): boolean {
  try {
    arm.setItem(CHAVE_POSICOES, JSON.stringify(posicoes));
    return true;
  } catch {
    return false;
  }
}

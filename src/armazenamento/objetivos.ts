// Objetivos salvos no localStorage (spec §9.1, design M4a). Só as ENTRADAS são guardadas: a
// sugestão em si é recalculada a cada visualização, contra o catálogo e a carteira atuais.
import { z } from '../zod';
import type { Armazenamento } from '../dados/cache';
import { DataIso } from './ofertas'; // reexportado por ofertas.ts; reaproveita a mesma validação de data

export const CHAVE_OBJETIVOS = 'rende:objetivos:v1';
export const LIMITE_OBJETIVOS = 20;
const LIMITE_TEXTO = 80;

const EsquemaEntradas = z.discriminatedUnion('tipo', [
  z.strictObject({ tipo: z.literal('RESERVA'), gastoMensal: z.number().positive(), rendaEstavel: z.boolean() }),
  z.strictObject({ tipo: z.literal('COM_DATA'), valorAlvo: z.number().positive(), data: DataIso }),
  z.strictObject({ tipo: z.literal('LONGO_PRAZO'), horizonteAnos: z.number().int().positive() }),
  z.strictObject({ tipo: z.literal('SEM_OBJETIVO'), horizonteAnos: z.number().int().positive() }),
  z.strictObject({ tipo: z.literal('RENDA_MENSAL'), principal: z.number().positive(), rendaMensalDesejada: z.number().positive() }),
]);

const EsquemaObjetivo = z.strictObject({
  id: z.string().min(1).max(LIMITE_TEXTO),
  nome: z.string().max(LIMITE_TEXTO).optional(),
  criadoEm: DataIso,
  entradas: EsquemaEntradas,
});

export type ObjetivoSalvo = z.infer<typeof EsquemaObjetivo>;

export function novoIdObjetivo(): string {
  return `obj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Objetivos salvos; os inválidos são descartados um a um. Storage indisponível ou corrompido → lista vazia. */
export function lerObjetivos(arm: Armazenamento): ObjetivoSalvo[] {
  try {
    const bruto = arm.getItem(CHAVE_OBJETIVOS);
    if (bruto === null) return [];
    const lista: unknown = JSON.parse(bruto);
    if (!Array.isArray(lista)) return [];
    return lista.slice(0, LIMITE_OBJETIVOS).flatMap((item) => {
      const r = EsquemaObjetivo.safeParse(item);
      return r.success ? [r.data] : [];
    });
  } catch {
    return [];
  }
}

/** true se gravou; false se o storage recusou (cheio ou bloqueado). */
export function salvarObjetivos(arm: Armazenamento, objetivos: readonly ObjetivoSalvo[]): boolean {
  try {
    arm.setItem(CHAVE_OBJETIVOS, JSON.stringify(objetivos));
    return true;
  } catch {
    return false;
  }
}

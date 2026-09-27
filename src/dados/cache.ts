// src/dados/cache.ts
import { z } from '../zod';

export interface Armazenamento { getItem(chave: string): string | null; setItem(chave: string, valor: string): void }

const PREFIXO = 'rende:cache:v1:';
const Envelope = z.object({ versao: z.literal(1), obtidoEm: z.number(), validoAte: z.number(), dados: z.unknown() });

export function lerCache<T>(arm: Armazenamento, chave: string, esquema: z.ZodType<T>, agoraMs: number):
  { dados: T; obtidoEm: number; vencido: boolean } | null {
  try {
    const bruto = arm.getItem(PREFIXO + chave);
    if (bruto === null) return null;
    const envelope = Envelope.safeParse(JSON.parse(bruto));
    if (!envelope.success) return null;
    const dados = esquema.safeParse(envelope.data.dados);
    if (!dados.success) return null;
    return { dados: dados.data, obtidoEm: envelope.data.obtidoEm, vencido: agoraMs >= envelope.data.validoAte };
  } catch {
    return null;
  }
}

export function gravarCache(arm: Armazenamento, chave: string, dados: unknown, obtidoEm: number, validoAte: number): void {
  try {
    arm.setItem(PREFIXO + chave, JSON.stringify({ versao: 1, obtidoEm, validoAte, dados }));
  } catch {
    // Storage cheio ou bloqueado: o app segue sem cache.
  }
}

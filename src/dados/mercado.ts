// src/dados/mercado.ts
import type { CandleFechamento } from '../engine/rendaVariavel';

/** Cópia deliberada de functions/_lib/mercado.ts (o bundle do cliente não importa functions/). */
const REGEX_TICKER = /^[A-Z]{4}[0-9]{1,2}$/;
export const validarTickerCliente = (t: string): boolean => REGEX_TICKER.test(t);

export type ErroMercado = 'SEM_SESSAO' | 'TICKER_INVALIDO' | 'INDISPONIVEL';
export type ResultadoHistorico = { ok: true; candles: CandleFechamento[] } | { ok: false; erro: ErroMercado };

export async function buscarHistorico(ticker: string, f: typeof fetch = fetch): Promise<ResultadoHistorico> {
  try {
    const resp = await f(`/api/mercado/historico?ticker=${encodeURIComponent(ticker)}`, { credentials: 'same-origin' });
    if (resp.status === 401) return { ok: false, erro: 'SEM_SESSAO' };
    if (resp.status === 400) return { ok: false, erro: 'TICKER_INVALIDO' };
    if (!resp.ok) return { ok: false, erro: 'INDISPONIVEL' };
    const corpo = await resp.json() as { candles?: { data?: unknown; fechamento?: unknown }[] };
    const candles = (corpo.candles ?? [])
      .filter((c): c is { data: string; fechamento: number } => typeof c.data === 'string' && typeof c.fechamento === 'number')
      .map((c) => ({ data: c.data, fechamento: c.fechamento }));
    return { ok: true, candles };
  } catch {
    return { ok: false, erro: 'INDISPONIVEL' };
  }
}

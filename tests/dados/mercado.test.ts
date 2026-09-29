import { describe, expect, it, vi } from 'vitest';
import { validarTicker } from '../../functions/_lib/mercado';
import { buscarHistorico, validarTickerCliente } from '../../src/dados/mercado';

describe('validarTickerCliente', () => {
  it('aceita e rejeita o mesmo que a Function (cópia deliberada não diverge)', () => {
    const exemplos = ['PETR4', 'HGLG11', 'petr4', 'PETR', 'PE4', 'PETR4; DROP TABLE', ''];
    for (const e of exemplos) expect(validarTickerCliente(e), e).toBe(validarTicker(e));
    expect(validarTickerCliente('PETR4')).toBe(true);
    expect(validarTickerCliente('petr4')).toBe(false);
  });
});

const resposta = (status: number, corpo: unknown = {}) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(corpo), { status })) as unknown as typeof fetch;

describe('buscarHistorico', () => {
  it('200: mapeia os candles para data + fechamento', async () => {
    const f = resposta(200, {
      ticker: 'PETR4',
      candles: [
        { data: '2026-09-01', fechamento: 30, volume: 10 },
        { data: '2026-09-02', fechamento: 31 },
        { data: 5, fechamento: 1 },
      ],
    });
    const r = await buscarHistorico('PETR4', f);
    expect(r).toEqual({ ok: true, candles: [{ data: '2026-09-01', fechamento: 30 }, { data: '2026-09-02', fechamento: 31 }] });
    expect(f).toHaveBeenCalledWith('/api/mercado/historico?ticker=PETR4', { credentials: 'same-origin' });
  });
  it('401 vira SEM_SESSAO', async () => {
    expect(await buscarHistorico('PETR4', resposta(401))).toEqual({ ok: false, erro: 'SEM_SESSAO' });
  });
  it('400 vira TICKER_INVALIDO', async () => {
    expect(await buscarHistorico('PETR4', resposta(400))).toEqual({ ok: false, erro: 'TICKER_INVALIDO' });
  });
  it('502 e 503 viram INDISPONIVEL', async () => {
    expect(await buscarHistorico('PETR4', resposta(502))).toEqual({ ok: false, erro: 'INDISPONIVEL' });
    expect(await buscarHistorico('PETR4', resposta(503))).toEqual({ ok: false, erro: 'INDISPONIVEL' });
  });
  it('fetch que lança vira INDISPONIVEL (nunca lança)', async () => {
    const f = vi.fn().mockRejectedValue(new Error('rede')) as unknown as typeof fetch;
    expect(await buscarHistorico('PETR4', f)).toEqual({ ok: false, erro: 'INDISPONIVEL' });
  });
});

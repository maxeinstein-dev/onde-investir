import { precisaAtualizarHistorico, validarTicker } from '../../../functions/_lib/mercado';

export interface Env {
  MERCADO_KV: KVNamespace;
  BRAPI_TOKEN: string;
}

interface Meta { desde: string; ate: string }
interface Candle { data: string; abertura: number; maxima: number; minima: number; fechamento: number; volume: number }

async function atualizarTicker(ticker: string, env: Env, hoje: string): Promise<void> {
  const meta = await env.MERCADO_KV.get<Meta>(`historico:${ticker}:meta`, 'json');
  if (!precisaAtualizarHistorico(meta?.ate ?? null, hoje)) return;

  const resp = await fetch(`https://brapi.dev/api/quote/${ticker}?range=3mo&interval=1d`, {
    headers: { Authorization: `Bearer ${env.BRAPI_TOKEN}` },
  });
  if (!resp.ok) return;
  const dados = await resp.json() as {
    results?: { historicalDataPrice?: { date: number; open: number; high: number; low: number; close: number; volume: number }[] }[];
  };
  const candles = dados.results?.[0]?.historicalDataPrice ?? [];
  let maiorData = meta?.ate ?? '';
  for (const c of candles) {
    const data = new Date(c.date * 1000).toISOString().slice(0, 10);
    const candle: Candle = { data, abertura: c.open, maxima: c.high, minima: c.low, fechamento: c.close, volume: c.volume };
    await env.MERCADO_KV.put(`historico:${ticker}:${data}`, JSON.stringify(candle));
    if (data > maiorData) maiorData = data;
  }
  const desde = meta?.desde ?? (candles[0] ? new Date(candles[0].date * 1000).toISOString().slice(0, 10) : hoje);
  await env.MERCADO_KV.put(`historico:${ticker}:meta`, JSON.stringify({ desde, ate: maiorData || hoje } satisfies Meta));
}

export default {
  async scheduled(_evento: ScheduledEvent, env: Env): Promise<void> {
    const hoje = new Date().toISOString().slice(0, 10);
    const conhecidos = (await env.MERCADO_KV.get<string[]>('tickers:conhecidos', 'json')) ?? [];
    for (const ticker of conhecidos) {
      if (!validarTicker(ticker)) continue; // defensivo: nunca deveria acontecer, mas não deixa um dado sujo travar o cron inteiro
      await atualizarTicker(ticker, env, hoje);
    }
  },
};

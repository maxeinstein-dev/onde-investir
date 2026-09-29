import { orcamentoDiario, precisaAtualizarHistorico, validarTicker } from '../../../functions/_lib/mercado';

export interface Env {
  MERCADO_KV: KVNamespace;
  BRAPI_TOKEN: string;
}

interface Meta { desde: string; ate: string }
interface Candle { data: string; abertura: number; maxima: number; minima: number; fechamento: number; volume: number }

const TETO_DIARIO = 400; // mesmo teto de functions/api/mercado/{cotacao,historico}.ts

function diaISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mesISO(d: Date): string {
  return d.toISOString().slice(0, 7);
}

function diasRestantesNoMes(d: Date): number {
  const ultimoDia = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return ultimoDia - d.getUTCDate() + 1;
}

/** Cota restante no dia. O cron disputa a MESMA cota das rotas HTTP — nunca chama a brapi acima do orçamento. */
async function orcamentoRestante(env: Env, agora: Date): Promise<{ restante: number; chaveMensal: string; chaveDiaria: string; usoMensal: number; usoDiario: number }> {
  const chaveMensal = `cota:mensal:${mesISO(agora)}`;
  const chaveDiaria = `cota:diario:${diaISO(agora)}`;
  const usoMensal = Number(await env.MERCADO_KV.get(chaveMensal)) || 0;
  const usoDiario = Number(await env.MERCADO_KV.get(chaveDiaria)) || 0;
  const orcamento = orcamentoDiario(usoMensal, diasRestantesNoMes(agora), TETO_DIARIO);
  return { restante: orcamento - usoDiario, chaveMensal, chaveDiaria, usoMensal, usoDiario };
}

async function atualizarTicker(ticker: string, env: Env, agora: Date): Promise<boolean> {
  const hoje = diaISO(agora);
  const meta = await env.MERCADO_KV.get<Meta>(`historico:${ticker}:meta`, 'json');
  if (!precisaAtualizarHistorico(meta?.ate ?? null, hoje)) return false;

  const cota = await orcamentoRestante(env, agora);
  if (cota.restante <= 0) return true; // sem cota: para a rodada, sem consumir nem marcar como feito

  const resp = await fetch(`https://brapi.dev/api/quote/${ticker}?range=3mo&interval=1d`, {
    headers: { Authorization: `Bearer ${env.BRAPI_TOKEN}` },
  });
  await env.MERCADO_KV.put(cota.chaveMensal, String(cota.usoMensal + 1));
  await env.MERCADO_KV.put(cota.chaveDiaria, String(cota.usoDiario + 1), { expirationTtl: 48 * 60 * 60 });
  if (!resp.ok) return false;

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
  return false;
}

export default {
  async scheduled(_evento: ScheduledEvent, env: Env): Promise<void> {
    const agora = new Date();
    const conhecidos = (await env.MERCADO_KV.get<string[]>('tickers:conhecidos', 'json')) ?? [];
    for (const ticker of conhecidos) {
      if (!validarTicker(ticker)) continue; // defensivo: nunca deveria acontecer, mas não deixa um dado sujo travar o cron inteiro
      const semCota = await atualizarTicker(ticker, env, agora);
      if (semCota) break; // orçamento do dia acabou: para a rodada, continua na próxima execução
    }
  },
};

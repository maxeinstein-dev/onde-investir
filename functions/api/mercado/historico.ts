// functions/api/mercado/historico.ts
import { orcamentoDiario, precisaAtualizarHistorico, validarTicker } from '../../_lib/mercado';
import { verificarSessao } from '../../_lib/sessao';

interface Ambiente {
  SESSION_HMAC_KEY: string;
  BRAPI_TOKEN: string;
  MERCADO_KV: KVNamespace;
}

interface Candle { data: string; abertura: number; maxima: number; minima: number; fechamento: number; volume: number }
interface Meta { desde: string; ate: string }

// Helpers copiados da Tarefa 4 (functions/api/mercado/cotacao.ts). Duplicados deliberadamente em
// vez de extraídos para um módulo compartilhado, conforme o plano permite (Tarefa 5, Passo 1).

function erro(status: number, corpo: Record<string, unknown>): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
}

function lerCookie(cabecalho: string | null): string | null {
  if (!cabecalho) return null;
  const encontrada = cabecalho.split(';').map((p) => p.trim()).find((p) => p.startsWith('sessao='));
  return encontrada ? encontrada.slice('sessao='.length) : null;
}

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

const TETO_DIARIO = 400; // heurística do app, sem fonte legal — ajustável.

export const onRequestGet: PagesFunction<Ambiente> = async (contexto) => {
  const cookie = lerCookie(contexto.request.headers.get('Cookie'));
  if (!cookie || !(await verificarSessao(cookie, contexto.env.SESSION_HMAC_KEY))) return erro(401, { erro: 'SEM_SESSAO' });

  const ticker = new URL(contexto.request.url).searchParams.get('ticker') ?? '';
  if (!validarTicker(ticker)) return erro(400, { erro: 'TICKER_INVALIDO' });

  const kv = contexto.env.MERCADO_KV;
  const agora = new Date();
  const hoje = diaISO(agora);
  const meta = await kv.get<Meta>(`historico:${ticker}:meta`, 'json');

  if (precisaAtualizarHistorico(meta?.ate ?? null, hoje)) {
    // Checagem de orçamento igual à Tarefa 4 (cotacao.ts). Diferente da cotação, histórico não tem
    // o conceito de "servir com desatualizado=true": o acumulado salvo nunca fica errado, só
    // atrasado, então se o orçamento já estourou simplesmente pulamos a atualização e servimos o
    // que já está salvo no KV.
    const chaveMensal = `cota:mensal:${mesISO(agora)}`;
    const chaveDiaria = `cota:diario:${diaISO(agora)}`;
    const usoMensal = Number(await kv.get(chaveMensal)) || 0;
    const usoDiario = Number(await kv.get(chaveDiaria)) || 0;
    const orcamento = orcamentoDiario(usoMensal, diasRestantesNoMes(agora), TETO_DIARIO);

    if (usoDiario < orcamento) {
      const resp = await fetch(`https://brapi.dev/api/quote/${ticker}?range=3mo&interval=1d`, {
        headers: { Authorization: `Bearer ${contexto.env.BRAPI_TOKEN}` },
      });
      if (resp.ok) {
        const dados = await resp.json() as { results?: { historicalDataPrice?: { date: number; open: number; high: number; low: number; close: number; volume: number }[] }[] };
        const candles = dados.results?.[0]?.historicalDataPrice ?? [];
        let maiorData = meta?.ate ?? '';
        for (const c of candles) {
          const data = new Date(c.date * 1000).toISOString().slice(0, 10);
          const candle: Candle = { data, abertura: c.open, maxima: c.high, minima: c.low, fechamento: c.close, volume: c.volume };
          await kv.put(`historico:${ticker}:${data}`, JSON.stringify(candle));
          if (data > maiorData) maiorData = data;
        }
        const novaMeta: Meta = { desde: meta?.desde ?? (candles[0] ? new Date(candles[0].date * 1000).toISOString().slice(0, 10) : hoje), ate: maiorData || hoje };
        await kv.put(`historico:${ticker}:meta`, JSON.stringify(novaMeta));

        const conhecidos = (await kv.get<string[]>('tickers:conhecidos', 'json')) ?? [];
        if (!conhecidos.includes(ticker)) await kv.put('tickers:conhecidos', JSON.stringify([...conhecidos, ticker]));

        await kv.put(chaveMensal, String(usoMensal + 1));
        await kv.put(chaveDiaria, String(usoDiario + 1), { expirationTtl: 48 * 60 * 60 });
      }
    }
    // Se usoDiario >= orcamento, não chamamos a brapi e seguimos direto para servir o que já
    // estiver salvo (metaFinal abaixo) — sem erro, já que histórico atrasado ainda é uma resposta
    // válida.
  }

  const metaFinal = await kv.get<Meta>(`historico:${ticker}:meta`, 'json');
  if (!metaFinal) return erro(502, { erro: 'BRAPI_INDISPONIVEL' });

  // Simplificação deliberada: varre dia a dia entre `desde` e `ate` fazendo uma leitura de KV por
  // dia (caro em requisições de KV pra históricos longos). Aceitável pro volume deste app (uso
  // pessoal, poucos tickers) — se o histórico crescer muito, trocar por uma lista serializada por
  // ticker é a melhoria óbvia, fora de escopo agora.
  const candles: Candle[] = [];
  for (let d = metaFinal.desde; d <= metaFinal.ate; ) {
    const c = await kv.get<Candle>(`historico:${ticker}:${d}`, 'json');
    if (c) candles.push(c);
    d = new Date(new Date(d).getTime() + 86400000).toISOString().slice(0, 10);
  }
  return new Response(JSON.stringify({ ticker, candles }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

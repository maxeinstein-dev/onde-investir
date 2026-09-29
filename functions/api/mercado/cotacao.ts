// functions/api/mercado/cotacao.ts
import { orcamentoDiario, segundosAteProximoBoundary, validarTicker } from '../../_lib/mercado';
import { verificarSessao } from '../../_lib/sessao';

interface Ambiente {
  SESSION_HMAC_KEY: string;
  BRAPI_TOKEN: string;
  MERCADO_KV: KVNamespace;
}

/**
 * `expiraEm`: quando este cache deixa de estar fresco (calculado uma vez, na escrita, a partir de
 * `segundosAteProximoBoundary`). Guardado no valor em vez de usar `expirationTtl` do KV: o KV
 * apagaria a chave sozinho ao vencer, e o design pede servir o cache MESMO VENCIDO quando a cota
 * estoura — só dá pra fazer isso se o cache continuar existindo depois de "vencido".
 */
interface Cotacao { preco: number; moeda: string; atualizadoEm: string; expiraEm: string; desatualizado?: true }

// Housekeeping: nada a ver com frescor (isso é `expiraEm`, checado em código) — só evita que o KV
// acumule pra sempre cotações de tickers abandonados.
const TTL_HOUSEKEEPING_SEGUNDOS = 30 * 24 * 60 * 60;

function erro(status: number, corpo: Record<string, unknown>): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
}

function ok(corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
  if (!cookie || !(await verificarSessao(cookie, contexto.env.SESSION_HMAC_KEY))) {
    return erro(401, { erro: 'SEM_SESSAO' });
  }

  const ticker = new URL(contexto.request.url).searchParams.get('ticker') ?? '';
  if (!validarTicker(ticker)) return erro(400, { erro: 'TICKER_INVALIDO' });

  const kv = contexto.env.MERCADO_KV;
  const chaveCache = `cotacao:${ticker}`;
  const cache = await kv.get<Cotacao>(chaveCache, 'json');

  const agora = new Date();
  const fresco = cache !== null && new Date(cache.expiraEm) > agora;

  // Caminho normal: cache ainda fresco, serve direto sem gastar cota.
  if (fresco) return ok(cache);

  const chaveMensal = `cota:mensal:${mesISO(agora)}`;
  const chaveDiaria = `cota:diario:${diaISO(agora)}`;
  const usoMensal = Number(await kv.get(chaveMensal)) || 0;
  const usoDiario = Number(await kv.get(chaveDiaria)) || 0;
  const orcamento = orcamentoDiario(usoMensal, diasRestantesNoMes(agora), TETO_DIARIO);

  if (usoDiario >= orcamento) {
    if (cache) return ok({ ...cache, desatualizado: true });
    return erro(503, { erro: 'COTA_ESGOTADA' });
  }

  const resp = await fetch(`https://brapi.dev/api/quote/${ticker}`, {
    headers: { Authorization: `Bearer ${contexto.env.BRAPI_TOKEN}` },
  });
  if (!resp.ok) {
    if (cache) return ok({ ...cache, desatualizado: true });
    return erro(502, { erro: 'BRAPI_INDISPONIVEL' });
  }
  const dados = await resp.json() as { results?: { regularMarketPrice?: number; currency?: string }[] };
  const r = dados.results?.[0];
  if (!r || typeof r.regularMarketPrice !== 'number') {
    if (cache) return ok({ ...cache, desatualizado: true });
    return erro(502, { erro: 'BRAPI_INDISPONIVEL' });
  }

  const cotacao: Cotacao = {
    preco: r.regularMarketPrice, moeda: r.currency ?? 'BRL', atualizadoEm: agora.toISOString(),
    expiraEm: new Date(agora.getTime() + segundosAteProximoBoundary(agora) * 1000).toISOString(),
  };
  await kv.put(chaveCache, JSON.stringify(cotacao), { expirationTtl: TTL_HOUSEKEEPING_SEGUNDOS });
  await kv.put(chaveMensal, String(usoMensal + 1));
  await kv.put(chaveDiaria, String(usoDiario + 1), { expirationTtl: 48 * 60 * 60 });

  return ok(cotacao);
};

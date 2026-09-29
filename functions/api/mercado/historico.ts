// functions/api/mercado/historico.ts
// A lógica (KV, cota, brapi) fica em functions/_lib/historico.ts, testável sem os tipos do Cloudflare; aqui só
// a sessão e a montagem da Response.
import { type KvLike, resolverHistorico } from '../../_lib/historico';
import { validarTicker } from '../../_lib/mercado';
import { verificarSessao } from '../../_lib/sessao';

interface Ambiente {
  SESSION_HMAC_KEY: string;
  BRAPI_TOKEN: string;
  MERCADO_KV: KVNamespace;
}

function resposta(status: number, corpo: Record<string, unknown>): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
}

function lerCookie(cabecalho: string | null): string | null {
  if (!cabecalho) return null;
  const encontrada = cabecalho.split(';').map((p) => p.trim()).find((p) => p.startsWith('sessao='));
  return encontrada ? encontrada.slice('sessao='.length) : null;
}

export const onRequestGet: PagesFunction<Ambiente> = async (contexto) => {
  try {
    return await tratar(contexto);
  } catch (erroInesperado) {
    // Exceção fora da lógica do histórico (sessão, variável de ambiente ausente...): JSON com o motivo, em vez da
    // página HTML de erro da Cloudflare, que não diz nada.
    const detalhe = `${erroInesperado instanceof Error ? erroInesperado.name : 'Erro'}: ${erroInesperado instanceof Error ? erroInesperado.message : String(erroInesperado)}`.slice(0, 200);
    console.warn(JSON.stringify({ evento: 'excecao', detalhe }));
    return resposta(500, { erro: 'FALHA_INTERNA', detalhe });
  }
};

async function tratar(contexto: Parameters<PagesFunction<Ambiente>>[0]): Promise<Response> {
  const cookie = lerCookie(contexto.request.headers.get('Cookie'));
  if (!cookie || !(await verificarSessao(cookie, contexto.env.SESSION_HMAC_KEY))) return resposta(401, { erro: 'SEM_SESSAO' });

  const ticker = new URL(contexto.request.url).searchParams.get('ticker') ?? '';
  if (!validarTicker(ticker)) return resposta(400, { erro: 'TICKER_INVALIDO' });

  const saida = await resolverHistorico({
    ticker,
    kv: contexto.env.MERCADO_KV as unknown as KvLike,
    agora: new Date(),
    buscar: (t) => fetch(`https://brapi.dev/api/quote/${t}?range=3mo&interval=1d`, {
      headers: { Authorization: `Bearer ${contexto.env.BRAPI_TOKEN}` },
    }),
    // Só ticker e status vão pro log (Cloudflare Logs / wrangler tail): nunca o token nem cabeçalhos.
    registrar: (e) => console.warn(JSON.stringify(e)),
  });
  return resposta(saida.status, saida.corpo);
}

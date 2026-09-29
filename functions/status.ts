// functions/status.ts
interface Ambiente { MERCADO_KV: KVNamespace }

function diaISO(d: Date): string { return d.toISOString().slice(0, 10); }
function mesISO(d: Date): string { return d.toISOString().slice(0, 7); }

export const onRequestGet: PagesFunction<Ambiente> = async (contexto) => {
  const kv = contexto.env.MERCADO_KV;
  const agora = new Date();
  const usoMensal = Number(await kv.get(`cota:mensal:${mesISO(agora)}`)) || 0;
  const usoDiario = Number(await kv.get(`cota:diario:${diaISO(agora)}`)) || 0;
  const conhecidos = (await kv.get<string[]>('tickers:conhecidos', 'json')) ?? [];

  return new Response(JSON.stringify({
    usoMensal, usoDiario, tickersComHistorico: conhecidos.length, geradoEm: agora.toISOString(),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

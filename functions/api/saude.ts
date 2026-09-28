// functions/api/saude.ts
import { verificarSessao } from '../_lib/sessao';

interface Ambiente {
  SESSION_HMAC_KEY: string;
}

function lerCookie(cabecalho: string | null, nome: string): string | null {
  if (!cabecalho) return null;
  const partes = cabecalho.split(';').map((parte) => parte.trim());
  const encontrada = partes.find((parte) => parte.startsWith(`${nome}=`));
  return encontrada ? encontrada.slice(nome.length + 1) : null;
}

export const onRequestGet: PagesFunction<Ambiente> = async (contexto) => {
  const cookie = lerCookie(contexto.request.headers.get('Cookie'), 'sessao');
  const valida = cookie !== null && (await verificarSessao(cookie, contexto.env.SESSION_HMAC_KEY));

  if (!valida) {
    return new Response(JSON.stringify({ erro: 'SEM_SESSAO' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

// functions/api/sessao.ts
import { assinarSessao } from '../_lib/sessao';

interface Ambiente {
  TURNSTILE_SECRET_KEY: string;
  SESSION_HMAC_KEY: string;
}

const VALIDADE_SESSAO_SEGUNDOS = 24 * 60 * 60;
const URL_SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function respostaErro(status: number, erro: string): Response {
  return new Response(JSON.stringify({ erro }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestPost: PagesFunction<Ambiente> = async (contexto) => {
  let corpo: unknown;
  try {
    corpo = await contexto.request.json();
  } catch {
    return respostaErro(400, 'REQUISICAO_INVALIDA');
  }

  const token = typeof corpo === 'object' && corpo !== null && 'token' in corpo ? (corpo as { token: unknown }).token : undefined;
  if (typeof token !== 'string' || token.length === 0) {
    return respostaErro(400, 'REQUISICAO_INVALIDA');
  }

  let resultado: { success: boolean };
  try {
    const respostaVerificacao = await fetch(URL_SITEVERIFY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: contexto.env.TURNSTILE_SECRET_KEY, response: token }),
    });

    if (!respostaVerificacao.ok) {
      return respostaErro(503, 'TURNSTILE_INDISPONIVEL');
    }

    resultado = (await respostaVerificacao.json()) as { success: boolean };
  } catch {
    return respostaErro(503, 'TURNSTILE_INDISPONIVEL');
  }

  if (resultado.success !== true) {
    return respostaErro(403, 'TURNSTILE_INVALIDO');
  }

  const cookie = await assinarSessao(contexto.env.SESSION_HMAC_KEY, VALIDADE_SESSAO_SEGUNDOS);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `sessao=${cookie}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=${VALIDADE_SESSAO_SEGUNDOS}`,
    },
  });
};

// src/dados/turnstile.ts
const SITE_KEY_TESTE = '1x00000000000000000000BB'; // Cloudflare: invisível, sempre passa
const URL_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TIMEOUT_PADRAO_MS = 15000;

interface TurnstileApi {
  render(el: HTMLElement, opts: { sitekey: string; callback: (t: string) => void; 'error-callback': () => void; size?: string }): string;
  remove(id: string): void;
}
declare global { interface Window { turnstile?: TurnstileApi } }

export type ResultadoSessao = { ok: true } | { ok: false; erro: 'TURNSTILE_INVALIDO' | 'TURNSTILE_INDISPONIVEL' };

function siteKey(): string {
  return import.meta.env.VITE_TURNSTILE_SITE_KEY || SITE_KEY_TESTE;
}

function carregarScript(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = URL_SCRIPT;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('sem turnstile')));
    s.onerror = () => reject(new Error('script'));
    document.head.appendChild(s);
  });
}

function comTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const limite = new Promise<T>((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), ms); });
  return Promise.race([p, limite]).finally(() => clearTimeout(timer));
}

/** Resolve o desafio invisível e troca o token por cookie de sessão (POST /api/sessao). Nunca lança. */
export async function obterSessao(
  container: HTMLElement,
  f: typeof fetch = fetch,
  timeoutMs: number = TIMEOUT_PADRAO_MS,
): Promise<ResultadoSessao> {
  let token: string;
  try {
    const api = await comTimeout(carregarScript(), timeoutMs);
    token = await comTimeout(new Promise<string>((resolve, reject) => {
      api.render(container, { sitekey: siteKey(), callback: resolve, 'error-callback': () => reject(new Error('desafio')) });
    }), timeoutMs);
  } catch {
    return { ok: false, erro: 'TURNSTILE_INDISPONIVEL' };
  }
  try {
    const resp = await f('/api/sessao', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
    });
    if (resp.ok) return { ok: true };
    if (resp.status === 403) return { ok: false, erro: 'TURNSTILE_INVALIDO' };
    return { ok: false, erro: 'TURNSTILE_INDISPONIVEL' };
  } catch {
    return { ok: false, erro: 'TURNSTILE_INDISPONIVEL' };
  }
}

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { obterSessao } from '../../src/dados/turnstile';

const resposta = (status: number) => vi.fn().mockResolvedValue(new Response('{}', { status })) as unknown as typeof fetch;

function turnstileFalso(token = 'tok') {
  window.turnstile = {
    render: (_el, opts) => { queueMicrotask(() => opts.callback(token)); return 'w1'; },
    remove: () => {},
  };
}

afterEach(() => { delete window.turnstile; vi.restoreAllMocks(); });

describe('obterSessao', () => {
  it('200: sessão criada, e o token vai no corpo do POST', async () => {
    turnstileFalso('abc');
    const f = resposta(200);
    expect(await obterSessao(document.createElement('div'), f)).toEqual({ ok: true });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('/api/sessao');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ token: 'abc' });
  });
  it('remove o widget depois do desafio, com sucesso ou não', async () => {
    const remove = vi.fn();
    window.turnstile = { render: (_el, opts) => { queueMicrotask(() => opts.callback('t')); return 'w9'; }, remove };
    await obterSessao(document.createElement('div'), resposta(200));
    expect(remove).toHaveBeenCalledWith('w9');
    remove.mockClear();
    window.turnstile = { render: (_el, opts) => { queueMicrotask(opts['error-callback']); return 'w8'; }, remove };
    await obterSessao(document.createElement('div'), resposta(200));
    expect(remove).toHaveBeenCalledWith('w8');
  });
  it('403 vira TURNSTILE_INVALIDO', async () => {
    turnstileFalso();
    expect(await obterSessao(document.createElement('div'), resposta(403))).toEqual({ ok: false, erro: 'TURNSTILE_INVALIDO' });
  });
  it('503 vira TURNSTILE_INDISPONIVEL', async () => {
    turnstileFalso();
    expect(await obterSessao(document.createElement('div'), resposta(503))).toEqual({ ok: false, erro: 'TURNSTILE_INDISPONIVEL' });
  });
  it('fetch que lança vira TURNSTILE_INDISPONIVEL', async () => {
    turnstileFalso();
    const f = vi.fn().mockRejectedValue(new Error('rede')) as unknown as typeof fetch;
    expect(await obterSessao(document.createElement('div'), f)).toEqual({ ok: false, erro: 'TURNSTILE_INDISPONIVEL' });
  });
  it('desafio que nunca responde: estoura o tempo sem travar', async () => {
    window.turnstile = { render: () => 'w1', remove: () => {} };
    expect(await obterSessao(document.createElement('div'), resposta(200), 20)).toEqual({ ok: false, erro: 'TURNSTILE_INDISPONIVEL' });
  });
  it('error-callback do widget vira TURNSTILE_INDISPONIVEL', async () => {
    window.turnstile = { render: (_el, opts) => { queueMicrotask(opts['error-callback']); return 'w1'; }, remove: () => {} };
    expect(await obterSessao(document.createElement('div'), resposta(200))).toEqual({ ok: false, erro: 'TURNSTILE_INDISPONIVEL' });
  });
});

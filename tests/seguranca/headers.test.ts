import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { urlCalendarioCopom, urlFocusAnuais, urlFocusIpcaMensal, urlFocusSelic, urlSgsAno, urlSgsUltimos } from '../../src/dados/bcb';

const headers = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf-8');
const csp = /Content-Security-Policy:\s*(.+)/.exec(headers)?.[1] ?? '';
const diretiva = (nome: string) => csp.split(';').map((d) => d.trim().split(/\s+/)).find(([n]) => n === nome)?.slice(1) ?? [];

describe('CSP em public/_headers', () => {
  it('connect-src libera só o próprio domínio e as APIs do Banco Central', () => {
    expect(diretiva('connect-src')).toEqual(['\'self\'', 'https://api.bcb.gov.br', 'https://olinda.bcb.gov.br', 'https://www.bcb.gov.br', 'https://challenges.cloudflare.com']);
  });
  it('toda URL que o app busca tem a origem liberada', () => {
    const urls = [urlSgsUltimos(432, 1), urlSgsAno(12, 2025), urlFocusSelic(), urlFocusIpcaMensal(), urlFocusAnuais(), urlCalendarioCopom('2026-01-01', '2028-12-31')];
    for (const url of urls) expect(diretiva('connect-src'), url).toContain(new URL(url).origin);
  });
  it('o resto continua restrito', () => {
    expect(diretiva('default-src')).toEqual(['\'self\'']);
    expect(diretiva('script-src')).toEqual(['\'self\'', 'https://challenges.cloudflare.com']);
    expect(diretiva('font-src')).toEqual(['\'self\'']); // a fonte é do próprio domínio; nada de data: nem CDN
    expect(diretiva('style-src')).toEqual(['\'self\'']);
    expect(diretiva('frame-src')).toEqual(['https://challenges.cloudflare.com']); // iframe do widget do Turnstile
    expect(diretiva('frame-ancestors')).toEqual(['\'none\'']);
  });
});

// tests/functions/sessao.test.ts
import { describe, expect, it } from 'vitest';
import { assinarSessao, verificarSessao } from '../../functions/_lib/sessao';

const CHAVE = 'chave-de-teste-para-hmac-nao-usar-em-producao';
const OUTRA_CHAVE = 'outra-chave-completamente-diferente';

describe('assinarSessao / verificarSessao', () => {
  it('gera um cookie que a própria função reconhece como válido', async () => {
    const cookie = await assinarSessao(CHAVE, 1_000_000);
    expect(await verificarSessao(cookie, CHAVE, 999_000)).toBe(true);
  });

  it('rejeita cookie expirado', async () => {
    const cookie = await assinarSessao(CHAVE, 1_000_000, 0);
    expect(await verificarSessao(cookie, CHAVE, 1_000_001)).toBe(false);
  });

  it('rejeita cookie adulterado (assinatura não bate)', async () => {
    const cookie = await assinarSessao(CHAVE, 1_000_000);
    const adulterado = `${cookie.split('.')[0]}.assinaturaFalsa`;
    expect(await verificarSessao(adulterado, CHAVE, 999_000)).toBe(false);
  });

  it('rejeita cookie mal formado (sem ponto)', async () => {
    expect(await verificarSessao('textosolto', CHAVE, 999_000)).toBe(false);
  });

  it('rejeita cookie mal formado (texto vazio)', async () => {
    expect(await verificarSessao('', CHAVE, 999_000)).toBe(false);
  });

  it('rejeita quando a validade não é um número', async () => {
    expect(await verificarSessao('abc.assinatura', CHAVE, 999_000)).toBe(false);
  });

  it('rejeita quando a chave usada na verificação é diferente da chave de assinatura', async () => {
    const cookie = await assinarSessao(CHAVE, 1_000_000);
    expect(await verificarSessao(cookie, OUTRA_CHAVE, 999_000)).toBe(false);
  });
});

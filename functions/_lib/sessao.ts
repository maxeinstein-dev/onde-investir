// functions/_lib/sessao.ts

/**
 * Cookie de sessão sem dado pessoal: só prova que o navegador passou pelo
 * Turnstile. Formato: `<validade-unix>.<assinatura-hmac-base64url>`.
 */

function paraBase64Url(bytes: ArrayBuffer): string {
  const binario = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importarChave(chaveSecreta: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(chaveSecreta),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function assinar(validadeUnix: number, chaveSecreta: string): Promise<string> {
  const chave = await importarChave(chaveSecreta);
  const assinatura = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(String(validadeUnix)));
  return paraBase64Url(assinatura);
}

/** Gera o valor do cookie, válido a partir de agora até `agoraUnix + validadeSegundos`. */
export async function assinarSessao(
  chaveSecreta: string,
  validadeSegundos: number,
  agoraUnix: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const validadeUnix = agoraUnix + validadeSegundos;
  const assinatura = await assinar(validadeUnix, chaveSecreta);
  return `${validadeUnix}.${assinatura}`;
}

/** Confere formato, validade e assinatura. Nunca lança — sempre retorna booleano. */
export async function verificarSessao(
  cookie: string,
  chaveSecreta: string,
  agoraUnix: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const partes = cookie.split('.');
  if (partes.length !== 2) return false;

  const [validadeTexto, assinaturaRecebida] = partes;
  const validadeUnix = Number(validadeTexto);
  if (!Number.isFinite(validadeUnix)) return false;
  if (validadeUnix < agoraUnix) return false;

  const assinaturaEsperada = await assinar(validadeUnix, chaveSecreta);
  return assinaturaEsperada === assinaturaRecebida;
}

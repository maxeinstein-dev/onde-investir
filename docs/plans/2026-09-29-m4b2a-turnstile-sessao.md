# M4b2a: Turnstile e cookie de sessão — Plano de Implementação

> **Para o Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` para executar este plano tarefa por tarefa.

**Objetivo:** Construir o portão de acesso a `/api/*` — Cloudflare Pages Functions que verificam
um token do Turnstile e emitem um cookie de sessão assinado (24h), sem qualquer dado pessoal.

**Arquitetura:** `functions/_lib/sessao.ts` contém lógica pura (assinar/verificar o cookie via Web
Crypto `HMAC-SHA256`), testável em Vitest normal porque Web Crypto é idêntico no Node 24 e no
runtime da Cloudflare. `functions/api/sessao.ts` (POST) chama o `siteverify` do Turnstile e emite
o cookie; `functions/api/saude.ts` (GET) é o endpoint mínimo protegido que prova que o portão
funciona. Uma rodada manual com `wrangler pages dev` + `curl` valida as duas rotas de ponta a
ponta, usando os pares de chave de teste documentados pela Cloudflare.

**Tech Stack:** TypeScript, Cloudflare Pages Functions, Web Crypto API (`crypto.subtle`), Vitest,
`wrangler` via `npx` (sem instalar como dependência).

**Design de referência:** `docs/superpowers/specs/2026-09-29-m4b2a-turnstile-sessao-design.md`

---

## Convenções desta feature

- Cookie: `<validade-unix>.<assinatura-base64url>`. `validade-unix` é o timestamp Unix (segundos)
  em que o cookie expira. `assinatura` é `HMAC-SHA256(SESSION_HMAC_KEY, validade-unix)` em
  base64url (sem padding `=`).
- Erros tipados: `{ erro: 'SEM_SESSAO' }` (401), `{ erro: 'TURNSTILE_INVALIDO' }` (403),
  `{ erro: 'REQUISICAO_INVALIDA' }` (400), `{ erro: 'TURNSTILE_INDISPONIVEL' }` (503).
- Chaves de teste do Turnstile (documentadas pela Cloudflare, nunca inventadas):
  - Sitekey de teste (invisível, sempre passa): `1x00000000000000000000BB`
  - Secret key de teste pareada (sempre passa): `1x0000000000000000000000000000000AA`
  - Secret key de teste (sempre falha, para o caso negativo): `2x0000000000000000000000000000000AA`
  - Regra crítica: sitekey de teste gera token dummy que só é aceito por secret key de teste — nunca
    misturar com chaves de produção.

---

## Tarefa 1: Lógica pura do cookie de sessão

**Arquivos:**
- Criar: `functions/_lib/sessao.ts`
- Teste: `tests/functions/sessao.test.ts`

**Passo 1: Escrever o teste que falha**

```ts
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
    const cookie = await assinarSessao(CHAVE, 1_000_000);
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
```

**Passo 2: Rodar e confirmar que falha**

Rodar: `npx vitest run tests/functions/sessao.test.ts`
Esperado: FALHA — `Cannot find module '../../functions/_lib/sessao'`.

**Passo 3: Escrever a implementação mínima**

```ts
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
```

**Passo 4: Rodar e confirmar que passa**

Rodar: `npx vitest run tests/functions/sessao.test.ts`
Esperado: PASS — 7 testes.

**Passo 5: Commit**

```bash
git add functions/_lib/sessao.ts tests/functions/sessao.test.ts
git commit -m "feat(sessao): logica pura de assinatura e verificacao do cookie de sessao"
```

---

## Tarefa 2: Rota `POST /api/sessao`

**Arquivos:**
- Criar: `functions/api/sessao.ts`

Esta rota não tem teste automatizado próprio (depende do `siteverify` da Cloudflare, uma chamada de
rede externa) — é coberta pelo smoke test manual da Tarefa 4, conforme o design (seção 4).

**Passo 1: Implementar a rota**

```ts
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

  let respostaVerificacao: Response;
  try {
    respostaVerificacao = await fetch(URL_SITEVERIFY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: contexto.env.TURNSTILE_SECRET_KEY, response: token }),
    });
  } catch {
    return respostaErro(503, 'TURNSTILE_INDISPONIVEL');
  }

  if (!respostaVerificacao.ok) {
    return respostaErro(503, 'TURNSTILE_INDISPONIVEL');
  }

  const resultado = (await respostaVerificacao.json()) as { success: boolean };
  if (!resultado.success) {
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
```

**Passo 2: Typecheck**

Rodar: `npx tsc --noEmit -p functions/tsconfig.json` (criado na Tarefa 3 — se rodar antes, veja a
Tarefa 3 primeiro).

**Passo 3: Commit**

```bash
git add functions/api/sessao.ts
git commit -m "feat(sessao): rota POST /api/sessao que verifica o Turnstile e emite o cookie"
```

---

## Tarefa 3: Rota `GET /api/saude` e tipos das Functions

**Arquivos:**
- Criar: `functions/api/saude.ts`
- Criar: `functions/tsconfig.json`
- Modificar: `package.json` (devDependency `@cloudflare/workers-types`)

**Passo 1: Instalar os tipos das Functions**

```bash
npm install --save-dev @cloudflare/workers-types
```

**Passo 2: Criar o tsconfig das Functions**

`functions/tsconfig.json` isola os tipos de Workers (`PagesFunction`, `Response`, `crypto.subtle`
global) do resto do app, que usa `lib: DOM` do navegador — os dois nunca são type-checados juntos.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["**/*.ts"]
}
```

**Passo 3: Implementar a rota de saúde**

```ts
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
```

**Passo 4: Typecheck**

Rodar: `npx tsc --noEmit -p functions/tsconfig.json`
Esperado: sem erros.

Rodar também o typecheck do app principal para confirmar que nada quebrou: `npm run typecheck`
(ou o script equivalente do `package.json`).

**Passo 5: Commit**

```bash
git add functions/api/saude.ts functions/tsconfig.json package.json package-lock.json
git commit -m "feat(sessao): rota GET /api/saude protegida e tipos das Pages Functions"
```

---

## Tarefa 4: CSP, segredos de exemplo e smoke test manual

**Arquivos:**
- Modificar: `public/_headers`
- Modificar: `.env.example`
- Criar: `scripts/testar-sessao.sh`

**Passo 1: Atualizar a CSP**

Em `public/_headers`, adicionar `https://challenges.cloudflare.com` ao `script-src`:

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://api.bcb.gov.br https://olinda.bcb.gov.br https://www.bcb.gov.br https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

(o `connect-src` também precisa do domínio, pois o widget do Turnstile faz sua própria chamada de
rede ao resolver o desafio — sem isso o desafio falha silenciosamente no navegador).

Adicionar um comentário no topo do arquivo — se `public/_headers` ainda não tiver nenhum — ou logo
acima da linha, explicando: `# challenges.cloudflare.com: widget do Turnstile (M4b2a)`.

**Passo 2: Documentar os novos segredos**

Em `.env.example`, adicionar (junto ao `BRAPI_TOKEN` já existente):

```
# Cloudflare Pages secret em produção; localmente vai em .dev.vars (não commitado)
TURNSTILE_SECRET_KEY=
# Cloudflare Pages secret em produção; localmente vai em .dev.vars (não commitado)
SESSION_HMAC_KEY=
```

**Passo 3: Escrever o script de smoke test**

```bash
#!/usr/bin/env bash
# scripts/testar-sessao.sh
#
# Smoke test manual de functions/api/sessao.ts e functions/api/saude.ts.
# Roda uma vez, à mão, contra `wrangler pages dev` — não faz parte da suíte
# automatizada (a suíte cobre a lógica pura em tests/functions/sessao.test.ts).
#
# Pré-requisito: `wrangler pages dev` rodando em outro terminal:
#   npx wrangler pages dev dist --port 8788
# com um .dev.vars assim (chaves de teste da Cloudflare, nunca as de produção):
#   TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
#   SESSION_HMAC_KEY=qualquer-texto-para-teste-local
#
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8788}"
TOKEN_TESTE_SEMPRE_PASSA="XXXX.DUMMY.TOKEN.XXXX"

echo "1) GET /api/saude sem cookie -> espera 401"
curl -s -o /dev/stderr -w "\nstatus: %{http_code}\n" "$BASE_URL/api/saude"

echo
echo "2) POST /api/sessao com token de teste (sempre passa) -> espera 200 + Set-Cookie"
RESPOSTA=$(curl -s -i -X POST "$BASE_URL/api/sessao" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN_TESTE_SEMPRE_PASSA\"}")
echo "$RESPOSTA"

COOKIE=$(echo "$RESPOSTA" | grep -i '^set-cookie:' | sed -E 's/set-cookie: ?(sessao=[^;]+);.*/\1/I' | tr -d '\r')
if [ -z "$COOKIE" ]; then
  echo "Nao recebi Set-Cookie. Confira o .dev.vars (TURNSTILE_SECRET_KEY deve ser a secret key de teste pareada com o token acima)." >&2
  exit 1
fi

echo
echo "3) GET /api/saude com o cookie recebido -> espera 200"
curl -s -o /dev/stderr -w "\nstatus: %{http_code}\n" "$BASE_URL/api/saude" -H "Cookie: $COOKIE"
```

**Passo 4: Rodar o smoke test (uma vez, manualmente)**

Em um terminal:
```bash
npm run build
```
Depois, num segundo terminal, criar `.dev.vars` local (gitignored) com:
```
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
SESSION_HMAC_KEY=qualquer-texto-para-teste-local
```
e rodar:
```bash
npx wrangler pages dev dist --port 8788
```
Em um terceiro terminal:
```bash
chmod +x scripts/testar-sessao.sh
./scripts/testar-sessao.sh
```
Esperado: passo 1 → `status: 401`; passo 2 → `status: 200` com um cabeçalho `set-cookie: sessao=...`;
passo 3 → `status: 200`.

Confirmar o caso negativo trocando `TURNSTILE_SECRET_KEY` no `.dev.vars` para
`2x0000000000000000000000000000000AA` (secret de teste que sempre falha), reiniciando o
`wrangler pages dev` e rodando de novo só o passo 2 do script — esperado `status: 403` e nenhum
`Set-Cookie`.

**Passo 5: Commit**

```bash
git add public/_headers .env.example scripts/testar-sessao.sh
git commit -m "feat(sessao): CSP do Turnstile, segredos de exemplo e smoke test manual"
```

---

## Tarefa 5: Revisão final e PR

Sem código novo — checklist de fechamento do marco, igual aos anteriores.

**Passo 1:** Rodar a suíte inteira, typecheck e lint:
```bash
npm test
npm run typecheck
npx tsc --noEmit -p functions/tsconfig.json
npm run lint
```

**Passo 2:** Revisão de código final (dispatch de subagent `code-reviewer` cobrindo todo o branch
`m4b2a` desde que divergiu de `main`), cobrindo especificamente:
- nenhum segredo (`TURNSTILE_SECRET_KEY`, `SESSION_HMAC_KEY`) hardcoded ou logado;
- `verificarSessao` nunca lança, sempre retorna booleano, mesmo com entrada arbitrária;
- os 4 códigos de erro tipados batem exatamente com o design (seção 3);
- CSP: `script-src` e `connect-src` ganharam `https://challenges.cloudflare.com` e nada mais foi
  afrouxado.

**Passo 3:** Revisão editorial — não se aplica (M4b2a não introduz texto voltado ao usuário final;
as mensagens de erro são códigos técnicos consumidos pelo M4b2c, não prosa).

**Passo 4:** Push e PR:
```bash
git push -u origin m4b2a
gh pr create --title "M4b2a: Turnstile e cookie de sessão" --body "..."
```
Em seguida, `mcp__ccd_pr__set_monitor` com `auto_fix: true` (padrão do usuário para todos os PRs).

**Passo 5:** Documentar para o usuário, fora do PR, o passo a passo de deploy (fica pendente até o
PR ser aprovado e mergeado): criar o widget Turnstile em modo **Invisível** no painel da
Cloudflare, cadastrar `TURNSTILE_SECRET_KEY` e `SESSION_HMAC_KEY` como secrets do Pages, e anotar
que o modo Invisível exige uma menção ao Turnstile na política de privacidade — o app ainda não tem
uma página de política de privacidade formal, então isso é uma decisão em aberto a levantar com o
usuário antes de o M4b2c ativar o widget de verdade.

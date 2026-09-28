# M4b2a: Turnstile e cookie de sessão — Design

- **Data:** 2026-09-29
- **Status:** aprovado, pronto para o plano de implementação
- **Relação com a spec principal:** detalha a parte de segurança da seção 8.2 de
  `docs/superpowers/specs/2026-09-27-onde-investir-design.md` ("Proteção sem login"),
  item 1 (Turnstile + cookie). Os itens 2 a 5 (limite por IP, rate limiting da
  Cloudflare, allowlist de endpoints, orçamento de cota) ficam para o **M4b2b**, que
  também traz o proxy da brapi de verdade e o KV. O **M4b2c** traz o cálculo e a tela.

## 1. Objetivo

Construir o portão de acesso a `/api/*`: um desafio Turnstile invisível, resolvido uma
vez, que gera um cookie assinado válido por 24h. Sem esse cookie, `/api/*` devolve 401.
As calculadoras de renda fixa nunca passam por esse portão — elas continuam chamando o
Banco Central direto do navegador, como hoje.

### Fora do escopo (M4b2a)

- Qualquer chamada à brapi.dev (fica para M4b2b).
- Limite por IP, rate limiting da Cloudflare, orçamento de cota, Workers KV (M4b2b).
- A tela que dispara o desafio Turnstile e o cálculo em si (M4b2c).

## 2. Arquitetura

**Cloudflare Pages Functions**, em `functions/`:

```
functions/
├── _lib/
│   └── sessao.ts     ← lógica pura: assinar e verificar o cookie (Web Crypto API)
└── api/
    ├── sessao.ts     ← POST: verifica o Turnstile, devolve o cookie
    └── saude.ts       ← GET: endpoint mínimo protegido, prova que o portão funciona
```

`functions/_lib/` começa com `_`, que a Cloudflare Pages ignora para fins de
roteamento — é só código compartilhado, importado pelas rotas.

**Cookie de sessão:** `<validade-unix>.<assinatura>`, onde a assinatura é
HMAC-SHA256(`SESSION_HMAC_KEY`, validade), em base64url. Sem dado pessoal — o app não
tem login, o cookie só prova "este navegador passou pelo Turnstile", com validade de
24h. Atributos: `HttpOnly; Secure; SameSite=Strict; Path=/api`.

**CSP:** `public/_headers` ganha `https://challenges.cloudflare.com` em `script-src`
(necessário para o Turnstile rodar no navegador). Documentado com um comentário
explicando o motivo; nada mais é afrouxado.

**Segredos novos:**
- `TURNSTILE_SECRET_KEY` e `SESSION_HMAC_KEY`, como secrets do Cloudflare Pages em
  produção, e em `.dev.vars` localmente (já no `.gitignore` desde o M1).
- A *site key* do Turnstile é **pública** (vai no HTML/JS do front, não é secreta) —
  entra como variável de build, não como secret.

## 3. Fluxo

1. Sem cookie válido, qualquer chamada a `/api/*` devolve **401** com corpo tipado:
   `{ erro: 'SEM_SESSAO' }`.
2. O cliente resolve o desafio Turnstile invisível (carregado só na tela de renda
   variável, que é do M4b2c) e recebe um token.
3. `POST /api/sessao` com `{ token }`. A Function chama o `siteverify` da Cloudflare
   (`https://challenges.cloudflare.com/turnstile/v0/siteverify`) com o
   `TURNSTILE_SECRET_KEY` e o token.
   - Válido → `200` com `Set-Cookie` (24h).
   - Inválido → `403` com `{ erro: 'TURNSTILE_INVALIDO' }`.
   - Corpo malformado (sem `token`, JSON inválido) → `400` com `{ erro: 'REQUISICAO_INVALIDA' }`.
   - Falha de rede ao chamar o `siteverify` → `503` com `{ erro: 'TURNSTILE_INDISPONIVEL' }`
     (nunca trava; o cliente pode tentar de novo).
4. Com cookie válido, `/api/*` passa direto, sem novo desafio, até expirar.
5. **Sem limite extra aqui:** o Turnstile já é o mecanismo anti-abuso da própria
   Cloudflare. O limite por IP entra no M4b2b, junto do KV.

## 4. Testes

- **Lógica pura** (`functions/_lib/sessao.ts`), no Vitest normal, sem mock nem
  ferramenta especial (Web Crypto funciona igual no Node 24 e no runtime da Cloudflare):
  - assinar e verificar: ida e volta;
  - cookie expirado (validade no passado) → inválido;
  - cookie adulterado (assinatura não bate) → inválido;
  - cookie mal formado (sem o ponto, texto solto) → inválido;
  - `SESSION_HMAC_KEY` diferente → inválido.
- **As duas rotas** (`api/sessao.ts`, `api/saude.ts`): verificadas uma vez com
  `wrangler pages dev` (via `npx`, sem instalar como dependência ainda) + `curl`, num
  script documentado (`scripts/testar-sessao.sh`), cobrindo: sem cookie → 401; token
  do Turnstile de teste (a Cloudflare documenta tokens de teste que sempre passam ou
  sempre falham no `siteverify`, para não depender de resolver o desafio de verdade) →
  200 com `Set-Cookie`; com o cookie devolvido, `GET /api/saude` → 200.

## 5. Marco e fluxo

Branch `m4b2a`, a partir da `main` atualizada. TDD estrito na lógica pura, revisão de
código, PR com auto-fix ligado — o mesmo fluxo de todos os marcos anteriores. Na tarefa
de deploy, o passo a passo de criar o widget Turnstile (modo invisível) na Cloudflare e
cadastrar os secrets fica documentado para o usuário, como já fizemos com o domínio e o
`BRAPI_TOKEN`.

# M4b2b: Proxy da brapi.dev, cache em camadas e cota — Design

- **Data:** 2026-09-29
- **Status:** aprovado, pronto para o plano de implementação
- **Relação com a spec principal:** detalha a seção 8 de
  `docs/superpowers/specs/2026-09-27-onde-investir-design.md` ("Dados da brapi: segredo, proteção,
  cache e cota"), itens 8.2 (2-5), 8.3, 8.4 e 8.5 — o item 1 (Turnstile/cookie) já foi entregue no
  **M4b2a**. O cálculo de renda variável e a tela ficam para o **M4b2c**, que consome os endpoints
  deste marco.

## 1. Objetivo

Construir o proxy real de dados de mercado: `/api/mercado/*`, atrás do portão do M4b2a, com cache
em camadas (KV), orçamento de cota que nunca estoura o plano gratuito da brapi (15.000 req/mês), e
uma página `/status` só leitura pra acompanhar o uso.

### Verificado com o token real (2026-09-29)

Testei com o `BRAPI_TOKEN` que já está em `.env`, direto contra a API:
- Ações, FIIs e ETFs funcionam no plano gratuito (`PETR4`, `HGLG11`, `BOVA11` → 200 OK).
- Histórico: `range` acima de `3mo` devolve `INVALID_RANGE` pra tickers normais (confirma o número
  da spec principal). Só os 4 tickers de teste da brapi (`PETR4`, `VALE3`, `ITUB4`, `MGLU3`) escapam
  desse limite — não conte com isso pra tickers reais.
- Formato do candle diário (`historicalDataPrice`): `{ date, open, high, low, close, volume,
  adjustedClose }`, `date` em epoch-segundos.

### Fora do escopo

- O cálculo de renda variável e a tela que o usa (M4b2c).
- Qualquer UI nova além da página `/status` (M4b2c cuida da UI de mercado).

## 2. Achado importante — sem fila de verdade

A spec principal (§8.4) previa uma "fila com 1 requisição por vez". Cloudflare Pages Functions são
**stateless**: cada requisição roda isolada, sem processo compartilhado entre chamadas simultâneas.
Uma fila de verdade exigiria Durable Objects (recurso pago, fora do orçamento zero que o projeto
sempre manteve). Substituído por um **lock por ticker via KV** (chave `lock:<TICKER>`, TTL de poucos
segundos): se duas requisições pedirem o mesmo ticker ao mesmo tempo, a segunda serve o cache em vez
de disparar outra chamada à brapi — resolve o problema real (chamada duplicada simultânea) sem
fila de verdade.

## 3. Endpoints

Novas Pages Functions em `functions/api/mercado/`, atrás do mesmo portão do M4b2a (401 sem cookie
de sessão válido — `verificarSessao` de `functions/_lib/sessao.ts`, já pronto):

- `GET /api/mercado/cotacao?ticker=XXXX` — cotação atual.
- `GET /api/mercado/historico?ticker=XXXX` — histórico diário acumulado.

`ticker` validado por regex de padrão B3 (`^[A-Z]{4}[0-9]{1,2}$`) antes de qualquer chamada — 400
se não bater. Nenhum outro parâmetro é repassado pra brapi (allowlist implícita: só o que os dois
endpoints explicitamente montam).

## 4. Modelo do KV

Um único namespace, `MERCADO_KV`, ligado como binding do Pages:

| Chave | Valor | TTL |
|---|---|---|
| `cotacao:<TICKER>` | `{ preco, moeda, atualizadoEm }` | até o próximo boundary (30min em pregão 10h–18h BRT / até a próxima abertura fora disso) |
| `historico:<TICKER>:<AAAA-MM-DD>` | candle diário (`open/high/low/close/volume/adjustedClose`) | permanente |
| `historico:<TICKER>:meta` | `{ desde, ate }` — o que já está salvo | permanente |
| `tickers:conhecidos` | array/set de tickers já consultados alguma vez | permanente |
| `cota:mensal:<AAAA-MM>` | contador de chamadas reais à brapi no mês | até o fim do mês seguinte (limpeza) |
| `cota:diario:<AAAA-MM-DD>` | contador de chamadas reais à brapi no dia | ~48h |
| `ip:<AAAA-MM-DD>:<ip>` | contador de requisições externas por IP no dia | ~25h |
| `lock:<TICKER>` | cadeado de dedupe (seção 2) | poucos segundos |

**Histórico:** ao pedir `/api/mercado/historico?ticker=X`, a Function olha `historico:X:meta` e
busca só o intervalo que falta desde `ate` até hoje (nunca mais que os `3mo` que o plano permite
numa única chamada — se faltar mais que isso, busca em passos de até 3 meses, respeitando o
orçamento a cada passo). Cada candle novo é salvo individualmente e permanente; `meta.ate` avança.
`X` entra em `tickers:conhecidos` na primeira vez que é consultado.

## 5. Orçamento de cota

```
orcamentoDiario = min(TETO_DIARIO, (15000 - usoMensalAteAgora) / diasRestantesNoMes)
```

Cada chamada real à brapi decrementa `cota:mensal` e `cota:diario`. Se `cota:diario` já bateu o
orçamento do dia, a Function serve o cache existente (mesmo vencido) com `desatualizado: true` na
resposta — **nunca** chama a brapi acima do orçamento, mesmo que o cache esteja velho. Isso vale
pro mês inteiro também: se a cota mensal estourar (ex. no dia 15), o app segue servindo cache até
virar o mês — sem custo de nenhum lado, sem upgrade de plano.

## 6. Continuidade do histórico — Cron Trigger

Achado durante o brainstorm: como cada chamada de histórico só alcança até `3mo` atrás de "hoje",
um ticker que passe mais de 3 meses sem ninguém abrir a tela dele nunca mais consegue preencher o
buraco entre o último candle salvo e o presente (a janela de 3 meses sempre conta a partir de
"agora", nunca alcança mais fundo no passado).

Solução: um **Cloudflare Cron Trigger** (`functions/_lib/cron.ts` ou equivalente, configurado em
`wrangler.toml`), rodando periodicamente (proposta: a cada ~8 semanas, com folga confortável dentro
da janela de 3 meses) que:
1. Lê `tickers:conhecidos` (todo ticker que já foi consultado alguma vez pela UI — cresce sozinho,
   sem lista mantida à mão).
2. Pra cada um, busca o intervalo que falta desde `historico:<TICKER>:meta.ate` até hoje, na mesma
   função que `/api/mercado/historico` já usa.
3. Respeita o mesmo orçamento diário/mensal de sempre — o cron não tem cota própria, disputa a
   mesma cota que as chamadas de usuário. Se o orçamento do dia acabar no meio da rodada, o cron
   para e continua na próxima execução.

Gratuito no plano do Workers/Pages (Cron Triggers não exigem plano pago).

## 7. Página `/status`

Rota separada, fora das abas do app (confirmado no brainstorm) — informação operacional, não
funcionalidade pro usuário comum. Só leitura, sem dado pessoal:
- Uso do mês e do dia (chamadas reais à brapi, não as servidas do cache).
- Orçamento restante do dia.
- Última atualização de cada fonte (brapi, BCB — a mesma lógica de "até o próximo evento" que o
  Banco Central já segue hoje).
- Quantidade de tickers com histórico acumulado (`tickers:conhecidos.length`).

Implementação exata (JSON puro vs. página HTML simples) fica pro plano de implementação — nenhuma
decisão de produto pendente aqui, só escolha técnica de baixo risco.

## 8. Testes

- **Lógica pura** (orçamento, cálculo de TTL do boundary de 30min/próxima abertura, montagem do
  intervalo que falta no histórico, validação de ticker): Vitest normal, sem mock de KV — funções
  puras que recebem os contadores/datas como parâmetro e devolvem a decisão, no mesmo padrão de
  `functions/_lib/sessao.ts`.
- **As rotas** (`cotacao`, `historico`, cron, `/status`): smoke test manual com `wrangler pages dev`
  + `curl`, mesmo padrão do M4b2a (`scripts/testar-sessao.sh`) — um script novo cobrindo: sem
  cookie → 401; ticker inválido → 400; ticker válido → 200 com dado real (usando o `BRAPI_TOKEN`
  real, já verificado nesta sessão); segunda chamada ao mesmo ticker → serve do cache (sem nova
  chamada à brapi, verificável pelos logs do `wrangler`).

## 9. Marco e fluxo

Branch `m4b2b-proxy-brapi-kv`, a partir da `main` atualizada (já com o M4b2a mergeado, incluindo a
nota de privacidade do Turnstile). TDD estrito na lógica pura, revisão de código, PR com auto-fix
ligado — o mesmo fluxo de todos os marcos anteriores. Nenhum segredo novo (reaproveita
`BRAPI_TOKEN`, já cadastrado); o namespace do KV precisa ser criado no painel da Cloudflare e
ligado ao projeto Pages — passo a passo de deploy fica documentado pro usuário, como os anteriores.

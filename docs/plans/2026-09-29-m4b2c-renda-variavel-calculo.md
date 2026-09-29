# M4b2c: Cálculo de renda variável — Plano de Implementação

> **Para o Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` para executar este plano tarefa por tarefa.

**Objetivo:** Nova aba "Renda variável": a pessoa digita um ticker, o app mostra rentabilidade no
período acumulado, volatilidade anualizada e drawdown máximo, comparados a CDI e IPCA no mesmo
período. O Turnstile dispara ao abrir a aba e libera o cookie de sessão do M4b2a.

**Arquitetura:** Motor puro `src/engine/rendaVariavel.ts` (sem rede/DOM) → camada de dados
`src/dados/mercado.ts` (chama `/api/mercado/historico`, com cookie) e `src/dados/turnstile.ts`
(carrega o widget e troca o token por sessão) → UI `src/ui/rendaVariavel/RendaVariavel.tsx`.
Nenhuma Function nova: reaproveita `/api/sessao` (M4b2a) e `/api/mercado/historico` (M4b2b).

**Tech Stack:** TypeScript, Preact, Vitest, Cloudflare Turnstile.

**Design de referência:** `docs/superpowers/specs/2026-09-29-m4b2c-renda-variavel-calculo-design.md`

## Achados ao escrever o plano (já incorporados nas tarefas)

1. **CSP bloqueia o iframe do Turnstile.** `public/_headers` libera `challenges.cloudflare.com` em
   `script-src` e `connect-src` (M4b2a), mas o widget renderiza um **iframe** — e sem `frame-src`,
   o `default-src 'self'` bloqueia. Tarefa 4 adiciona `frame-src https://challenges.cloudflare.com`
   (e atualiza `tests/seguranca/headers.test.ts`, que trava a CSP exata).
2. **Comparação com CDI/IPCA usa o cenário HISTÓRICO**, não o projetado: é um período passado. A
   aba Carteira já monta isso em `App.tsx` (`daCarteira.cenario`, via `cenarioComHistorico`) —
   reaproveitar o mesmo cenário, passado como prop.
3. **A site key do Turnstile ainda não existe no front.** Nenhuma `VITE_*` no projeto hoje. Entra
   como `VITE_TURNSTILE_SITE_KEY` (pública, não é segredo), com fallback pra site key de teste da
   Cloudflare (`1x00000000000000000000BB`, invisível, sempre passa) em dev/teste.

## Paralelismo

- Tarefas 1 → 2 sequenciais (mesmo arquivo `src/engine/rendaVariavel.ts`).
- Tarefas 3 e 4 são independentes entre si e das 1-2 (arquivos diferentes) — **podem rodar em
  paralelo com a 1**. Atenção ao risco já visto no M6: commits concorrentes no mesmo working tree —
  cada subagente deve usar `git add <arquivos exatos>` e conferir `git show --stat HEAD` após o
  commit.
- Tarefa 5 (UI) depende de 1, 2, 3 e 4. Tarefa 6 (conteúdo/editorial) depende da 5. Tarefa 7 fecha.

---

## Tarefa 1: Métricas puras — rentabilidade, volatilidade, drawdown

**Arquivos:**
- Criar: `src/engine/rendaVariavel.ts`
- Teste: `tests/engine/rendaVariavel.test.ts`

**Passo 1: Escrever os testes que falham**

```ts
// tests/engine/rendaVariavel.test.ts
import { describe, expect, it } from 'vitest';
import { drawdownMaximo, rentabilidade, volatilidadeAnualizada } from '../../src/engine/rendaVariavel';

describe('rentabilidade', () => {
  it('fechamento final / inicial − 1', () => {
    expect(rentabilidade([100, 110, 121])).toBeCloseTo(0.21, 12);
  });
  it('queda vira negativo', () => {
    expect(rentabilidade([100, 80])).toBeCloseTo(-0.2, 12);
  });
  it('menos de 2 pontos: null (sem período)', () => {
    expect(rentabilidade([100])).toBeNull();
    expect(rentabilidade([])).toBeNull();
  });
});

describe('volatilidadeAnualizada', () => {
  it('série constante: zero', () => {
    expect(volatilidadeAnualizada([10, 10, 10, 10])).toBe(0);
  });
  it('desvio-padrão amostral dos retornos diários × √252', () => {
    // retornos: +10%, −10%  → média 0, desvio amostral = sqrt((0.01+0.01)/1) = 0.141421...
    const esperado = Math.sqrt(0.02) * Math.sqrt(252);
    expect(volatilidadeAnualizada([100, 110, 99])).toBeCloseTo(esperado, 10);
  });
  it('menos de 3 pontos (menos de 2 retornos): null', () => {
    expect(volatilidadeAnualizada([100, 110])).toBeNull();
  });
});

describe('drawdownMaximo', () => {
  it('maior queda de um pico até o vale seguinte', () => {
    // pico 120, vale 90 → −25%; depois recupera, não importa
    expect(drawdownMaximo([100, 120, 90, 130, 117])).toBeCloseTo(-0.25, 12);
  });
  it('série sempre subindo: zero', () => {
    expect(drawdownMaximo([1, 2, 3])).toBe(0);
  });
  it('vazio: null', () => {
    expect(drawdownMaximo([])).toBeNull();
  });
});
```

Nota: o retorno de 110→99 é exatamente −10%, então o exemplo de volatilidade é conferível à mão.

**Passo 2:** `npx vitest run tests/engine/rendaVariavel.test.ts` → FALHA (módulo não existe).

**Passo 3: Implementar**

```ts
// src/engine/rendaVariavel.ts
// Métricas de renda variável sobre uma série de fechamentos (spec §9.2). Motor puro: recebe
// números, devolve números — sem rede, sem DOM, sem texto (a tradução fica em src/conteudo/).

const DIAS_UTEIS_ANO = 252;

export function rentabilidade(fechamentos: readonly number[]): number | null {
  if (fechamentos.length < 2) return null;
  return (fechamentos.at(-1) as number) / (fechamentos[0] as number) - 1;
}

function retornosDiarios(fechamentos: readonly number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < fechamentos.length; i++) r.push((fechamentos[i] as number) / (fechamentos[i - 1] as number) - 1);
  return r;
}

/** Desvio-padrão AMOSTRAL (n − 1) dos retornos diários, anualizado por √252. */
export function volatilidadeAnualizada(fechamentos: readonly number[]): number | null {
  const r = retornosDiarios(fechamentos);
  if (r.length < 2) return null;
  const media = r.reduce((s, x) => s + x, 0) / r.length;
  const variancia = r.reduce((s, x) => s + (x - media) ** 2, 0) / (r.length - 1);
  return Math.sqrt(variancia) * Math.sqrt(DIAS_UTEIS_ANO);
}

/** Maior queda entre um pico e qualquer ponto seguinte (≤ 0; 0 se nunca caiu). */
export function drawdownMaximo(fechamentos: readonly number[]): number | null {
  if (fechamentos.length === 0) return null;
  let pico = fechamentos[0] as number;
  let pior = 0;
  for (const f of fechamentos) {
    if (f > pico) pico = f;
    pior = Math.min(pior, f / pico - 1);
  }
  return pior;
}
```

**Passo 4:** rodar de novo → PASS. `npm run typecheck`.

**Passo 5: Commit**
```bash
git add src/engine/rendaVariavel.ts tests/engine/rendaVariavel.test.ts
git commit -m "feat(engine): metricas de renda variavel (rentabilidade, volatilidade, drawdown)"
```

---

## Tarefa 2: Análise completa com comparação CDI/IPCA

**Arquivos:**
- Modificar: `src/engine/rendaVariavel.ts`
- Teste: `tests/engine/rendaVariavel.test.ts`

**Passo 1: Escrever o teste que falha**

```ts
import { cenarioConstante } from '../../src/engine/indexadores';
import { analisarRendaVariavel } from '../../src/engine/rendaVariavel';

describe('analisarRendaVariavel', () => {
  const cen = cenarioConstante({ cdiAA: 0.1365, selicMetaAA: 0.1375, ipcaAA: 0.0422, trAM: 0.001646 });
  const candles = [
    { data: '2026-07-01', fechamento: 100 },
    { data: '2026-08-03', fechamento: 105 },
    { data: '2026-09-29', fechamento: 110 },
  ];

  it('monta o período a partir do primeiro e último candle', () => {
    const a = analisarRendaVariavel(candles, cen);
    expect(a?.inicio).toBe('2026-07-01');
    expect(a?.fim).toBe('2026-09-29');
    expect(a?.rentabilidade).toBeCloseTo(0.1, 12);
  });

  it('CDI e IPCA no mesmo período, com os fatores que o motor já usa', () => {
    const a = analisarRendaVariavel(candles, cen);
    expect(a?.cdi).toBeCloseTo(fatorPercentualCDI(cen, 1, '2026-07-01', '2026-09-29') - 1, 12);
    expect(a?.ipca).toBeCloseTo(fatorIPCA(cen, '2026-07-01', '2026-09-29') - 1, 12);
  });

  it('ordena por data antes de calcular (a API não garante ordem)', () => {
    const a = analisarRendaVariavel([candles[2]!, candles[0]!, candles[1]!], cen);
    expect(a?.inicio).toBe('2026-07-01');
    expect(a?.rentabilidade).toBeCloseTo(0.1, 12);
  });

  it('menos de 2 candles: null', () => {
    expect(analisarRendaVariavel([candles[0]!], cen)).toBeNull();
  });
});
```
(importe também `fatorPercentualCDI`, `fatorIPCA` de `../../src/engine/indexadores`.)

**Passo 2:** rodar → FALHA.

**Passo 3: Implementar** (acrescentar ao mesmo arquivo)

```ts
import type { DataISO } from './datas';
import { type Cenario, fatorIPCA, fatorPercentualCDI } from './indexadores';

export interface CandleFechamento { data: DataISO; fechamento: number }

export interface AnaliseRendaVariavel {
  inicio: DataISO;
  fim: DataISO;
  pontos: number;
  rentabilidade: number;
  /** null com menos de 3 candles. */
  volatilidadeAnualizada: number | null;
  drawdownMaximo: number;
  /** Rendimento de 100% do CDI no mesmo período (fração: 0.03 = 3%). */
  cdi: number;
  /** Variação do IPCA no mesmo período. */
  ipca: number;
}

export function analisarRendaVariavel(candles: readonly CandleFechamento[], cen: Cenario): AnaliseRendaVariavel | null {
  const ordenados = [...candles].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  if (ordenados.length < 2) return null;
  const fechamentos = ordenados.map((c) => c.fechamento);
  const inicio = (ordenados[0] as CandleFechamento).data;
  const fim = (ordenados.at(-1) as CandleFechamento).data;
  return {
    inicio, fim, pontos: ordenados.length,
    rentabilidade: rentabilidade(fechamentos) as number,
    volatilidadeAnualizada: volatilidadeAnualizada(fechamentos),
    drawdownMaximo: drawdownMaximo(fechamentos) as number,
    cdi: fatorPercentualCDI(cen, 1, inicio, fim) - 1,
    ipca: fatorIPCA(cen, inicio, fim) - 1,
  };
}
```

Confirme, lendo `src/engine/indexadores.ts`, que `fatorIPCA`/`fatorPercentualCDI` aceitam
`inicio === fim` ou intervalos curtos sem lançar; se algum lançar num caso de borda (ex.: sem dia
útil no intervalo), trate aqui devolvendo `null` e acrescente um teste pra esse caso.

**Passo 4:** rodar → PASS. `npm run typecheck`.

**Passo 5: Commit**
```bash
git add src/engine/rendaVariavel.ts tests/engine/rendaVariavel.test.ts
git commit -m "feat(engine): analisarRendaVariavel com comparacao a CDI e IPCA no mesmo periodo"
```

---

## Tarefa 3: Camada de dados — `/api/mercado/historico` no cliente

**Arquivos:**
- Criar: `src/dados/mercado.ts`
- Teste: `tests/dados/mercado.test.ts`

Leia antes `src/dados/bcb.ts` e `tests/dados/bcb.test.ts` pra seguir o padrão de fetch/erro já usado
(e como os testes mockam `fetch`).

**Passo 1: Testes que falham** — cobrindo: `validarTickerCliente('PETR4') === true` e `'petr4'`,
`'PETR'`, `''` → false (mesma regra de `functions/_lib/mercado.ts` — o cliente não importa
`functions/`, então é uma cópia deliberada; o teste garante que as duas não divergem, comparando
contra os mesmos exemplos de `tests/functions/mercado.test.ts`); `buscarHistorico('PETR4')` com
`fetch` mockado devolvendo `{ ticker, candles: [{ data, fechamento, ... }] }` → `{ ok: true,
candles }` mapeados pra `CandleFechamento`; 401 → `{ ok: false, erro: 'SEM_SESSAO' }`; 400 →
`'TICKER_INVALIDO'`; 502/503 → `'INDISPONIVEL'`; `fetch` lançando → `'INDISPONIVEL'` (nunca lança).

**Passo 3: Implementar**

```ts
// src/dados/mercado.ts
import type { CandleFechamento } from '../engine/rendaVariavel';

/** Cópia deliberada de functions/_lib/mercado.ts (o bundle do cliente não importa functions/). */
const REGEX_TICKER = /^[A-Z]{4}[0-9]{1,2}$/;
export const validarTickerCliente = (t: string): boolean => REGEX_TICKER.test(t);

export type ErroMercado = 'SEM_SESSAO' | 'TICKER_INVALIDO' | 'INDISPONIVEL';
export type ResultadoHistorico = { ok: true; candles: CandleFechamento[] } | { ok: false; erro: ErroMercado };

export async function buscarHistorico(ticker: string, f: typeof fetch = fetch): Promise<ResultadoHistorico> {
  try {
    const resp = await f(`/api/mercado/historico?ticker=${encodeURIComponent(ticker)}`, { credentials: 'same-origin' });
    if (resp.status === 401) return { ok: false, erro: 'SEM_SESSAO' };
    if (resp.status === 400) return { ok: false, erro: 'TICKER_INVALIDO' };
    if (!resp.ok) return { ok: false, erro: 'INDISPONIVEL' };
    const corpo = await resp.json() as { candles?: { data?: unknown; fechamento?: unknown }[] };
    const candles = (corpo.candles ?? [])
      .filter((c): c is { data: string; fechamento: number } => typeof c.data === 'string' && typeof c.fechamento === 'number')
      .map((c) => ({ data: c.data, fechamento: c.fechamento }));
    return { ok: true, candles };
  } catch {
    return { ok: false, erro: 'INDISPONIVEL' };
  }
}
```

Nota: `/api/mercado/historico` (M4b2b) devolve candles com `fechamento` (não `adjustedClose`). O
design falava em usar `adjustedClose` pro drawdown, mas a rota do M4b2b não guarda esse campo —
use `fechamento` e registre isso como limitação conhecida no relatório final (ajustar proventos
exigiria mudar o formato salvo no KV, fora do escopo deste marco).

**Passo 4:** PASS + typecheck. **Passo 5: Commit**
```bash
git add src/dados/mercado.ts tests/dados/mercado.test.ts
git commit -m "feat(dados): cliente do historico de mercado, com erros tipados"
```

---

## Tarefa 4: Turnstile no cliente + CSP `frame-src`

**Arquivos:**
- Criar: `src/dados/turnstile.ts`
- Teste: `tests/dados/turnstile.test.ts`
- Modificar: `public/_headers`, `tests/seguranca/headers.test.ts`, `.env.example`, `src/vite-env.d.ts`
  (ou o arquivo de tipos de env que o projeto já tiver — procure antes)

**Passo 1: CSP.** Em `public/_headers`, acrescente `frame-src https://challenges.cloudflare.com;` à
política (o widget renderiza num iframe; hoje `default-src 'self'` bloquearia). Atualize
`tests/seguranca/headers.test.ts` pra esperar a diretiva nova — rode e veja o teste falhar ANTES de
mexer no `_headers`, depois passar.

**Passo 2: Site key.** `.env.example` ganha
`VITE_TURNSTILE_SITE_KEY=` com o comentário "pública (não é segredo); em produção, variável de
build no Cloudflare Pages". Declare o tipo em `ImportMetaEnv`.

**Passo 3: Testes que falham** (`tests/dados/turnstile.test.ts`, ambiente jsdom): `obterSessao()`
com um `turnstile` falso em `window` (mock que chama o callback com um token) e `fetch` mockado:
200 → `{ ok: true }`; 403 → `{ ok: false, erro: 'TURNSTILE_INVALIDO' }`; 503 ou `fetch` lançando →
`'TURNSTILE_INDISPONIVEL'`; script que não carrega (timeout) → `'TURNSTILE_INDISPONIVEL'`, sem
travar.

**Passo 4: Implementar**

```ts
// src/dados/turnstile.ts
const SITE_KEY_TESTE = '1x00000000000000000000BB'; // Cloudflare: invisível, sempre passa
const URL_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TIMEOUT_MS = 15000;

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

function comTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS))]);
}

/** Resolve o desafio invisível e troca o token por cookie de sessão (POST /api/sessao). Nunca lança. */
export async function obterSessao(container: HTMLElement, f: typeof fetch = fetch): Promise<ResultadoSessao> {
  let token: string;
  try {
    const api = await comTimeout(carregarScript());
    token = await comTimeout(new Promise<string>((resolve, reject) => {
      api.render(container, { sitekey: siteKey(), callback: resolve, 'error-callback': () => reject(new Error('desafio')) });
    }));
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
```

Ajuste o `TIMEOUT_MS` pra algo injetável nos testes (parâmetro opcional) se esperar 15s real
deixar a suíte lenta — use `vi.useFakeTimers()` ou um parâmetro, o que for mais limpo.

**Passo 5:** PASS + `npm run typecheck` + `npm run lint`. **Commit:**
```bash
git add src/dados/turnstile.ts tests/dados/turnstile.test.ts public/_headers tests/seguranca/headers.test.ts .env.example <arquivo de tipos de env>
git commit -m "feat(dados): Turnstile no cliente, com frame-src na CSP e site key por variavel de build"
```

---

## Tarefa 5: Aba "Renda variável"

**Arquivos:**
- Criar: `src/ui/rendaVariavel/RendaVariavel.tsx`
- Teste: `tests/ui/rendaVariavel/RendaVariavel.test.tsx`
- Modificar: `src/ui/App.tsx`

Leia antes `src/ui/objetivos/Sugestao.tsx` e seu teste (padrão de componente + testing-library +
mocks) e o trecho `<Abas ... abas={[...]}>` de `App.tsx`. Lembre a regra do projeto: **todas as
abas ficam montadas ao mesmo tempo** (escondidas, não desmontadas) → ids com prefixo próprio
(`rv-...`), e o Turnstile só pode disparar quando a aba fica **ativa** (prop `ativa: boolean`),
não na montagem.

**Comportamento:**
- Prop `ativa`: na primeira vez que vira `true`, chama `obterSessao(refContainer)` (Tarefa 4). Não
  chama de novo enquanto já tem sessão nesta visita; se `buscarHistorico` voltar `SEM_SESSAO`
  (cookie venceu), chama `obterSessao` de novo UMA vez e repete a consulta.
- Enquanto resolve: "Verificando o acesso…". Erro: mensagem + botão "Tentar de novo".
- Campo "Ticker" (texto, `maxLength={6}`, converte pra maiúsculas), botão "Consultar". Ticker
  inválido → erro em `role="alert"` sem chamar a API.
- Resultado: rentabilidade, volatilidade anualizada, drawdown máximo, CDI e IPCA do mesmo período
  (`formatarPercentual`), período ("de dd/mm/aaaa a dd/mm/aaaa", `dataBR`) e quantos pregões.
  Se o período for curto (ex. < 60 pregões), nota: "Histórico ainda curto: ele cresce com o tempo."
- `AVISO_EDUCATIVO` fixo e "O app não indica ações, fundos ou outros ativos." + `LinkLicao` para
  `'renda-variavel'`.
- Prop `cenario: Cenario` → o cenário HISTÓRICO (em `App.tsx`, `daCarteira.cenario`, o mesmo da
  aba Carteira — ver achado 2).

**Testes** (mockando `../../src/dados/turnstile` e `../../src/dados/mercado` com `vi.mock`): não
chama `obterSessao` com `ativa=false`; chama ao ficar ativa; ticker inválido não chama
`buscarHistorico`; resultado renderiza os 5 números; `SEM_SESSAO` renova a sessão uma vez e repete;
erro do Turnstile mostra "Tentar de novo".

**Em `App.tsx`:** nova entrada em `abas` (`id: 'renda-variavel'`, rótulo "Renda variável"),
passando `ativa={aba === 'renda-variavel'}` e `cenario={daCarteira.cenario}`. Confira se o hash
`#renda-variavel` funciona como as outras abas (formato `#aba/subestado`).

**Commit:**
```bash
git add src/ui/rendaVariavel/ tests/ui/rendaVariavel/ src/ui/App.tsx
git commit -m "feat(ui): aba de renda variavel com Turnstile e comparacao a CDI/IPCA"
```

---

## Tarefa 6: Textos e revisão editorial

Mova os textos da Tarefa 5 pra `src/conteudo/rendaVariavel.ts` (padrão de `src/conteudo/sugestao.ts`)
e ajuste o texto "Neste app" da lição 10 (`src/conteudo/licoes/rendaVariavel.ts`), que hoje diz "O
app ainda não calcula renda variável: esse cálculo vem numa próxima etapa" — passa a ser falso.
Rode `npx vitest run tests/conteudo` (o guarda `soNumerosDasRegras` de `tests/conteudo/textoOficial.ts`
vale pra textos de lição). Passe todos os textos novos pelo /vozmax (sem travessão como conector) e
**mostre ao usuário pra aprovação antes do PR**.

Verificação no navegador (regra do projeto pra mudanças de UI): `rende-dev` na porta 5173, abrir a
aba, conferir 375px sem scroll horizontal (ticker/nomes longos → `overflow-wrap: anywhere`, bug
recorrente do projeto). O `/api/*` não existe no Vite dev — use `wrangler pages dev dist` (8788)
com `.dev.vars` de teste pro fluxo completo, e remova o `.dev.vars` no final.

**Commit:** `docs(conteudo): textos da aba de renda variavel e licao 10 atualizada`.

---

## Tarefa 7: Revisão final e PR

1. `npm test`, `npm run typecheck`, `npx tsc --noEmit -p functions/tsconfig.json`, `npm run lint`.
2. Subagent `code-reviewer` no branch inteiro, com foco em: métricas corretas (amostral vs.
   populacional, drawdown ≤ 0), cenário histórico (não o projetado) na comparação, Turnstile só
   com a aba ativa, nenhum `BRAPI_TOKEN`/segredo no bundle do cliente, CSP mínima (só `frame-src`
   novo), divergência entre as duas cópias do regex de ticker.
3. Push, `gh pr create`, `mcp__ccd_pr__set_monitor` com `auto_fix: true`.
4. **Deploy (no corpo do PR):** cadastrar `VITE_TURNSTILE_SITE_KEY` = `0x4AAAAAAFH-bTN_RiXSFmeR`
   como **variável de ambiente de build** (não secret — é pública) no projeto Pages `rende`
   (Settings → Environment variables → Production), e disparar um novo deploy — variáveis `VITE_*`
   entram no bundle só no build. Sem isso, a produção usaria a site key de teste, que o
   `TURNSTILE_SECRET_KEY` de produção rejeita.
5. Atualizar `CHANGELOG.md` com o M4b2c (fecha o roadmap original).

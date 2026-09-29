# M4b2b: Proxy da brapi.dev, cache em camadas e cota — Plano de Implementação

> **Para o Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` para executar este plano tarefa por tarefa.

**Objetivo:** Construir `/api/mercado/cotacao` e `/api/mercado/historico`, atrás do portão do
M4b2a, com cache em KV, orçamento de cota que nunca estoura o plano gratuito da brapi, um Cron
Trigger que mantém o histórico dos tickers já conhecidos em dia, e a página `/status`.

**Arquitetura:** Lógica pura (validação de ticker, TTL da cotação, orçamento diário, "precisa
atualizar histórico?") em `functions/_lib/mercado.ts`, testável em Vitest normal, no mesmo padrão
de `functions/_lib/sessao.ts` (M4b2a). As rotas ficam finas, só orquestrando: checam a sessão
(`verificarSessao`, já pronto), leem/escrevem no KV, chamam a lógica pura pra decidir o que fazer,
e chamam a brapi só quando o orçamento permite.

**Achado durante o design, que simplifica a implementação:** como a brapi só aceita `range` relativo
a "hoje" (não um intervalo arbitrário no passado), uma única chamada com `range=3mo` já traz o
máximo que dá pra pedir de uma vez — não existe "buscar em passos" pra alcançar mais fundo no
passado. A lógica de histórico fica então: "precisa atualizar?" (sim/não, comparando
`meta.ate` com o último dia útil) em vez de calcular um intervalo. Isso é consistente com o design:
é exatamente por isso que o Cron Trigger existe (seção 6 do design) — só chamando periodicamente,
dentro da janela de 3 meses, é que o histórico consegue crescer com o tempo.

**Tech Stack:** TypeScript, Cloudflare Pages Functions, Workers KV, Cron Triggers, Vitest.

**Design de referência:** `docs/superpowers/specs/2026-09-29-m4b2b-proxy-brapi-kv-design.md`

---

## Tarefa 1: Lógica pura — ticker, TTL da cotação, orçamento

**Arquivos:**
- Criar: `functions/_lib/mercado.ts`
- Teste: `tests/functions/mercado.test.ts`

**Passo 1: Escrever os testes que falham**

```ts
// tests/functions/mercado.test.ts
import { describe, expect, it } from 'vitest';
import {
  orcamentoDiario, segundosAteProximoBoundary, validarTicker,
} from '../../functions/_lib/mercado';

describe('validarTicker', () => {
  it('aceita o padrão B3 (4 letras + 1-2 números)', () => {
    expect(validarTicker('PETR4')).toBe(true);
    expect(validarTicker('HGLG11')).toBe(true);
  });
  it('rejeita o que não bate no padrão', () => {
    expect(validarTicker('petr4')).toBe(false); // minúsculo
    expect(validarTicker('PETR')).toBe(false); // sem número
    expect(validarTicker('PE4')).toBe(false); // menos de 4 letras
    expect(validarTicker('PETR4; DROP TABLE')).toBe(false);
    expect(validarTicker('')).toBe(false);
  });
});

describe('segundosAteProximoBoundary', () => {
  // BRT = UTC-3, sem horário de verão desde 2019.
  it('em pregão (dia útil, 10h-18h BRT): 30 minutos', () => {
    const agora = new Date('2026-09-29T15:00:00Z'); // 12h BRT, terça-feira
    expect(segundosAteProximoBoundary(agora)).toBe(30 * 60);
  });
  it('fora do pregão, mesmo dia útil (antes das 10h BRT): até a abertura', () => {
    const agora = new Date('2026-09-29T11:00:00Z'); // 8h BRT
    expect(segundosAteProximoBoundary(agora)).toBe(2 * 60 * 60); // até 10h BRT
  });
  it('fora do pregão, depois das 18h BRT num dia útil: até a abertura do próximo dia útil', () => {
    const agora = new Date('2026-09-29T22:00:00Z'); // 19h BRT, terça
    // próxima abertura: quarta 10h BRT = 13h UTC do dia seguinte
    const esperado = Math.round((Date.parse('2026-09-30T13:00:00Z') - agora.getTime()) / 1000);
    expect(segundosAteProximoBoundary(agora)).toBe(esperado);
  });
  it('fim de semana: até a abertura de segunda', () => {
    const agora = new Date('2026-10-03T15:00:00Z'); // sábado, 12h BRT
    const esperado = Math.round((Date.parse('2026-10-05T13:00:00Z') - agora.getTime()) / 1000); // segunda 10h BRT
    expect(segundosAteProximoBoundary(agora)).toBe(esperado);
  });
});

describe('orcamentoDiario', () => {
  it('divide o restante do mês pelos dias restantes', () => {
    expect(orcamentoDiario(0, 15, 1000)).toBe(1000); // 15000/15 = 1000, sem teto
  });
  it('nunca passa do teto', () => {
    expect(orcamentoDiario(0, 5, 500)).toBe(500); // 15000/5 = 3000, teto corta pra 500
  });
  it('cota já estourada no mês: zero', () => {
    expect(orcamentoDiario(15000, 10, 1000)).toBe(0);
  });
  it('nunca negativo mesmo se o uso passar de 15000', () => {
    expect(orcamentoDiario(20000, 10, 1000)).toBe(0);
  });
});
```

**Passo 2: Rodar e confirmar que falham**

Rodar: `npx vitest run tests/functions/mercado.test.ts`
Esperado: FALHA — `functions/_lib/mercado.ts` não existe.

**Passo 3: Implementar**

```ts
// functions/_lib/mercado.ts

/** Ticker no padrão B3: 4 letras maiúsculas seguidas de 1 ou 2 números. */
const REGEX_TICKER = /^[A-Z]{4}[0-9]{1,2}$/;

export function validarTicker(ticker: string): boolean {
  return REGEX_TICKER.test(ticker);
}

const FUSO_BRT_HORAS = -3;
const ABERTURA_HORA_BRT = 10;
const FECHAMENTO_HORA_BRT = 18;

function horaBRT(data: Date): number {
  return (data.getUTCHours() + FUSO_BRT_HORAS + 24) % 24;
}

function ehFimDeSemanaBRT(data: Date): boolean {
  // getUTCDay() de um instante 3h atrás cobre o "dia BRT" corretamente perto da virada.
  const diaBRT = new Date(data.getTime() + FUSO_BRT_HORAS * 60 * 60 * 1000).getUTCDay();
  return diaBRT === 0 || diaBRT === 6;
}

/** Próxima abertura (10h BRT) de um dia útil, ignorando feriados (aproximação aceitável para TTL de cache). */
function proximaAberturaUTC(data: Date): Date {
  let candidato = new Date(data);
  candidato.setUTCHours(ABERTURA_HORA_BRT - FUSO_BRT_HORAS, 0, 0, 0);
  if (candidato <= data) candidato = new Date(candidato.getTime() + 24 * 60 * 60 * 1000);
  while (ehFimDeSemanaBRT(candidato)) candidato = new Date(candidato.getTime() + 24 * 60 * 60 * 1000);
  return candidato;
}

/**
 * TTL (em segundos) do cache de cotação: 30 minutos em pregão (dia útil, 10h-18h BRT), ou até a
 * próxima abertura fora disso. Não considera feriados (só fins de semana) — aproximação aceitável
 * pra um TTL de cache, nunca pra uma regra de negócio de verdade.
 */
export function segundosAteProximoBoundary(agora: Date): number {
  const hora = horaBRT(agora);
  const emPregao = !ehFimDeSemanaBRT(agora) && hora >= ABERTURA_HORA_BRT && hora < FECHAMENTO_HORA_BRT;
  if (emPregao) return 30 * 60;
  return Math.round((proximaAberturaUTC(agora).getTime() - agora.getTime()) / 1000);
}

/** Orçamento do dia: o que resta no mês, dividido pelos dias que faltam, sem passar do teto. Nunca negativo. */
export function orcamentoDiario(usoMensalAteAgora: number, diasRestantesNoMes: number, teto: number): number {
  const restanteNoMes = Math.max(0, 15000 - usoMensalAteAgora);
  return Math.min(teto, Math.floor(restanteNoMes / diasRestantesNoMes));
}
```

**Passo 4: Rodar e confirmar que passa**

Rodar: `npx vitest run tests/functions/mercado.test.ts`
Esperado: PASS. Se os testes de `segundosAteProximoBoundary` não baterem exatamente por causa de
arredondamento ou de como `Date`/fuso é tratado no ambiente de teste, ajuste a implementação (não
o teste) até a lógica de fuso ficar correta — os valores esperados nos testes foram calculados à
mão a partir de UTC-3 fixo.

**Passo 5: Commit**

```bash
git add functions/_lib/mercado.ts tests/functions/mercado.test.ts
git commit -m "feat(mercado): logica pura de validacao de ticker, TTL de cotacao e orcamento diario"
```

---

## Tarefa 2: Lógica pura — continuidade do histórico

**Arquivos:**
- Modificar: `functions/_lib/mercado.ts`
- Teste: `tests/functions/mercado.test.ts`

**Passo 1: Escrever o teste que falha**

```ts
describe('precisaAtualizarHistorico', () => {
  it('sem meta (ticker nunca consultado): precisa', () => {
    expect(precisaAtualizarHistorico(null, '2026-09-29')).toBe(true);
  });
  it('meta desatualizada (mais de 1 dia útil atrás): precisa', () => {
    expect(precisaAtualizarHistorico('2026-09-25', '2026-09-29')).toBe(true); // sexta -> terça
  });
  it('meta em dia (ontem útil ou hoje): não precisa', () => {
    expect(precisaAtualizarHistorico('2026-09-28', '2026-09-29')).toBe(false); // segunda -> terça
    expect(precisaAtualizarHistorico('2026-09-29', '2026-09-29')).toBe(false);
  });
});
```
(ajuste as datas de exemplo pra dias úteis reais de verdade, usando `ehDiaUtil` de
`src/engine/calendario.ts` como referência ao escolher os valores — não precisa que o teste em si
importe `ehDiaUtil`, só que os exemplos sejam datas plausíveis.)

**Passo 2: Rodar e confirmar que falha**

Rodar: `npx vitest run tests/functions/mercado.test.ts`
Esperado: FALHA — `precisaAtualizarHistorico` não existe.

**Passo 3: Implementar**

Em `functions/_lib/mercado.ts`, importe `ehDiaUtil` de `../../src/engine/calendario` e `somarDias`
de `../../src/engine/datas` (esses módulos são TypeScript puro, sem DOM — importáveis de dentro de
`functions/` sem problema; `functions/tsconfig.json` já tem `lib: ["ES2022"]`, compatível), e
adicione:

```ts
import { ehDiaUtil } from '../../src/engine/calendario';
import { somarDias, type DataISO } from '../../src/engine/datas';

/** O último dia útil até `hoje` (inclusive). */
function ultimoDiaUtilAte(hoje: DataISO): DataISO {
  let d = hoje;
  while (!ehDiaUtil(d)) d = somarDias(d, -1);
  return d;
}

/** Se o histórico salvo (`metaAte`) já cobre o último dia útil, não precisa atualizar. */
export function precisaAtualizarHistorico(metaAte: DataISO | null, hoje: DataISO): boolean {
  if (metaAte === null) return true;
  return metaAte < ultimoDiaUtilAte(hoje);
}
```

**Passo 4: Rodar e confirmar que passa**

Rodar: `npx vitest run tests/functions/mercado.test.ts` e `npx tsc --noEmit -p functions/tsconfig.json`
Esperado: PASS.

**Passo 5: Commit**

```bash
git add functions/_lib/mercado.ts tests/functions/mercado.test.ts
git commit -m "feat(mercado): precisaAtualizarHistorico, usando o mesmo calendario do motor"
```

---

## Tarefa 3: `wrangler.toml` e binding do KV

**Arquivos:**
- Criar: `wrangler.toml`
- Modificar: `.env.example` (nenhuma mudança de segredo aqui — `BRAPI_TOKEN` já documentado; só
  confirmar que continua lá)

Este é o primeiro `wrangler.toml` do projeto — até agora o `wrangler pages dev` rodava sem
configuração (M4b2a). Precisamos dele agora pra declarar o binding do KV e, mais tarde nesta mesma
tarefa, o Cron Trigger.

**Passo 1:** Peça ao usuário (fora do código, é uma ação no painel da Cloudflare) pra criar um
namespace KV chamado `MERCADO_KV` em **Workers & Pages → KV** e anotar o ID gerado. Documente esse
passo aqui no plano mesmo, pro passo a passo final da Tarefa 8. Não dá pra criar o namespace por
código — só via `wrangler kv namespace create MERCADO_KV` (que também precisa de login) ou pelo
painel.

**Passo 2:** Crie `wrangler.toml` na raiz do projeto:

```toml
name = "rende"
pages_build_output_dir = "dist"
compatibility_date = "2026-09-29"

[[kv_namespaces]]
binding = "MERCADO_KV"
id = "SUBSTITUA_PELO_ID_REAL_DO_NAMESPACE"
```

(o `id` real só existe depois que o namespace é criado no painel — documente isso claramente no
arquivo com um comentário, e no passo a passo de deploy da Tarefa 8. Para desenvolvimento local, o
`wrangler pages dev` cria um KV local automaticamente a partir desse binding, sem precisar do ID
real — só a produção precisa do ID de verdade.)

**Passo 3:** Rode `npx wrangler pages dev dist --port 8788` (com o `dist/` já buildado) e confirme
que ele sobe sem erro de configuração — o KV local (`--local`, padrão) já fica disponível pro
binding `MERCADO_KV` sem precisar do ID real.

**Passo 4: Commit**

```bash
git add wrangler.toml
git commit -m "feat(mercado): wrangler.toml com o binding do namespace MERCADO_KV"
```

---

## Tarefa 4: Rota `GET /api/mercado/cotacao`

**Arquivos:**
- Criar: `functions/api/mercado/cotacao.ts`

Sem teste automatizado próprio (depende de rede + KV) — coberta pelo smoke test manual da Tarefa 7,
mesmo padrão do M4b2a.

**Passo 1: Implementar**

```ts
// functions/api/mercado/cotacao.ts
import { orcamentoDiario, segundosAteProximoBoundary, validarTicker } from '../../_lib/mercado';
import { verificarSessao } from '../../_lib/sessao';

interface Ambiente {
  SESSION_HMAC_KEY: string;
  BRAPI_TOKEN: string;
  MERCADO_KV: KVNamespace;
}

interface Cotacao { preco: number; moeda: string; atualizadoEm: string; desatualizado?: true }

function erro(status: number, corpo: Record<string, unknown>): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
}

function lerCookie(cabecalho: string | null): string | null {
  if (!cabecalho) return null;
  const encontrada = cabecalho.split(';').map((p) => p.trim()).find((p) => p.startsWith('sessao='));
  return encontrada ? encontrada.slice('sessao='.length) : null;
}

function diaISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mesISO(d: Date): string {
  return d.toISOString().slice(0, 7);
}

function diasRestantesNoMes(d: Date): number {
  const ultimoDia = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return ultimoDia - d.getUTCDate() + 1;
}

const TETO_DIARIO = 400; // heurística do app, sem fonte legal — ajustável.

export const onRequestGet: PagesFunction<Ambiente> = async (contexto) => {
  const cookie = lerCookie(contexto.request.headers.get('Cookie'));
  if (!cookie || !(await verificarSessao(cookie, contexto.env.SESSION_HMAC_KEY))) {
    return erro(401, { erro: 'SEM_SESSAO' });
  }

  const ticker = new URL(contexto.request.url).searchParams.get('ticker') ?? '';
  if (!validarTicker(ticker)) return erro(400, { erro: 'TICKER_INVALIDO' });

  const kv = contexto.env.MERCADO_KV;
  const chaveCache = `cotacao:${ticker}`;
  const cache = await kv.get<Cotacao>(chaveCache, 'json');

  const agora = new Date();
  const chaveMensal = `cota:mensal:${mesISO(agora)}`;
  const chaveDiaria = `cota:diario:${diaISO(agora)}`;
  const usoMensal = Number(await kv.get(chaveMensal)) || 0;
  const usoDiario = Number(await kv.get(chaveDiaria)) || 0;
  const orcamento = orcamentoDiario(usoMensal, diasRestantesNoMes(agora), TETO_DIARIO);

  if (cache && usoDiario >= orcamento) {
    return new Response(JSON.stringify({ ...cache, desatualizado: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (usoDiario >= orcamento) {
    return erro(503, { erro: 'COTA_ESGOTADA' });
  }

  const resp = await fetch(`https://brapi.dev/api/quote/${ticker}`, {
    headers: { Authorization: `Bearer ${contexto.env.BRAPI_TOKEN}` },
  });
  if (!resp.ok) {
    if (cache) return new Response(JSON.stringify({ ...cache, desatualizado: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return erro(502, { erro: 'BRAPI_INDISPONIVEL' });
  }
  const dados = await resp.json() as { results?: { regularMarketPrice?: number; currency?: string }[] };
  const r = dados.results?.[0];
  if (!r || typeof r.regularMarketPrice !== 'number') return erro(502, { erro: 'BRAPI_INDISPONIVEL' });

  const cotacao: Cotacao = { preco: r.regularMarketPrice, moeda: r.currency ?? 'BRL', atualizadoEm: agora.toISOString() };
  await kv.put(chaveCache, JSON.stringify(cotacao), { expirationTtl: segundosAteProximoBoundary(agora) });
  await kv.put(chaveMensal, String(usoMensal + 1));
  await kv.put(chaveDiaria, String(usoDiario + 1), { expirationTtl: 48 * 60 * 60 });

  return new Response(JSON.stringify(cotacao), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
```

**Passo 2:** Rode `npx tsc --noEmit -p functions/tsconfig.json` e confirme sem erros.

**Passo 3: Commit**

```bash
git add functions/api/mercado/cotacao.ts
git commit -m "feat(mercado): rota GET /api/mercado/cotacao com cache e orcamento"
```

---

## Tarefa 5: Rota `GET /api/mercado/historico`

**Arquivos:**
- Criar: `functions/api/mercado/historico.ts`

**Passo 1: Implementar**, reaproveitando o MESMO padrão de autenticação/cota/orçamento da Tarefa 4
(copie os helpers `erro`/`lerCookie`/`diaISO`/`mesISO`/`diasRestantesNoMes`/`TETO_DIARIO` — se
preferir, extraia-os pra `functions/_lib/mercado.ts` nesta tarefa, já que agora são usados duas
vezes; se extrair, ajuste a Tarefa 4 e seus testes de acordo, e rode a suíte inteira de novo pra
confirmar que nada quebrou):

```ts
// functions/api/mercado/historico.ts
import { precisaAtualizarHistorico, validarTicker } from '../../_lib/mercado';
import { verificarSessao } from '../../_lib/sessao';

interface Ambiente {
  SESSION_HMAC_KEY: string;
  BRAPI_TOKEN: string;
  MERCADO_KV: KVNamespace;
}

interface Candle { data: string; abertura: number; maxima: number; minima: number; fechamento: number; volume: number }
interface Meta { desde: string; ate: string }

// ... (erro/lerCookie/diaISO/mesISO/diasRestantesNoMes/TETO_DIARIO como na Tarefa 4)

export const onRequestGet: PagesFunction<Ambiente> = async (contexto) => {
  const cookie = lerCookie(contexto.request.headers.get('Cookie'));
  if (!cookie || !(await verificarSessao(cookie, contexto.env.SESSION_HMAC_KEY))) return erro(401, { erro: 'SEM_SESSAO' });

  const ticker = new URL(contexto.request.url).searchParams.get('ticker') ?? '';
  if (!validarTicker(ticker)) return erro(400, { erro: 'TICKER_INVALIDO' });

  const kv = contexto.env.MERCADO_KV;
  const hoje = new Date().toISOString().slice(0, 10);
  const meta = await kv.get<Meta>(`historico:${ticker}:meta`, 'json');

  if (precisaAtualizarHistorico(meta?.ate ?? null, hoje)) {
    // checagem de orçamento igual à Tarefa 4, omitida aqui por brevidade — reaproveite a mesma lógica.
    const resp = await fetch(`https://brapi.dev/api/quote/${ticker}?range=3mo&interval=1d`, {
      headers: { Authorization: `Bearer ${contexto.env.BRAPI_TOKEN}` },
    });
    if (resp.ok) {
      const dados = await resp.json() as { results?: { historicalDataPrice?: { date: number; open: number; high: number; low: number; close: number; volume: number }[] }[] };
      const candles = dados.results?.[0]?.historicalDataPrice ?? [];
      let maiorData = meta?.ate ?? '';
      for (const c of candles) {
        const data = new Date(c.date * 1000).toISOString().slice(0, 10);
        const candle: Candle = { data, abertura: c.open, maxima: c.high, minima: c.low, fechamento: c.close, volume: c.volume };
        await kv.put(`historico:${ticker}:${data}`, JSON.stringify(candle));
        if (data > maiorData) maiorData = data;
      }
      const novaMeta: Meta = { desde: meta?.desde ?? (candles[0] ? new Date(candles[0].date * 1000).toISOString().slice(0, 10) : hoje), ate: maiorData || hoje };
      await kv.put(`historico:${ticker}:meta`, JSON.stringify(novaMeta));

      const conhecidos = (await kv.get<string[]>('tickers:conhecidos', 'json')) ?? [];
      if (!conhecidos.includes(ticker)) await kv.put('tickers:conhecidos', JSON.stringify([...conhecidos, ticker]));
    }
  }

  const metaFinal = await kv.get<Meta>(`historico:${ticker}:meta`, 'json');
  if (!metaFinal) return erro(502, { erro: 'BRAPI_INDISPONIVEL' });

  const candles: Candle[] = [];
  for (let d = metaFinal.desde; d <= metaFinal.ate; ) {
    const c = await kv.get<Candle>(`historico:${ticker}:${d}`, 'json');
    if (c) candles.push(c);
    d = new Date(new Date(d).getTime() + 86400000).toISOString().slice(0, 10);
  }
  return new Response(JSON.stringify({ ticker, candles }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
```

Esta rota tem uma simplificação deliberada: varre dia a dia entre `desde` e `ate` fazendo uma
leitura de KV por dia (caro em requisições de KV pra históricos longos). Aceitável pro volume deste
app (uso pessoal, poucos tickers), mas documente com um comentário no código citando esta nota —
se o histórico crescer muito, trocar por uma lista serializada por ticker é a melhoria óbvia, fora
de escopo agora.

**Passo 2:** Rode `npx tsc --noEmit -p functions/tsconfig.json` e confirme sem erros.

**Passo 3: Commit**

```bash
git add functions/api/mercado/historico.ts
git commit -m "feat(mercado): rota GET /api/mercado/historico com continuidade via KV"
```

---

## Tarefa 6: Cron Trigger de continuidade

**Arquivos:**
- Modificar: `wrangler.toml`
- Criar: `functions/_lib/cron.ts` (lógica compartilhável) — a Cloudflare Pages ainda não roda Cron
  Triggers via `functions/`, então este marco documenta a limitação e a solução abaixo.

**Achado ao implementar:** Cloudflare Pages (o produto que este projeto usa, não "Workers" puro)
**não suporta Cron Triggers nativamente** — Cron Triggers são um recurso de Workers "de verdade",
não de Pages Functions. Não dá pra declarar `[triggers] crons = [...]` num `wrangler.toml` de Pages
e esperar que funcione.

**Decisão confirmada com o usuário:** Worker separado, pequeno, só com esse cron — mesma conta
Cloudflare, sem custo extra no plano gratuito de Workers. Reaproveita a MESMA lógica pura de
`functions/_lib/mercado.ts` (importada direto, já que é código puro sem dependência de Pages) e o
MESMO namespace KV (`MERCADO_KV`, bindado também neste Worker). Isso introduz uma 2ª unidade de
deploy no projeto — documentada no passo a passo da Tarefa 8.

**Arquivos:**
- Criar: `workers/cron-historico/wrangler.toml`
- Criar: `workers/cron-historico/src/index.ts`
- Criar: `workers/cron-historico/tsconfig.json` (mesmo conteúdo de `functions/tsconfig.json`, com
  `include` apontando só para este diretório)

**Passo 1:** Crie `workers/cron-historico/wrangler.toml`:

```toml
name = "rende-cron-historico"
main = "src/index.ts"
compatibility_date = "2026-09-29"

[[kv_namespaces]]
binding = "MERCADO_KV"
id = "MESMO_ID_DO_NAMESPACE_MERCADO_KV_DO_PAGES" # ver Tarefa 3 — mesmo namespace, dois bindings

[triggers]
# Toda segunda às 6h UTC. Semanal por simplicidade (sintaxe de cron não expressa "a cada 8
# semanas" de forma direta); a maioria das execuções não faz nada de verdade, porque
# precisaAtualizarHistorico() só deixa passar os tickers realmente desatualizados.
crons = ["0 6 * * 1"]
```

**Passo 2:** Crie `workers/cron-historico/tsconfig.json`, idêntico a `functions/tsconfig.json` mas
com `"include": ["src/**/*.ts", "../../functions/_lib/mercado.ts"]` (precisa enxergar o arquivo
importado, que vive fora deste diretório).

**Passo 3:** Crie `workers/cron-historico/src/index.ts`:

```ts
import { precisaAtualizarHistorico, validarTicker } from '../../../functions/_lib/mercado';

export interface Env {
  MERCADO_KV: KVNamespace;
  BRAPI_TOKEN: string;
}

interface Meta { desde: string; ate: string }
interface Candle { data: string; abertura: number; maxima: number; minima: number; fechamento: number; volume: number }

async function atualizarTicker(ticker: string, env: Env, hoje: string): Promise<void> {
  const meta = await env.MERCADO_KV.get<Meta>(`historico:${ticker}:meta`, 'json');
  if (!precisaAtualizarHistorico(meta?.ate ?? null, hoje)) return;

  const resp = await fetch(`https://brapi.dev/api/quote/${ticker}?range=3mo&interval=1d`, {
    headers: { Authorization: `Bearer ${env.BRAPI_TOKEN}` },
  });
  if (!resp.ok) return;
  const dados = await resp.json() as {
    results?: { historicalDataPrice?: { date: number; open: number; high: number; low: number; close: number; volume: number }[] }[];
  };
  const candles = dados.results?.[0]?.historicalDataPrice ?? [];
  let maiorData = meta?.ate ?? '';
  for (const c of candles) {
    const data = new Date(c.date * 1000).toISOString().slice(0, 10);
    const candle: Candle = { data, abertura: c.open, maxima: c.high, minima: c.low, fechamento: c.close, volume: c.volume };
    await env.MERCADO_KV.put(`historico:${ticker}:${data}`, JSON.stringify(candle));
    if (data > maiorData) maiorData = data;
  }
  const desde = meta?.desde ?? (candles[0] ? new Date(candles[0].date * 1000).toISOString().slice(0, 10) : hoje);
  await env.MERCADO_KV.put(`historico:${ticker}:meta`, JSON.stringify({ desde, ate: maiorData || hoje } satisfies Meta));
}

export default {
  async scheduled(_evento: ScheduledEvent, env: Env): Promise<void> {
    const hoje = new Date().toISOString().slice(0, 10);
    const conhecidos = (await env.MERCADO_KV.get<string[]>('tickers:conhecidos', 'json')) ?? [];
    for (const ticker of conhecidos) {
      if (!validarTicker(ticker)) continue; // defensivo: nunca deveria acontecer, mas não deixa um dado sujo travar o cron inteiro
      await atualizarTicker(ticker, env, hoje);
    }
  },
};
```

Note a duplicação parcial com `functions/api/mercado/historico.ts` (o corpo de `atualizarTicker` é
quase idêntico ao trecho de atualização daquela rota). Extrair isso pra um terceiro módulo
compartilhado é a melhoria óbvia, mas os dois lados (`functions/`, um Pages Function; e
`workers/cron-historico/`, um Worker independente) têm builds e `tsconfig.json` diferentes — dá
pra fazer, mas é mais risco de quebrar um dos dois builds do que o benefício vale agora, com o
projeto deste tamanho. Documentado aqui como débito técnico consciente, não esquecido.

**Passo 4:** Teste manual (sem suíte automatizada — depende de rede e do agendador real): rode
`npx wrangler dev --test-scheduled` dentro de `workers/cron-historico/`, com um `.dev.vars` local
contendo `BRAPI_TOKEN`, e dispare `curl "http://localhost:8787/__scheduled"` pra simular o cron.
Confirme nos logs que ele leu `tickers:conhecidos` do KV local e (se havia algum ticker desatualizado
lá) fez a chamada à brapi.

**Passo 5:** Rode `npx tsc --noEmit -p workers/cron-historico/tsconfig.json` e confirme sem erros.

**Passo 6: Commit**

```bash
git add workers/cron-historico/
git commit -m "feat(mercado): worker separado com o cron de continuidade do historico"
```

---

## Tarefa 7: Página `/status`

**Arquivos:**
- Criar: `functions/status.ts`

**Passo 1: Implementar**

```ts
// functions/status.ts
interface Ambiente { MERCADO_KV: KVNamespace }

function diaISO(d: Date): string { return d.toISOString().slice(0, 10); }
function mesISO(d: Date): string { return d.toISOString().slice(0, 7); }

export const onRequestGet: PagesFunction<Ambiente> = async (contexto) => {
  const kv = contexto.env.MERCADO_KV;
  const agora = new Date();
  const usoMensal = Number(await kv.get(`cota:mensal:${mesISO(agora)}`)) || 0;
  const usoDiario = Number(await kv.get(`cota:diario:${diaISO(agora)}`)) || 0;
  const conhecidos = (await kv.get<string[]>('tickers:conhecidos', 'json')) ?? [];

  return new Response(JSON.stringify({
    usoMensal, usoDiario, tickersComHistorico: conhecidos.length, geradoEm: agora.toISOString(),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
```

Sem cookie/sessão exigida (é informação pública, sem dado pessoal, como o design definiu). Formato
JSON puro por simplicidade — se quiser uma página HTML mais amigável depois, é um passo de UI
separado, fora do escopo deste marco de infra.

**Passo 2:** Rode `npx tsc --noEmit -p functions/tsconfig.json` e confirme sem erros.

**Passo 3: Commit**

```bash
git add functions/status.ts
git commit -m "feat(mercado): pagina /status, so leitura, sem dado pessoal"
```

---

## Tarefa 8: Smoke test manual, revisão final e PR

**Arquivos:**
- Criar: `scripts/testar-mercado.sh`

**Passo 1:** Escreva um script de smoke test manual, mesmo padrão de `scripts/testar-sessao.sh`
(M4b2a): autentica via `/api/sessao` com o token de teste do Turnstile, guarda o cookie, e testa
`/api/mercado/cotacao?ticker=PETR4` (200 com preço real, usando o `BRAPI_TOKEN` de verdade do
`.dev.vars` local), `/api/mercado/historico?ticker=PETR4` (200 com candles), uma segunda chamada
imediata à cotação (confirma que serviu do cache, sem nova chamada à brapi — verificável pelos
logs do `wrangler pages dev`), ticker inválido (400), e `/status` (200, sem exigir cookie).

**Passo 2:** Rode o script manualmente (`wrangler pages dev` num terminal, o script noutro),
documentando o resultado real no relatório final — não invente resultado que não rodou de verdade.

**Passo 3:** Rodar a suíte inteira, typecheck e lint:
```bash
npm test
npm run typecheck
npx tsc --noEmit -p functions/tsconfig.json
npm run lint
```

**Passo 4:** Revisão de código final (subagent `code-reviewer`, cobrindo todo o branch
`m4b2b-proxy-brapi-kv`), cobrindo especificamente:
- o orçamento nunca deixa passar de 15.000 chamadas/mês, mesmo em cenários de borda (fuso, virada
  de mês, contador zerado);
- nenhuma chamada à brapi acontece sem checar o orçamento primeiro;
- o `BRAPI_TOKEN` nunca aparece em log, resposta de erro, ou é exposto ao cliente;
- a decisão da Tarefa 6 (cron) está documentada e coerente com o que foi de fato implementado.

**Passo 5:** Push e PR, com o passo a passo de deploy documentado no corpo do PR: criar o namespace
KV no painel, atualizar os DOIS `wrangler.toml` (Pages e `workers/cron-historico/`) com o ID real
do namespace, cadastrar `BRAPI_TOKEN` como secret também no Worker do cron (`wrangler secret put
BRAPI_TOKEN`, dentro de `workers/cron-historico/`, além do secret já existente no Pages), e
publicar o Worker separadamente (`wrangler deploy`, dentro de `workers/cron-historico/` — é um
deploy próprio, o `git push`/deploy automático do Pages não cobre isso):
```bash
git push -u origin m4b2b-proxy-brapi-kv
gh pr create --title "M4b2b: proxy da brapi, cache em KV e cota" --body "..."
```
Em seguida, `mcp__ccd_pr__set_monitor` com `auto_fix: true` (padrão do usuário para todos os PRs).

# M1 — Motor de cálculo, Equivalência e Educação nível 1: plano de implementação

> **Para o Claude:** use a skill `executing-plans` (ou `subagent-driven-development`) para
> implementar este plano tarefa por tarefa. **TDD estrito**: nenhum código de produção sem
> um teste que falhou antes.

**Objetivo:** publicar em `rende.maxsueleinstein.dev` uma primeira versão utilizável.
Ela compara duas aplicações de renda fixa (ex.: CDB 103% do CDI × LCI 80% do CDI) pelo
valor líquido, mostra as taxas equivalentes e explica cada resultado ("Por que esse
resultado?", "Palpite antes de ver", termos com explicação).

**Arquitetura:** SPA estática (Vite + Preact + TypeScript) no Cloudflare Pages. Toda a
regra de negócio fica em `src/engine/`: TypeScript puro, determinístico, sem rede nem
storage, e com as regras tributárias guardadas como dados versionados por vigência. A UI
só lê o engine. No M1 o cenário (CDI, Selic, IPCA, TR) é constante e digitado, com valores
iniciais do SGS de 24/09/2026. Os indicadores ao vivo entram no M2.

**Stack:** Node 24, Vite, Preact, TypeScript (strict), Vitest, jsdom, Testing Library,
ESLint (typescript-eslint), GitHub Actions, Cloudflare Pages.

**Referências:**
- Spec: `docs/superpowers/specs/2026-09-27-onde-investir-design.md`.
- Valores esperados: `tests/referencia/calcular-esperados.mjs` (implementação independente).
  Rode `node tests/referencia/calcular-esperados.mjs` para ver de onde saiu cada número.

**Convenções do projeto (vale para todas as tarefas):**
- Datas são `DataISO` (`'AAAA-MM-DD'`, sem fuso). Nunca use `new Date('2026-09-28')` fora
  de `src/engine/datas.ts`.
- Taxas são **frações**: `0.1365` = 13,65% a.a.; `1.03` = 103% do CDI.
- Dias úteis contam no intervalo **[início, fim)**, ou seja, o dia da aplicação rende e o
  do resgate não.
- Arredondamento só na exibição (`src/formato.ts`). O engine trabalha com precisão total.
- Comentários e nomes em português, como no resto do projeto.
- Mensagens de commit em português, **sem assinatura de IA**.
- Sem estilos inline (`style=`): a CSP bloqueia. Use classes em `src/ui/estilos.css`.

**Cenário de teste padrão** (usado em quase todos os testes do engine):

```ts
// tests/engine/cenarioPadrao.ts
import { cenarioConstante } from '../../src/engine/indexadores';
export const CEN = cenarioConstante({ cdiAA: 0.1365, selicMetaAA: 0.1375, ipcaAA: 0.0422, trAM: 0.001646 });
export const INI = '2026-09-28'; // segunda-feira, dia útil
```

---

### Tarefa 0: Branch do marco

**Passo 1:** confirme que a `main` está limpa e crie a branch do M1.

```bash
git status --short
git switch -c m1
```

Esperado: `git status` vazio; `Switched to a new branch 'm1'`.

**Passo 2 (pedir confirmação ao usuário antes):** publique a `main` no GitHub, para que
o PR do M1 tenha base.

```bash
git push -u origin main
```

---

### Tarefa 1: Toolchain (Vite, Preact, TypeScript, Vitest, ESLint)

**Arquivos:**
- Criar: `package.json`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`,
  `index.html`, `src/main.tsx`, `src/ui/App.tsx` (provisório), `src/ui/estilos.css`,
  `tests/setup.ts`, `tests/fumaca.test.ts`

**Passo 1:** crie o `package.json`.

```json
{
  "name": "onde-investir",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

**Passo 2:** instale as dependências (versões mais recentes; o `package-lock.json` fixa).

```bash
npm install preact
npm install -D vite @preact/preset-vite typescript vitest jsdom @testing-library/preact @testing-library/jest-dom eslint @eslint/js typescript-eslint globals
```

**Passo 3:** crie o `tsconfig.json`.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

**Passo 4:** crie o `vite.config.ts`.

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
  },
});
```

**Passo 5:** crie o `tests/setup.ts`.

```ts
import '@testing-library/jest-dom/vitest';
```

**Passo 6:** crie o `eslint.config.js`.

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  { ignores: ['dist', 'coverage', '.wrangler', 'tests/referencia'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
]);
```

**Passo 7:** crie o `index.html`, o `src/main.tsx`, um `src/ui/App.tsx` provisório e o
`src/ui/estilos.css` vazio.

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Compare investimentos de renda fixa pelo valor líquido e aprenda o porquê de cada resultado." />
    <title>Rende — compare e aprenda</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```tsx
// src/main.tsx
import { render } from 'preact';
import { App } from './ui/App';
import './ui/estilos.css';

const raiz = document.getElementById('app');
if (!raiz) throw new Error('Elemento #app não encontrado no index.html');
render(<App />, raiz);
```

```tsx
// src/ui/App.tsx (provisório; substituído na Tarefa 24)
export function App() {
  return <main><h1>Rende</h1></main>;
}
```

**Passo 8:** escreva um teste de fumaça para validar o runner.

```ts
// tests/fumaca.test.ts
import { expect, it } from 'vitest';
it('o runner funciona', () => {
  expect(1 + 1).toBe(2);
});
```

**Passo 9:** rode tudo.

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Esperado: 1 teste passando; typecheck e lint sem erros; `dist/` gerado.

**Passo 10:** commit.

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts eslint.config.js index.html src tests/setup.ts tests/fumaca.test.ts
git commit -m "chore: toolchain Vite + Preact + TypeScript + Vitest + ESLint"
```

---

### Tarefa 2: CI no GitHub Actions

**Arquivos:** criar `.github/workflows/ci.yml` e `.github/dependabot.yml`.

**Passo 1:** workflow.

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]
jobs:
  verificar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

**Passo 2:** Dependabot.

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: weekly }
    open-pull-requests-limit: 5
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: monthly }
```

**Passo 3:** commit.

```bash
git add .github
git commit -m "ci: lint, typecheck, testes e build em todo PR; Dependabot"
```

---

### Tarefa 3: Cabeçalhos de segurança

**Arquivos:** criar `public/_headers`.

No M1 o app não chama nenhuma API externa, então `connect-src 'self'`. O M2 adiciona o
BCB e a BrasilAPI.

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
```

**Passo 1:** crie o arquivo e rode `npm run build`. Confira que `dist/_headers` existe.

**Passo 2:** commit.

```bash
git add public/_headers
git commit -m "feat: cabeçalhos de segurança (CSP restrita) para o Cloudflare Pages"
```

---

### Tarefa 4: Datas (`src/engine/datas.ts`) e erros tipados

**Arquivos:** criar `src/engine/erros.ts`, `src/engine/datas.ts` e `tests/engine/datas.test.ts`.

**Passo 1:** escreva o teste que falha.

```ts
// tests/engine/datas.test.ts
import { describe, expect, it } from 'vitest';
import { deDia, diaDaSemana, diasCorridos, paraDia, somarDias, somarMeses } from '../../src/engine/datas';
import { DataInvalidaError } from '../../src/engine/erros';

describe('datas', () => {
  it('converte ida e volta', () => {
    expect(paraDia('1970-01-02')).toBe(1);
    expect(deDia(paraDia('2026-09-28'))).toBe('2026-09-28');
  });
  it('rejeita datas inválidas', () => {
    expect(() => paraDia('2026-02-30')).toThrow(DataInvalidaError);
    expect(() => paraDia('2026-9-1')).toThrow(DataInvalidaError);
    expect(() => paraDia('28/09/2026')).toThrow(DataInvalidaError);
  });
  it('soma dias e conta dias corridos', () => {
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(diasCorridos('2026-09-28', '2027-09-28')).toBe(365);
    expect(diasCorridos('2026-09-28', '2028-09-28')).toBe(731); // passa por 29/02/2028
  });
  it('dia da semana (0 = domingo)', () => {
    expect(diaDaSemana('2026-09-27')).toBe(0);
    expect(diaDaSemana('2026-09-28')).toBe(1);
  });
  it('soma meses, ajustando para o último dia do mês quando necessário', () => {
    expect(somarMeses('2026-09-28', 6)).toBe('2027-03-28');
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29');
    expect(somarMeses('2026-11-15', -12)).toBe('2025-11-15');
    expect(somarMeses('2026-12-10', 1)).toBe('2027-01-10');
  });
});
```

**Passo 2:** rode `npx vitest run tests/engine/datas.test.ts`. Esperado: FALHA (módulo não existe).

**Passo 3:** implemente.

```ts
// src/engine/erros.ts
export class DataInvalidaError extends Error {
  constructor(public readonly entrada: string) {
    super(`Data inválida: "${entrada}" (use AAAA-MM-DD)`);
    this.name = 'DataInvalidaError';
  }
}

export class RegraNaoEncontradaError extends Error {
  constructor(public readonly regra: string, public readonly data: string) {
    super(`A regra "${regra}" não está cadastrada para a data ${data}`);
    this.name = 'RegraNaoEncontradaError';
  }
}

export class OfertaInvalidaError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'OfertaInvalidaError';
  }
}
```

```ts
// src/engine/datas.ts
import { DataInvalidaError } from './erros';

/** Data de calendário no formato AAAA-MM-DD, sem fuso horário. */
export type DataISO = string;

const MS_POR_DIA = 86_400_000;
const FORMATO = /^(\d{4})-(\d{2})-(\d{2})$/;

function partes(data: DataISO): [ano: number, mes: number, dia: number] {
  const m = FORMATO.exec(data);
  if (!m) throw new DataInvalidaError(data);
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    throw new DataInvalidaError(data);
  }
  return [ano, mes, dia];
}

function montar(ano: number, mes: number, dia: number): DataISO {
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Número de dias desde 1970-01-01. */
export function paraDia(data: DataISO): number {
  const [ano, mes, dia] = partes(data);
  return Date.UTC(ano, mes - 1, dia) / MS_POR_DIA;
}

export function deDia(dia: number): DataISO {
  return new Date(dia * MS_POR_DIA).toISOString().slice(0, 10);
}

export function somarDias(data: DataISO, dias: number): DataISO {
  return deDia(paraDia(data) + dias);
}

export function diasCorridos(inicio: DataISO, fim: DataISO): number {
  return paraDia(fim) - paraDia(inicio);
}

/** 0 = domingo … 6 = sábado. */
export function diaDaSemana(data: DataISO): number {
  return new Date(paraDia(data) * MS_POR_DIA).getUTCDay();
}

/** Soma meses; se o dia não existe no mês de destino, usa o último dia desse mês. */
export function somarMeses(data: DataISO, meses: number): DataISO {
  const [ano, mes, dia] = partes(data);
  const total = ano * 12 + (mes - 1) + meses;
  const novoAno = Math.floor(total / 12);
  const novoMes = total - novoAno * 12 + 1;
  const ultimoDia = new Date(Date.UTC(novoAno, novoMes, 0)).getUTCDate();
  return montar(novoAno, novoMes, Math.min(dia, ultimoDia));
}
```

**Passo 4:** rode o teste de novo. Esperado: PASSA.

**Passo 5:** commit.

```bash
git add src/engine/erros.ts src/engine/datas.ts tests/engine/datas.test.ts
git commit -m "feat(engine): datas ISO sem fuso e erros tipados"
```

---

### Tarefa 5: Calendário ANBIMA (`src/engine/calendario.ts`)

**Arquivos:** criar `src/engine/calendario.ts` e `tests/engine/calendario.test.ts`.

Os valores esperados vêm da referência (Páscoa pelo algoritmo de Gauss, diferente do
Meeus usado aqui).

**Passo 1:** teste que falha.

```ts
// tests/engine/calendario.test.ts
import { describe, expect, it } from 'vitest';
import { diasUteis, ehDiaUtil, feriadosNacionais, pascoa } from '../../src/engine/calendario';

describe('calendário', () => {
  it('Páscoa 2024–2035', () => {
    const esperado = ['2024-03-31', '2025-04-20', '2026-04-05', '2027-03-28', '2028-04-16', '2029-04-01',
      '2030-04-21', '2031-04-13', '2032-03-28', '2033-04-17', '2034-04-09', '2035-03-25'];
    expect(esperado.map((_, i) => pascoa(2024 + i))).toEqual(esperado);
  });
  it('feriados móveis derivados da Páscoa (2026)', () => {
    const f = feriadosNacionais(2026);
    for (const d of ['2026-02-16', '2026-02-17', '2026-04-03', '2026-06-04']) expect(f.has(d)).toBe(true);
  });
  it('20/11 é feriado nacional a partir de 2024', () => {
    expect(feriadosNacionais(2023).has('2023-11-20')).toBe(false);
    expect(feriadosNacionais(2024).has('2024-11-20')).toBe(true);
  });
  it('dia útil', () => {
    expect(ehDiaUtil('2026-09-28')).toBe(true);  // segunda
    expect(ehDiaUtil('2026-09-27')).toBe(false); // domingo
    expect(ehDiaUtil('2026-02-16')).toBe(false); // Carnaval
    expect(ehDiaUtil('2026-11-20')).toBe(false); // Consciência Negra
  });
  it('dias úteis em [início, fim)', () => {
    expect(diasUteis('2025-01-01', '2026-01-01')).toBe(252);
    expect(diasUteis('2026-01-01', '2027-01-01')).toBe(249);
    expect(diasUteis('2027-01-01', '2028-01-01')).toBe(251);
    expect(diasUteis('2026-09-28', '2026-10-28')).toBe(21);
    expect(diasUteis('2026-02-13', '2026-02-20')).toBe(3); // semana do Carnaval
    expect(diasUteis('2026-09-28', '2026-09-28')).toBe(0);
  });
});
```

**Passo 2:** rode `npx vitest run tests/engine/calendario.test.ts`. Esperado: FALHA.

**Passo 3:** implemente.

```ts
// src/engine/calendario.ts
import { type DataISO, deDia, diaDaSemana, paraDia, somarDias } from './datas';

/** Domingo de Páscoa, calendário gregoriano (algoritmo de Meeus/Jones/Butcher). */
export function pascoa(ano: number): DataISO {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

const FIXOS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'];
// Carnaval (segunda e terça), Sexta-feira Santa e Corpus Christi, em dias a partir da Páscoa.
const MOVEIS = [-48, -47, -2, 60];
const cache = new Map<number, ReadonlySet<DataISO>>();

/** Feriados nacionais usados pela ANBIMA para contagem de dias úteis. */
export function feriadosNacionais(ano: number): ReadonlySet<DataISO> {
  const existente = cache.get(ano);
  if (existente) return existente;
  const feriados = new Set<DataISO>(FIXOS.map((md) => `${ano}-${md}`));
  if (ano >= 2024) feriados.add(`${ano}-11-20`); // Lei 14.759/2023
  const p = pascoa(ano);
  for (const deslocamento of MOVEIS) feriados.add(somarDias(p, deslocamento));
  cache.set(ano, feriados);
  return feriados;
}

export function ehDiaUtil(data: DataISO): boolean {
  const semana = diaDaSemana(data);
  if (semana === 0 || semana === 6) return false;
  return !feriadosNacionais(Number(data.slice(0, 4))).has(data);
}

/** Dias úteis em [inicio, fim): o dia inicial conta, o final não (convenção de acúmulo do CDI). */
export function diasUteis(inicio: DataISO, fim: DataISO): number {
  const fimDia = paraDia(fim);
  let total = 0;
  for (let d = paraDia(inicio); d < fimDia; d++) if (ehDiaUtil(deDia(d))) total++;
  return total;
}
```

**Passo 4:** rode o teste. Esperado: PASSA.

**Passo 5 (conferência manual, opcional):** confira 2 ou 3 contagens na calculadora de
dias úteis da ANBIMA e anote o resultado no PR.

**Passo 6:** commit.

```bash
git add src/engine/calendario.ts tests/engine/calendario.test.ts
git commit -m "feat(engine): calendário de dias úteis ANBIMA com feriados móveis"
```

---

### Tarefa 6: Regras versionadas (`src/engine/regras/tipos.ts`)

**Arquivos:** criar `src/engine/regras/tipos.ts` e `tests/engine/regras/tipos.test.ts`.

**Passo 1:** teste que falha.

```ts
// tests/engine/regras/tipos.test.ts
import { describe, expect, it } from 'vitest';
import { resolverRegra, type VersaoRegra } from '../../../src/engine/regras/tipos';
import { RegraNaoEncontradaError } from '../../../src/engine/erros';

const VERSOES: VersaoRegra<number>[] = [
  { vigenciaInicio: '2020-01-01', vigenciaFim: '2025-01-01', fonte: 'fictícia v1', valor: 1 },
  { vigenciaInicio: '2025-01-01', fonte: 'fictícia v2', valor: 2 },
];

describe('resolverRegra', () => {
  it('aplica a versão vigente na data (início inclusive, fim exclusive)', () => {
    expect(resolverRegra('teste', VERSOES, '2024-12-31')).toBe(1);
    expect(resolverRegra('teste', VERSOES, '2025-01-01')).toBe(2);
    expect(resolverRegra('teste', VERSOES, '2040-06-01')).toBe(2);
  });
  it('data sem versão → erro explícito', () => {
    expect(() => resolverRegra('teste', VERSOES, '2019-12-31')).toThrow(RegraNaoEncontradaError);
    expect(() => resolverRegra('teste', VERSOES, '2019-12-31')).toThrow(/teste.*2019-12-31/);
  });
});
```

**Passo 2:** rode e veja FALHAR.

**Passo 3:** implemente.

```ts
// src/engine/regras/tipos.ts
import { type DataISO, paraDia } from '../datas';
import { RegraNaoEncontradaError } from '../erros';

export interface VersaoRegra<T> {
  /** Primeiro dia de vigência (inclusive). */
  vigenciaInicio: DataISO;
  /** Primeiro dia em que deixa de valer (exclusive). Ausente = ainda vigente. */
  vigenciaFim?: DataISO;
  /** URL da norma ou da página oficial. */
  fonte: string;
  valor: T;
}

export function resolverRegra<T>(nome: string, versoes: readonly VersaoRegra<T>[], data: DataISO): T {
  const dia = paraDia(data);
  const versao = versoes.find(
    (v) => paraDia(v.vigenciaInicio) <= dia && (v.vigenciaFim === undefined || dia < paraDia(v.vigenciaFim)),
  );
  if (!versao) throw new RegraNaoEncontradaError(nome, data);
  return versao.valor;
}
```

**Passo 4:** rode e veja PASSAR. **Passo 5:** commit
(`feat(engine): regras versionadas por vigência`).

---

### Tarefa 7: IR regressivo (`src/engine/regras/ir.ts`)

**Passo 1:** teste que falha, `tests/engine/regras/ir.test.ts`.

```ts
import { describe, expect, it } from 'vitest';
import { aliquotaIR } from '../../../src/engine/regras/ir';

describe('IR regressivo', () => {
  it.each([
    [1, 0.225], [180, 0.225], [181, 0.2], [360, 0.2], [361, 0.175], [720, 0.175], [721, 0.15], [5000, 0.15],
  ])('%i dias corridos → %f', (dias, aliquota) => {
    expect(aliquotaIR(dias, '2026-09-28')).toBe(aliquota);
  });
});
```

**Passo 2:** FALHA. **Passo 3:** implemente.

```ts
// src/engine/regras/ir.ts
import type { DataISO } from '../datas';
import { resolverRegra, type VersaoRegra } from './tipos';

export interface FaixaIR { ateDias: number; aliquota: number }

export const VERSOES_IR: readonly VersaoRegra<readonly FaixaIR[]>[] = [
  {
    vigenciaInicio: '2005-01-01',
    fonte: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11033.htm',
    valor: [
      { ateDias: 180, aliquota: 0.225 },
      { ateDias: 360, aliquota: 0.2 },
      { ateDias: 720, aliquota: 0.175 },
      { ateDias: Infinity, aliquota: 0.15 },
    ],
  },
];

export const FONTE_IR = VERSOES_IR[0]?.fonte ?? '';

/** Alíquota de IR sobre o rendimento, pelo prazo em dias corridos, na regra vigente no resgate. */
export function aliquotaIR(diasCorridos: number, dataResgate: DataISO): number {
  const faixas = resolverRegra('IR renda fixa', VERSOES_IR, dataResgate);
  const faixa = faixas.find((f) => diasCorridos <= f.ateDias);
  if (!faixa) throw new Error(`Faixa de IR não encontrada para ${diasCorridos} dias`);
  return faixa.aliquota;
}
```

**Passo 4:** PASSA. **Passo 5:** commit (`feat(engine): tabela regressiva de IR`).

---

### Tarefa 8: IOF regressivo (`src/engine/regras/iof.ts`)

**Passo 1:** teste que falha, `tests/engine/regras/iof.test.ts`.

```ts
import { describe, expect, it } from 'vitest';
import { aliquotaIOF } from '../../../src/engine/regras/iof';
import { OfertaInvalidaError } from '../../../src/engine/erros';

describe('IOF regressivo', () => {
  it.each([[1, 0.96], [2, 0.93], [10, 0.66], [15, 0.5], [29, 0.03], [30, 0], [400, 0]])(
    '%i dias → %f', (dias, aliquota) => expect(aliquotaIOF(dias, '2026-09-28')).toBeCloseTo(aliquota, 10),
  );
  it('resgate no mesmo dia não é um prazo válido', () => {
    expect(() => aliquotaIOF(0, '2026-09-28')).toThrow(OfertaInvalidaError);
  });
});
```

**Passo 2:** FALHA. **Passo 3:** implemente.

```ts
// src/engine/regras/iof.ts
import type { DataISO } from '../datas';
import { OfertaInvalidaError } from '../erros';
import { resolverRegra, type VersaoRegra } from './tipos';

/** Percentual do rendimento retido por IOF, do 1º ao 29º dia corrido (Decreto 6.306/2007, anexo). */
export const VERSOES_IOF: readonly VersaoRegra<readonly number[]>[] = [
  {
    vigenciaInicio: '2007-12-14',
    fonte: 'https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2007/decreto/d6306.htm',
    valor: [96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3],
  },
];

export const FONTE_IOF = VERSOES_IOF[0]?.fonte ?? '';

export function aliquotaIOF(diasCorridos: number, dataResgate: DataISO): number {
  if (diasCorridos < 1) throw new OfertaInvalidaError('O resgate precisa ser pelo menos 1 dia depois da aplicação');
  const tabela = resolverRegra('IOF regressivo', VERSOES_IOF, dataResgate);
  if (diasCorridos >= 30) return 0;
  return (tabela[diasCorridos - 1] ?? 0) / 100;
}
```

**Passo 4:** PASSA. **Passo 5:** commit (`feat(engine): tabela regressiva de IOF`).

---

### Tarefa 9: Prazo mínimo de LCI/LCA (`src/engine/regras/prazoMinimo.ts`)

**Passo 0 (verificação, antes de escrever o teste):** abra o texto da **Res. CMN
5.215/2025** (via busca no site do BCB, "Busca de normas") e o comunicado da B3
CE 016/2025-VPC. Confirme:
(a) 6 meses para LCI/LCA sem atualização por índice de preços, emitidas a partir de
23/05/2025; (b) **36 meses para LCI** e **12 meses para LCA** atualizadas por índice de
preços. Se o texto divergir, corrija os números no teste **e** nos dados, e anote no PR.

**Passo 1:** teste que falha, `tests/engine/regras/prazoMinimo.test.ts`.

```ts
import { describe, expect, it } from 'vitest';
import { dataMinimaResgate, prazoMinimoMeses } from '../../../src/engine/regras/prazoMinimo';
import { RegraNaoEncontradaError } from '../../../src/engine/erros';

describe('prazo mínimo LCI/LCA (Res. CMN 5.215/2025)', () => {
  it('sem índice de preços: 6 meses', () => {
    expect(prazoMinimoMeses('LCI', false, '2025-05-23')).toBe(6);
    expect(prazoMinimoMeses('LCA', false, '2026-09-28')).toBe(6);
  });
  it('com IPCA: LCI 36 meses, LCA 12 meses', () => {
    expect(prazoMinimoMeses('LCI', true, '2026-09-28')).toBe(36);
    expect(prazoMinimoMeses('LCA', true, '2026-09-28')).toBe(12);
  });
  it('emissão antes de 23/05/2025 ainda não está cadastrada (entra no M3)', () => {
    expect(() => prazoMinimoMeses('LCI', false, '2025-05-22')).toThrow(RegraNaoEncontradaError);
  });
  it('data mínima de resgate', () => {
    expect(dataMinimaResgate('LCI', false, '2026-09-28')).toBe('2027-03-28');
  });
});
```

**Passo 2:** FALHA. **Passo 3:** implemente.

```ts
// src/engine/regras/prazoMinimo.ts
import { type DataISO, somarMeses } from '../datas';
import { resolverRegra, type VersaoRegra } from './tipos';

export type ProdutoImobiliarioAgro = 'LCI' | 'LCA';
type Prazos = Record<ProdutoImobiliarioAgro, { comIPCA: number; demais: number }>;

// Versões anteriores (Res. CMN 5.118/2024 e alteração de fev/2025) entram no M3, com posições.
export const VERSOES_PRAZO_MINIMO: readonly VersaoRegra<Prazos>[] = [
  {
    vigenciaInicio: '2025-05-23',
    fonte: 'https://www.b3.com.br/data/files/63/43/8C/0B/43FF69106B8BCB69AC094EA8/CE%20016-2025-VPC%20PLATAFORMA%20NOME%20BALCAO%20B3_LCA_LCI.pdf',
    valor: { LCI: { comIPCA: 36, demais: 6 }, LCA: { comIPCA: 12, demais: 6 } },
  },
];

export const FONTE_PRAZO_MINIMO = VERSOES_PRAZO_MINIMO[0]?.fonte ?? '';

/** Prazo mínimo em meses, pela regra vigente na data de emissão. */
export function prazoMinimoMeses(produto: ProdutoImobiliarioAgro, comIPCA: boolean, dataEmissao: DataISO): number {
  const prazos = resolverRegra('prazo mínimo LCI/LCA', VERSOES_PRAZO_MINIMO, dataEmissao)[produto];
  return comIPCA ? prazos.comIPCA : prazos.demais;
}

export function dataMinimaResgate(produto: ProdutoImobiliarioAgro, comIPCA: boolean, dataEmissao: DataISO): DataISO {
  return somarMeses(dataEmissao, prazoMinimoMeses(produto, comIPCA, dataEmissao));
}
```

**Passo 4:** PASSA. **Passo 5:** commit (`feat(engine): prazo mínimo de LCI/LCA pela Res. CMN 5.215/2025`).

---

### Tarefa 10: Custódia do Tesouro e regra da poupança

**Arquivos:** `src/engine/regras/custodia.ts`, `src/engine/regras/poupanca.ts`,
`tests/engine/regras/custodia.test.ts`, `tests/engine/regras/poupanca.test.ts`.

**Aproximação documentada (vale para o M1):** a B3 provisiona a custódia diariamente
sobre o valor do dia. Aqui usamos a **média entre o valor aplicado e o bruto final**
× taxa × dias corridos/365. A isenção de R$ 10 mil do Tesouro Selic vale por CPF (soma
das posições). No M1, a aplicação simulada é tratada como a posição inteira; o M3 soma
as posições.

**Passo 1:** testes que falham.

```ts
// tests/engine/regras/custodia.test.ts
import { describe, expect, it } from 'vitest';
import { custodiaTesouro } from '../../../src/engine/regras/custodia';

describe('custódia B3 do Tesouro', () => {
  const base = { diasCorridos: 365, dataResgate: '2027-09-28' };
  it('Tesouro Selic até R$ 10 mil é isento', () => {
    expect(custodiaTesouro({ ...base, selic: true, valorAplicado: 8000, valorBruto: 9082.771734 })).toBe(0);
  });
  it('Tesouro Selic paga só sobre o excedente de R$ 10 mil', () => {
    expect(custodiaTesouro({ ...base, selic: true, valorAplicado: 10100, valorBruto: 11466.999314 })).toBeCloseTo(1.566999, 5);
  });
  it('demais títulos pagam sobre tudo', () => {
    // média 9.000 × 0,2% × 365/365
    expect(custodiaTesouro({ ...base, selic: false, valorAplicado: 8000, valorBruto: 10000 })).toBeCloseTo(18, 10);
  });
});
```

```ts
// tests/engine/regras/poupanca.test.ts
import { describe, expect, it } from 'vitest';
import { taxaBasePoupancaAM } from '../../../src/engine/regras/poupanca';

describe('regra da poupança', () => {
  it('Selic acima de 8,5%: 0,5% ao mês', () => {
    expect(taxaBasePoupancaAM(0.1375, '2026-09-28')).toBe(0.005);
  });
  it('Selic até 8,5%: 70% da Selic, mensalizada', () => {
    expect(taxaBasePoupancaAM(0.08, '2026-09-28')).toBeCloseTo(Math.pow(1.056, 1 / 12) - 1, 12);
    expect(taxaBasePoupancaAM(0.085, '2026-09-28')).toBeCloseTo(Math.pow(1 + 0.7 * 0.085, 1 / 12) - 1, 12);
  });
});
```

**Passo 2:** FALHA. **Passo 3:** implemente.

```ts
// src/engine/regras/custodia.ts
import type { DataISO } from '../datas';
import { resolverRegra, type VersaoRegra } from './tipos';

interface RegraCustodia { taxaAA: number; isencaoSelic: number }

export const VERSOES_CUSTODIA: readonly VersaoRegra<RegraCustodia>[] = [
  {
    vigenciaInicio: '2024-12-31',
    fonte: 'https://www.b3.com.br/pt_br/produtos-e-servicos/tarifas/tarifas-de-tesouro-direto/',
    valor: { taxaAA: 0.002, isencaoSelic: 10_000 },
  },
];

export const FONTE_CUSTODIA = VERSOES_CUSTODIA[0]?.fonte ?? '';

export interface EntradaCustodia {
  selic: boolean;
  valorAplicado: number;
  valorBruto: number;
  diasCorridos: number;
  dataResgate: DataISO;
}

/** Custódia descontada no resgate (aproximação pela média entre aplicado e bruto). */
export function custodiaTesouro(e: EntradaCustodia): number {
  const regra = resolverRegra('custódia B3 Tesouro', VERSOES_CUSTODIA, e.dataResgate);
  const media = (e.valorAplicado + e.valorBruto) / 2;
  const isencao = e.selic ? regra.isencaoSelic : 0;
  return regra.taxaAA * (e.diasCorridos / 365) * Math.max(0, media - isencao);
}
```

```ts
// src/engine/regras/poupanca.ts
import type { DataISO } from '../datas';
import { resolverRegra, type VersaoRegra } from './tipos';

interface RegraPoupanca { limiarSelicAA: number; taxaFixaAM: number; fracaoSelic: number }

export const VERSOES_POUPANCA: readonly VersaoRegra<RegraPoupanca>[] = [
  {
    vigenciaInicio: '2012-05-04',
    fonte: 'https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2012/lei/l12703.htm',
    valor: { limiarSelicAA: 0.085, taxaFixaAM: 0.005, fracaoSelic: 0.7 },
  },
];

export const FONTE_POUPANCA = VERSOES_POUPANCA[0]?.fonte ?? '';

/** Remuneração básica mensal da poupança, sem a TR. */
export function taxaBasePoupancaAM(selicMetaAA: number, data: DataISO): number {
  const r = resolverRegra('poupança', VERSOES_POUPANCA, data);
  return selicMetaAA > r.limiarSelicAA ? r.taxaFixaAM : Math.pow(1 + r.fracaoSelic * selicMetaAA, 1 / 12) - 1;
}
```

**Passo 4:** PASSA. **Passo 5:** commit (`feat(engine): custódia do Tesouro e regra da poupança`).

---

### Tarefa 11: Cenário e indexadores (`src/engine/indexadores.ts`)

`Cenario` é uma interface de funções por data. No M1 existe só o `cenarioConstante`; no
M2 entram as curvas do Focus, sem mudar quem consome.

**Passo 1:** crie `tests/engine/cenarioPadrao.ts` (bloco no topo do plano) e o teste que falha.

```ts
// tests/engine/indexadores.test.ts
import { describe, expect, it } from 'vitest';
import { fatorIPCA, fatorPercentualCDI, fatorPrefixado, fatorSelic, taxaDiaria } from '../../src/engine/indexadores';
import { CEN, INI } from './cenarioPadrao';

describe('indexadores', () => {
  it('taxa diária base 252', () => {
    expect(Math.pow(1 + taxaDiaria(0.1365), 252)).toBeCloseTo(1.1365, 12);
  });
  it('100% do CDI em 21 dias úteis = (1 + CDI)^(21/252)', () => {
    expect(fatorPercentualCDI(CEN, 1, INI, '2026-10-28')).toBeCloseTo(Math.pow(1.1365, 21 / 252), 12);
  });
  it('103% do CDI em 1 ano (250 dias úteis) — referência', () => {
    expect(10000 * fatorPercentualCDI(CEN, 1.03, INI, '2027-09-28')).toBeCloseTo(11396.771285, 4);
  });
  it('prefixado 13% a.a. em 2 anos (502 dias úteis) — referência', () => {
    expect(10000 * fatorPrefixado(0.13, INI, '2028-09-28')).toBeCloseTo(12756.620315, 4);
  });
  it('IPCA 4,22% + 7% a.a. em 3 anos — referência', () => {
    expect(10000 * fatorIPCA(CEN, INI, '2029-09-28') * fatorPrefixado(0.07, INI, '2029-09-28')).toBeCloseTo(13837.746047, 3);
  });
  it('Selic over constante = CDI no cenário padrão', () => {
    expect(fatorSelic(CEN, INI, '2027-09-28')).toBeCloseTo(Math.pow(1.1365, 250 / 252), 10);
  });
});
```

**Passo 2:** FALHA. **Passo 3:** implemente.

```ts
// src/engine/indexadores.ts
import { diasUteis, ehDiaUtil } from './calendario';
import { type DataISO, deDia, paraDia } from './datas';

/** Taxas vigentes em cada data (frações). No M2 ganha implementação por curva do Focus. */
export interface Cenario {
  cdiAA(data: DataISO): number;
  selicOverAA(data: DataISO): number;
  selicMetaAA(data: DataISO): number;
  ipcaAA(data: DataISO): number;
  trAM(data: DataISO): number;
}

export interface ParametrosCenarioConstante {
  cdiAA: number;
  selicMetaAA: number;
  ipcaAA: number;
  trAM: number;
  /** Padrão: igual ao CDI. */
  selicOverAA?: number;
}

export function cenarioConstante(p: ParametrosCenarioConstante): Cenario {
  const over = p.selicOverAA ?? p.cdiAA;
  return {
    cdiAA: () => p.cdiAA,
    selicOverAA: () => over,
    selicMetaAA: () => p.selicMetaAA,
    ipcaAA: () => p.ipcaAA,
    trAM: () => p.trAM,
  };
}

export const taxaDiaria = (taxaAA: number): number => Math.pow(1 + taxaAA, 1 / 252) - 1;

function acumularPorDiaUtil(inicio: DataISO, fim: DataISO, fatorDoDia: (data: DataISO) => number): number {
  const fimDia = paraDia(fim);
  let fator = 1;
  for (let d = paraDia(inicio); d < fimDia; d++) {
    const data = deDia(d);
    if (ehDiaUtil(data)) fator *= fatorDoDia(data);
  }
  return fator;
}

/** Fator de um pós-fixado: percentual aplicado sobre a taxa DIÁRIA do CDI (padrão B3). */
export function fatorPercentualCDI(cen: Cenario, percentual: number, inicio: DataISO, fim: DataISO): number {
  return acumularPorDiaUtil(inicio, fim, (d) => 1 + taxaDiaria(cen.cdiAA(d)) * percentual);
}

export function fatorSelic(cen: Cenario, inicio: DataISO, fim: DataISO): number {
  return acumularPorDiaUtil(inicio, fim, (d) => 1 + taxaDiaria(cen.selicOverAA(d)));
}

export function fatorPrefixado(taxaAA: number, inicio: DataISO, fim: DataISO): number {
  return Math.pow(1 + taxaAA, diasUteis(inicio, fim) / 252);
}

export function fatorIPCA(cen: Cenario, inicio: DataISO, fim: DataISO): number {
  return acumularPorDiaUtil(inicio, fim, (d) => Math.pow(1 + cen.ipcaAA(d), 1 / 252));
}
```

**Passo 4:** PASSA. **Passo 5:** commit (`feat(engine): cenário constante e fatores por indexador`).

---

### Tarefa 12: Simulação de renda fixa bancária (`src/engine/produtos.ts`, parte 1)

Esta tarefa cobre CDB/RDB/LC/LCI/LCA com pós, pré e IPCA+, mais IOF, IR e memória de
cálculo. Tesouro e poupança vêm nas Tarefas 13 e 14, e as validações na 15.

**Passo 1:** teste que falha.

```ts
// tests/engine/produtos.test.ts
import { describe, expect, it } from 'vitest';
import { simular, type Aplicacao, type ResultadoSimulacao } from '../../src/engine/produtos';
import { CEN, INI } from './cenarioPadrao';

const cdb103: Aplicacao = { produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, valor: 10000, dataAplicacao: INI };
const lci80: Aplicacao = { produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 }, valor: 10000, dataAplicacao: INI };

function somaDosPassos(r: ResultadoSimulacao): number {
  const v = Object.fromEntries(r.passos.map((p) => [p.id, p.valor]));
  return (v.aplicado ?? 0) + (v.rendimentoBruto ?? 0) - (v.iof ?? 0) - (v.custodia ?? 0) - (v.ir ?? 0);
}

describe('simular — renda fixa bancária (valores da referência)', () => {
  it.each([
    ['2027-03-29', 10527.063976, 0.2, 10508.07648],
    ['2027-09-28', 11152.33631, 0.175, 11068.912881],
    ['2028-09-28', 12551.897435, 0.15, 12262.041408],
    ['2029-09-28', 14089.009211, 0.15, 13567.234383],
  ])('resgate em %s', (resgate, liquidoCDB, aliquota, liquidoLCI) => {
    const cdb = simular(cdb103, resgate, CEN);
    expect(cdb.valorLiquido).toBeCloseTo(liquidoCDB, 4);
    expect(cdb.aliquotaIR).toBe(aliquota);
    const lci = simular(lci80, resgate, CEN);
    expect(lci.valorLiquido).toBeCloseTo(liquidoLCI, 4);
    expect(lci.ir).toBe(0);
    expect(lci.isentoIR).toBe(true);
  });
  it('CDB prefixado 13% a.a., 2 anos', () => {
    const r = simular({ ...cdb103, indexacao: { tipo: 'PRE', taxaAA: 0.13 } }, '2028-09-28', CEN);
    expect(r.valorBruto).toBeCloseTo(12756.620315, 4);
    expect(r.valorLiquido).toBeCloseTo(12343.127268, 4);
  });
  it('CDB IPCA + 7% a.a., 3 anos', () => {
    const r = simular({ ...cdb103, indexacao: { tipo: 'IPCA_MAIS', taxaRealAA: 0.07 } }, '2029-09-28', CEN);
    expect(r.valorLiquido).toBeCloseTo(13262.08414, 3);
  });
  it('IOF antes do IR: CDB 100% resgatado em 15 dias', () => {
    const r = simular({ ...cdb103, indexacao: { tipo: 'POS_CDI', percentualCDI: 1 } }, '2026-10-13', CEN);
    expect(r.diasUteis).toBe(10);
    expect(r.aliquotaIOF).toBe(0.5);
    expect(r.iof).toBeCloseTo(25.452134, 5);
    expect(r.ir).toBeCloseTo(5.72673, 5);
    expect(r.valorLiquido).toBeCloseTo(10019.725404, 5);
  });
  it('memória de cálculo: os passos fecham no líquido', () => {
    for (const r of [simular(cdb103, '2026-10-13', CEN), simular(lci80, '2028-09-28', CEN)]) {
      expect(r.passos.map((p) => p.id)).toEqual(['aplicado', 'rendimentoBruto', 'iof', 'custodia', 'ir', 'liquido']);
      expect(somaDosPassos(r)).toBeCloseTo(r.valorLiquido, 9);
      expect(r.passos.at(-1)?.valor).toBe(r.valorLiquido);
    }
  });
});
```

**Passo 2:** FALHA. **Passo 3:** implemente (o arquivo cresce nas próximas tarefas).

```ts
// src/engine/produtos.ts
import { diasUteis } from './calendario';
import { type DataISO, diasCorridos } from './datas';
import { type Cenario, fatorIPCA, fatorPercentualCDI, fatorPrefixado } from './indexadores';
import { aliquotaIOF } from './regras/iof';
import { aliquotaIR } from './regras/ir';

export type TipoProduto =
  | 'CDB' | 'RDB' | 'LC' | 'LCI' | 'LCA'
  | 'TESOURO_SELIC' | 'TESOURO_PREFIXADO' | 'TESOURO_IPCA'
  | 'POUPANCA';

export type Indexacao =
  | { tipo: 'POS_CDI'; percentualCDI: number } // 1.03 = 103% do CDI
  | { tipo: 'PRE'; taxaAA: number }
  | { tipo: 'IPCA_MAIS'; taxaRealAA: number }
  | { tipo: 'SELIC' }
  | { tipo: 'POUPANCA' };

export type TipoIndexacao = Indexacao['tipo'];

/** O que se compara: produto + como rende. */
export interface Oferta { produto: TipoProduto; indexacao: Indexacao }

/** Uma oferta aplicada com valor e data. */
export interface Aplicacao extends Oferta { valor: number; dataAplicacao: DataISO }

export type IdPasso = 'aplicado' | 'rendimentoBruto' | 'iof' | 'custodia' | 'ir' | 'liquido';
export interface Passo { id: IdPasso; valor: number }

export interface ResultadoSimulacao {
  aplicacao: Aplicacao;
  dataResgate: DataISO;
  diasCorridos: number;
  diasUteis: number;
  fator: number;
  valorAplicado: number;
  valorBruto: number;
  rendimentoBruto: number;
  aliquotaIOF: number;
  iof: number;
  custodia: number;
  isentoIR: boolean;
  aliquotaIR: number;
  ir: number;
  valorLiquido: number;
  /** Só para poupança: aniversários mensais completos. */
  mesesPoupanca?: number;
  passos: Passo[];
}

const ISENTOS_IR: ReadonlySet<TipoProduto> = new Set(['LCI', 'LCA', 'POUPANCA']);

export const ehIsentoIR = (produto: TipoProduto): boolean => ISENTOS_IR.has(produto);
export const ehTesouro = (produto: TipoProduto): boolean => produto.startsWith('TESOURO_');
export const garantiaDe = (produto: TipoProduto): 'FGC' | 'TESOURO_NACIONAL' =>
  ehTesouro(produto) ? 'TESOURO_NACIONAL' : 'FGC';

function fatorBruto(ap: Aplicacao, dataResgate: DataISO, cen: Cenario): number {
  const ix = ap.indexacao;
  switch (ix.tipo) {
    case 'POS_CDI': return fatorPercentualCDI(cen, ix.percentualCDI, ap.dataAplicacao, dataResgate);
    case 'PRE': return fatorPrefixado(ix.taxaAA, ap.dataAplicacao, dataResgate);
    case 'IPCA_MAIS':
      return fatorIPCA(cen, ap.dataAplicacao, dataResgate) * fatorPrefixado(ix.taxaRealAA, ap.dataAplicacao, dataResgate);
    case 'SELIC':
    case 'POUPANCA':
      throw new Error(`Indexação ${ix.tipo} ainda não suportada`);
  }
}

function montarPassos(r: Omit<ResultadoSimulacao, 'passos'>): Passo[] {
  return [
    { id: 'aplicado', valor: r.valorAplicado },
    { id: 'rendimentoBruto', valor: r.rendimentoBruto },
    { id: 'iof', valor: r.iof },
    { id: 'custodia', valor: r.custodia },
    { id: 'ir', valor: r.ir },
    { id: 'liquido', valor: r.valorLiquido },
  ];
}

export function simular(ap: Aplicacao, dataResgate: DataISO, cen: Cenario): ResultadoSimulacao {
  const dc = diasCorridos(ap.dataAplicacao, dataResgate);
  const fator = fatorBruto(ap, dataResgate, cen);
  const valorBruto = ap.valor * fator;
  const rendimentoBruto = valorBruto - ap.valor;
  const isentoIR = ehIsentoIR(ap.produto);
  const aliqIOF = isentoIR ? 0 : aliquotaIOF(dc, dataResgate);
  const iof = Math.max(0, rendimentoBruto) * aliqIOF;
  const custodia = 0;
  const aliqIR = isentoIR ? 0 : aliquotaIR(dc, dataResgate);
  const ir = Math.max(0, rendimentoBruto - iof - custodia) * aliqIR;
  const base = {
    aplicacao: ap, dataResgate, diasCorridos: dc, diasUteis: diasUteis(ap.dataAplicacao, dataResgate), fator,
    valorAplicado: ap.valor, valorBruto, rendimentoBruto, aliquotaIOF: aliqIOF, iof, custodia,
    isentoIR, aliquotaIR: aliqIR, ir, valorLiquido: valorBruto - iof - custodia - ir,
  };
  return { ...base, passos: montarPassos(base) };
}
```

**Passo 4:** PASSA. **Passo 5:** commit (`feat(engine): simulação de CDB/LCI/LCA pós, pré e IPCA+ com IOF, IR e memória de cálculo`).

---

### Tarefa 13: Tesouro Selic, Prefixado e IPCA+ (custódia)

**Passo 1:** acrescente ao `tests/engine/produtos.test.ts`:

```ts
describe('simular — Tesouro', () => {
  const selic = (valor: number): Aplicacao => ({ produto: 'TESOURO_SELIC', indexacao: { tipo: 'SELIC' }, valor, dataAplicacao: INI });
  it.each([
    [8000, 0, 8893.286681],
    [10100, 1.566999, 11226.48166],
    [50000, 86.767323, 55511.458713],
  ])('Tesouro Selic R$ %i por 1 ano', (valor, custodia, liquido) => {
    const r = simular(selic(valor), '2027-09-28', CEN);
    expect(r.custodia).toBeCloseTo(custodia, 4);
    expect(r.valorLiquido).toBeCloseTo(liquido, 3);
  });
  it('a custódia sai da base do IR', () => {
    const r = simular(selic(50000), '2027-09-28', CEN);
    expect(r.ir).toBeCloseTo((r.rendimentoBruto - r.custodia) * 0.175, 8);
  });
  it('Tesouro Prefixado paga custódia sobre tudo', () => {
    const r = simular({ produto: 'TESOURO_PREFIXADO', indexacao: { tipo: 'PRE', taxaAA: 0.13 }, valor: 8000, dataAplicacao: INI }, '2028-09-28', CEN);
    expect(r.custodia).toBeGreaterThan(0);
  });
});
```

**Passo 2:** FALHA ("Indexação SELIC ainda não suportada").

**Passo 3:** em `src/engine/produtos.ts`, importe `fatorSelic` e `custodiaTesouro`, troque
o caso `'SELIC'` e a custódia:

```ts
    case 'SELIC': return fatorSelic(cen, ap.dataAplicacao, dataResgate);
    case 'POUPANCA':
      throw new Error('Poupança é calculada por aniversário mensal (simularPoupanca)');
```

```ts
  const custodia = ehTesouro(ap.produto)
    ? custodiaTesouro({ selic: ap.produto === 'TESOURO_SELIC', valorAplicado: ap.valor, valorBruto, diasCorridos: dc, dataResgate })
    : 0;
```

**Passo 4:** PASSA (todos os testes de produtos). **Passo 5:** commit (`feat(engine): Tesouro Selic/Prefixado/IPCA+ com custódia B3`).

---

### Tarefa 14: Poupança (aniversário mensal)

**Passo 1:** acrescente ao `tests/engine/produtos.test.ts`:

```ts
import { cenarioConstante } from '../../src/engine/indexadores';

describe('simular — poupança', () => {
  const poup = (dataAplicacao: string): Aplicacao => ({ produto: 'POUPANCA', indexacao: { tipo: 'POUPANCA' }, valor: 10000, dataAplicacao });
  it('só rende no aniversário: 5 meses na véspera, 6 no dia', () => {
    const antes = simular(poup(INI), '2027-03-27', CEN);
    expect(antes.mesesPoupanca).toBe(5);
    expect(antes.valorLiquido).toBeCloseTo(10337.16894, 5);
    const noDia = simular(poup(INI), '2027-03-28', CEN);
    expect(noDia.mesesPoupanca).toBe(6);
    expect(noDia.valorLiquido).toBeCloseTo(10405.95484, 5);
  });
  it('depósito no dia 31 faz aniversário no dia 1º do mês seguinte', () => {
    expect(simular(poup('2026-10-31'), '2026-11-30', CEN).valorLiquido).toBe(10000);
    expect(simular(poup('2026-10-31'), '2026-12-01', CEN).valorLiquido).toBeCloseTo(10066.5423, 5);
  });
  it('regra dos 70% da Selic quando Selic ≤ 8,5%', () => {
    const cen8 = cenarioConstante({ cdiAA: 0.079, selicMetaAA: 0.08, ipcaAA: 0.04, trAM: 0 });
    expect(simular(poup(INI), '2026-12-28', cen8).valorLiquido).toBeCloseTo(10137.152491, 5);
  });
  it('isenta de IR e de IOF', () => {
    const r = simular(poup(INI), '2026-10-28', CEN);
    expect(r.ir).toBe(0);
    expect(r.iof).toBe(0);
  });
});
```

**Passo 2:** FALHA.

**Passo 3:** em `src/engine/produtos.ts`, importe `somarMeses` e `taxaBasePoupancaAM`,
acrescente `simularPoupanca` e desvie para ela no início de `simular`:

```ts
/** Depósitos nos dias 29, 30 e 31 contam como feitos no dia 1º do mês seguinte. */
function inicioEfetivoPoupanca(data: DataISO): DataISO {
  const dia = Number(data.slice(8, 10));
  return dia >= 29 ? somarMeses(`${data.slice(0, 8)}01`, 1) : data;
}

function simularPoupanca(ap: Aplicacao, dataResgate: DataISO, cen: Cenario): ResultadoSimulacao {
  const inicio = inicioEfetivoPoupanca(ap.dataAplicacao);
  let valor = ap.valor;
  let meses = 0;
  for (let aniversarioAnterior = inicio; ; meses++) {
    const proximo = somarMeses(inicio, meses + 1);
    if (proximo > dataResgate) break;
    const base = taxaBasePoupancaAM(cen.selicMetaAA(aniversarioAnterior), aniversarioAnterior);
    valor *= (1 + base) * (1 + cen.trAM(aniversarioAnterior));
    aniversarioAnterior = proximo;
  }
  const semDescontos = {
    aplicacao: ap, dataResgate, diasCorridos: diasCorridos(ap.dataAplicacao, dataResgate),
    diasUteis: diasUteis(ap.dataAplicacao, dataResgate), fator: valor / ap.valor,
    valorAplicado: ap.valor, valorBruto: valor, rendimentoBruto: valor - ap.valor,
    aliquotaIOF: 0, iof: 0, custodia: 0, isentoIR: true, aliquotaIR: 0, ir: 0, valorLiquido: valor,
    mesesPoupanca: meses,
  };
  return { ...semDescontos, passos: montarPassos(semDescontos) };
}
```

A comparação `proximo > dataResgate` é segura porque `DataISO` tem tamanho fixo e ordena
lexicograficamente. No início de `simular`:

```ts
  if (ap.produto === 'POUPANCA') return simularPoupanca(ap, dataResgate, cen);
```

**Passo 4:** PASSA. **Passo 5:** commit (`feat(engine): poupança por aniversário mensal`).

---

### Tarefa 15: Validações

**Passo 1:** teste que falha, `tests/engine/validacao.test.ts`.

```ts
import { describe, expect, it } from 'vitest';
import { INDEXACOES_PERMITIDAS, simular, type Aplicacao } from '../../src/engine/produtos';
import { OfertaInvalidaError } from '../../src/engine/erros';
import { CEN, INI } from './cenarioPadrao';

const lci: Aplicacao = { produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 }, valor: 10000, dataAplicacao: INI };

describe('validação de aplicações', () => {
  it('LCI antes do prazo mínimo → erro explicando a data mínima', () => {
    expect(() => simular(lci, '2027-03-27', CEN)).toThrow(OfertaInvalidaError);
    expect(() => simular(lci, '2027-03-27', CEN)).toThrow(/28\/03\/2027/);
    expect(() => simular(lci, '2027-03-28', CEN)).not.toThrow();
  });
  it('LCI IPCA+ exige 36 meses', () => {
    const ipca = { ...lci, indexacao: { tipo: 'IPCA_MAIS', taxaRealAA: 0.06 } } as const;
    expect(() => simular(ipca, '2029-09-27', CEN)).toThrow(OfertaInvalidaError);
    expect(() => simular(ipca, '2029-09-28', CEN)).not.toThrow();
  });
  it('indexação incompatível com o produto', () => {
    expect(() => simular({ ...lci, produto: 'TESOURO_SELIC' }, '2027-09-28', CEN)).toThrow(OfertaInvalidaError);
    expect(INDEXACOES_PERMITIDAS.TESOURO_SELIC).toEqual(['SELIC']);
  });
  it('valores e datas inválidos', () => {
    expect(() => simular({ ...lci, valor: 0 }, '2027-09-28', CEN)).toThrow(OfertaInvalidaError);
    expect(() => simular({ ...lci, valor: Number.NaN }, '2027-09-28', CEN)).toThrow(OfertaInvalidaError);
    expect(() => simular(lci, INI, CEN)).toThrow(OfertaInvalidaError);
    expect(() => simular({ ...lci, indexacao: { tipo: 'POS_CDI', percentualCDI: 0 } }, '2027-09-28', CEN)).toThrow(OfertaInvalidaError);
  });
});
```

**Passo 2:** FALHA. **Passo 3:** em `src/engine/produtos.ts`, acrescente o código abaixo e
chame `validarAplicacao(ap, dataResgate)` na **primeira linha** de `simular`, antes do
desvio da poupança.

```ts
import { OfertaInvalidaError } from './erros';
import { dataMinimaResgate } from './regras/prazoMinimo';
import { dataBR } from './datas'; // junte ao import de './datas' já existente

export const INDEXACOES_PERMITIDAS: Record<TipoProduto, readonly [TipoIndexacao, ...TipoIndexacao[]]> = {
  CDB: ['POS_CDI', 'PRE', 'IPCA_MAIS'],
  RDB: ['POS_CDI', 'PRE', 'IPCA_MAIS'],
  LC: ['POS_CDI', 'PRE', 'IPCA_MAIS'],
  LCI: ['POS_CDI', 'PRE', 'IPCA_MAIS'],
  LCA: ['POS_CDI', 'PRE', 'IPCA_MAIS'],
  TESOURO_SELIC: ['SELIC'],
  TESOURO_PREFIXADO: ['PRE'],
  TESOURO_IPCA: ['IPCA_MAIS'],
  POUPANCA: ['POUPANCA'],
};

export function validarAplicacao(ap: Aplicacao, dataResgate: DataISO): void {
  if (!Number.isFinite(ap.valor) || ap.valor <= 0) throw new OfertaInvalidaError('O valor aplicado precisa ser maior que zero');
  if (!INDEXACOES_PERMITIDAS[ap.produto].includes(ap.indexacao.tipo)) {
    throw new OfertaInvalidaError(`${ap.produto} não aceita a indexação ${ap.indexacao.tipo}`);
  }
  if (diasCorridos(ap.dataAplicacao, dataResgate) < 1) throw new OfertaInvalidaError('O resgate precisa ser depois da aplicação');
  const ix = ap.indexacao;
  if (ix.tipo === 'POS_CDI' && !(ix.percentualCDI > 0)) throw new OfertaInvalidaError('O percentual do CDI precisa ser maior que zero');
  if (ix.tipo === 'PRE' && !Number.isFinite(ix.taxaAA)) throw new OfertaInvalidaError('Taxa prefixada inválida');
  if (ix.tipo === 'IPCA_MAIS' && !Number.isFinite(ix.taxaRealAA)) throw new OfertaInvalidaError('Taxa real inválida');
  if (ap.produto === 'LCI' || ap.produto === 'LCA') {
    const minima = dataMinimaResgate(ap.produto, ix.tipo === 'IPCA_MAIS', ap.dataAplicacao);
    if (dataResgate < minima) {
      throw new OfertaInvalidaError(`${ap.produto} tem prazo mínimo legal: o resgate só é possível a partir de ${dataBR(minima)}`);
    }
  }
}
```

O engine não importa nada de fora de `src/engine/`. Acrescente em `src/engine/datas.ts`
(com um teste em `datas.test.ts`: `expect(dataBR('2027-03-28')).toBe('28/03/2027')`):

```ts
/** DD/MM/AAAA, para mensagens de erro do engine. */
export function dataBR(data: DataISO): string {
  partes(data);
  return `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
}
```

**Passo 4:** PASSA (rode a suíte inteira: `npm test`). **Passo 5:** commit (`feat(engine): validação de aplicações e prazo mínimo legal`).

---

### Tarefa 16: Duelo A × B (`src/engine/comparador.ts`)

**Passo 1:** teste que falha, `tests/engine/comparador.test.ts`.

```ts
import { describe, expect, it } from 'vitest';
import { duelar } from '../../src/engine/comparador';
import type { Oferta } from '../../src/engine/produtos';
import { CEN, INI } from './cenarioPadrao';

const cdb103: Oferta = { produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 } };
const lci = (p: number): Oferta => ({ produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: p } });

describe('duelo', () => {
  it('CDB 103% vence LCI 80% em 2 anos com CDI a 13,65%', () => {
    const d = duelar(10000, INI, '2028-09-28', cdb103, lci(0.8), CEN);
    expect(d.vencedor).toBe('A');
    expect(d.diferenca).toBeCloseTo(289.856027, 4);
    expect(d.diferencaPercentual).toBeCloseTo(289.856027 / 12262.041408, 8);
  });
  it('LCI 95% vence CDB 103%', () => {
    expect(duelar(10000, INI, '2028-09-28', cdb103, lci(0.95), CEN).vencedor).toBe('B');
  });
  it('mesma oferta dos dois lados → empate', () => {
    expect(duelar(10000, INI, '2028-09-28', cdb103, cdb103, CEN).vencedor).toBe('EMPATE');
  });
});
```

**Passo 2:** FALHA. **Passo 3:** implemente.

```ts
// src/engine/comparador.ts
import type { DataISO } from './datas';
import type { Cenario } from './indexadores';
import { simular, type Oferta, type ResultadoSimulacao } from './produtos';

/** Diferença abaixo de meio centavo conta como empate. */
export const LIMIAR_EMPATE = 0.005;

export interface Duelo {
  a: ResultadoSimulacao;
  b: ResultadoSimulacao;
  vencedor: 'A' | 'B' | 'EMPATE';
  /** Em reais, sempre positiva. */
  diferenca: number;
  /** Diferença sobre o líquido do perdedor. */
  diferencaPercentual: number;
}

/** Compara duas ofertas com o MESMO valor e datas (base igual). */
export function duelar(
  valor: number, dataAplicacao: DataISO, dataResgate: DataISO, a: Oferta, b: Oferta, cen: Cenario,
): Duelo {
  const ra = simular({ ...a, valor, dataAplicacao }, dataResgate, cen);
  const rb = simular({ ...b, valor, dataAplicacao }, dataResgate, cen);
  const bruta = ra.valorLiquido - rb.valorLiquido;
  const diferenca = Math.abs(bruta);
  return {
    a: ra,
    b: rb,
    vencedor: diferenca < LIMIAR_EMPATE ? 'EMPATE' : bruta > 0 ? 'A' : 'B',
    diferenca,
    diferencaPercentual: diferenca / Math.min(ra.valorLiquido, rb.valorLiquido),
  };
}
```

**Passo 4:** PASSA. **Passo 5:** commit (`feat(engine): duelo entre duas ofertas`).

---

### Tarefa 17: Equivalência (`src/engine/equivalencia.ts`)

**Passo 1:** teste que falha, `tests/engine/equivalencia.test.ts`. Os números vêm da
bisseção independente da referência.

```ts
import { describe, expect, it } from 'vitest';
import { calcularEquivalencias } from '../../src/engine/equivalencia';
import { simular, type Aplicacao } from '../../src/engine/produtos';
import { CEN, INI } from './cenarioPadrao';

const lci80: Aplicacao = { produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 }, valor: 10000, dataAplicacao: INI };

describe('equivalência', () => {
  it('LCI 80% por 2 anos: exata 92,57% × regra de bolso 94,12%', () => {
    const eq = calcularEquivalencias(lci80, '2028-09-28', CEN);
    expect(eq.tributadoPosCDI).toBeCloseTo(0.925707, 5);
    expect(eq.regraDeBolso).toBeCloseTo(0.8 / 0.85, 10);
    expect(eq.tributadoPre).toBeCloseTo(0.12575, 5);
    expect(eq.tributadoIpcaMais).toBeCloseTo(0.080167, 5);
    expect(eq.isentoPosCDI).toBeCloseTo(0.8, 6);
    expect(eq.aliquotaIR).toBe(0.15);
  });
  it('LCI 80% por 1 ano: exata 95,98% × regra de bolso 96,97%', () => {
    const eq = calcularEquivalencias(lci80, '2027-09-28', CEN);
    expect(eq.tributadoPosCDI).toBeCloseTo(0.959773, 5);
    expect(eq.regraDeBolso).toBeCloseTo(0.8 / 0.825, 10);
    expect(eq.tributadoPre).toBeCloseTo(0.130667, 5);
    expect(eq.tributadoIpcaMais).toBeCloseTo(0.084885, 5);
  });
  it('CDB 103% por 2 anos equivale a LCI 89,17% (bolso 87,55%)', () => {
    const cdb: Aplicacao = { ...lci80, produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 } };
    const eq = calcularEquivalencias(cdb, '2028-09-28', CEN);
    expect(eq.isentoPosCDI).toBeCloseTo(0.891676, 5);
    expect(eq.regraDeBolso).toBeCloseTo(1.03 * 0.85, 10);
  });
  it('ida e volta: o CDB na taxa exata reproduz o líquido da LCI', () => {
    const eq = calcularEquivalencias(lci80, '2028-09-28', CEN);
    const cdb = simular({ ...lci80, produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: eq.tributadoPosCDI } }, '2028-09-28', CEN);
    expect(Math.abs(cdb.valorLiquido - eq.liquidoAlvo)).toBeLessThan(1e-6);
  });
  it('prazo menor que o mínimo da LCI → sem equivalente isento', () => {
    const cdb: Aplicacao = { ...lci80, produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 } };
    expect(calcularEquivalencias(cdb, '2026-12-28', CEN).isentoPosCDI).toBeNull();
  });
  it('origem prefixada não tem regra de bolso', () => {
    const pre: Aplicacao = { ...lci80, produto: 'CDB', indexacao: { tipo: 'PRE', taxaAA: 0.13 } };
    expect(calcularEquivalencias(pre, '2028-09-28', CEN).regraDeBolso).toBeNull();
  });
});
```

**Passo 2:** FALHA. **Passo 3:** implemente.

```ts
// src/engine/equivalencia.ts
import { type DataISO, diasCorridos } from './datas';
import { OfertaInvalidaError } from './erros';
import type { Cenario } from './indexadores';
import { ehIsentoIR, simular, type Aplicacao, type Oferta } from './produtos';
import { aliquotaIR } from './regras/ir';

export interface ResultadoEquivalencia {
  liquidoAlvo: number;
  /** % do CDI de um CDB (tributado) que empata. 0.9257 = 92,57%. */
  tributadoPosCDI: number;
  /** Taxa a.a. de um CDB prefixado que empata. */
  tributadoPre: number;
  /** Taxa real a.a. de um CDB IPCA+ que empata. */
  tributadoIpcaMais: number;
  /** % do CDI de uma LCI (isenta) que empata; null se o prazo não cumpre o mínimo legal. */
  isentoPosCDI: number | null;
  /** Aproximação de mercado p ÷ (1 − IR) ou p × (1 − IR); só para origem pós-CDI. */
  regraDeBolso: number | null;
  aliquotaIR: number;
}

const ITERACOES = 80;

/** Bisseção: acha x em [min, max] com f(x) = alvo, para f crescente. */
function resolver(f: (x: number) => number, alvo: number, min: number, max: number): number {
  if (f(min) > alvo || f(max) < alvo) throw new OfertaInvalidaError('Não existe taxa equivalente no intervalo pesquisado');
  let lo = min;
  let hi = max;
  for (let i = 0; i < ITERACOES; i++) {
    const meio = (lo + hi) / 2;
    if (f(meio) < alvo) lo = meio;
    else hi = meio;
  }
  return (lo + hi) / 2;
}

export function calcularEquivalencias(origem: Aplicacao, dataResgate: DataISO, cen: Cenario): ResultadoEquivalencia {
  const liquidoAlvo = simular(origem, dataResgate, cen).valorLiquido;
  const liquido = (o: Oferta) =>
    simular({ ...o, valor: origem.valor, dataAplicacao: origem.dataAplicacao }, dataResgate, cen).valorLiquido;

  let isentoPosCDI: number | null;
  try {
    isentoPosCDI = resolver((p) => liquido({ produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: p } }), liquidoAlvo, 1e-6, 10);
  } catch (erro) {
    if (!(erro instanceof OfertaInvalidaError)) throw erro;
    isentoPosCDI = null;
  }

  const aliquota = aliquotaIR(diasCorridos(origem.dataAplicacao, dataResgate), dataResgate);
  const ix = origem.indexacao;
  const regraDeBolso = ix.tipo !== 'POS_CDI' ? null
    : ehIsentoIR(origem.produto) ? ix.percentualCDI / (1 - aliquota) : ix.percentualCDI * (1 - aliquota);

  return {
    liquidoAlvo,
    tributadoPosCDI: resolver((p) => liquido({ produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: p } }), liquidoAlvo, 1e-6, 10),
    tributadoPre: resolver((t) => liquido({ produto: 'CDB', indexacao: { tipo: 'PRE', taxaAA: t } }), liquidoAlvo, -0.5, 3),
    tributadoIpcaMais: resolver((t) => liquido({ produto: 'CDB', indexacao: { tipo: 'IPCA_MAIS', taxaRealAA: t } }), liquidoAlvo, -0.5, 3),
    isentoPosCDI,
    regraDeBolso,
    aliquotaIR: aliquota,
  };
}
```

**Passo 4:** PASSA. Se passar de ~2 s, anote no PR; otimizar (pré-calcular os dias úteis)
fica para o M2. **Passo 5:** commit (`feat(engine): equivalência exata por bisseção e regra de bolso`).

---

### Tarefa 18: Formatação pt-BR (`src/formato.ts`)

**Passo 1:** teste que falha, `tests/formato.test.ts`. O `Intl` usa espaço não separável
depois de "R$"; `\s` cobre esse espaço.

```ts
import { describe, expect, it } from 'vitest';
import { formatarData, formatarMoeda, formatarPercentual } from '../src/formato';

describe('formato pt-BR', () => {
  it('moeda', () => expect(formatarMoeda(12551.897435)).toMatch(/^R\$\s12\.551,90$/));
  it('percentual com até 2 casas', () => {
    expect(formatarPercentual(0.175)).toBe('17,5%');
    expect(formatarPercentual(0.925707)).toBe('92,57%');
    expect(formatarPercentual(1.03)).toBe('103%');
  });
  it('data', () => expect(formatarData('2027-03-28')).toBe('28/03/2027'));
});
```

**Passo 2:** FALHA (`formatarMoeda` não existe). **Passo 3:** complete o arquivo.

```ts
// src/formato.ts
import type { DataISO } from './engine/datas';

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const PERCENTUAL = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const formatarMoeda = (valor: number): string => MOEDA.format(valor);
export const formatarPercentual = (fracao: number): string => PERCENTUAL.format(fracao);

export const formatarData = (data: DataISO): string => dataBR(data);
```

(com `import { dataBR, type DataISO } from './engine/datas';` no lugar do import de tipo)

**Passo 4:** PASSA. **Passo 5:** commit (`feat: formatação pt-BR de moeda, percentual e data`).

---

### Tarefa 19: Descrição das ofertas e motivos do vencedor (`src/conteudo/motivos.ts`)

**Passo 1:** teste que falha, `tests/conteudo/motivos.test.ts`.

```ts
import { describe, expect, it } from 'vitest';
import { descreverOferta, explicarVencedor } from '../../src/conteudo/motivos';
import { duelar } from '../../src/engine/comparador';
import type { Oferta } from '../../src/engine/produtos';
import { CEN, INI } from '../engine/cenarioPadrao';

const cdb = (p: number): Oferta => ({ produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: p } });
const lci = (p: number): Oferta => ({ produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: p } });

describe('descreverOferta', () => {
  it.each<[Oferta, string]>([
    [cdb(1.03), 'CDB 103% do CDI'],
    [lci(0.8), 'LCI 80% do CDI'],
    [{ produto: 'CDB', indexacao: { tipo: 'PRE', taxaAA: 0.13 } }, 'CDB prefixado 13% a.a.'],
    [{ produto: 'CDB', indexacao: { tipo: 'IPCA_MAIS', taxaRealAA: 0.07 } }, 'CDB IPCA + 7% a.a.'],
    [{ produto: 'TESOURO_IPCA', indexacao: { tipo: 'IPCA_MAIS', taxaRealAA: 0.075 } }, 'Tesouro IPCA+ 7,5% a.a.'],
    [{ produto: 'TESOURO_SELIC', indexacao: { tipo: 'SELIC' } }, 'Tesouro Selic'],
    [{ produto: 'POUPANCA', indexacao: { tipo: 'POUPANCA' } }, 'Poupança'],
  ])('%o → %s', (oferta, texto) => expect(descreverOferta(oferta)).toBe(texto));
});

describe('explicarVencedor', () => {
  it('tributado vence apesar do IR', () => {
    const linhas = explicarVencedor(duelar(10000, INI, '2028-09-28', cdb(1.03), lci(0.8), CEN));
    expect(linhas[0]).toMatch(/^CDB 103% do CDI termina com R\$\s12\.551,90 líquidos: R\$\s289,86 \(2,36%\) a mais que LCI 80% do CDI\.$/);
    expect(linhas.join(' ')).toMatch(/LCI 80% do CDI é isenta de IR/);
    expect(linhas.join(' ')).toMatch(/Mesmo pagando IR/);
  });
  it('isenção compensa rendimento bruto menor', () => {
    const linhas = explicarVencedor(duelar(10000, INI, '2028-09-28', cdb(1.03), lci(0.95), CEN));
    expect(linhas.join(' ')).toMatch(/A isenção compensou/);
  });
  it('isenta que rende mais até no bruto', () => {
    const linhas = explicarVencedor(duelar(10000, INI, '2028-09-28', cdb(0.9), lci(0.95), CEN));
    expect(linhas.join(' ')).toMatch(/rende mais antes dos descontos e ainda é isenta/);
  });
  it('empate', () => {
    expect(explicarVencedor(duelar(10000, INI, '2028-09-28', cdb(1), cdb(1), CEN))[0]).toMatch(/empatad/);
  });
});
```

**Passo 2:** FALHA. **Passo 3:** implemente. Os textos são **rascunho**; a Tarefa 25 passa
todos pelo /vozmax e pela revisão do usuário, e os testes são ajustados junto.

```ts
// src/conteudo/motivos.ts
import type { Duelo } from '../engine/comparador';
import type { Oferta, TipoProduto } from '../engine/produtos';
import { formatarMoeda, formatarPercentual } from '../formato';

const NOMES: Record<TipoProduto, string> = {
  CDB: 'CDB', RDB: 'RDB', LC: 'LC', LCI: 'LCI', LCA: 'LCA',
  TESOURO_SELIC: 'Tesouro Selic', TESOURO_PREFIXADO: 'Tesouro Prefixado', TESOURO_IPCA: 'Tesouro IPCA+',
  POUPANCA: 'Poupança',
};

/** LCI e LCA são "letras" (feminino); os demais, masculino. */
const FEMININO: ReadonlySet<TipoProduto> = new Set(['LCI', 'LCA', 'LC', 'POUPANCA']);
const isento = (p: TipoProduto) => (FEMININO.has(p) ? 'isenta' : 'isento');

export function descreverOferta(o: Oferta): string {
  const nome = NOMES[o.produto];
  const ix = o.indexacao;
  switch (ix.tipo) {
    case 'POS_CDI': return `${nome} ${formatarPercentual(ix.percentualCDI)} do CDI`;
    case 'PRE': return o.produto === 'TESOURO_PREFIXADO' ? `${nome} ${formatarPercentual(ix.taxaAA)} a.a.` : `${nome} prefixado ${formatarPercentual(ix.taxaAA)} a.a.`;
    case 'IPCA_MAIS': return o.produto === 'TESOURO_IPCA' ? `${nome} ${formatarPercentual(ix.taxaRealAA)} a.a.` : `${nome} IPCA + ${formatarPercentual(ix.taxaRealAA)} a.a.`;
    case 'SELIC':
    case 'POUPANCA':
      return nome;
  }
}

export function explicarVencedor(d: Duelo): string[] {
  const nomeA = descreverOferta(d.a.aplicacao);
  const nomeB = descreverOferta(d.b.aplicacao);
  if (d.vencedor === 'EMPATE') {
    return [`${nomeA} e ${nomeB} terminam empatados, com ${formatarMoeda(d.a.valorLiquido)} líquidos.`];
  }
  const [v, p, nv, np] = d.vencedor === 'A' ? [d.a, d.b, nomeA, nomeB] : [d.b, d.a, nomeB, nomeA];
  const linhas = [
    `${nv} termina com ${formatarMoeda(v.valorLiquido)} líquidos: ${formatarMoeda(d.diferenca)} (${formatarPercentual(d.diferencaPercentual)}) a mais que ${np}.`,
  ];
  if (v.isentoIR !== p.isentoIR) {
    const [ri, rt, ni, nt] = v.isentoIR ? [v, p, nv, np] : [p, v, np, nv];
    linhas.push(`${ni} é ${isento(ri.aplicacao.produto)} de IR. ${nt} paga ${formatarPercentual(rt.aliquotaIR)} de IR (${formatarMoeda(rt.ir)}) sobre o rendimento.`);
    if (!v.isentoIR) {
      linhas.push(`Mesmo pagando IR, ${nv} vence porque rende ${formatarMoeda(v.rendimentoBruto - p.rendimentoBruto)} a mais antes do imposto.`);
    } else if (v.rendimentoBruto < p.rendimentoBruto) {
      linhas.push(`A isenção compensou: mesmo rendendo menos antes do imposto, ${nv} fica à frente.`);
    } else {
      linhas.push(`${nv} rende mais antes dos descontos e ainda é ${isento(v.aplicacao.produto)}.`);
    }
  } else if (v.rendimentoBruto >= p.rendimentoBruto) {
    linhas.push(`${nv} rende mais antes dos descontos, e os descontos pesam de forma parecida nos dois.`);
  } else {
    linhas.push(`${nv} rende menos antes dos descontos, mas perde menos para IOF, IR e custódia.`);
  }
  return linhas;
}
```

**Passo 4:** PASSA. **Passo 5:** commit (`feat(conteudo): descrição das ofertas e motivos do vencedor`).

---

### Tarefa 20: "Por que esse resultado?" (`src/conteudo/explicacoes.ts`)

**Passo 1:** teste que falha, `tests/conteudo/explicacoes.test.ts`.

```ts
import { describe, expect, it } from 'vitest';
import { explicarSimulacao } from '../../src/conteudo/explicacoes';
import { simular, type Aplicacao } from '../../src/engine/produtos';
import { CEN, INI } from '../engine/cenarioPadrao';

const cdb: Aplicacao = { produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, valor: 10000, dataAplicacao: INI };

describe('explicarSimulacao', () => {
  it('CDB: aplicado, rendimento, IOF, IR, líquido — com os números da simulação', () => {
    const passos = explicarSimulacao(simular(cdb, '2028-09-28', CEN));
    expect(passos.map((p) => p.id)).toEqual(['aplicado', 'rendimentoBruto', 'iof', 'ir', 'liquido']);
    const ir = passos.find((p) => p.id === 'ir');
    expect(ir?.curto).toMatch(/731 dias/);
    expect(ir?.curto).toMatch(/15%/);
    expect(ir?.fonte).toMatch(/l11033/);
    expect(passos.find((p) => p.id === 'iof')?.curto).toMatch(/Sem IOF/);
    expect(passos.find((p) => p.id === 'rendimentoBruto')?.matematica).toMatch(/502 dias úteis/);
  });
  it('IOF cobrado aparece com a alíquota', () => {
    const passos = explicarSimulacao(simular({ ...cdb, indexacao: { tipo: 'POS_CDI', percentualCDI: 1 } }, '2026-10-13', CEN));
    expect(passos.find((p) => p.id === 'iof')?.curto).toMatch(/15 dias.*50%/);
  });
  it('LCI: sem passo de IOF, IR explica a isenção', () => {
    const passos = explicarSimulacao(simular({ ...cdb, produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 } }, '2028-09-28', CEN));
    expect(passos.map((p) => p.id)).toEqual(['aplicado', 'rendimentoBruto', 'ir', 'liquido']);
    expect(passos.find((p) => p.id === 'ir')?.curto).toMatch(/isenta de IR/);
  });
  it('Tesouro: inclui custódia', () => {
    const passos = explicarSimulacao(simular({ ...cdb, produto: 'TESOURO_SELIC', indexacao: { tipo: 'SELIC' }, valor: 50000 }, '2027-09-28', CEN));
    expect(passos.map((p) => p.id)).toContain('custodia');
  });
  it('Poupança: explica o aniversário', () => {
    const passos = explicarSimulacao(simular({ ...cdb, produto: 'POUPANCA', indexacao: { tipo: 'POUPANCA' } }, '2027-03-27', CEN));
    expect(passos.find((p) => p.id === 'rendimentoBruto')?.curto).toMatch(/5 aniversários/);
  });
});
```

**Passo 2:** FALHA. **Passo 3:** implemente (textos em rascunho, revisados na Tarefa 25).

```ts
// src/conteudo/explicacoes.ts
import type { IdPasso, ResultadoSimulacao } from '../engine/produtos';
import { ehTesouro } from '../engine/produtos';
import { FONTE_CUSTODIA } from '../engine/regras/custodia';
import { FONTE_IOF } from '../engine/regras/iof';
import { FONTE_IR } from '../engine/regras/ir';
import { FONTE_POUPANCA } from '../engine/regras/poupanca';
import { formatarData, formatarMoeda, formatarPercentual } from '../formato';
import { descreverOferta } from './motivos';
import type { IdTermo } from './glossario';

export interface ExplicacaoPasso {
  id: IdPasso;
  titulo: string;
  sinal: '' | '+' | '−' | '=';
  valor: number;
  /** Camada simples. */
  curto: string;
  /** Camada "ver a matemática". */
  matematica: string;
  fonte?: string;
  termo?: IdTermo;
}

function explicarRendimento(r: ResultadoSimulacao): Pick<ExplicacaoPasso, 'curto' | 'matematica' | 'termo' | 'fonte'> {
  const ix = r.aplicacao.indexacao;
  const fator = r.fator.toFixed(8).replace('.', ',');
  const du = `${r.diasUteis} dias úteis`;
  switch (ix.tipo) {
    case 'POS_CDI':
      return {
        curto: `Rendeu ${formatarPercentual(ix.percentualCDI)} do CDI durante ${du}.`,
        matematica: `fator = ∏ [1 + ((1 + CDI)^(1/252) − 1) × ${formatarPercentual(ix.percentualCDI)}] nos ${du} = ${fator}. O percentual incide sobre a taxa de cada dia útil, não sobre a taxa anual.`,
        termo: 'cdi',
      };
    case 'PRE':
      return {
        curto: `Taxa fixa de ${formatarPercentual(ix.taxaAA)} ao ano, combinada no dia da aplicação.`,
        matematica: `fator = (1 + ${formatarPercentual(ix.taxaAA)})^(${r.diasUteis}/252) = ${fator}`,
        termo: 'prefixado',
      };
    case 'IPCA_MAIS':
      return {
        curto: `A inflação do período (IPCA) mais ${formatarPercentual(ix.taxaRealAA)} ao ano de juro real.`,
        matematica: `fator = ∏ (1 + IPCA)^(1/252) × (1 + ${formatarPercentual(ix.taxaRealAA)})^(${r.diasUteis}/252) = ${fator}`,
        termo: 'ipca-mais',
      };
    case 'SELIC':
      return {
        curto: `Acompanhou a taxa Selic durante ${du}.`,
        matematica: `fator = ∏ (1 + Selic)^(1/252) nos ${du} = ${fator}`,
        termo: 'selic',
      };
    case 'POUPANCA':
      return {
        curto: `${r.mesesPoupanca ?? 0} aniversários mensais completos. A poupança só rende na data de aniversário: o mês incompleto não conta.`,
        matematica: 'Com a Selic acima de 8,5% a.a., o rendimento é 0,5% ao mês + TR. Com a Selic em até 8,5%, é 70% da Selic mensalizada + TR.',
        fonte: FONTE_POUPANCA,
        termo: 'poupanca',
      };
  }
}

export function explicarSimulacao(r: ResultadoSimulacao): ExplicacaoPasso[] {
  const nome = descreverOferta(r.aplicacao);
  const passos: ExplicacaoPasso[] = [
    {
      id: 'aplicado', titulo: 'Valor aplicado', sinal: '', valor: r.valorAplicado,
      curto: `Aplicação em ${formatarData(r.aplicacao.dataAplicacao)} com resgate em ${formatarData(r.dataResgate)}.`,
      matematica: '',
    },
    { id: 'rendimentoBruto', titulo: 'Rendimento bruto', sinal: '+', valor: r.rendimentoBruto, ...explicarRendimento(r) },
  ];

  if (!r.isentoIR) {
    passos.push({
      id: 'iof', titulo: 'IOF', sinal: '−', valor: r.iof,
      curto: r.aliquotaIOF > 0
        ? `Resgate com ${r.diasCorridos} dias: o IOF fica com ${formatarPercentual(r.aliquotaIOF)} do rendimento.`
        : `Sem IOF: o resgate aconteceu com ${r.diasCorridos} dias, e o IOF só é cobrado nos primeiros 29.`,
      matematica: 'IOF = rendimento × alíquota da tabela regressiva (96% no 1º dia até 0% a partir do 30º). É cobrado antes do IR.',
      fonte: FONTE_IOF, termo: 'iof',
    });
  }

  if (ehTesouro(r.aplicacao.produto)) {
    passos.push({
      id: 'custodia', titulo: 'Custódia B3', sinal: '−', valor: r.custodia,
      curto: r.custodia > 0
        ? 'A B3 cobra 0,20% ao ano pela guarda dos títulos, descontados no resgate.'
        : 'Sem custódia: no Tesouro Selic, os primeiros R$ 10 mil são isentos.',
      matematica: 'custódia ≈ 0,20% × (dias corridos ÷ 365) × (média entre aplicado e bruto − isenção). A B3 calcula dia a dia; aqui usamos a média.',
      fonte: FONTE_CUSTODIA, termo: 'custodia',
    });
  }

  passos.push(r.isentoIR
    ? {
        id: 'ir', titulo: 'Imposto de Renda', sinal: '−', valor: 0,
        curto: `${nome.split(' ')[0]} é isenta de IR para pessoa física: todo o rendimento fica com você.`,
        matematica: 'Isenção prevista em lei para pessoa física.', termo: 'ir-regressivo',
      }
    : {
        id: 'ir', titulo: 'Imposto de Renda', sinal: '−', valor: r.ir,
        curto: `Com ${r.diasCorridos} dias corridos, a alíquota do IR é ${formatarPercentual(r.aliquotaIR)}. Quanto mais tempo aplicado, menor ela fica.`,
        matematica: `IR = (rendimento − IOF − custódia) × ${formatarPercentual(r.aliquotaIR)}. Faixas: até 180 dias 22,5%; até 360, 20%; até 720, 17,5%; acima, 15%.`,
        fonte: FONTE_IR, termo: 'ir-regressivo',
      });

  passos.push({
    id: 'liquido', titulo: 'Valor líquido', sinal: '=', valor: r.valorLiquido,
    curto: `É o que cai na sua conta: ${formatarMoeda(r.valorLiquido)}.`, matematica: '',
  });
  return passos;
}
```

O texto de isenção usa "isenta" porque, no M1, os produtos isentos com IR relevante são
LCI, LCA e poupança (todos no feminino). Se a revisão da Tarefa 25 mudar isso, ajuste o
teste junto.

**Passo 4:** PASSA.

> **Ordem de execução:** esta tarefa importa `IdTermo` de `src/conteudo/glossario.ts`.
> **Execute a Tarefa 21 antes da 20.**
**Passo 5:** commit (`feat(conteudo): memória de cálculo explicada em camadas`).

---

### Tarefa 21: Glossário e Markdown restrito

**Arquivos:** `src/conteudo/glossario.ts`, `src/ui/MarkdownRestrito.tsx`,
`tests/ui/MarkdownRestrito.test.tsx` e `tests/conteudo/glossario.test.ts`.

**Passo 1:** testes que falham.

```tsx
// tests/ui/MarkdownRestrito.test.tsx
// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { MarkdownRestrito } from '../../src/ui/MarkdownRestrito';

afterEach(cleanup);

describe('MarkdownRestrito', () => {
  it('negrito, itálico e lista', () => {
    const { container } = render(<MarkdownRestrito texto={'**forte** e *leve*\n\n- um\n- dois'} />);
    expect(container.querySelector('strong')?.textContent).toBe('forte');
    expect(container.querySelector('em')?.textContent).toBe('leve');
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });
  it('link https com rel seguro', () => {
    const { container } = render(<MarkdownRestrito texto="[BCB](https://www.bcb.gov.br)" />);
    const a = container.querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://www.bcb.gov.br');
    expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a?.getAttribute('target')).toBe('_blank');
  });
  it('HTML vira texto e links não-https viram texto', () => {
    const { container } = render(<MarkdownRestrito texto={'<script>alert(1)</script> [x](javascript:alert(1)) <img src=x onerror=alert(1)>'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('<script>');
  });
});
```

```ts
// tests/conteudo/glossario.test.ts
import { describe, expect, it } from 'vitest';
import { GLOSSARIO } from '../../src/conteudo/glossario';

describe('glossário', () => {
  it('todo termo tem texto curto e fonte https', () => {
    for (const [id, t] of Object.entries(GLOSSARIO)) {
      expect(t.curto.length, id).toBeGreaterThan(20);
      expect(t.fonte, id).toMatch(/^https:\/\//);
    }
  });
});
```

**Passo 2:** FALHA. **Passo 3:** implemente.

```tsx
// src/ui/MarkdownRestrito.tsx
import type { ComponentChildren } from 'preact';

// Só **negrito**, *itálico*, [texto](https://…) e listas "- ". Todo o resto é texto:
// o Preact escapa strings, então HTML nunca é interpretado.
const TOKEN = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function renderizarInline(texto: string): ComponentChildren[] {
  const saida: ComponentChildren[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(TOKEN)) {
    const inicio = m.index ?? 0;
    if (inicio > ultimo) saida.push(texto.slice(ultimo, inicio));
    const [, negrito, italico, rotulo, url] = m;
    if (negrito !== undefined) saida.push(<strong>{negrito}</strong>);
    else if (italico !== undefined) saida.push(<em>{italico}</em>);
    else if (rotulo !== undefined && url !== undefined) {
      saida.push(url.startsWith('https://') ? <a href={url} target="_blank" rel="noopener noreferrer">{rotulo}</a> : rotulo);
    }
    ultimo = inicio + m[0].length;
  }
  if (ultimo < texto.length) saida.push(texto.slice(ultimo));
  return saida;
}

export function MarkdownRestrito({ texto, inline = false }: { texto: string; inline?: boolean }) {
  if (inline) return <>{renderizarInline(texto)}</>;
  const blocos = texto.split(/\n\s*\n/);
  return (
    <>
      {blocos.map((bloco) => {
        const linhas = bloco.split('\n');
        if (linhas.every((l) => l.startsWith('- '))) {
          return <ul>{linhas.map((l) => <li>{renderizarInline(l.slice(2))}</li>)}</ul>;
        }
        return <p>{renderizarInline(bloco)}</p>;
      })}
    </>
  );
}
```

```ts
// src/conteudo/glossario.ts
// RASCUNHO: revisado na Tarefa 25 (/vozmax + usuário). Cada URL deve ser aberta e conferida.
export type IdTermo =
  | 'cdi' | 'selic' | 'ipca' | 'tr' | 'cdb' | 'lci-lca' | 'fgc' | 'tesouro' | 'ir-regressivo' | 'iof'
  | 'prazo-minimo' | 'dias-uteis' | 'liquidez' | 'custodia' | 'poupanca' | 'prefixado' | 'pos-fixado'
  | 'ipca-mais' | 'equivalencia' | 'valor-liquido';

export interface Termo { termo: string; curto: string; fonte: string }

export const GLOSSARIO: Record<IdTermo, Termo> = {
  cdi: { termo: 'CDI', curto: 'Taxa dos empréstimos de um dia entre bancos. Anda colada na Selic e é a referência dos pós-fixados: "103% do CDI" quer dizer render 103% dessa taxa.', fonte: 'https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/consultas/mercado-de-derivativos/indicadores/indicadores-financeiros/' },
  selic: { termo: 'Selic', curto: 'Taxa básica de juros da economia, definida pelo Copom a cada 45 dias. Quando ela sobe, os pós-fixados passam a render mais.', fonte: 'https://www.bcb.gov.br/controleinflacao/taxaselic' },
  ipca: { termo: 'IPCA', curto: 'Índice oficial de inflação do Brasil, medido pelo IBGE. Mostra quanto o custo de vida subiu.', fonte: 'https://www.ibge.gov.br/explica/inflacao.php' },
  tr: { termo: 'TR', curto: 'Taxa Referencial, calculada pelo Banco Central. Entra no rendimento da poupança, além da parcela fixa.', fonte: 'https://www.bcb.gov.br/pec/poupanca/poupanca.asp?frame=1' },
  cdb: { termo: 'CDB', curto: 'Certificado de Depósito Bancário: você empresta dinheiro ao banco e recebe juros. Paga **IR** e tem garantia do **FGC**.', fonte: 'https://www.fgc.org.br/en/sobre-garantia-fgc' },
  'lci-lca': { termo: 'LCI e LCA', curto: 'Letras de Crédito Imobiliário e do Agronegócio. São **isentas de IR** para pessoa física e têm garantia do FGC, mas têm prazo mínimo antes do resgate.', fonte: 'https://www.b3.com.br/data/files/63/43/8C/0B/43FF69106B8BCB69AC094EA8/CE%20016-2025-VPC%20PLATAFORMA%20NOME%20BALCAO%20B3_LCA_LCI.pdf' },
  fgc: { termo: 'FGC', curto: 'Fundo Garantidor de Créditos. Se o banco quebrar, devolve até R$ 250 mil por CPF por instituição, somando principal e rendimentos, com teto de R$ 1 milhão a cada 4 anos.', fonte: 'https://www.fgc.org.br/en/sobre-garantia-fgc' },
  tesouro: { termo: 'Tesouro Direto', curto: 'Títulos públicos federais comprados direto do governo. A garantia é do Tesouro Nacional, considerada o menor risco de crédito do país.', fonte: 'https://www.tesourodireto.com.br/' },
  'ir-regressivo': { termo: 'IR regressivo', curto: 'O imposto sobre o rendimento cai com o tempo: 22,5% até 180 dias, 20% até 360, 17,5% até 720 e 15% acima disso.', fonte: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11033.htm' },
  iof: { termo: 'IOF', curto: 'Imposto que só aparece se você resgatar em menos de 30 dias. Começa em 96% do rendimento no 1º dia e zera no 30º.', fonte: 'https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2007/decreto/d6306.htm' },
  'prazo-minimo': { termo: 'Prazo mínimo', curto: 'Tempo mínimo definido pelo Conselho Monetário Nacional antes de poder resgatar uma LCI ou LCA: 6 meses nas pós e prefixadas, mais nas atreladas ao IPCA.', fonte: 'https://www.b3.com.br/data/files/63/43/8C/0B/43FF69106B8BCB69AC094EA8/CE%20016-2025-VPC%20PLATAFORMA%20NOME%20BALCAO%20B3_LCA_LCI.pdf' },
  'dias-uteis': { termo: 'Dias úteis', curto: 'O CDI e a Selic só rendem em dias úteis, contados em base 252 por ano. Fim de semana e feriado não rendem.', fonte: 'https://www.anbima.com.br/feriados/feriados.asp' },
  liquidez: { termo: 'Liquidez', curto: 'Facilidade de transformar o investimento em dinheiro. Liquidez diária: resgata quando quiser. No vencimento: só na data combinada.', fonte: 'https://www.bcb.gov.br/cidadaniafinanceira' },
  custodia: { termo: 'Taxa de custódia', curto: 'A B3 cobra 0,20% ao ano pela guarda dos títulos do Tesouro, descontados no resgate. No Tesouro Selic, os primeiros R$ 10 mil são isentos.', fonte: 'https://www.b3.com.br/pt_br/produtos-e-servicos/tarifas/tarifas-de-tesouro-direto/' },
  poupanca: { termo: 'Poupança', curto: 'Isenta de IR e com garantia do FGC, mas só rende na data de aniversário mensal: sacar um dia antes perde o mês.', fonte: 'https://www.bcb.gov.br/pec/poupanca/poupanca.asp?frame=1' },
  prefixado: { termo: 'Prefixado', curto: 'A taxa é combinada na aplicação e não muda. Você sabe hoje quanto vai receber no vencimento.', fonte: 'https://www.tesourodireto.com.br/' },
  'pos-fixado': { termo: 'Pós-fixado', curto: 'O rendimento acompanha um indicador, como o CDI ou a Selic. Se os juros sobem, rende mais; se caem, rende menos.', fonte: 'https://www.tesourodireto.com.br/' },
  'ipca-mais': { termo: 'IPCA+', curto: 'Paga a inflação do período mais uma taxa fixa de juro real. Protege o poder de compra.', fonte: 'https://www.tesourodireto.com.br/' },
  equivalencia: { termo: 'Taxa equivalente', curto: 'A taxa que outro investimento precisaria ter para terminar com o mesmo valor líquido. Serve para comparar produtos com impostos diferentes.', fonte: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11033.htm' },
  'valor-liquido': { termo: 'Valor líquido', curto: 'O que sobra depois de IOF, IR e taxas. É o número que importa para comparar.', fonte: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11033.htm' },
};
```

**Passo 4:** PASSA. **Passo 5:** commit (`feat: glossário e renderizador de Markdown restrito`).

---

### Tarefa 22: Componentes `Termo` e `PalpiteAntesDeVer`

**Passo 1:** testes que falham, `tests/ui/componentes.test.tsx`.

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Termo } from '../../src/ui/Termo';
import { PalpiteAntesDeVer } from '../../src/ui/PalpiteAntesDeVer';

afterEach(cleanup);

describe('Termo', () => {
  it('abre e fecha a explicação', () => {
    render(<p>Rende <Termo id="cdi">CDI</Termo></p>);
    const botao = screen.getByRole('button', { name: 'CDI' });
    expect(botao).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(botao);
    expect(botao).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('note')).toHaveTextContent(/empréstimos de um dia/);
    fireEvent.click(botao);
    expect(screen.queryByRole('note')).toBeNull();
  });
});

describe('PalpiteAntesDeVer', () => {
  it('escolher e pular', () => {
    const escolher = vi.fn();
    const pular = vi.fn();
    render(<PalpiteAntesDeVer nomeA="CDB 103% do CDI" nomeB="LCI 80% do CDI" onEscolher={escolher} onPular={pular} />);
    fireEvent.click(screen.getByRole('button', { name: 'LCI 80% do CDI' }));
    expect(escolher).toHaveBeenCalledWith('B');
    fireEvent.click(screen.getByRole('button', { name: /pular/i }));
    expect(pular).toHaveBeenCalled();
  });
});
```

**Passo 2:** FALHA. **Passo 3:** implemente.

```tsx
// src/ui/Termo.tsx
import type { ComponentChildren } from 'preact';
import { useId, useState } from 'preact/hooks';
import { GLOSSARIO, type IdTermo } from '../conteudo/glossario';
import { MarkdownRestrito } from './MarkdownRestrito';

export function Termo({ id, children }: { id: IdTermo; children: ComponentChildren }) {
  const [aberto, setAberto] = useState(false);
  const idPainel = useId();
  const termo = GLOSSARIO[id];
  return (
    <span class="termo">
      <button type="button" class="termo__botao" aria-expanded={aberto} aria-controls={idPainel} onClick={() => setAberto(!aberto)}>
        {children}
      </button>
      {aberto && (
        <span id={idPainel} role="note" class="termo__painel">
          <strong>{termo.termo}:</strong> <MarkdownRestrito texto={termo.curto} inline />{' '}
          <a href={termo.fonte} target="_blank" rel="noopener noreferrer">Fonte</a>
        </span>
      )}
    </span>
  );
}
```

```tsx
// src/ui/PalpiteAntesDeVer.tsx
export interface PropsPalpite {
  nomeA: string;
  nomeB: string;
  onEscolher: (escolha: 'A' | 'B') => void;
  onPular: () => void;
}

export function PalpiteAntesDeVer({ nomeA, nomeB, onEscolher, onPular }: PropsPalpite) {
  return (
    <section class="palpite" aria-labelledby="palpite-titulo">
      <h2 id="palpite-titulo">Antes de ver: qual você acha que rende mais?</h2>
      <p>Arriscar um palpite antes ajuda a fixar o porquê do resultado.</p>
      <div class="palpite__opcoes">
        <button type="button" onClick={() => onEscolher('A')}>{nomeA}</button>
        <button type="button" onClick={() => onEscolher('B')}>{nomeB}</button>
      </div>
      <button type="button" class="link" onClick={onPular}>Pular e desligar os palpites</button>
    </section>
  );
}
```

**Passo 4:** PASSA. **Passo 5:** commit (`feat(ui): termo explicado e palpite antes de ver`).

---

### Tarefa 23: Componentes de resultado

**Arquivos:** `src/ui/PorQueEsseResultado.tsx`, `src/ui/ResultadoDuelo.tsx`,
`src/ui/Equivalencias.tsx` e `tests/ui/resultado.test.tsx`.

**Passo 1:** teste que falha.

```tsx
// tests/ui/resultado.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { duelar } from '../../src/engine/comparador';
import { calcularEquivalencias } from '../../src/engine/equivalencia';
import { ResultadoDuelo } from '../../src/ui/ResultadoDuelo';
import { Equivalencias } from '../../src/ui/Equivalencias';
import { CEN, INI } from '../engine/cenarioPadrao';

afterEach(cleanup);
const cdb = { produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 } } as const;
const lci = { produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 } } as const;

describe('ResultadoDuelo', () => {
  it('mostra acerto/erro do palpite, motivos e o passo a passo', () => {
    render(<ResultadoDuelo duelo={duelar(10000, INI, '2028-09-28', cdb, lci, CEN)} palpite="B" />);
    expect(screen.getByText(/Você errou/)).toBeInTheDocument();
    expect(screen.getByText(/CDB 103% do CDI termina com/)).toBeInTheDocument();
    expect(screen.getAllByText('Por que esse resultado?')).toHaveLength(2);
    expect(screen.getAllByText(/Imposto de Renda/).length).toBeGreaterThan(0);
  });
});

describe('Equivalencias', () => {
  it('mostra a taxa exata e a regra de bolso', () => {
    const eq = calcularEquivalencias({ ...lci, valor: 10000, dataAplicacao: INI }, '2028-09-28', CEN);
    render(<Equivalencias origem="LCI 80% do CDI" eq={eq} />);
    expect(screen.getByText(/92,57%/)).toBeInTheDocument();
    expect(screen.getByText(/94,12%/)).toBeInTheDocument();
  });
});
```

**Passo 2:** FALHA. **Passo 3:** implemente.

```tsx
// src/ui/PorQueEsseResultado.tsx
import { explicarSimulacao } from '../conteudo/explicacoes';
import type { ResultadoSimulacao } from '../engine/produtos';
import { formatarMoeda } from '../formato';
import { Termo } from './Termo';

export function PorQueEsseResultado({ resultado }: { resultado: ResultadoSimulacao }) {
  return (
    <details class="porque" open>
      <summary>Por que esse resultado?</summary>
      <ol class="passos">
        {explicarSimulacao(resultado).map((p) => (
          <li class={`passo passo--${p.id}`}>
            <div class="passo__linha">
              <span>{p.sinal} {p.termo ? <Termo id={p.termo}>{p.titulo}</Termo> : p.titulo}</span>
              <span class="passo__valor">{formatarMoeda(p.valor)}</span>
            </div>
            <p class="passo__curto">{p.curto}</p>
            {p.matematica && (
              <details class="passo__matematica">
                <summary>Ver a matemática</summary>
                <p>{p.matematica}</p>
                {p.fonte && <a href={p.fonte} target="_blank" rel="noopener noreferrer">Fonte oficial</a>}
              </details>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}
```

```tsx
// src/ui/ResultadoDuelo.tsx
import { descreverOferta, explicarVencedor } from '../conteudo/motivos';
import type { Duelo } from '../engine/comparador';
import { garantiaDe, type ResultadoSimulacao } from '../engine/produtos';
import { formatarMoeda } from '../formato';
import { PorQueEsseResultado } from './PorQueEsseResultado';
import { Termo } from './Termo';

function Cartao({ rotulo, r, vencedor }: { rotulo: string; r: ResultadoSimulacao; vencedor: boolean }) {
  return (
    <article class={vencedor ? 'cartao cartao--vencedor' : 'cartao'}>
      <h3>{rotulo} {vencedor && <span class="selo">maior valor líquido</span>}</h3>
      <p class="cartao__liquido">{formatarMoeda(r.valorLiquido)}</p>
      <p class="cartao__garantia">
        Garantia: {garantiaDe(r.aplicacao.produto) === 'FGC' ? <Termo id="fgc">FGC</Termo> : <Termo id="tesouro">Tesouro Nacional</Termo>}
      </p>
      <PorQueEsseResultado resultado={r} />
    </article>
  );
}

export function ResultadoDuelo({ duelo, palpite }: { duelo: Duelo; palpite: 'A' | 'B' | null }) {
  const nomeA = descreverOferta(duelo.a.aplicacao);
  const nomeB = descreverOferta(duelo.b.aplicacao);
  let feedback: string | null = null;
  if (palpite !== null) {
    feedback = duelo.vencedor === 'EMPATE' ? 'Deu empate: os dois palpites valiam.'
      : palpite === duelo.vencedor ? 'Você acertou!' : 'Você errou, e tudo bem: é assim que se aprende. Veja o porquê abaixo.';
  }
  return (
    <section class="resultado" aria-labelledby="resultado-titulo">
      <h2 id="resultado-titulo">Resultado</h2>
      {feedback && <p class="feedback">{feedback}</p>}
      <ul class="motivos">{explicarVencedor(duelo).map((linha) => <li>{linha}</li>)}</ul>
      <div class="cartoes">
        <Cartao rotulo={`A: ${nomeA}`} r={duelo.a} vencedor={duelo.vencedor === 'A'} />
        <Cartao rotulo={`B: ${nomeB}`} r={duelo.b} vencedor={duelo.vencedor === 'B'} />
      </div>
    </section>
  );
}
```

```tsx
// src/ui/Equivalencias.tsx
import type { ResultadoEquivalencia } from '../engine/equivalencia';
import { formatarMoeda, formatarPercentual } from '../formato';
import { Termo } from './Termo';

export function Equivalencias({ origem, eq }: { origem: string; eq: ResultadoEquivalencia }) {
  return (
    <section class="equivalencias" aria-labelledby="eq-titulo">
      <h2 id="eq-titulo"><Termo id="equivalencia">Equivalências</Termo> de {origem}</h2>
      <p>Para terminar com o mesmo <Termo id="valor-liquido">valor líquido</Termo> ({formatarMoeda(eq.liquidoAlvo)}), você precisaria de:</p>
      <ul>
        <li><Termo id="cdb">CDB</Termo> pós-fixado: <strong>{formatarPercentual(eq.tributadoPosCDI)} do CDI</strong></li>
        {eq.isentoPosCDI !== null && <li><Termo id="lci-lca">LCI/LCA</Termo> pós-fixada: <strong>{formatarPercentual(eq.isentoPosCDI)} do CDI</strong></li>}
        <li>CDB <Termo id="prefixado">prefixado</Termo>: <strong>{formatarPercentual(eq.tributadoPre)} ao ano</strong></li>
        <li>CDB <Termo id="ipca-mais">IPCA+</Termo>: <strong>IPCA + {formatarPercentual(eq.tributadoIpcaMais)} ao ano</strong></li>
      </ul>
      {eq.regraDeBolso !== null && (
        <p class="dica">
          A regra de bolso do mercado daria {formatarPercentual(eq.regraDeBolso)}. Ela divide (ou multiplica) pela
          alíquota do IR ({formatarPercentual(eq.aliquotaIR)}) e ignora que o imposto incide sobre juros compostos.
          Por isso a conta exata acima é diferente.
        </p>
      )}
      {eq.isentoPosCDI === null && (
        <p class="dica">LCI/LCA não aparecem porque esse prazo é menor que o <Termo id="prazo-minimo">prazo mínimo</Termo> legal.</p>
      )}
    </section>
  );
}
```

**Passo 4:** PASSA. **Passo 5:** commit (`feat(ui): resultado do duelo, passo a passo e equivalências`).

---

### Tarefa 24: Tela principal (`App`), formulário e estilos

**Arquivos:** `src/ui/cenarioInicial.ts`, `src/ui/hoje.ts`, `src/ui/preferencias.ts`,
`src/ui/FormOferta.tsx`, `src/ui/App.tsx` (substituir), `src/ui/estilos.css` e
`tests/ui/App.test.tsx`.

**Passo 1:** teste de integração que falha.

```tsx
// tests/ui/App.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/ui/App';
import { somarDias } from '../../src/engine/datas';
import { hoje } from '../../src/ui/hoje';

afterEach(cleanup);
beforeEach(() => localStorage.clear());

describe('App', () => {
  it('esconde o resultado até o palpite e depois explica', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    expect(screen.getByRole('heading', { name: /qual você acha que rende mais/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Resultado' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'LCI 80% do CDI' }));
    expect(screen.getByRole('heading', { name: 'Resultado' })).toBeInTheDocument();
    expect(screen.getByText(/Você errou/)).toBeInTheDocument();
    expect(screen.getByText(/CDB 103% do CDI termina com/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Equivalências de CDB 103% do CDI/ })).toBeInTheDocument();
  });
  it('pular desliga os palpites e vale para a próxima comparação', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    fireEvent.click(screen.getByRole('button', { name: /pular/i }));
    expect(screen.getByRole('heading', { name: 'Resultado' })).toBeInTheDocument();
    cleanup();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    expect(screen.getByRole('heading', { name: 'Resultado' })).toBeInTheDocument();
  });
  it('explica o erro de prazo mínimo da LCI', () => {
    render(<App />);
    fireEvent.input(screen.getByLabelText('Data do resgate'), { target: { value: somarDias(hoje(), 30) } });
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/prazo mínimo legal/);
  });
});
```

**Passo 2:** FALHA. **Passo 3:** implemente.

```ts
// src/ui/cenarioInicial.ts
/** Valores do SGS/BCB em 24/09/2026 (séries 4389, 432, 433 acumulada 12m, 226). No M2 vêm ao vivo. */
export const CENARIO_INICIAL = {
  dataReferencia: '24/09/2026',
  valores: { cdi: 13.65, selicMeta: 13.75, ipca: 4.22, tr: 0.1646 },
};
export type ValoresCenario = typeof CENARIO_INICIAL.valores;
```

```ts
// src/ui/hoje.ts
import type { DataISO } from '../engine/datas';
/** Data local do navegador (não UTC). */
export function hoje(): DataISO {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
```

```ts
// src/ui/preferencias.ts
const CHAVE_PALPITES = 'rende:palpites';

export function lerPalpitesLigados(): boolean {
  try {
    return localStorage.getItem(CHAVE_PALPITES) !== 'desligados';
  } catch {
    return true;
  }
}

export function salvarPalpitesLigados(ligados: boolean): void {
  try {
    localStorage.setItem(CHAVE_PALPITES, ligados ? 'ligados' : 'desligados');
  } catch {
    // Sem storage (aba anônima, bloqueio): a preferência vale só nesta visita.
  }
}
```

```tsx
// src/ui/FormOferta.tsx
import { INDEXACOES_PERMITIDAS, type Indexacao, type Oferta, type TipoIndexacao, type TipoProduto } from '../engine/produtos';

const PRODUTOS: { valor: TipoProduto; rotulo: string }[] = [
  { valor: 'CDB', rotulo: 'CDB' }, { valor: 'RDB', rotulo: 'RDB' }, { valor: 'LC', rotulo: 'LC' },
  { valor: 'LCI', rotulo: 'LCI' }, { valor: 'LCA', rotulo: 'LCA' },
  { valor: 'TESOURO_SELIC', rotulo: 'Tesouro Selic' }, { valor: 'TESOURO_PREFIXADO', rotulo: 'Tesouro Prefixado' },
  { valor: 'TESOURO_IPCA', rotulo: 'Tesouro IPCA+' }, { valor: 'POUPANCA', rotulo: 'Poupança' },
];

const ROTULO_INDEXACAO: Record<TipoIndexacao, string> = {
  POS_CDI: 'Pós-fixado (% do CDI)', PRE: 'Prefixado (% ao ano)', IPCA_MAIS: 'IPCA + (% ao ano)', SELIC: 'Selic', POUPANCA: 'Regra da poupança',
};

function indexacaoPadrao(tipo: TipoIndexacao): Indexacao {
  switch (tipo) {
    case 'POS_CDI': return { tipo, percentualCDI: 1 };
    case 'PRE': return { tipo, taxaAA: 0.12 };
    case 'IPCA_MAIS': return { tipo, taxaRealAA: 0.06 };
    case 'SELIC': return { tipo };
    case 'POUPANCA': return { tipo };
  }
}

/** Taxa em % para o campo; null quando a indexação não tem taxa. */
function taxaEmPercentual(ix: Indexacao): number | null {
  switch (ix.tipo) {
    case 'POS_CDI': return ix.percentualCDI * 100;
    case 'PRE': return ix.taxaAA * 100;
    case 'IPCA_MAIS': return ix.taxaRealAA * 100;
    default: return null;
  }
}

function comTaxa(ix: Indexacao, percentual: number): Indexacao {
  const f = percentual / 100;
  switch (ix.tipo) {
    case 'POS_CDI': return { ...ix, percentualCDI: f };
    case 'PRE': return { ...ix, taxaAA: f };
    case 'IPCA_MAIS': return { ...ix, taxaRealAA: f };
    default: return ix;
  }
}

export function FormOferta({ id, titulo, oferta, onChange }: { id: string; titulo: string; oferta: Oferta; onChange: (o: Oferta) => void }) {
  const permitidas = INDEXACOES_PERMITIDAS[oferta.produto];
  const taxa = taxaEmPercentual(oferta.indexacao);
  function trocarProduto(produto: TipoProduto) {
    const tipos = INDEXACOES_PERMITIDAS[produto];
    const indexacao = tipos.includes(oferta.indexacao.tipo) ? oferta.indexacao : indexacaoPadrao(tipos[0]);
    onChange({ produto, indexacao });
  }
  return (
    <fieldset class="oferta">
      <legend>{titulo}</legend>
      <label for={`${id}-produto`}>Produto</label>
      <select id={`${id}-produto`} value={oferta.produto} onChange={(e) => trocarProduto(e.currentTarget.value as TipoProduto)}>
        {PRODUTOS.map((p) => <option value={p.valor}>{p.rotulo}</option>)}
      </select>
      {permitidas.length > 1 && (
        <>
          <label for={`${id}-indexacao`}>Rentabilidade</label>
          <select id={`${id}-indexacao`} value={oferta.indexacao.tipo}
            onChange={(e) => onChange({ ...oferta, indexacao: indexacaoPadrao(e.currentTarget.value as TipoIndexacao) })}>
            {permitidas.map((t) => <option value={t}>{ROTULO_INDEXACAO[t]}</option>)}
          </select>
        </>
      )}
      {taxa !== null && (
        <>
          <label for={`${id}-taxa`}>Taxa (%)</label>
          <input id={`${id}-taxa`} type="number" step="0.01" inputMode="decimal" value={taxa}
            onInput={(e) => onChange({ ...oferta, indexacao: comTaxa(oferta.indexacao, Number(e.currentTarget.value)) })} />
        </>
      )}
    </fieldset>
  );
}
```

```tsx
// src/ui/App.tsx
import { useState } from 'preact/hooks';
import { descreverOferta } from '../conteudo/motivos';
import { duelar, type Duelo } from '../engine/comparador';
import { somarMeses, type DataISO } from '../engine/datas';
import { calcularEquivalencias, type ResultadoEquivalencia } from '../engine/equivalencia';
import { cenarioConstante } from '../engine/indexadores';
import type { Oferta } from '../engine/produtos';
import { CENARIO_INICIAL, type ValoresCenario } from './cenarioInicial';
import { Equivalencias } from './Equivalencias';
import { FormOferta } from './FormOferta';
import { hoje } from './hoje';
import { PalpiteAntesDeVer } from './PalpiteAntesDeVer';
import { lerPalpitesLigados, salvarPalpitesLigados } from './preferencias';
import { ResultadoDuelo } from './ResultadoDuelo';
import { Termo } from './Termo';

type Calculo = { duelo: Duelo; equivalencia: ResultadoEquivalencia };
type Fase =
  | { tipo: 'editando' }
  | ({ tipo: 'palpite' } & Calculo)
  | ({ tipo: 'resultado'; palpite: 'A' | 'B' | null } & Calculo);

const PRAZOS = [
  { rotulo: '6 meses', meses: 6 }, { rotulo: '1 ano', meses: 12 }, { rotulo: '2 anos', meses: 24 },
  { rotulo: '3 anos', meses: 36 }, { rotulo: '5 anos', meses: 60 },
];

const CAMPOS_CENARIO: { chave: keyof ValoresCenario; rotulo: string; termo: 'cdi' | 'selic' | 'ipca' | 'tr'; sufixo: string }[] = [
  { chave: 'cdi', rotulo: 'CDI', termo: 'cdi', sufixo: '% a.a.' },
  { chave: 'selicMeta', rotulo: 'Selic meta', termo: 'selic', sufixo: '% a.a.' },
  { chave: 'ipca', rotulo: 'IPCA', termo: 'ipca', sufixo: '% a.a.' },
  { chave: 'tr', rotulo: 'TR', termo: 'tr', sufixo: '% a.m.' },
];

export function App() {
  const [cenario, setCenario] = useState<ValoresCenario>(CENARIO_INICIAL.valores);
  const [valor, setValor] = useState(10000);
  const [dataAplicacao, setDataAplicacao] = useState<DataISO>(hoje());
  const [dataResgate, setDataResgate] = useState<DataISO>(somarMeses(hoje(), 24));
  const [a, setA] = useState<Oferta>({ produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 } });
  const [b, setB] = useState<Oferta>({ produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 } });
  const [fase, setFase] = useState<Fase>({ tipo: 'editando' });
  const [erro, setErro] = useState<string | null>(null);
  const [palpitesLigados, setPalpitesLigados] = useState(lerPalpitesLigados());

  /** Qualquer edição invalida o resultado anterior. */
  function editar<T>(set: (v: T) => void) {
    return (v: T) => { set(v); setFase({ tipo: 'editando' }); setErro(null); };
  }

  function comparar(e: Event) {
    e.preventDefault();
    try {
      const cen = cenarioConstante({
        cdiAA: cenario.cdi / 100, selicMetaAA: cenario.selicMeta / 100, ipcaAA: cenario.ipca / 100, trAM: cenario.tr / 100,
      });
      const duelo = duelar(valor, dataAplicacao, dataResgate, a, b, cen);
      const equivalencia = calcularEquivalencias({ ...a, valor, dataAplicacao }, dataResgate, cen);
      setErro(null);
      setFase(palpitesLigados ? { tipo: 'palpite', duelo, equivalencia } : { tipo: 'resultado', palpite: null, duelo, equivalencia });
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
      setFase({ tipo: 'editando' });
    }
  }

  function pularPalpites() {
    salvarPalpitesLigados(false);
    setPalpitesLigados(false);
    if (fase.tipo === 'palpite') setFase({ ...fase, tipo: 'resultado', palpite: null });
  }

  return (
    <main class="pagina">
      <header>
        <h1>Rende</h1>
        <p>Compare investimentos pelo que sobra no bolso e entenda o porquê de cada resultado.</p>
        <p class="aviso">Conteúdo educativo: não é recomendação de investimento.</p>
      </header>

      <form onSubmit={comparar} class="formulario" noValidate>
        <fieldset class="cenario">
          <legend>Cenário (valores de {CENARIO_INICIAL.dataReferencia}, Banco Central; edite à vontade)</legend>
          {CAMPOS_CENARIO.map((c) => (
            <div class="campo">
              <label for={`cen-${c.chave}`}><Termo id={c.termo}>{c.rotulo}</Termo> ({c.sufixo})</label>
              <input id={`cen-${c.chave}`} type="number" step="0.01" inputMode="decimal" value={cenario[c.chave]}
                onInput={(e) => editar(setCenario)({ ...cenario, [c.chave]: Number(e.currentTarget.value) })} />
            </div>
          ))}
          <p class="dica">No M1 o cenário fica constante até o resgate. Projeções do mercado (Focus) chegam na próxima versão.</p>
        </fieldset>

        <fieldset class="aplicacao">
          <legend>Aplicação</legend>
          <div class="campo">
            <label for="valor">Valor (R$)</label>
            <input id="valor" type="number" min="0" step="100" inputMode="decimal" value={valor}
              onInput={(e) => editar(setValor)(Number(e.currentTarget.value))} />
          </div>
          <div class="campo">
            <label for="data-aplicacao">Data da aplicação</label>
            <input id="data-aplicacao" type="date" value={dataAplicacao} onInput={(e) => editar(setDataAplicacao)(e.currentTarget.value)} />
          </div>
          <div class="campo">
            <label for="data-resgate">Data do resgate</label>
            <input id="data-resgate" type="date" value={dataResgate} onInput={(e) => editar(setDataResgate)(e.currentTarget.value)} />
          </div>
          <div class="prazos" role="group" aria-label="Prazos rápidos">
            {PRAZOS.map((p) => (
              <button type="button" onClick={() => editar(setDataResgate)(somarMeses(dataAplicacao, p.meses))}>{p.rotulo}</button>
            ))}
          </div>
        </fieldset>

        <div class="ofertas">
          <FormOferta id="a" titulo="Opção A" oferta={a} onChange={editar(setA)} />
          <FormOferta id="b" titulo="Opção B" oferta={b} onChange={editar(setB)} />
        </div>

        <button type="submit" class="primario">Comparar</button>
        {!palpitesLigados && (
          <button type="button" class="link" onClick={() => { salvarPalpitesLigados(true); setPalpitesLigados(true); }}>
            Religar os palpites
          </button>
        )}
      </form>

      {erro && <p role="alert" class="erro">{erro}</p>}

      {fase.tipo === 'palpite' && (
        <PalpiteAntesDeVer nomeA={descreverOferta(a)} nomeB={descreverOferta(b)}
          onEscolher={(palpite) => setFase({ ...fase, tipo: 'resultado', palpite })} onPular={pularPalpites} />
      )}

      {fase.tipo === 'resultado' && (
        <>
          <ResultadoDuelo duelo={fase.duelo} palpite={fase.palpite} />
          <Equivalencias origem={descreverOferta(a)} eq={fase.equivalencia} />
        </>
      )}
    </main>
  );
}
```

`src/ui/estilos.css`: estilos básicos, responsivos e **sem dependência externa**. O
visual não é o foco do M1, mas precisa de legibilidade no celular (coluna única abaixo
de 640px, cartões lado a lado acima), contraste AA, foco visível nos botões e destaque
em `.cartao--vencedor`. Crie classes para tudo que foi usado acima: `pagina`, `aviso`,
`formulario`, `campo`, `prazos`, `ofertas`, `oferta`, `primario`, `link`, `erro`,
`palpite`, `palpite__opcoes`, `resultado`, `feedback`, `motivos`, `cartoes`, `cartao`,
`cartao--vencedor`, `selo`, `cartao__liquido`, `porque`, `passos`, `passo`,
`passo__linha`, `passo__valor`, `passo__curto`, `passo__matematica`, `termo`,
`termo__botao`, `termo__painel`, `equivalencias` e `dica`.

**Passo 4:** rode `npm test`. Esperado: tudo PASSA. Se o teste de prazo mínimo falhar
por causa do `fireEvent.input` em `type="date"`, confirme que o valor está em `AAAA-MM-DD`.

**Passo 5:** rode o app (`npm run dev`) e confira manualmente no navegador: comparar,
palpite, pular, prazo curto com LCI (erro), termos abrindo e "ver a matemática".

**Passo 6:** commit (`feat(ui): tela de comparação com palpite, explicação e equivalências`).

---

### Tarefa 25: Revisão do conteúdo educativo (portão humano)

Os textos de `src/conteudo/glossario.ts`, `src/conteudo/explicacoes.ts`,
`src/conteudo/motivos.ts`, `src/ui/Equivalencias.tsx` e `src/ui/PalpiteAntesDeVer.tsx`
são rascunhos.

**Passo 1:** abra cada URL de `fonte` do glossário e confirme que ela existe e sustenta o
texto. Troque as que não abrirem ou não sustentarem por uma página oficial equivalente.
Atenção à do CDI (B3) e à da ANBIMA.

**Passo 2:** passe os textos pelo **/vozmax** (destino: site público; audiência: pessoas
aprendendo sobre investimento).

**Passo 3:** mostre o antes/depois ao usuário e **espere a aprovação**.

**Passo 4:** aplique os textos aprovados, ajuste os testes que verificam frases
(`motivos.test.ts`, `explicacoes.test.ts`, `componentes.test.tsx`, `App.test.tsx`), rode
`npm test` e faça o commit (`docs(conteudo): textos educativos revisados`).

---

### Tarefa 26: Verificação final e revisão de segurança do M1

**Passo 1:** rode `npm run lint && npm run typecheck && npm test && npm run build`.
Esperado: tudo verde.

**Passo 2:** faça `npm run preview` e confira no navegador (DevTools → Console) que a
CSP do `_headers` não quebra nada. O `vite preview` não aplica o `_headers`; a
conferência real acontece na URL de preview do Pages (Tarefa 27). Anote para verificar lá.

**Passo 3:** checklist da spec §7 (itens do M1):
- [ ] nenhum `dangerouslySetInnerHTML` (`grep -r dangerouslySetInnerHTML src` vazio);
- [ ] nenhum `style=` inline (`grep -rn "style=" src` vazio);
- [ ] todos os links externos com `rel="noopener noreferrer"`;
- [ ] localStorage só com try/catch (`src/ui/preferencias.ts`);
- [ ] `.env` fora do git (`git check-ignore .env`).

**Passo 4:** use a skill `code-review-and-quality` (ou `requesting-code-review`) sobre o
diff `main...m1` e corrija o que for confirmado.

---

### Tarefa 27: PR, Cloudflare Pages e domínio

**Passo 1 (confirmar com o usuário antes):** envie a branch e abra o PR.

```bash
git push -u origin m1
gh pr create --base main --head m1 --title "M1: motor de cálculo, equivalência e educação nível 1" --body-file docs/plans/2026-09-27-m1-motor-e-equivalencia.md
```

O corpo do PR não leva assinatura de IA. Se preferir, troque `--body-file` por um resumo curto.

**Passo 2 (feito pelo usuário no painel da Cloudflare; entregar este passo a passo):**
1. dash.cloudflare.com → **Workers & Pages** → **Create** → aba **Pages** → **Connect to Git**.
2. Autorize o GitHub e escolha `maxeinstein-dev/onde-investir`.
3. *Production branch*: `main`. *Framework preset*: **None**. *Build command*: `npm run build`.
   *Build output directory*: `dist`.
4. Em **Environment variables**, adicione `NODE_VERSION` = `24`.
5. **Save and Deploy**. Os PRs passam a ganhar URL de preview automaticamente.
6. No projeto → **Custom domains** → **Set up a custom domain** → `rende.maxsueleinstein.dev`.
   Como o domínio já está na Cloudflare, o CNAME é criado sozinho.

**Passo 3 (usuário, no GitHub):** Settings → Branches → **Add branch ruleset/protection**
para `main`: *Require a pull request before merging* + *Require status checks to pass* →
marque o check `verificar` (job do `ci.yml`).

**Passo 4:** na URL de preview do PR, confira:
- a CSP no DevTools (sem erros de *Refused to…*);
- os cabeçalhos com `curl -sI <url-preview> | grep -iE "content-security|x-frame|referrer"` (uma requisição);
- o fluxo completo no celular.

**Passo 5:** com o CI verde e o usuário aprovando o preview, faça o merge do PR. A
produção fica em `https://rende.maxsueleinstein.dev`.

---

## Fora do M1 (não implementar agora)

Indicadores ao vivo, Focus, cenários juros sobem/caem, várias ofertas, tabela por
horizonte, linha do tempo, gráficos, alertas, posições/FGC, link compartilhável, zod,
trilha de aprendizado, progresso, brapi, Turnstile e KV: ver M2–M4 na spec.

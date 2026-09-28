# M4a: Sugestão de carteira por objetivo — Implementation Plan

> **Para o Claude:** use `subagent-driven-development` (ou `executing-plans`). **TDD
> estrito.** Ao abrir o PR, ligue o auto-fix.

**Goal:** dado um objetivo (reserva de emergência, meta com data, longo prazo ou sem
objetivo definido), sugerir uma divisão da carteira em fatias educativas — produto,
indexador e percentual —, cada uma com o motivo, o casamento com o catálogo quando
existir, o aviso de FGC combinado com a carteira, e o link para a lição correspondente.

**Architecture:** o motor (`src/engine/sugestao.ts`) é puro e devolve dados
estruturados (nunca texto nem `IdLicao`) — o mesmo padrão de `Alerta`/`TextoAlerta`
já usado em `alertas.ts`. A camada `src/conteudo/sugestao.ts` traduz cada `MotivoFatia`
em texto e liga à lição. A persistência (`src/armazenamento/objetivos.ts`) guarda só as
*entradas* do objetivo; a sugestão é recalculada a cada visualização, contra o catálogo
e a carteira atuais. A UI ganha a aba "Objetivos", com gráfico de pizza reaproveitando o
carregamento sob demanda do Chart.js já usado nos outros gráficos.

**Tech Stack:** o mesmo do resto do app (TypeScript, Preact, Vitest, zod, Chart.js sob
demanda). Nenhuma dependência nova.

**Referências:**
- Design: `docs/superpowers/specs/2026-09-29-m4a-sugestao-por-objetivo-design.md`
- Spec principal: `docs/superpowers/specs/2026-09-27-onde-investir-design.md`, §9.1

**Desvio consciente do design aprovado (documentado aqui, não é um erro de execução):**
o design descreve `Fatia { …, motivo: string, licao: IdLicao }` no engine. Em todo o
resto do app, o engine nunca importa de `src/conteudo/` nem produz texto — quem faz isso
é a camada de conteúdo (ver `Alerta` → `textoDoAlerta`/`LICAO_DO_ALERTA` em
`src/conteudo/alertas.ts`). Este plano segue o padrão já estabelecido: o engine devolve
`motivo: MotivoFatia` (um enum), e `src/conteudo/sugestao.ts` traduz para texto e lição.
O resultado para o usuário é idêntico ao design; só a fronteira interna muda.

---

## Lote A — Engine

### Tarefa A0: Branch

```bash
git switch main && git pull --ff-only origin main && git switch -c m4a
```

(Se a branch `m4a` já existir localmente com o commit do design, como pode ser o caso,
pule este passo — ela já está correta.)

### Tarefa A1: Regras de alocação (`src/engine/regras/sugestao.ts`)

**Arquivos:**
- Create: `src/engine/regras/sugestao.ts`
- Test: `tests/engine/regras/sugestao.test.ts`

**Step 1: Write the failing test**

```ts
// tests/engine/regras/sugestao.test.ts
import { describe, expect, it } from 'vitest';
import { faixaLongoPrazo, MULTIPLICADOR_RESERVA } from '../../../src/engine/regras/sugestao';

describe('regras de sugestão', () => {
  it('multiplicador da reserva: 6× estável, 12× variável', () => {
    expect(MULTIPLICADOR_RESERVA.estavel).toBe(6);
    expect(MULTIPLICADOR_RESERVA.variavel).toBe(12);
  });

  it('faixa de longo prazo por horizonte, com as fronteiras exatas', () => {
    expect(faixaLongoPrazo(1)).toEqual({ ateAnos: 10, ipca: 0.6, pos: 0.4 });
    expect(faixaLongoPrazo(10)).toEqual({ ateAnos: 10, ipca: 0.6, pos: 0.4 });
    expect(faixaLongoPrazo(11)).toEqual({ ateAnos: 20, ipca: 0.7, pos: 0.3 });
    expect(faixaLongoPrazo(20)).toEqual({ ateAnos: 20, ipca: 0.7, pos: 0.3 });
    expect(faixaLongoPrazo(21)).toEqual({ ateAnos: Infinity, ipca: 0.8, pos: 0.2 });
    expect(faixaLongoPrazo(50)).toEqual({ ateAnos: Infinity, ipca: 0.8, pos: 0.2 });
  });

  it('cada faixa soma 100%', () => {
    for (const anos of [5, 10, 15, 20, 30]) {
      const f = faixaLongoPrazo(anos);
      expect(f.ipca + f.pos).toBeCloseTo(1, 10);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/regras/sugestao.test.ts`
Expected: FAIL — `Cannot find module '../../../src/engine/regras/sugestao'`

**Step 3: Write minimal implementation**

```ts
// src/engine/regras/sugestao.ts
// Regras de alocação da sugestão por objetivo (spec §9.1, design M4a §3). Ao contrário das
// demais regras de `regras/`, estas não têm fonte legal: são uma heurística própria do
// app, por isso NÃO usam `resolverRegra`/`VersaoRegra` (não há "vigência" de uma lei).
// Ficam num arquivo à parte, no mesmo espírito de "regra como dado", para serem fáceis de
// achar e ajustar sem espalhar números pelo código de sugestão.

/** Reserva de emergência: quantas vezes o gasto mensal, conforme a estabilidade da renda. */
export const MULTIPLICADOR_RESERVA = { estavel: 6, variavel: 12 } as const;

export interface FaixaLongoPrazo {
  /** Fronteira superior da faixa, em anos (inclusive). A última faixa usa Infinity. */
  ateAnos: number;
  /** Fração em Tesouro IPCA+ (ou, no longo prazo dentro de "sem objetivo definido", o mesmo papel). */
  ipca: number;
  /** Fração em pós-fixado. */
  pos: number;
}

/** Longo prazo / aposentadoria e a faixa "5+ anos" de "sem objetivo definido" (design M4a §3). */
export const FAIXAS_LONGO_PRAZO: readonly FaixaLongoPrazo[] = [
  { ateAnos: 10, ipca: 0.6, pos: 0.4 },
  { ateAnos: 20, ipca: 0.7, pos: 0.3 },
  { ateAnos: Infinity, ipca: 0.8, pos: 0.2 },
];

/** A primeira faixa cujo `ateAnos` cobre o horizonte. */
export function faixaLongoPrazo(horizonteAnos: number): FaixaLongoPrazo {
  return FAIXAS_LONGO_PRAZO.find((f) => horizonteAnos <= f.ateAnos) ?? (FAIXAS_LONGO_PRAZO.at(-1) as FaixaLongoPrazo);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/regras/sugestao.test.ts`
Expected: PASS (4 testes)

**Step 5: Commit**

```bash
git add src/engine/regras/sugestao.ts tests/engine/regras/sugestao.test.ts
git commit -m "feat(engine): regras de alocação da sugestão por objetivo"
```

---

### Tarefa A2: Tipos, validação e `valorAlvo` (`src/engine/sugestao.ts`)

**Arquivos:**
- Create: `src/engine/sugestao.ts`
- Test: `tests/engine/sugestao.test.ts`

**Step 1: Write the failing test**

```ts
// tests/engine/sugestao.test.ts (parte 1 — as demais partes entram nas tarefas seguintes)
import { describe, expect, it } from 'vitest';
import { OfertaInvalidaError } from '../../src/engine/erros';
import { validarObjetivo, valorAlvo, type Objetivo } from '../../src/engine/sugestao';

const HOJE = '2026-09-29';

describe('valorAlvo', () => {
  it('reserva: gasto × 6 (estável) ou × 12 (variável)', () => {
    expect(valorAlvo({ tipo: 'RESERVA', gastoMensal: 3000, rendaEstavel: true })).toBe(18000);
    expect(valorAlvo({ tipo: 'RESERVA', gastoMensal: 3000, rendaEstavel: false })).toBe(36000);
  });
  it('com data: o próprio valor-alvo', () => {
    expect(valorAlvo({ tipo: 'COM_DATA', valorAlvo: 50000, data: '2028-01-01' })).toBe(50000);
  });
  it('longo prazo e sem objetivo: sem valor-alvo (só horizonte)', () => {
    expect(valorAlvo({ tipo: 'LONGO_PRAZO', horizonteAnos: 15 })).toBeNull();
    expect(valorAlvo({ tipo: 'SEM_OBJETIVO', horizonteAnos: 3 })).toBeNull();
  });
});

describe('validarObjetivo', () => {
  it('reserva: gasto mensal precisa ser positivo', () => {
    expect(() => validarObjetivo({ tipo: 'RESERVA', gastoMensal: 0, rendaEstavel: true }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ tipo: 'RESERVA', gastoMensal: Number.NaN, rendaEstavel: true }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ tipo: 'RESERVA', gastoMensal: 2000, rendaEstavel: true }, HOJE)).not.toThrow();
  });
  it('com data: valor positivo, data válida e no futuro', () => {
    const base: Objetivo = { tipo: 'COM_DATA', valorAlvo: 1000, data: '2028-01-01' };
    expect(() => validarObjetivo({ ...base, valorAlvo: 0 }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ ...base, data: '2026-13-01' }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ ...base, data: '2026-01-01' }, HOJE)).toThrow(OfertaInvalidaError); // no passado
    expect(() => validarObjetivo({ ...base, data: HOJE }, HOJE)).toThrow(OfertaInvalidaError); // hoje não é "no futuro"
    expect(() => validarObjetivo(base, HOJE)).not.toThrow();
  });
  it('longo prazo e sem objetivo: horizonte inteiro maior que zero', () => {
    expect(() => validarObjetivo({ tipo: 'LONGO_PRAZO', horizonteAnos: 0 }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ tipo: 'LONGO_PRAZO', horizonteAnos: 5.5 }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ tipo: 'SEM_OBJETIVO', horizonteAnos: 10 }, HOJE)).not.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/sugestao.test.ts`
Expected: FAIL — `Cannot find module '../../src/engine/sugestao'`

**Step 3: Write minimal implementation**

```ts
// src/engine/sugestao.ts
// Sugestão de carteira por objetivo (spec §9.1). Motor puro: recebe o catálogo e a carteira
// como dados (não busca nada), e devolve fatias ESTRUTURADAS — nunca texto nem IdLicao,
// no mesmo padrão de src/engine/alertas.ts. A tradução para texto fica em
// src/conteudo/sugestao.ts.
import { type DataISO, ehDataValida } from './datas';
import { OfertaInvalidaError } from './erros';
import type { ItemFGC } from './fgc';
import { coberto, normalizarConglomerado } from './fgc';
import type { OfertaCadastrada } from './ofertas';
import { garantiaDe, type TipoIndexacao, type TipoProduto } from './produtos';
import { regraFGC } from './regras/fgc';
import { faixaLongoPrazo, MULTIPLICADOR_RESERVA } from './regras/sugestao';

export type Objetivo =
  | { tipo: 'RESERVA'; gastoMensal: number; rendaEstavel: boolean }
  | { tipo: 'COM_DATA'; valorAlvo: number; data: DataISO }
  | { tipo: 'LONGO_PRAZO'; horizonteAnos: number }
  | { tipo: 'SEM_OBJETIVO'; horizonteAnos: number };

export type MotivoFatia =
  | 'RESERVA_TESOURO_SELIC' | 'RESERVA_CDB_LIQUIDEZ'
  | 'DATA_VENCIMENTO_CASADO' | 'DATA_SEM_CASAMENTO'
  | 'LONGO_PRAZO_IPCA' | 'LONGO_PRAZO_POS'
  | 'SEM_OBJETIVO_POS' | 'SEM_OBJETIVO_PRE' | 'SEM_OBJETIVO_IPCA';

export interface Fatia {
  produto: TipoProduto;
  indexacaoTipo: TipoIndexacao;
  /** Fração desta fatia no objetivo; a soma das fatias de um objetivo é 1. */
  percentual: number;
  motivo: MotivoFatia;
  garantia: 'FGC' | 'TESOURO_NACIONAL';
  /** `valorAlvo(objetivo) * percentual`; null quando o objetivo não tem valor-alvo (longo prazo, sem objetivo). */
  valor: number | null;
  /** A primeira oferta do catálogo compatível (mesmo produto + mesma família de indexador). */
  ofertaCatalogo?: OfertaCadastrada;
  /** Presente só quando há `ofertaCatalogo` e a soma com a carteira, no conglomerado dela, passa do limite do FGC. */
  fgc?: { conglomerado: string; excedente: number };
}

export interface ContextoSugestao {
  catalogo: readonly OfertaCadastrada[];
  /** A exposição já existente (carteira do M3a), para o aviso de FGC combinado. */
  carteira: readonly ItemFGC[];
  hoje: DataISO;
}

export function valorAlvo(objetivo: Objetivo): number | null {
  switch (objetivo.tipo) {
    case 'RESERVA': return objetivo.gastoMensal * (objetivo.rendaEstavel ? MULTIPLICADOR_RESERVA.estavel : MULTIPLICADOR_RESERVA.variavel);
    case 'COM_DATA': return objetivo.valorAlvo;
    case 'LONGO_PRAZO':
    case 'SEM_OBJETIVO':
      return null;
  }
}

export function validarObjetivo(o: Objetivo, hoje: DataISO): void {
  switch (o.tipo) {
    case 'RESERVA':
      if (!Number.isFinite(o.gastoMensal) || o.gastoMensal <= 0) throw new OfertaInvalidaError('Preencha o gasto mensal, maior que zero.');
      break;
    case 'COM_DATA':
      if (!Number.isFinite(o.valorAlvo) || o.valorAlvo <= 0) throw new OfertaInvalidaError('Preencha o valor-alvo, maior que zero.');
      if (!ehDataValida(o.data)) throw new OfertaInvalidaError('A data é inválida.');
      else if (o.data <= hoje) throw new OfertaInvalidaError('A data precisa ser no futuro.');
      break;
    case 'LONGO_PRAZO':
    case 'SEM_OBJETIVO':
      if (!Number.isInteger(o.horizonteAnos) || o.horizonteAnos <= 0) {
        throw new OfertaInvalidaError('Informe um horizonte em anos inteiro, maior que zero.');
      }
      break;
  }
}
```

Este passo só cobre tipos, `valorAlvo` e `validarObjetivo`. As funções `sugerir*` entram
nas próximas tarefas, no mesmo arquivo (o arquivo cresce; o teste também).

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/sugestao.test.ts`
Expected: PASS (7 testes)

**Step 5: Commit**

```bash
git add src/engine/sugestao.ts tests/engine/sugestao.test.ts
git commit -m "feat(engine): tipos, validação e valor-alvo da sugestão por objetivo"
```

---

### Tarefa A3: Casamento com o catálogo e FGC combinado

**Arquivos:** modificar `src/engine/sugestao.ts` e `tests/engine/sugestao.test.ts`.

**Step 1: Write the failing test**

Acrescente ao arquivo de teste:

```ts
import { casarComCatalogo, type Fatia } from '../../src/engine/sugestao'; // ajuste o import do topo para incluir isto

const catalogoBase = (over: Partial<OfertaCadastrada> = {}): OfertaCadastrada => ({
  id: 'o1', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 },
  emissor: 'Banco X', conglomerado: 'Banco X', liquidez: 'DIARIA', ...over,
});
const fatiaBase = (over: Partial<Fatia> = {}): Fatia => ({
  produto: 'CDB', indexacaoTipo: 'POS_CDI', percentual: 1, motivo: 'SEM_OBJETIVO_POS', garantia: 'FGC', valor: 10000, ...over,
});
const carteiraItem = (conglomerado: string, valor: number, vencimento?: string): ItemFGC => ({
  conglomerado, produto: 'CDB', vencimento, brutoEm: () => valor,
});

describe('casarComCatalogo', () => {
  it('acha a primeira oferta compatível (produto + tipo de indexação)', () => {
    const catalogo = [catalogoBase({ id: 'a', produto: 'LCI' }), catalogoBase({ id: 'b' })];
    const [f] = casarComCatalogo([fatiaBase()], catalogo, [], HOJE);
    expect(f?.ofertaCatalogo?.id).toBe('b');
  });
  it('sem oferta compatível, fica sem ofertaCatalogo e sem fgc', () => {
    const [f] = casarComCatalogo([fatiaBase()], [], [], HOJE);
    expect(f?.ofertaCatalogo).toBeUndefined();
    expect(f?.fgc).toBeUndefined();
  });
  it('liquidezDiaria=true só casa com ofertas de liquidez diária', () => {
    const catalogo = [catalogoBase({ liquidez: 'NO_VENCIMENTO', vencimento: '2030-01-01' })];
    const [f] = casarComCatalogo([fatiaBase()], catalogo, [], HOJE, { liquidezDiaria: true });
    expect(f?.ofertaCatalogo).toBeUndefined();
  });
  it('soma com a carteira do mesmo conglomerado (normalizado) e alerta ao passar do limite', () => {
    const catalogo = [catalogoBase({ conglomerado: 'Banco  X' })]; // com espaço extra, mesmo conglomerado normalizado
    const carteira = [carteiraItem('BANCO X', 240000)];
    const [f] = casarComCatalogo([fatiaBase({ valor: 20000 })], catalogo, carteira, HOJE);
    expect(f?.fgc).toEqual({ conglomerado: 'Banco  X', excedente: 10000 }); // 240000 + 20000 − 250000
  });
  it('abaixo do limite, sem alerta', () => {
    const catalogo = [catalogoBase()];
    const carteira = [carteiraItem('Banco X', 100000)];
    const [f] = casarComCatalogo([fatiaBase({ valor: 20000 })], catalogo, carteira, HOJE);
    expect(f?.fgc).toBeUndefined();
  });
  it('fatia sem garantia FGC (Tesouro) nunca gera aviso de FGC', () => {
    const catalogo = [catalogoBase({ produto: 'TESOURO_SELIC', indexacao: { tipo: 'SELIC' }, vencimento: '2030-01-01' })];
    const carteira = [carteiraItem('Banco X', 500000)]; // outro conglomerado (Tesouro não soma com CDB de banco)
    const [f] = casarComCatalogo(
      [fatiaBase({ produto: 'TESOURO_SELIC', indexacaoTipo: 'SELIC', garantia: 'TESOURO_NACIONAL', valor: 500000 })],
      catalogo, carteira, HOJE,
    );
    expect(f?.fgc).toBeUndefined();
  });
  it('valor null (longo prazo, sem objetivo): nunca gera aviso de FGC', () => {
    const catalogo = [catalogoBase()];
    const carteira = [carteiraItem('Banco X', 260000)];
    const [f] = casarComCatalogo([fatiaBase({ valor: null })], catalogo, carteira, HOJE);
    expect(f?.fgc).toBeUndefined();
  });
});
```

Ajuste o import do topo do arquivo de teste para incluir `type ItemFGC` de
`'../../src/engine/fgc'` e `type OfertaCadastrada` de `'../../src/engine/ofertas'`.

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/sugestao.test.ts`
Expected: FAIL — `casarComCatalogo is not a function` (ou `Cannot find module`, conforme o import)

**Step 3: Write minimal implementation**

Acrescente ao fim de `src/engine/sugestao.ts`:

```ts
function primeiraCompativel(
  catalogo: readonly OfertaCadastrada[], produto: TipoProduto, indexacaoTipo: TipoIndexacao, liquidezDiaria: boolean,
): OfertaCadastrada | undefined {
  return catalogo.find(
    (o) => o.produto === produto && o.indexacao.tipo === indexacaoTipo && (!liquidezDiaria || o.liquidez === 'DIARIA'),
  );
}

function excedenteFGC(conglomerado: string, valorFatia: number, carteira: readonly ItemFGC[], hoje: DataISO): Fatia['fgc'] {
  const limite = regraFGC(hoje).porConglomerado;
  const chave = normalizarConglomerado(conglomerado);
  const jaTem = carteira
    .filter((i) => coberto(i.produto) && normalizarConglomerado(i.conglomerado) === chave)
    .reduce((soma, i) => soma + i.brutoEm(hoje), 0);
  const total = jaTem + valorFatia;
  return total > limite ? { conglomerado, excedente: total - limite } : undefined;
}

export interface OpcoesCasamento {
  /** Exige liquidez diária na oferta do catálogo (reserva de emergência). Padrão: false. */
  liquidezDiaria?: boolean;
}

/**
 * Preenche `ofertaCatalogo` (a primeira compatível) e `fgc` (quando há oferta casada, garantia FGC, valor
 * definido e a soma com a carteira do mesmo conglomerado passa do limite) em cada fatia.
 */
export function casarComCatalogo(
  fatias: readonly Fatia[], catalogo: readonly OfertaCadastrada[], carteira: readonly ItemFGC[], hoje: DataISO,
  opcoes: OpcoesCasamento = {},
): Fatia[] {
  return fatias.map((f) => {
    const ofertaCatalogo = primeiraCompativel(catalogo, f.produto, f.indexacaoTipo, opcoes.liquidezDiaria ?? false);
    const fgc = f.garantia === 'FGC' && f.valor !== null && ofertaCatalogo
      ? excedenteFGC(ofertaCatalogo.conglomerado, f.valor, carteira, hoje)
      : undefined;
    return { ...f, ofertaCatalogo, fgc };
  });
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/sugestao.test.ts`
Expected: PASS (14 testes)

**Step 5: Commit**

```bash
git add src/engine/sugestao.ts tests/engine/sugestao.test.ts
git commit -m "feat(engine): casamento com o catálogo e aviso de FGC combinado com a carteira"
```

---

### Tarefa A4: `sugerir` — Reserva e Longo prazo

**Arquivos:** modificar `src/engine/sugestao.ts` e `tests/engine/sugestao.test.ts`.

**Step 1: Write the failing test**

```ts
import { sugerir } from '../../src/engine/sugestao'; // ajuste o import do topo

const ctx = (over: Partial<ContextoSugestao> = {}): ContextoSugestao => ({ catalogo: [], carteira: [], hoje: HOJE, ...over });

describe('sugerir — RESERVA', () => {
  it('duas fatias: 50% Tesouro Selic + 50% CDB pós liquidez diária, somando o valor-alvo', () => {
    const fatias = sugerir({ tipo: 'RESERVA', gastoMensal: 2000, rendaEstavel: true }, ctx());
    expect(fatias).toHaveLength(2);
    expect(fatias[0]).toMatchObject({ produto: 'TESOURO_SELIC', indexacaoTipo: 'SELIC', percentual: 0.5, motivo: 'RESERVA_TESOURO_SELIC', garantia: 'TESOURO_NACIONAL', valor: 6000 });
    expect(fatias[1]).toMatchObject({ produto: 'CDB', indexacaoTipo: 'POS_CDI', percentual: 0.5, motivo: 'RESERVA_CDB_LIQUIDEZ', garantia: 'FGC', valor: 6000 });
    expect(fatias.reduce((s, f) => s + f.percentual, 0)).toBeCloseTo(1, 10);
  });
  it('só casa com CDB de liquidez diária no catálogo', () => {
    const catalogo = [
      { id: 'a', produto: 'CDB' as const, indexacao: { tipo: 'POS_CDI' as const, percentualCDI: 1 }, emissor: 'Y', conglomerado: 'Y', liquidez: 'NO_VENCIMENTO' as const, vencimento: '2030-01-01' },
      { id: 'b', produto: 'CDB' as const, indexacao: { tipo: 'POS_CDI' as const, percentualCDI: 1.1 }, emissor: 'Z', conglomerado: 'Z', liquidez: 'DIARIA' as const },
    ];
    const fatias = sugerir({ tipo: 'RESERVA', gastoMensal: 1000, rendaEstavel: true }, ctx({ catalogo }));
    expect(fatias[1]?.ofertaCatalogo?.id).toBe('b');
  });
});

describe('sugerir — LONGO_PRAZO', () => {
  it('duas fatias pela faixa do horizonte, sem valor (não há valor-alvo)', () => {
    const fatias = sugerir({ tipo: 'LONGO_PRAZO', horizonteAnos: 15 }, ctx());
    expect(fatias).toEqual([
      { produto: 'TESOURO_IPCA', indexacaoTipo: 'IPCA_MAIS', percentual: 0.7, motivo: 'LONGO_PRAZO_IPCA', garantia: 'TESOURO_NACIONAL', valor: null, ofertaCatalogo: undefined, fgc: undefined },
      { produto: 'CDB', indexacaoTipo: 'POS_CDI', percentual: 0.3, motivo: 'LONGO_PRAZO_POS', garantia: 'FGC', valor: null, ofertaCatalogo: undefined, fgc: undefined },
    ]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/sugestao.test.ts`
Expected: FAIL — `sugerir is not a function`

**Step 3: Write minimal implementation**

Acrescente ao fim de `src/engine/sugestao.ts`:

```ts
function sugerirReserva(o: Extract<Objetivo, { tipo: 'RESERVA' }>, ctx: ContextoSugestao): Fatia[] {
  const total = valorAlvo(o) as number;
  const base: Fatia[] = [
    { produto: 'TESOURO_SELIC', indexacaoTipo: 'SELIC', percentual: 0.5, motivo: 'RESERVA_TESOURO_SELIC', garantia: 'TESOURO_NACIONAL', valor: total * 0.5 },
    { produto: 'CDB', indexacaoTipo: 'POS_CDI', percentual: 0.5, motivo: 'RESERVA_CDB_LIQUIDEZ', garantia: 'FGC', valor: total * 0.5 },
  ];
  return casarComCatalogo(base, ctx.catalogo, ctx.carteira, ctx.hoje, { liquidezDiaria: true });
}

function sugerirLongoPrazo(o: Extract<Objetivo, { tipo: 'LONGO_PRAZO' }>, ctx: ContextoSugestao): Fatia[] {
  const faixa = faixaLongoPrazo(o.horizonteAnos);
  const base: Fatia[] = [
    { produto: 'TESOURO_IPCA', indexacaoTipo: 'IPCA_MAIS', percentual: faixa.ipca, motivo: 'LONGO_PRAZO_IPCA', garantia: 'TESOURO_NACIONAL', valor: null },
    { produto: 'CDB', indexacaoTipo: 'POS_CDI', percentual: faixa.pos, motivo: 'LONGO_PRAZO_POS', garantia: 'FGC', valor: null },
  ];
  return casarComCatalogo(base, ctx.catalogo, ctx.carteira, ctx.hoje);
}
```

Ainda não crie `sugerir` (o dispatcher) — ele entra na Tarefa A6, depois que
`sugerirComData` e `sugerirSemObjetivo` existirem. Por enquanto, para o teste desta
tarefa passar, adicione um `sugerir` temporário que só trata os dois casos já prontos:

```ts
export function sugerir(objetivo: Objetivo, ctx: ContextoSugestao): Fatia[] {
  switch (objetivo.tipo) {
    case 'RESERVA': return sugerirReserva(objetivo, ctx);
    case 'LONGO_PRAZO': return sugerirLongoPrazo(objetivo, ctx);
    default: throw new Error(`Objetivo "${objetivo.tipo}" ainda não implementado`);
  }
}
```

(A Tarefa A6 substitui esse `default` pelos dois casos que faltam.)

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/sugestao.test.ts`
Expected: PASS (16 testes)

**Step 5: Commit**

```bash
git add src/engine/sugestao.ts tests/engine/sugestao.test.ts
git commit -m "feat(engine): sugestão para reserva de emergência e longo prazo"
```

---

### Tarefa A5: `sugerir` — Com data (casamento de vencimento)

**Arquivos:** modificar `src/engine/sugestao.ts` e `tests/engine/sugestao.test.ts`.

**Step 1: Write the failing test**

```ts
describe('sugerir — COM_DATA', () => {
  const objetivo = { tipo: 'COM_DATA' as const, valorAlvo: 50000, data: '2029-06-01' };

  it('sem catálogo, cai no pós-fixado genérico de fallback', () => {
    const [f] = sugerir(objetivo, ctx());
    expect(f).toMatchObject({ produto: 'CDB', indexacaoTipo: 'POS_CDI', percentual: 1, motivo: 'DATA_SEM_CASAMENTO', garantia: 'FGC', valor: 50000 });
  });

  it('casa com o vencimento mais próximo, sem passar da data', () => {
    const catalogo = [
      { id: 'longe', produto: 'TESOURO_PREFIXADO' as const, indexacao: { tipo: 'PRE' as const, taxaAA: 0.12 }, emissor: 'Tesouro', conglomerado: 'Tesouro', liquidez: 'DIARIA' as const, vencimento: '2035-01-01' },
      { id: 'certo', produto: 'CDB' as const, indexacao: { tipo: 'PRE' as const, taxaAA: 0.13 }, emissor: 'Banco Y', conglomerado: 'Banco Y', liquidez: 'NO_VENCIMENTO' as const, vencimento: '2029-05-15' },
      { id: 'passa', produto: 'CDB' as const, indexacao: { tipo: 'POS_CDI' as const, percentualCDI: 1 }, emissor: 'Banco Z', conglomerado: 'Banco Z', liquidez: 'NO_VENCIMENTO' as const, vencimento: '2029-07-01' }, // depois da data-alvo, não serve
    ];
    const [f] = sugerir(objetivo, ctx({ catalogo }));
    expect(f?.ofertaCatalogo?.id).toBe('certo');
    expect(f).toMatchObject({ produto: 'CDB', indexacaoTipo: 'PRE', motivo: 'DATA_VENCIMENTO_CASADO', garantia: 'FGC', valor: 50000 });
  });

  it('entre duas ofertas que casam, escolhe a de vencimento mais próximo da data', () => {
    const catalogo = [
      { id: 'longe', produto: 'CDB' as const, indexacao: { tipo: 'PRE' as const, taxaAA: 0.1 }, emissor: 'A', conglomerado: 'A', liquidez: 'NO_VENCIMENTO' as const, vencimento: '2029-01-01' },
      { id: 'perto', produto: 'CDB' as const, indexacao: { tipo: 'PRE' as const, taxaAA: 0.1 }, emissor: 'B', conglomerado: 'B', liquidez: 'NO_VENCIMENTO' as const, vencimento: '2029-05-30' },
    ];
    const [f] = sugerir(objetivo, ctx({ catalogo }));
    expect(f?.ofertaCatalogo?.id).toBe('perto');
  });

  it('gera aviso de FGC quando o valor-alvo somado à carteira passa do limite', () => {
    const catalogo = [{ id: 'a', produto: 'CDB' as const, indexacao: { tipo: 'PRE' as const, taxaAA: 0.1 }, emissor: 'Banco X', conglomerado: 'Banco X', liquidez: 'NO_VENCIMENTO' as const, vencimento: '2029-05-01' }];
    const carteira: ItemFGC[] = [{ conglomerado: 'Banco X', produto: 'CDB', brutoEm: () => 210000 }];
    const [f] = sugerir(objetivo, ctx({ catalogo, carteira }));
    expect(f?.fgc).toEqual({ conglomerado: 'Banco X', excedente: 10000 }); // 210000 + 50000 − 250000
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/sugestao.test.ts`
Expected: FAIL — a suíte inteira quebra no `default: throw` do `sugerir` para `'COM_DATA'`

**Step 3: Write minimal implementation**

Acrescente ao arquivo, antes do `sugerir` (import `garantiaDe` já está no topo):

```ts
function ofertaCasadaComData(catalogo: readonly OfertaCadastrada[], dataAlvo: DataISO): OfertaCadastrada | undefined {
  const candidatas = catalogo.filter((o) => o.vencimento !== undefined && o.vencimento <= dataAlvo);
  if (candidatas.length === 0) return undefined;
  // DataISO é AAAA-MM-DD: compara como string. A maior é a mais próxima da data-alvo, sem passar dela.
  return candidatas.reduce((melhor, o) => ((o.vencimento as DataISO) > (melhor.vencimento as DataISO) ? o : melhor));
}

function sugerirComData(o: Extract<Objetivo, { tipo: 'COM_DATA' }>, ctx: ContextoSugestao): Fatia[] {
  const casada = ofertaCasadaComData(ctx.catalogo, o.data);
  if (casada) {
    const fgc = coberto(casada.produto) && ctx.carteira.length >= 0
      ? excedenteFGC(casada.conglomerado, o.valorAlvo, ctx.carteira, ctx.hoje)
      : undefined;
    return [{
      produto: casada.produto, indexacaoTipo: casada.indexacao.tipo, percentual: 1, motivo: 'DATA_VENCIMENTO_CASADO',
      garantia: garantiaDe(casada.produto), valor: o.valorAlvo, ofertaCatalogo: casada, fgc,
    }];
  }
  return casarComCatalogo(
    [{ produto: 'CDB', indexacaoTipo: 'POS_CDI', percentual: 1, motivo: 'DATA_SEM_CASAMENTO', garantia: 'FGC', valor: o.valorAlvo }],
    ctx.catalogo, ctx.carteira, ctx.hoje, { liquidezDiaria: true },
  );
}
```

`ctx.carteira.length >= 0` é sempre verdadeiro — está ali só para deixar explícito que a
checagem de FGC não depende de a carteira estar vazia; simplifique para
`coberto(casada.produto)` se preferir (o comportamento é idêntico). Depois, troque o
`default: throw` do `sugerir` para incluir o caso novo:

```ts
export function sugerir(objetivo: Objetivo, ctx: ContextoSugestao): Fatia[] {
  switch (objetivo.tipo) {
    case 'RESERVA': return sugerirReserva(objetivo, ctx);
    case 'COM_DATA': return sugerirComData(objetivo, ctx);
    case 'LONGO_PRAZO': return sugerirLongoPrazo(objetivo, ctx);
    default: throw new Error(`Objetivo "${objetivo.tipo}" ainda não implementado`);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/sugestao.test.ts`
Expected: PASS (20 testes)

**Step 5: Commit**

```bash
git add src/engine/sugestao.ts tests/engine/sugestao.test.ts
git commit -m "feat(engine): sugestão para objetivo com data, casando o vencimento"
```

---

### Tarefa A6: `sugerir` — Sem objetivo definido (e fecha o dispatcher)

**Arquivos:** modificar `src/engine/sugestao.ts` e `tests/engine/sugestao.test.ts`.

**Step 1: Write the failing test**

```ts
describe('sugerir — SEM_OBJETIVO', () => {
  it('até 1 ano: 100% pós-fixado', () => {
    const fatias = sugerir({ tipo: 'SEM_OBJETIVO', horizonteAnos: 1 }, ctx());
    expect(fatias).toEqual([{ produto: 'CDB', indexacaoTipo: 'POS_CDI', percentual: 1, motivo: 'SEM_OBJETIVO_POS', garantia: 'FGC', valor: null, ofertaCatalogo: undefined, fgc: undefined }]);
  });
  it('de 1 a 5 anos: metade pós, metade prefixado', () => {
    const fatias = sugerir({ tipo: 'SEM_OBJETIVO', horizonteAnos: 3 }, ctx());
    expect(fatias.map((f) => [f.motivo, f.percentual])).toEqual([['SEM_OBJETIVO_POS', 0.5], ['SEM_OBJETIVO_PRE', 0.5]]);
  });
  it('acima de 5 anos: entra o IPCA+ na proporção da tabela de longo prazo', () => {
    const fatias = sugerir({ tipo: 'SEM_OBJETIVO', horizonteAnos: 12 }, ctx());
    expect(fatias.map((f) => [f.produto, f.motivo, f.percentual])).toEqual([
      ['TESOURO_IPCA', 'SEM_OBJETIVO_IPCA', 0.7], ['CDB', 'SEM_OBJETIVO_POS', 0.3],
    ]);
  });
  it('toda fatia soma 100%, em qualquer faixa', () => {
    for (const horizonteAnos of [1, 3, 5, 6, 12, 25]) {
      const fatias = sugerir({ tipo: 'SEM_OBJETIVO', horizonteAnos }, ctx());
      expect(fatias.reduce((s, f) => s + f.percentual, 0)).toBeCloseTo(1, 10);
    }
  });
});

describe('sugerir — dispatcher completo', () => {
  it('os 4 tipos de objetivo funcionam', () => {
    expect(sugerir({ tipo: 'RESERVA', gastoMensal: 1000, rendaEstavel: true }, ctx()).length).toBeGreaterThan(0);
    expect(sugerir({ tipo: 'COM_DATA', valorAlvo: 1000, data: '2030-01-01' }, ctx()).length).toBeGreaterThan(0);
    expect(sugerir({ tipo: 'LONGO_PRAZO', horizonteAnos: 10 }, ctx()).length).toBeGreaterThan(0);
    expect(sugerir({ tipo: 'SEM_OBJETIVO', horizonteAnos: 10 }, ctx()).length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/sugestao.test.ts`
Expected: FAIL — o `default` do `sugerir` lança para `'SEM_OBJETIVO'`

**Step 3: Write minimal implementation**

```ts
function sugerirSemObjetivo(o: Extract<Objetivo, { tipo: 'SEM_OBJETIVO' }>, ctx: ContextoSugestao): Fatia[] {
  let base: Fatia[];
  if (o.horizonteAnos <= 1) {
    base = [{ produto: 'CDB', indexacaoTipo: 'POS_CDI', percentual: 1, motivo: 'SEM_OBJETIVO_POS', garantia: 'FGC', valor: null }];
  } else if (o.horizonteAnos <= 5) {
    base = [
      { produto: 'CDB', indexacaoTipo: 'POS_CDI', percentual: 0.5, motivo: 'SEM_OBJETIVO_POS', garantia: 'FGC', valor: null },
      { produto: 'CDB', indexacaoTipo: 'PRE', percentual: 0.5, motivo: 'SEM_OBJETIVO_PRE', garantia: 'FGC', valor: null },
    ];
  } else {
    const faixa = faixaLongoPrazo(o.horizonteAnos);
    base = [
      { produto: 'TESOURO_IPCA', indexacaoTipo: 'IPCA_MAIS', percentual: faixa.ipca, motivo: 'SEM_OBJETIVO_IPCA', garantia: 'TESOURO_NACIONAL', valor: null },
      { produto: 'CDB', indexacaoTipo: 'POS_CDI', percentual: faixa.pos, motivo: 'SEM_OBJETIVO_POS', garantia: 'FGC', valor: null },
    ];
  }
  return casarComCatalogo(base, ctx.catalogo, ctx.carteira, ctx.hoje);
}
```

Troque o `switch` do `sugerir` para o final, sem `default`:

```ts
export function sugerir(objetivo: Objetivo, ctx: ContextoSugestao): Fatia[] {
  switch (objetivo.tipo) {
    case 'RESERVA': return sugerirReserva(objetivo, ctx);
    case 'COM_DATA': return sugerirComData(objetivo, ctx);
    case 'LONGO_PRAZO': return sugerirLongoPrazo(objetivo, ctx);
    case 'SEM_OBJETIVO': return sugerirSemObjetivo(objetivo, ctx);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/sugestao.test.ts`
Expected: PASS (25 testes)

**Step 5: Commit**

```bash
git add src/engine/sugestao.ts tests/engine/sugestao.test.ts
git commit -m "feat(engine): sugestão para sem objetivo definido; fecha o dispatcher sugerir"
```

**Revisão do Lote A:** peça uma revisão de código focada em corretude (as faixas, o
casamento de vencimento, o FGC combinado, `Number.isInteger`/`Number.isFinite` nas
validações) antes de seguir para o Lote B — mesmo padrão das revisões dos marcos
anteriores.

---

## Lote B — Armazenamento

### Tarefa B1: Persistência dos objetivos (`src/armazenamento/objetivos.ts`)

Siga exatamente o padrão de `src/armazenamento/ofertas.ts` (já lido): `Armazenamento`
de `../dados/cache`, zod estrito, try/catch em toda leitura/escrita, itens inválidos
descartados um a um.

**Arquivos:**
- Create: `src/armazenamento/objetivos.ts`
- Test: `tests/armazenamento/objetivos.test.ts`

**Step 1: Write the failing test**

```ts
// tests/armazenamento/objetivos.test.ts
import { describe, expect, it } from 'vitest';
import type { Armazenamento } from '../../src/dados/cache';
import { CHAVE_OBJETIVOS, LIMITE_OBJETIVOS, lerObjetivos, novoIdObjetivo, salvarObjetivos } from '../../src/armazenamento/objetivos';

const memoria = (): Armazenamento & { dados: Map<string, string> } => {
  const dados = new Map<string, string>();
  return { dados, getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => void dados.set(k, v) };
};

const objetivo = (over: Record<string, unknown> = {}) => ({
  id: novoIdObjetivo(), criadoEm: '2026-09-29',
  entradas: { tipo: 'RESERVA', gastoMensal: 2000, rendaEstavel: true }, ...over,
});

describe('objetivos', () => {
  it('ida e volta', () => {
    const arm = memoria();
    const o = objetivo({ nome: 'Minha reserva' });
    salvarObjetivos(arm, [o]);
    expect(lerObjetivos(arm)).toEqual([o]);
  });
  it('storage vazio ou corrompido → lista vazia', () => {
    const arm = memoria();
    expect(lerObjetivos(arm)).toEqual([]);
    arm.setItem(CHAVE_OBJETIVOS, '{não-json');
    expect(lerObjetivos(arm)).toEqual([]);
  });
  it('campo extra é rejeitado (esquema estrito)', () => {
    const arm = memoria();
    arm.setItem(CHAVE_OBJETIVOS, JSON.stringify([{ ...objetivo(), extra: true }]));
    expect(lerObjetivos(arm)).toEqual([]);
  });
  it('entradas de cada tipo passam no esquema', () => {
    const arm = memoria();
    const lista = [
      objetivo({ entradas: { tipo: 'RESERVA', gastoMensal: 1000, rendaEstavel: false } }),
      objetivo({ entradas: { tipo: 'COM_DATA', valorAlvo: 5000, data: '2030-01-01' } }),
      objetivo({ entradas: { tipo: 'LONGO_PRAZO', horizonteAnos: 20 } }),
      objetivo({ entradas: { tipo: 'SEM_OBJETIVO', horizonteAnos: 3 } }),
    ];
    salvarObjetivos(arm, lista);
    expect(lerObjetivos(arm)).toHaveLength(4);
  });
  it('respeita o limite de 20 na leitura', () => {
    const arm = memoria();
    arm.setItem(CHAVE_OBJETIVOS, JSON.stringify(Array.from({ length: 25 }, () => objetivo())));
    expect(lerObjetivos(arm)).toHaveLength(LIMITE_OBJETIVOS);
  });
  it('storage que lança não derruba o app', () => {
    const quebrado: Armazenamento = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('cheio'); } };
    expect(lerObjetivos(quebrado)).toEqual([]);
    expect(() => salvarObjetivos(quebrado, [objetivo()])).not.toThrow();
    expect(salvarObjetivos(quebrado, [objetivo()])).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/armazenamento/objetivos.test.ts`
Expected: FAIL — `Cannot find module '../../src/armazenamento/objetivos'`

**Step 3: Write minimal implementation**

```ts
// src/armazenamento/objetivos.ts
// Objetivos salvos no localStorage (spec §9.1, design M4a). Só as ENTRADAS são guardadas: a
// sugestão em si é recalculada a cada visualização, contra o catálogo e a carteira atuais.
import { z } from '../zod';
import type { Armazenamento } from '../dados/cache';
import { ehDataValida } from '../engine/datas';
import { DataIso } from './ofertas'; // reexportado por ofertas.ts; reaproveita a mesma validação de data

export const CHAVE_OBJETIVOS = 'rende:objetivos:v1';
export const LIMITE_OBJETIVOS = 20;
const LIMITE_TEXTO = 80;

const EsquemaEntradas = z.discriminatedUnion('tipo', [
  z.strictObject({ tipo: z.literal('RESERVA'), gastoMensal: z.number().positive(), rendaEstavel: z.boolean() }),
  z.strictObject({ tipo: z.literal('COM_DATA'), valorAlvo: z.number().positive(), data: DataIso }),
  z.strictObject({ tipo: z.literal('LONGO_PRAZO'), horizonteAnos: z.number().int().positive() }),
  z.strictObject({ tipo: z.literal('SEM_OBJETIVO'), horizonteAnos: z.number().int().positive() }),
]);

const EsquemaObjetivo = z.strictObject({
  id: z.string().min(1).max(LIMITE_TEXTO),
  nome: z.string().max(LIMITE_TEXTO).optional(),
  criadoEm: DataIso,
  entradas: EsquemaEntradas,
});

export type ObjetivoSalvo = z.infer<typeof EsquemaObjetivo>;

export function novoIdObjetivo(): string {
  return `obj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Objetivos salvos; os inválidos são descartados um a um. Storage indisponível ou corrompido → lista vazia. */
export function lerObjetivos(arm: Armazenamento): ObjetivoSalvo[] {
  try {
    const bruto = arm.getItem(CHAVE_OBJETIVOS);
    if (bruto === null) return [];
    const lista: unknown = JSON.parse(bruto);
    if (!Array.isArray(lista)) return [];
    return lista.slice(0, LIMITE_OBJETIVOS).flatMap((item) => {
      const r = EsquemaObjetivo.safeParse(item);
      return r.success ? [r.data] : [];
    });
  } catch {
    return [];
  }
}

/** true se gravou; false se o storage recusou (cheio ou bloqueado). */
export function salvarObjetivos(arm: Armazenamento, objetivos: readonly ObjetivoSalvo[]): boolean {
  try {
    arm.setItem(CHAVE_OBJETIVOS, JSON.stringify(objetivos));
    return true;
  } catch {
    return false;
  }
}
```

Se `DataIso` não estiver exportado de `src/armazenamento/ofertas.ts` (confira com
`grep -n "export const DataIso" src/armazenamento/ofertas.ts` antes de escrever este
arquivo), defina a validação localmente:
`const DataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(ehDataValida);` — nesse
caso o import de `ehDataValida` já está no topo e o de `DataIso` de `./ofertas` sai.

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/armazenamento/objetivos.test.ts`
Expected: PASS (6 testes)

**Step 5: Commit**

```bash
git add src/armazenamento/objetivos.ts tests/armazenamento/objetivos.test.ts
git commit -m "feat(armazenamento): objetivos salvos no localStorage"
```

---

### Tarefa B2: Guarda — objetivos nunca no link compartilhável

Siga exatamente o padrão de `tests/seguranca/linkSemPosicoes.test.ts` (leia-o antes de
escrever este teste).

**Arquivos:**
- Test: `tests/seguranca/linkSemObjetivos.test.ts`

**Step 1: Write the failing test**

```ts
// tests/seguranca/linkSemObjetivos.test.ts
// Espelha tests/seguranca/linkSemPosicoes.test.ts: objetivos são dados pessoais (gasto mensal,
// metas) e nunca podem vazar para quem abre um link compartilhado.
import { describe, expect, it } from 'vitest';
import { codificar, decodificar, type EstadoCompartilhado } from '../../src/armazenamento/link';

const ESTADO_BASE: EstadoCompartilhado = {
  versao: 1,
  ofertas: [{ produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, emissor: 'Banco X', conglomerado: 'Banco X', liquidez: 'DIARIA' }],
  valor: 10000, dataAplicacao: '2026-09-28',
  regra: { tipo: 'PADRAO' },
  cenario: { escolha: 'BASE', premissas: undefined as never, manual: undefined as never }, // preencha conforme o tipo real de Premissas/ValoresManuais do projeto
};

describe('link nunca leva objetivos', () => {
  it('o tipo EstadoCompartilhado não tem campo objetivos', () => {
    // Prova de tipo: se alguém adicionar `objetivos` a EstadoCompartilhado sem querer, isto não
    // pega sozinho (TS não impede campo a mais em objeto literal sem "as"), então o teste abaixo
    // é a prova de execução.
    expect(Object.keys(ESTADO_BASE)).not.toContain('objetivos');
  });

  it('um estado com objetivos "encostado" por engano nunca aparece no link nem no decodificado', async () => {
    const comObjetivosDemais = { ...ESTADO_BASE, objetivos: [{ id: 'x', entradas: { tipo: 'RESERVA', gastoMensal: 9999 } }] } as unknown as EstadoCompartilhado;
    const fragmento = await codificar(comObjetivosDemais);
    expect(fragmento).not.toMatch(/objetiv/i);
    expect(fragmento).not.toMatch(/9999/);
    const resultado = await decodificar(fragmento);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect('objetivos' in resultado.estado).toBe(false);
  });
});
```

Ajuste `ESTADO_BASE` (os campos `cenario.premissas` e `cenario.manual`) conforme os tipos
reais de `Premissas` e `ValoresManuais` do projeto — copie o `ESTADO_BASE` de
`tests/armazenamento/link.test.ts`, que já tem um exemplo válido completo, em vez de
escrever um do zero.

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/seguranca/linkSemObjetivos.test.ts`
Expected: dependendo de como `codificar` trata campos extras, pode passar de cara (o
esquema já é estrito) — nesse caso, **não há fase vermelha de verdade**, e isso é
esperado e aceitável aqui: o teste existe para travar uma regressão futura, não para
guiar uma implementação nova (não há nada a implementar nesta tarefa). Rode mesmo assim
para confirmar que passa.

**Step 3: (nada a implementar)**

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/seguranca/linkSemObjetivos.test.ts`
Expected: PASS (2 testes)

**Step 5: Commit**

```bash
git add tests/seguranca/linkSemObjetivos.test.ts
git commit -m "test(seguranca): garante que objetivos nunca entram no link compartilhável"
```

---

## Lote C — Conteúdo e interface

### Tarefa C1: Textos e link para a lição (`src/conteudo/sugestao.ts`)

Mesmo padrão de `src/conteudo/alertas.ts` (`LICAO_DO_ALERTA`, `textoDoAlerta`): um mapa
`MotivoFatia → { texto, licao }`, mais uma função para descrever o produto genérico e o
aviso fixo.

**Arquivos:**
- Create: `src/conteudo/sugestao.ts`
- Test: `tests/conteudo/sugestao.test.ts`

**Step 1: Write the failing test**

```ts
// tests/conteudo/sugestao.test.ts
import { describe, expect, it } from 'vitest';
import type { Fatia, MotivoFatia } from '../../src/engine/sugestao';
import { AVISO_EDUCATIVO, descreverFatia, licaoDaFatia, textoDaFatia, textoDoFgc } from '../../src/conteudo/sugestao';

const TODOS_OS_MOTIVOS: MotivoFatia[] = [
  'RESERVA_TESOURO_SELIC', 'RESERVA_CDB_LIQUIDEZ', 'DATA_VENCIMENTO_CASADO', 'DATA_SEM_CASAMENTO',
  'LONGO_PRAZO_IPCA', 'LONGO_PRAZO_POS', 'SEM_OBJETIVO_POS', 'SEM_OBJETIVO_PRE', 'SEM_OBJETIVO_IPCA',
];

const fatia = (over: Partial<Fatia>): Fatia => ({
  produto: 'CDB', indexacaoTipo: 'POS_CDI', percentual: 0.5, motivo: 'SEM_OBJETIVO_POS', garantia: 'FGC', valor: 5000, ...over,
});

describe('sugestão — conteúdo', () => {
  it('todo motivo tem texto e lição', () => {
    for (const motivo of TODOS_OS_MOTIVOS) {
      expect(textoDaFatia(fatia({ motivo })).length).toBeGreaterThan(10);
      expect(licaoDaFatia(fatia({ motivo }))).toBeTruthy();
    }
  });
  it('DATA_VENCIMENTO_CASADO liga à lição de marcação a mercado (o motivo de casar o vencimento)', () => {
    expect(licaoDaFatia(fatia({ motivo: 'DATA_VENCIMENTO_CASADO' }))).toBe('marcacao-mercado');
  });
  it('RESERVA_* liga à lição de reserva; LONGO_PRAZO_*/SEM_OBJETIVO_IPCA à de indexadores ou diversificação', () => {
    expect(licaoDaFatia(fatia({ motivo: 'RESERVA_TESOURO_SELIC' }))).toBe('reserva');
    expect(licaoDaFatia(fatia({ motivo: 'RESERVA_CDB_LIQUIDEZ' }))).toBe('reserva');
  });
  it('descreverFatia nomeia o produto genérico, sem inventar taxa', () => {
    expect(descreverFatia(fatia({ produto: 'CDB', indexacaoTipo: 'POS_CDI' }))).toBe('CDB pós-fixado (CDI)');
    expect(descreverFatia(fatia({ produto: 'TESOURO_SELIC', indexacaoTipo: 'SELIC' }))).toBe('Tesouro Selic');
    expect(descreverFatia(fatia({ produto: 'TESOURO_IPCA', indexacaoTipo: 'IPCA_MAIS' }))).toBe('Tesouro IPCA+');
    expect(descreverFatia(fatia({ produto: 'CDB', indexacaoTipo: 'PRE' }))).toBe('CDB prefixado');
  });
  it('textoDoFgc explica o excedente quando presente', () => {
    const f = fatia({ fgc: { conglomerado: 'Banco X', excedente: 12345.6 } });
    expect(textoDoFgc(f)).toMatch(/Banco X/);
    expect(textoDoFgc(f)).toMatch(/R\$\s?12\.345,60/);
  });
  it('sem fgc, textoDoFgc devolve null', () => {
    expect(textoDoFgc(fatia({ fgc: undefined }))).toBeNull();
  });
  it('aviso educativo fixo', () => {
    expect(AVISO_EDUCATIVO.length).toBeGreaterThan(10);
    expect(AVISO_EDUCATIVO).toMatch(/educativo/i);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/conteudo/sugestao.test.ts`
Expected: FAIL — `Cannot find module '../../src/conteudo/sugestao'`

**Step 3: Write minimal implementation**

Os **textos abaixo são rascunho**: passam pela revisão editorial (portão humano, Tarefa
D1) antes do PR final, no mesmo fluxo usado em todos os marcos anteriores.

```ts
// src/conteudo/sugestao.ts
// Textos da sugestão por objetivo (spec §9.1). O engine (src/engine/sugestao.ts) nunca produz
// texto: aqui, cada MotivoFatia vira uma frase e uma lição, no mesmo padrão de conteudo/alertas.ts.
import type { IdLicao } from './licoes/tipos';
import type { Fatia, MotivoFatia } from '../engine/sugestao';
import type { TipoIndexacao, TipoProduto } from '../engine/produtos';
import { formatarMoeda } from '../formato';

export const AVISO_EDUCATIVO = 'Conteúdo educativo, feito a partir de regras gerais: não é uma recomendação de investimento personalizada.';

const TEXTO_E_LICAO: Record<MotivoFatia, { texto: string; licao: IdLicao }> = {
  RESERVA_TESOURO_SELIC: { texto: 'Garantia do Tesouro Nacional e liquidez diária, sem risco de preço se vendido antes do vencimento.', licao: 'reserva' },
  RESERVA_CDB_LIQUIDEZ: { texto: 'Garantia do FGC, com liquidez diária. Divide o dinheiro entre dois tipos de garantia diferentes.', licao: 'reserva' },
  DATA_VENCIMENTO_CASADO: { texto: 'O vencimento bate com a sua data: não é preciso vender antes, então o preço de mercado no meio do caminho não importa.', licao: 'marcacao-mercado' },
  DATA_SEM_CASAMENTO: { texto: 'Nenhuma oferta do catálogo vence perto da sua data. Um pós-fixado com liquidez diária atravessa a data sem risco de preço.', licao: 'liquidez' },
  LONGO_PRAZO_IPCA: { texto: 'Protege o dinheiro da inflação ao longo dos anos.', licao: 'indexadores' },
  LONGO_PRAZO_POS: { texto: 'Mantém uma parte com liquidez, acompanhando os juros.', licao: 'diversificacao' },
  SEM_OBJETIVO_POS: { texto: 'Acompanha os juros e tem liquidez para prazos mais curtos.', licao: 'indexadores' },
  SEM_OBJETIVO_PRE: { texto: 'Taxa combinada hoje, para um horizonte de alguns anos.', licao: 'indexadores' },
  SEM_OBJETIVO_IPCA: { texto: 'Para a parte do horizonte mais distante, protege contra a inflação.', licao: 'indexadores' },
};

export function textoDaFatia(f: Fatia): string {
  return TEXTO_E_LICAO[f.motivo].texto;
}

export function licaoDaFatia(f: Fatia): IdLicao {
  return TEXTO_E_LICAO[f.motivo].licao;
}

const NOME_PRODUTO: Record<TipoProduto, string> = {
  CDB: 'CDB', RDB: 'RDB', LC: 'LC', LCI: 'LCI', LCA: 'LCA',
  TESOURO_SELIC: 'Tesouro Selic', TESOURO_PREFIXADO: 'Tesouro Prefixado', TESOURO_IPCA: 'Tesouro IPCA+', POUPANCA: 'Poupança',
};

const SUFIXO_INDEXADOR: Partial<Record<TipoIndexacao, string>> = {
  POS_CDI: ' pós-fixado (CDI)', PRE: ' prefixado', IPCA_MAIS: ' IPCA+',
};

/** Nome genérico do produto, sem taxa (a sugestão nunca inventa um número de mercado). */
export function descreverFatia(f: Fatia): string {
  if (f.produto === 'TESOURO_SELIC' || f.produto === 'TESOURO_PREFIXADO' || f.produto === 'TESOURO_IPCA' || f.produto === 'POUPANCA') {
    return NOME_PRODUTO[f.produto];
  }
  return `${NOME_PRODUTO[f.produto]}${SUFIXO_INDEXADOR[f.indexacaoTipo] ?? ''}`;
}

/** A frase do aviso de FGC combinado, ou null quando a fatia não tem `fgc`. */
export function textoDoFgc(f: Fatia): string | null {
  if (!f.fgc) return null;
  return `Somado ao que você já tem em ${f.fgc.conglomerado}, isso passa do limite do FGC em ${formatarMoeda(f.fgc.excedente)}. Considere outro emissor.`;
}
```

Se `descreverFatia` de `TESOURO_SELIC`/`TESOURO_PREFIXADO`/`TESOURO_IPCA` não bater com
o teste esperado (`'Tesouro Selic'`, `'Tesouro IPCA+'`), ajuste `NOME_PRODUTO` — o teste
é a fonte da verdade.

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/conteudo/sugestao.test.ts`
Expected: PASS (7 testes)

**Step 5: Commit**

```bash
git add src/conteudo/sugestao.ts tests/conteudo/sugestao.test.ts
git commit -m "feat(conteudo): textos e lição de cada motivo de fatia (rascunho)"
```

---

### Tarefa C2: Gráfico de pizza sob demanda (`src/ui/graficos/`)

Siga o padrão de `useGrafico.ts`/`chart.ts` (Chart.js sob demanda, chunk à parte), mas
com um hook e um módulo próprios para o gráfico de pizza (registra `ArcElement` e um
controller de pizza, que hoje não estão registrados em `chart.ts`).

**Arquivos:**
- Create: `src/ui/graficos/chartPizza.ts`, `src/ui/graficos/useGraficoPizza.ts`,
  `src/ui/graficos/GraficoObjetivo.tsx`
- Test: `tests/ui/graficos/GraficoObjetivo.test.tsx`

**Contrato:**

```ts
// src/ui/graficos/chartPizza.ts
import { ArcElement, Chart, DoughnutController, Tooltip } from 'chart.js';
Chart.register(ArcElement, DoughnutController, Tooltip);
export { Chart };
```

```ts
// src/ui/graficos/useGraficoPizza.ts
// Mesmo padrão de useGrafico.ts (import() sob demanda, cache em módulo, estado carregando/
// pronto/erro, tentarDeNovo), mas para o chunk de pizza. NÃO reaproveite useGrafico diretamente
// porque ele é tipado para ConfigLinha; duplicar o hook pequeno é mais simples que generalizar
// os dois para um tipo genérico agora (YAGNI).
export function useGraficoPizza(
  canvas: RefObject<HTMLCanvasElement>, montar: (paleta: PaletaGrafico) => ConfigPizza, deps: readonly unknown[],
): { estado: EstadoGrafico; tentarDeNovo: () => void };
```

```tsx
// src/ui/graficos/GraficoObjetivo.tsx
export function GraficoObjetivo({ fatias }: { fatias: readonly Fatia[] }) {
  // <figure><figcaption>…</figcaption><canvas role="img" aria-labelledby={idResumo} />
  //   {estado === 'carregando' && <p>Carregando gráfico…</p>}
  //   {estado === 'erro' && <p>Não deu para carregar o gráfico. <button onClick={tentarDeNovo}>Tentar de novo</button></p>}
  //   <ul class="grafico__legenda"> (uma por fatia: cor + descreverFatia + percentual)
  //   <p id={idResumo} class="grafico__resumo"> resumo textual (ex.: "50% Tesouro Selic, 50% CDB pós-fixado")
  // </figure>
}
```

Uma fatia é desenhada por cor de `src/ui/graficos/cores.ts` (reaproveite `lerPaleta`);
o `label` de cada segmento usa `descreverFatia` de `conteudo/sugestao.ts`.

**Testes (`vi.mock` do módulo `chartPizza`, no padrão de
`tests/ui/graficos/GraficoValorLiquido.test.tsx`):**
- a config passada ao `Chart` tem um dataset com `data` = os percentuais e `labels` =
  `fatias.map(descreverFatia)`;
- `estado: 'carregando'` mostra o texto e não monta o canvas com dados;
- falha no import mostra "Tentar de novo", e o clique refaz a tentativa;
- `destroy()` é chamado ao desmontar e ao trocar `fatias`;
- o resumo textual e o `aria-labelledby` batem.

**Passos:** TDD igual às tarefas anteriores — teste falha (mock não resolve/módulo não
existe), implementa, teste passa, `npm run typecheck && npm run lint`, commit
`feat(ui): gráfico de pizza sob demanda para a sugestão por objetivo`.

---

### Tarefa C3: Formulários por tipo de objetivo (`src/ui/objetivos/FormObjetivo.tsx`)

**Contrato:**

```ts
export interface PropsFormObjetivo {
  tipo: Objetivo['tipo'];
  onSalvar: (nome: string | undefined, entradas: Objetivo) => void;
  onCancelar: () => void;
  inicial?: ObjetivoSalvo; // edição
}
```

- Um campo por entrada do tipo (gasto mensal + rádio "estável/variável" para RESERVA;
  valor-alvo + data para COM_DATA; horizonte em anos para LONGO_PRAZO/SEM_OBJETIVO), com
  `CampoNumerico` para números e `input type="date"` com `min`/`max` como em
  `FormOfertaCadastrada.tsx`.
- Nome opcional do objetivo (texto livre, até 80 caracteres).
- Validação humana usando `validarObjetivo` do engine antes de chamar `onSalvar`; mensagem
  de erro em `role="alert"`, mesmo padrão dos demais formulários.
- Ids com o prefixo `objetivo-form-`.

**Testes:** um por tipo (preenche, salva, entradas corretas), validação (data no
passado, gasto ≤ 0, horizonte não inteiro), edição (`inicial` preenche o formulário),
cancelar não chama `onSalvar`.

Commit: `feat(ui): formulário por tipo de objetivo, com validação`.

---

### Tarefa C4: Tela de sugestão e lista de objetivos (`src/ui/objetivos/`)

**Arquivos:**
- `src/ui/objetivos/Objetivos.tsx` (lista de cartões + "+ Novo objetivo" + o formulário)
- `src/ui/objetivos/Sugestao.tsx` (gráfico + lista de fatias de um objetivo)

**Contrato de `Sugestao.tsx`:**

```ts
export interface PropsSugestao {
  objetivo: ObjetivoSalvo;
  catalogo: readonly OfertaCadastrada[];
  carteira: readonly ItemFGC[];
  hoje: DataISO;
  onIrParaComparar: (oferta: OfertaCadastrada) => void; // "Comparar esta oferta" quando há ofertaCatalogo
}
```

- Chama `sugerir(objetivo.entradas, { catalogo, carteira, hoje })`, monta `<GraficoObjetivo
  fatias={fatias} />`, e abaixo uma lista (`<ul>`) com uma fatia por item:
  `descreverFatia`, `formatarPercentual(f.percentual)`, `formatarMoeda(f.valor)` quando
  não for `null`, `textoDaFatia`, um `LinkLicao` (reaproveitado de `src/ui/aprender/
  LinkLicao.tsx`) para `licaoDaFatia(f)`, `textoDoFgc(f)` quando não for `null`, e "Já
  disponível: {nomeOferta}" com um botão "Comparar" quando houver `ofertaCatalogo`
  (reaproveitando `nomeOferta`/`descreverOferta` de `conteudo/comparacao.ts` e
  `conteudo/motivos.ts`).
- O aviso `AVISO_EDUCATIVO` aparece uma vez, no topo da tela de sugestão.

**Contrato de `Objetivos.tsx`:**
- Lista de cartões: `nome ?? "Objetivo sem nome"`, o tipo por extenso, um resumo de uma
  linha (valor-alvo ou horizonte), botões "Ver sugestão", "Editar", "Remover" (com
  confirmação inline, no padrão de `ListaPosicoes.tsx`/`ListaOfertas.tsx` — nunca
  `window.confirm`).
- "+ Novo objetivo" abre um seletor de tipo (4 botões) e depois o `FormObjetivo`.
- Ao salvar, persiste com `salvarObjetivos` (`src/armazenamento/objetivos.ts`) e volta
  para a lista, com foco no cartão novo (padrão de `ListaOfertas.tsx` ao adicionar).
- Ao remover o último objetivo, foco no título "Objetivos"; ao remover um do meio, foco
  no próximo cartão (mesmo padrão de `ListaPosicoes.tsx`).

**Testes de UI (mirando os já existentes de `MinhasOfertas.tsx`/`Carteira.tsx` como
referência de estrutura de teste):**
- criar um objetivo de cada tipo e ver a sugestão calculada corretamente (fatias, %,
  gráfico chamado com os dados certos);
- "já disponível" aparece quando o catálogo tem uma oferta compatível;
- aviso de FGC aparece quando a carteira empurra a soma acima do limite;
- editar e remover, com foco;
- o limite de 20 objetivos desabilita "+ Novo objetivo" com uma mensagem, no padrão do
  limite de 30 do catálogo;
- validação de entrada em cada tipo.

Commits: um por arquivo/funcionalidade coesa, seguindo o mesmo ritmo de commits pequenos
das tarefas anteriores (ex.: `feat(ui): tela de sugestão de um objetivo`,
`feat(ui): lista de objetivos, criar/editar/remover`).

---

### Tarefa C5: Aba "Objetivos" no App

**Arquivos:** modificar `src/ui/App.tsx`, `src/ui/estilos.css`.

- `ABAS` ganha `'objetivos'`, entre `'carteira'` e `ABA_APRENDER` (o array hoje é
  `['comparar', 'catalogo', 'carteira', ABA_APRENDER]`).
- A aba monta `<Objetivos catalogo={ofertas} carteira={carteiraFGC} hoje={hoje()} …/>`,
  reaproveitando exatamente as mesmas variáveis (`ofertas`, `carteiraFGC`, ou o nome
  equivalente) que a aba Carteira já usa hoje para o catálogo e a exposição ao FGC — leia
  `src/ui/App.tsx` por inteiro antes desta tarefa para achar os nomes exatos das
  variáveis de estado já montadas (o arquivo já lido nesta sessão mostra
  `itemFGCDaPosicao` e `lerOfertas`/`salvarOfertas` — a "carteira" em formato `ItemFGC[]`
  provavelmente já existe como uma variável derivada para a Carteira e para o
  `contextoFGC` dos alertas da comparação; reaproveite-a, não recalcule).
- Persistência de objetivos segue o mesmo padrão de `lerOfertas`/`salvarOfertas`: lida
  uma vez no mount (`useState(() => lerObjetivos(armazenamentoLocal()))`), salva a cada
  mudança.
- Nenhum objetivo entra no `EstadoCompartilhado` do link (Tarefa B2 já garante isso por
  teste; aqui é só não ligar os dois).

**Testes:** `tests/ui/App.test.tsx` ganha casos: a aba "Objetivos" aparece e navega por
hash (`#objetivos`); criar um objetivo persiste entre remontagens do `App` (mesmo padrão
usado para ofertas/posições); nenhum id duplicado com as 5 abas montadas ao mesmo tempo.

Commit: `feat(ui): aba Objetivos no App`.

---

## Lote D — Portão humano, verificação e PR

### Tarefa D1: Revisão editorial dos textos

Os textos de `src/conteudo/sugestao.ts` (Tarefa C1) e os rótulos novos de UI (Tarefas C3
e C4) são rascunho. Antes do PR:
1. Mostrar os textos ao usuário, junto com o resumo do antes/depois do /vozmax.
2. Esperar a aprovação.
3. Aplicar e ajustar os testes que dependem de trechos literais.

### Tarefa D2: Verificação final

1. `npm run lint && npm run typecheck && npm test && npm run build` — todos verdes.
2. No navegador (dev, depois com `node scripts/servir-dist.mjs` contra a CSP de
   produção):
   - criar um objetivo de cada tipo e conferir a sugestão, o gráfico, o "já disponível"
     e o aviso de FGC;
   - 375 px sem rolagem horizontal;
   - console sem erros, sem violação de CSP.
3. Medir o bundle inicial em gzip antes/depois (o chunk de pizza deve ficar separado,
   como o de linha).

### Tarefa D3: Revisão de código

Revisão focada em: corretude do engine (faixas, casamento, FGC), regressões nas abas
existentes, acessibilidade da nova tela, e se o chunk do gráfico de pizza realmente não
entra no bundle inicial.

### Tarefa D4: PR

Com o ok do usuário: push da branch `m4a`, `gh pr create` contra `main`, e **ligar o
auto-fix** (`mcp__ccd_pr__set_monitor` com `auto_fix: true`) — padrão obrigatório deste
projeto para todo PR, conforme instrução do usuário.

---

## Fora do M4a

Renda variável (M4b): proxy da brapi na Cloudflare (Pages Function), Turnstile, Workers
KV, cache em camadas, orçamento de cota, página `/status`. Ver spec principal, seção 8 e
9.2.

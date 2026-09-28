# M4b1: Conteúdo educativo de renda variável — Implementation Plan

> **Para o Claude:** use `subagent-driven-development`. **TDD estrito.** Ao abrir o PR, ligue o auto-fix.

**Goal:** versionar no engine as regras tributárias de FII e de venda de ações,
enriquecer a lição 10 com esses fatos, e corrigir a lacuna do M4a (nota de renda
variável nos objetivos de longo prazo acima de 5 anos).

**Architecture:** mesmo padrão de todo o resto do app — regra versionada no engine
(`resolverRegra`/`VersaoRegra`), lida pela camada de conteúdo (`licoes/regras.ts` →
`fontes.ts` → o texto da lição), nunca um número digitado direto no texto. A nota de
renda variável é uma função pura em `conteudo/sugestao.ts`, sem entrar no modelo
`Fatia`/`MotivoFatia` do engine (é "uma nota fixa", não uma fatia).

**Tech Stack:** o mesmo do resto do app. Nenhuma dependência nova.

**Referências:**
- Design: `docs/superpowers/specs/2026-09-29-m4b1-conteudo-renda-variavel-design.md`
- Spec principal: `docs/superpowers/specs/2026-09-27-onde-investir-design.md`, §9.2
- Padrão a seguir de perto: `src/engine/regras/fgc.ts`, `src/conteudo/licoes/regras.ts`,
  `src/conteudo/licoes/fontes.ts`, `src/conteudo/licoes/rendaVariavel.ts`,
  `tests/conteudo/textoOficial.ts`, `src/ui/objetivos/Sugestao.tsx`.

---

## Lote A — Engine

### Tarefa A0: Branch

A branch `m4b1` já existe (criada a partir da `main`, com o commit do design). Confirme:

```bash
git branch --show-current
```

Esperado: `m4b1`. Se não estiver nela, `git switch m4b1`.

### Tarefa A1: Regras versionadas de renda variável

**Arquivos:**
- Create: `src/engine/regras/rendaVariavel.ts`
- Test: `tests/engine/regras/rendaVariavel.test.ts`

**Step 1: Write the failing test**

```ts
// tests/engine/regras/rendaVariavel.test.ts
import { describe, expect, it } from 'vitest';
import { RegraNaoEncontradaError } from '../../../src/engine/erros';
import { regraFII, regraVendaAcoes } from '../../../src/engine/regras/rendaVariavel';

describe('regraFII', () => {
  it('vigente desde 2023-12-13: 100 cotistas, participação até 10%, venda sempre a 20%', () => {
    expect(regraFII('2026-09-29')).toEqual({ minimoCotistas: 100, participacaoMaximaFracao: 0.1, aliquotaVendaCotas: 0.2 });
    expect(regraFII('2023-12-13')).toEqual({ minimoCotistas: 100, participacaoMaximaFracao: 0.1, aliquotaVendaCotas: 0.2 });
  });
  it('antes da vigência, lança RegraNaoEncontradaError', () => {
    expect(() => regraFII('2023-12-12')).toThrow(RegraNaoEncontradaError);
  });
});

describe('regraVendaAcoes', () => {
  it('vigente desde 2004-12-21: R$ 20 mil por mês', () => {
    expect(regraVendaAcoes('2026-09-29')).toEqual({ limiteMensalIsento: 20_000 });
  });
  it('antes da vigência, lança RegraNaoEncontradaError', () => {
    expect(() => regraVendaAcoes('2004-12-20')).toThrow(RegraNaoEncontradaError);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/regras/rendaVariavel.test.ts`
Expected: FAIL — `Cannot find module '../../../src/engine/regras/rendaVariavel'`

**Step 3: Write minimal implementation**

```ts
// src/engine/regras/rendaVariavel.ts
// Regras tributárias de renda variável para pessoa física (spec §9.2, design M4b1). Só as
// regras que a lição 10 cita hoje; o cálculo (M4b2) pode precisar de mais regras depois.
import type { DataISO } from '../datas';
import { resolverRegra, type VersaoRegra } from './tipos';

export interface RegraFII {
  /** Cotistas mínimos do fundo para a isenção dos rendimentos distribuídos. */
  minimoCotistas: number;
  /** Participação máxima do cotista (fração) para manter a isenção dos rendimentos. */
  participacaoMaximaFracao: number;
  /** Alíquota do ganho de capital na venda de cotas: sempre tributado, sem isenção por valor. */
  aliquotaVendaCotas: number;
}

// Lei 14.754/2023 elevou o piso de 50 para 100 cotistas. Fonte secundária (escritório de
// advocacia), sem acesso direto ao Planalto na pesquisa de 2026-09-29 (ECONNRESET). Conferir o
// texto oficial da lei quando o Planalto estiver acessível.
export const VERSOES_FII: readonly VersaoRegra<RegraFII>[] = [
  {
    vigenciaInicio: '2023-12-13',
    fonte: 'https://www.mayerbrown.com/pt/insights/publications/2025/12/enactment-of-law-no-15270-2025-which-establishes-dividend-taxation-expands-the-exemption-threshold-and-introduces-a-minimum-tax-on-high-incomes',
    valor: { minimoCotistas: 100, participacaoMaximaFracao: 0.1, aliquotaVendaCotas: 0.2 },
  },
];

export const FONTE_FII = VERSOES_FII[0]?.fonte ?? '';

/** A regra de isenção dos rendimentos de FII vigente na data, e a alíquota (fixa) da venda de cotas. */
export function regraFII(data: DataISO): RegraFII {
  return resolverRegra('isenção de FII', VERSOES_FII, data);
}

export interface RegraVendaAcoes {
  /** Vendas de ações no mercado à vista, por mês, até este valor: isentas de IR sobre o ganho. */
  limiteMensalIsento: number;
}

// Lei 11.033/2004, art. 3º, I. Fonte oficial: legin da Câmara dos Deputados (publicação original).
export const VERSOES_VENDA_ACOES: readonly VersaoRegra<RegraVendaAcoes>[] = [
  {
    vigenciaInicio: '2004-12-21',
    fonte: 'https://www2.camara.leg.br/legin/fed/lei/2004/lei-11033-21-dezembro-2004-535177-publicacaooriginal-22704-pl.html',
    valor: { limiteMensalIsento: 20_000 },
  },
];

export const FONTE_VENDA_ACOES = VERSOES_VENDA_ACOES[0]?.fonte ?? '';

export function regraVendaAcoes(data: DataISO): RegraVendaAcoes {
  return resolverRegra('isenção de venda de ações', VERSOES_VENDA_ACOES, data);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/regras/rendaVariavel.test.ts`
Expected: PASS (4 testes)

**Step 5: Commit**

```bash
git add src/engine/regras/rendaVariavel.ts tests/engine/regras/rendaVariavel.test.ts
git commit -m "feat(engine): regras de isenção de FII e de venda de ações"
```

---

## Lote B — Conteúdo

### Tarefa B1: Ligar as regras em `licoes/regras.ts` e `licoes/fontes.ts`

**Arquivos:** modificar `src/conteudo/licoes/regras.ts`, `src/conteudo/licoes/fontes.ts`.
**Test:** `tests/conteudo/licoesRegras.test.ts` (novo, pequeno — só confere que os
valores batem com a regra vigente, no mesmo espírito de um teste de integração leve;
o arquivo `regras.ts` não tinha teste próprio antes, então crie um mínimo).

**Step 1: Write the failing test**

```ts
// tests/conteudo/licoesRegras.test.ts
import { describe, expect, it } from 'vitest';
import { REGRAS } from '../../src/conteudo/licoes/regras';

describe('REGRAS.rendaVariavel', () => {
  it('lê os valores da regra vigente, formatados', () => {
    expect(REGRAS.rendaVariavel.minimoCotistasFII).toBe(100);
    expect(REGRAS.rendaVariavel.participacaoMaximaFII).toBe('10%');
    expect(REGRAS.rendaVariavel.aliquotaVendaFII).toBe('20%');
    expect(REGRAS.rendaVariavel.limiteVendaAcoes).toBe('R$ 20 mil');
    expect(REGRAS.rendaVariavel.fonteFII).toMatch(/^https:\/\//);
    expect(REGRAS.rendaVariavel.fonteVendaAcoes).toMatch(/^https:\/\//);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/conteudo/licoesRegras.test.ts`
Expected: FAIL — `REGRAS.rendaVariavel` é `undefined`

**Step 3: Write minimal implementation**

Em `src/conteudo/licoes/regras.ts`, acrescente o import e as duas constantes vigentes,
perto das já existentes:

```ts
import { VERSOES_FII, VERSOES_VENDA_ACOES } from '../../engine/regras/rendaVariavel';
```

```ts
const fii = vigente('FII', VERSOES_FII);
const vendaAcoes = vigente('venda de ações', VERSOES_VENDA_ACOES);
```

E, dentro do objeto `REGRAS`, acrescente a chave nova (depois de `prazoMinimo`):

```ts
  rendaVariavel: {
    fonteFII: fii.fonte,
    minimoCotistasFII: fii.valor.minimoCotistas,
    participacaoMaximaFII: pct(fii.valor.participacaoMaximaFracao),
    aliquotaVendaFII: pct(fii.valor.aliquotaVendaCotas),
    fonteVendaAcoes: vendaAcoes.fonte,
    limiteVendaAcoes: reaisRedondos(vendaAcoes.valor.limiteMensalIsento),
  },
```

Em `src/conteudo/licoes/fontes.ts`, acrescente ao objeto `FONTES` (perto de
`diversificacao`):

```ts
  fonteFII: REGRAS.rendaVariavel.fonteFII,
  fonteVendaAcoes: REGRAS.rendaVariavel.fonteVendaAcoes,
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/conteudo/licoesRegras.test.ts`
Expected: PASS (1 teste)

**Step 5: Commit**

```bash
git add src/conteudo/licoes/regras.ts src/conteudo/licoes/fontes.ts tests/conteudo/licoesRegras.test.ts
git commit -m "feat(conteudo): lê as regras de renda variável na trilha"
```

---

### Tarefa B2: Guarda de números — estender `tests/conteudo/textoOficial.ts`

Sem isso, a Tarefa B3 (que cita "10%", "20%" e "R$ 20 mil" no texto da lição) falha no
teste de integridade existente (`soNumerosDasRegras`), que só reconhece números de
IR/IOF/custódia/poupança/FGC hoje.

**Arquivos:** modificar `tests/conteudo/textoOficial.ts`.

Este arquivo é auxiliar de teste (não tem teste próprio); a prova de que a mudança está
certa é a Tarefa B3 passar. Ainda assim, siga o mesmo espírito de "escrever, rodar,
confirmar" — depois de editar, rode a suíte de conteúdo inteira para garantir que nada
quebrou:

```bash
npx vitest run tests/conteudo
```

Esperado, antes de editar: passa (a mudança ainda não é usada em nenhum texto). Depois
de editar: continua passando (o `Set` só ganhou mais valores possíveis, o que não
invalida nada existente).

**Edite `tests/conteudo/textoOficial.ts`:**

```ts
import { VERSOES_FII, VERSOES_VENDA_ACOES } from '../../src/engine/regras/rendaVariavel';
```

Dentro de `PERCENTUAIS_DAS_REGRAS`, acrescente:

```ts
  ...vigente(VERSOES_FII).map((f) => f.participacaoMaximaFracao * 100),
  ...vigente(VERSOES_FII).map((f) => f.aliquotaVendaCotas * 100),
```

Dentro de `REAIS_DAS_REGRAS`, acrescente:

```ts
  ...vigente(VERSOES_VENDA_ACOES).map((v) => reaisRedondos(v.limiteMensalIsento)),
```

Rode `npx vitest run tests/conteudo` e confirme que passa (nada mudou de comportamento
ainda, só a lista de números permitidos cresceu).

**Commit:**

```bash
git add tests/conteudo/textoOficial.ts
git commit -m "test(conteudo): reconhece os números de FII e venda de ações como oficiais"
```

---

### Tarefa B3: Nova seção na lição 10

**Arquivos:** modificar `src/conteudo/licoes/rendaVariavel.ts`.
**Test:** o teste de integridade já existente, `tests/conteudo/licoes.test.ts` — não
precisa de um arquivo novo, mas rode-o antes e depois.

**Step 1: Confirme o estado atual (não deveria haver falha ainda, isto é só a base)**

Run: `npx vitest run tests/conteudo/licoes.test.ts`
Expected: PASS (a lição 10 de hoje já passa; a mudança desta tarefa não pode quebrar
esse teste — se quebrar, é sinal de erro na seção nova, não uma "fase vermelha"
esperada).

**Step 2: Escreva a seção nova**

Em `src/conteudo/licoes/rendaVariavel.ts`, acrescente o import de `REGRAS` (o arquivo já
importa `FONTES` e `link` de `./fontes`; `REGRAS` vem de `./regras`):

```ts
import { REGRAS } from './regras';
```

Acrescente uma seção nova ao array `secoes`, entre "O prazo importa" e "Neste app":

```ts
    {
      titulo: 'Impostos na renda variável',
      texto: [
        `Dividendos de FII são isentos de IR para pessoa física, com condições: o fundo precisa ter pelo menos ${REGRAS.rendaVariavel.minimoCotistasFII} cotistas, e o cotista não pode ter ${REGRAS.rendaVariavel.participacaoMaximaFII} ou mais das cotas (${link('Lei 14.754/2023', FONTES.fonteFII)}).`,
        `Vender ações no mercado à vista até ${REGRAS.rendaVariavel.limiteVendaAcoes} por mês é isento de IR sobre o ganho. Só vale para ações: FII, ETF e day trade ficam de fora (${link('Lei 11.033/2004', FONTES.fonteVendaAcoes)}).`,
        `Vender cotas de FII é sempre tributado a ${REGRAS.rendaVariavel.aliquotaVendaFII}, sem nenhuma isenção por valor — ao contrário das ações.`,
      ].join('\n\n'),
    },
```

E acrescente as duas fontes novas ao array `fontes` da lição:

```ts
  fontes: [FONTES.rendaFixaXVariavel, FONTES.riscosAcoes, FONTES.regulamentoFGC, FONTES.fonteFII, FONTES.fonteVendaAcoes],
```

Os textos são **rascunho** — a revisão editorial é a Tarefa C1.

**Step 3: Run test to verify it passes**

Run: `npx vitest run tests/conteudo/licoes.test.ts`
Expected: PASS. Se falhar em `soNumerosDasRegras`, confirme que a Tarefa B2 foi feita
antes desta. Se falhar em `semSintaxeCrua` ou no formato dos links, confira a sintaxe do
Markdown restrito (só `**negrito**`, `*itálico*` e `[texto](https://…)`).

**Step 4: Commit**

```bash
git add src/conteudo/licoes/rendaVariavel.ts
git commit -m "feat(conteudo): seção de impostos na lição de renda variável (rascunho)"
```

---

### Tarefa B4: Nota de renda variável nos objetivos de longo prazo

Corrige a lacuna do M4a.

**Arquivos:**
- Modify: `src/conteudo/sugestao.ts`
- Test: `tests/conteudo/sugestao.test.ts`

**Step 1: Write the failing test**

Acrescente a `tests/conteudo/sugestao.test.ts` (o arquivo já existe, do M4a):

```ts
import { notaRendaVariavel } from '../../src/conteudo/sugestao'; // ajuste o import do topo do arquivo

describe('notaRendaVariavel', () => {
  it('aparece para LONGO_PRAZO e SEM_OBJETIVO com horizonte acima de 5 anos', () => {
    expect(notaRendaVariavel({ tipo: 'LONGO_PRAZO', horizonteAnos: 6 })).toMatch(/renda variável/);
    expect(notaRendaVariavel({ tipo: 'SEM_OBJETIVO', horizonteAnos: 10 })).toMatch(/renda variável/);
  });
  it('não aparece com horizonte de até 5 anos, nem para RESERVA/COM_DATA', () => {
    expect(notaRendaVariavel({ tipo: 'LONGO_PRAZO', horizonteAnos: 5 })).toBeNull();
    expect(notaRendaVariavel({ tipo: 'SEM_OBJETIVO', horizonteAnos: 1 })).toBeNull();
    expect(notaRendaVariavel({ tipo: 'RESERVA', gastoMensal: 1000, rendaEstavel: true })).toBeNull();
    expect(notaRendaVariavel({ tipo: 'COM_DATA', valorAlvo: 1000, data: '2030-01-01' })).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/conteudo/sugestao.test.ts`
Expected: FAIL — `notaRendaVariavel is not a function`

**Step 3: Write minimal implementation**

Em `src/conteudo/sugestao.ts`, ajuste o import do topo para incluir `type Objetivo` (o
arquivo já importa `type Fatia, type MotivoFatia` de `'../engine/sugestao'`):

```ts
import type { Fatia, MotivoFatia, Objetivo } from '../engine/sugestao';
```

E acrescente, no fim do arquivo:

```ts
/** Nota fixa (sem cálculo) para a lição de renda variável, em objetivos de longo prazo (spec §9.1/§9.2). */
export function notaRendaVariavel(objetivo: Objetivo): string | null {
  const horizonte = objetivo.tipo === 'LONGO_PRAZO' || objetivo.tipo === 'SEM_OBJETIVO' ? objetivo.horizonteAnos : 0;
  return horizonte > 5 ? 'Para prazos acima de 5 anos, carteiras costumam incluir renda variável.' : null;
}
```

O texto é **rascunho** — revisão editorial na Tarefa C1.

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/conteudo/sugestao.test.ts`
Expected: PASS (todos os testes do arquivo, incluindo os do M4a)

**Step 5: Commit**

```bash
git add src/conteudo/sugestao.ts tests/conteudo/sugestao.test.ts
git commit -m "feat(conteudo): nota de renda variável para objetivos de longo prazo"
```

---

### Tarefa B5: Mostrar a nota na tela de sugestão

**Arquivos:**
- Modify: `src/ui/objetivos/Sugestao.tsx`
- Test: `tests/ui/objetivos/Sugestao.test.tsx`

**Step 1: Write the failing test**

Acrescente a `tests/ui/objetivos/Sugestao.test.tsx` (siga o padrão dos testes já
existentes nesse arquivo, do M4a: renderizar `<Sugestao objetivo={...} catalogo={[]}
carteira={[]} hoje={INI} onIrParaComparar={vi.fn()} />` com `waitFor`/`findBy`, porque o
gráfico de pizza carrega sob demanda):

```ts
it('mostra a nota de renda variável para longo prazo acima de 5 anos, com link para a lição', async () => {
  const objetivo: ObjetivoSalvo = { id: 'o1', criadoEm: INI, entradas: { tipo: 'LONGO_PRAZO', horizonteAnos: 10 } };
  render(<Sugestao objetivo={objetivo} catalogo={[]} carteira={[]} hoje={INI} onIrParaComparar={vi.fn()} />);
  expect(await screen.findByText(/renda variável/i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /renda variável/i })).toHaveAttribute('href', '#aprender/renda-variavel');
});

it('não mostra a nota para reserva de emergência', async () => {
  const objetivo: ObjetivoSalvo = { id: 'o2', criadoEm: INI, entradas: { tipo: 'RESERVA', gastoMensal: 1000, rendaEstavel: true } };
  render(<Sugestao objetivo={objetivo} catalogo={[]} carteira={[]} hoje={INI} onIrParaComparar={vi.fn()} />);
  await screen.findByRole('heading', { level: 2 }); // espera a tela terminar de montar
  expect(screen.queryByText(/renda variável/i)).not.toBeInTheDocument();
});
```

Ajuste os detalhes exatos (como o `href` do `LinkLicao`, ou o seletor de espera) para
bater com a implementação real de `LinkLicao.tsx` e com os testes já existentes de
`Sugestao.test.tsx` — leia esses dois arquivos antes de escrever o teste, e copie o
padrão de espera/asserção que os testes de M4a já usam para não reinventar um jeito
diferente de testar o mesmo componente.

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/objetivos/Sugestao.test.tsx`
Expected: FAIL — o texto "renda variável" não aparece na tela

**Step 3: Write minimal implementation**

Em `src/ui/objetivos/Sugestao.tsx`, importe `notaRendaVariavel` (o arquivo já importa
`AVISO_EDUCATIVO, descreverFatia, licaoDaFatia, textoDaFatia, textoDoFgc` de
`'../../conteudo/sugestao'`):

```ts
import { AVISO_EDUCATIVO, descreverFatia, licaoDaFatia, notaRendaVariavel, textoDaFatia, textoDoFgc } from '../../conteudo/sugestao';
```

Dentro do componente `Sugestao`, calcule a nota (não precisa de `useMemo`: é uma
comparação simples, muito mais barata que `sugerir`, e `objetivo.entradas` já é estável
entre renders que não mudam o objetivo):

```ts
  const nota = notaRendaVariavel(objetivo.entradas);
```

E, depois da `<ul class="lista-ofertas" ...>` de fatias, antes do fechamento de
`</section>`:

```tsx
      {nota && (
        <p class="dica">
          {nota} <LinkLicao licao="renda-variavel" />
        </p>
      )}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ui/objetivos/Sugestao.test.tsx`
Expected: PASS (todos os testes do arquivo)

**Step 5: Commit**

```bash
git add src/ui/objetivos/Sugestao.tsx tests/ui/objetivos/Sugestao.test.tsx
git commit -m "feat(ui): nota de renda variável na tela de sugestão"
```

---

## Lote C — Portão humano, verificação e PR

### Tarefa C1: Revisão editorial

Os textos da Tarefa B3 (seção nova da lição 10) e da B4/B5 (a nota) são rascunho.
1. Verificar as duas URLs novas (`FONTE_FII`, `FONTE_VENDA_ACOES`) uma vez cada, com
   atenção especial à de FII (confiança média-alta, fonte secundária — se o Planalto
   estiver acessível agora, tente achar o texto oficial da Lei 14.754/2023 e trocar a
   fonte por ela).
2. Passar os textos pelo /vozmax.
3. Mostrar ao usuário e **esperar a aprovação**.
4. Aplicar e ajustar os testes que dependerem de trechos literais.

### Tarefa C2: Verificação final

1. `npm run lint && npm run typecheck && npm test && npm run build` — todos verdes.
2. No navegador (dev, depois com `node scripts/servir-dist.mjs` contra a CSP de
   produção): abrir a lição "Renda variável" e conferir a seção nova; criar um objetivo
   "Longo prazo" com horizonte de 10 anos e ver a nota com o link; criar um "Sem objetivo
   definido" com horizonte de 3 anos e confirmar que a nota NÃO aparece.
3. Confirme que `git diff origin/main...m4b1 -- tests/engine/serie.test.ts` continua
   vazio (esse arquivo não deve ser tocado por este marco) — se a suíte completa mostrar
   uma falha ali, é a mesma flakiness de desempenho pré-existente do M3b, não deste PR;
   rode o arquivo isolado para confirmar que passa sozinho antes de investigar mais.

### Tarefa C3: Revisão de código

Revisão focada em: a regra de FII está corretamente marcada como confiança
média-alta (o comentário no código e, se fizer sentido, uma nota no PR); a nota de renda
variável aparece exatamente nos casos certos; nenhum número aparece no texto da lição
fora do que `REGRAS.rendaVariavel` fornece.

### Tarefa C4: PR

Com o ok do usuário: push da branch `m4b1`, `gh pr create` contra `main`, e ligar o
auto-fix.

---

## Fora do M4b1

M4b2: proxy da brapi na Cloudflare Pages Function, Turnstile, Workers KV, cache em
camadas, orçamento de cota, página `/status`, e o cálculo de rentabilidade/volatilidade/
drawdown de um ticker comparado a CDI e IPCA. Ver spec principal, seções 8 e 9.2
("Calculável").

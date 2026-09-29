# M5: Objetivo "Renda Mensal" — Plano de Implementação

> **Para o Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` para executar este plano tarefa por tarefa.

**Objetivo:** Adicionar um 5º tipo de Objetivo — "Renda Mensal" — que, dado um principal e uma
renda mensal desejada, calcula o %CDI necessário (tributado e isento) e sugere a oferta do catálogo
que chega lá — ou, quando nenhuma basta sozinha, a que mais se aproxima, com o quanto falta.

**Arquitetura:** Tudo entra em `src/engine/sugestao.ts` (sem arquivo novo — evita import circular
com os tipos `Fatia`/`MotivoFatia`/`ContextoSugestao` já definidos lá). Duas funções puras novas:
`calcularTaxaNecessaria` (resolve o %CDI por bisseção, reaproveitando `resolverPercentual` e
`taxasDiariasCDI` de `equivalencia.ts`, agora exportadas) e `sugerirRendaMensal` (casa com o
catálogo e decide entre fatia única suficiente ou fatia única insuficiente com o valor que falta —
sem diversificar: misturar duas ofertas pós-CDI nunca supera a melhor das duas isoladas, porque o
retorno é linear no valor aplicado; a prova está na seção 3 do design). A UI ganha
um novo prop `cenario: Cenario`, encadeado de `App.tsx` até `Sugestao.tsx`, porque esse tipo de
objetivo é o primeiro a precisar do CDI diário para o próprio cálculo (os outros 4 só mexem com
percentuais fixos).

**Tech Stack:** TypeScript, Preact, Vitest.

**Design de referência:** `docs/superpowers/specs/2026-09-28-m5-renda-mensal-design.md`

---

## Tarefa 1: Exportar os helpers de bisseção e `excedenteFGC`

Refatoração pura (sem mudança de comportamento) — não precisa de teste novo, só confirmar que a
suíte inteira continua passando.

**Arquivos:**
- Modificar: `src/engine/equivalencia.ts`
- Modificar: `src/engine/sugestao.ts`

**Passo 1:** Em `src/engine/equivalencia.ts`, adicione `export` a `taxasDiariasCDI`, `resolverPercentual`,
`disponivel` e `indisponivel` (hoje são funções privadas do módulo — linhas ~48-50 e ~63-95). Não
mude a assinatura nem o corpo de nenhuma, só a visibilidade.

**Passo 2:** Em `src/engine/sugestao.ts`, adicione `export` à função `excedenteFGC` (linha ~85). Não
mude a assinatura nem o corpo.

**Passo 3:** Rode a suíte inteira e o typecheck para confirmar que nada quebrou:
```bash
npm test
npm run typecheck
```
Esperado: tudo passando, igual a antes (essas mudanças só tornam público o que já existia).

**Passo 4: Commit**
```bash
git add src/engine/equivalencia.ts src/engine/sugestao.ts
git commit -m "refactor(sugestao): exporta helpers de equivalencia.ts e excedenteFGC, para reaproveitar no M5"
```

---

## Tarefa 2: Tipo `Objetivo` novo e `validarObjetivo`

**Arquivos:**
- Modificar: `src/engine/sugestao.ts`
- Modificar: `src/engine/regras/sugestao.ts`
- Teste: `tests/engine/sugestao.test.ts`

**Passo 1: Escrever o teste que falha**

Adicione a `tests/engine/sugestao.test.ts`, dentro do `describe('validarObjetivo', ...)` já
existente:

```ts
  it('renda mensal: principal e renda desejada precisam ser positivos', () => {
    const base: Objetivo = { tipo: 'RENDA_MENSAL', principal: 100000, rendaMensalDesejada: 1000 };
    expect(() => validarObjetivo({ ...base, principal: 0 }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ ...base, principal: Number.NaN }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ ...base, rendaMensalDesejada: 0 }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ ...base, rendaMensalDesejada: -100 }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo(base, HOJE)).not.toThrow();
  });
```

E, no `describe('valorAlvo', ...)`:

```ts
  it('renda mensal: sem valor-alvo (é o principal que importa, não um alvo a atingir)', () => {
    expect(valorAlvo({ tipo: 'RENDA_MENSAL', principal: 100000, rendaMensalDesejada: 1000 })).toBeNull();
  });
```

**Passo 2: Rodar e confirmar que falha**

Rodar: `npx vitest run tests/engine/sugestao.test.ts`
Esperado: FALHA — erro de tipo (`Objetivo` não tem o caso `'RENDA_MENSAL'`) antes mesmo de rodar,
já que o TypeScript vai reclamar. Confirme rodando `npm run typecheck` também.

**Passo 3: Implementar**

Em `src/engine/regras/sugestao.ts`, adicione (junto de `MULTIPLICADOR_RESERVA`/`FAIXAS_LONGO_PRAZO`):

```ts
/** Janela usada para calcular a renda mensal necessária: 30 dias corridos a partir de hoje. */
export const DIAS_RENDA_MENSAL = 30;
```

Em `src/engine/sugestao.ts`:

```ts
export type Objetivo =
  | { tipo: 'RESERVA'; gastoMensal: number; rendaEstavel: boolean }
  | { tipo: 'COM_DATA'; valorAlvo: number; data: DataISO }
  | { tipo: 'LONGO_PRAZO'; horizonteAnos: number }
  | { tipo: 'SEM_OBJETIVO'; horizonteAnos: number }
  | { tipo: 'RENDA_MENSAL'; principal: number; rendaMensalDesejada: number };
```

Em `valorAlvo`, adicione ao `switch`:

```ts
    case 'RENDA_MENSAL':
      return null;
```

Em `validarObjetivo`, adicione ao `switch`:

```ts
    case 'RENDA_MENSAL':
      if (!Number.isFinite(o.principal) || o.principal <= 0) throw new OfertaInvalidaError('Preencha o principal, maior que zero.');
      if (!Number.isFinite(o.rendaMensalDesejada) || o.rendaMensalDesejada <= 0) throw new OfertaInvalidaError('Preencha a renda mensal desejada, maior que zero.');
      break;
```

**Passo 4: Rodar e confirmar que passa**

Rodar: `npx vitest run tests/engine/sugestao.test.ts` e `npm run typecheck`
Esperado: PASS (note que o `switch` de `sugerir()` mais abaixo no arquivo ainda não trata
`'RENDA_MENSAL'` — isso só vai dar erro de exaustividade quando você tentar compilar o arquivo
inteiro; a Tarefa 5 resolve isso. Se o typecheck do arquivo falhar por causa disso AGORA, adicione
temporariamente `case 'RENDA_MENSAL': throw new Error('não implementado ainda');` dentro do
`switch` de `sugerir()`, só para destravar esta tarefa — a Tarefa 5 substitui isso pela
implementação de verdade).

**Passo 5: Commit**

```bash
git add src/engine/sugestao.ts src/engine/regras/sugestao.ts tests/engine/sugestao.test.ts
git commit -m "feat(sugestao): tipo de objetivo RENDA_MENSAL, validacao e DIAS_RENDA_MENSAL"
```

---

## Tarefa 3: `calcularTaxaNecessaria`

**Arquivos:**
- Modificar: `src/engine/sugestao.ts`
- Teste: `tests/engine/sugestao.test.ts`

**Passo 1: Escrever o teste que falha**

Adicione a `tests/engine/sugestao.test.ts` (importe `CEN, INI` de `./cenarioPadrao`, e
`calcularTaxaNecessaria`, `TaxaNecessaria` de `../../src/engine/sugestao`; importe também `simular`
e `fatorPercentualCDI`/`somarDias` conforme necessário para o teste de ida e volta):

```ts
import { CEN, INI } from './cenarioPadrao';
import { somarDias } from '../../src/engine/datas';
import { simular } from '../../src/engine/produtos';
// ... nos imports já existentes de '../../src/engine/sugestao', adicione calcularTaxaNecessaria

function taxaOuFalha(e: Equivalente): number { // reaproveite o helper `taxa()` já usado em equivalencia.test.ts, ou copie-o aqui
  if (!e.disponivel) throw new Error(`indisponível: ${e.motivo}`);
  return e.taxa;
}

describe('calcularTaxaNecessaria', () => {
  const DATA_RESGATE = somarDias(INI, 30);

  it('ida e volta: o %CDI tributado encontrado, aplicado num CDB, rende a renda mensal desejada', () => {
    const r = calcularTaxaNecessaria(100000, 1000, INI, CEN);
    const pct = taxaOuFalha(r.tributadoPosCDI);
    const sim = simular({ produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: pct }, valor: 100000, dataAplicacao: INI }, DATA_RESGATE, CEN);
    expect(sim.valorLiquido).toBeCloseTo(101000, 2);
  });

  it('ida e volta: o %CDI isento encontrado, aplicado numa LCI (ignorando a carência), rende a renda mensal desejada', () => {
    const r = calcularTaxaNecessaria(100000, 1000, INI, CEN);
    const pct = taxaOuFalha(r.isentoPosCDI);
    const sim = simular(
      { produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: pct }, valor: 100000, dataAplicacao: INI },
      DATA_RESGATE, CEN, { ignorarPrazoMinimo: true },
    );
    expect(sim.valorLiquido).toBeCloseTo(101000, 2);
  });

  it('o %CDI isento necessário é menor que o tributado (sem IR a descontar)', () => {
    const r = calcularTaxaNecessaria(100000, 1000, INI, CEN);
    expect(taxaOuFalha(r.isentoPosCDI)).toBeLessThan(taxaOuFalha(r.tributadoPosCDI));
  });

  it('indisponível se a renda desejada for desproporcional ao principal (estoura o teto de busca)', () => {
    const r = calcularTaxaNecessaria(100000, 100000, INI, CEN); // dobrar o principal em 30 dias
    expect(r.tributadoPosCDI.disponivel).toBe(false);
    expect(r.isentoPosCDI.disponivel).toBe(false);
  });
});
```

**Passo 2: Rodar e confirmar que falha**

Rodar: `npx vitest run tests/engine/sugestao.test.ts`
Esperado: FALHA — `calcularTaxaNecessaria` não existe.

**Passo 3: Implementar**

Em `src/engine/sugestao.ts`, adicione os imports necessários no topo do arquivo:

```ts
import type { Cenario } from './indexadores';
import { disponivel, indisponivel, resolverPercentual, taxasDiariasCDI, type Equivalente } from './equivalencia';
import { simular } from './produtos';
import { aliquotaIOF } from './regras/iof';
import { aliquotaIR } from './regras/ir';
import { DIAS_RENDA_MENSAL, faixaLongoPrazo, MULTIPLICADOR_RESERVA } from './regras/sugestao';
import { somarDias } from './datas';
```
(ajuste a lista final conforme o que já estiver importado no arquivo — não duplique imports
existentes de `./datas` ou `./regras/sugestao`, só acrescente os nomes novos ao `import` já lá.)

Adicione, próximo das outras funções de motor (antes do dispatcher `sugerir`):

```ts
export interface TaxaNecessaria {
  /** %CDI necessário num CDB/RDB (tributado) para a renda mensal desejada. */
  tributadoPosCDI: Equivalente;
  /**
   * %CDI necessário numa LCI/LCA (isenta) para a renda mensal desejada — taxa de REFERÊNCIA: a
   * LCI/LCA tem carência legal mínima de 6 meses (regras/prazoMinimo.ts), então não dá pra
   * resgatar de fato a cada 30 dias. Ver a nota da seção 2 do design do M5.
   */
  isentoPosCDI: Equivalente;
}

const SEM_DIAS_UTEIS_RENDA_MENSAL = 'sem dias úteis no período';

/**
 * Taxa necessária (%CDI) para que `principal` renda `rendaMensalDesejada` líquidos em
 * {@link DIAS_RENDA_MENSAL} dias corridos a partir de `hoje`, sacando só o rendimento (o principal
 * nunca é reduzido). Nunca lança: indisponível vira `Equivalente.disponivel === false`.
 */
export function calcularTaxaNecessaria(
  principal: number, rendaMensalDesejada: number, hoje: DataISO, cen: Cenario,
): TaxaNecessaria {
  const dataResgate = somarDias(hoje, DIAS_RENDA_MENSAL);
  const taxas = taxasDiariasCDI(cen, hoje, dataResgate);
  if (taxas.length === 0) {
    const semDias = indisponivel(SEM_DIAS_UTEIS_RENDA_MENSAL);
    return { tributadoPosCDI: semDias, isentoPosCDI: semDias };
  }

  const isentoPosCDI = disponivel(resolverPercentual(taxas, (principal + rendaMensalDesejada) / principal));

  const aIOF = aliquotaIOF(DIAS_RENDA_MENSAL, dataResgate);
  const aIR = aliquotaIR(DIAS_RENDA_MENSAL, dataResgate);
  const fatorAlvoTributado = 1 + rendaMensalDesejada / (principal * (1 - aIOF) * (1 - aIR));
  const tributadoPosCDI = disponivel(resolverPercentual(taxas, fatorAlvoTributado));

  return { tributadoPosCDI, isentoPosCDI };
}
```

**Passo 4: Rodar e confirmar que passa**

Rodar: `npx vitest run tests/engine/sugestao.test.ts`
Esperado: PASS.

**Passo 5: Commit**

```bash
git add src/engine/sugestao.ts tests/engine/sugestao.test.ts
git commit -m "feat(sugestao): calcularTaxaNecessaria para o objetivo Renda Mensal"
```

---

## Tarefa 4: `sugerirRendaMensal`

**Arquivos:**
- Modificar: `src/engine/sugestao.ts`
- Teste: `tests/engine/sugestao.test.ts`

**Passo 1: Escrever o teste que falha**

Adicione a `tests/engine/sugestao.test.ts` (reaproveite o helper `catalogoBase` já existente no
arquivo):

```ts
describe('sugerirRendaMensal', () => {
  const objetivo: Extract<Objetivo, { tipo: 'RENDA_MENSAL' }> = { tipo: 'RENDA_MENSAL', principal: 100000, rendaMensalDesejada: 1000 };
  const ctxBase = { catalogo: [] as OfertaCadastrada[], carteira: [] as ItemFGC[], hoje: INI };

  it('uma oferta isenta sozinha resolve: fatia única de 100%', () => {
    const catalogo = [catalogoBase({ id: 'lci', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.95 } })];
    const r = sugerirRendaMensal(objetivo, { ...ctxBase, catalogo }, CEN);
    expect(r.modo).toBe('UNICA');
    if (r.modo === 'UNICA') {
      expect(r.fatia.produto).toBe('LCI');
      expect(r.fatia.percentual).toBe(1);
      expect(r.fatia.motivo).toBe('RENDA_MENSAL_ISENTO');
    }
  });

  it('nenhuma sozinha resolve: usa 100% na que rende mais de verdade (não faz sentido misturar — ver nota do design)', () => {
    // Nem CDB a 50% do CDI nem LCI a 90% do CDI batem a meta sozinhos (o necessário é bem maior),
    // mas a LCI (isenta, sem IR) rende mais de verdade que o CDB nessa janela — ela é escolhida.
    const catalogo = [
      catalogoBase({ id: 'cdb', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.5 } }),
      catalogoBase({ id: 'lci', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.9 } }),
    ];
    const r = sugerirRendaMensal(objetivo, { ...ctxBase, catalogo }, CEN);
    expect(r.modo).toBe('INSUFICIENTE');
    if (r.modo === 'INSUFICIENTE') {
      expect(r.fatias).toHaveLength(1);
      expect(r.fatias[0]?.produto).toBe('LCI');
      expect(r.fatias[0]?.percentual).toBe(1);
      expect(r.faltaMensal).toBeGreaterThan(0);
    }
  });

  it('catálogo vazio: insuficiente, sem fatias, faltando a renda mensal inteira', () => {
    const r = sugerirRendaMensal(objetivo, ctxBase, CEN);
    expect(r.modo).toBe('INSUFICIENTE');
    if (r.modo === 'INSUFICIENTE') {
      expect(r.fatias).toHaveLength(0);
      expect(r.faltaMensal).toBeCloseTo(1000, 2);
    }
  });

  it('só oferta tributada no catálogo, e ela não basta sozinha: insuficiente com 1 fatia', () => {
    const catalogo = [catalogoBase({ id: 'cdb', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.5 } })];
    const r = sugerirRendaMensal(objetivo, { ...ctxBase, catalogo }, CEN);
    expect(r.modo).toBe('INSUFICIENTE');
    if (r.modo === 'INSUFICIENTE') {
      expect(r.fatias).toHaveLength(1);
      expect(r.fatias[0]?.percentual).toBe(1);
      expect(r.faltaMensal).toBeGreaterThan(0);
    }
  });
});
```

**Passo 2: Rodar e confirmar que falha**

Rodar: `npx vitest run tests/engine/sugestao.test.ts`
Esperado: FALHA — `sugerirRendaMensal` não existe.

**Passo 3: Implementar**

Em `src/engine/sugestao.ts`, adicione (depois de `calcularTaxaNecessaria`, antes do dispatcher
`sugerir`):

```ts
export type ResultadoRendaMensal =
  | { modo: 'UNICA'; fatia: Fatia }
  // 0 ou 1 fatia: 0 só se o catálogo estiver vazio nos dois regimes.
  | { modo: 'INSUFICIENTE'; fatias: Fatia[]; faltaMensal: number };

function melhorOfertaPosCDI(catalogo: readonly OfertaCadastrada[], isenta: boolean): OfertaCadastrada | undefined {
  let melhor: OfertaCadastrada | undefined;
  for (const o of catalogo) {
    if (o.indexacao.tipo !== 'POS_CDI' || ehIsentoIR(o.produto) !== isenta) continue;
    if (!melhor || o.indexacao.percentualCDI > (melhor.indexacao as { percentualCDI: number }).percentualCDI) melhor = o;
  }
  return melhor;
}

function construirFatiaRendaMensal(
  oferta: OfertaCadastrada, percentual: number, principal: number, motivo: MotivoFatia,
  carteira: readonly ItemFGC[], hoje: DataISO,
): Fatia {
  const valor = principal * percentual;
  const fgc = coberto(oferta.produto) ? excedenteFGC(oferta.conglomerado, valor, carteira, hoje) : undefined;
  return {
    produto: oferta.produto, indexacaoTipo: oferta.indexacao.tipo, percentual, motivo,
    garantia: garantiaDe(oferta.produto), valor, ofertaCatalogo: oferta, fgc,
  };
}

/** Líquido de 100% do principal numa oferta pós-CDI, na janela de renda mensal (LCI/LCA ignora a carência: ver TaxaNecessaria.isentoPosCDI). */
function liquidoNaJanela(oferta: OfertaCadastrada, valor: number, hoje: DataISO, dataResgate: DataISO, cen: Cenario): number {
  const ix = oferta.indexacao as { tipo: 'POS_CDI'; percentualCDI: number };
  return simular(
    { produto: oferta.produto, indexacao: ix, valor, dataAplicacao: hoje }, dataResgate, cen,
    { ignorarPrazoMinimo: ehIsentoIR(oferta.produto) },
  ).valorLiquido;
}

export function sugerirRendaMensal(
  o: Extract<Objetivo, { tipo: 'RENDA_MENSAL' }>, ctx: ContextoSugestao, cen: Cenario,
): ResultadoRendaMensal {
  const necessaria = calcularTaxaNecessaria(o.principal, o.rendaMensalDesejada, ctx.hoje, cen);
  const melhorTributada = melhorOfertaPosCDI(ctx.catalogo, false);
  const melhorIsenta = melhorOfertaPosCDI(ctx.catalogo, true);

  const tribResolve = necessaria.tributadoPosCDI.disponivel && melhorTributada
    && (melhorTributada.indexacao as { percentualCDI: number }).percentualCDI >= necessaria.tributadoPosCDI.taxa;
  const isnResolve = necessaria.isentoPosCDI.disponivel && melhorIsenta
    && (melhorIsenta.indexacao as { percentualCDI: number }).percentualCDI >= necessaria.isentoPosCDI.taxa;

  if (tribResolve || isnResolve) {
    // Entre as duas que resolveram, prefere a que precisava da taxa necessária mais baixa
    // (empate → isenta, por não ter IR a considerar depois).
    const usaIsenta = isnResolve && (!tribResolve
      || (necessaria.isentoPosCDI as { disponivel: true; taxa: number }).taxa <= (necessaria.tributadoPosCDI as { disponivel: true; taxa: number }).taxa);
    const oferta = (usaIsenta ? melhorIsenta : melhorTributada) as OfertaCadastrada;
    const motivo: MotivoFatia = usaIsenta ? 'RENDA_MENSAL_ISENTO' : 'RENDA_MENSAL_TRIBUTADO';
    return { modo: 'UNICA', fatia: construirFatiaRendaMensal(oferta, 1, o.principal, motivo, ctx.carteira, ctx.hoje) };
  }

  // Nenhuma resolve sozinha. NÃO tem sentido misturar (ver a nota do design, seção 3): o retorno de
  // qualquer oferta pós-CDI é linear no valor aplicado (IR/IOF só dependem do prazo), então uma
  // mistura nunca supera a melhor das duas isoladas. Usa 100% na que render mais de verdade.
  const candidatas: { oferta: OfertaCadastrada; motivo: MotivoFatia }[] = [];
  if (melhorTributada) candidatas.push({ oferta: melhorTributada, motivo: 'RENDA_MENSAL_TRIBUTADO' });
  if (melhorIsenta) candidatas.push({ oferta: melhorIsenta, motivo: 'RENDA_MENSAL_ISENTO' });

  if (candidatas.length === 0) {
    return { modo: 'INSUFICIENTE', fatias: [], faltaMensal: o.rendaMensalDesejada };
  }

  const dataResgate = somarDias(ctx.hoje, DIAS_RENDA_MENSAL);
  const rendimentos = candidatas.map((c) => ({ ...c, liquido: liquidoNaJanela(c.oferta, o.principal, ctx.hoje, dataResgate, cen) }));
  const melhor = rendimentos.reduce((a, b) => (b.liquido > a.liquido ? b : a));
  const fatia = construirFatiaRendaMensal(melhor.oferta, 1, o.principal, melhor.motivo, ctx.carteira, ctx.hoje);
  const faltaMensal = Math.max(0, o.rendaMensalDesejada - (melhor.liquido - o.principal));
  return { modo: 'INSUFICIENTE', fatias: [fatia], faltaMensal };
}
```

Isso exige `import { coberto } from './fgc';` e `import { ehIsentoIR, garantiaDe, simular } from './produtos';` no
topo do arquivo — confira se `coberto`/`garantiaDe`/`ehIsentoIR` já estão importados (alguns podem
já estar, pelo resto do arquivo) e só acrescente o que faltar, sem duplicar.

**Passo 4: Rodar e confirmar que passa**

Rodar: `npx vitest run tests/engine/sugestao.test.ts`
Esperado: PASS.

**Passo 5: Commit**

```bash
git add src/engine/sugestao.ts tests/engine/sugestao.test.ts
git commit -m "feat(sugestao): sugerirRendaMensal com fatia unica e aviso de insuficiencia"
```

---

## Tarefa 5: Dispatcher `sugerir()`, `MotivoFatia` e conteúdo

**Arquivos:**
- Modificar: `src/engine/sugestao.ts`
- Modificar: `src/conteudo/sugestao.ts`
- Teste: `tests/engine/sugestao.test.ts`
- Teste: `tests/conteudo/sugestao.test.ts` (se existir; senão, veja o Passo 3)

**Passo 1: Escrever o teste que falha**

Em `tests/engine/sugestao.test.ts`, no `describe('sugerir', ...)` já existente (ou crie um se não
houver), adicione:

```ts
  it('renda mensal: delega para sugerirRendaMensal e achata o resultado em Fatia[]', () => {
    const catalogo = [catalogoBase({ id: 'lci', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.95 } })];
    const fatias = sugerir(
      { tipo: 'RENDA_MENSAL', principal: 100000, rendaMensalDesejada: 1000 },
      { catalogo, carteira: [], hoje: INI }, CEN,
    );
    expect(fatias).toHaveLength(1);
    expect(fatias[0]?.motivo).toBe('RENDA_MENSAL_ISENTO');
  });

  it('renda mensal: lança se chamado sem Cenario', () => {
    expect(() => sugerir(
      { tipo: 'RENDA_MENSAL', principal: 100000, rendaMensalDesejada: 1000 },
      { catalogo: [], carteira: [], hoje: INI },
    )).toThrow();
  });
```

No arquivo de conteúdo (verifique se existe `tests/conteudo/sugestao.test.ts`; se sim, siga o
padrão dos testes já lá para os outros `MotivoFatia`; se não existir, pule este teste e confie na
suíte de integridade de `textoOficial.ts`, que já cobre `MotivoFatia` indiretamente por outros
testes de conteúdo — rode `npx vitest run tests/conteudo` para ver o que já existe):

```ts
  it('renda mensal: os dois motivos novos têm texto e lição', () => {
    const f = fatiaBase({ motivo: 'RENDA_MENSAL_TRIBUTADO' });
    expect(textoDaFatia(f)).toBeTruthy();
    expect(licaoDaFatia(f)).toBe('impostos');
    expect(textoDaFatia({ ...f, motivo: 'RENDA_MENSAL_ISENTO' })).toBeTruthy();
    expect(licaoDaFatia({ ...f, motivo: 'RENDA_MENSAL_ISENTO' })).toBe('liquidez');
  });
```

**Passo 2: Rodar e confirmar que falha**

Rodar: `npx vitest run tests/engine/sugestao.test.ts tests/conteudo/sugestao.test.ts`
Esperado: FALHA (`sugerir` não trata `RENDA_MENSAL` ainda; `TEXTO_E_LICAO` não tem as duas chaves
novas).

**Passo 3: Implementar**

Em `src/engine/sugestao.ts`, no dispatcher `sugerir()` (troque o `case 'RENDA_MENSAL'` provisório
da Tarefa 2, se você o adicionou, por este):

```ts
export function sugerir(objetivo: Objetivo, ctx: ContextoSugestao, cen?: Cenario): Fatia[] {
  validarObjetivo(objetivo, ctx.hoje);
  switch (objetivo.tipo) {
    case 'RESERVA': return sugerirReserva(objetivo, ctx);
    case 'COM_DATA': return sugerirComData(objetivo, ctx);
    case 'LONGO_PRAZO': return sugerirLongoPrazo(objetivo, ctx);
    case 'SEM_OBJETIVO': return sugerirSemObjetivo(objetivo, ctx);
    case 'RENDA_MENSAL': {
      if (!cen) throw new Error('RENDA_MENSAL precisa de um Cenario para calcular a taxa necessária');
      const r = sugerirRendaMensal(objetivo, ctx, cen);
      return r.modo === 'UNICA' ? [r.fatia] : r.fatias;
    }
  }
}
```

`MotivoFatia` ganha os dois valores novos:

```ts
export type MotivoFatia =
  | 'RESERVA_TESOURO_SELIC' | 'RESERVA_CDB_LIQUIDEZ'
  | 'DATA_VENCIMENTO_CASADO' | 'DATA_SEM_CASAMENTO'
  | 'LONGO_PRAZO_IPCA' | 'LONGO_PRAZO_POS'
  | 'SEM_OBJETIVO_POS' | 'SEM_OBJETIVO_PRE' | 'SEM_OBJETIVO_IPCA'
  | 'RENDA_MENSAL_TRIBUTADO' | 'RENDA_MENSAL_ISENTO';
```

Em `src/conteudo/sugestao.ts`, acrescente ao `TEXTO_E_LICAO` (rascunho — vai passar por revisão
editorial na Tarefa 8):

```ts
  RENDA_MENSAL_TRIBUTADO: { texto: 'Rende junto com os juros, mas o Imposto de Renda desconta parte do rendimento a cada resgate.', licao: 'impostos' },
  RENDA_MENSAL_ISENTO: { texto: 'Sem Imposto de Renda sobre o rendimento — mas tem carência mínima de 6 meses antes do primeiro resgate.', licao: 'liquidez' },
```

**Passo 4: Rodar e confirmar que passa**

Rodar: `npx vitest run tests/engine/sugestao.test.ts tests/conteudo/sugestao.test.ts`
Rodar também `npm test` (suíte inteira) e `npm run typecheck` — a exaustividade do `switch` em
`sugerir()` agora deve compilar limpa.
Esperado: PASS.

**Passo 5: Commit**

```bash
git add src/engine/sugestao.ts src/conteudo/sugestao.ts tests/engine/sugestao.test.ts tests/conteudo/sugestao.test.ts
git commit -m "feat(sugestao): sugerir() trata RENDA_MENSAL; textos dos dois motivos novos"
```

---

## Tarefa 6: Formulário (`FormObjetivo.tsx`)

**Arquivos:**
- Modificar: `src/ui/objetivos/FormObjetivo.tsx`
- Teste: `tests/ui/objetivos/FormObjetivo.test.tsx` (leia o arquivo primeiro para seguir o padrão
  exato de teste dos tipos já existentes — sobretudo `COM_DATA`, que também tem dois campos
  numéricos/de texto)

**Passo 1: Ler o teste existente**

Leia `tests/ui/objetivos/FormObjetivo.test.tsx` por inteiro antes de escrever qualquer coisa, para
replicar exatamente o estilo de setup/render/queries já usado para `COM_DATA` ou `RESERVA`.

**Passo 2: Escrever o teste que falha**

Adicione um `describe`/conjunto de `it`s para `RENDA_MENSAL`, no mesmo padrão dos tipos existentes
no arquivo, cobrindo: os dois campos aparecem (rótulos "Principal (R$)" e "Renda mensal desejada
(R$)"); preencher os dois e submeter chama `onSalvar` com
`{ tipo: 'RENDA_MENSAL', principal: <valor>, rendaMensalDesejada: <valor> }`; submeter com um
campo vazio/inválido mostra o erro de `validarObjetivo` em `role="alert"` e NÃO chama `onSalvar`
(mesmo padrão dos outros tipos já testados no arquivo).

**Passo 3: Rodar e confirmar que falha**

Rodar: `npx vitest run tests/ui/objetivos/FormObjetivo.test.tsx`
Esperado: FALHA (os campos/rótulos não existem ainda).

**Passo 4: Implementar**

Em `src/ui/objetivos/FormObjetivo.tsx`:
- Acrescente `RENDA_MENSAL: 'Renda mensal'` a `ROTULO_TIPO_OBJETIVO`.
- Acrescente dois estados: `principal`/`setPrincipal` e `rendaMensalDesejada`/`setRendaMensalDesejada`,
  inicializados a partir de `base?.tipo === 'RENDA_MENSAL' ? base.principal : NaN` (mesmo padrão
  dos outros campos numéricos do arquivo).
- Em `montar()`, acrescente `case 'RENDA_MENSAL': return { tipo, principal, rendaMensalDesejada };`.
- Acrescente o bloco JSX condicional `{tipo === 'RENDA_MENSAL' && (...)}` com dois `CampoNumerico`
  (`min="0" step="0.01"`), rotulados "Principal (R$)" e "Renda mensal desejada (R$)", no mesmo
  padrão visual dos campos `gastoMensal`/`valorAlvo` já existentes no arquivo.

**Passo 5: Rodar e confirmar que passa**

Rodar: `npx vitest run tests/ui/objetivos/FormObjetivo.test.tsx` e `npm run typecheck`
Esperado: PASS.

**Passo 6: Commit**

```bash
git add src/ui/objetivos/FormObjetivo.tsx tests/ui/objetivos/FormObjetivo.test.tsx
git commit -m "feat(ui): formulario do objetivo Renda Mensal"
```

---

## Tarefa 7: `Objetivos.tsx`, `Sugestao.tsx` e encadeamento do `Cenario`

**Arquivos:**
- Modificar: `src/ui/objetivos/Objetivos.tsx`
- Modificar: `src/ui/objetivos/Sugestao.tsx`
- Modificar: `src/ui/App.tsx`
- Teste: `tests/ui/objetivos/Objetivos.test.tsx` e `tests/ui/objetivos/Sugestao.test.tsx` (leia os
  dois primeiro para seguir o padrão de mock/render já usado)

**Passo 1: Ler os testes existentes**

Leia `tests/ui/objetivos/Sugestao.test.tsx` inteiro: veja como um `Cenario` de teste é construído
noutras telas (`tests/engine/cenarioPadrao.ts` — `CEN`) e reaproveite o mesmo padrão para montar um
`Cenario` de teste aqui, já que `Sugestao` passa a precisar de um.

**Passo 2: Escrever os testes que falham**

Em `tests/ui/objetivos/Sugestao.test.tsx`, adicione um novo prop `cenario={CEN}` (importado de
`../../engine/cenarioPadrao` ou caminho equivalente) em toda chamada de `render(<Sugestao ... />)`
já existente no arquivo (senão o TypeScript vai reclamar de prop obrigatória faltando). Adicione um
`describe`/conjunto de `it`s novo para `RENDA_MENSAL`, cobrindo os dois `modo`:
- Um objetivo `RENDA_MENSAL` cujo catálogo tem uma oferta isenta suficiente → aparece 1 fatia, o
  cartão com os dois %CDI necessários, e a nota da carência da LCI.
- Um objetivo sem catálogo suficiente → aparece a fatia única (a melhor que dá pra fazer, se
  houver alguma oferta) mais o aviso com o valor de `faltaMensal` formatado em R$ e um `LinkLicao`
  para `'renda-variavel'`.

Em `tests/ui/objetivos/Objetivos.test.tsx`, adicione `cenario={CEN}` em toda chamada de
`render(<Objetivos ... />)`, e um teste confirmando que `'RENDA_MENSAL'` aparece como opção no
seletor de "+ Novo objetivo".

**Passo 3: Rodar e confirmar que falha**

Rodar: `npx vitest run tests/ui/objetivos/Sugestao.test.tsx tests/ui/objetivos/Objetivos.test.tsx`
Esperado: FALHA (prop `cenario` não existe ainda nos componentes; tipo `RENDA_MENSAL` não aparece
na lista; blocos novos não renderizam).

**Passo 4: Implementar**

Em `src/ui/objetivos/Objetivos.tsx`:
- Acrescente `'RENDA_MENSAL'` ao array `TIPOS`.
- Acrescente `cenario: Cenario` a `PropsObjetivos` (importe `Cenario` de `../../engine/indexadores`)
  e passe adiante para `<Sugestao ... cenario={cenario} />`.
- Em `resumoObjetivo`, trate o caso `RENDA_MENSAL` antes do `as Extract<...>` genérico:
  ```ts
  if (o.entradas.tipo === 'RENDA_MENSAL') {
    return `Principal: ${formatarMoeda(o.entradas.principal)} · Renda desejada: ${formatarMoeda(o.entradas.rendaMensalDesejada)}/mês`;
  }
  ```
  (adicione essa checagem logo depois do `if (alvo !== null) return ...` já existente, antes do
  `as Extract<...>` que hoje assume só `LONGO_PRAZO`/`SEM_OBJETIVO`).

Em `src/ui/objetivos/Sugestao.tsx`:
- Acrescente `cenario: Cenario` a `PropsSugestao` (importe `Cenario` de `../../engine/indexadores`).
- Importe `calcularTaxaNecessaria`, `sugerirRendaMensal`, `type ResultadoRendaMensal` de
  `../../engine/sugestao`, e `formatarPercentual` (já importado) para os cartões de %CDI.
- Troque a chamada de `sugerir(objetivo.entradas, {...}, ...)` — quando `objetivo.entradas.tipo`
  for `'RENDA_MENSAL'`, use um `useMemo` separado chamando `sugerirRendaMensal` diretamente (para
  ter acesso a `modo`/`faltaMensal`, que `sugerir()` não expõe), e derive as `fatias` a partir dele
  (`resultado.modo === 'UNICA' ? [resultado.fatia] : resultado.fatias`) em vez de chamar `sugerir()`
  outra vez. Para os outros 4 tipos, mantenha `sugerir(objetivo.entradas, ctx)` como já está.
- Acrescente um bloco de UI, só quando `objetivo.entradas.tipo === 'RENDA_MENSAL'`, ANTES da lista
  de fatias: os dois %CDI necessários (chame `calcularTaxaNecessaria` com os mesmos argumentos,
  dentro do mesmo `useMemo`, para não recalcular a bisseção duas vezes), formatados com
  `formatarPercentual`, e a nota fixa da carência da LCI/LCA (texto do design, seção 4). Se
  `taxa.disponivel === false`, mostre `taxa.motivo` no lugar do percentual.
- Se `resultado.modo === 'INSUFICIENTE'`, mostre, abaixo da lista de fatias (que pode estar vazia,
  se o catálogo não tiver nenhuma oferta pós-CDI), um aviso com `resultado.faltaMensal` formatado
  em R$ e `<LinkLicao licao="renda-variavel" />` (mesmo padrão do bloco `{nota && (...)}` já
  existente no fim do componente, para `notaRendaVariavel`).

Em `src/ui/App.tsx`, no JSX de `<Objetivos ...>` (linha ~404), acrescente `cenario={ativo.cenario}`.

**Passo 5: Rodar e confirmar que passa**

Rodar: `npx vitest run tests/ui/objetivos/` e `npm run typecheck`
Esperado: PASS.

**Passo 6: Commit**

```bash
git add src/ui/objetivos/Objetivos.tsx src/ui/objetivos/Sugestao.tsx src/ui/App.tsx tests/ui/objetivos/
git commit -m "feat(ui): tela de sugestao do objetivo Renda Mensal, com o Cenario encadeado de App.tsx"
```

---

## Tarefa 8: Revisão final, editorial e PR

Sem código novo — checklist de fechamento do marco, igual aos anteriores.

**Passo 1:** Rodar a suíte inteira, typecheck e lint:
```bash
npm test
npm run typecheck
npm run lint
```

**Passo 2:** Revisão editorial (via /vozmax ou equivalente) dos textos novos e rascunhados neste
plano: os dois textos de `TEXTO_E_LICAO` (Tarefa 5), o texto do aviso de insuficiência (Tarefa 7),
a nota da carência da LCI/LCA (Tarefa 7), e os rótulos do formulário
(Tarefa 6). Mostrar ao usuário para aprovação antes do PR, no mesmo fluxo de todos os marcos
anteriores.

**Passo 3:** Revisão de código final (subagent `code-reviewer`, cobrindo todo o branch
`m5-renda-mensal` desde que divergiu de `main`), cobrindo especificamente:
- a lógica de bisseção reaproveitada de `equivalencia.ts` continua correta depois da mudança de
  visibilidade (Tarefa 1) — nenhuma duplicação de código;
- o caso `ignorarPrazoMinimo: true` só é usado para LCI/LCA na janela de 30 dias (nunca num resgate
  real fora deste contexto);
- `sugerir()` com `cen` ausente e um objetivo `RENDA_MENSAL` lança, em vez de silenciosamente
  devolver algo errado;
- os testes de `sugerirRendaMensal` realmente cobrem os 4 cenários do design (fatia única, diver-
  sificação, insuficiente com 0 fatias, insuficiente com 1 fatia).

**Passo 4:** Push e PR:
```bash
git push -u origin m5-renda-mensal
gh pr create --title "M5: objetivo Renda Mensal" --body "..."
```
Em seguida, `mcp__ccd_pr__set_monitor` com `auto_fix: true` (padrão do usuário para todos os PRs).

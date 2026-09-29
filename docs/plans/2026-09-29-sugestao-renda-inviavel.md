# Sugestão de renda mensal inviável: quanto seria preciso aplicar

> **Para o Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` para executar este plano tarefa por tarefa.

**Objetivo:** Quando a renda mensal desejada não cabe no principal informado (resultado `INSUFICIENTE`), a sugestão passa a dizer quanto seria preciso aplicar, num CDB de 100% do CDI (referência fácil de encontrar) e na melhor oferta do catálogo, lado a lado.

**Origem:** pedido do usuário em 2026-09-29: com R$ 3 mil de renda e R$ 50 mil de principal, o app só mostrava "Falta R$ X/mês". Faltava o caminho realista.

## Design

- **Motor** (`src/engine/sugestao.ts`): função pura `principalNecessario(rendaMensal, produto, percentualCDI, hoje, cen)` devolve o principal que rende `rendaMensal` líquida em `DIAS_RENDA_MENSAL` dias (mesma janela, mesmo IOF/IR de `calcularTaxaNecessaria`), ou `null` se o rendimento líquido não for positivo. O retorno das ofertas pós-CDI é linear no valor aplicado (IR/IOF só dependem do prazo), então basta simular um valor de referência e escalar. Sem texto no motor.
- **Resultado:** o ramo `INSUFICIENTE` de `ResultadoRendaMensal` ganha `principalNecessario: { referencia: number | null; catalogo: { oferta: OfertaCadastrada; valor: number } | null }`. `referencia` é o CDB a 100% do CDI. `catalogo` usa a oferta que `sugerirRendaMensal` já escolheu como melhor (some se o catálogo está vazio). LCI/LCA da fatia ignora a carência, como o resto do cálculo (`ignorarPrazoMinimo`).
- **UI** (`src/ui/objetivos/Sugestao.tsx`, textos em `src/conteudo/sugestao.ts`): no bloco `INSUFICIENTE`, acima do aviso "Falta ...", um `Destaque` "Principal necessário (CDB a 100% do CDI)" com a frase "Uma oferta fácil de encontrar. Com {principal}, o rendimento líquido em 30 dias é {rendimento}." e, se houver catálogo, uma linha "Com a sua melhor oferta ({nome}, {pct}% do CDI): {valor}". Mantém `AVISO_EDUCATIVO`: é referência educativa, não recomendação.
- **Fora do escopo:** mexer no resultado `UNICA`, em outros objetivos, ou sugerir prazos/aportes mensais.

---

## Tarefa 1: `principalNecessario` no motor

**Arquivos:** modificar `src/engine/sugestao.ts`; testar em `tests/engine/sugestao.test.ts` (ou o arquivo de renda mensal que já exista: `grep -rn "sugerirRendaMensal" tests/engine`).

**Passo 1: teste que falha (ida e volta, não tautológico).** O principal calculado, aplicado no mesmo produto e %CDI e simulado com `simular`, deve render a renda desejada:

```ts
describe('principalNecessario', () => {
  const cen = cenarioConstante({ cdiAA: 0.1365, selicMetaAA: 0.1375, ipcaAA: 0.0422, trAM: 0.001646 });
  const hoje = '2026-09-29';

  it('CDB a 100% do CDI: aplicar esse principal rende a renda desejada em 30 dias', () => {
    const p = principalNecessario(3000, 'CDB', 1, hoje, cen) as number;
    const r = simular({ produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 }, valor: p, dataAplicacao: hoje }, somarDias(hoje, DIAS_RENDA_MENSAL), cen);
    expect(r.valorLiquido - p).toBeCloseTo(3000, 2);
  });
  it('percentual maior do CDI pede principal menor', () => {
    const a = principalNecessario(3000, 'CDB', 1, hoje, cen) as number;
    const b = principalNecessario(3000, 'CDB', 1.1, hoje, cen) as number;
    expect(b).toBeLessThan(a);
  });
  it('LCI/LCA (isenta) pede principal menor que o CDB tributado no mesmo %CDI', () => {
    expect(principalNecessario(3000, 'LCI', 1, hoje, cen) as number).toBeLessThan(principalNecessario(3000, 'CDB', 1, hoje, cen) as number);
  });
  it('dobrar a renda dobra o principal (linearidade)', () => {
    const um = principalNecessario(1500, 'CDB', 1, hoje, cen) as number;
    expect(principalNecessario(3000, 'CDB', 1, hoje, cen)).toBeCloseTo(um * 2, 4);
  });
  it('rendimento não positivo: null', () => {
    const semCdi = cenarioConstante({ cdiAA: 0, selicMetaAA: 0, ipcaAA: 0, trAM: 0 });
    expect(principalNecessario(3000, 'CDB', 1, hoje, semCdi)).toBeNull();
  });
});
```
(Ajuste os imports ao arquivo de teste; confirme em `src/engine/produtos.ts` a assinatura de `simular` e do tipo `Aplicacao`.)

**Passo 2:** rodar → FALHA. **Passo 3: implementar**

```ts
const VALOR_REFERENCIA = 100_000;

/**
 * Principal que rende `rendaMensal` LÍQUIDA em {@link DIAS_RENDA_MENSAL} dias, sacando só o rendimento.
 * O retorno pós-CDI é linear no valor aplicado, então simula um valor de referência e escala.
 * LCI/LCA ignora a carência (é uma referência, como em calcularTaxaNecessaria.isentoPosCDI).
 */
export function principalNecessario(
  rendaMensal: number, produto: TipoProduto, percentualCDI: number, hoje: DataISO, cen: Cenario,
): number | null {
  const dataResgate = somarDias(hoje, DIAS_RENDA_MENSAL);
  const r = simular(
    { produto, indexacao: { tipo: 'POS_CDI', percentualCDI }, valor: VALOR_REFERENCIA, dataAplicacao: hoje },
    dataResgate, cen, { ignorarPrazoMinimo: ehIsentoIR(produto) },
  );
  const rendimento = r.valorLiquido - VALOR_REFERENCIA;
  return rendimento > 0 ? (rendaMensal * VALOR_REFERENCIA) / rendimento : null;
}
```

**Passo 4:** PASS + `npm run typecheck`. **Commit:** `feat(engine): principalNecessario para a renda mensal desejada`.

## Tarefa 2: `INSUFICIENTE` carrega o principal necessário

**Arquivos:** modificar `src/engine/sugestao.ts` (tipo `ResultadoRendaMensal` e `sugerirRendaMensal`); testes no mesmo arquivo da Tarefa 1.

**Passo 1: testes que falham.** Com principal 50 mil e renda 3 mil, catálogo vazio: `modo === 'INSUFICIENTE'`, `principalNecessario.referencia` bate com `principalNecessario(3000,'CDB',1,...)` e `catalogo === null`. Com uma oferta CDB 110% do CDI no catálogo: `catalogo.oferta` é essa oferta e `catalogo.valor` é menor que `referencia`. No modo `UNICA` o campo não existe (o tipo é de união).

**Passo 3: implementar.** Estenda o tipo:

```ts
| { modo: 'INSUFICIENTE'; fatias: Fatia[]; faltaMensal: number;
    principalNecessario: { referencia: number | null; catalogo: { oferta: OfertaCadastrada; valor: number } | null } }
```
e nos dois `return { modo: 'INSUFICIENTE', ... }` de `sugerirRendaMensal` acrescente o campo: `referencia: principalNecessario(o.rendaMensalDesejada, 'CDB', 1, ctx.hoje, cen)`; `catalogo`: `null` no caso de catálogo vazio; no outro, calcule com `principalNecessario(o.rendaMensalDesejada, melhor.oferta.produto, (melhor.oferta.indexacao as {percentualCDI:number}).percentualCDI, ctx.hoje, cen)` (se `null`, `catalogo` fica `null`). Corrija os pontos de uso do tipo que o `tsc` apontar (o dispatcher `sugerir` só lê `fatias`).

**Passo 4:** PASS + typecheck. **Commit:** `feat(engine): renda mensal inviavel devolve o principal necessario`.

## Tarefa 3: Texto e tela

**Arquivos:** `src/conteudo/sugestao.ts`, `src/ui/objetivos/Sugestao.tsx`, `tests/ui/objetivos/Sugestao.test.tsx`.

**Passo 1: testes que falham** (leia antes os testes de `INSUFICIENTE` em `Sugestao.test.tsx` para reaproveitar o setup): (a) com renda 3 mil e principal 50 mil, existe `getByRole('group', { name: /Principal necessário/ })` contendo um valor em R$ maior que R$ 50.000 e o texto "CDB a 100% do CDI"; (b) com uma oferta CDB 110% no catálogo, aparece "melhor oferta" com o nome e o %CDI, e o valor é menor que o de referência; (c) no modo `UNICA` (renda que cabe) o bloco NÃO aparece; (d) o "Falta R$ …/mês" e o `AVISO_EDUCATIVO` continuam.

**Passo 3: implementar.** Em `src/conteudo/sugestao.ts`, funções puras que só formatam frases (sem cálculo): `fraseReferenciaPrincipal(rendaMensal, principalAtual)` e `fraseMelhorOferta(nomeOferta, percentualCDI)`; use `formatarMoeda` de `src/formato.ts`. Na tela, dentro do bloco `INSUFICIENTE` e acima do aviso "Falta", renderize `<Destaque rotulo="Principal necessário (CDB a 100% do CDI)" valor={formatarMoeda(referencia)} frase=... />` quando `referencia !== null`, mais a linha da melhor oferta quando `catalogo !== null`. Classes com prefixo `obj-` e estilos em `src/ui/objetivos/objetivos.css` (só tokens).

**Passo 4:** `npx vitest run tests/ui/objetivos tests/engine` PASS; `npm test`, typecheck, lint. **Verifique no navegador** (375px, claro e escuro): criar um objetivo "Renda mensal" com principal 50000 e renda 3000, abrir a sugestão e conferir o bloco. **Commit:** `feat(ui): sugestao de renda mensal inviavel mostra o principal necessario`.

## Tarefa 4: Fechar

1. `npm test`, `npm run typecheck`, `npx tsc --noEmit -p functions/tsconfig.json`, `npm run lint`.
2. Subagent `code-reviewer` no branch (foco: linearidade do retorno, LCI/LCA sem carência, `null` quando o rendimento não é positivo, texto que não vire recomendação, nada fora de objetivos/engine de sugestão).
3. Push, `gh pr create` (sem assinatura de IA), auto-fix ligado; `CHANGELOG.md`.

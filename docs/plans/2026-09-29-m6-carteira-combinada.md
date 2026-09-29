# M6: Objetivo "Carteira Combinada" — Plano de Implementação

> **Para o Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` para executar este plano tarefa por tarefa.

**Objetivo:** Adicionar um 6º tipo de Objetivo — "Carteira Combinada" — que, dado um principal, um
gasto mensal (pra reserva de emergência) e um horizonte, divide o principal entre reserva e o
restante, sem inventar uma categoria "médio prazo" separada.

**Arquitetura:** Tudo entra em `src/engine/sugestao.ts`, reaproveitando `MULTIPLICADOR_RESERVA` (a
mesma fórmula de `RESERVA`) e `faixaLongoPrazo` (a mesma tabela de `LONGO_PRAZO`) — nenhum
`MotivoFatia` novo, nenhuma regra nova, nenhum `Cenario` necessário (diferente do M5, aqui não há
bisseção sobre CDI ao vivo). A função combinadora monta as 4 fatias (2 da reserva + 2 do restante)
com `valor` absoluto já preenchido e `percentual` relativo ao principal TOTAL, e reaproveita
`casarComCatalogo` sem nenhuma mudança nele.

**Tech Stack:** TypeScript, Preact, Vitest.

**Design de referência:** `docs/superpowers/specs/2026-09-29-m6-carteira-combinada-design.md`

---

## Tarefa 1: Tipo `Objetivo` novo, `validarObjetivo` e `valorAlvo`

**Arquivos:**
- Modificar: `src/engine/sugestao.ts`
- Teste: `tests/engine/sugestao.test.ts`

**Passo 1: Escrever o teste que falha**

Adicione a `tests/engine/sugestao.test.ts`:

Em `describe('valorAlvo', ...)`:
```ts
  it('carteira combinada: o próprio principal', () => {
    expect(valorAlvo({ tipo: 'CARTEIRA_COMBINADA', principal: 100000, gastoMensal: 3000, rendaEstavel: true, horizonteAnos: 20 })).toBe(100000);
  });
```

Em `describe('validarObjetivo', ...)`:
```ts
  it('carteira combinada: os 4 campos válidos, e a reserva não pode passar do principal', () => {
    const base: Objetivo = { tipo: 'CARTEIRA_COMBINADA', principal: 100000, gastoMensal: 3000, rendaEstavel: true, horizonteAnos: 20 };
    expect(() => validarObjetivo({ ...base, principal: 0 }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ ...base, gastoMensal: 0 }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ ...base, horizonteAnos: 0 }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ ...base, horizonteAnos: 5.5 }, HOJE)).toThrow(OfertaInvalidaError);
    // reserva = 3000 × 6 = 18000 (rendaEstavel: true); principal menor que isso deve lançar.
    expect(() => validarObjetivo({ ...base, principal: 17999 }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ ...base, principal: 18000 }, HOJE)).not.toThrow(); // limite: igual é aceito
    expect(() => validarObjetivo(base, HOJE)).not.toThrow();
  });
```

**Passo 2: Rodar e confirmar que falha**

Rodar: `npx vitest run tests/engine/sugestao.test.ts` e `npm run typecheck`
Esperado: FALHA — `Objetivo` não tem o caso `'CARTEIRA_COMBINADA'`.

**Passo 3: Implementar**

Em `src/engine/sugestao.ts`:

```ts
export type Objetivo =
  | { tipo: 'RESERVA'; gastoMensal: number; rendaEstavel: boolean }
  | { tipo: 'COM_DATA'; valorAlvo: number; data: DataISO }
  | { tipo: 'LONGO_PRAZO'; horizonteAnos: number }
  | { tipo: 'SEM_OBJETIVO'; horizonteAnos: number }
  | { tipo: 'RENDA_MENSAL'; principal: number; rendaMensalDesejada: number }
  | { tipo: 'CARTEIRA_COMBINADA'; principal: number; gastoMensal: number; rendaEstavel: boolean; horizonteAnos: number };
```

Em `valorAlvo`, adicione ao `switch`:
```ts
    case 'CARTEIRA_COMBINADA':
      return objetivo.principal;
```

Em `validarObjetivo`, adicione ao `switch`:
```ts
    case 'CARTEIRA_COMBINADA': {
      if (!Number.isFinite(o.principal) || o.principal <= 0) throw new OfertaInvalidaError('Preencha o principal, maior que zero.');
      if (!Number.isFinite(o.gastoMensal) || o.gastoMensal <= 0) throw new OfertaInvalidaError('Preencha o gasto mensal, maior que zero.');
      if (!Number.isInteger(o.horizonteAnos) || o.horizonteAnos <= 0) {
        throw new OfertaInvalidaError('Informe um horizonte em anos inteiro, maior que zero.');
      }
      const valorReserva = o.gastoMensal * (o.rendaEstavel ? MULTIPLICADOR_RESERVA.estavel : MULTIPLICADOR_RESERVA.variavel);
      if (valorReserva > o.principal) {
        throw new OfertaInvalidaError(`A reserva de emergência sozinha (${valorReserva}) já passa do total informado.`);
      }
      break;
    }
```
(o valor de `valorReserva` na mensagem pode ficar sem formatação de moeda — o motor não formata
texto para o usuário, isso é papel de `src/conteudo/`; se preferir, deixe a mensagem só com o
número cru, como já é o padrão de `OfertaInvalidaError` nos outros casos deste arquivo.)

**Passo 4: Rodar e confirmar que passa**

Rodar: `npx vitest run tests/engine/sugestao.test.ts` e `npm run typecheck`
Esperado: PASS pros dois testes novos. O dispatcher `sugerir()` mais abaixo no arquivo ainda não
trata `'CARTEIRA_COMBINADA'` — se isso quebrar o typecheck do arquivo inteiro, adicione
TEMPORARIAMENTE `case 'CARTEIRA_COMBINADA': throw new Error('não implementado ainda');` dentro do
`switch` de `sugerir()`, só para destravar esta tarefa (será substituído na Tarefa 3).

**Passo 5: Commit**

```bash
git add src/engine/sugestao.ts tests/engine/sugestao.test.ts
git commit -m "feat(sugestao): tipo de objetivo CARTEIRA_COMBINADA e validacao"
```

---

## Tarefa 2: Persistência (schema)

**Arquivos:**
- Modificar: `src/armazenamento/objetivos.ts`
- Teste: `tests/armazenamento/objetivos.test.ts`

Esta tarefa existe porque o M5 (marco anterior) esqueceu o schema de persistência numa primeira
passada, e só foi pego numa tarefa de UI mais tarde — fazendo isso cedo aqui evita o mesmo susto.

**Passo 1: Escrever o teste que falha**

Em `tests/armazenamento/objetivos.test.ts`, no teste `'entradas de cada tipo passam no esquema'`,
acrescente `CARTEIRA_COMBINADA` à lista (e aproveite pra acrescentar `RENDA_MENSAL`, que também
ficou de fora dessa lista desde o M5 — mesmo arquivo, mesmo teste, drive-by fix trivial):

```ts
  it('entradas de cada tipo passam no esquema', () => {
    const arm = memoria();
    const lista = [
      objetivo({ entradas: { tipo: 'RESERVA', gastoMensal: 1000, rendaEstavel: false } }),
      objetivo({ entradas: { tipo: 'COM_DATA', valorAlvo: 5000, data: '2030-01-01' } }),
      objetivo({ entradas: { tipo: 'LONGO_PRAZO', horizonteAnos: 20 } }),
      objetivo({ entradas: { tipo: 'SEM_OBJETIVO', horizonteAnos: 3 } }),
      objetivo({ entradas: { tipo: 'RENDA_MENSAL', principal: 100000, rendaMensalDesejada: 1000 } }),
      objetivo({ entradas: { tipo: 'CARTEIRA_COMBINADA', principal: 100000, gastoMensal: 3000, rendaEstavel: true, horizonteAnos: 20 } }),
    ];
    salvarObjetivos(arm, lista);
    expect(lerObjetivos(arm)).toHaveLength(6);
  });
```

**Passo 2: Rodar e confirmar que falha**

Rodar: `npx vitest run tests/armazenamento/objetivos.test.ts`
Esperado: FALHA — `lerObjetivos` devolve menos de 6 itens (o schema rejeita silenciosamente o que
não reconhece, então o item `CARTEIRA_COMBINADA` desaparece, não lança).

**Passo 3: Implementar**

Em `src/armazenamento/objetivos.ts`, acrescente ao array de `EsquemaEntradas`:

```ts
  z.strictObject({
    tipo: z.literal('CARTEIRA_COMBINADA'), principal: z.number().positive(), gastoMensal: z.number().positive(),
    rendaEstavel: z.boolean(), horizonteAnos: z.number().int().positive(),
  }),
```

**Passo 4: Rodar e confirmar que passa**

Rodar: `npx vitest run tests/armazenamento/objetivos.test.ts` e `npm run typecheck`
Esperado: PASS.

**Passo 5: Commit**

```bash
git add src/armazenamento/objetivos.ts tests/armazenamento/objetivos.test.ts
git commit -m "feat(objetivos): schema de persistencia do tipo CARTEIRA_COMBINADA (e RENDA_MENSAL, que ficou de fora no M5)"
```

---

## Tarefa 3: Função combinadora e dispatcher

**Arquivos:**
- Modificar: `src/engine/sugestao.ts`
- Teste: `tests/engine/sugestao.test.ts`

**Passo 1: Escrever o teste que falha**

Adicione a `tests/engine/sugestao.test.ts` (reaproveite `catalogoBase`/`carteiraItem` já
existentes no arquivo):

```ts
describe('sugerirCarteiraCombinada', () => {
  const objetivo: Extract<Objetivo, { tipo: 'CARTEIRA_COMBINADA' }> = {
    tipo: 'CARTEIRA_COMBINADA', principal: 100000, gastoMensal: 3000, rendaEstavel: true, horizonteAnos: 20,
  };
  const ctxBase = { catalogo: [] as OfertaCadastrada[], carteira: [] as ItemFGC[], hoje: HOJE };

  it('4 fatias (2 da reserva + 2 do restante), somando 100% e o valor do principal', () => {
    const fatias = sugerir(objetivo, ctxBase);
    expect(fatias).toHaveLength(4);
    const somaPercentual = fatias.reduce((s, f) => s + f.percentual, 0);
    expect(somaPercentual).toBeCloseTo(1, 10);
    const somaValor = fatias.reduce((s, f) => s + (f.valor ?? 0), 0);
    expect(somaValor).toBeCloseTo(100000, 6);
  });

  it('a reserva é 18000 (3000 × 6, rendaEstavel), dividida 50/50 entre Tesouro Selic e CDB', () => {
    const fatias = sugerir(objetivo, ctxBase);
    const selic = fatias.find((f) => f.motivo === 'RESERVA_TESOURO_SELIC');
    const cdbReserva = fatias.find((f) => f.motivo === 'RESERVA_CDB_LIQUIDEZ');
    expect(selic?.valor).toBeCloseTo(9000, 6);
    expect(cdbReserva?.valor).toBeCloseTo(9000, 6);
    expect(selic?.percentual).toBeCloseTo(0.09, 6); // 9000 / 100000
  });

  it('o restante (82000) segue a faixa de 20 anos (faixaLongoPrazo): 70% IPCA+, 30% pós', () => {
    const fatias = sugerir(objetivo, ctxBase);
    const ipca = fatias.find((f) => f.motivo === 'LONGO_PRAZO_IPCA');
    const pos = fatias.find((f) => f.motivo === 'LONGO_PRAZO_POS');
    expect(ipca?.valor).toBeCloseTo(82000 * 0.7, 6);
    expect(pos?.valor).toBeCloseTo(82000 * 0.3, 6);
  });

  it('FGC cruzado: reserva (CDB) e restante (CDB pós) no mesmo conglomerado somam', () => {
    const catalogo = [
      catalogoBase({ id: 'cdb1', produto: 'CDB', conglomerado: 'Banco X', liquidez: 'DIARIA' }),
    ];
    const carteira = [carteiraItem('Banco X', 200000)]; // já perto do limite do FGC sozinha
    const fatias = sugerir(objetivo, { ...ctxBase, catalogo, carteira });
    const comFgc = fatias.filter((f) => f.fgc !== undefined);
    expect(comFgc.length).toBeGreaterThan(0);
  });
});
```

Ajuste os números do teste de FGC cruzado se necessário (rode e veja o resultado real — o objetivo
é só confirmar que o aviso de FGC aparece quando a soma das fatias no catálogo passa do limite,
reaproveitando o comportamento já testado de `casarComCatalogo`, não reimplementar esse teste do
zero).

**Passo 2: Rodar e confirmar que falha**

Rodar: `npx vitest run tests/engine/sugestao.test.ts`
Esperado: FALHA — `sugerir()` ainda lança/não trata `CARTEIRA_COMBINADA` de verdade.

**Passo 3: Implementar**

Em `src/engine/sugestao.ts`, adicione (perto de `sugerirReserva`/`sugerirLongoPrazo`, antes do
dispatcher):

```ts
function sugerirCarteiraCombinada(o: Extract<Objetivo, { tipo: 'CARTEIRA_COMBINADA' }>, ctx: ContextoSugestao): Fatia[] {
  const valorReserva = o.gastoMensal * (o.rendaEstavel ? MULTIPLICADOR_RESERVA.estavel : MULTIPLICADOR_RESERVA.variavel);
  const restante = o.principal - valorReserva;
  const faixa = faixaLongoPrazo(o.horizonteAnos);

  const base: Fatia[] = [
    {
      produto: 'TESOURO_SELIC', indexacaoTipo: 'SELIC', motivo: 'RESERVA_TESOURO_SELIC', garantia: 'TESOURO_NACIONAL',
      valor: valorReserva * 0.5, percentual: (valorReserva * 0.5) / o.principal,
    },
    {
      produto: 'CDB', indexacaoTipo: 'POS_CDI', motivo: 'RESERVA_CDB_LIQUIDEZ', garantia: 'FGC',
      valor: valorReserva * 0.5, percentual: (valorReserva * 0.5) / o.principal,
    },
    {
      produto: 'TESOURO_IPCA', indexacaoTipo: 'IPCA_MAIS', motivo: 'LONGO_PRAZO_IPCA', garantia: 'TESOURO_NACIONAL',
      valor: restante * faixa.ipca, percentual: (restante * faixa.ipca) / o.principal,
    },
    {
      produto: 'CDB', indexacaoTipo: 'POS_CDI', motivo: 'LONGO_PRAZO_POS', garantia: 'FGC',
      valor: restante * faixa.pos, percentual: (restante * faixa.pos) / o.principal,
    },
  ];
  return casarComCatalogo(base, ctx.catalogo, ctx.carteira, ctx.hoje, { liquidezDiaria: true });
}
```

Note: `{ liquidezDiaria: true }` é passado porque a fatia de reserva precisa de liquidez diária
(mesma regra de `sugerirReserva`) — isso também restringe as fatias de longo prazo do mesmo lote a
só casar com ofertas de liquidez diária, o que é uma simplificação aceitável aqui (diferente de
`sugerirLongoPrazo` isolado, que não exige liquidez diária). Se isso incomodar nos testes, é porque
`casarComCatalogo` casa o LOTE inteiro com a mesma opção — não dá pra misturar exigências dentro de
uma única chamada. Deixe assim por ora (documentado no design como uma decisão da implementação,
não uma falha).

No dispatcher `sugerir()`, troque o `case 'CARTEIRA_COMBINADA'` temporário (se você o criou na
Tarefa 1) por:

```ts
    case 'CARTEIRA_COMBINADA': return sugerirCarteiraCombinada(objetivo, ctx);
```

**Passo 4: Rodar e confirmar que passa**

Rodar: `npx vitest run tests/engine/sugestao.test.ts` e `npm test` (suíte completa)
Esperado: PASS.

**Passo 5: Commit**

```bash
git add src/engine/sugestao.ts tests/engine/sugestao.test.ts
git commit -m "feat(sugestao): sugerirCarteiraCombinada (reserva + restante em gradiente medio-longo)"
```

---

## Tarefa 4: Formulário e seletor de tipo

**Arquivos:**
- Modificar: `src/ui/objetivos/FormObjetivo.tsx`
- Modificar: `src/ui/objetivos/Objetivos.tsx`
- Teste: `tests/ui/objetivos/FormObjetivo.test.tsx`
- Teste: `tests/ui/objetivos/Objetivos.test.tsx`

**Passo 1: Ler os testes existentes**

Leia `tests/ui/objetivos/FormObjetivo.test.tsx` por inteiro, focando em como o teste de `RESERVA`
(gasto mensal + renda estável) e o de `RENDA_MENSAL` (dois campos numéricos) estão escritos, pra
replicar o padrão exato.

**Passo 2: Escrever os testes que falham**

Em `FormObjetivo.test.tsx`, um novo conjunto de testes para `CARTEIRA_COMBINADA`: os 4 campos
aparecem ("Principal (R$)", "Gasto mensal (R$)", o radio "Renda" Estável/Variável, "Horizonte
(anos)"); preencher e submeter chama `onSalvar` com
`{ tipo: 'CARTEIRA_COMBINADA', principal, gastoMensal, rendaEstavel, horizonteAnos }`; submeter com
a reserva calculada passando do principal mostra o erro em `role="alert"` e não chama `onSalvar`.

Em `Objetivos.test.tsx`, um teste confirmando que "Carteira combinada" (ou o rótulo escolhido)
aparece no seletor de "+ Novo objetivo".

**Passo 3: Rodar e confirmar que falha**

Rodar: `npx vitest run tests/ui/objetivos/FormObjetivo.test.tsx tests/ui/objetivos/Objetivos.test.tsx`
Esperado: FALHA.

**Passo 4: Implementar**

Em `src/ui/objetivos/FormObjetivo.tsx`:
- Acrescente `CARTEIRA_COMBINADA: 'Carteira combinada'` a `ROTULO_TIPO_OBJETIVO`.
- **Não crie estados novos**: `gastoMensal`/`setGastoMensal`, `rendaEstavel`/`setRendaEstavel`,
  `principal`/`setPrincipal` e `horizonteAnos`/`setHorizonteAnos` já existem (reaproveitados de
  `RESERVA`, `RENDA_MENSAL`, `LONGO_PRAZO`/`SEM_OBJETIVO`). Só estenda as condições de
  inicialização de cada um pra também aceitar `base?.tipo === 'CARTEIRA_COMBINADA'`:
  ```ts
  const [gastoMensal, setGastoMensal] = useState(
    base?.tipo === 'RESERVA' || base?.tipo === 'CARTEIRA_COMBINADA' ? base.gastoMensal : NaN,
  );
  const [rendaEstavel, setRendaEstavel] = useState(
    base?.tipo === 'RESERVA' || base?.tipo === 'CARTEIRA_COMBINADA' ? base.rendaEstavel : true,
  );
  // ...
  const [principal, setPrincipal] = useState(
    base?.tipo === 'RENDA_MENSAL' || base?.tipo === 'CARTEIRA_COMBINADA' ? base.principal : NaN,
  );
  // ...
  const [horizonteAnos, setHorizonteAnos] = useState(
    base?.tipo === 'LONGO_PRAZO' || base?.tipo === 'SEM_OBJETIVO' || base?.tipo === 'CARTEIRA_COMBINADA' ? base.horizonteAnos : NaN,
  );
  ```
- Em `montar()`, adicione: `case 'CARTEIRA_COMBINADA': return { tipo, principal, gastoMensal, rendaEstavel, horizonteAnos };`.
- Acrescente o bloco JSX condicional `{tipo === 'CARTEIRA_COMBINADA' && (...)}`, reaproveitando os
  MESMOS campos visuais já usados nos blocos de `RESERVA` (gasto mensal + radio de renda) e de
  `LONGO_PRAZO`/`SEM_OBJETIVO` (horizonte), mais o campo "Principal (R$)" já usado em
  `RENDA_MENSAL` — copie a estrutura JSX de cada um desses blocos existentes pro bloco novo, com
  ids únicos (`${ID}-principal` já existe no bloco de RENDA_MENSAL — como os blocos são mutuamente
  exclusivos por `tipo`, reaproveitar o MESMO id é seguro, já que só um bloco é renderizado por vez;
  ainda assim, prefira ids distintos por clareza, e ajuste os testes de acordo).

Em `src/ui/objetivos/Objetivos.tsx`, acrescente `'CARTEIRA_COMBINADA'` ao array `TIPOS`.
**Não precisa mexer em `resumoObjetivo`**: como `valorAlvo` já retorna o `principal` (Tarefa 1), o
branch genérico `if (alvo !== null) return ...` já cobre esse tipo.

**Passo 5: Rodar e confirmar que passa**

Rodar: `npx vitest run tests/ui/objetivos/` e `npm run typecheck`
Esperado: PASS.

**Passo 6: Commit**

```bash
git add src/ui/objetivos/FormObjetivo.tsx src/ui/objetivos/Objetivos.tsx tests/ui/objetivos/FormObjetivo.test.tsx tests/ui/objetivos/Objetivos.test.tsx
git commit -m "feat(ui): formulario e seletor do objetivo Carteira Combinada"
```

---

## Tarefa 5: Confirmação de que `Sugestao.tsx` não precisa mudar

**Arquivos:** nenhum modificado — só verificação.

**Passo 1:** Rode a suíte de `tests/ui/objetivos/Sugestao.test.tsx` como está, sem nenhuma
alteração no componente. Como `CARTEIRA_COMBINADA` não precisa de `Cenario`, `modo` nem taxa
calculada, o fluxo genérico (`sugerir(objetivo.entradas, ctx)` → lista de fatias →
`GraficoObjetivo`) já deve funcionar sem tocar em `Sugestao.tsx`.

**Passo 2 (opcional, recomendado):** Adicione UM teste de fumaça em `Sugestao.test.tsx`
renderizando um objetivo `CARTEIRA_COMBINADA` e confirmando que aparecem 4 itens na lista de
fatias — só pra deixar registrado que esse caminho passa pelo componente sem quebrar, sem exigir
nenhuma mudança nele. Se esse teste passar sem tocar em `Sugestao.tsx`, confirma a seção 4 do
design (nenhuma mudança de UI necessária além do formulário).

**Passo 3: Commit** (só se adicionou o teste de fumaça do Passo 2)

```bash
git add tests/ui/objetivos/Sugestao.test.tsx
git commit -m "test(ui): fumaça confirmando que Sugestao.tsx nao precisa de mudanca pra Carteira Combinada"
```

---

## Tarefa 6: Revisão final, editorial e PR

Sem código novo — checklist de fechamento do marco, igual aos anteriores.

**Passo 1:** Rodar a suíte inteira, typecheck e lint:
```bash
npm test
npm run typecheck
npm run lint
```

**Passo 2:** Revisão editorial dos únicos textos novos deste marco (nenhum `MotivoFatia` novo, só
rótulos de UI): "Carteira combinada" (rótulo do tipo), "Principal (R$)"/"Gasto mensal (R$)"/
"Horizonte (anos)" (reaproveitados, sem texto novo de verdade), e a mensagem de erro "A reserva de
emergência sozinha (R$X) já passa do total informado." — mostrar ao usuário pra aprovação antes do
PR.

**Passo 3:** Revisão de código final (subagent `code-reviewer`, cobrindo todo o branch
`m6-carteira-combinada` desde que divergiu de `main`), cobrindo especificamente:
- a checagem cruzada (`reserva > principal`) realmente impede salvar um objetivo inválido, tanto no
  motor (`validarObjetivo`) quanto na UI (`FormObjetivo.tsx`);
- a soma das 4 fatias bate exatamente com o `principal` (sem perda por arredondamento fora de
  tolerância aceitável);
- nenhuma regressão nos 5 tipos de objetivo já existentes (a reutilização de estados em
  `FormObjetivo.tsx` é a parte mais arriscada de causar isso).

**Passo 4:** Push e PR:
```bash
git push -u origin m6-carteira-combinada
gh pr create --title "M6: objetivo Carteira Combinada" --body "..."
```
Em seguida, `mcp__ccd_pr__set_monitor` com `auto_fix: true` (padrão do usuário para todos os PRs).

# M5: Objetivo "Renda Mensal" — Design

- **Data:** 2026-09-28
- **Status:** aprovado, pronto para o plano de implementação
- **Relação com a spec principal:** funcionalidade nova, fora do roadmap original de
  `docs/superpowers/specs/2026-09-27-onde-investir-design.md` (que termina no M4/fase 2). Estende
  a seção 9.1 ("Sugestão por objetivo") com um 5º tipo de objetivo.

## 1. Objetivo

Hoje a aba Objetivos responde "onde investir dado um objetivo" (reserva, data, longo prazo, sem
objetivo). Este marco adiciona um 5º tipo: **Renda Mensal** — dado um principal disponível e uma
renda mensal desejada, o app calcula que taxa (%CDI) seria necessária para gerar esse rendimento
todo mês, de forma sustentável (sacando só o rendimento, mantendo o principal intacto), e sugere
a(s) oferta(s) do catálogo que chegam lá.

### Fora do escopo

- Simulação exata de saques parciais mês a mês com IR recalculado por tranche (ver seção 2,
  premissa da alíquota).
- Produtos de renda variável na composição automática (a lição de renda variável só é linkada
  como saída, quando nem a diversificação em renda fixa resolve).
- Qualquer alteração nos outros 4 tipos de objetivo já existentes.

## 2. Modelo de dados e cálculo da taxa necessária

Novo caso em `Objetivo` (`src/engine/sugestao.ts`):

```ts
export type Objetivo =
  | { tipo: 'RESERVA'; gastoMensal: number; rendaEstavel: boolean }
  | { tipo: 'COM_DATA'; valorAlvo: number; data: DataISO }
  | { tipo: 'LONGO_PRAZO'; horizonteAnos: number }
  | { tipo: 'SEM_OBJETIVO'; horizonteAnos: number }
  | { tipo: 'RENDA_MENSAL'; principal: number; rendaMensalDesejada: number };
```

`validarObjetivo` ganha o caso `RENDA_MENSAL`: `principal > 0` e `rendaMensalDesejada > 0`
(mensagens no mesmo padrão dos outros casos, via `OfertaInvalidaError`).

**Janela de cálculo:** 30 dias corridos a partir de `ctx.hoje`. **Premissa assumida e documentada
no texto ao usuário:** a alíquota de IR usada é a de curto prazo (`aliquotaIR(30, hoje)` — hoje
22,5%, mas buscada na regra vigente, nunca hardcoded), simulando que a pessoa vai sacar o
rendimento todo mês desde o início. Isso é conservador: se a pessoa mantiver o plano por mais de 2
anos, a alíquota real cai para 15% e a renda líquida real fica acima do que o app promete — nunca
abaixo.

Novas funções direto em `src/engine/sugestao.ts`, junto das outras 4 (evita import circular: rendaMensal.ts precisaria de `Fatia`/`MotivoFatia`/`ContextoSugestao`/`excedenteFGC` de sugestao.ts, e sugestao.ts precisaria da nova função no dispatcher `sugerir()`):

```ts
export interface TaxaNecessaria {
  /** %CDI necessário num CDB/RDB (tributado) para a renda mensal desejada. */
  tributadoPosCDI: Equivalente;
  /** %CDI necessário numa LCI/LCA (isenta) para a renda mensal desejada. */
  isentoPosCDI: Equivalente;
}

/**
 * Taxa necessária para que `principal` renda `rendaMensalDesejada` líquidos em 30 dias
 * corridos a partir de `hoje`, sacando só o rendimento (o principal nunca é reduzido).
 * Nunca lança: retorna `Equivalente` (mesmo tipo de equivalencia.ts) para cada regime.
 */
export function calcularTaxaNecessaria(
  principal: number, rendaMensalDesejada: number, hoje: DataISO, cen: Cenario,
): TaxaNecessaria;
```

Reaproveita `resolverPercentual` e `taxasDiariasCDI` (hoje privadas em `equivalencia.ts` — passam a
ser exportadas do módulo, ou movidas para um helper compartilhado, para não duplicar a bisseção).
`fatorAlvo = (principal + rendaMensalDesejada) / principal` no lado isento; no lado tributado,
`fatorAlvo` é ajustado pela alíquota do mesmo jeito que `fatorTributado()` já faz em
`equivalencia.ts` (`R = valorLiquido − V`, dividido por `(1 − aIOF) × (1 − aIR)` — o IOF de 30 dias
corridos já é zero pela tabela regressiva, mas a fórmula é reaproveitada tal qual, sem
reimplementar). Indisponível apenas se não houver dias úteis no período (não deveria acontecer numa
janela de 30 dias corridos) ou se a bisseção estourar o teto de busca (`PERCENTUAL_TETO_BUSCA`).

**Achado importante — carência legal da LCI/LCA:** `src/engine/regras/prazoMinimo.ts` diz que
LCI/LCA pós-CDI têm carência mínima de 6 meses; `validarAplicacao` lança se o resgate for antes
disso. Uma janela de 30 dias corridos SEMPRE viola essa carência. Por isso o lado `isentoPosCDI` de
`TaxaNecessaria` é uma **taxa de referência**: usa o mesmo mecanismo de `OpcoesSimulacao.
ignorarPrazoMinimo` que o gráfico já usa pra linha tracejada ("só para valores de referência...
nunca para um resgate de verdade"), sem chamar `validarAplicacao` com a checagem de carência. A UI
(seção 4) deixa explícito que essa é a taxa que a LCI precisaria ter — o saque de fato só é
possível depois dos 6 meses de carência.

## 3. Casamento com catálogo

Diferente dos outros 4 tipos (que casam com a *primeira* oferta compatível via
`primeiraCompativel`), aqui o casamento busca a **melhor** oferta de cada regime — maior
`percentualCDI` entre as ofertas pós-CDI do catálogo, separadas por `ehIsentoIR(produto)`.

Nova função, também em `src/engine/sugestao.ts` (`excedenteFGC` passa a ser exportada, para reaproveitar sem duplicar):

```ts
export type ResultadoRendaMensal =
  | { modo: 'UNICA'; fatia: Fatia }
  // 0 ou 1 fatia: 0 só se o catálogo estiver vazio nos dois regimes.
  | { modo: 'INSUFICIENTE'; fatias: Fatia[]; faltaMensal: number };

export function sugerirRendaMensal(
  o: Extract<Objetivo, { tipo: 'RENDA_MENSAL' }>, ctx: ContextoSugestao,
): ResultadoRendaMensal;
```

**Achado importante — por que não existe modo "diversificada":** o desenho original previa
misturar 50% na melhor tributada + 50% na melhor isenta quando nenhuma batesse a meta sozinha.
Isso é **matematicamente impossível de funcionar**: como o IR/IOF em `simular()` dependem só do
prazo (nunca do valor aplicado), o retorno líquido de qualquer oferta pós-CDI é linear no valor
investido. Misturar duas ofertas, em qualquer proporção, dá uma média ponderada dos dois retornos —
que nunca pode superar o maior dos dois. Ou seja: se nem a melhor tributada nem a melhor isenta
batem a meta sozinhas, **nenhuma** combinação das duas bate. Diversificar só ajudaria se os
produtos tivessem algum efeito não linear, o que não é o caso aqui (IR/IOF só dependem de dias).

Fluxo:
1. Calcula `taxaNecessaria` (seção 2).
2. Acha a melhor oferta tributada e a melhor isenta do catálogo (`ctx.catalogo`).
3. Se a melhor tributada tem `percentualCDI` ≥ `taxaNecessaria.tributadoPosCDI.taxa` **ou** a
   melhor isenta tem `percentualCDI` ≥ `taxaNecessaria.isentoPosCDI.taxa` → `modo: 'UNICA'`,
   fatia de 100% do principal na oferta que resolve com a taxa mais baixa entre as duas que
   resolveram (preferindo a isenta em empate, por não ter IR a considerar depois).
4. Se nenhuma resolve sozinha (mas existe ao menos uma oferta no catálogo, tributada ou isenta ou
   ambas) → simula 100% do principal em CADA oferta existente, usando `simular()` sobre os 30 dias
   corridos (a isenta com `{ ignorarPrazoMinimo: true }`, mesmo motivo da seção 2), e escolhe a que
   render mais de verdade — pela mesma linearidade da nota acima, colocar tudo na melhor das duas é
   sempre pelo menos tão bom quanto qualquer mistura entre elas. `modo: 'INSUFICIENTE'`, uma única
   fatia de 100% nessa oferta, mais `faltaMensal` (quanto falta em R$ até a meta, não só "não dá").
5. Catálogo vazio nos dois regimes → `modo: 'INSUFICIENTE'`, `fatias: []`, `faltaMensal` igual à
   renda mensal desejada inteira.

Cada `Fatia` usa `casarComCatalogo` (ou o equivalente já existente de checagem de FGC —
`excedenteFGC`) para preencher `fgc`, exatamente como os outros 4 tipos.

`MotivoFatia` ganha dois valores novos: `RENDA_MENSAL_TRIBUTADO`, `RENDA_MENSAL_ISENTO`.

### 3.1 `Cenario` chega até o motor

Diferente dos outros 4 tipos, `calcularTaxaNecessaria`/`sugerirRendaMensal` precisam de um
`Cenario` (CDI diário) — algo que `ContextoSugestao` hoje não carrega, e que nenhum dos outros
tipos de objetivo usa. Para não quebrar as 4 assinaturas/chamadas existentes, `sugerir()` ganha um
**3º parâmetro opcional**, `cen?: Cenario`, usado só no novo `case 'RENDA_MENSAL'` (lança um erro
comum, não `OfertaInvalidaError`, se ausente — é um erro de quem chama, não de dado do usuário). O
`Cenario` já existe hoje em `App.tsx` (`ativo.cenario`) e precisa ser passado adiante:
`App.tsx` → `<Objetivos cenario={ativo.cenario} ...>` → `<Sugestao cenario={cenario} ...>`.

## 4. UI

Novo formulário em `src/ui/objetivos/FormObjetivo.tsx`, 5ª aba de tipo, com dois campos:
**Principal (R$)** e **Renda mensal desejada (R$)**.

Em `src/ui/objetivos/Sugestao.tsx`, novo bloco de resultado para `RENDA_MENSAL`, acima da lista de
fatias já existente:
- Os dois %CDI necessários (tributado e isento) lado a lado — mesmo cartão comparativo visual já
  usado na calculadora de Equivalência (M1), reaproveitando o componente se possível. Abaixo do
  valor isento, uma nota fixa: "A LCI/LCA tem carência legal mínima de 6 meses — esse é o %CDI de
  referência; o saque mensal só é possível depois da carência."
- Se `modo === 'INSUFICIENTE'`: a fatia (a melhor que dá pra fazer sozinha, se houver alguma)
  seguida de um aviso com o `faltaMensal` em R$ e um `LinkLicao` para `'renda-variavel'` (mesmo
  padrão do `notaRendaVariavel` do M4b1) — nunca inventa uma 2ª fatia nem indica ativo específico.

Conteúdo textual novo (nomes de fatia, aviso de insuficiência) é rascunho nesta fase; passa pela
revisão editorial (/vozmax) antes do PR, no mesmo fluxo de todos os marcos anteriores.

## 5. Testes

- **Engine (`calcularTaxaNecessaria`):** caso feliz (taxa disponível nos dois regimes, batendo com
  conta de referência manual); alíquota de 30 dias aplicada corretamente do lado tributado;
  indisponibilidade se a bisseção estourar o teto de busca (renda mensal desproporcional ao
  principal, ex. querer 100% de rendimento em 30 dias).
- **Engine (`sugerirRendaMensal`):** melhor oferta isolada resolve (tributada e isento cada um em
  separado, com o critério de desempate isenta-em-empate); nenhuma isolada resolve → escolhe a que
  rende mais de verdade entre as duas, 100% do principal (`INSUFICIENTE` com `faltaMensal`
  correto); só existe oferta num dos regimes; catálogo totalmente vazio (`INSUFICIENTE`,
  `fatias: []`).
- **Conteúdo:** `MotivoFatia` novos têm texto mapeado (mesmo teste de integridade que já cobre os
  motivos existentes); o aviso de `INSUFICIENTE` linka para `'renda-variavel'`.
- **UI:** formulário valida os dois campos (`OfertaInvalidaError` vira mensagem exibida, mesmo
  padrão dos outros 4 tipos); os dois `modo` renderizam o que deveriam (fatia única, fatia única +
  aviso de insuficiência).

## 6. Marco e fluxo

Branch `m5-renda-mensal`, a partir da `main` atualizada (já com o M4b2a mergeado). TDD estrito,
revisão de código, revisão editorial dos textos novos, PR com auto-fix ligado — o mesmo fluxo de
todos os marcos anteriores.

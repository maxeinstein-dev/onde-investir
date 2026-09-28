# M3b: Gráficos e alertas que ensinam (plano de implementação)

> **Para o Claude:** use `subagent-driven-development`. **TDD estrito.**

**Objetivo:** o comparador ganha dois gráficos e os alertas da spec §5.6.
- O primeiro gráfico mostra o valor líquido ao longo do tempo para cada oferta, com as **trocas de líder anotadas** e os degraus do IR visíveis.
- O segundo mostra a diferença entre duas ofertas escolhidas.
- Cada alerta explica o que acontece, por quê, e aponta para o termo do glossário.

**Spec:** `docs/superpowers/specs/2026-09-27-onde-investir-design.md`, §5.4 (item 3, gráficos) e §5.6 (alertas).
O alerta de FGC fica para o M3a, porque depende do valor por oferta.

**Branch:** `m3b`, a partir da `main` depois do merge do PR #6.

**Convenções:** as de sempre.
- Commits em português, sem assinatura de IA.
- Sem `style=` inline.
- Testes sem rede.
- Invalidação derivada na renderização.
- Ids com prefixo.
- O engine continua puro.

---

## Lote A: engine (puro, testável)

### A1. Série temporal (`src/engine/serie.ts`)

```ts
export interface PontoSerie { data: DataISO; liquido: number | null; resgatavel: boolean }
export interface Serie { ofertaIndice: number; pontos: PontoSerie[] }
export function datasDaSerie(dataAplicacao: DataISO, fim: DataISO, ofertas: readonly OfertaCadastrada[]): DataISO[];
export function seriesDeValorLiquido(ofertas, valor, dataAplicacao, fim, cen, regra): Serie[];
```

**Datas (`datasDaSerie`):**
- a cada 7 dias corridos a partir da aplicação;
- as datas-limite do IR (aplicação + 180, 181, 360, 361, 720 e 721 dias), incluindo as das reaplicações depois de cada vencimento;
- os vencimentos, e o dia seguinte a cada vencimento;
- o fim;
- tudo ordenado, sem duplicatas e dentro de (aplicação, fim].

**Valores (`seriesDeValorLiquido`):** em cada data, chame `projetar`.
- DISPONIVEL → `{ liquido, resgatavel: true }`.
- INDISPONIVEL ou MARCACAO_A_MERCADO → o valor **de referência** para desenhar a linha tracejada: simule como se desse para resgatar (`simular` direto, ignorando liquidez e marcação) e marque `resgatavel: false`. Se nem isso for possível (datas antes do prazo mínimo legal de LCI/LCA), use `liquido: null`.

**Testes:**
- as datas de IR aparecem na lista;
- uma LCI "só no vencimento" tem `resgatavel: false` antes do vencimento e `true` no vencimento;
- degrau do IR: o líquido do CDB no dia 181 é maior que no dia 180 por mais do que um dia de rendimento, porque a alíquota cai de 22,5% para 20%;
- desempenho: 5 ofertas × 5 anos < 300 ms com o cenário projetado real (`tests/engine/cenarioReal.ts`).

### A2. Trocas de líder (`src/engine/serie.ts`)

```ts
export interface TrocaDeLider { data: DataISO; de: number[]; para: number[] }
export function trocasDeLider(series: readonly Serie[]): TrocaDeLider[];
```

- O líder em cada data é quem tem o maior líquido **resgatável**, comparado em centavos, com empate tratado.
- Registra cada data em que o conjunto de líderes muda.
- Para a data exata dentro da semana: quando houver troca entre dois pontos, faça uma busca binária por dia entre eles, chamando `projetar` para os envolvidos. Isso é aceitável porque as trocas são poucas.
- Testes:
  - CDB 103% contra LCI 80% "só no vencimento" em 2 anos: a LCI nunca lidera antes de vencer;
  - um caso com troca conhecida (prefixado contra pós no cenário projetado), em que a data sai exata pela busca binária e o teste confere com `projetar` no dia anterior e no dia seguinte;
  - sem ofertas resgatáveis → nenhuma troca.

### A3. Alertas (`src/engine/alertas.ts`)

```ts
export type Alerta =
  | { tipo: 'QUASE_EMPATE'; horizonte: DataISO; lider: number; alternativa: number; diferenca: number; diferencaPercentual: number; vantagem: 'LIQUIDEZ' | 'GARANTIA' }
  | { tipo: 'IR_REINICIA'; oferta: number; data: DataISO; aliquotaNova: number; aliquotaSemReaplicar: number }
  | { tipo: 'IOF'; oferta: number; horizonte: DataISO; iof: number }
  | { tipo: 'PRAZO_INCOMPATIVEL'; oferta: number; horizonte: DataISO; disponivelEm?: DataISO };
export const LIMIAR_QUASE_EMPATE = 0.005;
export function gerarAlertas(ofertas, colunas: readonly ColunaHorizonte[], limiar = LIMIAR_QUASE_EMPATE): Alerta[];
```

- **QUASE_EMPATE:** o líder e outra oferta disponível ficam a menos de `limiar` de diferença, e a outra tem liquidez diária enquanto o líder não tem, ou tem garantia do Tesouro enquanto o líder tem FGC.
- **IR_REINICIA:** a projeção tem reinvestimento com etapa tributada, e a alíquota da etapa 2 é maior que a alíquota que valeria sem reaplicar (dias totais desde a aplicação).
- **IOF:** a etapa final tem `iof > 0`.
- **PRAZO_INCOMPATIVEL:** a projeção é INDISPONIVEL no horizonte escolhido pelo usuário ("sua data") ou no mais distante.
- **Sem duplicatas:** um alerta por (tipo, oferta), sempre no horizonte mais relevante, que é o mais distante.
- Testes para cada tipo, inclusive os casos negativos (acima do limiar não gera alerta; liquidez igual não gera alerta).

## Lote B: conteúdo

### B1. Textos dos alertas e do gráfico (`src/conteudo/alertas.ts`, `src/conteudo/serie.ts`)

```ts
export interface TextoAlerta { titulo: string; oQue: string; porQue: string; termo: IdTermo }
export function textoDoAlerta(a: Alerta, ofertas): TextoAlerta;
export function resumirTrocas(trocas, ofertas): string[]; // resumo acessível do gráfico
```

Exemplos de rascunho, que passam pela revisão editorial no C4:
- **QUASE_EMPATE:** título "Diferença pequena, liquidez maior"; o que acontece: "{B} rende só {R$} ({%}) a menos que {A} em {prazo} e deixa resgatar quando quiser"; por quê: "Dinheiro que pode sair a qualquer momento vale mais quando o plano pode mudar"; termo `liquidez`.
- **IR_REINICIA:** "Na reaplicação de {X} em {data}, o IR volta para {aliq}. Sem reaplicar, seria {aliq2}." Termo `ir-regressivo`.
- **IOF:** "Resgate antes de 30 dias: {X} paga {R$} de IOF." Termo `iof`.
- **PRAZO_INCOMPATIVEL:** "{X} não pode ser resgatado em {prazo}" + "Só no vencimento (dd/mm)" ou "Prazo mínimo até dd/mm". Termo `liquidez` ou `prazo-minimo`.
- **Resumo das trocas:**
  - "Até {data}, {A} lidera. A partir de {data}, {B} passa a liderar."
  - Sem trocas: "{A} lidera o tempo todo."

Testes com regex tolerante a NBSP.

## Lote C: UI

### C1. Chart.js empacotado

- Execute `npm i chart.js chartjs-plugin-annotation`.
- Registre só os componentes usados (tree-shaking): `LineController`, `LineElement`, `PointElement`, `LinearScale`, `TimeScale` ou uma escala categórica com rótulos de data (prefira `LinearScale` com epoch-dias e formatter próprio, para não depender de adaptador de datas), `Tooltip`, `Legend` e `Filler`, mais o plugin de anotação.
- **CSP:**
  - Chart.js não usa eval.
  - Confira no build que não há `new Function`.
  - O canvas não usa estilos inline no DOM. O Chart.js aplica `style` no canvas **via JS (CSSOM)**, e isso é permitido pela CSP, que bloqueia só o atributo `style` no HTML e estilos injetados em `<style>`. Confirme no navegador com a CSP de produção (`vite preview` com um servidor que aplique o `_headers`, ou teste no preview do Pages).
  - Se alguma coisa violar a CSP, relate antes de afrouxá-la.
- Cores: tokens CSS em `:root`, lidos via `getComputedStyle`, com uma paleta acessível de 5 cores de contraste suficiente e distinguíveis também pelo tracejado.

### C2. `GraficoValorLiquido.tsx`

- **Props:** `series`, `trocas`, `ofertas` e `inicioPremissa` (anota a faixa em que a projeção vira premissa).
- **Desenho:**
  - Uma linha por oferta, com as letras A a E na legenda.
  - Trechos com `resgatavel: false` ficam tracejados (`segment.borderDash`).
  - Anotações verticais nas trocas de líder ("{B} passa a liderar").
  - Uma área sombreada depois de `inicioPremissa`, com o rótulo "premissa".
- **Tooltip:** data, líquido de cada oferta e, quando não resgatável, "(só no vencimento)" ou "(prazo mínimo)".
- **Acessibilidade:**
  - `<figure>` com `<figcaption>`.
  - O canvas tem `role="img"` e `aria-label` com o resumo de `resumirTrocas`.
  - O resumo também aparece em texto visível abaixo do gráfico.
- **Teste:** no jsdom não há canvas. Crie um *mock* de `chart.js` com `vi.mock` que capture a configuração passada. Teste a configuração: datasets, `borderDash` nos trechos não resgatáveis, anotações nas datas das trocas, a faixa de premissa e o `aria-label`. Não teste pixels.
- **Destruição:** destrua o chart ao desmontar e ao trocar os dados, sem vazamento. Teste que `destroy` é chamado.

### C3. `GraficoDiferenca.tsx`

- Seletores "Comparar {A} com {B}", cada um com a lista das ofertas da comparação.
- Linha da diferença A − B ao longo do tempo, com o zero destacado e anotações onde o sinal troca.
- Resumo em texto: "{A} fica à frente até dd/mm; depois {B}."
- Os testes seguem o padrão do C2.

### C4. Alertas no comparador (`src/ui/comparacao/Alertas.tsx`)

- Os alertas aparecem logo abaixo da tabela, antes do "Por que lidera".
- Cada alerta é um cartão com título, o que acontece, o porquê e "Saiba mais" (`Termo`).
- A lista usa `role="list"`, e um alerta não recebe o foco sozinho.
- Os gráficos entram entre a tabela e a linha do tempo, dentro de `<details open>` com o título "Gráficos". No celular, o gráfico ocupa 100% da largura, com altura fixa responsiva e sem rolagem horizontal.
- Testes de integração no `Comparador.test.tsx`:
  - com um caso de quase empate e liquidez, o alerta aparece;
  - o gráfico (mockado) recebe as séries;
  - editar invalida.

### C5. Revisão editorial (portão humano)

Os textos novos (alertas, resumo e rótulos dos gráficos) passam pelo /vozmax e pela aprovação do usuário.

### C6. Verificação e PR

1. `lint`, `typecheck`, `test` e `build` verdes. Compare o tamanho do bundle com o anterior.
2. No navegador, com a **CSP de produção**, não pode haver violação.
3. Com 3 a 5 ofertas, o gráfico mostra as trocas e o tracejado; em 375 px, sem rolagem da página.
4. Revisão de código.
5. PR, com o ok do usuário.

# M3a: Carteira, histórico real e FGC (plano de implementação)

> **Para o Claude:** use `subagent-driven-development`. **TDD estrito.** Ao abrir o PR, ligue o auto-fix.

**Objetivo:** o usuário cadastra as **posições que já tem**. O app calcula o valor atual de
cada uma pelo **histórico real** do Banco Central (CDI, Selic, IPCA, TR). Se o usuário
informar o valor do extrato, o app confere com o calculado. O app mostra a **exposição ao
FGC por conglomerado** e o **teto global**. Na comparação, cada oferta ganha o alerta
"se aplicar o valor da comparação aqui, junto com o que você já tem nesse conglomerado,
o total passa de R$ 250 mil no vencimento". As ofertas ganham **custo extra** (% a.a.).

**Spec:** §3.4 (FGC), §4.3 (histórico), §5.3 (posições), §5.2 (custo extra), §5.6 (alerta do FGC).
Decisões de 2026-09-28:
- O alerta do FGC usa o **valor da comparação somado à carteira**. Não existe valor por oferta.
- O valor atual sai do **histórico real, com o extrato opcional**.

**Branch:** `m3a`, a partir da `main` atualizada.

**Convenções:** as de sempre (português, sem assinatura de IA, sem `style=` inline, testes
sem rede, invalidação derivada, ids com prefixo, engine puro, zod via `src/zod.ts`).

---

## Lote A: engine

### A1. Cenário com histórico (`src/engine/historico.ts`)

```ts
export interface SeriesRealizadas {
  cdiDiario: ReadonlyMap<DataISO, number>;     // % a.d. da série 12, como fração ao dia (0.0005)
  selicOverDiaria: ReadonlyMap<DataISO, number>;
  ipcaMensal: ReadonlyMap<string, number>;     // AAAA-MM → fração ao mês
  trPorInicio: ReadonlyMap<DataISO, number>;   // TR do período iniciado na data (fração a.m.)
  ultimaData: DataISO;                          // último dia com CDI realizado
}
export function cenarioComHistorico(realizado: SeriesRealizadas, futuro: Cenario): Cenario;
```

- Para datas até `ultimaData`, usa o valor realizado. A taxa diária do SGS vira AA por
  `(1 + d)^252 − 1`, para caber na interface `Cenario`. O `fatorPercentualCDI` desfaz a
  conversão (`taxaDiaria`), então a ida e volta precisa ser exata: faça um teste com
  tolerância 1e-15.
- Selic meta no passado: não há série diária no `SeriesRealizadas`, então use
  `futuro.selicMetaAA`. A poupança do passado usa TR realizada e Selic meta; acrescente
  a série 432 (meta) ao histórico se for necessário, e registre a decisão.
- IPCA de meses realizados: `(1 + mensal)^12 − 1`. Meses sem dado caem no futuro.
- Testes:
  - um CDB 100% do CDI num período totalmente realizado dá exatamente ∏(1 + d);
  - um período que cruza `ultimaData` emenda realizado e projetado;
  - IPCA de um mês realizado bate com o fator mensal.

### A2. Posições (`src/engine/posicoes.ts`)

```ts
export interface Posicao extends OfertaCadastrada {
  valorAplicado: number;
  dataAplicacao: DataISO;
  valorExtrato?: number;
  dataExtrato?: DataISO;
  eventos: readonly { tipo: 'APORTE' | 'RESGATE'; data: DataISO; valor: number }[]; // M3a: sempre []
}
export function validarPosicao(p: Posicao, hoje: DataISO): void;
export interface ValorAtual { data: DataISO; bruto: number; liquido: number; extrato?: { valor: number; data: DataISO; diferencaPercentual: number; suspeita: boolean } }
export function valorAtual(p: Posicao, data: DataISO, cen: Cenario): ValorAtual;
```

- `validarPosicao`:
  - `valorAplicado > 0`;
  - `dataAplicacao ≤ hoje`;
  - datas válidas;
  - extrato com data entre a aplicação e hoje;
  - as mesmas regras de `validarOfertaCadastrada`, exceto o prazo mínimo, porque a
    posição já existe;
  - `eventos` vazio no M3a.
- `simular` ganha a opção `{ ignorarPrazoMinimo?: boolean }`, usada por posições. Teste que
  sem a opção nada muda.
- Poupança e Tesouro seguem as regras que já existem.
- **Conferência do extrato:** calcule o bruto na `dataExtrato`. `diferencaPercentual` =
  (extrato − calculado) / calculado. `suspeita` quando |dif| > 1%, com o limiar numa
  constante.
  - O extrato do banco costuma mostrar o **bruto**. Documente essa premissa e deixe o
    usuário escolher "bruto ou líquido" no formulário, com padrão bruto.
- **Posição vencida:** `valorAtual` depois do vencimento devolve o valor no vencimento,
  com uma flag `vencida: true`.
- Testes: validação, extrato coerente, extrato suspeito, poupança, Tesouro Selic, vencida.

### A3. FGC (`src/engine/fgc.ts`, usando `regras/fgc.ts`, que já existe)

```ts
export interface ItemFGC { conglomerado: string; produto: TipoProduto; brutoEm(data: DataISO): number }
export function coberto(produto: TipoProduto): boolean;  // CDB, RDB, LC, LCI, LCA, POUPANCA
export function exposicao(itens: readonly ItemFGC[], data: DataISO): { porConglomerado: Map<string, number>; totalCoberto: number };
export interface AlertaFGC { conglomerado: string; data: DataISO; total: number; limite: number; excedente: number }
export function primeiraDataAcimaDoLimite(itens, datas: readonly DataISO[]): AlertaFGC[];
export function tetoGlobalExcedido(itens, data): { total: number; teto: number } | null;
```

- Normalize o conglomerado sem acento, sem caixa e sem espaços extras antes de comparar.
  Teste "Banco X" == "banco  x".
- O Tesouro não entra (`coberto` = false).
- **Primeira data acima do limite:** entre as datas dadas (hoje, vencimentos e horizontes),
  pegue a primeira em que o total do conglomerado passa do limite, porque os rendimentos
  contam. Faça busca por dia entre o último ponto abaixo e o primeiro acima, como nas
  trocas do M3b.
- Testes:
  - dois CDBs do mesmo conglomerado, que somados passam do limite só com os rendimentos;
  - conglomerados diferentes não somam;
  - o Tesouro fica de fora;
  - o teto global.

### A4. Custo extra (`src/engine/produtos.ts`, `src/engine/ofertas.ts`)

- `Oferta` ganha `custoExtraAA?: number`, em fração e entre 0 e 0,05.
- `simular`: `custoExtra = valorBruto × (1 − (1 − c)^(dc/365))`, descontado **depois** do IR.
  É uma premissa conservadora, porque tarifa de corretora não reduz a base do IR.
  Documente e crie o passo `custoExtra` na memória de cálculo, somente quando c > 0.
- Validação: o custo precisa ser finito e estar entre 0 e 5%.
- A equivalência continua ignorando o custo da origem? **Não.** A origem usa o custo dela,
  e os equivalentes são calculados sem custo. Teste.
- Testes:
  - custo 0 não muda nada: todos os testes antigos passam;
  - custo de 0,5% a.a. em 1 ano ≈ 0,5% do bruto;
  - a memória de cálculo fecha.

### A5. Alerta do FGC na comparação (`src/engine/alertas.ts`)

- `gerarAlertas` ganha `contextoFGC?: { carteira: readonly ItemFGC[]; valor: number; dataAplicacao: DataISO; cen: Cenario }`.
- Para cada oferta coberta, some a carteira do mesmo conglomerado com a oferta aplicada
  pelo valor da comparação. Os itens da carteira seguem por `brutoEm`, e a oferta segue
  pelo bruto do `simular` dela até o vencimento, ou até o horizonte mais distante se não
  tiver vencimento.
- Novo tipo: `FGC_LIMITE { oferta; conglomerado; data; total; limite; excedente }`.
- Testes:
  - a carteira sozinha abaixo do limite e a carteira mais a oferta acima;
  - Tesouro não gera o alerta;
  - outro conglomerado não gera o alerta.

## Lote B: dados

### B1. Histórico do SGS (`src/dados/historico.ts`)

- `carregarHistorico({ buscar, armazenamento, agoraMs, desde: DataISO })` → `SeriesRealizadas | null`, junto com o status.
- Séries buscadas: 12 (CDI), 11 (Selic over), 433 (IPCA), 226 (TR) e, se o A1 precisar,
  432 (meta). Faça a busca por **ano civil**:
  `.../bcdata.sgs.{c}/dados?formato=json&dataInicial=01/01/AAAA&dataFinal=31/12/AAAA`.
- **Cache por série e por ano:**
  - ano passado (completo): **permanente**, sem validade;
  - ano corrente: `validadeDiaria`;
  - chave: `hist:{serie}:{ano}`.
- Não repita chamadas: só busque os anos que faltam ou que estão vencidos, uma requisição
  por série e ano. Limite: no máximo 10 anos para trás. Aplicações mais antigas ganham um
  aviso e usam o cenário no começo do período.
- Falha de rede: use o cache que houver. O que faltar vira `null`, e a UI avisa "valor
  calculado sem histórico completo".
- **Fixtures:** capture UMA vez `sgs-12-2025.json`, `sgs-11-2025.json`, `sgs-433-2025.json`
  e `sgs-226-2025.json` (ano inteiro), e as de 2026 até hoje. Sem repetir requisições.
- A CSP não muda: tudo vem de `api.bcb.gov.br`.
- Testes:
  - primeira carga busca os anos necessários;
  - a segunda carga não faz nenhuma chamada para os anos passados;
  - o ano corrente vencido refaz só o ano corrente;
  - rede fora → usa o cache;
  - 11 anos atrás → limitado com aviso.

### B2. Armazenamento das posições (`src/armazenamento/posicoes.ts`)

- Chave `rende:posicoes:v1`, esquema zod estrito, limite de 50 posições.
- A exportação passa para a v2, `{ versao: 2, ofertas, posicoes }`. A importação aceita a
  v1 (só ofertas) e a v2.
- Na importação, as posições recebem ids novos. As posições **nunca** entram no link
  compartilhável (M3c): deixe um teste que falha se algum serializador de link incluir
  `posicoes`, quando o link existir.
- Testes: ida e volta, v1 → v2, limites, campo extra.

## Lote C: interface

### C1. Aba "Carteira" (`src/ui/carteira/`)

- A aba **"Carteira"** fica em `#carteira`, depois de Comparar e Catálogo.
- **Lista de posições:**
  - nome, conglomerado, aplicado em e o valor atual calculado (bruto e líquido de hoje);
  - quando houver extrato: o valor do extrato, a diferença e, se for suspeita, o aviso
    "A diferença passa de 1%. Confira a taxa e a data digitadas.";
  - posição vencida: "Venceu em dd/mm/aaaa".
- **Formulário:** reaproveite o `FormOfertaCadastrada` e acrescente:
  - valor aplicado e data da aplicação (até hoje);
  - valor do extrato (opcional), com a data e "bruto/líquido".
- **Total da carteira:** bruto e líquido.
- **Exposição ao FGC:**
  - por conglomerado, uma barra (elemento `meter` ou barra CSS com `aria-valuenow`) até
    R$ 250 mil;
  - em cada conglomerado, o valor hoje e "no vencimento mais distante";
  - o **alerta quando passa**, com a data;
  - o teto global;
  - o Tesouro aparece à parte, como "Tesouro Nacional (sem limite do FGC)".
- Enquanto o histórico carrega: "Buscando o histórico do Banco Central…"
  (`aria-live` permanente).
- Invalidação e foco seguem os padrões do M2.
- Testes com as fixtures do B1 e `fetch` falso.

### C2. Comparação

- Alerta `FGC_LIMITE` no bloco de alertas, com o texto e o termo `fgc`.
- Linha nova na tabela: **"Custo extra"**, mostrada só se alguma oferta tiver custo.
- Campo "Custo extra (% ao ano, opcional)" no formulário de oferta, com a explicação
  curta "Tarifa cobrada pela corretora, se houver. Na renda fixa bancária costuma ser zero."
- Testes.

### C3. Conteúdo

- Textos novos: carteira, FGC e custo extra.
- Glossário: `conglomerado` e `teto-global-fgc`, com a fonte do regulamento do FGC.
- **Portão humano:** /vozmax + aprovação do usuário.

### C4. Conferência com a Calculadora do Cidadão (manual)

- O usuário (ou o orquestrador, pelo navegador) simula na
  [Calculadora do Cidadão do BCB](https://www3.bcb.gov.br/CALCIDADAO/publico/exibirFormCorrecaoValores.do?method=exibirFormCorrecaoValores)
  a correção pelo CDI de R$ 10.000 aplicados em 02/01/2025 até 01/09/2026, a 100%.
- Compare com `valorAtual` de uma posição CDB 100% do CDI com as mesmas datas (bruto).
  A meta é uma diferença abaixo de R$ 0,01 por R$ 10 mil.
- Registre o resultado no PR. Se divergir, investigue a convenção antes de ajustar
  qualquer coisa, e verifique se a diferença vem do arredondamento da B3 citado no M1.

### C5. Verificação e PR

- `lint`, `typecheck`, `test` e `build` verdes.
- No navegador:
  - cadastrar 3 posições (uma com extrato);
  - ver a exposição ao FGC;
  - comparar uma oferta do mesmo conglomerado e ver o alerta;
  - largura de 375 px sem rolagem da página.
- Revisão de código.
- PR com **auto-fix ligado**.

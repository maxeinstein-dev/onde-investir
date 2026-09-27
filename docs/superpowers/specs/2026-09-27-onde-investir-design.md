# Onde Investir — Design / Spec

- **Data:** 2026-09-27 (revisada após sessão de grill no mesmo dia)
- **Repositório:** `github.com/maxeinstein-dev/onde-investir`
- **URL de produção:** `https://rende.maxsueleinstein.dev`
- **Status:** design aprovado e refinado; pronto para o plano de implementação

## 1. Objetivo

Calculadora pessoal e gratuita com **dois pilares de igual peso**:

1. **Comparar** onde aplicar um valor pelo **valor líquido** (após IR, IOF e custos),
   considerando prazos, liquidez e garantia (FGC), com indicadores em tempo real.
2. **Ensinar** sobre investimentos: cada resultado explica o porquê, e o uso frequente
   deve deixar o usuário capaz de decidir sozinho.

Exemplo-guia: *CDB 103% do CDI vs LCI 80% do CDI — qual rende mais, em quais prazos, e por quê?*

### Restrições

- **Custo zero:** apenas APIs e hospedagem gratuitas.
- **Pessoa física.** Uso pessoal e de poucos amigos; **site aberto, sem login**.
- **Caráter educativo:** sugestões de carteira são genéricas, baseadas em regras
  explícitas e visíveis; não são recomendação personalizada. O app exibe esse aviso.

### Marcos de entrega

Cada marco é utilizável e publicado. Fluxo: uma branch por marco → Pull Request →
URL de preview do Cloudflare Pages → merge na `main` (produção). Testes no GitHub
Actions bloqueiam o merge se falharem.

| Marco | Escopo |
|---|---|
| **M1** | Setup (Vite, Vitest, CI, Pages + domínio) · motor de cálculo com TDD · **Equivalência rápida** · educação nível 1: "Por que esse resultado?", "Palpite antes de ver", termos com explicação |
| **M2** | Indicadores ao vivo e cenários (Focus anual, Copom, IPCA mensal) · ofertas · comparação por horizonte · linha do tempo de vencimentos com reinvestimento |
| **M3** | Gráficos com cruzamentos · alertas que ensinam · posições + FGC · link compartilhável · educação nível 2: trilha, casos clássicos, progresso |
| **M4** | Proxy brapi (Turnstile, cache, cota, KV) · página /status · sugestão por objetivo · renda variável |

Fora do escopo por ora: CRI/CRA/debêntures, fundos (come-cotas), títulos do Tesouro
**com cupom** (IPCA+ com juros semestrais, Prefixado com juros semestrais, Renda+,
Educa+), estimativa de marcação a mercado, pessoa jurídica, login/sincronização,
acompanhamento contínuo da carteira (o modelo de dados já nasce preparado — ver 5.3).

## 2. Arquitetura

- **Front-end estático:** Vite + TypeScript + Preact, no **Cloudflare Pages**.
- **Pages Functions** (só a partir do M4): proxy da brapi e verificação do Turnstile.
- **APIs do Banco Central chamadas direto do navegador** (CORS verificado em
  2026-09-27: SGS `*`, Olinda/Focus libera a origem, BrasilAPI `*`).
- **Testes:** Vitest. TDD estrito em `src/engine/`, na validação de entradas e na lógica
  de cache/cota.

```
onde-investir/
├── functions/api/                   ← M4: brapi proxy, sessão Turnstile, status
├── public/_headers                  ← cabeçalhos de segurança (CSP etc.)
├── src/
│   ├── engine/                      ← TypeScript puro, sem UI, sem rede, sem storage
│   │   ├── calendario.ts            ← dias úteis ANBIMA e pregões B3
│   │   ├── regras/                  ← regras como dados versionados por vigência
│   │   ├── indexadores.ts           ← evolução diária de CDI/Selic/IPCA/TR por cenário
│   │   ├── produtos.ts              ← cálculo por produto, devolve resultado + passos
│   │   ├── comparador.ts            ← horizontes, linha do tempo, reinvestimento, cruzamentos
│   │   ├── equivalencia.ts          ← taxa equivalente entre produtos
│   │   ├── fgc.ts                   ← exposição por conglomerado ao longo do tempo
│   │   └── alertas.ts               ← alertas com vínculo a lições
│   ├── esquemas/                    ← zod: ofertas, posições, cenários, import, link, APIs
│   ├── dados/                       ← clientes SGS, Focus, BrasilAPI, /api + cache
│   ├── conteudo/                    ← lições, dicas, casos, glossário (dados, não código)
│   ├── ui/                          ← componentes Preact + Chart.js
│   └── armazenamento.ts             ← localStorage + exportar/importar JSON
└── tests/
```

**Princípio:** o `engine/` recebe dados (ofertas, cenário, regras, calendário) e devolve
resultados **com a memória de cálculo** (lista de passos). Não chama rede nem lê
armazenamento; tudo nele é testável de forma determinística.

## 3. Regras de negócio

### 3.1 Regras como dados versionados

`src/engine/regras/` contém cada regra com `vigenciaInicio`, `vigenciaFim?`, `fonte`
(URL) e `criterio` (data de aplicação, de emissão ou do fato gerador). Regra sem versão
vigente para a data → erro explícito, nunca fallback silencioso.

**Situação verificada em 2026-09-27** (pesquisa com fontes oficiais; registrar as URLs
no arquivo de regras):

| Regra | Vigente | Fonte principal |
|---|---|---|
| IR LCI/LCA PF | **Isentas.** MP 1303/2025 caducou em 08/10/2025 sem conversão | InfoMoney / B3 Bora Investir |
| Tabela regressiva IR | 22,5 / 20 / 17,5 / 15% — Lei 11.033/2004, sem mudança | Lei 11.033/2004 |
| IOF regressivo | Tabela do Decreto 6.306/2007, sem mudança para renda fixa PF | Decreto 6.306/2007 |
| Prazo mínimo LCI/LCA (emitidas a partir de 23/05/2025, Res. CMN 5.215/2025) | Pós/pré: **6 meses** · LCI-IPCA: **36 meses** · LCA-IPCA: **12 meses** | Comunicado B3 CE 016/2025-VPC |
| Prazo mínimo LCI/LCA anteriores | Versões de 2024 (Res. CMN 5.118/2024: LCA 9m, LCI 12m) e fev/2025 (LCI 9m) | Res. CMN 5.118/2024 |
| Custódia B3 Tesouro | 0,20% a.a., provisionada diariamente, **descontada só em resgate/vencimento/cupom**, proporcional (desde 31/12/2024). **Tesouro Selic isento até R$ 10.000** por CPF (soma das posições Selic); taxa só sobre o excedente | Tarifas B3 |
| FGC | R$ 250 mil por CPF por instituição/conglomerado; teto R$ 1 milhão a cada 4 anos | fgc.org.br |
| Poupança | Selic meta > 8,5%: 0,5% a.m. + TR; senão 70% da Selic meta + TR (Lei 12.703/2012) | BCB |

Pontos com confiança média, a conferir no texto da norma durante a implementação:
prazos LCI/LCA atrelados a IPCA (36/12 meses) e hipóteses de resgate antecipado.

### 3.2 Tributos

- **IR regressivo** sobre o rendimento: até 180 dias 22,5% · 181–360 20% ·
  361–720 17,5% · acima de 720 15%. Prazo em dias corridos.
- **IOF regressivo** em resgates com menos de 30 dias corridos, sobre o rendimento,
  **calculado antes do IR** (IR incide sobre rendimento − IOF): dia 1 = 96%, 2 = 93%,
  3 = 90%, 4 = 86%, 5 = 83%, 6 = 80%, 7 = 76%, 8 = 73%, 9 = 70%, 10 = 66%, 11 = 63%,
  12 = 60%, 13 = 56%, 14 = 53%, 15 = 50%, 16 = 46%, 17 = 43%, 18 = 40%, 19 = 36%,
  20 = 33%, 21 = 30%, 22 = 26%, 23 = 23%, 24 = 20%, 25 = 16%, 26 = 13%, 27 = 10%,
  28 = 6%, 29 = 3%, 30+ = 0%.
- **Isentos de IR (PF):** LCI, LCA, poupança.

### 3.3 Produtos

| Produto | Rendimento | IR | Garantia | Liquidez |
|---|---|---|---|---|
| CDB / RDB / LC pós | % do CDI, capitalização diária em dias úteis (base 252) | Regressivo | FGC | Diária ou no vencimento |
| LCI / LCA pós | % do CDI | Isento | FGC | Prazo mínimo legal (3.1) + vencimento |
| Prefixado (CDB, LCI, LCA, Tesouro Prefixado sem cupom) | Taxa a.a. base 252 | Conforme produto | Conforme emissor | Conforme produto |
| IPCA+ (CDB, LCI, LCA, Tesouro IPCA+ sem cupom) | IPCA projetado + taxa real a.a. | Conforme produto | Conforme emissor | Conforme produto |
| Tesouro Selic | Selic diária (+ ágio/deságio opcional) | Regressivo | Tesouro Nacional | D+0/D+1 |
| Poupança | Regra de 3.1 | Isenta | FGC | Diária, rendimento só no aniversário mensal |

Detalhes:
- **% do CDI:** fator diário `(1 + CDI_aa)^(1/252) − 1` × percentual, acumulado por
  dia útil (padrão B3).
- **IPCA+:** IPCA mensal projetado do cenário, pró-rata em dias úteis. Cada dia útil do
  mês civil rende `(1 + IPCA_aa)^(1 / (12 × DU_do_mês))`: um mês inteiro rende
  `(1 + IPCA_aa)^(1/12)` e um ano civil inteiro rende `1 + IPCA_aa`. O juro real segue
  `(1 + taxa real)^(DU/252)`.
- **Poupança:** depósitos nos dias 29, 30 e 31 fazem aniversário no dia 1º. Resgate
  antes do aniversário perde o mês incompleto.
- **Tesouro:** custódia conforme 3.1. Resgate antes do vencimento (exceto Selic) =
  **"sujeito a marcação a mercado"**, sem estimativa de valor. No M1, a data de resgate
  de Tesouro Prefixado/IPCA+ é tratada como vencimento.
- **Prazo mínimo LCI/LCA:** o app **sugere o mínimo legal** pelo tipo, indexador e data
  de emissão (padrão: data de aplicação). O usuário pode aumentar, nunca reduzir
  abaixo do mínimo.
- **Custo extra opcional** por oferta (% a.a. ou valor fixo).
- **Precisão:** dupla precisão com fator acumulado; arredondamento **só na exibição**.
  Tolerância de teste: R$ 0,01 por R$ 10.000 aplicados vs simuladores oficiais.

### 3.4 FGC

- Cobertos: CDB, RDB, LC, LCI, LCA, poupança. Tesouro: selo "Tesouro Nacional".
  Outros: "Sem garantia".
- Limite por conglomerado conta **principal + rendimentos**. O `engine/fgc.ts` soma o
  valor bruto projetado de **ofertas e posições atuais** do mesmo conglomerado em cada
  data e aponta a primeira data em que excede.
- Teto global: alerta informativo.
- `conglomerado` é obrigatório em ofertas e posições (texto livre com autocompletar).

### 3.5 Calendário

- **Dias úteis ANBIMA:** fins de semana + feriados nacionais fixos + móveis (Carnaval
  seg/ter, Sexta-feira Santa, Corpus Christi, pela Páscoa), com 20/11 a partir de 2024.
- **Pregões B3:** calendário ANBIMA + exceções da B3 (ex.: 24/12, 31/12), como dado
  versionado.

## 4. Indicadores e cenários

| Dado | Fonte | Recurso |
|---|---|---|
| CDI diário | SGS | série 12 (% a.d.) |
| Selic diária | SGS | série 11 |
| Selic meta | SGS | série 432 |
| IPCA mensal | SGS | série 433 |
| TR | SGS | série 226 |
| Selic por reunião do Copom | Olinda | `ExpectativasMercadoSelic` (campo `Reuniao`, ex. "R5/2026") |
| IPCA mensal esperado | Olinda | `ExpectativaMercadoMensais` (`DataReferencia` "MM/AAAA") |
| Selic e IPCA anuais | Olinda | `ExpectativasMercadoAnuais` |
| Reserva | BrasilAPI | `/api/taxas/v1` (fora do M2: a cadeia cache → manual já cobre a falha) |

Consultas SGS: `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados?formato=json&dataInicial=…&dataFinal=…`
(janelas de até 10 anos por consulta nas séries diárias). Focus: usar `baseCalculo eq 0`
e a data de publicação mais recente.

**Calendário do Copom** (verificado em 2026-09-27): endpoint oficial em JSON, com CORS
`https://www.bcb.gov.br/api/servico/sitebcb/calendario/anual?inicioAgenda='AAAA-MM-DD'&fimAgenda='AAAA-MM-DD'&lista=Reuniões do Copom`.
Cada reunião vem como dois itens (um por dia), fora de ordem. O dia do anúncio é o
2º dia (use só a data de `dataEvento`). Cobre até o ano seguinte; o Focus projeta
reuniões além disso (ex.: R6/2028). `Rn/AAAA` = n-ésima reunião do ano.

Fatos confirmados (SGS, set/2026): a nova Selic meta vale **a partir do dia útil seguinte**
ao anúncio; Selic over = CDI; CDI = Selic meta − 0,10 p.p. O Focus anual cobre o ano
corrente + 4 (Selic = taxa de **fim de ano**); o IPCA mensal cobre o mês corrente + 24.

### 4.1 Curva projetada (cenário base)
1. **Curto prazo:** Selic pela mediana por **reunião do Copom** (degrau no dia útil
   seguinte a cada anúncio); IPCA pela mediana **mensal** (~25 meses).
   - Reunião do Focus sem data oficial: data **estimada** pela mesma reunião do último
     ano oficial + 52 semanas, marcada como "data estimada" na UI.
2. **Médio prazo:** Selic interpolada **mês a mês, linearmente**, do valor da última
   reunião até o fim de cada ano do Focus anual; IPCA dos meses sem Focus mensal =
   `(1 + IPCA anual)^(1/12) − 1`.
3. **Longo prazo (após o último ano do Focus):** convergência **linear em N anos**
   (padrão 5, editável) até as premissas (padrão: IPCA 3% a.a., juro real 5% a.a., logo
   Selic = 1,03 × 1,05 − 1 ≈ 8,15%). A UI avisa: *"após 20XX a projeção é premissa, não
   expectativa de mercado"*.
- CDI projetado = Selic − 0,10 p.p. (parâmetro editável). TR: constante no último valor
  do SGS (o Focus não projeta TR).

### 4.2 Cenários
**"Juros sobem" / "Base (Focus)" / "Juros caem"** + **"Manual"** (constante digitado,
como no M1). Juros e inflação andam juntos: "Juros sobem" = Selic **e** IPCA na mediana
+ k desvios-padrão; "Juros caem" = mediana − k desvios; cada ponto limitado ao
mínimo/máximo do Focus. Padrão k = 1, editável; premissas de longo prazo e prazo de
convergência também editáveis. A abertura cresce com o prazo porque o desvio do Focus
cresce.

### 4.3 Histórico (posições)
CDI/IPCA/TR realizados do SGS, desde a data da posição mais antiga, com cache
permanente para o passado (dado que não muda mais).

### 4.4 Resiliência
Falha de API → último valor em cache, com a data → entrada manual. O app nunca trava
por falta de dado.

## 5. Funcionalidades — comparação

### 5.1 Painel de indicadores (M2)
CDI, Selic, IPCA 12m e TR atuais; curva projetada por cenário; data da última
atualização; edição de cenários e premissas de longo prazo.

### 5.2 Ofertas (M2)
Opções em avaliação: tipo, emissor, conglomerado, indexador + taxa, data de aplicação,
vencimento (opcional em liquidez diária), liquidez, prazo mínimo, custo extra. Selo de
garantia derivado automaticamente.
- No M2: tipo, emissor, conglomerado, indexador + taxa, vencimento, liquidez (prazo
  mínimo legal derivado). **Custo extra e valor próprio por oferta entram no M3**, junto
  com o FGC, que é quem usa o valor por oferta.

**Navegação (M2):** duas abas, **"Comparar ofertas"** (principal) e **"Duelo rápido"**
(a tela do M1, com equivalência). O palpite vale nas duas; na comparação de ofertas a
pergunta é "qual lidera no seu horizonte?". O duelo rápido passa a usar o cenário ativo
(ou o manual).

### 5.3 Posições atuais (M3)
O que o usuário já tem aplicado. Modelo preparado para a futura carteira completa:
`id, produto, emissor, conglomerado, indexador, taxa, dataAplicacao, vencimento,
liquidez, valorAplicado, eventos[]` (aporte, resgate, vencimento), mais
`valorExtrato?` com `dataExtrato`.
- Valor atual **calculado pelo histórico real** (4.3). Quando `valorExtrato` existe,
  ele prevalece e a UI mostra a diferença para o calculado (diferenças grandes sugerem
  taxa digitada errada).
- Na fase atual, as posições alimentam **FGC** e **diversificação**; não há tela de
  acompanhamento de rentabilidade.

### 5.4 Comparação (M2)
- **Valor único** aplicado em todas as ofertas (base igual para comparar). Os valores
  próprios de ofertas/posições valem só para FGC e diversificação.
- **Horizonte** informado pelo usuário.

1. **Tabela por horizonte:** 6m, 1a, 2a, 3a, 5a e a data do usuário; valor líquido
   por oferta; vencedor destacado. Estados: *"indisponível nesse prazo"*,
   *"sujeito a marcação a mercado"*, *"reinvestido a partir de dd/mm"*.
2. **Linha do tempo de vencimentos:** ranking em cada vencimento; projeção até o
   vencimento mais longo com **reinvestimento** do valor líquido.
   - Padrão: **pós → mesmo % do CDI; pré/IPCA+/poupança → 100% do CDI do cenário**
     na data da reaplicação. Seletor: mesma taxa, 100% CDI ou taxa digitada.
   - **O IR recomeça na reaplicação.** A premissa usada fica escrita no resultado.
   - Conclusão em texto: *"Mesmo vencendo antes, A reaplicado termina em R$ X,
     R$ Y a mais que B."*
3. **Gráficos (M3, Chart.js):** valor líquido × tempo com **pontos de cruzamento
   anotados** e degraus do IR visíveis; diferença entre duas ofertas × tempo.
4. **Seletor de cenário**, que recalcula tudo.
5. **Ranking** por valor líquido, com alertas de trade-off (5.6).

### 5.5 Equivalência rápida (M1)
Produto + taxa + prazo → % do CDI equivalente em produto tributado, taxa prefixada
equivalente e IPCA+ equivalente no cenário ativo. Sem cadastro. No M1, antes de haver
indicadores ao vivo, o cenário é digitado (com valores iniciais razoáveis e editáveis).

### 5.6 Alertas que ensinam (M3)
Cada alerta tem **o que acontece**, **por quê** (a regra) e **link para a lição**:
- quase empate (< 0,5%, configurável) com liquidez ou garantia melhor;
- ultrapassa o FGC (conglomerado, data);
- teto global do FGC;
- IR reinicia na reaplicação (e quanto custou);
- prazo mínimo/liquidez incompatível com o horizonte;
- resgate com IOF.

### 5.7 Link compartilhável (M3)
Ofertas + cenário + horizonte codificados (comprimidos) no **fragmento da URL** (`#…`),
que não chega a nenhum servidor. **Nunca inclui posições.** Ao abrir, o conteúdo é
validado por esquema (7.2) antes de qualquer uso.

### 5.8 Persistência
localStorage por navegador + exportar/importar JSON (validado por esquema). Sem
sincronização entre dispositivos. A UI lembra periodicamente de exportar um backup.

## 6. Pilar educativo

Conteúdo em `src/conteudo/` (dados, separado do código). **Toda afirmação cita a fonte
oficial** (BCB, FGC, Tesouro, B3, lei/resolução). Fluxo editorial: rascunho gerado →
passado pelo **/vozmax** → **revisado pelo usuário** → publicado.

**Profundidade em camadas:** explicação curta e simples por padrão; **"ver a matemática"**
abre a fórmula, os números da simulação e o link da norma.

| Mecanismo | Marco | Descrição |
|---|---|---|
| **"Por que esse resultado?"** | M1 | Em todo cálculo: bruto → IOF → custódia → IR → líquido, cada passo explicado com os números reais da simulação (vem da memória de cálculo do `engine`) |
| **"Palpite antes de ver"** | M1 | Antes de revelar o vencedor, o usuário escolhe quem acha que rende mais; depois, a explicação do acerto/erro. Pode ser desligado |
| **Termos explicados** | M1 | Todo termo técnico vira link/tooltip para o glossário |
| **Trilha de aprendizado** | M3 | Lições curtas: renda fixa, indexadores, tributação, FGC, liquidez, marcação a mercado, reserva, diversificação, renda variável. Cada uma termina em **"experimente"**, que abre a calculadora com um exemplo pré-montado |
| **Casos clássicos** | M3 | "LCI × CDB: o ponto de virada", "Poupança × Tesouro Selic", "Por que o prefixado assusta quando os juros sobem", "O custo escondido de reaplicar" |
| **Progresso** | M3 | Lições concluídas e taxa de acerto dos palpites, no localStorage |
| **Dicas contextuais e "Você sabia?"** | M3 | Gatilhos por ação (cadastrou LCI → prazo mínimo e por que não serve de reserva etc.) |
| **Alertas que ensinam** | M3 | Ver 5.6 |

## 7. Segurança

### 7.1 Cabeçalhos (`public/_headers`)
CSP restrita: `script-src` só do próprio domínio + Turnstile; `connect-src` só para
`api.bcb.gov.br`, `olinda.bcb.gov.br`, `brasilapi.com.br` e o próprio `/api`;
`frame-ancestors 'none'`; `X-Content-Type-Options: nosniff`; `Referrer-Policy:
strict-origin-when-cross-origin`; `Permissions-Policy` restritiva.

### 7.2 Entradas externas
**Validação por esquema (zod)** em tudo que vem de fora: fragmento da URL, JSON
importado, localStorage e respostas de APIs. Fora do esquema → rejeita com mensagem,
nunca renderiza parcialmente. Limites de tamanho (quantidade de ofertas, tamanho do
link/arquivo).

### 7.3 Renderização
Sem `dangerouslySetInnerHTML`. Conteúdo educativo em Markdown restrito (negrito,
itálico, listas, links com `rel="noopener noreferrer"`), renderizado por componente
próprio.

### 7.4 Dependências e processo
Dependências mínimas; Dependabot no GitHub; **security-review antes do merge do M4**
(primeira exposição de API) e revisão dos itens 7.1–7.3 no M1.

## 8. Dados da brapi: segredo, proteção, cache e cota (M4)

**Plano gratuito (verificado em 2026-09-27):** 15.000 req/mês; 1 ativo por requisição;
1 requisição simultânea; atraso de ~30 min; histórico de até 3 meses (exceto os tickers
de teste PETR4, VALE3, ITUB4 e MGLU3); dividendos não incluídos; `Authorization: Bearer`;
403 = recurso fora do plano, 429 = limite (com `Retry-After`). A cobertura de FIIs/ETFs no
plano gratuito será testada com o token no início do M4, e a UI se adapta ao que existir.

### 8.1 Segredos
Na Cloudflare, como secrets do Pages: `BRAPI_TOKEN`, `TURNSTILE_SECRET_KEY`,
`SESSION_HMAC_KEY`. Localmente em `.env`/`.dev.vars` (ignorados pelo git; `.env.example`
documenta). Nunca com prefixo `VITE_`, nunca no bundle. A *site key* do Turnstile é
pública e pode ir no front.

### 8.2 Proteção sem login
1. **Turnstile invisível, uma vez por sessão:** a Function valida o token e devolve um
   **cookie assinado (HMAC)** `HttpOnly; Secure; SameSite=Strict`, válido por 24 h.
   Chamadas a `/api/*` sem cookie válido → 401. As calculadoras de renda fixa nunca
   passam pelo Turnstile.
2. **Limite por IP:** 30 requisições **externas** (as servidas do cache não contam)
   por IP por dia.
3. **Regra de rate limiting da Cloudflare** (plano gratuito) em `/api/*`.
4. **Allowlist de endpoints e parâmetros**, e ticker validado por regex, para não virar
   proxy aberto.
5. **Orçamento de cota** (8.4).

### 8.3 Cache em camadas e validade
Camadas: localStorage (navegador) → Cache API na borda → **Workers KV** (histórico
permanente + contadores).

| Dado | Dia de pregão, 10h–18h BRT | Fora do pregão / fim de semana / feriado |
|---|---|---|
| Cotação atual | **30 min** (igual ao atraso do plano) | até a próxima abertura |
| Candles diários passados | permanente em KV | permanente |
| Candle do dia | não buscado | 1× após o fechamento |
| Histórico solicitado | só o intervalo que falta desde o último candle salvo | idem |

**Histórico acumulado:** como o plano gratuito dá só 3 meses, cada candle diário fica
salvo em KV para sempre a partir do primeiro uso. O histórico cresce com o tempo, e a UI
mostra *"histórico disponível desde dd/mm/aaaa"*.

BCB segue a mesma lógica de validade até o próximo evento: CDI até o próximo dia útil,
IPCA até a próxima divulgação, Focus até a próxima publicação semanal.

### 8.4 Orçamento de cota
- Contadores mensal e diário em KV. Orçamento diário = restante do mês ÷ dias restantes
  (com teto).
- Estourou: serve o cache (mesmo vencido) com flag de desatualizado; nunca chama acima
  do orçamento.
- Fila com **1 requisição por vez** (limite do plano) e deduplicação por chave.

### 8.5 Página /status
Só leitura, sem dados pessoais: uso do mês e do dia, orçamento restante, última
atualização de cada fonte, quantidade de tickers com histórico acumulado.

## 9. Fase 2 — sugestão por objetivo e renda variável (M4)

### 9.1 Sugestão por objetivo
Questionário por objetivo; vários objetivos salvos. Cada sugestão mostra **o motivo de
cada fatia**, respeita o FGC por conglomerado **considerando as posições atuais**
(sugerindo espalhar entre emissores) e pode usar as ofertas cadastradas. Cada fatia tem
link para a lição correspondente.

| Objetivo | Entradas | Lógica |
|---|---|---|
| Reserva de emergência | gasto mensal, estabilidade da renda | 6–12× o gasto; **só liquidez diária** com FGC ou Tesouro Selic; exclui LCI/LCA no prazo mínimo e prefixados |
| Objetivo com data | valor-alvo, data | casar vencimento com a data; evitar marcação a mercado |
| Longo prazo / aposentadoria | horizonte | parcela em IPCA+ + pós para liquidez; renda variável explicada acima de 5 anos |
| Sem objetivo definido | horizonte aproximado | mistura pós/pré/IPCA+ por faixa de prazo |

Aviso fixo: conteúdo educativo, não é recomendação de investimento.

### 9.2 Renda variável
- **Educativo:** papel de ações, FIIs e ETFs; risco, volatilidade; dividendos de FII
  isentos para PF; isenção de R$ 20 mil/mês em vendas de ações (regras em `regras/`
  com vigência e fonte). Nunca indica ativos específicos.
- **Calculável:** para um ticker, rentabilidade no período disponível, volatilidade
  anualizada e drawdown máximo, **comparados a CDI e IPCA no mesmo período**.

## 10. Tratamento de erros
- API indisponível → cache com data → entrada manual.
- Oferta/posição inválida → validação no formulário **e** no `engine` (erro tipado).
- Regra sem versão vigente → erro explícito.
- Link/arquivo inválido → mensagem clara, nada é carregado.
- `/api` sem sessão, acima do limite ou sem orçamento → resposta tipada que a UI
  explica ao usuário.

## 11. Estratégia de testes (TDD)

**TDD estrito:** para cada regra, os testes vêm primeiro, com os valores esperados, são
executados e vistos **falhando**; só então vem a implementação. Critérios de aceite:

**Calendário:** Páscoa 2024–2035 correta; Carnaval, Sexta-feira Santa e Corpus Christi
derivados; dias úteis entre datas conhecidas batem com a calculadora ANBIMA; 20/11
feriado a partir de 2024.

**Regras versionadas:** duas versões fictícias de uma regra → aplica a correta pela data;
data sem versão → erro. Prazo mínimo LCI/LCA: emissão em 23/05/2025 → 6 meses;
LCI-IPCA → 36 meses; LCA-IPCA → 12 meses. No M1 só a versão vigente (desde 23/05/2025)
é cadastrada: emissão em 22/05/2025 → erro explícito. As versões anteriores entram no
M3, junto com as posições atuais, depois de conferidas no texto das resoluções.

**Tributos:** IR nas fronteiras 180→22,5%, 181→20%, 360→20%, 361→17,5%, 720→17,5%,
721→15%. IOF: dia 1 = 96%, 15 = 50%, 29 = 3%, 30 = 0%; IR sobre rendimento − IOF.

**Produtos** (valores esperados gerados por uma implementação de referência independente,
`tests/referencia/calcular-esperados.mjs`, com cenário constante; a conferência contra
simuladores oficiais com CDI histórico — Calculadora do Cidadão/BCB — entra no M3, quando
existir histórico real):
- 100% CDI com CDI constante por N dias úteis = `(1+CDI)^(N/252)`.
- CDB 103% e LCI 80% do CDI, R$ 10.000, prazos 6m, 1a, 2a, 3a.
- Prefixado e IPCA+ com cenário fixo.
- Poupança: aniversário, depósito no dia 31, resgate antes do aniversário, as duas regras.
- Tesouro Selic: R$ 8.000 (isento), R$ 10.100 (custódia sobre o excedente médio de R$ 10 mil, aproximação pela média entre aplicado e bruto), R$ 50.000;
  custódia descontada só no resgate.
- Memória de cálculo: os passos somam exatamente o resultado final.

**Equivalência:** o app calcula a taxa **exata** (bisseção sobre o valor líquido) e mostra
também a **regra de bolso** do mercado, explicando a diferença (a regra ignora os juros
compostos sobre o imposto). Com CDI 13,65%, aplicação em 28/09/2026:
- LCI 80% CDI, 2 anos (IR 15%): regra de bolso `80/0,85 = 94,12%`; exata **92,57%**.
- LCI 80% CDI, 1 ano (IR 17,5%): regra de bolso `80/0,825 = 96,97%`; exata **95,98%**.
- Ida e volta: simular o CDB na taxa exata reproduz o líquido da LCI (erro < R$ 0,000001).

**Cenários e curva:** degrau da Selic na data da reunião do Copom; convergência de
longo prazo monótona até a premissa; juros sobem/caem = mediana ± desvio-padrão.

**Comparador:** oferta sem liquidez "indisponível" antes do vencimento; reinvestimento
reinicia o IR (caso que inverte o vencedor); padrão de reinvestimento por tipo (pós vs
pré); ponto de cruzamento na data correta.

**FGC:** soma ofertas + posições por conglomerado e dispara na primeira data em que
excede; posição com `valorExtrato` usa o extrato.

**Segurança/entradas:** link e JSON malformados ou com campos extras/HTML → rejeitados;
link nunca contém posições; limites de tamanho respeitados.

**brapi (M4):** TTL — sexta 17h59 → 30 min; sexta 18h01 → segunda 10h; véspera de
feriado → próximo pregão. Histórico salvo até D-3 → busca só D-2..D-1. Orçamento
esgotado → cache vencido com flag, sem chamada externa. Sem cookie → 401; cookie
adulterado → 401; IP acima do limite → 429 tipado.

## 12. Deploy e fluxo
- Cloudflare Pages ligado ao GitHub; build `npm run build`, saída `dist/`; preview por PR.
- GitHub Actions: `lint + typecheck + test` em todo PR; merge bloqueado se falhar.
- Domínio `rende.maxsueleinstein.dev` (CNAME gerenciado pela Cloudflare), no M1.
- M4: secrets (`BRAPI_TOKEN`, `TURNSTILE_SECRET_KEY`, `SESSION_HMAC_KEY`), binding KV,
  widget Turnstile e regra de rate limiting. **O passo a passo do painel da Cloudflare
  será entregue ao usuário nesse marco.**

## 13. Evoluções futuras
Carteira completa com acompanhamento; sincronização entre dispositivos (exigiria
login); CRI/CRA/debêntures; fundos com come-cotas; títulos do Tesouro com cupom;
marcação a mercado via curva de juros; PWA/offline.

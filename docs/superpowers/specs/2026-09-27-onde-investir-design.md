# Onde Investir — Design / Spec

- **Data:** 2026-09-27
- **Repositório:** `github.com/maxeinstein-dev/onde-investir`
- **URL de produção:** `https://rende.maxsueleinstein.dev`
- **Status:** design aprovado, aguardando revisão da spec escrita

## 1. Objetivo

Calculadora pessoal e gratuita para decidir **onde aplicar um valor**, comparando
investimentos pelo **valor líquido** (após IR, IOF e custos), considerando prazos,
liquidez e garantia (FGC). Usa indicadores em tempo real de APIs gratuitas e ensina
o usuário sobre investimentos ao longo do uso.

Exemplo-guia: *CDB 103% do CDI vs LCI 80% do CDI — qual rende mais, em quais prazos?*

### Restrições

- **Custo zero:** apenas APIs e hospedagem gratuitas.
- **Uso pessoal, pessoa física.**
- **Caráter educativo:** as sugestões de carteira são genéricas, baseadas em regras
  explícitas e visíveis; não são recomendação personalizada. O app exibe esse aviso.

### Fases

| Fase | Escopo |
|---|---|
| **1** | Motor de cálculo (TDD), indicadores via API, cenários, ofertas, comparação por horizonte, linha do tempo de vencimentos, gráficos, alertas, dicas educativas, deploy |
| **2** | Sugestão de carteira por objetivo, renda variável (educativo + histórico via brapi) |

Fora do escopo (por ora): CRI/CRA/debêntures, fundos (come-cotas), estimativa de
marcação a mercado do Tesouro, pessoa jurídica, contas/login.

## 2. Arquitetura

- **Front-end estático:** Vite + TypeScript + Preact, hospedado no **Cloudflare Pages**
  com deploy automático a cada push na `main`.
- **Uma Pages Function** (`functions/api/brapi/[[path]].ts`) como proxy da brapi,
  guardando o token como secret e fazendo cache/controle de cota (seção 7).
- **APIs do Banco Central chamadas direto do navegador** (CORS verificado em
  2026-09-27: SGS `*`, Olinda/Focus libera a origem, BrasilAPI `*`).
- **Testes:** Vitest. TDD estrito em `src/engine/` e na lógica de cache.

```
onde-investir/
├── functions/api/brapi/[[path]].ts  ← proxy brapi (token secreto, cache, cota)
├── src/
│   ├── engine/                      ← TypeScript puro, sem dependência de UI
│   │   ├── calendario.ts            ← dias úteis ANBIMA e pregões B3
│   │   ├── regras/                  ← regras como dados versionados por vigência
│   │   ├── indexadores.ts           ← evolução diária de CDI/Selic/IPCA/TR por cenário
│   │   ├── produtos.ts              ← cálculo por tipo de produto
│   │   ├── comparador.ts            ← horizontes, linha do tempo, reinvestimento, cruzamentos
│   │   ├── equivalencia.ts          ← taxa equivalente entre produtos
│   │   └── alertas.ts               ← geração de alertas
│   ├── dados/                       ← clientes SGS, Focus, BrasilAPI, proxy brapi + cache
│   ├── conteudo/                    ← dicas, "Você sabia?", glossário (dados, não código)
│   ├── ui/                          ← componentes Preact + Chart.js
│   └── armazenamento.ts             ← localStorage + exportar/importar JSON
└── tests/
```

**Princípio:** o `engine/` recebe dados (ofertas, cenário, regras, calendário) e
devolve resultados. Não chama rede nem lê armazenamento. Tudo que ele faz é testável
de forma determinística.

## 3. Regras de negócio

### 3.1 Regras como dados versionados

`src/engine/regras/` contém cada regra com `vigenciaInicio`, `vigenciaFim?` e `fonte`
(link da norma). O motor aplica a versão vigente na **data da aplicação** (ou do fato
gerador, quando a norma disser). Regras cobertas: tabela de IR, tabela de IOF,
isenções por produto, carência mínima LCI/LCA, limites do FGC, custódia B3 do Tesouro,
regra da poupança.

> ⚠️ **Verificação obrigatória antes de implementar (primeira tarefa do plano):**
> conferir a legislação vigente em set/2026 para (a) isenção de IR de LCI/LCA (houve
> propostas de tributação em 2025), (b) carência mínima de LCI e LCA (Res. CMN 2024 e
> alterações posteriores), (c) regra atual da taxa de custódia da B3 no Tesouro Direto
> (isenção do Tesouro Selic até certo valor), (d) limites do FGC. Registrar a fonte de
> cada uma no arquivo de regras.

### 3.2 Tributos

- **IR regressivo** (renda fixa tributada), sobre o rendimento:
  até 180 dias 22,5% · 181–360 20% · 361–720 17,5% · acima de 720 15%.
  Prazo contado em dias corridos entre aplicação e resgate.
- **IOF regressivo** nos resgates com menos de 30 dias corridos, sobre o rendimento,
  **calculado antes do IR** (o IR incide sobre rendimento − IOF). Tabela oficial:
  dia 1 = 96%, 2 = 93%, 3 = 90%, 4 = 86%, 5 = 83%, 6 = 80%, 7 = 76%, 8 = 73%, 9 = 70%,
  10 = 66%, 11 = 63%, 12 = 60%, 13 = 56%, 14 = 53%, 15 = 50%, 16 = 46%, 17 = 43%,
  18 = 40%, 19 = 36%, 20 = 33%, 21 = 30%, 22 = 26%, 23 = 23%, 24 = 20%, 25 = 16%,
  26 = 13%, 27 = 10%, 28 = 6%, 29 = 3%, 30+ = 0%.
- **Isentos de IR (PF):** LCI, LCA, poupança (sujeito à verificação 3.1).

### 3.3 Produtos (fase 1)

| Produto | Rendimento | IR | Garantia | Liquidez |
|---|---|---|---|---|
| CDB / RDB / LC pós | % do CDI, capitalização diária em dias úteis (base 252) | Regressivo | FGC | Diária ou no vencimento (informado) |
| LCI / LCA pós | % do CDI, idem | Isento* | FGC | Carência mínima* e vencimento |
| Prefixado (CDB, LCI, LCA, Tesouro Prefixado) | Taxa a.a. base 252 | Conforme produto | Conforme emissor | Conforme produto |
| IPCA+ (CDB, LCI, LCA, Tesouro IPCA+) | IPCA projetado + taxa real a.a. | Conforme produto | Conforme emissor | Conforme produto |
| Tesouro Selic | Selic diária (+ ágio/deságio informado opcional) | Regressivo | Tesouro Nacional | D+0/D+1 |
| Poupança | Selic meta > 8,5% a.a.: 0,5% a.m. + TR; senão 70% da Selic meta + TR | Isenta | FGC | Diária, **rendimento só no aniversário mensal** |

\* ver 3.1.

Detalhes:
- **% do CDI:** fator diário = `(1 + CDI_aa)^(1/252) − 1` multiplicado pelo percentual,
  acumulado em cada dia útil do período (padrão de mercado B3/CETIP).
- **IPCA+:** o IPCA mensal projetado vem do cenário; aplicado pró-rata em dias úteis.
- **Poupança:** depósitos nos dias 29, 30 e 31 fazem aniversário no dia 1º do mês
  seguinte. Resgate antes do aniversário perde o rendimento do mês incompleto.
- **Tesouro:** custódia B3 descontada pró-rata conforme regra vigente (3.1). Resgate
  antes do vencimento, exceto Tesouro Selic, fica marcado como
  **"sujeito a marcação a mercado"**, sem estimativa de valor na fase 1.
- **Custo extra opcional por oferta** (% a.a. ou valor fixo).
- **Precisão:** cálculos em ponto flutuante de dupla precisão com fator acumulado;
  arredondamento **só na exibição** (centavos). Tolerância de teste: R$ 0,01 por
  R$ 10.000 aplicados, comparando com simuladores oficiais.

### 3.4 FGC

- Cobertos: CDB, RDB, LC, LCI, LCA, poupança. Tesouro: garantia do Tesouro Nacional
  (selo próprio). Outros: "Sem garantia".
- **Limite por CPF por instituição/conglomerado** (R$ 250 mil, verificar em 3.1),
  contando **principal + rendimentos**. O motor soma o valor bruto projetado de todas
  as ofertas do mesmo conglomerado em cada data e alerta quando ultrapassa.
- **Teto global** (R$ 1 milhão a cada 4 anos, verificar em 3.1): alerta informativo
  quando o total coberto pelo FGC passa do teto.
- Cada oferta tem o campo obrigatório `conglomerado` (texto livre com autocompletar
  dos já cadastrados).

### 3.5 Calendário

- **Dias úteis ANBIMA** para CDI/Selic: fins de semana + feriados nacionais fixos +
  móveis (Carnaval seg/ter, Sexta-feira Santa, Corpus Christi, calculados pela Páscoa),
  incluindo 20/11 (Consciência Negra, nacional desde 2024).
- **Pregões B3** para cache de cotações: calendário ANBIMA + dias sem pregão da B3
  (ex.: 24/12, 31/12). Lista de exceções mantida como dado versionado.

## 4. Indicadores e cenários

| Dado | Fonte | Série / endpoint |
|---|---|---|
| CDI diário | BCB SGS | série 12 |
| Selic meta | BCB SGS | série 432 |
| IPCA mensal | BCB SGS | série 433 |
| TR diária | BCB SGS | série 226 |
| Projeções anuais Selic e IPCA | BCB Olinda | `Expectativas/…/ExpectativasMercadoAnuais` (mediana, data mais recente) |
| Reserva | BrasilAPI | `/api/taxas/v1` |

(Os números das séries SGS devem ser confirmados na primeira tarefa de dados.)

- **Cenário base = Focus.** A Selic projetada para cada ano gera o CDI (CDI ≈ Selic
  meta − 0,10 p.p., parâmetro editável). O IPCA anual é distribuído mensalmente.
- **Cenários otimista e pessimista** editáveis (curva Selic/IPCA por ano), inicializados
  como base ± deslocamento configurável.
- **Resiliência:** falha de API → último valor em cache com a data exibida → entrada
  manual. O app nunca trava por falta de dado.

## 5. Funcionalidades — Fase 1

### 5.1 Painel de indicadores
CDI, Selic, IPCA 12m e TR atuais; Focus ano a ano; data/hora da última atualização;
botão para editar cenários.

### 5.2 Minhas ofertas
Cadastro com: tipo de produto, emissor, conglomerado, indexador + taxa, data de
aplicação, vencimento (opcional para liquidez diária), liquidez, carência, valor,
custo extra. O selo de garantia é derivado automaticamente. Ofertas persistidas em
localStorage, com exportar/importar JSON.

### 5.3 Comparação
Entrada: valor (ou valores por oferta) e horizonte desejado.

1. **Tabela por horizonte:** colunas 6m, 1a, 2a, 3a, 5a e a data do usuário; valor
   líquido por oferta; vencedor destacado. Estados especiais: *"indisponível nesse
   prazo"* (sem liquidez), *"sujeito a marcação a mercado"* (Tesouro antes do vencimento).
   Ofertas que vencem antes do horizonte → reinvestimento (5.3.2), sinalizado.
2. **Linha do tempo de vencimentos:** cada vencimento é um marco, com o ranking em
   cada marco. Projeção até o vencimento mais longo com **reinvestimento** do valor
   líquido na taxa escolhida: *mesma do ativo original* (padrão), *CDI do cenário* ou
   *taxa digitada*. **O IR recomeça na reaplicação** (nova data de aplicação). Conclusão
   em texto: *"Mesmo vencendo antes, A reaplicado termina em R$ X, R$ Y a mais que B."*
3. **Gráficos (Chart.js):**
   - Valor líquido × tempo por oferta, com **pontos de cruzamento anotados**
     ("a partir de 14/08/2027, X passa Y") e degraus do IR visíveis.
   - Diferença entre duas ofertas escolhidas × tempo (onde troca de sinal).
4. **Seletor de cenário** (base/otimista/pessimista) que recalcula tudo.
5. **Ranking:** ordenado por valor líquido, com **alertas de trade-off** (5.5).

### 5.4 Equivalência rápida
Entrada: produto + taxa + prazo (ex.: LCI 80% CDI, 2 anos). Saída: % do CDI
equivalente em produto tributado, taxa prefixada equivalente e IPCA+ equivalente
no cenário ativo. Não exige cadastro.

### 5.5 Alertas
- **Quase empate com melhor liquidez/garantia:** diferença líquida < limiar
  configurável (padrão 0,5%) e a outra oferta tem liquidez maior ou garantia melhor.
- **Ultrapassa o FGC** (por conglomerado, em alguma data até o horizonte).
- **Teto global do FGC.**
- **IR reinicia na reaplicação** (e quanto isso custou).
- **Carência/liquidez incompatível com o horizonte.**
- **Resgate com IOF** (< 30 dias).

### 5.6 Conteúdo educativo
Arquivos em `src/conteudo/` (JSON/Markdown), separados do código:
- **Dicas contextuais** com gatilhos (ex.: cadastrou LCI → carência e por que não
  serve para reserva; alerta de IR reiniciado → tabela regressiva; FGC → limite por
  instituição).
- **"Você sabia?"** rotativo por visita.
- **Glossário** (CDI, Selic, IPCA, marcação a mercado, FGC, come-cotas, TR, etc.).

## 6. Funcionalidades — Fase 2

### 6.1 Sugestão por objetivo
Questionário por objetivo; vários objetivos salvos ao mesmo tempo. Cada sugestão
mostra **o motivo de cada fatia**, respeita o limite do FGC por conglomerado
(sugerindo espalhar entre emissores) e pode usar as ofertas cadastradas.

| Objetivo | Entradas | Lógica |
|---|---|---|
| Reserva de emergência | gasto mensal, estabilidade da renda | 6–12× o gasto (mais para renda instável); **só liquidez diária** com FGC ou Tesouro Selic; exclui LCI/LCA com carência e prefixados |
| Objetivo com data | valor-alvo, data | casar vencimento com a data; pré ou pós com vencimento próximo; evitar marcação a mercado |
| Longo prazo / aposentadoria | horizonte em anos | parcela relevante em IPCA+ + pós para liquidez; menciona renda variável (6.2) acima de 5 anos |
| Sem objetivo definido | horizonte aproximado | mistura pós/pré/IPCA+ por faixa de prazo |

Aviso fixo: conteúdo educativo, não é recomendação de investimento.

### 6.2 Renda variável
- **Educativo:** papel de ações, FIIs e ETFs em prazos longos; risco e volatilidade;
  dividendos de FII isentos para PF; isenção de R$ 20 mil/mês em vendas de ações
  (regras em `regras/`, com verificação de vigência). Nunca indica ativos específicos.
- **Calculável:** para um ticker digitado, histórico de preço com rentabilidade no
  período, volatilidade anualizada e **drawdown máximo**, comparados com CDI e IPCA
  acumulados no mesmo período.

## 7. Dados da brapi: segredo, cache e cota

**Cota:** plano gratuito com 15.000 requisições/mês. Meta: consumo típico < 10% disso.

### 7.1 Segredo
- `BRAPI_TOKEN` fica **só no servidor**: `.env` (ou `.dev.vars`) no desenvolvimento
  local, **secret do Cloudflare Pages** em produção. Nunca com prefixo `VITE_`, nunca
  no bundle. `.env` está no `.gitignore`; `.env.example` documenta a variável.
- O front chama apenas `/api/brapi/...`. O proxy aceita **só os endpoints e parâmetros
  usados pelo app** (allowlist), para não virar um proxy aberto.

### 7.2 Cache em camadas
1. **Navegador (localStorage):** mesma política de validade abaixo; evita chamar o proxy.
2. **Borda (Cache API da Cloudflare na Pages Function):** compartilhado entre
   dispositivos.
3. **KV (Workers KV, plano gratuito):** histórico diário persistente e contador de cota.

### 7.3 Política de validade (TTL) por tipo de dado
| Dado | Durante o pregão (dia de pregão, 10h–18h BRT) | Fora do pregão / fim de semana / feriado |
|---|---|---|
| Cotação atual | 15 min | **até a próxima abertura** do pregão |
| Candles diários **passados** | imutáveis: cache permanente em KV | idem |
| Candle do dia corrente | não buscado (histórico vai até o último fechamento) | busca 1× após o fechamento |
| Histórico solicitado | busca **só o intervalo que falta** desde o último candle salvo | idem |

A mesma lógica de "válido até o próximo evento" vale para o BCB: CDI até o próximo dia
útil, IPCA até a próxima divulgação mensal, Focus até a próxima segunda-feira.

### 7.4 Proteção de cota
- Contador mensal e diário em KV. **Orçamento diário** = restante do mês ÷ dias
  restantes (com teto).
- Estourou o orçamento: devolve o dado em cache (mesmo vencido), com cabeçalho/flag
  de "dado desatualizado", e a UI avisa. Nunca faz chamada acima do orçamento.
- Uma requisição simultânea por chave (deduplicação), para não disparar várias chamadas
  iguais ao mesmo tempo.
- **Verificar na implementação:** limites do plano gratuito da brapi quanto a `range`,
  `interval` e tickers disponíveis, e ajustar a UI ao que o plano permite.

## 8. Tratamento de erros
- API indisponível → cache com data → entrada manual; mensagem clara.
- Dados de oferta inválidos (vencimento antes da aplicação, taxa negativa etc.) →
  validação no formulário e também no `engine` (erro tipado, nunca resultado silencioso).
- Regra sem versão vigente para a data → erro explícito ("regra de IR não cadastrada
  para 2031"), não fallback silencioso.

## 9. Estratégia de testes (TDD)

O plano de implementação segue **TDD estrito**: para cada regra, os testes são escritos
primeiro com os valores esperados, executados e vistos **falhando**, e só então vem a
implementação. Critérios de aceite mínimos:

**Calendário**
- Páscoa correta em 2024–2035; Carnaval, Sexta-feira Santa e Corpus Christi derivados.
- Contagem de dias úteis entre datas conhecidas bate com a calculadora ANBIMA.
- 20/11 é feriado a partir de 2024.

**Tributos**
- Alíquota de IR nas fronteiras: 180→22,5%, 181→20%, 360→20%, 361→17,5%,
  720→17,5%, 721→15%.
- IOF: dia 1 = 96%, dia 15 = 50%, dia 29 = 3%, dia 30 = 0%; IR incide sobre
  rendimento − IOF.
- Regra aplicada conforme a vigência (teste com duas versões fictícias de regra).

**Produtos** (valores esperados obtidos de simuladores oficiais: Calculadora do
Cidadão/BCB, simulador do Tesouro Direto; registrar fonte e data em cada caso)
- CDB 100% CDI com CDI constante por N dias úteis = `(1+CDI)^(N/252)`.
- CDB 103% CDI e LCI 80% CDI, R$ 10.000, prazos de 6m, 1a, 2a e 3a.
- Prefixado e IPCA+ com cenário fixo.
- Poupança: aniversário, depósito no dia 31, resgate antes do aniversário, as duas
  regras (Selic acima/abaixo de 8,5%).
- Tesouro Selic com custódia (abaixo e acima da faixa de isenção vigente).

**Equivalência** (determinísticos)
- LCI 80% CDI por 2 anos (> 720 dias, IR 15%) ≡ CDB `80 / 0,85 = 94,12%` do CDI.
- LCI 80% CDI por 1 ano (361–720 dias, IR 17,5%) ≡ CDB `80 / 0,825 = 96,97%` do CDI.

**Comparador**
- Oferta sem liquidez fica "indisponível" antes do vencimento.
- Reinvestimento reinicia o IR (caso em que isso inverte o vencedor).
- Ponto de cruzamento detectado na data correta.
- Soma por conglomerado dispara o alerta do FGC na primeira data em que excede.

**Cache/cota (brapi)**
- TTL: sexta 17h59 → 15 min; sexta 18h01 → até segunda 10h; véspera de feriado → até
  o próximo pregão.
- Histórico: com candles salvos até D-3, busca só D-2..D-1.
- Orçamento esgotado → serve dado vencido com flag, sem chamada externa.

## 10. Deploy
- Cloudflare Pages conectado ao repositório GitHub; build `npm run build`, saída `dist/`.
- Domínio personalizado `rende.maxsueleinstein.dev` (CNAME gerenciado pela Cloudflare).
- Secret `BRAPI_TOKEN` e binding KV configurados no painel. O passo a passo será
  entregue ao usuário na tarefa de deploy.

## 11. Evoluções futuras (fora do escopo)
CRI/CRA/debêntures incentivadas; fundos DI com come-cotas; estimativa de marcação a
mercado do Tesouro via curva de juros; PWA/offline; alertas de novas taxas.

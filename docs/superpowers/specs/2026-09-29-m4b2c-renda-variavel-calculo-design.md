# M4b2c: Cálculo de renda variável — Design

- **Data:** 2026-09-29
- **Status:** aprovado, pronto para o plano de implementação
- **Relação com a spec principal:** entrega a seção 9.2 "Calculável" de
  `docs/superpowers/specs/2026-09-27-onde-investir-design.md`, a última peça do roadmap original.
  Consome `/api/mercado/historico` (M4b2b) e o portão do M4b2a. Fecha o marco M4.

## 1. Objetivo

Dado um ticker digitado pela pessoa (nunca sugerido pelo app), mostrar: rentabilidade no período
disponível, volatilidade anualizada, drawdown máximo — comparados a CDI e IPCA no mesmo período.
Nova aba dedicada na barra principal; o Turnstile dispara automaticamente ao abrir essa aba
(liberando o cookie de sessão de 24h do M4b2a), e só essa aba passa por isso — as calculadoras de
renda fixa continuam sem Turnstile.

### Fora do escopo
- Indicar ou sugerir qualquer ativo específico (a spec proíbe desde o início).
- Dividendos de FII, imposto sobre venda de ações/FII — já cobertos como conteúdo educativo no M4b1.

## 2. Fluxo e Turnstile

Ao abrir a aba: se não há cookie de sessão válido, a UI carrega o widget do Turnstile (invisível,
`site key` pública já configurada — ver M4b2a) e, ao resolver, chama `POST /api/sessao` (já
existe). Com cookie válido (ou recém-obtido), o campo de ticker fica disponível. Sem resolver o
desafio (falha de rede, bloqueio), mostra o erro já tipado (`TURNSTILE_INVALIDO`,
`TURNSTILE_INDISPONIVEL`) com um botão de tentar de novo — nunca trava a aba pra sempre.

## 3. Cálculo

Novo módulo puro `src/engine/rendaVariavel.ts` (mesmo padrão de `equivalencia.ts`: motor sem rede
nem DOM, recebe os candles e os indicadores já carregados, devolve números estruturados):

- **Rentabilidade no período:** `(fechamento_final / fechamento_inicial) − 1`, sobre os candles
  acumulados que `/api/mercado/historico` já devolve (o período "disponível" é o que já foi
  acumulado em KV pra aquele ticker — pode ser só alguns meses se for a primeira consulta).
- **Volatilidade anualizada:** desvio-padrão dos retornos diários (`close[i]/close[i-1] − 1`),
  multiplicado por `√252` (dias úteis/ano), fórmula padrão de mercado.
- **Drawdown máximo:** maior queda percentual entre um pico e o vale seguinte, sobre a série de
  fechamentos ajustados (`adjustedClose`, já presente nos candles do M4b2b).
- **Comparação com CDI/IPCA:** mesmo período, usando `cenario.cdiAA`/`fatorIPCA` já existentes em
  `src/engine/indexadores.ts` (o motor já sabe compor CDI/IPCA diário — reaproveita, não duplica).

Tudo isso já é dado histórico, sem projeção — não há "taxa combinada" como na renda fixa, então não
precisa de `Cenario` completo, só da série de CDI/IPCA diária no intervalo (já exposta pelo motor).

## 4. UI

Nova aba (`ABA_RENDA_VARIAVEL`), no mesmo padrão das outras: campo de texto pro ticker (validado
com o mesmo regex de `functions/_lib/mercado.ts` — considerar exportar/duplicar no lado do cliente,
já que o cliente não importa `functions/`), botão "Consultar", card de resultado com os 3 números e
os comparativos, aviso educativo fixo (`AVISO_EDUCATIVO`, já existe) e um lembrete de que o app
nunca indica ativos.

## 5. Testes

- **Engine:** rentabilidade/volatilidade/drawdown com séries de referência calculadas à mão (casos
  pequenos, tipo 5-10 candles, pra conferir a conta manualmente); comparação com CDI/IPCA usando
  `cenarioConstante` de teste (já usado em todo o motor).
- **UI:** fluxo de Turnstile (mockado, mesmo padrão de outras telas que já mockam `fetch`), ticker
  inválido, erro de API tratado sem travar a tela.
- **Functions:** nenhuma nova (reaproveita `/api/mercado/*` do M4b2b sem mudança).

## 6. Marco e fluxo

Branch `m4b2c-renda-variavel-calculo`, a partir da `main` atualizada (já com o M4b2b mergeado). TDD
estrito, revisão de código, revisão editorial, PR com auto-fix ligado. Fecha o M4 (roadmap original)
por completo.

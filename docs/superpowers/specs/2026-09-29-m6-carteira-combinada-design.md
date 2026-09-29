# M6: Objetivo "Carteira Combinada" — Design

- **Data:** 2026-09-29
- **Status:** aprovado, pronto para o plano de implementação
- **Relação com a spec principal:** funcionalidade nova, fora do roadmap original de
  `docs/superpowers/specs/2026-09-27-onde-investir-design.md`. Estende a seção 9.1 ("Sugestão por
  objetivo") com um 6º tipo de objetivo, na mesma família do M5 (`docs/superpowers/specs/2026-09-28-m5-renda-mensal-design.md`).

## 1. Objetivo

Hoje cada objetivo cadastrado na aba Objetivos é isolado: a pessoa cria "Reserva", "Longo Prazo"
etc. separadamente, sem que nenhum saiba do valor total disponível nem dos outros objetivos. Este
marco adiciona um 6º tipo, **Carteira Combinada**: dado um principal único, um gasto mensal (para
calcular a reserva de emergência) e um horizonte até o objetivo final, o app divide o principal
entre reserva de emergência e o restante — sem inventar uma 3ª categoria "médio prazo" separada; o
restante já se comporta como um gradiente médio→longo através da mistura IPCA+/pós-fixado que
`faixaLongoPrazo` (regra de `LONGO_PRAZO`) já decide por horizonte.

### Fora do escopo

- Uma categoria "médio prazo" com heurística própria (rejeitado no brainstorm: seria uma regra
  inventada sem fonte, ao contrário de toda regra versionada do app, que sempre cita de onde vem).
- Metas com data específica (`COM_DATA`) dentro da carteira combinada — quem quiser uma meta com
  data continua cadastrando um objetivo `COM_DATA` separado.
- Qualquer alteração nos 5 tipos de objetivo já existentes.

## 2. Modelo de dados

Novo caso em `Objetivo` (`src/engine/sugestao.ts`):

```ts
export type Objetivo =
  | { tipo: 'RESERVA'; gastoMensal: number; rendaEstavel: boolean }
  | { tipo: 'COM_DATA'; valorAlvo: number; data: DataISO }
  | { tipo: 'LONGO_PRAZO'; horizonteAnos: number }
  | { tipo: 'SEM_OBJETIVO'; horizonteAnos: number }
  | { tipo: 'RENDA_MENSAL'; principal: number; rendaMensalDesejada: number }
  | { tipo: 'CARTEIRA_COMBINADA'; principal: number; gastoMensal: number; rendaEstavel: boolean; horizonteAnos: number };
```

`validarObjetivo` ganha o caso `CARTEIRA_COMBINADA`: os 4 campos nos mesmos moldes dos tipos
existentes (`principal > 0`, `gastoMensal > 0`, `horizonteAnos` inteiro `> 0`) **mais uma checagem
cruzada**: a reserva de emergência calculada (`gastoMensal × MULTIPLICADOR_RESERVA.estavel|variavel`)
não pode passar do `principal`. Se passar, `OfertaInvalidaError`: "A reserva de emergência sozinha
(R$X) já passa do total informado."

`valorAlvo` retorna o próprio `principal` — sem precisar de um caso novo em `resumoObjetivo`
(`src/ui/objetivos/Objetivos.tsx`), que já mostra "Valor-alvo: {valor}" para qualquer tipo cujo
`valorAlvo` não seja `null`.

## 3. Cálculo combinado

Nova função em `src/engine/sugestao.ts`, chamada pelo dispatcher `sugerir()` no novo
`case 'CARTEIRA_COMBINADA'`:

1. `valorReserva = o.gastoMensal * (o.rendaEstavel ? MULTIPLICADOR_RESERVA.estavel : MULTIPLICADOR_RESERVA.variavel)`.
2. `restante = o.principal - valorReserva` (garantido `≥ 0` pela validação da seção 2).
3. Fatias da reserva: as mesmas duas de `sugerirReserva` (Tesouro Selic + CDB liquidez diária,
   50/50 **de `valorReserva`**), mas com `percentual` relativo ao **`principal` total**:
   `(valorReserva * 0.5) / principal` para cada uma — não a `valorReserva`, para a pizza e o FGC
   combinado fazerem sentido junto com o restante.
4. Fatias do restante: usa `faixaLongoPrazo(o.horizonteAnos)` (a mesma tabela de `LONGO_PRAZO`),
   com `valor` preenchido de verdade (`restante * faixa.ipca`, `restante * faixa.pos`) — diferente
   do `LONGO_PRAZO` isolado, que hoje deixa `valor: null` por não ter um total definido nesse
   contexto. `percentual` também relativo ao `principal` total (`faixa.ipca * restante / principal`).
5. As 4 fatias (2 da reserva + 2 do restante) passam juntas por `casarComCatalogo`, que **já**
   soma a exposição FGC entre fatias do mesmo conglomerado (nenhuma mudança necessária ali).

**Nenhum `MotivoFatia` novo**: reaproveita `RESERVA_TESOURO_SELIC`, `RESERVA_CDB_LIQUIDEZ`,
`LONGO_PRAZO_IPCA`, `LONGO_PRAZO_POS` — os textos e lições (`src/conteudo/sugestao.ts`) já existem
e não precisam de nenhuma entrada nova.

Diferente do M5 (Renda Mensal), esta função **não precisa de `Cenario`**: os percentuais são
heurísticas fixas (`MULTIPLICADOR_RESERVA`, `FAIXAS_LONGO_PRAZO`), sem bisseção sobre CDI ao vivo.
`sugerir()` não precisa de nenhuma mudança de assinatura para este caso.

## 4. UI

`FormObjetivo.tsx` ganha um 6º bloco de campos, no mesmo padrão visual dos existentes:
**Principal (R$)**, **Gasto mensal (R$)**, **Renda** (Estável/Variável — mesmo radio que `RESERVA`
já usa), **Horizonte (anos)**. O erro de "reserva passa do total" aparece como qualquer outro erro
de validação (`role="alert"`, formulário não salva).

`Sugestao.tsx` **não precisa de nenhum bloco especial**: como não há `Cenario`, `modo` nem taxa a
calcular, o fluxo genérico que já existe (`sugerir(objetivo.entradas, ctx)` → lista de fatias →
`GraficoObjetivo`) funciona sem tocar no componente.

## 5. Testes

- **Engine (`validarObjetivo`):** os 4 campos válidos; a checagem cruzada (reserva > principal
  lança, reserva ≤ principal não lança, reserva == principal é o limite aceito).
- **Engine (`valorAlvo`):** retorna o próprio `principal`.
- **Engine (função combinadora):** fatias somam `percentual = 1` do total; a soma dos `valor` das
  4 fatias bate com `principal` (dentro de tolerância de ponto flutuante); FGC cruzado funciona
  quando a fatia de reserva (CDB) e a de longo prazo (CDB pós-fixado) caem no mesmo conglomerado do
  catálogo (reaproveita o teste de `casarComCatalogo` já existente como referência).
- **UI:** formulário valida os 4 campos e a checagem cruzada (mensagem em `role="alert"`); o resumo
  de uma linha na lista de objetivos mostra "Valor-alvo: {principal}" sem nenhum código novo; rodar
  a suíte existente de `Sugestao.test.tsx` com um objetivo `CARTEIRA_COMBINADA` para confirmar que
  nada precisa mudar lá (nenhum teste novo esperado nesse arquivo).

## 6. Marco e fluxo

Branch `m6-carteira-combinada`, a partir da `main` atualizada (após o M5 mergear). TDD estrito,
revisão de código, revisão editorial dos textos do formulário (os únicos textos novos deste marco,
já que nenhum `MotivoFatia` é criado), PR com auto-fix ligado — o mesmo fluxo de todos os marcos
anteriores.

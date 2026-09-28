# M4a: Sugestão de carteira por objetivo — Design

- **Data:** 2026-09-29
- **Status:** aprovado, pronto para o plano de implementação
- **Relação com a spec principal:** detalha e substitui a seção 9.1 de
  `docs/superpowers/specs/2026-09-27-onde-investir-design.md` ("Fase 2 — sugestão por
  objetivo"). A seção 9.2 (renda variável) permanece como M4b, à parte, porque exige
  infraestrutura nova (proxy da brapi na Cloudflare) que este marco não usa.

## 1. Objetivo

Dado um objetivo financeiro (reserva de emergência, meta com data, longo prazo ou sem
objetivo definido), sugerir uma divisão da carteira em **fatias educativas** — tipo de
produto, indexador e percentual — cada uma com o motivo explicado e um link para a lição
correspondente. **Conteúdo educativo, não recomendação de investimento personalizada.**

### Fora do escopo (M4a)

- Cálculo ou indicação de ativos de renda variável (fica para M4b, que também traz a
  infraestrutura da brapi.dev).
- Rebalanceamento automático ou acompanhamento de performance da sugestão ao longo do
  tempo.
- Mais de um valor-alvo por objetivo (ex.: aportes mensais programados).

## 2. Arquitetura

**Engine puro** (`src/engine/sugestao.ts`), sem rede nem storage, no mesmo padrão do
resto de `src/engine/`:

```ts
export interface Fatia {
  produto: TipoProduto;
  indexador: TipoIndexacao;
  percentual: number;           // fração, soma 1 por objetivo
  motivo: string;
  licao: IdLicao;
  garantia: 'FGC' | 'TESOURO_NACIONAL';
  ofertaCatalogo?: OfertaCadastrada;  // preenchida pela camada de casamento, não pelo motor puro
  avisoFGC?: string;            // quando a soma com a carteira passa do limite
}

export type Objetivo =
  | { tipo: 'RESERVA'; gastoMensal: number; rendaEstavel: boolean }
  | { tipo: 'COM_DATA'; valorAlvo: number; data: DataISO }
  | { tipo: 'LONGO_PRAZO'; horizonteAnos: number }
  | { tipo: 'SEM_OBJETIVO'; horizonteAnos: number };

export function sugerir(objetivo: Objetivo, hoje: DataISO): Fatia[];
export function valorAlvo(objetivo: Objetivo): number | null; // null quando não se aplica (longo prazo, sem objetivo)
```

Funções internas por tipo (`sugerirReserva`, `sugerirComData`, `sugerirLongoPrazo`,
`sugerirSemObjetivo`), cada uma testável isoladamente.

**Casamento com o catálogo e FGC** (`src/engine/sugestaoCatalogo.ts`, separado do motor
puro porque depende de dados externos — catálogo, carteira, cenário):

```ts
export function casarComCatalogo(
  fatias: readonly Fatia[], catalogo: readonly OfertaCadastrada[],
  carteira: readonly ItemFGC[], valorFatia: (f: Fatia) => number, hoje: DataISO, cen: Cenario,
): Fatia[]; // preenche ofertaCatalogo e avisoFGC
```

Reaproveita `src/engine/fgc.ts` (do M3a) para somar a exposição por conglomerado.

**Persistência** (`src/armazenamento/objetivos.ts`):
- Chave `rende:objetivos:v1`, lista de `{ id, tipo, nome?, criadoEm: DataISO, entradas: Objetivo }`.
- Esquema zod estrito, mesmo padrão de `ofertas.ts`/`posicoes.ts`.
- Limite de 20 objetivos.
- **Nunca entra no link compartilhável** (mesma garantia estrutural do M3c para a
  carteira: o tipo do link não tem esse campo, e ganha um teste de guarda).

**UI** (`src/ui/objetivos/`): nova aba **"Objetivos"**, entre Carteira e Aprender.
- `Objetivos.tsx`: lista de cartões (nome, tipo, resumo de 1 linha) + "+ Novo objetivo".
- `FormObjetivo.tsx`: formulário específico por tipo, com validação humana (data no
  passado, gasto ≤ 0, horizonte ≤ 0).
- `Sugestao.tsx`: gráfico de pizza (reaproveitando `src/ui/graficos/`, Chart.js sob
  demanda) + lista de fatias, cada uma com percentual, motivo, garantia, "Ver lição" e,
  se houver, "Já disponível: {oferta}" com atalho para a comparação.
- A sugestão é **recalculada a cada visualização**, contra o cenário, o catálogo e a
  carteira atuais — nunca fica congelada no que foi salvo. Só as *entradas* do objetivo
  (gasto, data, horizonte) são persistidas.

## 3. Regras de alocação

| Objetivo | Entradas | Regra |
|---|---|---|
| **Reserva de emergência** | gasto mensal; estabilidade da renda (estável = CLT/servidor, variável = autônomo/comissão) | valor-alvo = gasto × (6 se estável, 12 se variável). Alocação: 50% Tesouro Selic (garantia do Tesouro Nacional) + 50% CDB/RDB pós-fixado com liquidez diária (garantia FGC) — diversifica o **tipo de garantia**. Exclui LCI/LCA (carência) e prefixado/IPCA+ (marcação a mercado). |
| **Objetivo com data** | valor-alvo; data | procura um produto cujo **vencimento bata com a data** (ou fique no máximo até ela, sem passar), para nunca precisar vender antes do prazo. Isso inclui prefixado e IPCA+ quando o vencimento é a própria data-alvo, porque aí a marcação a mercado não entra em jogo. Sem opção casada, cai num pós-fixado que atravessa a data com liquidez diária. |
| **Longo prazo / aposentadoria** | horizonte em anos | por faixa: até 10 anos → 60% IPCA+ / 40% pós; 10–20 anos → 70% IPCA+ / 30% pós; acima de 20 → 80% IPCA+ / 20% pós. Acima de 5 anos, uma nota fixa (sem cálculo) aponta para a lição de renda variável. |
| **Sem objetivo definido** | horizonte aproximado em anos | três faixas: até 1 ano → 100% pós; 1–5 anos → 50% pós / 50% prefixado; acima de 5 → entra o IPCA+, na mesma proporção da tabela de longo prazo aplicada ao horizonte informado. |

As faixas e percentuais ficam em uma tabela de dados (`src/engine/regras/sugestao.ts`),
no mesmo padrão versionado das demais regras do motor, mesmo sem terem uma fonte legal —
o padrão facilita ajustar os números depois sem espalhar constantes pelo código.

Todo `motivo` é uma frase curta e factual (ex.: "Tesouro Selic tem garantia do Tesouro
Nacional e liquidez diária, sem risco de preço"), no mesmo tom das lições. Os textos
finais passam pela mesma revisão editorial (/vozmax + aprovação) do resto do app.

## 4. FGC combinado com a carteira

Para cada fatia com garantia FGC, `casarComCatalogo` soma o valor da fatia (proporcional
ao valor-alvo do objetivo) com a exposição já existente no mesmo conglomerado — carteira
(M3a) e outras fatias do mesmo objetivo. Se a soma passar de R$ 250 mil, a fatia ganha
`avisoFGC`: *"Somado ao que você já tem em {conglomerado}, isso passa do limite do FGC.
Considere outro emissor."* Não bloqueia a sugestão, só avisa — a escolha do emissor é do
usuário.

## 5. Erros e casos vazios

- **Catálogo vazio:** a sugestão aparece só com os tipos genéricos, sem
  "já disponível".
- **Cenário sem Focus (rede fora):** cai no cenário manual, com o mesmo aviso já usado em
  Comparar e Carteira.
- **Validação de entrada:** data no passado (objetivo com data), gasto mensal ≤ 0
  (reserva), horizonte ≤ 0 (longo prazo, sem objetivo) — mensagens humanas, mesmo padrão
  dos formulários existentes.
- **Sem oferta casada em "objetivo com data":** a sugestão explica que nenhum vencimento
  do catálogo bate com a data e sugere o pós-fixado de fallback.

## 6. Testes

- **Engine:** tabela de casos por regra, incluindo as fronteiras exatas (10 e 20 anos no
  longo prazo; 1 e 5 anos no sem-objetivo; estável × variável na reserva); o casamento de
  vencimento na data-alvo (exato, próximo, nenhum); o cálculo do FGC combinado
  (abaixo do limite, exatamente no limite, acima).
- **UI:** fluxo completo (criar objetivo → ver sugestão → editar → remover), acessibilidade
  (foco, `aria-live`, ids com prefixo `objetivo-`), teste de guarda de que objetivos nunca
  entram no link compartilhável.

## 7. Marco e fluxo

Branch `m4a`, a partir da `main` atualizada. TDD estrito, revisão de código em lotes
(engine → UI), revisão editorial dos textos, PR com auto-fix ligado — o mesmo fluxo usado
em M1 a M3c.

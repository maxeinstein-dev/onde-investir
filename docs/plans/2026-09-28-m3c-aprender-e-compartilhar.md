# M3c: Aprender e compartilhar (plano de implementação)

> **Para o Claude:** use `subagent-driven-development`. **TDD estrito.** Ligue o auto-fix no PR.

**Objetivo:** fechar o pilar educativo da fase 1 e permitir compartilhar uma comparação. Entregas:
- **Trilha "Aprender":** 10 lições. Cada uma termina em **"Experimente"**, que abre a comparação montada para a lição.
- **4 casos clássicos** prontos.
- **Progresso salvo:** lições concluídas e taxa de acerto dos palpites.
- **Dicas contextuais** e **"Você sabia?"**.
- **Alertas com link para a lição** correspondente.
- **Link compartilhável** da comparação completa, que nunca inclui a carteira.

**Spec:** §6 (pilar educativo), §5.6 (alertas → lição), §5.7 (link), §7.2 (entradas externas).

**Decisões de 2026-09-28:**
- 10 lições, sendo 8 de renda fixa e 2 conceituais (diversificação e renda variável, sem cálculo).
- O link leva a comparação completa: ofertas, valor, datas, cenário e reinvestimento.

**Branch:** `m3c`, a partir da `main` atualizada.

**Convenções:** as de sempre (português; sem assinatura de IA; sem `style=` inline; testes sem rede; invalidação derivada; ids com prefixo; `MarkdownRestrito` para os textos; zod via `src/zod.ts`).

---

## Lote A: conteúdo como dados

### A1. Modelo das lições (`src/conteudo/licoes/tipos.ts`)

```ts
export type IdLicao =
  | 'renda-fixa' | 'indexadores' | 'impostos' | 'fgc' | 'liquidez' | 'marcacao-mercado'
  | 'reserva' | 'reaplicacao' | 'diversificacao' | 'renda-variavel';
export interface Experimente {
  ofertas: readonly Omit<OfertaCadastrada, 'id'>[];   // 2 a 5
  valor: number;
  mesesAteSuaData?: number;                            // "sua data" relativa a hoje
  regra?: RegraReinvestimento;
  pergunta?: string;                                   // palpite próprio da lição (opcional)
}
export interface Licao {
  id: IdLicao; ordem: number; titulo: string; resumo: string; // resumo: 1 frase
  secoes: readonly { titulo: string; texto: string }[];      // texto em Markdown restrito
  experimente?: Experimente;                                  // renda-variavel e diversificacao: sem
  termos: readonly IdTermo[]; fontes: readonly string[];      // https oficiais
  tempoLeituraMin: number;
}
export interface CasoClassico { id: string; titulo: string; pergunta: string; explicacao: string; experimente: Experimente; licao: IdLicao }
```

**Testes de integridade** (`tests/conteudo/licoes.test.ts`):
- 10 lições, com ids únicos e ordem 1..10.
- Toda fonte é `https://` e de domínio oficial: gov.br, bcb.gov.br, planalto.gov.br, b3.com.br, fgc.org.br, tesourodireto.com.br, ibge.gov.br, anbima.com.br, cvm.gov.br.
- Todo termo existe no glossário.
- Todo `experimente`:
  - tem de 2 a 5 ofertas;
  - cada oferta passa em `validarOfertaCadastrada`;
  - `tabelaPorHorizonte` roda sem lançar com o cenário padrão.
- O texto passa pelo `MarkdownRestrito` sem sobrar sintaxe crua.
- Cada lição leva de 1 a 4 minutos de leitura (calcule por palavras, a 200 palavras por minuto).
- 4 casos clássicos, cada um com um `experimente` válido.

### A2. Redação das lições e dos casos (`src/conteudo/licoes/*.ts`, `src/conteudo/casos.ts`)

- **Lições:**
  1. Como funciona a renda fixa.
  2. Indexadores: CDI, Selic, IPCA e prefixado.
  3. IR regressivo e IOF.
  4. FGC e garantias.
  5. Liquidez e prazo mínimo.
  6. Marcação a mercado no Tesouro.
  7. Reserva de emergência.
  8. Reaplicação e o IR que recomeça.
  9. Diversificação: conceito, por que não pôr tudo no mesmo emissor nem no mesmo indexador, relação com o FGC.
  10. Renda variável: o que é, risco e volatilidade, prazo longo; conceitual, sem indicar ativos, com aviso de que o cálculo virá no M4.
- **Casos clássicos:**
  - "LCI × CDB: onde está o ponto de virada";
  - "Poupança × Tesouro Selic";
  - "Por que o prefixado assusta quando os juros sobem", com o cenário "Juros sobem";
  - "O custo escondido de reaplicar".
- **Regras de redação:**
  - Toda afirmação de regra (alíquota, limite, prazo) usa o valor que já está nas regras versionadas do engine ou no glossário, e cita a fonte.
  - Não invente números: no texto, use os valores das regras; nos exemplos, use o que o `experimente` calcula.
  - Tom direto e didático, com frases curtas. Nada de conselho personalizado; o aviso "conteúdo educativo" aparece no rodapé da trilha.
  - Verifique cada URL nova UMA vez. As que já estão no glossário foram verificadas no M1 e no M2.
- Tudo sai como **rascunho** para o portão humano (D1).

### A3. Dicas contextuais e "Você sabia?" (`src/conteudo/dicas.ts`)

```ts
export interface DicaContextual { id: string; quando: (ctx: ContextoDica) => boolean; texto: string; licao: IdLicao }
export interface ContextoDica { ofertasNaComparacao: readonly OfertaCadastrada[]; alertas: readonly Alerta[]; temCarteira: boolean }
export function dicasPara(ctx: ContextoDica, jaVistas: ReadonlySet<string>): DicaContextual[]; // no máximo 2, sem repetir as já dispensadas
export const VOCE_SABIA: readonly { texto: string; licao: IdLicao; fonte: string }[]; // 12 a 15
export function vocePassaSaber(indiceVisita: number): typeof VOCE_SABIA[number];
```

**Gatilhos:**
- tem LCI/LCA → prazo mínimo;
- tem Tesouro Prefixado/IPCA+ → marcação a mercado;
- tem poupança → aniversário;
- tem alerta de reaplicação → lição 8;
- tem mais de 1 oferta do mesmo conglomerado → FGC e diversificação;
- só 1 indexador na comparação → diversificação.

Testes para cada gatilho e para o limite de 2.

### A4. Alerta → lição (`src/conteudo/alertas.ts`)

`TextoAlerta` ganha `licao: IdLicao` (mapeamento por tipo). Teste: todo tipo de alerta tem uma lição.

## Lote B: link compartilhável

### B1. Serialização (`src/armazenamento/link.ts`)

```ts
export interface EstadoCompartilhado {
  versao: 1;
  ofertas: readonly Omit<OfertaCadastrada, 'id'>[];   // 2 a 5
  valor: number; dataAplicacao: DataISO; suaData?: DataISO;
  regra: RegraReinvestimento;
  cenario: { escolha: EscolhaCenario; premissas: Premissas; manual: ValoresManuais };
}
export async function codificar(e: EstadoCompartilhado): Promise<string>;   // "c1." + base64url(deflate-raw(JSON))
export async function decodificar(fragmento: string): Promise<{ ok: true; estado: EstadoCompartilhado } | { ok: false; erro: string }>;
```

- **Compressão:** `CompressionStream('deflate-raw')` nativo, sem dependência. Sem suporte, use o prefixo `j1.` com JSON em base64url.
- **Segurança (spec §7.2):**
  - fragmento de até 8.000 caracteres;
  - **descompressão limitada a 64 KB**, lendo o stream aos pedaços e abortando ao passar do limite (defesa contra zip bomb);
  - esquema zod **estrito** (campos extras rejeitados);
  - cada oferta passa em `validarOfertaCadastrada`;
  - textos com no máximo 80 caracteres;
  - nada de HTML: a renderização já escapa.
- **NUNCA inclui posições:** o tipo não tem esse campo, e o guarda `tests/seguranca/linkSemPosicoes.test.ts` (hoje `it.todo`) vira teste de verdade. Codifique um estado cujo objeto de entrada tenha, por engano, `posicoes`, decodifique e confira que o campo não está lá. Confira também que o JSON serializado não contém "posic".
- **Testes:**
  - ida e volta;
  - compatibilidade com o prefixo `j1.`;
  - fragmento adulterado;
  - base64 inválido;
  - zip bomb sintético (16 MB de zeros comprimidos) rejeitado sem estourar memória nem travar;
  - campo extra rejeitado;
  - 6 ofertas rejeitadas;
  - versão desconhecida rejeitada.

### B2. Roteamento do hash

- As abas usam `#comparar`, `#catalogo`, `#carteira` e `#aprender`. O link usa `#comparar/c1.…` (ou `#comparar/j1.…`).
- `Abas` e `useAbaDaUrl` entendem que o prefixo antes de `/` é a aba.
- Ao abrir um link com estado, o app troca a URL por `#comparar` com `history.replaceState`, para o estado não ficar na barra, e guarda o compartilhado em memória.
- Testes.

## Lote C: interface

### C1. Aba "Aprender" (`src/ui/aprender/`)

- Nova aba **"Aprender"** (`#aprender`), por último na barra.
- **Índice:**
  - as 10 lições em ordem, com título, resumo, tempo de leitura e ✓ nas concluídas;
  - uma barra de progresso (`<progress>` com rótulo "N de 10 lições");
  - a seção "Casos clássicos", com os 4 casos;
  - a taxa de acerto dos palpites ("Você acertou X de Y palpites"), quando houver palpites.
- **Página da lição:**
  - título e seções com `MarkdownRestrito`;
  - termos com `Termo`;
  - fontes listadas;
  - botão **"Experimente"**;
  - "Marcar como concluída" (e desmarcar);
  - "Próxima lição".
- Foco no título da lição ao abrir, e "Voltar ao índice".
- **"Experimente" e casos clássicos:** abrem a aba Comparar com uma **comparação temporária**, que não mexe na seleção salva nem no catálogo, e mostram o banner "Comparação da lição {título}. [Salvar estas ofertas no catálogo] [Voltar para a minha comparação]". Se houver pergunta, ela aparece no palpite.
- **Progresso** (`src/armazenamento/progresso.ts`):
  - `rende:progresso:v1`, validado com zod, com `{ concluidas: IdLicao[]; palpites: { acertos: number; total: number }; dicasDispensadas: string[]; visitas: number }`;
  - o Comparador registra cada palpite respondido; empate não conta;
  - try/catch no storage, como nos outros módulos.

### C2. Comparação: dicas, "Você sabia?", alertas com lição e compartilhar

- **Dicas contextuais:** no máximo 2, acima do resultado, cada uma com "Ver lição" e "Dispensar"; a dispensa fica gravada.
- **"Você sabia?":** um cartão pequeno no topo da página, que muda a cada visita (conta em `visitas`), com "Ver lição".
- **Cada alerta:** além do "Saiba mais" (Termo), ganha "Ver lição", que leva à lição correspondente.
- **Botão "Compartilhar esta comparação"** no resultado:
  - chama `codificar` e depois `navigator.clipboard.writeText(url)`;
  - status "Link copiado. Ele leva as ofertas, o valor, as datas e o cenário, sem a sua carteira.";
  - sem clipboard, mostra um campo somente leitura com o link selecionado.
- **Abrir um link:**
  - banner "Comparação compartilhada com N ofertas. [Salvar estas ofertas no catálogo] [Voltar para a minha comparação]";
  - a tabela é calculada com o cenário do link;
  - se esse cenário exigir o Focus e ele não estiver disponível, cai no manual e avisa;
  - um link inválido mostra "Este link de comparação não pôde ser aberto." e não carrega nada.

### C3. Testes de UI

Cobrem:
- índice;
- lição;
- marcar como concluída;
- "Experimente" abre a comparação temporária, e "Voltar" restaura a seleção;
- casos clássicos;
- progresso dos palpites;
- dicas, com o limite e a dispensa;
- "Você sabia?" muda com as visitas;
- alerta → lição;
- compartilhar (clipboard mockado);
- abrir um link válido e um inválido;
- `replaceState`;
- salvar no catálogo.

## Lote D: portão humano, verificação e PR

- **D1:** os textos das 10 lições, dos 4 casos, das dicas, do "Você sabia?" e da UI passam pelo /vozmax. Mostre ao usuário lição por lição e **espere a aprovação**. As URLs são verificadas antes.
- **D2:** rode `lint`, `typecheck`, `test` e `build`. No navegador:
  - percorra a trilha;
  - use o "Experimente";
  - compartilhe e abra o link numa aba anônima (sem catálogo);
  - confira 375 px sem rolagem;
  - confira o console sem erros com a CSP de produção.
- **D3:** revisão de código com foco em segurança do link e acessibilidade.
- **D4:** abra o PR com o auto-fix ligado.

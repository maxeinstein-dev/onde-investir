# M2.1: Comparador de até 5 ofertas (estilo "comparar celulares"). Plano de implementação

> **Para o Claude:** use `subagent-driven-development`. **TDD estrito.**

**Objetivo:** trocar as abas "Comparar ofertas" e "Duelo rápido" por uma tela única de
comparação, com 2 a 5 ofertas lado a lado em colunas. As ofertas entram por "+ Adicionar",
escolhendo do catálogo ou criando uma na hora, e saem com ✕. O que o duelo tinha de bom
(palpite, "Por que esse resultado?", equivalências) fica na tela nova.

**Spec:** `docs/superpowers/specs/2026-09-27-onde-investir-design.md` §5.2
("Comparador de até 5 (M2.1)").

**Base:** a branch `m2`, já pronta (483 testes). Trabalhe na branch `m2-comparador`,
criada a partir da `m2` (ou da `main`, se o PR do M2 já tiver sido mergeado).

**Convenções:** as do M1 e do M2. Commits em português, sem assinatura de IA. Sem
`style=` inline. Nenhum teste chama a rede. Ids com prefixo por componente, porque os
painéis ficam montados ao mesmo tempo.

**O engine não muda.** `tabelaPorHorizonte`, `linhaDoTempo`, `projetar`,
`calcularEquivalencias` e os textos de `src/conteudo/` já cobrem tudo. O que muda é a
organização da tela, com as ofertas nas **colunas** e os horizontes nas **linhas**.

---

### Tarefa 1: Seleção persistida (`src/armazenamento/comparacao.ts`)

```ts
export const LIMITE_COMPARACAO = 5;
export function lerSelecao(arm: Armazenamento): string[];              // ids, na ordem
export function salvarSelecao(arm: Armazenamento, ids: readonly string[]): boolean;
export function sincronizarSelecao(ids: readonly string[], catalogo: readonly { id: string }[]): string[]; // remove ids que sumiram; sem duplicados; corta em 5
export function adicionar(ids: readonly string[], id: string): { ids: string[]; erro?: string };  // "A comparação já tem 5 ofertas. Tire uma para adicionar outra."
export function remover(ids: readonly string[], id: string): string[];
```

- Chave `rende:comparacao:v1`, validada com zod (array de strings, no máximo 5).
- Testes: ida e volta; ids órfãos saem; duplicado não entra; o 6º devolve erro; storage
  que lança → `[]`.

### Tarefa 2: Tabela transposta (`src/ui/comparacao/TabelaComparacao.tsx`)

Props: `{ ofertas: OfertaCadastrada[]; colunas: ColunaHorizonte[]; onRemover(id) }`.
As `colunas` saem de `tabelaPorHorizonte`: cada `ColunaHorizonte` vira uma **linha**
da tabela.

- `<table>` com `<caption>` "Comparação de N ofertas".
- **Cabeçalho (`<thead>`):** a primeira célula é vazia. Cada oferta tem `th scope="col"`
  com letra (A…E), `nomeOferta` e o botão "✕ Tirar da comparação" (`aria-label`
  "Tirar <nome> da comparação").
- **Bloco "Características" (`<tbody>`):** linhas com `th scope="row"`:
  - Rentabilidade (`descreverOferta`);
  - Emissor;
  - Liquidez ("Diária", ou "Só no vencimento");
  - Vencimento (`dd/mm/aaaa` ou "Sem vencimento");
  - Prazo mínimo (só LCI/LCA; nas demais, "—");
  - Garantia (Termo FGC ou Tesouro);
  - Imposto de Renda ("Isento" ou "Tabela regressiva").
- **Bloco "Valor líquido" (`<tbody>`):** uma linha por horizonte, com o rótulo
  ("6 meses", …, "15/01/2032 (sua data)"). A célula mostra a moeda ou o estado
  (`descreverProjecao`).
  - Líder: classe `celula--lider`, selo visível "maior" (`aria-hidden`) e texto
    visualmente oculto "maior valor líquido".
  - Cada célula disponível tem o `<details>` "Por que?", com conteúdo sob demanda (o
    padrão do M2, que inclui reaplicação).
- **Celular:** o contêiner rola na horizontal (`overflow-x: auto`, `tabindex="0"` e
  rótulo). A primeira coluna fica fixa com `position: sticky; left: 0`, com fundo
  sólido.
- Testes:
  - com 3 ofertas: 3 `th scope=col`;
  - 7 linhas de características;
  - uma linha por horizonte;
  - líder marcado na linha certa;
  - LCI em 6 meses: "Indisponível até";
  - ✕ chama `onRemover` com o id;
  - abrir o details mostra os passos.

### Tarefa 3: "+ Adicionar": seletor (`src/ui/comparacao/AdicionarOferta.tsx`)

**Não use `<dialog>`**: o jsdom não suporta `showModal`. Use um painel de revelação:
- O botão "+ Adicionar oferta (N de 5)" tem `aria-expanded` e `aria-controls`. Fica
  desabilitado com 5 ofertas e mostra o texto "Limite de 5 ofertas".
- **O painel tem duas partes:**
  1. **"Do catálogo":** lista das ofertas do catálogo que ainda não estão na comparação,
     cada uma com o botão "Adicionar <nome>". Se o catálogo estiver vazio (ou todas as
     ofertas já estiverem na comparação), mostre uma frase explicando.
  2. **"Criar uma nova":** o `FormOfertaCadastrada` do M2, com prefixo de id próprio.
     Salvar faz as duas coisas: grava no catálogo e adiciona à comparação.
- Ao adicionar, o painel fecha e o foco vai para o cabeçalho da coluna nova. Com Esc, o
  painel fecha e o foco volta para o botão.
- Testes: adicionar do catálogo; criar nova (entra no catálogo e na comparação); limite
  de 5 (botão desabilitado); foco; Esc.

### Tarefa 4: Tela de comparação (`src/ui/comparacao/Comparador.tsx`), que substitui `Comparacao` e `DueloRapido`

Contrato:
- **Entradas:** o valor único; a data da aplicação (padrão hoje); "sua data", opcional; o
  reinvestimento, que usa o mesmo seletor do M2. Tudo com a validação de datas e de
  cenário do M2, incluindo o aviso "Corrija o cenário no painel antes de comparar.".
- **Com 0 ou 1 oferta:** mostre o estado vazio "Adicione pelo menos duas ofertas para
  comparar (até 5).", com o botão "+ Adicionar" em destaque.
- **"Comparar":** aparece o palpite ("Qual lidera em <horizonte mais distante>?"),
  seguindo as regras do M2: é pulado se ninguém estiver disponível ou se os palpites
  estiverem desligados. Depois vem o resultado:
  1. A `TabelaComparacao`.
  2. A linha do tempo, com `concluirLinhaDoTempo` e a última coluna.
  3. **Equivalências:** um `<select>` "Calcular equivalências para" com as ofertas (padrão
     A) e outro "no prazo de" com os horizontes (padrão: o mais distante disponível para
     aquela oferta). Usa `calcularEquivalencias` com a aplicação da oferta até a data
     escolhida. Se a oferta estiver indisponível nessa data, explique o motivo, no padrão
     do duelo no M2. O componente `Equivalencias` é reaproveitado.
- **Invalidação:** qualquer mudança em entradas, seleção, ofertas ou cenário invalida o
  resultado. A invalidação é derivada na renderização, no padrão do M2.
- **Remoção:** tirar uma oferta com o resultado aberto recalcula na hora, se ainda
  restarem 2 ou mais. Não repete o palpite.
- Testes (adapte os do `DueloRapido.test.tsx` e do `Comparacao.test.tsx` que ainda fazem
  sentido; os demais são removidos junto com os componentes):
  - estado vazio;
  - adicionar 2 e comparar;
  - palpite com 3 ofertas;
  - equivalências para a oferta B em 2 anos;
  - oferta indisponível nas equivalências;
  - remover a coluna recalcula;
  - editar o valor invalida;
  - datas inválidas.

### Tarefa 5: Catálogo e navegação

- `MinhasOfertas` passa a se chamar **"Catálogo de ofertas"**. Cada cartão ganha o botão
  "Comparar", ou "Na comparação ✓" desabilitado se já estiver lá, ou desabilitado com o
  limite de 5 atingido.
- **App:** duas abas, **"Comparar"** (padrão, `#comparar`) e **"Catálogo"**
  (`#catalogo`). Hashes antigos: `#duelo` e `#ofertas` levam para `#comparar`.
- **Remover do catálogo** tira a oferta da comparação (`sincronizarSelecao`).
- **Migração:** na primeira carga, se não houver seleção salva e o catálogo tiver
  ofertas, a comparação começa vazia (não adiciona sozinha).
- **Remova:** `DueloRapido.tsx`, `Comparacao.tsx` e `TabelaHorizontes.tsx`, além dos
  testes deles que foram substituídos. O `FormOferta` do M1 continua, porque é usado pelo
  `FormOfertaCadastrada`.
- Testes do App: abre em "Comparar"; `#duelo` vai para "Comparar"; "Comparar" no catálogo
  adiciona e troca de aba; remover do catálogo tira da comparação; a seleção persiste ao
  recarregar.

### Tarefa 6: Conteúdo novo (portão humano)

Os textos novos (estado vazio, limite, seletor, catálogo vazio, rótulos das linhas)
passam pelo /vozmax e pela aprovação do usuário antes do PR.

### Tarefa 7: Verificação e PR

1. `lint`, `typecheck`, `test` e `build` verdes.
2. No navegador:
   - adicionar 5 ofertas e confirmar que o 6º "Adicionar" fica bloqueado;
   - tirar uma, criar uma nova pelo seletor;
   - largura de 375 px: a coluna de rótulos fica fixa, a tabela rola só dentro do
     contêiner e a página não rola na horizontal;
   - console sem erros.
3. Revisão de código da branch.
4. Com o ok do usuário: push, abrir o PR e conferir o preview.

# Redesign do Rende: sistema visual, navegação e telas

Design aprovado em conversa em 2026-09-29. Esta é a segunda etapa da vida do app: a implementação original (M1 a M6, M4a, M4b) terminou, e o foco passa a ser a interface.

## Objetivo

Deixar o Rende mais moderno e mais fácil de usar, atacando quatro dores que a pessoa apontou:

1. **Visual datado:** aparência simples demais, sem coesão.
2. **Navegação e fluxo:** seis abas, mais o painel de cenário no topo, competem pela atenção.
3. **Celular:** telas densas a 375px.
4. **Leitura dos resultados:** falta hierarquia; o número que importa não se destaca.

## Direção visual

Referências: Wealthfront e Betterment (estrutura calma, espaço em branco, um número principal por tela) e Nubank (mobile-first, identidade com personalidade, formulários curtos). Caminho escolhido: **base calma com toques do Nubank**.

Restrições que não mudam: custo zero, nenhuma dependência externa em tempo de execução (a CSP só aceita `'self'`, com `frame-src`/`script-src`/`connect-src` já liberados para o Turnstile e o Banco Central), 375px sem scroll horizontal, contraste AA, navegação por teclado.

## Entrega em fases

Cada fase é um ou mais PRs pequenos, mesclados em produção separadamente. Nenhuma fase altera regra de cálculo, dado, Function, KV ou Turnstile.

### Fase 1: sistema visual

- **Tokens de cor claro e escuro.** Os tokens de `:root` em `src/ui/estilos.css` ganham dois conjuntos, trocados por `prefers-color-scheme` (automático, sem botão). Papéis: fundo, superfície, texto, texto suave, borda, primária, destaque, sucesso, erro, aviso, foco. Todo par de texto e fundo com contraste AA (4,5:1 para texto, 3:1 para elementos gráficos), nos dois temas.
- **Cor de marca:** verde-petróleo (teal) no lugar do azul `#0b5cad`.
- **Tipografia:** uma fonte variável moderna com licença livre (candidata: Inter), hospedada em `public/fonts/` como woff2 e carregada por `@font-face`. A CSP `font-src 'self'` já cobre. Pilha de reserva com fontes do sistema. Escala tipográfica com um tamanho "display" para o número principal de cada resultado.
- **Espaço e forma:** escala de espaçamento em múltiplos de 4 e 8 px; cartões com cantos de 12 a 16 px e sombra sutil em vez de borda forte; alvos de toque de pelo menos 48 px no celular; foco visível mantido.
- **Componentes base**, definidos uma vez e reaproveitados: botão (primário, secundário, texto), campo de formulário, cartão, número em destaque, selo/chip e caixa de aviso.
- **Gráficos.** Os gráficos já leem os tokens `--grafico-*` na hora de desenhar (`src/ui/graficos/cores.ts`). Ajustes: os tokens ganham valores para o tema escuro; o gráfico é redesenhado quando `prefers-color-scheme` muda; o `PADRAO` de reserva em `cores.ts` acompanha a paleta nova.
- **Testes de estilo.** `tests/ui/estilos.test.ts` continua valendo (quebra de texto longo, glossário `position: fixed`). Ganha checagem de contraste AA dos pares de token nos dois temas.

### Fase 2: estrutura e navegação

- **Celular (até 639 px):** barra fixa inferior com **Comparar, Carteira, Objetivos, Renda variável** e um botão **Mais** que abre uma folha com **Catálogo** e **Aprender**. A barra respeita a área segura do aparelho e o conteúdo ganha margem inferior para nada ficar atrás dela.
- **Desktop (640 px ou mais):** as seis abas no topo, como hoje.
- **Mesmo mecanismo por baixo.** Hash (`#carteira`, `#aprender/fgc`), apelidos, link compartilhável e a regra "todas as abas ficam montadas" não mudam. Os itens da barra mantêm `role="tab"`; o "Mais" é um menu com `aria-expanded`.
- **Cenário recolhido.** O `PainelIndicadores` sai do topo. Em seu lugar, uma linha-resumo (cenário, CDI, IPCA, data de atualização). Tocar nela abre o painel completo como painel de revelação (não `<dialog>`): o botão tem `aria-expanded`, o conteúdo fica sempre montado e escondido quando fechado, Esc fecha e devolve o foco ao botão. O conteúdo do painel não muda.
- **Cabeçalho:** encolhe para nome do app e uma frase curta. Os avisos (conteúdo educativo, Turnstile) vão para um rodapé ao fim do conteúdo; o aviso do Turnstile também aparece dentro da aba Renda variável, onde ele age. Nenhum texto some.
- **Testes a adaptar:** `App`, `AppAprender`, `AppCarteira`, `PainelIndicadores` (contagem de abas, localização do painel).

### Fase 3: telas, um PR cada

Ordem: **Renda variável** (piloto, valida os componentes base) → **Comparar** → **Carteira** → **Objetivos** → **Catálogo** → **Aprender**.

Padrões para todas:

- **Resultado em destaque:** número grande e a frase que o explica, gráfico logo abaixo, detalhe recolhido.
- **Formulários curtos no celular:** um campo por linha, rótulo acima, ação principal de largura total.
- **Tabelas viram cartões empilhados no celular**; continuam tabelas no desktop.
- **"Por quê?"** continua sendo o centro do app, como bloco expansível bem à vista.

## Fora do escopo

Novas funcionalidades, animações elaboradas, ilustrações próprias, botão manual de tema, e qualquer mudança em Functions, KV, Turnstile ou motor de cálculo.

## Verificação (em cada PR)

- `npm test`, `npm run typecheck`, `npm run lint`.
- No navegador, a 375 px e em desktop, nos temas claro e escuro: sem scroll horizontal, foco por teclado, contraste. Relatar o que não foi possível verificar.
- Os testes de motor e de dados não podem quebrar; se quebrarem, é sinal de mudança fora do escopo.

## Riscos

- **Barra inferior e painel de revelação** mexem em foco e em teclado; exigem teste de acessibilidade real, não só de renderização.
- **Muitas telas com CSS acoplado** (1340 linhas num arquivo): a Fase 1 deve manter nomes de classe existentes e trocar valores por tokens antes de reescrever componentes, para o PR não virar uma reescrita.
- **Fonte hospedada** soma alguns KB ao carregamento inicial; usar `font-display: swap` e só os pesos necessários.

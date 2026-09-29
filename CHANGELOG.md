# Changelog

Registro das mudanças do Rende por marco de entrega. Formato livre, em português, focado no que
muda pra quem usa o app — não é um changelog técnico linha a linha (isso já fica no histórico do
git e nos PRs).

## Renda mensal inviável: renda estimada com o que você tem

A sugestão de renda mensal ficou mais útil quando o valor informado não chega na meta. Em vez de "Falta R$ 3.000/mês", o app mostra quanto o seu dinheiro já renderia por mês, líquido de imposto, num CDB a 100% do CDI e na sua melhor oferta do catálogo, e o que ainda falta de verdade (a meta menos essa renda). O valor necessário também considera o custo extra da oferta, e vem com um lembrete de carência quando a melhor oferta é uma LCI/LCA. Sem ofertas no catálogo, o gráfico vazio (que aparecia como um bloco em branco) não é mais desenhado, e o aviso educativo ganhou espaçamento.

## Sugestão de renda mensal inviável — quanto seria preciso aplicar

Quando a renda mensal desejada não cabe no valor informado (por exemplo, R$ 3 mil por mês com R$ 50 mil), a sugestão de Objetivos agora mostra quanto seria preciso aplicar num CDB a 100% do CDI, uma oferta fácil de encontrar, e, se houver oferta melhor no catálogo, o valor por ela também. O cálculo usa o cenário ativo, com IR e IOF de 30 dias.

## Redesign — visual novo, navegação no celular e telas reorganizadas ([#23](https://github.com/maxeinstein-dev/onde-investir/pull/23), [#24](https://github.com/maxeinstein-dev/onde-investir/pull/24) e este)

O Rende ganhou um visual novo e ficou mais fácil de usar, principalmente no celular. Nenhuma regra de cálculo mudou.

- **Tema claro e escuro**, automático conforme o sistema, com uma cor de marca em verde-petróleo, tipografia Inter hospedada no próprio site e contraste conferido nos dois temas. Os gráficos acompanham o tema.
- **Celular:** barra de navegação fixa embaixo com Comparar, Carteira, Objetivos e Renda variável; Catálogo e Aprender ficam em "Mais". No computador, as seis abas seguem no topo.
- **Cenário recolhido:** o painel de indicadores virou uma linha-resumo ("Cenário: Base (Focus) · CDI … · IPCA …") que abre o painel completo. Os avisos foram para o rodapé.
- **Resultado em destaque:** o Comparar mostra o valor líquido do líder em número grande, com a frase que o explica; a Carteira mostra o total líquido; Objetivos e Renda variável ganharam o mesmo padrão. No celular, a tabela de comparação vira cartões.
- **Formulários mais curtos no celular**, com campos e botões de pelo menos 48px.

## M4b2c — Cálculo de renda variável

Nova aba "Renda variável": você digita o código de um ativo da B3 (como PETR4 ou HGLG11) e o app
mostra a rentabilidade no histórico disponível, a volatilidade anualizada e a queda máxima,
comparadas a CDI e IPCA no mesmo período. É um retrato do passado, não uma indicação de ativo. O
desafio do Cloudflare Turnstile roda quando você abre a aba e libera a sessão usada pelas consultas
de mercado. Limitação conhecida: os cálculos usam o fechamento, sem ajuste por proventos. Fecha o
roadmap original.

## M6 — Objetivo "Carteira Combinada" ([#16](https://github.com/maxeinstein-dev/onde-investir/pull/16))

Novo 6º tipo de objetivo na aba Objetivos: dado um principal, um gasto mensal e um horizonte, o app
divide o valor entre reserva de emergência e o restante, sem exigir que você cadastre objetivos
separados pra cada horizonte. O restante já se comporta como um gradiente médio→longo prazo (mais
pós-fixado pra horizontes mais curtos, mais IPCA+ pra mais longos), reaproveitando a mesma lógica
de "Longo Prazo" — sem inventar uma categoria "médio prazo" nova.

## M5 — Objetivo "Renda Mensal" ([#15](https://github.com/maxeinstein-dev/onde-investir/pull/15))

Novo 5º tipo de objetivo: dado um principal e uma renda mensal desejada, o app calcula o %CDI
necessário (num CDB/RDB tributado e numa LCI/LCA isenta) e sugere a oferta do seu catálogo que
chega lá — ou, quando nenhuma basta sozinha, a melhor opção disponível, com o quanto ainda falta.
A LCI/LCA aparece como uma taxa de referência (ela tem carência legal de 6 meses, incompatível com
uma renda saída todo mês desde o início).

## M4b2a — Portão de acesso com Turnstile ([#14](https://github.com/maxeinstein-dev/onde-investir/pull/14))

Infraestrutura de segurança pra proteger as futuras chamadas à brapi.dev (dados de renda variável,
ainda por vir): um desafio Turnstile invisível, resolvido uma vez, que libera um cookie de sessão
assinado por 24h. Não muda nada visível pra quem usa o app hoje — as calculadoras de renda fixa
continuam chamando o Banco Central direto do navegador, como sempre.

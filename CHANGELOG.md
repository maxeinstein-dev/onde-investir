# Changelog

Registro das mudanças do Rende por marco de entrega. Formato livre, em português, focado no que
muda pra quem usa o app — não é um changelog técnico linha a linha (isso já fica no histórico do
git e nos PRs).

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

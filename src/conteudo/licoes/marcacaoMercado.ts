// Lição 6. RASCUNHO para o portão humano (plano M3c, D1).
import { FONTES, link } from './fontes';
import { tesouroIPCA, tesouroPrefixado, tesouroSelic } from './ofertas';
import { REGRAS } from './regras';
import { definirLicao } from './tipos';

const { custodia } = REGRAS;

export const MARCACAO_MERCADO = definirLicao({
  id: 'marcacao-mercado',
  ordem: 6,
  titulo: 'Marcação a mercado no Tesouro',
  resumo: 'O preço dos títulos do Tesouro muda todo dia, e isso só pesa para quem vende antes do vencimento.',
  secoes: [
    {
      titulo: 'O preço muda todo dia',
      texto: `A **marcação a mercado** é a atualização diária do preço de um título pelas taxas do mercado. Quem vende antes do vencimento recebe esse preço, que pode ser maior ou menor que o previsto. Quem leva o título até o vencimento recebe a taxa combinada (${link('Portal do Investidor', FONTES.titulosPublicos)}).`,
    },
    {
      titulo: 'Por que o preço cai quando os juros sobem',
      texto: [
        'Pense num Tesouro Prefixado comprado hoje. Se amanhã os juros do mercado sobem, os títulos novos passam a pagar mais. Para alguém aceitar comprar o seu, que paga menos, ele precisa sair mais barato. O preço cai.',
        'Quando os juros caem, acontece o contrário: o título antigo paga mais que os novos, e o preço sobe. O IPCA+ tem o mesmo efeito sobre a parte do juro real.',
      ].join('\n\n'),
    },
    {
      titulo: 'E o Tesouro Selic?',
      texto: 'O Tesouro Selic acompanha a taxa básica de juros, então não trava uma taxa por anos como o prefixado. Por isso o app trata a venda dele antes do vencimento pela própria Selic do cenário, sem o alerta de preço de mercado.',
    },
    {
      titulo: 'No app',
      texto: [
        'O app não calcula o preço de mercado de um dia futuro. Antes do vencimento, o Prefixado e o IPCA+ aparecem com o aviso de venda a preço de mercado, e o gráfico mostra o valor na curva contratada.',
        `Todo título do Tesouro paga a taxa de custódia da B3: ${custodia.taxa} ao ano, descontada no resgate, no vencimento ou no pagamento de juros. No Tesouro Selic, os primeiros ${custodia.isencaoSelic} são isentos (${link('B3', FONTES.custodiaB3)}).`,
      ].join('\n\n'),
    },
  ],
  experimente: {
    ofertas: [tesouroPrefixado(0.13, 36), tesouroIPCA(0.075, 60), tesouroSelic(60)],
    valor: 10_000,
    mesesAteSuaData: 12,
  },
  termos: ['marcacao-mercado', 'tesouro', 'prefixado', 'ipca-mais', 'custodia'],
  fontes: [FONTES.titulosPublicos, FONTES.custodiaB3],
});

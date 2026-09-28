// Lição 8. RASCUNHO para o portão humano (plano M3c, D1).
import { FONTES, link } from './fontes';
import { cdbPos, letra } from './ofertas';
import { REGRAS } from './regras';
import { definirLicao } from './tipos';

const { ir, iof } = REGRAS;

export const REAPLICACAO = definirLicao({
  id: 'reaplicacao',
  ordem: 8,
  titulo: 'Reaplicação e o IR que recomeça',
  resumo: 'Quando uma aplicação vence e o dinheiro é aplicado de novo, a contagem do IR volta ao começo.',
  secoes: [
    {
      titulo: 'Quando a aplicação vence antes da sua data',
      texto: 'Se uma oferta vence antes da data que você está comparando, o dinheiro precisa ir para algum lugar. O app aplica de novo o valor líquido do vencimento, e é isso que chamamos de **reinvestimento**.',
    },
    {
      titulo: 'O IR recomeça',
      texto: [
        `Cada aplicação conta o seu próprio prazo de IR (${link('Lei 11.033/2004', FONTES.lei11033)}). Na reaplicação, a contagem volta a zero e a alíquota volta para ${ir.maior}.`,
        `Quem deixa o dinheiro aplicado o tempo todo chega à alíquota de ${ir.menor} depois de ${ir.limites.at(-1) ?? 0} dias. Quem reaplica a cada ano paga ${ir.aliquotas[2] ?? ''} de novo a cada vencimento e nunca chega lá. Essa diferença é o custo escondido de reaplicar.`,
      ].join('\n\n'),
    },
    {
      titulo: 'A isenta que vira tributada',
      texto: `A LCI e a LCA são isentas de IR (${link('Portal do Investidor', FONTES.lciLca)}). Se o dinheiro dela vence e vai para um CDB, o rendimento da reaplicação passa a pagar IR. O app avisa quando isso acontece.`,
    },
    {
      titulo: 'IOF na reaplicação',
      texto: `Se a reaplicação for resgatada com menos de ${iof.diaQueZera} dias, ela também paga IOF sobre o rendimento (${link('Decreto 6.306/2007', FONTES.decretoIOF)}).`,
    },
    {
      titulo: 'Onde o app reaplica',
      texto: [
        'Você escolhe a regra na comparação. Na regra padrão:',
        '- o pós-fixado é reaplicado na mesma oferta;\n- o prefixado, o IPCA+ e a poupança vão para um CDB de 100% do CDI, sem custo extra.',
        'As outras opções são reaplicar na mesma taxa, em 100% do CDI ou numa taxa fixa que você digita.',
      ].join('\n\n'),
    },
  ],
  experimente: {
    ofertas: [letra('LCI', 0.9, 12, { liquidez: 'NO_VENCIMENTO' }), cdbPos(1.03, 12, { liquidez: 'NO_VENCIMENTO' }), cdbPos(1.03, 60, { liquidez: 'NO_VENCIMENTO' })],
    valor: 10_000,
    regra: { tipo: 'CDI_100' },
  },
  termos: ['reinvestimento', 'ir-regressivo', 'lci-lca', 'iof'],
  fontes: [FONTES.lei11033, FONTES.lciLca, FONTES.decretoIOF],
});

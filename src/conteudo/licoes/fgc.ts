// Lição 4. RASCUNHO para o portão humano (plano M3c, D1).
import { FONTES, link } from './fontes';
import { BETA, cdbPos, letra, tesouroSelic } from './ofertas';
import { REGRAS } from './regras';
import { definirLicao } from './tipos';

const { fgc } = REGRAS;

export const FGC = definirLicao({
  id: 'fgc',
  ordem: 4,
  titulo: 'FGC e garantias',
  resumo: 'O FGC devolve o dinheiro se o banco quebrar, até um limite por pessoa em cada conglomerado.',
  secoes: [
    {
      titulo: 'O que o FGC faz',
      texto: [
        `O **FGC**, Fundo Garantidor de Créditos, entra em ação se um banco associado quebrar. Ele devolve até ${fgc.porConglomerado} por pessoa em cada instituição ou conglomerado financeiro, somando o valor aplicado e os rendimentos (${link('regulamento do FGC', FONTES.regulamentoFGC)}).`,
        `Há também um teto global: ${fgc.tetoGlobal} a cada ${fgc.janelaAnos} anos, somando o que o FGC pagar em todas as instituições.`,
      ].join('\n\n'),
    },
    {
      titulo: 'O que tem a garantia',
      texto: [
        'Têm a garantia do FGC:',
        '- CDB, RDB e LC;\n- LCI e LCA;\n- poupança.',
        `Os títulos do Tesouro Direto não têm FGC. A garantia deles é do Tesouro Nacional, considerada o menor risco de crédito do país (${link('Portal do Investidor', FONTES.titulosPublicos)}).`,
      ].join('\n\n'),
    },
    {
      titulo: 'O limite é por conglomerado',
      texto: 'O limite vale por conglomerado financeiro: dois bancos do mesmo grupo dividem um limite só. Antes de somar aplicações, confira a que conglomerado cada banco pertence.',
    },
    {
      titulo: 'O que passa do limite',
      texto: `O que passar de ${fgc.porConglomerado} no mesmo conglomerado fica sem garantia. Como o limite conta os rendimentos, uma aplicação abaixo dele hoje pode passar dele com o tempo. O app avisa quando a soma da sua carteira com a oferta passa do limite, e o "Experimente" desta lição usa um valor acima dele para mostrar o alerta.`,
    },
  ],
  experimente: {
    ofertas: [cdbPos(1.1, 60, { liquidez: 'NO_VENCIMENTO' }), letra('LCI', 0.9, 60), cdbPos(1.05, 60, { ...BETA, liquidez: 'NO_VENCIMENTO' }), tesouroSelic(60)],
    valor: 300_000,
  },
  termos: ['fgc', 'cdb', 'lci-lca', 'poupanca', 'tesouro'],
  fontes: [FONTES.regulamentoFGC, FONTES.titulosPublicos],
});

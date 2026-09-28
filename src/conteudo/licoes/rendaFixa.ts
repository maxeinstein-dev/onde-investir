// Lição 1. RASCUNHO para o portão humano (plano M3c, D1).
import { FONTES, link } from './fontes';
import { cdbPos, cdbPre } from './ofertas';
import { REGRAS } from './regras';
import { definirLicao } from './tipos';

export const RENDA_FIXA = definirLicao({
  id: 'renda-fixa',
  ordem: 1,
  titulo: 'Como funciona a renda fixa',
  resumo: 'Você empresta dinheiro a um banco ou ao governo e recebe juros por regras combinadas na aplicação.',
  secoes: [
    {
      titulo: 'Você empresta, alguém paga juros',
      texto: [
        'Na renda fixa, você empresta dinheiro e recebe juros em troca. A regra do rendimento fica definida na aplicação: uma taxa fixa, um percentual de um indicador ou a inflação mais uma taxa.',
        `No **CDB**, na **LCI** e na **LCA**, quem recebe o dinheiro é um banco. No **Tesouro Direto**, é o governo federal (${link('Portal do Investidor, títulos públicos', FONTES.titulosPublicos)}).`,
      ].join('\n\n'),
    },
    {
      titulo: 'Fixa não quer dizer sem risco',
      texto: [
        `Apesar do nome, os títulos de renda fixa têm riscos que precisam ser avaliados (${link('Portal do Investidor', FONTES.caracteristicas)}). Os três principais:`,
        [
          '- **crédito**: quem recebeu o dinheiro não pagar;',
          '- **liquidez**: você precisar do dinheiro antes da data em que ele pode sair;',
          '- **preço**: o valor do título mudar antes do vencimento, a chamada marcação a mercado.',
        ].join('\n'),
        `Para o risco de crédito dos bancos existe o **FGC**, que cobre até ${REGRAS.fgc.porConglomerado} por pessoa em cada conglomerado financeiro (${link('regulamento do FGC', FONTES.regulamentoFGC)}).`,
      ].join('\n\n'),
    },
    {
      titulo: 'O que vale é o que chega no bolso',
      texto: [
        'Comparar pela taxa anunciada engana, porque cada produto tem descontos diferentes: imposto de renda, IOF e, no Tesouro, a taxa de custódia.',
        `A LCI e a LCA são isentas de IR para pessoa física (${link('Portal do Investidor', FONTES.lciLca)}), e a poupança também (${link('Banco Central', FONTES.poupancaBCB)}). O CDB e o Tesouro pagam IR.`,
        'Por isso o app compara sempre o **valor líquido**: o que sobra depois de todos os descontos.',
      ].join('\n\n'),
    },
    {
      titulo: 'Na prática',
      texto: 'O "Experimente" desta lição põe lado a lado um CDB pós-fixado com liquidez diária e um CDB prefixado que só paga no vencimento. Olhe o valor líquido de cada um nos prazos da tabela e repare em quando cada um pode ser resgatado.',
    },
  ],
  experimente: {
    ofertas: [cdbPos(1), cdbPre(0.13, 36)],
    valor: 10_000,
    mesesAteSuaData: 36,
    pergunta: 'Em 3 anos, quem entrega mais no bolso: o CDB pós-fixado ou o prefixado?',
  },
  termos: ['cdb', 'lci-lca', 'tesouro', 'fgc', 'liquidez', 'valor-liquido'],
  fontes: [FONTES.titulosPublicos, FONTES.caracteristicas, FONTES.regulamentoFGC, FONTES.lciLca, FONTES.poupancaBCB],
});

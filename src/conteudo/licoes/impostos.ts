// Lição 3. RASCUNHO para o portão humano (plano M3c, D1).
import { FONTES, link } from './fontes';
import { cdbPos, letra, tesouroSelic } from './ofertas';
import { REGRAS } from './regras';
import { definirLicao } from './tipos';

const { ir, iof } = REGRAS;

export const IMPOSTOS = definirLicao({
  id: 'impostos',
  ordem: 3,
  titulo: 'IR regressivo e IOF',
  resumo: 'O imposto de renda cai com o prazo, e o IOF só aparece nos primeiros dias.',
  secoes: [
    {
      titulo: 'IR: quanto mais tempo, menor a alíquota',
      texto: [
        `O imposto de renda da renda fixa cobra uma parte do **rendimento**, não do valor aplicado. Essa parte diminui com o tempo: ${ir.faixas} (${link('Lei 11.033/2004', FONTES.lei11033)}).`,
        'O prazo conta em dias corridos, da aplicação até o resgate. O imposto é retido no resgate ou no vencimento, e você recebe o valor já descontado.',
      ].join('\n\n'),
    },
    {
      titulo: 'IOF: só nos primeiros dias',
      texto: `Quem resgata com menos de ${iof.diaQueZera} dias paga também IOF sobre o rendimento. A alíquota começa em ${iof.primeiroDia} no 1º dia e cai a cada dia até zerar no ${iof.diaQueZera}º (${link('Decreto 6.306/2007', FONTES.decretoIOF)}). Depois disso, o IOF não aparece mais.`,
    },
    {
      titulo: 'Quem não paga IR',
      texto: [
        `A LCI e a LCA são isentas de IR para pessoa física (${link('Portal do Investidor', FONTES.lciLca)}). A poupança também é isenta (${link('Banco Central', FONTES.poupancaBCB)}).`,
        'Por isso uma LCI com um percentual menor do CDI pode entregar mais que um CDB com percentual maior. Quem ganha depende da alíquota de IR no prazo do resgate: a isenção pesa mais nos prazos curtos, em que o CDB paga a alíquota mais alta.',
      ].join('\n\n'),
    },
    {
      titulo: 'A ordem da conta no app',
      texto: 'No app, a conta segue esta ordem: rendimento bruto, menos IOF, menos a custódia (no Tesouro), menos o IR. O que sobra é o valor líquido. O "Por que esse resultado?" mostra cada passo com os números da sua simulação.',
    },
  ],
  experimente: {
    ofertas: [cdbPos(1), letra('LCA', 0.9, 60), tesouroSelic(60)],
    valor: 10_000,
    pergunta: 'Em 6 meses, quem entrega mais no bolso: o CDB, a LCA ou o Tesouro Selic?',
  },
  termos: ['ir-regressivo', 'iof', 'lci-lca', 'poupanca', 'valor-liquido'],
  fontes: [FONTES.lei11033, FONTES.decretoIOF, FONTES.lciLca, FONTES.poupancaBCB],
});

// Lição 7. RASCUNHO para o portão humano (plano M3c, D1).
import { FONTES, link } from './fontes';
import { cdbPos, letra, poupanca, tesouroSelic } from './ofertas';
import { REGRAS } from './regras';
import { definirLicao } from './tipos';

const { custodia, fgc, prazoMinimo, ir } = REGRAS;

export const RESERVA = definirLicao({
  id: 'reserva',
  ordem: 7,
  titulo: 'Reserva de emergência',
  resumo: 'Na reserva de emergência, a pergunta principal é se o dinheiro sai amanhã sem perda, e o rendimento vem depois.',
  secoes: [
    {
      titulo: 'Para que serve',
      texto: 'A reserva de emergência é o dinheiro guardado para imprevistos: perder a renda, um problema de saúde, um conserto urgente. Ela precisa estar disponível no dia em que o imprevisto chega, e isso muda a forma de escolher onde ela fica.',
    },
    {
      titulo: 'O que a reserva pede',
      texto: '- **liquidez diária**, sem prazo mínimo nem data de vencimento para sair;\n- **baixo risco de crédito**, com garantia do Tesouro ou do FGC dentro do limite;\n- **preço estável**, sem depender do mercado no dia da venda.',
    },
    {
      titulo: 'Como cada produto se encaixa',
      texto: [
        `- **Tesouro Selic**: liquidez diária e garantia do Tesouro Nacional (${link('Portal do Investidor', FONTES.titulosPublicos)}). Paga custódia, mas os primeiros ${custodia.isencaoSelic} são isentos (${link('B3', FONTES.custodiaB3)}).`,
        `- **CDB com liquidez diária**: garantia do FGC até ${fgc.porConglomerado} por conglomerado (${link('regulamento do FGC', FONTES.regulamentoFGC)}).`,
        `- **Poupança**: liquidez diária, mas só rende no aniversário mensal (${link('Banco Central', FONTES.poupancaBCB)}).`,
        `- **LCI e LCA**: prazo mínimo de ${prazoMinimo.demais} meses ou mais antes do primeiro resgate (${link('B3', FONTES.prazoMinimoB3)}).`,
        '- **Tesouro Prefixado e IPCA+**: a venda antes do vencimento sai a preço de mercado.',
      ].join('\n'),
    },
    {
      titulo: 'O imposto de quem resgata cedo',
      texto: `A reserva costuma ser resgatada em prazos curtos, quando a alíquota de IR é a mais alta: ${ir.maior} até ${ir.limites[0] ?? 0} dias (${link('Lei 11.033/2004', FONTES.lei11033)}). No "Experimente", compare o valor líquido de cada oferta numa data próxima.`,
    },
    {
      titulo: 'A decisão é sua',
      texto: 'Quanto guardar e onde depende da sua vida, dos seus gastos e da estabilidade da sua renda. Esta lição mostra as características de cada produto; ela não diz o que fazer com o seu dinheiro.',
    },
  ],
  experimente: {
    ofertas: [tesouroSelic(60), cdbPos(1), poupanca, letra('LCI', 0.9, 60)],
    valor: 10_000,
    mesesAteSuaData: 3,
  },
  termos: ['liquidez', 'tesouro', 'cdb', 'poupanca', 'prazo-minimo', 'fgc'],
  fontes: [FONTES.titulosPublicos, FONTES.custodiaB3, FONTES.regulamentoFGC, FONTES.poupancaBCB, FONTES.prazoMinimoB3, FONTES.lei11033],
});

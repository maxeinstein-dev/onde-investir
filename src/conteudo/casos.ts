// src/conteudo/casos.ts
// Os casos clássicos (spec §6). RASCUNHO: passa pelo /vozmax e pela revisão do usuário (plano M3c, D1).
// Os números saem da comparação do "Experimente"; o texto cita só os valores das regras do engine.
import { FONTES, link } from './licoes/fontes';
import { cdbPos, letra, poupanca, tesouroPrefixado, tesouroSelic } from './licoes/ofertas';
import { REGRAS } from './licoes/regras';
import type { CasoClassico } from './licoes/tipos';

const { ir, poupanca: regraPoupanca, custodia } = REGRAS;

export const CASOS_CLASSICOS: readonly CasoClassico[] = [
  {
    id: 'caso-lci-cdb',
    titulo: 'LCI × CDB: onde está o ponto de virada',
    pergunta: 'Uma LCI com um percentual menor do CDI ou um CDB com um percentual maior: quem entrega mais em cada prazo?',
    explicacao: [
      `A LCI é isenta de IR para pessoa física (${link('Portal do Investidor', FONTES.lciLca)}). O CDB paga IR sobre o rendimento, pela tabela regressiva: ${ir.faixas} (${link('Lei 11.033/2004', FONTES.lei11033)}).`,
      'Nos prazos curtos, o CDB paga a alíquota mais alta, e a isenção da LCI pesa mais. Com o tempo, a alíquota do CDB cai, e o percentual maior dele pode passar à frente. O ponto de virada é o prazo em que isso acontece.',
      'Veja na tabela em qual prazo a oferta vencedora muda. Lembre também que a LCI tem prazo mínimo antes do primeiro resgate.',
    ].join('\n\n'),
    experimente: {
      ofertas: [letra('LCI', 0.9, 60), cdbPos(1.1, 60)],
      valor: 10_000,
    },
    licao: 'impostos',
  },
  {
    id: 'caso-poupanca-selic',
    titulo: 'Poupança × Tesouro Selic',
    pergunta: 'Com a Selic de hoje, quem rende mais: a poupança, isenta de IR, ou o Tesouro Selic?',
    explicacao: [
      `A poupança rende ${regraPoupanca.taxaFixa} ao mês mais a TR quando a Selic está acima de ${regraPoupanca.limiarSelic} ao ano. Com a Selic igual ou abaixo disso, rende ${regraPoupanca.fracaoSelic} da Selic mais a TR (${link('Lei 12.703/2012', FONTES.poupancaLei)}). Ela é isenta de IR, mas só rende no aniversário mensal (${link('Banco Central', FONTES.poupancaBCB)}).`,
      `O Tesouro Selic rende a própria Selic e paga IR pela tabela regressiva (${link('Lei 11.033/2004', FONTES.lei11033)}). Paga também a custódia da B3, com os primeiros ${custodia.isencaoSelic} isentos (${link('B3', FONTES.custodiaB3)}).`,
      'Os dois têm liquidez diária. A comparação mostra quanto a isenção da poupança compensa, ou não, a diferença de rendimento no cenário atual.',
    ].join('\n\n'),
    experimente: {
      ofertas: [poupanca, tesouroSelic(60)],
      valor: 5_000,
      mesesAteSuaData: 6,
    },
    licao: 'reserva',
  },
  {
    id: 'caso-prefixado-juros-sobem',
    titulo: 'Por que o prefixado assusta quando os juros sobem',
    pergunta: 'Se os juros subirem, quem rende mais: o Tesouro Prefixado ou o Tesouro Selic?',
    explicacao: [
      'No cenário "juros sobem", a Selic fica acima das projeções do mercado. O Tesouro Selic acompanha essa alta e passa a render mais. O Tesouro Prefixado continua com a taxa combinada na compra.',
      `Pior: quem precisa vender o prefixado antes do vencimento recebe o preço de mercado do dia, que cai quando os juros sobem (${link('Portal do Investidor', FONTES.titulosPublicos)}). Levado até o vencimento, ele paga a taxa combinada.`,
      'A sua data desta comparação cai antes do vencimento do prefixado, e o alerta de venda a preço de mercado aparece.',
    ].join('\n\n'),
    experimente: {
      ofertas: [tesouroPrefixado(0.13, 36), tesouroSelic(36)],
      valor: 10_000,
      mesesAteSuaData: 12,
      cenario: 'SOBEM',
    },
    licao: 'marcacao-mercado',
  },
  {
    id: 'caso-custo-reaplicar',
    titulo: 'O custo escondido de reaplicar',
    pergunta: 'Mesma taxa, prazos diferentes: aplicar por 5 anos ou por 1 ano e reaplicar dá o mesmo resultado?',
    explicacao: [
      `Cada aplicação conta o seu prazo de IR (${link('Lei 11.033/2004', FONTES.lei11033)}). O CDB de 1 ano paga ${ir.aliquotas[2] ?? ''} no vencimento, e a reaplicação recomeça a contagem.`,
      `O CDB de 5 anos fica aplicado o tempo todo e chega à alíquota de ${ir.menor}. A taxa é a mesma, mas o imposto não: essa diferença é o custo escondido de reaplicar.`,
      'Veja o valor líquido dos dois no prazo de 5 anos e o alerta de IR na reaplicação.',
    ].join('\n\n'),
    experimente: {
      ofertas: [cdbPos(1.03, 12, { liquidez: 'NO_VENCIMENTO' }), cdbPos(1.03, 60, { liquidez: 'NO_VENCIMENTO' })],
      valor: 10_000,
      regra: { tipo: 'MESMA_TAXA' },
    },
    licao: 'reaplicacao',
  },
];

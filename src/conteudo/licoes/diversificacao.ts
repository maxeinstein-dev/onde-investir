// Lição 9, conceitual (sem "Experimente"). RASCUNHO para o portão humano (plano M3c, D1).
import { FONTES, link } from './fontes';
import { REGRAS } from './regras';
import { definirLicao } from './tipos';

const { fgc } = REGRAS;

export const DIVERSIFICACAO = definirLicao({
  id: 'diversificacao',
  ordem: 9,
  titulo: 'Diversificação',
  resumo: 'Dividir o dinheiro entre emissores, indexadores e prazos reduz o estrago quando uma parte vai mal.',
  secoes: [
    {
      titulo: 'O conceito',
      texto: `O risco não pode ser eliminado, mas pode ser reduzido com diversificação (${link('Portal do Investidor', FONTES.diversificacao)}). Se um investimento vai mal, os outros podem compensar.`,
    },
    {
      titulo: 'Não pôr tudo no mesmo emissor',
      texto: [
        `Com tudo num banco só, se ele quebrar, você depende inteiramente do **FGC**, e ele cobre até ${fgc.porConglomerado} por pessoa em cada conglomerado (${link('regulamento do FGC', FONTES.regulamentoFGC)}). O que passar disso fica sem garantia.`,
        `Dividir entre conglomerados diferentes deixa cada parte dentro do limite. Mas lembre do teto global: ${fgc.tetoGlobal} a cada ${fgc.janelaAnos} anos, somando todas as instituições. E dois bancos do mesmo grupo contam como um só.`,
      ].join('\n\n'),
    },
    {
      titulo: 'Não pôr tudo no mesmo indexador',
      texto: [
        'Cada indexador reage de um jeito ao que acontece com os juros e a inflação:',
        '- o **pós-fixado** rende mais quando os juros sobem e menos quando caem;\n- o **prefixado** trava a taxa, ganha quando os juros caem e fica para trás quando sobem;\n- o **IPCA+** acompanha a inflação.',
        'Com tudo num indexador só, o resultado depende de um único cenário dar certo. Misturar indexadores diminui essa dependência.',
      ].join('\n\n'),
    },
    {
      titulo: 'Prazos e liquidez',
      texto: 'Diversificar também é separar o dinheiro pelo prazo em que ele pode ser preciso. O que pode sair a qualquer momento pede **liquidez** diária; o que pode esperar anos aceita um vencimento longo.',
    },
    {
      titulo: 'Sem receita pronta',
      texto: 'Não existe divisão certa para todo mundo. Quanto pôr em cada lugar depende dos seus objetivos, dos seus prazos e de quanto risco você aceita. O app ajuda a comparar as opções; a divisão é decisão sua.',
    },
  ],
  termos: ['fgc', 'pos-fixado', 'prefixado', 'ipca-mais', 'liquidez'],
  fontes: [FONTES.diversificacao, FONTES.regulamentoFGC],
});

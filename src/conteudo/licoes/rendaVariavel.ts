// Lição 10, conceitual (sem "Experimente" e sem indicar ativos). RASCUNHO para o portão humano (plano M3c, D1).
import { FONTES, link } from './fontes';
import { REGRAS } from './regras';
import { definirLicao } from './tipos';

export const RENDA_VARIAVEL = definirLicao({
  id: 'renda-variavel',
  ordem: 10,
  titulo: 'Renda variável',
  resumo: 'Na renda variável, o retorno não é conhecido de antemão e pode até ser negativo.',
  secoes: [
    {
      titulo: 'O que é',
      texto: [
        `Na renda variável, você não sabe de antemão quanto vai ganhar: não há taxa combinada nem indexador (${link('Portal do Investidor', FONTES.rendaFixaXVariavel)}). O retorno depende do desempenho do negócio ou dos ativos por trás do investimento.`,
        `O exemplo mais conhecido são as ações. Nelas, o ganho não é garantido e depende do lucro da empresa (${link('Portal do Investidor', FONTES.riscosAcoes)}).`,
      ].join('\n\n'),
    },
    {
      titulo: 'Risco e volatilidade',
      texto: [
        'O preço sobe e desce com as condições do mercado, do setor e da própria empresa. Essa oscilação é a **volatilidade**.',
        `Se o negócio vai mal, o retorno pode ser negativo, e dá até para perder todo o valor investido (${link('Portal do Investidor', FONTES.rendaFixaXVariavel)}). As ações não estão entre os créditos que o FGC garante (${link('regulamento do FGC', FONTES.regulamentoFGC)}).`,
      ].join('\n\n'),
    },
    {
      titulo: 'O prazo importa',
      texto: 'Dinheiro de que você pode precisar logo corre o risco de ter de ser vendido num dia de baixa. Quanto mais tempo o dinheiro pode esperar, menos o resultado depende do preço de um dia específico. Por isso a reserva de emergência e a renda variável são coisas diferentes.',
    },
    {
      titulo: 'Impostos na renda variável',
      texto: [
        `Dividendos de FII são isentos de IR para pessoa física, mas com condições. O fundo precisa ter pelo menos ${REGRAS.rendaVariavel.minimoCotistasFII} cotistas, e o cotista não pode ter ${REGRAS.rendaVariavel.participacaoMaximaFII} ou mais das cotas (${link('Lei 14.754/2023', FONTES.fonteFII)}).`,
        `Vender ações no mercado à vista até ${REGRAS.rendaVariavel.limiteVendaAcoes} por mês é isento de IR sobre o ganho. Só vale para ações, e não para FII, ETF ou day trade (${link('Lei 11.033/2004', FONTES.fonteVendaAcoes)}).`,
        `Vender cotas de FII é sempre tributado a ${REGRAS.rendaVariavel.aliquotaVendaFII}, sem nenhuma isenção por valor. É diferente das ações.`,
      ].join('\n\n'),
    },
    {
      titulo: 'Neste app',
      texto: 'Esta lição é só conceitual. O app ainda não calcula renda variável: esse cálculo vem numa próxima etapa. O app também não indica ações, fundos ou qualquer outro ativo.',
    },
  ],
  termos: ['liquidez', 'fgc'],
  fontes: [FONTES.rendaFixaXVariavel, FONTES.riscosAcoes, FONTES.regulamentoFGC, FONTES.fonteFII, FONTES.fonteVendaAcoes],
});

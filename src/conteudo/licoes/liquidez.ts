// Lição 5. RASCUNHO para o portão humano (plano M3c, D1).
import { FONTES, link } from './fontes';
import { cdbPos, letra, poupanca } from './ofertas';
import { REGRAS } from './regras';
import { definirLicao } from './tipos';

const { prazoMinimo } = REGRAS;

export const LIQUIDEZ = definirLicao({
  id: 'liquidez',
  ordem: 5,
  titulo: 'Liquidez e prazo mínimo',
  resumo: 'Liquidez é a facilidade de ter o dinheiro de volta, e nem todo investimento deixa sair quando você quer.',
  secoes: [
    {
      titulo: 'O que é liquidez',
      texto: [
        `**Liquidez** é a facilidade de transformar o investimento em dinheiro (${link('Portal do Investidor', FONTES.liquidez)}).`,
        '- **Liquidez diária**: você pede o resgate quando quiser.\n- **No vencimento**: o dinheiro só volta na data combinada.',
        'Uma taxa maior às vezes vem junto com menos liquidez. Antes de comparar a taxa, confira quando o dinheiro pode sair.',
      ].join('\n\n'),
    },
    {
      titulo: 'LCI e LCA têm prazo mínimo',
      texto: `Mesmo com liquidez diária, a LCI e a LCA só podem ser resgatadas depois de um prazo mínimo definido pelo Conselho Monetário Nacional: ${prazoMinimo.demais} meses nas pós-fixadas e nas prefixadas, e ${prazoMinimo.lciComIPCA} meses na LCI atualizada mensalmente pela inflação (${link('B3', FONTES.prazoMinimoB3)}). Antes disso, o dinheiro fica preso.`,
    },
    {
      titulo: 'A poupança rende no aniversário',
      texto: `A poupança tem liquidez diária, mas só rende uma vez por mês, na data de aniversário do depósito. Quem saca um dia antes perde o rendimento daquele mês (${link('Banco Central', FONTES.poupancaBCB)}).`,
    },
    {
      titulo: 'Tesouro: dá para vender, mas a que preço',
      texto: 'No Tesouro Direto, dá para vender o título antes do vencimento. No Tesouro Prefixado e no IPCA+, essa venda sai pelo preço de mercado do dia, que pode ficar acima ou abaixo do previsto. Esse é o assunto da próxima lição.',
    },
    {
      titulo: 'Na prática',
      texto: 'O "Experimente" usa uma data próxima. Veja quais ofertas ficam indisponíveis nela e por quê: o alerta de cada uma diz quando o dinheiro pode sair.',
    },
  ],
  experimente: {
    ofertas: [cdbPos(1.1, 24, { liquidez: 'NO_VENCIMENTO' }), cdbPos(1), letra('LCI', 0.9, 60), poupanca],
    valor: 10_000,
    mesesAteSuaData: 3,
  },
  termos: ['liquidez', 'prazo-minimo', 'lci-lca', 'poupanca', 'marcacao-mercado'],
  fontes: [FONTES.liquidez, FONTES.prazoMinimoB3, FONTES.poupancaBCB],
});

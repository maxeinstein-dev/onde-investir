// Lição 2. RASCUNHO para o portão humano (plano M3c, D1).
import { FONTES, link } from './fontes';
import { cdbIPCA, cdbPos, cdbPre, tesouroSelic } from './ofertas';
import { definirLicao } from './tipos';

export const INDEXADORES = definirLicao({
  id: 'indexadores',
  ordem: 2,
  titulo: 'Indexadores: CDI, Selic, IPCA e prefixado',
  resumo: 'O indexador diz de onde vem o rendimento e como ele reage quando os juros ou a inflação mudam.',
  secoes: [
    {
      titulo: 'Pós-fixado: acompanha o CDI ou a Selic',
      texto: [
        `O **CDI** é a taxa dos empréstimos de um dia entre bancos, apurada pela B3 (${link('B3', FONTES.cdiB3)}). Ele anda colado na **Selic**, a taxa básica de juros, definida nas reuniões do **Copom** (${link('Banco Central', FONTES.selicBCB)}).`,
        'Um CDB de 100% do CDI rende o CDI inteiro. O Tesouro Selic rende a Selic. Se os juros sobem, esses investimentos passam a render mais; se caem, rendem menos.',
        `A nova Selic vale a partir do dia útil seguinte ao anúncio do Copom (${link('Banco Central', FONTES.copomBCB)}).`,
      ].join('\n\n'),
    },
    {
      titulo: 'Prefixado: a taxa não muda',
      texto: `No **prefixado**, a taxa é combinada na aplicação e fica igual até o vencimento. Você sabe hoje quanto vai receber no fim (${link('Portal do Investidor', FONTES.titulosPublicos)}). Se os juros caírem depois, a taxa travada fica boa; se subirem, ela fica para trás do que o mercado passa a pagar.`,
    },
    {
      titulo: 'IPCA+: inflação mais juro real',
      texto: [
        `O **IPCA** é o índice oficial de inflação do Brasil, medido pelo IBGE (${link('IBGE', FONTES.ipcaIBGE)}).`,
        `Um título **IPCA+** paga a inflação do período mais uma taxa fixa de juro real (${link('Portal do Investidor', FONTES.titulosPublicos)}). Assim, o dinheiro acompanha o custo de vida e ainda ganha a taxa combinada.`,
      ].join('\n\n'),
    },
    {
      titulo: 'Ninguém sabe o futuro',
      texto: 'Qual indexador rende mais depende do caminho dos juros e da inflação até o resgate, e esse caminho é incerto. Por isso o app trabalha com **cenários**: o base segue as projeções do Boletim Focus, e os cenários "juros sobem" e "juros caem" se afastam delas. No "Experimente", troque o cenário e veja a ordem das ofertas mudar.',
    },
  ],
  experimente: {
    ofertas: [cdbPos(1), cdbPre(0.13, 60), cdbIPCA(0.075, 60), tesouroSelic(60)],
    valor: 10_000,
  },
  termos: ['cdi', 'selic', 'copom', 'pos-fixado', 'prefixado', 'ipca', 'ipca-mais', 'cenario', 'focus'],
  fontes: [FONTES.cdiB3, FONTES.selicBCB, FONTES.copomBCB, FONTES.titulosPublicos, FONTES.ipcaIBGE],
});

// Textos dos alertas que ensinam (spec §5.6). Rascunho: a revisão editorial é a tarefa C5 do M3b.
import type { Alerta } from '../engine/alertas';
import type { Horizonte } from '../engine/comparacao';
import { type DataISO, dataBR } from '../engine/datas';
import type { OfertaCadastrada } from '../engine/ofertas';
import { formatarMoeda, formatarPercentual } from '../formato';
import { listar, nomeDoHorizonte, nomeOferta } from './comparacao';
import { descreverOferta } from './motivos';
import type { IdTermo } from './glossario';

export interface TextoAlerta { titulo: string; oQue: string; porQue: string; termo: IdTermo }

const nome = (ofertas: readonly OfertaCadastrada[], i: number) => {
  const o = ofertas[i];
  return o ? nomeOferta(o) : `Oferta ${i + 1}`;
};

/** Como o horizonte aparece: o rótulo da tabela ("5 anos", "15/01/2028 (sua data)"), ou a data. */
function prazo(horizontes: readonly Horizonte[], data: DataISO): string {
  const h = horizontes.find((x) => x.data === data);
  return h ? nomeDoHorizonte(h) : dataBR(data);
}

const dias = (n: number) => (n === 1 ? '1 dia' : `${n} dias`);

/** O que acontece no IOF, pela etapa: a reaplicação, o vencimento antes de 30 dias ou o resgate antes de 30 dias. */
function textoDoIOF(a: Extract<Alerta, { tipo: 'IOF' }>, ofertas: readonly OfertaCadastrada[], horizontes: readonly Horizonte[]): string {
  const x = nome(ofertas, a.oferta);
  const valor = formatarMoeda(a.iof);
  if (a.vencimento !== undefined && a.etapa === 2) {
    return `${x} vence em ${dataBR(a.vencimento)}, e o dinheiro reaplicado é resgatado ${dias(a.dias)} depois: paga ${valor} de IOF.`;
  }
  if (a.vencimento !== undefined) return `${x} vence em ${dataBR(a.vencimento)}, ${dias(a.dias)} depois da aplicação: paga ${valor} de IOF no vencimento.`;
  return `Resgate antes de 30 dias: em ${prazo(horizontes, a.horizonte)}, ${x} paga ${valor} de IOF.`;
}

/**
 * Título, o que acontece, por quê e o termo do glossário para o "Saiba mais". `horizontes` dá o nome do prazo
 * (os da tabela); sem ele, a data.
 */
export function textoDoAlerta(a: Alerta, ofertas: readonly OfertaCadastrada[], horizontes: readonly Horizonte[] = []): TextoAlerta {
  switch (a.tipo) {
    case 'QUASE_EMPATE': {
      const lideres = listar((a.lideres.length > 0 ? a.lideres : [a.lider]).map((i) => nome(ofertas, i)));
      const quanto = Math.round(a.diferenca * 100) === 0
        ? 'rende o mesmo que'
        : `rende só ${formatarMoeda(a.diferenca)} (${formatarPercentual(a.diferencaPercentual)}) a menos que`;
      const inicio = `${nome(ofertas, a.alternativa)} ${quanto} ${lideres} em ${prazo(horizontes, a.horizonte)}`;
      const naPoupanca = ofertas[a.alternativa]?.produto === 'POUPANCA' ? ' (na poupança, perdendo o rendimento do mês incompleto)' : '';
      return a.vantagem === 'LIQUIDEZ'
        ? {
          titulo: 'Diferença pequena, liquidez maior',
          oQue: `${inicio} e dá para resgatar a qualquer momento${naPoupanca}.`,
          porQue: 'Dinheiro que pode sair a qualquer momento vale mais quando o plano pode mudar.',
          termo: 'liquidez',
        }
        : {
          titulo: 'Diferença pequena, garantia do Tesouro',
          oQue: `${inicio} e tem a garantia do Tesouro Nacional.`,
          porQue: 'O FGC cobre até R$ 250 mil por instituição se o banco quebrar. O título público tem a garantia do governo federal, o menor risco de crédito do país.',
          termo: 'tesouro',
        };
    }
    case 'IR_REINICIA':
      if (a.etapa1Isenta) {
        return {
          titulo: 'A reaplicação passa a pagar IR',
          oQue: `${nome(ofertas, a.oferta)} é isenta, mas ao vencer em ${dataBR(a.data)} o dinheiro vai para ${descreverOferta(a.reinvestimento)}, que paga IR: ${formatarMoeda(a.custo)} até ${prazo(horizontes, a.horizonte)}.`,
          porQue: 'LCI e LCA são isentas de IR para pessoa física. No vencimento, o dinheiro vai para a oferta de reinvestimento, e o rendimento dela paga IR se ela não for isenta.',
          termo: 'reinvestimento',
        };
      }
      return {
        titulo: 'O IR recomeça na reaplicação',
        oQue: `Em ${prazo(horizontes, a.horizonte)}, a reaplicação de ${nome(ofertas, a.oferta)} (a partir de ${dataBR(a.data)}) paga ${formatarPercentual(a.aliquotaNova)} de IR, em vez de ${formatarPercentual(a.aliquotaSemReaplicar)} se o dinheiro tivesse ficado aplicado desde o início: ${formatarMoeda(a.custo)} a mais.`,
        porQue: 'O IR regressivo conta o prazo de cada aplicação. Quando o dinheiro é reaplicado, a contagem recomeça e a alíquota volta a subir.',
        termo: 'ir-regressivo',
      };
    case 'IOF':
      return {
        titulo: 'Resgate com IOF',
        oQue: textoDoIOF(a, ofertas, horizontes),
        porQue: 'O IOF cobra parte do rendimento de quem resgata com menos de 30 dias de aplicação, e a parte cobrada diminui a cada dia até zerar.',
        termo: 'iof',
      };
    case 'PRAZO_INCOMPATIVEL': {
      const o = ofertas[a.oferta];
      if (a.motivo === 'MARCACAO_A_MERCADO' && a.disponivelEm !== undefined) {
        return {
          titulo: 'Venda antes do vencimento',
          oQue: `Vender ${nome(ofertas, a.oferta)} antes de ${dataBR(a.disponivelEm)} sai pelo preço de mercado.`,
          porQue: 'O Tesouro Prefixado e o IPCA+ pagam a taxa contratada no vencimento. Antes dele, a venda sai pelo preço do dia, que pode ficar acima ou abaixo do valor na curva contratada.',
          termo: 'marcacao-mercado',
        };
      }
      const inicio = `Não dá para resgatar ${nome(ofertas, a.oferta)} em ${prazo(horizontes, a.horizonte)}.`;
      if (a.disponivelEm === undefined) {
        return { titulo: 'Prazo incompatível', oQue: inicio, porQue: 'A oferta não pode ser resgatada nessa data, e o valor dela fica fora da comparação.', termo: 'liquidez' };
      }
      if (o?.vencimento === a.disponivelEm) {
        return {
          titulo: 'Prazo incompatível',
          oQue: `${inicio} Só no vencimento (${dataBR(a.disponivelEm)}).`,
          porQue: 'Sem liquidez diária, o dinheiro só volta na data de vencimento combinada.',
          termo: 'liquidez',
        };
      }
      return {
        titulo: 'Prazo incompatível',
        oQue: `${inicio} Prazo mínimo até ${dataBR(a.disponivelEm)}.`,
        porQue: 'LCI e LCA têm um prazo mínimo legal antes do primeiro resgate, mesmo com liquidez diária.',
        termo: 'prazo-minimo',
      };
    }
  }
}

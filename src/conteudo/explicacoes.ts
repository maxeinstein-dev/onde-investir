import type { IdPasso, ResultadoSimulacao } from '../engine/produtos';
import { ehTesouro } from '../engine/produtos';
import { FONTE_CUSTODIA } from '../engine/regras/custodia';
import { FONTE_IOF } from '../engine/regras/iof';
import { FONTE_IR } from '../engine/regras/ir';
import { FONTE_POUPANCA } from '../engine/regras/poupanca';
import { formatarData, formatarMoeda, formatarPercentual } from '../formato';
import { descreverOferta } from './motivos';
import type { IdTermo } from './glossario';

export interface ExplicacaoPasso {
  id: IdPasso;
  titulo: string;
  sinal: '' | '+' | '−' | '=';
  valor: number;
  /** Camada simples. */
  curto: string;
  /** Camada "ver a matemática". */
  matematica: string;
  fonte?: string;
  termo?: IdTermo;
}

/** No M1 a data de resgate de Tesouro Prefixado/IPCA+ é tratada como o vencimento do título. */
const AVISO_VENCIMENTO = ' Considera o título mantido até o vencimento nessa data. Vender antes sujeita o valor à marcação a mercado.';

function explicarRendimento(r: ResultadoSimulacao): Pick<ExplicacaoPasso, 'curto' | 'matematica' | 'termo' | 'fonte'> {
  const ix = r.aplicacao.indexacao;
  const fator = r.fator.toFixed(8).replace('.', ',');
  const du = `${r.diasUteis} dias úteis`;
  const produto = r.aplicacao.produto;
  const aviso = produto === 'TESOURO_PREFIXADO' || produto === 'TESOURO_IPCA' ? AVISO_VENCIMENTO : '';
  switch (ix.tipo) {
    case 'POS_CDI':
      return {
        curto: `Rendeu ${formatarPercentual(ix.percentualCDI)} do CDI durante ${du}.`,
        matematica: `fator = ∏ [1 + ((1 + CDI)^(1/252) − 1) × ${formatarPercentual(ix.percentualCDI)}] nos ${du} = ${fator}. O percentual é aplicado na taxa de cada dia útil, e o resultado vai se acumulando.`,
        termo: 'cdi',
      };
    case 'PRE':
      return {
        curto: `Taxa fixa de ${formatarPercentual(ix.taxaAA)} ao ano, combinada no dia da aplicação.${aviso}`,
        matematica: `fator = (1 + ${formatarPercentual(ix.taxaAA)})^(${r.diasUteis}/252) = ${fator}`,
        termo: 'prefixado',
      };
    case 'IPCA_MAIS':
      return {
        curto: `A inflação do período (IPCA) mais ${formatarPercentual(ix.taxaRealAA)} ao ano de juro real.${aviso}`,
        matematica: `fator = ∏ (1 + IPCA)^(1/(12 × DU do mês)) × (1 + ${formatarPercentual(ix.taxaRealAA)})^(${r.diasUteis}/252) = ${fator}`,
        termo: 'ipca-mais',
      };
    case 'SELIC':
      return {
        curto: `Acompanhou a taxa Selic durante ${du}.`,
        matematica: `fator = ∏ (1 + Selic)^(1/252) nos ${du} = ${fator}`,
        termo: 'selic',
      };
    case 'POUPANCA':
      return {
        curto: `Foram ${r.mesesPoupanca ?? 0} aniversários mensais completos. A poupança só rende no dia do aniversário, então o mês incompleto não conta.`,
        matematica: 'Com a Selic acima de 8,5% a.a., o rendimento é 0,5% ao mês + TR. Com a Selic em até 8,5%, é 70% da Selic mensalizada + TR.',
        fonte: FONTE_POUPANCA,
        termo: 'poupanca',
      };
  }
}

export function explicarSimulacao(r: ResultadoSimulacao): ExplicacaoPasso[] {
  const nome = descreverOferta(r.aplicacao);
  const passos: ExplicacaoPasso[] = [
    {
      id: 'aplicado', titulo: 'Valor aplicado', sinal: '', valor: r.valorAplicado,
      curto: `Aplicação em ${formatarData(r.aplicacao.dataAplicacao)} com resgate em ${formatarData(r.dataResgate)}.`,
      matematica: '',
    },
    { id: 'rendimentoBruto', titulo: 'Rendimento bruto', sinal: '+', valor: r.rendimentoBruto, ...explicarRendimento(r) },
  ];

  if (!r.isentoIR) {
    passos.push({
      id: 'iof', titulo: 'IOF', sinal: '−', valor: r.iof,
      curto: r.aliquotaIOF > 0
        ? `Resgate com ${r.diasCorridos} dias: o IOF fica com ${formatarPercentual(r.aliquotaIOF)} do rendimento.`
        : `Não tem IOF, porque ele só é cobrado em resgates com menos de 30 dias e esse foi com ${r.diasCorridos}.`,
      matematica: 'IOF = rendimento × alíquota da tabela regressiva (96% no 1º dia até 0% a partir do 30º). É cobrado antes do IR.',
      fonte: FONTE_IOF, termo: 'iof',
    });
  }

  if (ehTesouro(r.aplicacao.produto)) {
    passos.push({
      id: 'custodia', titulo: 'Custódia B3', sinal: '−', valor: r.custodia,
      curto: r.custodia > 0
        ? 'A B3 cobra 0,20% ao ano pela guarda dos títulos, descontados quando há resgate, vencimento ou pagamento de juros.'
        : 'Sem custódia: no Tesouro Selic, os primeiros R$ 10 mil são isentos.',
      matematica: 'custódia ≈ 0,20% × (dias corridos ÷ 365) × (média entre aplicado e bruto − isenção). A B3 calcula dia a dia; aqui usamos a média.',
      fonte: FONTE_CUSTODIA, termo: 'custodia',
    });
  }

  passos.push(r.isentoIR
    ? {
        id: 'ir', titulo: 'Imposto de Renda', sinal: '−', valor: 0,
        curto: `${nome.split(' ')[0]} é isenta de IR para pessoa física, então todo o rendimento fica com você.`,
        matematica: 'Isenção prevista em lei para pessoa física.', termo: 'ir-regressivo',
      }
    : {
        id: 'ir', titulo: 'Imposto de Renda', sinal: '−', valor: r.ir,
        curto: `Com ${r.diasCorridos} dias corridos, a alíquota do IR é ${formatarPercentual(r.aliquotaIR)}. Quanto mais tempo aplicado, menor ela fica.`,
        matematica: `IR = (rendimento − IOF − custódia) × ${formatarPercentual(r.aliquotaIR)}. Faixas: até 180 dias 22,5%; até 360, 20%; até 720, 17,5%; acima, 15%.`,
        fonte: FONTE_IR, termo: 'ir-regressivo',
      });

  passos.push({
    id: 'liquido', titulo: 'Valor líquido', sinal: '=', valor: r.valorLiquido,
    curto: `É o que cai na sua conta: ${formatarMoeda(r.valorLiquido)}.`, matematica: '',
  });
  return passos;
}

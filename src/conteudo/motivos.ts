import { decidirVencedor } from '../engine/comparacao';
import type { ConferenciaExtrato } from '../engine/posicoes';
import type { Oferta, ResultadoSimulacao, TipoProduto } from '../engine/produtos';
import { formatarMoeda, formatarPercentual } from '../formato';

const NOMES: Record<TipoProduto, string> = {
  CDB: 'CDB', RDB: 'RDB', LC: 'LC', LCI: 'LCI', LCA: 'LCA',
  TESOURO_SELIC: 'Tesouro Selic', TESOURO_PREFIXADO: 'Tesouro Prefixado', TESOURO_IPCA: 'Tesouro IPCA+',
  POUPANCA: 'Poupança',
};

/** LCI e LCA são "letras" (feminino); os demais, masculino. */
const FEMININO: ReadonlySet<TipoProduto> = new Set(['LCI', 'LCA', 'LC', 'POUPANCA']);
const isento = (p: TipoProduto) => (FEMININO.has(p) ? 'isenta' : 'isento');

export function descreverOferta(o: Oferta): string {
  const nome = NOMES[o.produto];
  const ix = o.indexacao;
  switch (ix.tipo) {
    case 'POS_CDI': return `${nome} ${formatarPercentual(ix.percentualCDI)} do CDI`;
    case 'PRE': return o.produto === 'TESOURO_PREFIXADO' ? `${nome} ${formatarPercentual(ix.taxaAA)} a.a.` : `${nome} prefixado ${formatarPercentual(ix.taxaAA)} a.a.`;
    case 'IPCA_MAIS': return o.produto === 'TESOURO_IPCA' ? `${nome} ${formatarPercentual(ix.taxaRealAA)} a.a.` : `${nome} IPCA + ${formatarPercentual(ix.taxaRealAA)} a.a.`;
    case 'SELIC':
    case 'POUPANCA':
      return nome;
  }
}

/** A primeira frase da explicação: quem termina na frente e por quanto, ou o empate. */
export function fraseDoPlacar(nomeA: string, liquidoA: number, nomeB: string, liquidoB: number): string {
  const vencedor = decidirVencedor(liquidoA, liquidoB);
  if (vencedor === 'EMPATE') return `${nomeA} e ${nomeB} terminam empatados, com ${formatarMoeda(liquidoA)} líquidos.`;
  const [lv, lp, nv, np] = vencedor === 'A' ? [liquidoA, liquidoB, nomeA, nomeB] : [liquidoB, liquidoA, nomeB, nomeA];
  const diferenca = lv - lp;
  return `${nv} termina com ${formatarMoeda(lv)} líquidos: ${formatarMoeda(diferenca)} (${formatarPercentual(diferenca / lp)}) a mais que ${np}.`;
}

/**
 * Por que uma simulação termina na frente da outra (mesma base: valor e datas iguais). Os nomes vêm de fora
 * quando é preciso distinguir ofertas iguais (ex.: o emissor); sem eles, a descrição da oferta.
 */
export function explicarVencedor(
  a: ResultadoSimulacao, b: ResultadoSimulacao,
  nomeA = descreverOferta(a.aplicacao), nomeB = descreverOferta(b.aplicacao),
): string[] {
  const placar = fraseDoPlacar(nomeA, a.valorLiquido, nomeB, b.valorLiquido);
  const vencedor = decidirVencedor(a.valorLiquido, b.valorLiquido);
  if (vencedor === 'EMPATE') return [placar];
  const [v, p, nv, np] = vencedor === 'A' ? [a, b, nomeA, nomeB] : [b, a, nomeB, nomeA];
  const linhas = [placar];
  if (v.isentoIR !== p.isentoIR) {
    const [ri, rt, ni, nt] = v.isentoIR ? [v, p, nv, np] : [p, v, np, nv];
    linhas.push(`${ni} é ${isento(ri.aplicacao.produto)} de IR. ${nt} paga ${formatarPercentual(rt.aliquotaIR)} de IR (${formatarMoeda(rt.ir)}) sobre o rendimento.`);
    if (!v.isentoIR) {
      linhas.push(`Mesmo pagando IR, ${nv} vence porque rende ${formatarMoeda(v.rendimentoBruto - p.rendimentoBruto)} a mais antes do imposto.`);
    } else if (v.rendimentoBruto < p.rendimentoBruto) {
      linhas.push(`${nv} rende menos antes do imposto, mas como não paga IR fica na frente.`);
    } else {
      linhas.push(`${nv} rende mais antes dos descontos e ainda é ${isento(v.aplicacao.produto)}.`);
    }
  } else if (v.rendimentoBruto >= p.rendimentoBruto) {
    linhas.push(`${nv} rende mais antes dos descontos, e os descontos pesam de forma parecida nos dois.`);
  } else {
    linhas.push(`${nv} rende menos antes dos descontos, mas perde menos para IOF, IR e custódia.`);
  }
  return linhas;
}

/** O aviso da conferência do extrato, quando a diferença tem motivo conhecido; null quando não tem. */
export function textoDaConferencia(c: Pick<ConferenciaExtrato, 'motivo'>): string | null {
  return c.motivo === 'MARCACAO_A_MERCADO'
    ? 'O extrato do Tesouro mostra o preço de mercado, e o app calcula pela curva contratada. Diferenças são normais.'
    : null;
}

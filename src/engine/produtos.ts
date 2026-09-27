// src/engine/produtos.ts
import { diasUteis } from './calendario';
import { type DataISO, dataBR, diasCorridos, somarMeses } from './datas';
import { OfertaInvalidaError } from './erros';
import { type Cenario, fatorIPCA, fatorPercentualCDI, fatorPrefixado, fatorSelic } from './indexadores';
import { custodiaTesouro } from './regras/custodia';
import { aliquotaIOF } from './regras/iof';
import { aliquotaIR } from './regras/ir';
import { taxaBasePoupancaAM } from './regras/poupanca';
import { dataMinimaResgate } from './regras/prazoMinimo';

export type TipoProduto =
  | 'CDB' | 'RDB' | 'LC' | 'LCI' | 'LCA'
  | 'TESOURO_SELIC' | 'TESOURO_PREFIXADO' | 'TESOURO_IPCA'
  | 'POUPANCA';

export type Indexacao =
  | { tipo: 'POS_CDI'; percentualCDI: number } // 1.03 = 103% do CDI
  | { tipo: 'PRE'; taxaAA: number }
  | { tipo: 'IPCA_MAIS'; taxaRealAA: number }
  | { tipo: 'SELIC' }
  | { tipo: 'POUPANCA' };

export type TipoIndexacao = Indexacao['tipo'];

/** O que se compara: produto + como rende. */
export interface Oferta { produto: TipoProduto; indexacao: Indexacao }

/** Uma oferta aplicada com valor e data. */
export interface Aplicacao extends Oferta { valor: number; dataAplicacao: DataISO }

export type IdPasso = 'aplicado' | 'rendimentoBruto' | 'iof' | 'custodia' | 'ir' | 'liquido';
export interface Passo { id: IdPasso; valor: number }

export interface ResultadoSimulacao {
  aplicacao: Aplicacao;
  dataResgate: DataISO;
  diasCorridos: number;
  diasUteis: number;
  fator: number;
  valorAplicado: number;
  valorBruto: number;
  rendimentoBruto: number;
  aliquotaIOF: number;
  iof: number;
  custodia: number;
  isentoIR: boolean;
  aliquotaIR: number;
  ir: number;
  valorLiquido: number;
  /** Só para poupança: aniversários mensais completos. */
  mesesPoupanca?: number;
  passos: Passo[];
}

const ISENTOS_IR: ReadonlySet<TipoProduto> = new Set(['LCI', 'LCA', 'POUPANCA']);

export const ehIsentoIR = (produto: TipoProduto): boolean => ISENTOS_IR.has(produto);
export const ehTesouro = (produto: TipoProduto): boolean => produto.startsWith('TESOURO_');
export const garantiaDe = (produto: TipoProduto): 'FGC' | 'TESOURO_NACIONAL' =>
  ehTesouro(produto) ? 'TESOURO_NACIONAL' : 'FGC';

export const INDEXACOES_PERMITIDAS: Record<TipoProduto, readonly [TipoIndexacao, ...TipoIndexacao[]]> = {
  CDB: ['POS_CDI', 'PRE', 'IPCA_MAIS'],
  RDB: ['POS_CDI', 'PRE', 'IPCA_MAIS'],
  LC: ['POS_CDI', 'PRE', 'IPCA_MAIS'],
  LCI: ['POS_CDI', 'PRE', 'IPCA_MAIS'],
  LCA: ['POS_CDI', 'PRE', 'IPCA_MAIS'],
  TESOURO_SELIC: ['SELIC'],
  TESOURO_PREFIXADO: ['PRE'],
  TESOURO_IPCA: ['IPCA_MAIS'],
  POUPANCA: ['POUPANCA'],
};

export function validarAplicacao(ap: Aplicacao, dataResgate: DataISO): void {
  if (!Number.isFinite(ap.valor) || ap.valor <= 0) throw new OfertaInvalidaError('O valor aplicado precisa ser maior que zero');
  if (!INDEXACOES_PERMITIDAS[ap.produto].includes(ap.indexacao.tipo)) {
    throw new OfertaInvalidaError(`${ap.produto} não aceita a indexação ${ap.indexacao.tipo}`);
  }
  if (diasCorridos(ap.dataAplicacao, dataResgate) < 1) throw new OfertaInvalidaError('O resgate precisa ser depois da aplicação');
  const ix = ap.indexacao;
  if (ix.tipo === 'POS_CDI' && !(ix.percentualCDI > 0)) throw new OfertaInvalidaError('O percentual do CDI precisa ser maior que zero');
  if (ix.tipo === 'PRE' && !Number.isFinite(ix.taxaAA)) throw new OfertaInvalidaError('Taxa prefixada inválida');
  if (ix.tipo === 'IPCA_MAIS' && !Number.isFinite(ix.taxaRealAA)) throw new OfertaInvalidaError('Taxa real inválida');
  if (ap.produto === 'LCI' || ap.produto === 'LCA') {
    const minima = dataMinimaResgate(ap.produto, ix.tipo === 'IPCA_MAIS', ap.dataAplicacao);
    if (dataResgate < minima) {
      throw new OfertaInvalidaError(`${ap.produto} tem prazo mínimo legal: o resgate só é possível a partir de ${dataBR(minima)}`);
    }
  }
}

function fatorBruto(ap: Aplicacao, dataResgate: DataISO, cen: Cenario): number {
  const ix = ap.indexacao;
  switch (ix.tipo) {
    case 'POS_CDI': return fatorPercentualCDI(cen, ix.percentualCDI, ap.dataAplicacao, dataResgate);
    case 'PRE': return fatorPrefixado(ix.taxaAA, ap.dataAplicacao, dataResgate);
    case 'IPCA_MAIS':
      return fatorIPCA(cen, ap.dataAplicacao, dataResgate) * fatorPrefixado(ix.taxaRealAA, ap.dataAplicacao, dataResgate);
    case 'SELIC': return fatorSelic(cen, ap.dataAplicacao, dataResgate);
    case 'POUPANCA':
      throw new Error('Poupança é calculada por aniversário mensal (simularPoupanca)');
  }
}

function montarPassos(r: Omit<ResultadoSimulacao, 'passos'>): Passo[] {
  return [
    { id: 'aplicado', valor: r.valorAplicado },
    { id: 'rendimentoBruto', valor: r.rendimentoBruto },
    { id: 'iof', valor: r.iof },
    { id: 'custodia', valor: r.custodia },
    { id: 'ir', valor: r.ir },
    { id: 'liquido', valor: r.valorLiquido },
  ];
}

/** Depósitos nos dias 29, 30 e 31 contam como feitos no dia 1º do mês seguinte. */
function inicioEfetivoPoupanca(data: DataISO): DataISO {
  const dia = Number(data.slice(8, 10));
  return dia >= 29 ? somarMeses(`${data.slice(0, 8)}01`, 1) : data;
}

function simularPoupanca(ap: Aplicacao, dataResgate: DataISO, cen: Cenario): ResultadoSimulacao {
  const inicio = inicioEfetivoPoupanca(ap.dataAplicacao);
  let valor = ap.valor;
  let meses = 0;
  for (let aniversarioAnterior = inicio; ; meses++) {
    const proximo = somarMeses(inicio, meses + 1);
    if (proximo > dataResgate) break;
    const base = taxaBasePoupancaAM(cen.selicMetaAA(aniversarioAnterior), aniversarioAnterior);
    valor *= (1 + base) * (1 + cen.trAM(aniversarioAnterior));
    aniversarioAnterior = proximo;
  }
  const semDescontos = {
    aplicacao: ap, dataResgate, diasCorridos: diasCorridos(ap.dataAplicacao, dataResgate),
    diasUteis: diasUteis(ap.dataAplicacao, dataResgate), fator: valor / ap.valor,
    valorAplicado: ap.valor, valorBruto: valor, rendimentoBruto: valor - ap.valor,
    aliquotaIOF: 0, iof: 0, custodia: 0, isentoIR: true, aliquotaIR: 0, ir: 0, valorLiquido: valor,
    mesesPoupanca: meses,
  };
  return { ...semDescontos, passos: montarPassos(semDescontos) };
}

export function simular(ap: Aplicacao, dataResgate: DataISO, cen: Cenario): ResultadoSimulacao {
  validarAplicacao(ap, dataResgate);
  if (ap.produto === 'POUPANCA') return simularPoupanca(ap, dataResgate, cen);
  const dc = diasCorridos(ap.dataAplicacao, dataResgate);
  const fator = fatorBruto(ap, dataResgate, cen);
  const valorBruto = ap.valor * fator;
  const rendimentoBruto = valorBruto - ap.valor;
  const isentoIR = ehIsentoIR(ap.produto);
  const aliqIOF = isentoIR ? 0 : aliquotaIOF(dc, dataResgate);
  const iof = Math.max(0, rendimentoBruto) * aliqIOF;
  const custodia = ehTesouro(ap.produto)
    ? custodiaTesouro({ selic: ap.produto === 'TESOURO_SELIC', valorAplicado: ap.valor, valorBruto, diasCorridos: dc, dataResgate })
    : 0;
  const aliqIR = isentoIR ? 0 : aliquotaIR(dc, dataResgate);
  const ir = Math.max(0, rendimentoBruto - iof - custodia) * aliqIR;
  const base = {
    aplicacao: ap, dataResgate, diasCorridos: dc, diasUteis: diasUteis(ap.dataAplicacao, dataResgate), fator,
    valorAplicado: ap.valor, valorBruto, rendimentoBruto, aliquotaIOF: aliqIOF, iof, custodia,
    isentoIR, aliquotaIR: aliqIR, ir, valorLiquido: valorBruto - iof - custodia - ir,
  };
  return { ...base, passos: montarPassos(base) };
}

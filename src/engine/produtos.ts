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

/**
 * O que se compara: produto + como rende. `custoExtraAA`: tarifa da corretora ou da plataforma, em fração ao ano
 * (0,005 = 0,5% a.a.), de 0 a {@link CUSTO_EXTRA_MAXIMO_AA}. Ausente = sem custo.
 */
export interface Oferta { produto: TipoProduto; indexacao: Indexacao; custoExtraAA?: number }

/** Uma oferta aplicada com valor e data. */
export interface Aplicacao extends Oferta { valor: number; dataAplicacao: DataISO }

export type IdPasso = 'aplicado' | 'rendimentoBruto' | 'iof' | 'custodia' | 'ir' | 'custoExtra' | 'liquido';
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
  /** R$ do custo extra, descontado depois do IR; 0 sem custo. */
  custoExtra: number;
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

/** 5 = 500% do CDI. */
export const PERCENTUAL_CDI_MAXIMO = 5;

/** 5% a.a.: acima disso, é quase certo um erro de unidade (0,5 digitado no lugar de 0,005). */
export const CUSTO_EXTRA_MAXIMO_AA = 0.05;

/** Custo extra ausente, ou finito entre 0 e 5% a.a. */
export function validarCustoExtra(custoExtraAA: number | undefined): void {
  if (custoExtraAA === undefined) return;
  if (!Number.isFinite(custoExtraAA) || custoExtraAA < 0 || custoExtraAA > CUSTO_EXTRA_MAXIMO_AA) {
    throw new OfertaInvalidaError('O custo extra precisa ficar entre 0 e 5% ao ano');
  }
}

/** Taxa anual utilizável em (1 + t)^n: finita e acima de −100%. */
const taxaAnualValida = (t: number): boolean => Number.isFinite(t) && t > -1;

/**
 * `ignorarPrazoMinimo`: só para valores de referência (a linha tracejada do gráfico), nunca para um resgate de
 * verdade. A LCI/LCA é simulada como se já pudesse ser resgatada.
 */
export interface OpcoesSimulacao { ignorarPrazoMinimo?: boolean }

export function validarAplicacao(ap: Aplicacao, dataResgate: DataISO, opcoes: OpcoesSimulacao = {}): void {
  if (!Number.isFinite(ap.valor) || ap.valor <= 0) throw new OfertaInvalidaError('O valor aplicado precisa ser maior que zero');
  const permitidas = Object.hasOwn(INDEXACOES_PERMITIDAS, ap.produto) ? INDEXACOES_PERMITIDAS[ap.produto] : undefined;
  if (!permitidas) throw new OfertaInvalidaError(`Produto desconhecido: ${String(ap.produto)}`);
  if (!permitidas.includes(ap.indexacao.tipo)) {
    throw new OfertaInvalidaError(`${ap.produto} não aceita a indexação ${ap.indexacao.tipo}`);
  }
  validarCustoExtra(ap.custoExtraAA);
  if (diasCorridos(ap.dataAplicacao, dataResgate) < 1) throw new OfertaInvalidaError('O resgate precisa ser depois da aplicação');
  const ix = ap.indexacao;
  if (ix.tipo === 'POS_CDI') {
    if (!Number.isFinite(ix.percentualCDI) || ix.percentualCDI <= 0) throw new OfertaInvalidaError('O percentual do CDI precisa ser maior que zero');
    // Teto que pega o erro de unidade (103 digitado no lugar de 1,03).
    if (ix.percentualCDI > PERCENTUAL_CDI_MAXIMO) throw new OfertaInvalidaError('percentual do CDI acima de 500%: confira a taxa');
  }
  if (ix.tipo === 'PRE' && !taxaAnualValida(ix.taxaAA)) throw new OfertaInvalidaError('Taxa prefixada inválida');
  if (ix.tipo === 'IPCA_MAIS' && !taxaAnualValida(ix.taxaRealAA)) throw new OfertaInvalidaError('Taxa real inválida');
  if ((ap.produto === 'LCI' || ap.produto === 'LCA') && !opcoes.ignorarPrazoMinimo) {
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

type SemCusto = Omit<ResultadoSimulacao, 'passos' | 'custoExtra'>;

/**
 * Desconta o custo extra e monta a memória de cálculo. O custo é `bruto × (1 − (1 − c)^(dc/365))`, tirado DEPOIS
 * do IR: premissa conservadora, porque a tarifa da corretora não reduz a base do IR. Sem custo (c = 0 ou
 * ausente), nada muda e a memória não tem o passo `custoExtra`. Com custo, o líquido é o bruto menos os
 * descontos na ordem dos passos, então somar os passos da esquerda para a direita dá exatamente o líquido.
 */
function comCustoExtra(r: SemCusto): ResultadoSimulacao {
  const c = r.aplicacao.custoExtraAA ?? 0;
  const custoExtra = c > 0 ? r.valorBruto * (1 - Math.pow(1 - c, r.diasCorridos / 365)) : 0;
  const valorLiquido = c > 0 ? r.valorBruto - r.iof - r.custodia - r.ir - custoExtra : r.valorLiquido;
  const passos: Passo[] = [
    { id: 'aplicado', valor: r.valorAplicado },
    { id: 'rendimentoBruto', valor: r.rendimentoBruto },
    { id: 'iof', valor: r.iof },
    { id: 'custodia', valor: r.custodia },
    { id: 'ir', valor: r.ir },
    ...(c > 0 ? [{ id: 'custoExtra' as const, valor: custoExtra }] : []),
    { id: 'liquido', valor: valorLiquido },
  ];
  return { ...r, custoExtra, valorLiquido, passos };
}

/** Depósitos nos dias 29, 30 e 31 contam como feitos no dia 1º do mês seguinte. */
export function inicioEfetivoPoupanca(data: DataISO): DataISO {
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
  const semDescontos: SemCusto = {
    aplicacao: ap, dataResgate, diasCorridos: diasCorridos(ap.dataAplicacao, dataResgate),
    diasUteis: diasUteis(ap.dataAplicacao, dataResgate), fator: valor / ap.valor,
    valorAplicado: ap.valor, valorBruto: valor, rendimentoBruto: valor - ap.valor,
    aliquotaIOF: 0, iof: 0, custodia: 0, isentoIR: true, aliquotaIR: 0, ir: 0, valorLiquido: valor,
    mesesPoupanca: meses,
  };
  return comCustoExtra(semDescontos);
}

export function simular(ap: Aplicacao, dataResgate: DataISO, cen: Cenario, opcoes: OpcoesSimulacao = {}): ResultadoSimulacao {
  validarAplicacao(ap, dataResgate, opcoes);
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
  const base: SemCusto = {
    aplicacao: ap, dataResgate, diasCorridos: dc, diasUteis: diasUteis(ap.dataAplicacao, dataResgate), fator,
    valorAplicado: ap.valor, valorBruto, rendimentoBruto, aliquotaIOF: aliqIOF, iof, custodia,
    isentoIR, aliquotaIR: aliqIR, ir, valorLiquido: valorBruto - iof - custodia - ir,
  };
  return comCustoExtra(base);
}

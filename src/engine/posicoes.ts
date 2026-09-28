// src/engine/posicoes.ts
import { type DataISO, ehDataValida, somarDias } from './datas';
import { OfertaInvalidaError } from './erros';
import type { ItemFGC } from './fgc';
import type { Cenario } from './indexadores';
import { type OfertaCadastrada, validarOfertaCadastrada } from './ofertas';
import { simular, validarAplicacao } from './produtos';

export interface EventoPosicao { tipo: 'APORTE' | 'RESGATE'; data: DataISO; valor: number }

/**
 * O que o valor do extrato mostra. O extrato do banco costuma mostrar o valor BRUTO (antes do IR e do IOF), que é
 * o padrão; a pessoa pode dizer que o dela mostra o líquido.
 */
export type BaseExtrato = 'BRUTO' | 'LIQUIDO';

/**
 * Uma aplicação que a pessoa já tem (spec §5.3). Premissa: o extrato NÃO substitui o valor calculado. Ele serve
 * para conferir (`valorAtual`) e, se for recente, para a exposição do FGC (`itemFGCDaPosicao`).
 */
export interface Posicao extends OfertaCadastrada {
  valorAplicado: number;
  dataAplicacao: DataISO;
  valorExtrato?: number;
  dataExtrato?: DataISO;
  /** Padrão: BRUTO. Só com o extrato. */
  baseExtrato?: BaseExtrato;
  /** Aportes e resgates depois da aplicação. No M3a, sempre vazio. */
  eventos: readonly EventoPosicao[];
}

/** Diferença relativa entre o extrato e o calculado acima da qual a posição fica suspeita (taxa ou data digitada errada). */
export const LIMIAR_EXTRATO_SUSPEITO = 0.01;

export interface ConferenciaExtrato {
  valor: number;
  data: DataISO;
  base: BaseExtrato;
  /** O valor calculado na data do extrato (ou no vencimento, se o extrato for depois), na mesma base. */
  calculado: number;
  /** (extrato − calculado) / calculado. */
  diferencaPercentual: number;
  /** A diferença passa de {@link LIMIAR_EXTRATO_SUSPEITO} e não tem motivo conhecido. */
  suspeita: boolean;
  /**
   * Por que a diferença é esperada. MARCACAO_A_MERCADO: Tesouro Prefixado/IPCA+ com extrato antes do vencimento,
   * em que o extrato mostra o preço de mercado e o app calcula pela curva contratada; nunca é `suspeita`.
   */
  motivo?: 'MARCACAO_A_MERCADO';
}

export interface ValorAtual {
  /** A data do valor: a pedida ou, na posição vencida, o vencimento. */
  data: DataISO;
  bruto: number;
  liquido: number;
  /** A data pedida é depois do vencimento: o valor é o do vencimento. */
  vencida: boolean;
  /** Tesouro Prefixado/IPCA+ antes do vencimento: o valor é o da curva contratada; a venda sai a preço de mercado. */
  marcacaoAMercado?: true;
  extrato?: ConferenciaExtrato;
}

/**
 * Lança OfertaInvalidaError se a posição não puder existir em `hoje`: as regras de `validarOfertaCadastrada` e da
 * indexação, menos o prazo mínimo da LCI/LCA (a posição já foi aplicada); valor aplicado positivo; aplicação até
 * hoje; vencimento depois da aplicação; extrato com valor positivo e data entre a aplicação e hoje; sem eventos.
 */
export function validarPosicao(p: Posicao, hoje: DataISO): void {
  if (!Number.isFinite(p.valorAplicado) || p.valorAplicado <= 0) throw new OfertaInvalidaError('O valor aplicado precisa ser maior que zero');
  if (!ehDataValida(p.dataAplicacao)) throw new OfertaInvalidaError('Data de aplicação inválida');
  if (p.dataAplicacao > hoje) throw new OfertaInvalidaError('A data de aplicação não pode ser depois de hoje');
  validarOfertaCadastrada(p);
  if (p.vencimento !== undefined && p.vencimento <= p.dataAplicacao) throw new OfertaInvalidaError('O vencimento precisa ser depois da aplicação');
  validarAplicacao({ ...p, valor: p.valorAplicado }, somarDias(p.dataAplicacao, 1), { ignorarPrazoMinimo: true });
  if ((p.valorExtrato === undefined) !== (p.dataExtrato === undefined)) throw new OfertaInvalidaError('Informe o valor e a data do extrato');
  if (p.baseExtrato !== undefined && p.valorExtrato === undefined) throw new OfertaInvalidaError('A base do extrato só vale com o extrato');
  if (p.valorExtrato !== undefined && p.dataExtrato !== undefined) {
    if (!Number.isFinite(p.valorExtrato) || p.valorExtrato <= 0) throw new OfertaInvalidaError('O valor do extrato precisa ser maior que zero');
    if (!ehDataValida(p.dataExtrato)) throw new OfertaInvalidaError('Data do extrato inválida');
    if (p.dataExtrato < p.dataAplicacao || p.dataExtrato > hoje) throw new OfertaInvalidaError('A data do extrato precisa ficar entre a aplicação e hoje');
  }
  if (p.eventos.length > 0) throw new OfertaInvalidaError('Aportes e resgates ainda não são aceitos');
}

const ehTesouroComMarcacao = (p: Posicao) => p.produto === 'TESOURO_PREFIXADO' || p.produto === 'TESOURO_IPCA';

/** Bruto e líquido na data (até o vencimento), ignorando o prazo mínimo da LCI/LCA. */
function calcular(p: Posicao, data: DataISO, cen: Cenario): { data: DataISO; bruto: number; liquido: number; vencida: boolean } {
  if (data < p.dataAplicacao) throw new OfertaInvalidaError('A data precisa ser a da aplicação ou depois');
  const vencida = p.vencimento !== undefined && data > p.vencimento;
  const alvo = vencida ? (p.vencimento as DataISO) : data;
  if (alvo === p.dataAplicacao) return { data: alvo, bruto: p.valorAplicado, liquido: p.valorAplicado, vencida };
  const r = simular({ ...p, valor: p.valorAplicado }, alvo, cen, { ignorarPrazoMinimo: true });
  return { data: alvo, bruto: r.valorBruto, liquido: r.valorLiquido, vencida };
}

/**
 * Valor da posição na data, calculado pelo cenário (com o histórico realizado, ver `cenarioComHistorico`). Depois
 * do vencimento, o valor no vencimento com `vencida`. Com o extrato, confere o calculado na data do extrato, na
 * base informada (padrão: bruto): a diferença passa de {@link LIMIAR_EXTRATO_SUSPEITO} → `suspeita`, menos no
 * Tesouro Prefixado/IPCA+ antes do vencimento, em que a diferença é a marcação a mercado (`motivo`). O bruto e o
 * líquido devolvidos são sempre os calculados; o extrato vem à parte.
 */
export function valorAtual(p: Posicao, data: DataISO, cen: Cenario): ValorAtual {
  const atual = calcular(p, data, cen);
  const tesouroNaCurva = ehTesouroComMarcacao(p) && p.vencimento !== undefined && atual.data < p.vencimento;
  const resultado: ValorAtual = { ...atual, ...(tesouroNaCurva ? { marcacaoAMercado: true as const } : {}) };
  if (p.valorExtrato === undefined || p.dataExtrato === undefined) return resultado;
  const base = p.baseExtrato ?? 'BRUTO';
  const noExtrato = calcular(p, p.dataExtrato, cen);
  const calculado = base === 'BRUTO' ? noExtrato.bruto : noExtrato.liquido;
  const diferencaPercentual = (p.valorExtrato - calculado) / calculado;
  const aMercado = ehTesouroComMarcacao(p) && p.vencimento !== undefined && p.dataExtrato < p.vencimento;
  return {
    ...resultado,
    extrato: {
      valor: p.valorExtrato, data: p.dataExtrato, base, calculado, diferencaPercentual,
      suspeita: !aMercado && Math.abs(diferencaPercentual) > LIMIAR_EXTRATO_SUSPEITO,
      ...(aMercado ? { motivo: 'MARCACAO_A_MERCADO' as const } : {}),
    },
  };
}

/** Até quantos dias corridos antes de hoje o extrato ainda vale para a exposição do FGC. */
export const JANELA_EXTRATO_FGC_DIAS = 30;

/**
 * A posição como item do FGC (spec §3.4 e §5.3). O bruto em cada data é o calculado pelo cenário, com uma
 * exceção: com extrato de até {@link JANELA_EXTRATO_FGC_DIAS} dias antes de `hoje`, a exposição parte do extrato
 * e projeta daí para a frente, ou seja, a partir da data do extrato o calculado é multiplicado por
 * `extrato / calculado na data do extrato` (na base do extrato; no extrato líquido, a proporção do líquido vale
 * para o bruto, uma aproximação). Com extrato mais antigo, ou sem extrato, vale o calculado. Antes da aplicação,
 * zero; depois do vencimento, o valor no vencimento. Os erros de `simular` sobem (a conta do FGC trata).
 */
export function itemFGCDaPosicao(p: Posicao, hoje: DataISO, cen: Cenario): ItemFGC {
  const recente = p.valorExtrato !== undefined && p.dataExtrato !== undefined && p.dataExtrato <= hoje
    && p.dataExtrato >= somarDias(hoje, -JANELA_EXTRATO_FGC_DIAS);
  let proporcao: number | undefined;
  const doExtrato = (): number => {
    if (proporcao === undefined) {
      const noExtrato = calcular(p, p.dataExtrato as DataISO, cen);
      proporcao = (p.valorExtrato as number) / ((p.baseExtrato ?? 'BRUTO') === 'BRUTO' ? noExtrato.bruto : noExtrato.liquido);
    }
    return proporcao;
  };
  return {
    conglomerado: p.conglomerado, produto: p.produto,
    brutoEm: (data) => {
      if (data < p.dataAplicacao) return 0;
      const bruto = calcular(p, data, cen).bruto;
      return recente && data >= (p.dataExtrato as DataISO) ? bruto * doExtrato() : bruto;
    },
  };
}

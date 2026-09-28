// src/engine/alertas.ts
import type { ColunaHorizonte } from './comparacao';
import { type DataISO, diasCorridos } from './datas';
import { OfertaInvalidaError, RegraNaoEncontradaError } from './erros';
import { coberto, type ItemFGC, normalizarConglomerado, primeiraDataAcimaDoLimite } from './fgc';
import type { Cenario } from './indexadores';
import { aplicacaoDe, type OfertaCadastrada, type Projecao } from './ofertas';
import type { Oferta } from './produtos';
import { garantiaDe, simular } from './produtos';
import { dataMinimaResgate } from './regras/prazoMinimo';
import { aliquotaIR } from './regras/ir';

export type Alerta =
  | {
    tipo: 'QUASE_EMPATE'; horizonte: DataISO;
    /** O primeiro dos líderes com que a alternativa se compara. */
    lider: number;
    /** Os líderes com que a alternativa se compara (sem ela mesma, se ela também empata no topo). */
    lideres: number[];
    alternativa: number; diferenca: number; diferencaPercentual: number; vantagem: 'LIQUIDEZ' | 'GARANTIA';
  }
  | {
    tipo: 'IR_REINICIA'; oferta: number;
    /** O vencimento, quando o dinheiro é reaplicado. */
    data: DataISO;
    horizonte: DataISO;
    /** Onde o dinheiro é reaplicado. */
    reinvestimento: Oferta;
    /** A oferta original é isenta (LCI/LCA) e a reaplicação é tributada: passa a pagar IR. */
    etapa1Isenta: boolean;
    aliquotaNova: number;
    /** A alíquota pelos dias totais desde a aplicação original; 0 quando a original é isenta. */
    aliquotaSemReaplicar: number;
    /** R$: o IR da etapa 2 menos o que ela pagaria com `aliquotaSemReaplicar`. */
    custo: number;
  }
  | {
    tipo: 'IOF'; oferta: number; horizonte: DataISO; iof: number;
    /** 1: a aplicação original (resgate ou vencimento antes de 30 dias); 2: a reaplicação. */
    etapa: 1 | 2;
    /** Dias corridos da etapa até o resgate. */
    dias: number;
    /** O vencimento da oferta, quando há reaplicação. */
    vencimento?: DataISO;
  }
  | {
    tipo: 'PRAZO_INCOMPATIVEL'; oferta: number; horizonte: DataISO; disponivelEm?: DataISO;
    /** Só no Tesouro Prefixado/IPCA+ antes do vencimento, na data do usuário: dá para vender, a preço de mercado. */
    motivo?: 'MARCACAO_A_MERCADO';
  }
  | {
    /** A carteira do conglomerado mais a oferta, aplicada pelo valor da comparação, passa do limite do FGC. */
    tipo: 'FGC_LIMITE'; oferta: number;
    /** O nome como está na oferta. */
    conglomerado: string;
    /** O primeiro dia acima do limite. */
    data: DataISO;
    /** Bruto somado da carteira e da oferta na data. */
    total: number;
    limite: number;
    /** No cruzamento. */
    excedente: number;
    /** O vencimento da oferta ou, sem vencimento, o horizonte mais distante. */
    fim: DataISO;
    /** Bruto somado da carteira e da oferta no fim. */
    totalNoFim: number;
    excedenteNoFim: number;
  }
  | {
    /**
     * Parte da conta do FGC da oferta não pôde ser calculada (regra não cadastrada para a data ou dado inválido):
     * esses itens ficaram de fora, e o FGC_LIMITE, se houver, conta só o resto.
     */
    tipo: 'FGC_NAO_CALCULADO'; oferta: number;
    /** O nome como está na oferta. */
    conglomerado: string;
    /** Os índices em `ContextoFGC.carteira` dos itens do conglomerado que ficaram de fora. */
    carteira: number[];
    /** A própria oferta não pôde ser simulada até o fim. */
    ofertaForaDaConta: boolean;
  };

/**
 * O que é preciso para o alerta do FGC: as posições da pessoa (já como itens do FGC) e a oferta aplicada pelo valor
 * e na data da comparação (spec §5.6; não há valor próprio por oferta).
 */
export interface ContextoFGC { carteira: readonly ItemFGC[]; valor: number; dataAplicacao: DataISO; cen: Cenario }

/** Diferença, relativa ao líquido do líder, abaixo da qual duas ofertas estão "quase empatadas" (spec §5.6). */
export const LIMIAR_QUASE_EMPATE = 0.005;

const ORDEM_TIPOS: readonly Alerta['tipo'][] = ['QUASE_EMPATE', 'IR_REINICIA', 'IOF', 'PRAZO_INCOMPATIVEL', 'FGC_LIMITE', 'FGC_NAO_CALCULADO'];

type Disponivel = Extract<Projecao, { estado: 'DISPONIVEL' }>;
const disponivel = (p: Projecao | undefined): p is Disponivel => p?.estado === 'DISPONIVEL';

/**
 * Resgate a qualquer momento pela taxa contratada, no horizonte: liquidez diária sem marcação a mercado. A LCI/LCA
 * só conta depois da carência (antes do fim do prazo mínimo não dá para resgatar); a poupança conta, perdendo o
 * rendimento do mês incompleto.
 */
export function resgataQuandoQuiser(o: OfertaCadastrada, dataAplicacao: DataISO, horizonte: DataISO): boolean {
  if (o.liquidez !== 'DIARIA' || o.produto === 'TESOURO_PREFIXADO' || o.produto === 'TESOURO_IPCA') return false;
  if (o.produto !== 'LCI' && o.produto !== 'LCA') return true;
  return horizonte >= dataMinimaResgate(o.produto, o.indexacao.tipo === 'IPCA_MAIS', dataAplicacao);
}

type Vantagem = 'LIQUIDEZ' | 'GARANTIA';

function vantagem(lider: OfertaCadastrada, outra: OfertaCadastrada, dataAplicacao: DataISO, horizonte: DataISO): Vantagem | null {
  if (resgataQuandoQuiser(outra, dataAplicacao, horizonte) && !resgataQuandoQuiser(lider, dataAplicacao, horizonte)) return 'LIQUIDEZ';
  if (garantiaDe(outra.produto) === 'TESOURO_NACIONAL' && garantiaDe(lider.produto) === 'FGC') return 'GARANTIA';
  return null;
}

/**
 * A vantagem sobre TODOS os líderes: liquidez se ela vale contra cada um; senão garantia, se ela vale contra cada
 * um (a alternativa é do Tesouro e todos os líderes têm FGC); senão nenhuma.
 */
function vantagemSobreTodos(lideres: readonly OfertaCadastrada[], outra: OfertaCadastrada, dataAplicacao: DataISO, horizonte: DataISO): Vantagem | null {
  const cada = lideres.map((l) => vantagem(l, outra, dataAplicacao, horizonte));
  if (cada.length > 0 && cada.every((v) => v === 'LIQUIDEZ')) return 'LIQUIDEZ';
  const garantia = garantiaDe(outra.produto) === 'TESOURO_NACIONAL' && lideres.every((l) => garantiaDe(l.produto) === 'FGC');
  return cada.length > 0 && garantia ? 'GARANTIA' : null;
}

/**
 * Quase empate com o topo. Com vários líderes (empate em centavos), a referência é o líquido deles, e a alternativa
 * precisa ter vantagem (liquidez ou garantia) sobre TODOS eles. Um líder empatado com os outros também é
 * alternativa: no empate exato, sempre alerta (a diferença é zero).
 */
function quaseEmpates(ofertas: readonly OfertaCadastrada[], c: ColunaHorizonte, limiar: number): Alerta[] {
  const doTopo = c.lideres.flatMap((i) => {
    const p = c.projecoes[i];
    const o = ofertas[i];
    return disponivel(p) && o ? [{ i, p, o }] : [];
  });
  const referencia = doTopo[0];
  if (!referencia) return [];
  const dataAplicacao = referencia.p.etapas[0]?.aplicacao.dataAplicacao ?? c.data;
  return c.projecoes.flatMap((p, i): Alerta[] => {
    const outra = ofertas[i];
    if (!disponivel(p) || !outra) return [];
    const comparados = doTopo.filter((l) => l.i !== i);
    const primeiro = comparados[0];
    if (!primeiro) return [];
    const noTopo = c.lideres.includes(i);
    const diferenca = noTopo ? 0 : primeiro.p.liquido - p.liquido;
    const diferencaPercentual = noTopo ? 0 : diferenca / primeiro.p.liquido;
    const v = vantagemSobreTodos(comparados.map((l) => l.o), outra, dataAplicacao, c.data);
    if (v === null || !(noTopo || diferencaPercentual < limiar)) return [];
    return [{
      tipo: 'QUASE_EMPATE', horizonte: c.data, lider: primeiro.i, lideres: comparados.map((l) => l.i), alternativa: i,
      diferenca, diferencaPercentual, vantagem: v,
    }];
  });
}

/** Abaixo de um centavo não há o que alertar. */
const PISO_REAIS = 0.01;

/**
 * A reaplicação tributada paga mais IR do que o dinheiro pagaria se tivesse ficado aplicado desde o início: a
 * alíquota recomeça (a dos dias totais seria menor) ou a original era isenta e a reaplicação não é.
 */
function irReinicia(p: Projecao, oferta: number, horizonte: DataISO): Alerta[] {
  if (!disponivel(p) || !p.reinvestimento) return [];
  const [etapa1, etapa2] = p.etapas;
  if (!etapa1 || !etapa2 || etapa2.isentoIR) return [];
  const etapa1Isenta = etapa1.isentoIR;
  const aliquotaSemReaplicar = etapa1Isenta ? 0 : aliquotaIR(diasCorridos(etapa1.aplicacao.dataAplicacao, horizonte), horizonte);
  const base = Math.max(0, etapa2.rendimentoBruto - etapa2.iof - etapa2.custodia);
  const custo = etapa2.ir - base * aliquotaSemReaplicar;
  if (!(custo >= PISO_REAIS)) return [];
  return [{
    tipo: 'IR_REINICIA', oferta, data: p.reinvestimento.data, horizonte, reinvestimento: p.reinvestimento.oferta, etapa1Isenta,
    aliquotaNova: etapa2.aliquotaIR, aliquotaSemReaplicar, custo,
  }];
}

/** IOF em cada etapa: a 1 quando o vencimento (ou o resgate) vem antes de 30 dias, a 2 na reaplicação. */
function iof(p: Projecao, oferta: number, horizonte: DataISO): Alerta[] {
  if (!disponivel(p)) return [];
  const vencimento = p.reinvestimento?.data;
  return p.etapas.slice(0, 2).flatMap((e, k): Alerta[] => (e.iof >= PISO_REAIS
    ? [{ tipo: 'IOF', oferta, horizonte, iof: e.iof, etapa: k === 0 ? 1 : 2, dias: e.diasCorridos, ...(vencimento === undefined ? {} : { vencimento }) }]
    : []));
}

function prazoIncompativel(p: Projecao, oferta: number, horizonte: DataISO, naDataDoUsuario: boolean): Alerta[] {
  if (p.estado === 'MARCACAO_A_MERCADO' && naDataDoUsuario) {
    return [{ tipo: 'PRAZO_INCOMPATIVEL', oferta, horizonte, disponivelEm: p.vencimento, motivo: 'MARCACAO_A_MERCADO' }];
  }
  if (p.estado !== 'INDISPONIVEL') return [];
  return [p.disponivelEm === undefined
    ? { tipo: 'PRAZO_INCOMPATIVEL', oferta, horizonte }
    : { tipo: 'PRAZO_INCOMPATIVEL', oferta, horizonte, disponivelEm: p.disponivelEm }];
}

/** O item de índice `indice` (−1: a oferta) não pôde ser calculado numa das datas. */
class ItemNaoCalculado extends Error {
  constructor(public readonly indice: number) {
    super(`Item ${indice} do FGC não calculado`);
  }
}

/** O item com `brutoEm` que troca os erros de regra e de dado por {@link ItemNaoCalculado}; os outros sobem. */
function marcado(item: ItemFGC, indice: number): ItemFGC {
  return {
    ...item,
    brutoEm: (d) => {
      try {
        return item.brutoEm(d);
      } catch (e) {
        if (e instanceof RegraNaoEncontradaError || e instanceof OfertaInvalidaError) throw new ItemNaoCalculado(indice);
        throw e;
      }
    },
  };
}

/**
 * Para cada oferta coberta pelo FGC: a carteira do mesmo conglomerado (pelo `brutoEm` de cada item) mais a oferta
 * aplicada pelo valor da comparação (pelo bruto do `simular`), até o vencimento dela ou, sem vencimento, até o
 * horizonte mais distante. As datas conferidas são a aplicação, os horizontes até o fim e o fim; entre elas, o dia
 * exato sai de `primeiraDataAcimaDoLimite`.
 *
 * Um item (da carteira ou a própria oferta) cujo `brutoEm` lança RegraNaoEncontradaError ou OfertaInvalidaError
 * em qualquer data sai da conta, e a conta é refeita sem ele; os itens que saíram vão num FGC_NAO_CALCULADO. Nada
 * disso derruba `gerarAlertas`.
 */
function alertasFGC(ofertas: readonly OfertaCadastrada[], horizontes: readonly DataISO[], ctx: ContextoFGC): Alerta[] {
  const maisDistante = horizontes.at(-1);
  return ofertas.flatMap((o, i): Alerta[] => {
    const fim = o.vencimento ?? maisDistante;
    if (!coberto(o.produto) || fim === undefined || fim <= ctx.dataAplicacao) return [];
    const ap = aplicacaoDe(o, ctx.valor, ctx.dataAplicacao);
    const oferta: ItemFGC = {
      conglomerado: o.conglomerado, produto: o.produto,
      brutoEm: (d) => (d <= ctx.dataAplicacao ? ctx.valor : simular(ap, d < fim ? d : fim, ctx.cen, { ignorarPrazoMinimo: true }).valorBruto),
    };
    const chave = normalizarConglomerado(o.conglomerado);
    const itens = [
      { indice: -1, item: marcado(oferta, -1) },
      ...ctx.carteira.flatMap((c, k) => (normalizarConglomerado(c.conglomerado) === chave ? [{ indice: k, item: marcado(c, k) }] : [])),
    ];
    const datas = [ctx.dataAplicacao, ...horizontes.filter((h) => h > ctx.dataAplicacao && h < fim), fim];
    const fora = new Set<number>();
    for (;;) {
      try {
        // Sem a oferta, não há o que alertar sobre aplicar nela: só a marca de não calculado.
        const limite = fora.has(-1) ? [] : primeiraDataAcimaDoLimite(itens.filter((x) => !fora.has(x.indice)).map((x) => x.item), datas)
          .map((a): Alerta => ({ tipo: 'FGC_LIMITE', oferta: i, ...a }));
        if (fora.size === 0) return limite;
        const carteira = [...fora].filter((k) => k >= 0).sort((a, b) => a - b);
        return [...limite, { tipo: 'FGC_NAO_CALCULADO', oferta: i, conglomerado: o.conglomerado, carteira, ofertaForaDaConta: fora.has(-1) }];
      } catch (e) {
        if (!(e instanceof ItemNaoCalculado) || fora.has(e.indice)) throw e;
        fora.add(e.indice);
      }
    }
  });
}

const ofertaDoAlerta = (a: Alerta) => (a.tipo === 'QUASE_EMPATE' ? a.alternativa : a.oferta);
const etapaDoAlerta = (a: Alerta) => (a.tipo === 'IOF' ? a.etapa : 0);
const chave = (a: Alerta) => `${a.tipo}:${ofertaDoAlerta(a)}:${etapaDoAlerta(a)}`;

/**
 * Alertas que ensinam (spec §5.6), a partir das colunas de `tabelaPorHorizonte`. Um alerta por (tipo, oferta) e,
 * no IOF, por etapa, no horizonte mais distante em que vale; no quase empate, a oferta é a alternativa. Ordem:
 * pelo tipo, pela oferta e pela etapa.
 * - QUASE_EMPATE: outra oferta disponível fica a menos de `limiar` do líder (relativo ao líquido do líder) e
 *   tem liquidez diária sem marcação a mercado enquanto o líder não tem, ou garantia do Tesouro contra FGC.
 * - IR_REINICIA: a reaplicação é tributada com alíquota maior que a dos dias totais desde a aplicação, ou a
 *   original é isenta e a reaplicação não (etapa1Isenta); o custo é o IR a mais, em R$.
 * - IOF: uma etapa paga pelo menos R$ 0,01 de IOF (um alerta por etapa).
 * - PRAZO_INCOMPATIVEL: indisponível no prazo da pessoa: a `dataUsuario`, quando há coluna nessa data (mesmo que
 *   seja um horizonte padrão), senão o horizonte mais distante. Na data do usuário, a marcação a mercado também
 *   entra, com o motivo MARCACAO_A_MERCADO.
 * - FGC_LIMITE (só com `contextoFGC`): a carteira do conglomerado mais a oferta passa do limite do FGC
 *   (ver {@link alertasFGC}). Sem o contexto, não há esse alerta e o resto não muda.
 */
export function gerarAlertas(
  ofertas: readonly OfertaCadastrada[], colunas: readonly ColunaHorizonte[], limiar = LIMIAR_QUASE_EMPATE, dataUsuario?: DataISO,
  contextoFGC?: ContextoFGC,
): Alerta[] {
  if (!Number.isFinite(limiar) || limiar < 0) throw new RangeError(`Limiar de quase empate inválido: ${limiar}`);
  if (contextoFGC && !(Number.isFinite(contextoFGC.valor) && contextoFGC.valor > 0)) {
    throw new RangeError(`Valor da comparação inválido: ${contextoFGC.valor}`);
  }
  const ordenadas = [...colunas].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  const doUsuario = dataUsuario !== undefined && ordenadas.some((c) => c.data === dataUsuario);
  const dataDoPrazo = doUsuario ? dataUsuario : ordenadas.at(-1)?.data;
  const porChave = new Map<string, Alerta>();
  // Do mais próximo para o mais distante: o horizonte mais distante sobrescreve.
  for (const c of ordenadas) {
    const doPrazo = c.data === dataDoPrazo;
    const novos = [
      ...quaseEmpates(ofertas, c, limiar),
      ...c.projecoes.flatMap((p, i) => [
        ...irReinicia(p, i, c.data),
        ...iof(p, i, c.data),
        ...(doPrazo ? prazoIncompativel(p, i, c.data, doUsuario) : []),
      ]),
    ];
    for (const a of novos) porChave.set(chave(a), a);
  }
  if (contextoFGC) for (const a of alertasFGC(ofertas, ordenadas.map((c) => c.data), contextoFGC)) porChave.set(chave(a), a);
  return [...porChave.values()].sort((a, b) =>
    ORDEM_TIPOS.indexOf(a.tipo) - ORDEM_TIPOS.indexOf(b.tipo) || ofertaDoAlerta(a) - ofertaDoAlerta(b) || etapaDoAlerta(a) - etapaDoAlerta(b));
}

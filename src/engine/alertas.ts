// src/engine/alertas.ts
import type { ColunaHorizonte } from './comparacao';
import { type DataISO, diasCorridos } from './datas';
import type { OfertaCadastrada, Projecao } from './ofertas';
import { garantiaDe } from './produtos';
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
  | { tipo: 'IR_REINICIA'; oferta: number; data: DataISO; aliquotaNova: number; aliquotaSemReaplicar: number }
  | { tipo: 'IOF'; oferta: number; horizonte: DataISO; iof: number }
  | { tipo: 'PRAZO_INCOMPATIVEL'; oferta: number; horizonte: DataISO; disponivelEm?: DataISO };

/** Diferença, relativa ao líquido do líder, abaixo da qual duas ofertas estão "quase empatadas" (spec §5.6). */
export const LIMIAR_QUASE_EMPATE = 0.005;

const ORDEM_TIPOS: readonly Alerta['tipo'][] = ['QUASE_EMPATE', 'IR_REINICIA', 'IOF', 'PRAZO_INCOMPATIVEL'];
/** O rótulo que `horizontesPadrao` dá à data escolhida pelo usuário. */
const ROTULO_SUA_DATA = 'Sua data';

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

function irReinicia(p: Projecao, oferta: number, horizonte: DataISO): Alerta[] {
  if (!disponivel(p) || !p.reinvestimento) return [];
  const [etapa1, etapa2] = p.etapas;
  if (!etapa1 || !etapa2 || etapa2.isentoIR) return [];
  const aliquotaSemReaplicar = aliquotaIR(diasCorridos(etapa1.aplicacao.dataAplicacao, horizonte), horizonte);
  if (!(etapa2.aliquotaIR > aliquotaSemReaplicar)) return [];
  return [{ tipo: 'IR_REINICIA', oferta, data: p.reinvestimento.data, aliquotaNova: etapa2.aliquotaIR, aliquotaSemReaplicar }];
}

function iof(p: Projecao, oferta: number, horizonte: DataISO): Alerta[] {
  const final = disponivel(p) ? p.etapas.at(-1) : undefined;
  return final && final.iof > 0 ? [{ tipo: 'IOF', oferta, horizonte, iof: final.iof }] : [];
}

function prazoIncompativel(p: Projecao, oferta: number, horizonte: DataISO): Alerta[] {
  if (p.estado !== 'INDISPONIVEL') return [];
  return [p.disponivelEm === undefined
    ? { tipo: 'PRAZO_INCOMPATIVEL', oferta, horizonte }
    : { tipo: 'PRAZO_INCOMPATIVEL', oferta, horizonte, disponivelEm: p.disponivelEm }];
}

const ofertaDoAlerta = (a: Alerta) => (a.tipo === 'QUASE_EMPATE' ? a.alternativa : a.oferta);
const chave = (a: Alerta) => `${a.tipo}:${ofertaDoAlerta(a)}`;

/**
 * Alertas que ensinam (spec §5.6), a partir das colunas de `tabelaPorHorizonte`. Um alerta por (tipo, oferta),
 * no horizonte mais distante em que vale; no quase empate, a oferta é a alternativa. Ordem: pelo tipo e,
 * dentro do tipo, pela oferta.
 * - QUASE_EMPATE: outra oferta disponível fica a menos de `limiar` do líder (relativo ao líquido do líder) e
 *   tem liquidez diária sem marcação a mercado enquanto o líder não tem, ou garantia do Tesouro contra FGC.
 * - IR_REINICIA: a reaplicação é tributada com alíquota maior que a dos dias totais desde a aplicação.
 * - IOF: a etapa final paga IOF.
 * - PRAZO_INCOMPATIVEL: indisponível na data do usuário ou no horizonte mais distante.
 */
export function gerarAlertas(
  ofertas: readonly OfertaCadastrada[], colunas: readonly ColunaHorizonte[], limiar = LIMIAR_QUASE_EMPATE,
): Alerta[] {
  if (!Number.isFinite(limiar) || limiar < 0) throw new RangeError(`Limiar de quase empate inválido: ${limiar}`);
  const ordenadas = [...colunas].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  const maisDistante = ordenadas.at(-1)?.data;
  const porChave = new Map<string, Alerta>();
  // Do mais próximo para o mais distante: o horizonte mais distante sobrescreve.
  for (const c of ordenadas) {
    const doPrazo = c.rotulo === ROTULO_SUA_DATA || c.data === maisDistante;
    const novos = [
      ...quaseEmpates(ofertas, c, limiar),
      ...c.projecoes.flatMap((p, i) => [
        ...irReinicia(p, i, c.data),
        ...iof(p, i, c.data),
        ...(doPrazo ? prazoIncompativel(p, i, c.data) : []),
      ]),
    ];
    for (const a of novos) porChave.set(chave(a), a);
  }
  return [...porChave.values()].sort((a, b) =>
    ORDEM_TIPOS.indexOf(a.tipo) - ORDEM_TIPOS.indexOf(b.tipo) || ofertaDoAlerta(a) - ofertaDoAlerta(b));
}

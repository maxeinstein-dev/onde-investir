// src/engine/alertas.ts
import type { ColunaHorizonte } from './comparacao';
import { type DataISO, diasCorridos } from './datas';
import type { OfertaCadastrada, Projecao } from './ofertas';
import { garantiaDe } from './produtos';
import { aliquotaIR } from './regras/ir';

export type Alerta =
  | { tipo: 'QUASE_EMPATE'; horizonte: DataISO; lider: number; alternativa: number; diferenca: number; diferencaPercentual: number; vantagem: 'LIQUIDEZ' | 'GARANTIA' }
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

/** Resgate a qualquer momento pela taxa contratada: liquidez diária sem marcação a mercado. */
const resgataQuandoQuiser = (o: OfertaCadastrada) =>
  o.liquidez === 'DIARIA' && o.produto !== 'TESOURO_PREFIXADO' && o.produto !== 'TESOURO_IPCA';

function vantagem(lider: OfertaCadastrada, outra: OfertaCadastrada): 'LIQUIDEZ' | 'GARANTIA' | null {
  if (resgataQuandoQuiser(outra) && !resgataQuandoQuiser(lider)) return 'LIQUIDEZ';
  if (garantiaDe(outra.produto) === 'TESOURO_NACIONAL' && garantiaDe(lider.produto) === 'FGC') return 'GARANTIA';
  return null;
}

function quaseEmpates(ofertas: readonly OfertaCadastrada[], c: ColunaHorizonte, limiar: number): Alerta[] {
  // Com empate em centavos no topo não há quem renda menos: sem alerta.
  if (c.lideres.length !== 1) return [];
  const iLider = c.lideres[0] as number;
  const pLider = c.projecoes[iLider];
  const lider = ofertas[iLider];
  if (!disponivel(pLider) || !lider) return [];
  return c.projecoes.flatMap((p, i): Alerta[] => {
    const outra = ofertas[i];
    if (i === iLider || !disponivel(p) || !outra) return [];
    const diferenca = pLider.liquido - p.liquido;
    const diferencaPercentual = diferenca / pLider.liquido;
    const v = vantagem(lider, outra);
    if (v === null || !(diferencaPercentual < limiar)) return [];
    return [{ tipo: 'QUASE_EMPATE', horizonte: c.data, lider: iLider, alternativa: i, diferenca, diferencaPercentual, vantagem: v }];
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

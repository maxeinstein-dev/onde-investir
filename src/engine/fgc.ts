// src/engine/fgc.ts
import { type DataISO, deDia, paraDia } from './datas';
import type { TipoProduto } from './produtos';
import { regraFGC } from './regras/fgc';

/** Uma aplicação (posição ou oferta) contada no limite do FGC, pelo valor bruto (principal + rendimentos) em cada data. */
export interface ItemFGC { conglomerado: string; produto: TipoProduto; brutoEm(data: DataISO): number }

export interface AlertaFGC {
  /** O nome como apareceu no primeiro item do conglomerado. */
  conglomerado: string;
  data: DataISO;
  total: number;
  limite: number;
  excedente: number;
}

const COBERTOS: ReadonlySet<TipoProduto> = new Set(['CDB', 'RDB', 'LC', 'LCI', 'LCA', 'POUPANCA']);

/** Produtos com a garantia do FGC (spec §3.4). O Tesouro tem a garantia do Tesouro Nacional e fica de fora. */
export const coberto = (produto: TipoProduto): boolean => COBERTOS.has(produto);

/** Chave de comparação: sem acento, sem caixa e sem espaços extras ("Itaú  Unibanco" = "itau unibanco"). */
export function normalizarConglomerado(nome: string): string {
  return nome.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

const nomeDeExibicao = (nome: string) => nome.trim().replace(/\s+/g, ' ');

/** Os itens cobertos agrupados por conglomerado normalizado, com o nome do primeiro item de cada grupo. */
function agrupar(itens: readonly ItemFGC[]): Map<string, { nome: string; itens: ItemFGC[] }> {
  const grupos = new Map<string, { nome: string; itens: ItemFGC[] }>();
  for (const item of itens) {
    if (!coberto(item.produto)) continue;
    const chave = normalizarConglomerado(item.conglomerado);
    const grupo = grupos.get(chave);
    if (grupo) grupo.itens.push(item);
    else grupos.set(chave, { nome: nomeDeExibicao(item.conglomerado), itens: [item] });
  }
  return grupos;
}

const somaEm = (itens: readonly ItemFGC[], data: DataISO) => itens.reduce((s, i) => s + i.brutoEm(data), 0);

/** Bruto coberto por conglomerado na data (chave: o nome do primeiro item do grupo) e o total coberto. */
export function exposicao(itens: readonly ItemFGC[], data: DataISO): { porConglomerado: Map<string, number>; totalCoberto: number } {
  const porConglomerado = new Map<string, number>();
  let totalCoberto = 0;
  for (const { nome, itens: doGrupo } of agrupar(itens).values()) {
    const total = somaEm(doGrupo, data);
    porConglomerado.set(nome, total);
    totalCoberto += total;
  }
  return { porConglomerado, totalCoberto };
}

/**
 * O primeiro dia em (abaixo, acima] com o total acima do limite, por busca binária. Supõe o total não decrescente
 * no intervalo, o que vale com rendimentos não negativos; com IPCA negativo num mês, acha um dia em que o total
 * cruza o limite, perto do primeiro. A busca dia a dia custaria uma simulação inteira por dia de um intervalo que
 * pode ter anos.
 */
function primeiroDiaAcima(itens: readonly ItemFGC[], abaixo: DataISO, acima: DataISO): DataISO {
  let lo = paraDia(abaixo); // total ≤ limite
  let hi = paraDia(acima); // total > limite
  while (hi - lo > 1) {
    const meio = Math.floor((lo + hi) / 2);
    const data = deDia(meio);
    if (somaEm(itens, data) > regraFGC(data).porConglomerado) hi = meio;
    else lo = meio;
  }
  return deDia(hi);
}

/**
 * Para cada conglomerado, a primeira data em que o bruto somado passa do limite do FGC (os rendimentos contam).
 * Entre as `datas` (hoje, vencimentos, horizontes), acha a primeira acima do limite e, entre ela e a anterior,
 * o dia exato. Um alerta por conglomerado, em ordem de data e de nome.
 */
export function primeiraDataAcimaDoLimite(itens: readonly ItemFGC[], datas: readonly DataISO[]): AlertaFGC[] {
  const ordenadas = [...new Set(datas)].sort();
  const alertas: AlertaFGC[] = [];
  for (const { nome, itens: doGrupo } of agrupar(itens).values()) {
    let anterior: DataISO | undefined;
    for (const d of ordenadas) {
      if (somaEm(doGrupo, d) <= regraFGC(d).porConglomerado) {
        anterior = d;
        continue;
      }
      const data = anterior === undefined ? d : primeiroDiaAcima(doGrupo, anterior, d);
      const total = somaEm(doGrupo, data);
      const limite = regraFGC(data).porConglomerado;
      alertas.push({ conglomerado: nome, data, total, limite, excedente: total - limite });
      break;
    }
  }
  return alertas.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.conglomerado.localeCompare(b.conglomerado)));
}

/** O total coberto na data passa do teto global do FGC? (Alerta informativo, spec §3.4.) */
export function tetoGlobalExcedido(itens: readonly ItemFGC[], data: DataISO): { total: number; teto: number } | null {
  const { totalCoberto } = exposicao(itens, data);
  const teto = regraFGC(data).tetoGlobal;
  return totalCoberto > teto ? { total: totalCoberto, teto } : null;
}

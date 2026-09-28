// src/engine/fgc.ts
import { type DataISO, deDia, paraDia } from './datas';
import type { TipoProduto } from './produtos';
import { regraFGC } from './regras/fgc';

/** Uma aplicação (posição ou oferta) contada no limite do FGC, pelo valor bruto (principal + rendimentos) em cada data. */
export interface ItemFGC { conglomerado: string; produto: TipoProduto; brutoEm(data: DataISO): number }

export interface AlertaFGC {
  /** O nome como apareceu no primeiro item do conglomerado. */
  conglomerado: string;
  /** O primeiro dia acima do limite (o cruzamento). */
  data: DataISO;
  /** Bruto somado no cruzamento. */
  total: number;
  limite: number;
  /** O excedente no cruzamento: por definição, pequeno (o total acabou de passar do limite). */
  excedente: number;
  /** A última das datas conferidas: o vencimento da oferta ou o horizonte mais distante. */
  fim: DataISO;
  /** Bruto somado no fim. */
  totalNoFim: number;
  /** O quanto passa do limite no fim (pelo limite vigente no fim): o tamanho real do que fica sem garantia. */
  excedenteNoFim: number;
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
 * o dia exato. Um alerta por conglomerado, em ordem de data e de nome. Além do cruzamento, o alerta traz o total e o
 * excedente no fim (a última das `datas`), que mostram quanto fica de fato sem garantia.
 */
export function primeiraDataAcimaDoLimite(itens: readonly ItemFGC[], datas: readonly DataISO[]): AlertaFGC[] {
  const ordenadas = [...new Set(datas)].sort();
  const fim = ordenadas.at(-1);
  const alertas: AlertaFGC[] = [];
  if (fim === undefined) return alertas;
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
      const totalNoFim = somaEm(doGrupo, fim);
      alertas.push({
        conglomerado: nome, data, total, limite, excedente: total - limite,
        fim, totalNoFim, excedenteNoFim: totalNoFim - regraFGC(fim).porConglomerado,
      });
      break;
    }
  }
  return alertas.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.conglomerado.localeCompare(b.conglomerado)));
}

export interface TetoGlobal {
  /** Σ min(exposição do conglomerado, limite por conglomerado): o máximo que o FGC pagaria somando todos. */
  garantiaSomada: number;
  teto: number;
  /** Cada conglomerado coberto: o bruto na data e a parte dele que o FGC cobre. */
  conglomerados: { conglomerado: string; exposicao: number; garantia: number }[];
}

/**
 * A garantia somada na data passa do teto global do FGC? (Alerta informativo, spec §3.4.) Conta, em cada
 * conglomerado, só o que o FGC cobre (até o limite por conglomerado): R$ 1,2 milhão num banco só é R$ 250 mil de
 * garantia e não chega perto do teto.
 *
 * Aproximação deliberada: o teto vale para o que o FGC pagar numa janela de 4 anos a partir do primeiro pagamento
 * (regulamento, art. 2º, § 3º e § 4º, VIII), e essa janela NÃO é calculada aqui: o app não sabe quando nem quantas
 * instituições quebrariam. A conta supõe que todas quebrassem na mesma janela, o pior caso, e o texto do alerta
 * é qualitativo por isso.
 */
export function tetoGlobalExcedido(itens: readonly ItemFGC[], data: DataISO): TetoGlobal | null {
  const regra = regraFGC(data);
  const conglomerados = [...exposicao(itens, data).porConglomerado].map(([conglomerado, exp]) => ({
    conglomerado, exposicao: exp, garantia: Math.min(exp, regra.porConglomerado),
  }));
  const garantiaSomada = conglomerados.reduce((s, c) => s + c.garantia, 0);
  return garantiaSomada > regra.tetoGlobal ? { garantiaSomada, teto: regra.tetoGlobal, conglomerados } : null;
}

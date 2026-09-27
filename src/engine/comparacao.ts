// src/engine/comparacao.ts
import { type DataISO, somarMeses } from './datas';
import type { Cenario } from './indexadores';
import { projetar, type OfertaCadastrada, type Projecao, type RegraReinvestimento } from './ofertas';

export interface Horizonte { rotulo: string; data: DataISO }
export interface ColunaHorizonte extends Horizonte { projecoes: Projecao[]; lideres: number[] }
export interface Marco { data: DataISO; ofertasQueVencem: number[]; projecoes: Projecao[]; lideres: number[] }

const PADRAO: readonly [string, number][] = [['6 meses', 6], ['1 ano', 12], ['2 anos', 24], ['3 anos', 36], ['5 anos', 60]];

export function horizontesPadrao(dataAplicacao: DataISO, dataUsuario: DataISO | null): Horizonte[] {
  const lista = PADRAO.map(([rotulo, meses]) => ({ rotulo, data: somarMeses(dataAplicacao, meses) }));
  if (dataUsuario !== null && dataUsuario > dataAplicacao && !lista.some((h) => h.data === dataUsuario)) {
    lista.push({ rotulo: 'Sua data', data: dataUsuario });
  }
  return lista.sort((a, b) => (a.data < b.data ? -1 : 1));
}

/** Índices das projeções disponíveis com o maior líquido, comparando em centavos. */
export function lideres(projecoes: readonly Projecao[]): number[] {
  const centavos = projecoes.map((p) => (p.estado === 'DISPONIVEL' ? Math.round(p.liquido * 100) : null));
  const validos = centavos.filter((c): c is number => c !== null);
  if (validos.length === 0) return [];
  const maximo = Math.max(...validos);
  return centavos.flatMap((c, i) => (c === maximo ? [i] : []));
}

function projetarTodas(ofertas: readonly OfertaCadastrada[], valor: number, dataAplicacao: DataISO, data: DataISO, cen: Cenario, regra: RegraReinvestimento) {
  const projecoes = ofertas.map((o) => projetar(o, valor, dataAplicacao, data, cen, regra));
  return { projecoes, lideres: lideres(projecoes) };
}

export function tabelaPorHorizonte(
  ofertas: readonly OfertaCadastrada[], valor: number, dataAplicacao: DataISO, horizontes: readonly Horizonte[],
  cen: Cenario, regra: RegraReinvestimento,
): ColunaHorizonte[] {
  return horizontes.map((h) => ({ ...h, ...projetarTodas(ofertas, valor, dataAplicacao, h.data, cen, regra) }));
}

export function linhaDoTempo(
  ofertas: readonly OfertaCadastrada[], valor: number, dataAplicacao: DataISO, cen: Cenario, regra: RegraReinvestimento,
): { marcos: Marco[] } {
  const datas = [...new Set(ofertas.flatMap((o) => (o.vencimento && o.vencimento > dataAplicacao ? [o.vencimento] : [])))].sort();
  return {
    marcos: datas.map((data) => ({
      data,
      ofertasQueVencem: ofertas.flatMap((o, i) => (o.vencimento === data ? [i] : [])),
      ...projetarTodas(ofertas, valor, dataAplicacao, data, cen, regra),
    })),
  };
}

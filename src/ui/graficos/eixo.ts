// Eixo das datas dos gráficos: escala linear em dias desde 1970-01-01, com rótulo próprio (sem adaptador de datas).
import { type DataISO, deDia, paraDia } from '../../engine/datas';

/** A posição da data no eixo x. */
export const diaDoEixo = (data: DataISO): number => paraDia(data);

/** A data de uma posição do eixo (o Chart.js pode pedir posições fracionárias). */
export const dataDoEixo = (dia: number): DataISO => deDia(Math.floor(dia));

/** Rótulo do eixo x: "mm/aaaa". */
export function rotuloDoEixo(dia: number): string {
  const [ano, mes] = dataDoEixo(dia).split('-');
  return `${mes}/${ano}`;
}

const MOEDA_INTEIRA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0, minimumFractionDigits: 0 });

/** Rótulo do eixo y: reais sem centavos. */
export const formatarEixoMoeda = (valor: number): string => MOEDA_INTEIRA.format(valor);

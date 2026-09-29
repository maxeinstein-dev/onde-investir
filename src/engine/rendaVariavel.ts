// Métricas de renda variável sobre uma série de fechamentos (spec §9.2). Motor puro: recebe
// números, devolve números — sem rede, sem DOM, sem texto (a tradução fica em src/conteudo/).
import type { DataISO } from './datas';
import { type Cenario, fatorIPCA, fatorPercentualCDI } from './indexadores';

const DIAS_UTEIS_ANO = 252;

export function rentabilidade(fechamentos: readonly number[]): number | null {
  if (fechamentos.length < 2) return null;
  return (fechamentos.at(-1) as number) / (fechamentos[0] as number) - 1;
}

function retornosDiarios(fechamentos: readonly number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < fechamentos.length; i++) r.push((fechamentos[i] as number) / (fechamentos[i - 1] as number) - 1);
  return r;
}

/** Desvio-padrão AMOSTRAL (n − 1) dos retornos diários, anualizado por √252. */
export function volatilidadeAnualizada(fechamentos: readonly number[]): number | null {
  const r = retornosDiarios(fechamentos);
  if (r.length < 2) return null;
  const media = r.reduce((s, x) => s + x, 0) / r.length;
  const variancia = r.reduce((s, x) => s + (x - media) ** 2, 0) / (r.length - 1);
  return Math.sqrt(variancia) * Math.sqrt(DIAS_UTEIS_ANO);
}

/** Maior queda entre um pico e qualquer ponto seguinte (≤ 0; 0 se nunca caiu). */
export function drawdownMaximo(fechamentos: readonly number[]): number | null {
  if (fechamentos.length === 0) return null;
  let pico = fechamentos[0] as number;
  let pior = 0;
  for (const f of fechamentos) {
    if (f > pico) pico = f;
    pior = Math.min(pior, f / pico - 1);
  }
  return pior;
}

export interface CandleFechamento { data: DataISO; fechamento: number }

export interface AnaliseRendaVariavel {
  inicio: DataISO;
  fim: DataISO;
  pontos: number;
  rentabilidade: number;
  /** null com menos de 3 candles. */
  volatilidadeAnualizada: number | null;
  drawdownMaximo: number;
  /** Rendimento de 100% do CDI no mesmo período (fração: 0.03 = 3%). */
  cdi: number;
  /** Variação do IPCA no mesmo período. */
  ipca: number;
}

export function analisarRendaVariavel(candles: readonly CandleFechamento[], cen: Cenario): AnaliseRendaVariavel | null {
  const ordenados = [...candles].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  if (ordenados.length < 2) return null;
  const fechamentos = ordenados.map((c) => c.fechamento);
  const inicio = (ordenados[0] as CandleFechamento).data;
  const fim = (ordenados.at(-1) as CandleFechamento).data;
  return {
    inicio, fim, pontos: ordenados.length,
    rentabilidade: rentabilidade(fechamentos) as number,
    volatilidadeAnualizada: volatilidadeAnualizada(fechamentos),
    drawdownMaximo: drawdownMaximo(fechamentos) as number,
    cdi: fatorPercentualCDI(cen, 1, inicio, fim) - 1,
    ipca: fatorIPCA(cen, inicio, fim) - 1,
  };
}

// src/engine/indexadores.ts
import { diasUteis, ehDiaUtil } from './calendario';
import { type DataISO, deDia, paraDia } from './datas';
import { OfertaInvalidaError } from './erros';

/** Taxas vigentes em cada data (frações). No M2 ganha implementação por curva do Focus. */
export interface Cenario {
  cdiAA(data: DataISO): number;
  selicOverAA(data: DataISO): number;
  selicMetaAA(data: DataISO): number;
  ipcaAA(data: DataISO): number;
  trAM(data: DataISO): number;
}

export interface ParametrosCenarioConstante {
  cdiAA: number;
  selicMetaAA: number;
  ipcaAA: number;
  trAM: number;
  /** Padrão: igual ao CDI. */
  selicOverAA?: number;
}

const ERROS_CENARIO: Record<keyof ParametrosCenarioConstante, string> = {
  cdiAA: 'CDI inválido no cenário',
  selicMetaAA: 'Selic meta inválida no cenário',
  ipcaAA: 'IPCA inválido no cenário',
  trAM: 'TR inválida no cenário',
  selicOverAA: 'Selic over inválida no cenário',
};

/** Lança OfertaInvalidaError se algum parâmetro não for finito e maior que −100% (ex.: campo vazio virando NaN). */
export function cenarioConstante(p: ParametrosCenarioConstante): Cenario {
  for (const chave of Object.keys(ERROS_CENARIO) as (keyof ParametrosCenarioConstante)[]) {
    const v = p[chave];
    if (chave === 'selicOverAA' && v === undefined) continue;
    if (v === undefined || !Number.isFinite(v) || v <= -1) throw new OfertaInvalidaError(ERROS_CENARIO[chave]);
  }
  const over = p.selicOverAA ?? p.cdiAA;
  return {
    cdiAA: () => p.cdiAA,
    selicOverAA: () => over,
    selicMetaAA: () => p.selicMetaAA,
    ipcaAA: () => p.ipcaAA,
    trAM: () => p.trAM,
  };
}

export const taxaDiaria = (taxaAA: number): number => Math.pow(1 + taxaAA, 1 / 252) - 1;

function acumularPorDiaUtil(inicio: DataISO, fim: DataISO, fatorDoDia: (data: DataISO) => number): number {
  const fimDia = paraDia(fim);
  let fator = 1;
  for (let d = paraDia(inicio); d < fimDia; d++) {
    const data = deDia(d);
    if (ehDiaUtil(data)) fator *= fatorDoDia(data);
  }
  return fator;
}

/** Fator de um pós-fixado: percentual aplicado sobre a taxa DIÁRIA do CDI (padrão B3). */
export function fatorPercentualCDI(cen: Cenario, percentual: number, inicio: DataISO, fim: DataISO): number {
  return acumularPorDiaUtil(inicio, fim, (d) => 1 + taxaDiaria(cen.cdiAA(d)) * percentual);
}

export function fatorSelic(cen: Cenario, inicio: DataISO, fim: DataISO): number {
  return acumularPorDiaUtil(inicio, fim, (d) => 1 + taxaDiaria(cen.selicOverAA(d)));
}

export function fatorPrefixado(taxaAA: number, inicio: DataISO, fim: DataISO): number {
  return Math.pow(1 + taxaAA, diasUteis(inicio, fim) / 252);
}

const cacheDiasUteisDoMes = new Map<string, number>();

/** Dias úteis do mês civil (chave AAAA-MM), com cache. */
function diasUteisDoMes(anoMes: string): number {
  const existente = cacheDiasUteisDoMes.get(anoMes);
  if (existente !== undefined) return existente;
  const ano = Number(anoMes.slice(0, 4));
  const mes = Number(anoMes.slice(5, 7));
  const proximo = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
  const total = diasUteis(`${anoMes}-01`, proximo);
  cacheDiasUteisDoMes.set(anoMes, total);
  return total;
}

/**
 * Fator do IPCA: inflação mensal projetada, pró-rata em dias úteis dentro de cada mês civil.
 * Cada dia útil d contribui com (1 + ipcaAA(d))^(1 / (12 × DU do mês de d)); assim um mês civil
 * inteiro rende (1 + ipca)^(1/12) e um ano civil inteiro rende 1 + ipca, qualquer que seja a
 * quantidade de dias úteis.
 */
export function fatorIPCA(cen: Cenario, inicio: DataISO, fim: DataISO): number {
  return acumularPorDiaUtil(inicio, fim, (d) => Math.pow(1 + cen.ipcaAA(d), 1 / (12 * diasUteisDoMes(d.slice(0, 7)))));
}

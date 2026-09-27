// src/engine/indexadores.ts
import { diasUteis, ehDiaUtil } from './calendario';
import { type DataISO, deDia, paraDia } from './datas';

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

export function cenarioConstante(p: ParametrosCenarioConstante): Cenario {
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

export function fatorIPCA(cen: Cenario, inicio: DataISO, fim: DataISO): number {
  return acumularPorDiaUtil(inicio, fim, (d) => Math.pow(1 + cen.ipcaAA(d), 1 / 252));
}

// src/engine/historico.ts
import { paraCadaDiaUtil } from './calendario';
import { type DataISO, ehDataValida, paraDia, somarDias } from './datas';
import type { Cenario } from './indexadores';

/**
 * O que já aconteceu, pelas séries do SGS (spec §4.3). Todas as taxas em fração (0,05% a.d. = 0.0005).
 * - `cdiDiario` e `selicOverDiaria`: séries 12 e 11, que o SGS publica em % ao dia útil.
 * - `ipcaMensal`: série 433, AAAA-MM → variação do mês.
 * - `trPorInicio`: série 226, a TR do período mensal que começa na data (a da poupança com aniversário nessa data).
 * - `selicMetaAA`: série 432, a meta em fração a.a., vigente a partir da data até a próxima entrada. A poupança
 *   precisa dela: com a meta em até 8,5% a.a. a regra muda para 70% da meta, e o passado recente teve meta de 2%.
 * - `ultimaData`: o último dia com CDI realizado. Depois dele, CDI, Selic over e meta vêm do cenário projetado.
 */
export interface SeriesRealizadas {
  cdiDiario: ReadonlyMap<DataISO, number>;
  selicOverDiaria: ReadonlyMap<DataISO, number>;
  ipcaMensal: ReadonlyMap<string, number>;
  trPorInicio: ReadonlyMap<DataISO, number>;
  selicMetaAA: ReadonlyMap<DataISO, number>;
  ultimaData: DataISO;
}

const ANO_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Faixas de sanidade, em fração, para pegar dado corrompido ou erro de unidade (a série em % lida como fração):
 * - CDI e Selic over diários em [0, 1%): 1% ao dia útil são 1.100% ao ano;
 * - Selic meta em [0, 100%);
 * - IPCA mensal com |x| < 20%;
 * - TR mensal em [0, 5%).
 */
const FAIXAS = {
  diaria: (v: number) => v >= 0 && v < 0.01,
  meta: (v: number) => v >= 0 && v < 1,
  ipca: (v: number) => Math.abs(v) < 0.2,
  tr: (v: number) => v >= 0 && v < 0.05,
} as const;

function validar(nome: string, serie: ReadonlyMap<string, number>, chaveValida: (k: string) => boolean, naFaixa: (v: number) => boolean): void {
  for (const [k, v] of serie) {
    if (!chaveValida(k)) throw new RangeError(`${nome}: data inválida "${k}"`);
    if (!Number.isFinite(v) || !naFaixa(v)) throw new RangeError(`${nome}: valor fora da faixa em ${k} (${v})`);
  }
}

/**
 * Até quantos dias corridos depois de uma entrada a Selic meta ainda vale. A série 432 tem um ponto por dia
 * corrido: um buraco maior que isso é dado faltando, e o valor não deve atravessá-lo.
 */
export const LACUNA_MAXIMA_META_DIAS = 60;

/** O cenário com o histórico, mais os dias úteis sem CDI antes da `ultimaData` (a UI avisa "histórico incompleto"). */
export interface CenarioComHistorico extends Cenario {
  /** Dias úteis de [primeiro CDI, `ultimaData`] sem CDI na série, em ordem. Nesses dias vale o cenário projetado. */
  lacunas: DataISO[];
}

/**
 * A taxa diária do SGS como taxa anual base 252, para caber em `Cenario`: `(1 + d)^252 − 1`. O `taxaDiaria` de
 * `fatorPercentualCDI` desfaz a conta, e o fator do dia volta a ser 1 + d (a diferença fica abaixo de 1e-15).
 */
const anualDe = (diaria: number): number => Math.pow(1 + diaria, 252) - 1;

/**
 * A última vigência até a data (inclusive), por busca binária em datas ordenadas; undefined se ela começou mais
 * de {@link LACUNA_MAXIMA_META_DIAS} dias antes.
 */
function vigenteEm(vigencias: readonly (readonly [dia: number, valor: number])[], data: DataISO): number | undefined {
  const dia = paraDia(data);
  let lo = 0;
  let hi = vigencias.length;
  while (lo < hi) {
    const meio = (lo + hi) >> 1;
    if ((vigencias[meio] as readonly [number, number])[0] <= dia) lo = meio + 1;
    else hi = meio;
  }
  if (lo === 0) return undefined;
  const [inicio, valor] = vigencias[lo - 1] as readonly [number, number];
  return dia - inicio <= LACUNA_MAXIMA_META_DIAS ? valor : undefined;
}

/** Dias úteis de [primeiro dia com CDI, `ultima`] sem CDI. */
function lacunasDoCDI(cdi: ReadonlyMap<DataISO, number>, ultima: DataISO): DataISO[] {
  let primeira: DataISO | undefined;
  for (const d of cdi.keys()) if (primeira === undefined || d < primeira) primeira = d;
  if (primeira === undefined || primeira > ultima) return [];
  const lacunas: DataISO[] = [];
  paraCadaDiaUtil(primeira, somarDias(ultima, 1), (d) => { if (!cdi.has(d)) lacunas.push(d); });
  return lacunas;
}

/**
 * Cenário que usa o realizado onde ele existe e o `futuro` no resto:
 * - CDI e Selic over: a taxa do dia, até a `ultimaData`. Dia sem dado (lacuna na série) cai no futuro.
 * - Selic meta: a última vigência até a data, até a `ultimaData`, se ela começou até
 *   {@link LACUNA_MAXIMA_META_DIAS} dias antes; antes da primeira vigência ou depois de uma lacuna maior, o futuro.
 * - IPCA: o mês realizado vira `(1 + mensal)^12 − 1`, e o pró-rata do `fatorIPCA` devolve o fator do mês. Mês
 *   sem dado cai no futuro, qualquer que seja a data.
 * - TR: a do período iniciado na data; sem ela, o futuro.
 * `lacunas` lista os dias úteis sem CDI. Lança RangeError se uma série tiver data inválida ou valor fora da faixa
 * de sanidade (ver `FAIXAS`).
 */
export function cenarioComHistorico(realizado: SeriesRealizadas, futuro: Cenario): CenarioComHistorico {
  if (!ehDataValida(realizado.ultimaData)) throw new RangeError(`Última data inválida: "${realizado.ultimaData}"`);
  validar('CDI', realizado.cdiDiario, ehDataValida, FAIXAS.diaria);
  validar('Selic over', realizado.selicOverDiaria, ehDataValida, FAIXAS.diaria);
  validar('TR', realizado.trPorInicio, ehDataValida, FAIXAS.tr);
  validar('Selic meta', realizado.selicMetaAA, ehDataValida, FAIXAS.meta);
  validar('IPCA', realizado.ipcaMensal, (k) => ANO_MES.test(k), FAIXAS.ipca);

  const ultima = realizado.ultimaData;
  const diaria = (serie: ReadonlyMap<DataISO, number>, data: DataISO): number | undefined =>
    (data <= ultima ? serie.get(data) : undefined);
  const metas = [...realizado.selicMetaAA].map(([d, v]) => [paraDia(d), v] as const).sort((a, b) => a[0] - b[0]);

  return {
    cdiAA: (data) => {
      const d = diaria(realizado.cdiDiario, data);
      return d === undefined ? futuro.cdiAA(data) : anualDe(d);
    },
    selicOverAA: (data) => {
      const d = diaria(realizado.selicOverDiaria, data);
      return d === undefined ? futuro.selicOverAA(data) : anualDe(d);
    },
    selicMetaAA: (data) => (data <= ultima ? vigenteEm(metas, data) : undefined) ?? futuro.selicMetaAA(data),
    ipcaAA: (data) => {
      const m = realizado.ipcaMensal.get(data.slice(0, 7));
      return m === undefined ? futuro.ipcaAA(data) : Math.pow(1 + m, 12) - 1;
    },
    trAM: (data) => realizado.trPorInicio.get(data) ?? futuro.trAM(data),
    lacunas: lacunasDoCDI(realizado.cdiDiario, ultima),
  };
}

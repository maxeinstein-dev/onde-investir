// src/engine/historico.ts
import { type DataISO, ehDataValida, paraDia } from './datas';
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

function validar(nome: string, serie: ReadonlyMap<string, number>, chaveValida: (k: string) => boolean): void {
  for (const [k, v] of serie) {
    if (!chaveValida(k)) throw new RangeError(`${nome}: data inválida "${k}"`);
    if (!Number.isFinite(v) || v <= -1) throw new RangeError(`${nome}: valor inválido em ${k} (${v})`);
  }
}

/**
 * A taxa diária do SGS como taxa anual base 252, para caber em `Cenario`: `(1 + d)^252 − 1`. O `taxaDiaria` de
 * `fatorPercentualCDI` desfaz a conta, e o fator do dia volta a ser 1 + d (a diferença fica abaixo de 1e-15).
 */
const anualDe = (diaria: number): number => Math.pow(1 + diaria, 252) - 1;

/** A última vigência até a data (inclusive), por busca binária em datas ordenadas. */
function vigenteEm(vigencias: readonly (readonly [dia: number, valor: number])[], data: DataISO): number | undefined {
  const dia = paraDia(data);
  let lo = 0;
  let hi = vigencias.length;
  while (lo < hi) {
    const meio = (lo + hi) >> 1;
    if ((vigencias[meio] as readonly [number, number])[0] <= dia) lo = meio + 1;
    else hi = meio;
  }
  return lo === 0 ? undefined : (vigencias[lo - 1] as readonly [number, number])[1];
}

/**
 * Cenário que usa o realizado onde ele existe e o `futuro` no resto:
 * - CDI e Selic over: a taxa do dia, até a `ultimaData`. Dia sem dado (lacuna na série) cai no futuro.
 * - Selic meta: a última vigência até a data, até a `ultimaData`; antes da primeira vigência, o futuro.
 * - IPCA: o mês realizado vira `(1 + mensal)^12 − 1`, e o pró-rata do `fatorIPCA` devolve o fator do mês. Mês
 *   sem dado cai no futuro, qualquer que seja a data.
 * - TR: a do período iniciado na data; sem ela, o futuro.
 * Lança RangeError se uma série tiver data ou valor inválido.
 */
export function cenarioComHistorico(realizado: SeriesRealizadas, futuro: Cenario): Cenario {
  if (!ehDataValida(realizado.ultimaData)) throw new RangeError(`Última data inválida: "${realizado.ultimaData}"`);
  validar('CDI', realizado.cdiDiario, ehDataValida);
  validar('Selic over', realizado.selicOverDiaria, ehDataValida);
  validar('TR', realizado.trPorInicio, ehDataValida);
  validar('Selic meta', realizado.selicMetaAA, ehDataValida);
  validar('IPCA', realizado.ipcaMensal, (k) => ANO_MES.test(k));

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
  };
}

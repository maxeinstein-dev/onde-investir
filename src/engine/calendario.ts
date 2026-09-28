// src/engine/calendario.ts
import { type DataISO, deDia, diaDaSemana, paraDia, somarDias } from './datas';

/** Domingo de Páscoa, calendário gregoriano (algoritmo de Meeus/Jones/Butcher). */
export function pascoa(ano: number): DataISO {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

const FIXOS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'];
// Carnaval (segunda e terça), Sexta-feira Santa e Corpus Christi, em dias a partir da Páscoa.
const MOVEIS = [-48, -47, -2, 60];
const cache = new Map<number, ReadonlySet<DataISO>>();

/** Feriados nacionais usados pela ANBIMA para contagem de dias úteis. */
export function feriadosNacionais(ano: number): ReadonlySet<DataISO> {
  const existente = cache.get(ano);
  if (existente) return existente;
  const feriados = new Set<DataISO>(FIXOS.map((md) => `${ano}-${md}`));
  if (ano >= 2024) feriados.add(`${ano}-11-20`); // Lei 14.759/2023
  const p = pascoa(ano);
  for (const deslocamento of MOVEIS) feriados.add(somarDias(p, deslocamento));
  cache.set(ano, feriados);
  return feriados;
}

export function ehDiaUtil(data: DataISO): boolean {
  const semana = diaDaSemana(data);
  if (semana === 0 || semana === 6) return false;
  return !feriadosNacionais(Number(data.slice(0, 4))).has(data);
}

const cacheDiasUteisDoAno = new Map<number, readonly DataISO[]>();

/** Dias úteis do ano civil, em ordem crescente, com cache (índice para as contagens e acúmulos). */
export function diasUteisDoAno(ano: number): readonly DataISO[] {
  const existente = cacheDiasUteisDoAno.get(ano);
  if (existente) return existente;
  const dias: DataISO[] = [];
  const fim = paraDia(`${String(ano + 1).padStart(4, '0')}-01-01`);
  for (let d = paraDia(`${String(ano).padStart(4, '0')}-01-01`); d < fim; d++) {
    const data = deDia(d);
    if (ehDiaUtil(data)) dias.push(data);
  }
  const congelado = Object.freeze(dias);
  cacheDiasUteisDoAno.set(ano, congelado);
  return congelado;
}

/** Primeiro índice i com lista[i] ≥ data (datas ISO comparam como texto). */
function primeiroIndiceNaoMenor(lista: readonly DataISO[], data: DataISO): number {
  let lo = 0;
  let hi = lista.length;
  while (lo < hi) {
    const meio = (lo + hi) >> 1;
    if ((lista[meio] as DataISO) < data) lo = meio + 1;
    else hi = meio;
  }
  return lo;
}

interface Faixa { dias: readonly DataISO[]; de: number; ate: number }

/** Trechos [de, ate) dos índices anuais que cobrem os dias úteis em [inicio, fim). */
function faixas(inicio: DataISO, fim: DataISO): Faixa[] {
  const inicioDia = paraDia(inicio);
  const fimDia = paraDia(fim);
  if (fimDia < inicioDia) throw new RangeError(`O fim (${fim}) não pode ser anterior ao início (${inicio}) na contagem de dias úteis`);
  const trechos: Faixa[] = [];
  const anoFim = Number(fim.slice(0, 4));
  for (let ano = Number(inicio.slice(0, 4)); ano <= anoFim; ano++) {
    const dias = diasUteisDoAno(ano);
    const de = ano === Number(inicio.slice(0, 4)) ? primeiroIndiceNaoMenor(dias, inicio) : 0;
    const ate = ano === anoFim ? primeiroIndiceNaoMenor(dias, fim) : dias.length;
    if (ate > de) trechos.push({ dias, de, ate });
  }
  return trechos;
}

/** Dias úteis em [inicio, fim), em ordem: o dia inicial conta, o final não. */
export function diasUteisEntre(inicio: DataISO, fim: DataISO): readonly DataISO[] {
  return faixas(inicio, fim).flatMap((f) => f.dias.slice(f.de, f.ate));
}

/** Chama `visitar` para cada dia útil em [inicio, fim), em ordem, sem alocar a lista. */
export function paraCadaDiaUtil(inicio: DataISO, fim: DataISO, visitar: (data: DataISO) => void): void {
  for (const f of faixas(inicio, fim)) for (let i = f.de; i < f.ate; i++) visitar(f.dias[i] as DataISO);
}

/** Dias úteis em [inicio, fim): o dia inicial conta, o final não (convenção de acúmulo do CDI). */
export function diasUteis(inicio: DataISO, fim: DataISO): number {
  return faixas(inicio, fim).reduce((total, f) => total + (f.ate - f.de), 0);
}

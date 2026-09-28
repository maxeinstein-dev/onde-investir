// src/engine/datas.ts
import { DataInvalidaError } from './erros';

/** Data de calendário no formato AAAA-MM-DD, sem fuso horário. */
export type DataISO = string;

const MS_POR_DIA = 86_400_000;
const FORMATO = /^(\d{4})-(\d{2})-(\d{2})$/;

function partes(data: DataISO): [ano: number, mes: number, dia: number] {
  const m = FORMATO.exec(data);
  if (!m) throw new DataInvalidaError(data);
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    throw new DataInvalidaError(data);
  }
  return [ano, mes, dia];
}

function montar(ano: number, mes: number, dia: number): DataISO {
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function exigirInteiro(quantidade: number, unidade: 'dias' | 'meses'): void {
  if (!Number.isInteger(quantidade)) throw new RangeError(`A quantidade de ${unidade} precisa ser um número inteiro (recebido: ${quantidade})`);
}

/** Número de dias desde 1970-01-01. */
export function paraDia(data: DataISO): number {
  const [ano, mes, dia] = partes(data);
  return Date.UTC(ano, mes - 1, dia) / MS_POR_DIA;
}

export function deDia(dia: number): DataISO {
  return new Date(dia * MS_POR_DIA).toISOString().slice(0, 10);
}

export function somarDias(data: DataISO, dias: number): DataISO {
  exigirInteiro(dias, 'dias');
  return deDia(paraDia(data) + dias);
}

export function diasCorridos(inicio: DataISO, fim: DataISO): number {
  return paraDia(fim) - paraDia(inicio);
}

/** 0 = domingo … 6 = sábado. */
export function diaDaSemana(data: DataISO): number {
  return new Date(paraDia(data) * MS_POR_DIA).getUTCDay();
}

function mesDeDestino(data: DataISO, meses: number): { ano: number; mes: number; dia: number; ultimoDia: number } {
  exigirInteiro(meses, 'meses');
  const [ano, mes, dia] = partes(data);
  const total = ano * 12 + (mes - 1) + meses;
  const novoAno = Math.floor(total / 12);
  const novoMes = total - novoAno * 12 + 1;
  const ultimoDia = new Date(Date.UTC(novoAno, novoMes, 0)).getUTCDate();
  return { ano: novoAno, mes: novoMes, dia, ultimoDia };
}

/**
 * Soma meses; se o dia não existe no mês de destino, usa o último dia desse mês.
 * Serve aos atalhos de prazo da interface ("+6 meses"). Para prazo legal, use {@link somarMesesPrazoLegal}.
 */
export function somarMeses(data: DataISO, meses: number): DataISO {
  const d = mesDeDestino(data, meses);
  return montar(d.ano, d.mes, Math.min(d.dia, d.ultimoDia));
}

/**
 * Soma meses pela regra civil de contagem de prazos: o prazo em meses termina no dia de igual número
 * do mês de destino; se esse dia não existe, termina no dia imediato, isto é, no dia 1º do mês seguinte
 * (Código Civil, art. 132, §3º; Lei 810/1949, art. 3º). Ex.: 31/08/2026 + 6 meses → 01/03/2027.
 */
export function somarMesesPrazoLegal(data: DataISO, meses: number): DataISO {
  const d = mesDeDestino(data, meses);
  if (d.dia <= d.ultimoDia) return montar(d.ano, d.mes, d.dia);
  return d.mes === 12 ? montar(d.ano + 1, 1, 1) : montar(d.ano, d.mes + 1, 1);
}

/** DD/MM/AAAA, para mensagens de erro do engine. */
export function dataBR(data: DataISO): string {
  partes(data);
  return `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
}

/** A data passa em {@link paraDia}? (AAAA-MM-DD com ano de 4 dígitos e dia que existe.) Nunca lança. */
export function ehDataValida(data: DataISO): boolean {
  try {
    partes(data);
    return true;
  } catch {
    return false;
  }
}

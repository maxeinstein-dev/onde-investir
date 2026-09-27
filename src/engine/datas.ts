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

/** Número de dias desde 1970-01-01. */
export function paraDia(data: DataISO): number {
  const [ano, mes, dia] = partes(data);
  return Date.UTC(ano, mes - 1, dia) / MS_POR_DIA;
}

export function deDia(dia: number): DataISO {
  return new Date(dia * MS_POR_DIA).toISOString().slice(0, 10);
}

export function somarDias(data: DataISO, dias: number): DataISO {
  return deDia(paraDia(data) + dias);
}

export function diasCorridos(inicio: DataISO, fim: DataISO): number {
  return paraDia(fim) - paraDia(inicio);
}

/** 0 = domingo … 6 = sábado. */
export function diaDaSemana(data: DataISO): number {
  return new Date(paraDia(data) * MS_POR_DIA).getUTCDay();
}

/** Soma meses; se o dia não existe no mês de destino, usa o último dia desse mês. */
export function somarMeses(data: DataISO, meses: number): DataISO {
  const [ano, mes, dia] = partes(data);
  const total = ano * 12 + (mes - 1) + meses;
  const novoAno = Math.floor(total / 12);
  const novoMes = total - novoAno * 12 + 1;
  const ultimoDia = new Date(Date.UTC(novoAno, novoMes, 0)).getUTCDate();
  return montar(novoAno, novoMes, Math.min(dia, ultimoDia));
}

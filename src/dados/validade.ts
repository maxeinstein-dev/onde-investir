// src/dados/validade.ts
import { ehDiaUtil } from '../engine/calendario';
import { type DataISO, diaDaSemana, somarDias } from '../engine/datas';

const BRT_MS = -3 * 3_600_000; // Brasil sem horário de verão desde 2019
const HORA_PUBLICACAO = 10;

const dataBRT = (ms: number): DataISO => new Date(ms + BRT_MS).toISOString().slice(0, 10);
const instanteBRT = (data: DataISO, hora: number) => Date.parse(`${data}T${String(hora).padStart(2, '0')}:00:00-03:00`);

/** Dados diários do SGS: válidos até a próxima publicação (dia útil, 10h BRT). */
export function validadeDiaria(agoraMs: number): number {
  const hoje = dataBRT(agoraMs);
  if (ehDiaUtil(hoje) && agoraMs < instanteBRT(hoje, HORA_PUBLICACAO)) return instanteBRT(hoje, HORA_PUBLICACAO);
  let d = somarDias(hoje, 1);
  while (!ehDiaUtil(d)) d = somarDias(d, 1);
  return instanteBRT(d, HORA_PUBLICACAO);
}

/** Primeiro dia útil da semana que começa em `segunda`; null se a semana não tiver dia útil. */
function primeiroDiaUtilDaSemana(segunda: DataISO): DataISO | null {
  for (let i = 0; i < 7; i++) {
    const d = somarDias(segunda, i);
    if (ehDiaUtil(d)) return d;
  }
  return null;
}

/** Boletim Focus: publicado no primeiro dia útil da semana (segunda, ou o dia útil seguinte se for feriado), às 10h BRT. */
export function validadeFocus(agoraMs: number): number {
  const hoje = dataBRT(agoraMs);
  let segunda = somarDias(hoje, -((diaDaSemana(hoje) + 6) % 7));
  for (;;) {
    const publicacao = primeiroDiaUtilDaSemana(segunda);
    if (publicacao !== null && instanteBRT(publicacao, HORA_PUBLICACAO) > agoraMs) return instanteBRT(publicacao, HORA_PUBLICACAO);
    segunda = somarDias(segunda, 7);
  }
}

export const validadeHoras = (agoraMs: number, horas: number) => agoraMs + horas * 3_600_000;

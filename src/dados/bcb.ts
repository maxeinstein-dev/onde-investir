// src/dados/bcb.ts
import { z } from 'zod';
import { type DataISO, paraDia } from '../engine/datas';
import type { DadosFocus, EstatisticaFocus } from '../engine/projecao';

export class RespostaInvalidaError extends Error {
  constructor(public readonly fonte: string) {
    super(`Resposta inesperada de ${fonte}`);
    this.name = 'RespostaInvalidaError';
  }
}

const OLINDA = 'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata';
const q = (parametros: Record<string, string>) =>
  Object.entries(parametros).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

export const urlSgsUltimos = (codigo: number, n: number) =>
  `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados/ultimos/${n}?formato=json`;
export const urlFocusSelic = () =>
  `${OLINDA}/ExpectativasMercadoSelic?${q({ $filter: 'baseCalculo eq 0', $orderby: 'Data desc', $top: '40', $format: 'json' })}`;
export const urlFocusIpcaMensal = () =>
  `${OLINDA}/ExpectativaMercadoMensais?${q({ $filter: "Indicador eq 'IPCA' and baseCalculo eq 0", $orderby: 'Data desc', $top: '60', $format: 'json' })}`;
export const urlFocusAnuais = () =>
  `${OLINDA}/ExpectativasMercadoAnuais?${q({ $filter: "(Indicador eq 'Selic' or Indicador eq 'IPCA') and baseCalculo eq 0", $orderby: 'Data desc', $top: '40', $format: 'json' })}`;
export const urlCalendarioCopom = (inicio: DataISO, fim: DataISO) =>
  `https://www.bcb.gov.br/api/servico/sitebcb/calendario/anual?${q({ inicioAgenda: `'${inicio}'`, fimAgenda: `'${fim}'`, lista: 'Reuniões do Copom' })}`;

/** Data de calendário que existe (o `paraDia` do engine rejeita 99/99, 31/02 etc.). */
const ehDataValida = (data: DataISO): boolean => {
  try {
    paraDia(data);
    return true;
  } catch {
    return false;
  }
};
const DataIso = z.string().refine(ehDataValida);
const deBR = (data: string): DataISO => `${data.slice(6, 10)}-${data.slice(3, 5)}-${data.slice(0, 2)}`;
const DataBR = z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/).refine((d) => ehDataValida(deBR(d)));
const MesAno = z.string().regex(/^(0[1-9]|1[0-2])\/\d{4}$/);
const DECIMAL = /^-?\d+(\.\d+)?$/;

const estatisticas = { Mediana: z.number(), DesvioPadrao: z.number().nullable(), Minimo: z.number(), Maximo: z.number() };
type Estatisticas = { Mediana: number; DesvioPadrao: number | null; Minimo: number; Maximo: number };
const estatisticasCoerentes = (l: Estatisticas): boolean =>
  l.Minimo <= l.Mediana && l.Mediana <= l.Maximo && (l.DesvioPadrao === null || l.DesvioPadrao >= 0);
const paraEst = (l: Estatisticas): EstatisticaFocus =>
  ({ mediana: l.Mediana, desvioPadrao: l.DesvioPadrao ?? 0, minimo: l.Minimo, maximo: l.Maximo });

function validar<T>(fonte: string, esquema: z.ZodType<T>, json: unknown): T {
  const r = esquema.safeParse(json);
  if (!r.success) throw new RespostaInvalidaError(fonte);
  return r.data;
}

function daColetaMaisRecente<T extends { Data: string }>(linhas: readonly T[]): { data: DataISO; linhas: T[] } {
  const data = linhas.reduce((max, l) => (l.Data > max ? l.Data : max), '');
  return { data, linhas: linhas.filter((l) => l.Data === data) };
}

const Sgs = z.array(z.object({ data: DataBR, valor: z.string().regex(DECIMAL) }));
export function interpretarSgs(json: unknown): { data: DataISO; valor: number }[] {
  return validar('SGS', Sgs, json).map((p) => ({ data: deBR(p.data), valor: Number(p.valor) }));
}

const FocusSelic = z.object({ value: z.array(z.object({
  Indicador: z.literal('Selic'), Data: DataIso, Reuniao: z.string().regex(/^R[1-8]\/\d{4}$/), ...estatisticas,
}).refine(estatisticasCoerentes)).min(1) });
export function interpretarFocusSelic(json: unknown): Pick<DadosFocus, 'dataColeta' | 'selicPorReuniao'> {
  const { data, linhas } = daColetaMaisRecente(validar('Focus Selic', FocusSelic, json).value);
  return { dataColeta: data, selicPorReuniao: linhas.map((l) => ({ reuniao: l.Reuniao, est: paraEst(l) })) };
}

const FocusMensal = z.object({ value: z.array(z.object({
  Indicador: z.literal('IPCA'), Data: DataIso, DataReferencia: MesAno, ...estatisticas,
}).refine(estatisticasCoerentes)).min(1) });
export function interpretarFocusIpcaMensal(json: unknown): Pick<DadosFocus, 'dataColeta' | 'ipcaMensal'> {
  const { data, linhas } = daColetaMaisRecente(validar('Focus IPCA mensal', FocusMensal, json).value);
  return { dataColeta: data, ipcaMensal: linhas.map((l) => ({ anoMes: `${l.DataReferencia.slice(3)}-${l.DataReferencia.slice(0, 2)}`, est: paraEst(l) })) };
}

const FocusAnual = z.object({ value: z.array(z.object({
  Indicador: z.enum(['Selic', 'IPCA']), Data: DataIso, DataReferencia: z.string().regex(/^\d{4}$/), ...estatisticas,
}).refine(estatisticasCoerentes)).min(1) });
export function interpretarFocusAnuais(json: unknown): Pick<DadosFocus, 'selicAnual' | 'ipcaAnual'> {
  const linhas = validar('Focus anual', FocusAnual, json).value;
  const de = (indicador: 'Selic' | 'IPCA') =>
    daColetaMaisRecente(linhas.filter((l) => l.Indicador === indicador)).linhas.map((l) => ({ ano: Number(l.DataReferencia), est: paraEst(l) }));
  const selicAnual = de('Selic');
  const ipcaAnual = de('IPCA');
  if (selicAnual.length === 0 || ipcaAnual.length === 0) throw new RespostaInvalidaError('Focus anual');
  return { selicAnual, ipcaAnual };
}

const Calendario = z.object({ conteudo: z.array(z.object({ dataEvento: z.string().regex(/^\d{4}-\d{2}-\d{2}T/).refine((d) => ehDataValida(d.slice(0, 10))) })).min(1) });
/** `dataEvento` vem em UTC às 03:00, que é meia-noite em BRT: a data é a parte AAAA-MM-DD. */
export function interpretarCalendarioCopom(json: unknown): DataISO[] {
  return validar('calendário do Copom', Calendario, json).conteudo.map((e) => e.dataEvento.slice(0, 10));
}

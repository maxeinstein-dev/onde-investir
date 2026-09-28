// src/dados/bcb.ts
import { z } from '../zod';
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
/** A série no ano civil inteiro (o ano corrente vem até o último dado publicado). */
export const urlSgsAno = (codigo: number, ano: number) =>
  `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados?formato=json&dataInicial=01/01/${ano}&dataFinal=31/12/${ano}`;
export const urlFocusSelic = () =>
  `${OLINDA}/ExpectativasMercadoSelic?${q({ $filter: 'baseCalculo eq 0', $orderby: 'Data desc', $top: '80', $format: 'json' })}`;
export const urlFocusIpcaMensal = () =>
  `${OLINDA}/ExpectativaMercadoMensais?${q({ $filter: "Indicador eq 'IPCA' and baseCalculo eq 0", $orderby: 'Data desc', $top: '100', $format: 'json' })}`;
export const urlFocusAnuais = () =>
  `${OLINDA}/ExpectativasMercadoAnuais?${q({ $filter: "(Indicador eq 'Selic' or Indicador eq 'IPCA') and baseCalculo eq 0", $orderby: 'Data desc', $top: '60', $format: 'json' })}`;
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

// Tamanho máximo das listas: acima disso a resposta não é a que pedimos.
const MAX_SGS = 100;
const MAX_FOCUS = 200;
const MAX_CALENDARIO = 64;

/**
 * Com `$orderby=Data desc` e `$top` cobrindo mais de uma coleta, todas as linhas numa só `Data` indicam
 * que o `$top` cortou a coleta mais recente no meio: melhor falhar que usar uma curva incompleta.
 */
function exigirMaisDeUmaColeta<T extends { Data: string }>(fonte: string, linhas: readonly T[]): readonly T[] {
  if (linhas.every((l) => l.Data === linhas[0]?.Data)) throw new RespostaInvalidaError(fonte);
  return linhas;
}

function daColetaMaisRecente<T extends { Data: string }>(linhas: readonly T[]): { data: DataISO; linhas: T[] } {
  const data = linhas.reduce((max, l) => (l.Data > max ? l.Data : max), '');
  return { data, linhas: linhas.filter((l) => l.Data === data) };
}

const Sgs = z.array(z.object({ data: DataBR, valor: z.string().regex(DECIMAL) })).max(MAX_SGS);
export function interpretarSgs(json: unknown): { data: DataISO; valor: number }[] {
  return validar('SGS', Sgs, json).map((p) => ({ data: deBR(p.data), valor: Number(p.valor) }));
}

// Um ano civil de série diária tem até 366 pontos (a 226 e a 432 têm um por dia corrido). A 226 repete o dia 1º
// para os aniversários 29, 30 e 31 do mês anterior (cerca de 372 pontos no ano): a folga cobre isso.
const MAX_SGS_ANO = 400;
const SgsAno = z.array(z.object({ data: DataBR, dataFim: DataBR.optional(), valor: z.string().regex(DECIMAL) })).max(MAX_SGS_ANO);
export interface PontoSgs { data: DataISO; valor: number; dataFim?: DataISO }
/**
 * Um ano da série, com o valor como o SGS publica (em %). Lista vazia é válida (ano sem dado ainda). Lança
 * RespostaInvalidaError se algum ponto estiver fora do ano, o `dataFim` (da 226) não vier depois da data ou o par
 * data e `dataFim` se repetir. A mesma data com `dataFim` diferentes é da 226: ver `trPorInicio` no histórico.
 */
export function interpretarSgsAno(json: unknown, ano: number): PontoSgs[] {
  const pontos = validar('SGS', SgsAno, json).map((p): PontoSgs => ({
    data: deBR(p.data), ...(p.dataFim === undefined ? {} : { dataFim: deBR(p.dataFim) }), valor: Number(p.valor),
  }));
  const vistos = new Set<string>();
  for (const p of pontos) {
    const chave = `${p.data}/${p.dataFim ?? ''}`;
    if (!p.data.startsWith(`${ano}-`) || vistos.has(chave)) throw new RespostaInvalidaError('SGS');
    if (p.dataFim !== undefined && p.dataFim <= p.data) throw new RespostaInvalidaError('SGS');
    vistos.add(chave);
  }
  return pontos;
}

const FocusSelic = z.object({ value: z.array(z.object({
  Indicador: z.literal('Selic'), Data: DataIso, Reuniao: z.string().regex(/^R[1-8]\/\d{4}$/), ...estatisticas,
}).refine(estatisticasCoerentes)).min(1).max(MAX_FOCUS) });
export function interpretarFocusSelic(json: unknown): Pick<DadosFocus, 'dataColeta' | 'selicPorReuniao'> {
  const { data, linhas } = daColetaMaisRecente(exigirMaisDeUmaColeta('Focus Selic', validar('Focus Selic', FocusSelic, json).value));
  return { dataColeta: data, selicPorReuniao: linhas.map((l) => ({ reuniao: l.Reuniao, est: paraEst(l) })) };
}

const FocusMensal = z.object({ value: z.array(z.object({
  Indicador: z.literal('IPCA'), Data: DataIso, DataReferencia: MesAno, ...estatisticas,
}).refine(estatisticasCoerentes)).min(1).max(MAX_FOCUS) });
export function interpretarFocusIpcaMensal(json: unknown): Pick<DadosFocus, 'dataColeta' | 'ipcaMensal'> {
  const { data, linhas } = daColetaMaisRecente(exigirMaisDeUmaColeta('Focus IPCA mensal', validar('Focus IPCA mensal', FocusMensal, json).value));
  return { dataColeta: data, ipcaMensal: linhas.map((l) => ({ anoMes: `${l.DataReferencia.slice(3)}-${l.DataReferencia.slice(0, 2)}`, est: paraEst(l) })) };
}

const FocusAnual = z.object({ value: z.array(z.object({
  Indicador: z.enum(['Selic', 'IPCA']), Data: DataIso, DataReferencia: z.string().regex(/^\d{4}$/), ...estatisticas,
}).refine(estatisticasCoerentes)).min(1).max(MAX_FOCUS) });
/** `dataColeta` é a menor entre a coleta mais recente da Selic e a do IPCA. */
export function interpretarFocusAnuais(json: unknown): Pick<DadosFocus, 'dataColeta' | 'selicAnual' | 'ipcaAnual'> {
  const linhas = exigirMaisDeUmaColeta('Focus anual', validar('Focus anual', FocusAnual, json).value);
  const de = (indicador: 'Selic' | 'IPCA') => daColetaMaisRecente(linhas.filter((l) => l.Indicador === indicador));
  const selic = de('Selic');
  const ipca = de('IPCA');
  if (selic.linhas.length === 0 || ipca.linhas.length === 0) throw new RespostaInvalidaError('Focus anual');
  const paraAno = (l: (typeof linhas)[number]) => ({ ano: Number(l.DataReferencia), est: paraEst(l) });
  return {
    dataColeta: selic.data < ipca.data ? selic.data : ipca.data,
    selicAnual: selic.linhas.map(paraAno),
    ipcaAnual: ipca.linhas.map(paraAno),
  };
}

const Calendario = z.object({ conteudo: z.array(z.object({ dataEvento: z.string().regex(/^\d{4}-\d{2}-\d{2}T/).refine((d) => ehDataValida(d.slice(0, 10))) })).min(1).max(MAX_CALENDARIO) });
/** `dataEvento` vem em UTC às 03:00, que é meia-noite em BRT: a data é a parte AAAA-MM-DD. */
export function interpretarCalendarioCopom(json: unknown): DataISO[] {
  return validar('calendário do Copom', Calendario, json).conteudo.map((e) => e.dataEvento.slice(0, 10));
}

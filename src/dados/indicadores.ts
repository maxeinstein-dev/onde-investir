// src/dados/indicadores.ts
import { z } from '../zod';
import { anunciosDoCalendario, numerarReunioes, type ReuniaoCopom } from '../engine/copom';
import type { DataISO } from '../engine/datas';
import type { DadosFocus } from '../engine/projecao';
import {
  RespostaInvalidaError, interpretarCalendarioCopom, interpretarFocusAnuais, interpretarFocusIpcaMensal, interpretarFocusSelic,
  interpretarSgs, urlCalendarioCopom, urlFocusAnuais, urlFocusIpcaMensal, urlFocusSelic, urlSgsUltimos,
} from './bcb';
import { gravarCache, lerCache, type Armazenamento } from './cache';
import { validadeDiaria, validadeFocus, validadeHoras } from './validade';

export type Buscar = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
export type StatusFonte = 'REDE' | 'CACHE' | 'CACHE_VENCIDO' | 'FALHOU';
/** Valores atuais do SGS, já em fração. */
export interface AtuaisSgs { dataReferencia: DataISO; selicMetaAA: number; cdiAA: number; ipca12mAA: number; trAM: number }
export interface IndicadoresCarregados {
  atuais: AtuaisSgs | null;
  focus: DadosFocus | null;
  reunioes: ReuniaoCopom[] | null;
  status: { sgs: StatusFonte; focus: StatusFonte; copom: StatusFonte };
  obtidoEm: { sgs?: number; focus?: number; copom?: number };
  /** As três consultas do Focus (Selic, IPCA mensal e anual) vieram de coletas diferentes; `focus.dataColeta` é a menor. */
  focusDefasado: boolean;
}

export const TIMEOUT_PADRAO_MS = 10_000;
const BRT_MS = -3 * 3_600_000;

// Esquemas do domínio (o que vai para o cache), não do JSON cru.
const DataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const finito = z.number(); // no zod 4, z.number() já rejeita NaN e ±Infinity
const EsquemaAtuais = z.object({ dataReferencia: DataIso, selicMetaAA: finito, cdiAA: finito, ipca12mAA: finito, trAM: finito });
const Est = z.object({ mediana: finito, desvioPadrao: finito, minimo: finito, maximo: finito });
const EsquemaFocus = z.object({
  dataColeta: DataIso,
  selicPorReuniao: z.array(z.object({ reuniao: z.string().regex(/^R[1-8]\/\d{4}$/), est: Est })).min(1),
  ipcaMensal: z.array(z.object({ anoMes: z.string().regex(/^\d{4}-\d{2}$/), est: Est })).min(1),
  selicAnual: z.array(z.object({ ano: z.number().int(), est: Est })).min(1),
  ipcaAnual: z.array(z.object({ ano: z.number().int(), est: Est })).min(1),
});
/** O que vai para o cache do Focus: os dados e se as coletas divergiram. Cache no formato anterior não passa e é rebuscado. */
const EsquemaFocusCarregado = z.object({ focus: EsquemaFocus, defasado: z.boolean() });
interface FocusCarregado { focus: DadosFocus; defasado: boolean }
const EsquemaReunioes = z.array(z.object({ id: z.string().regex(/^R[1-8]\/\d{4}$/), anuncio: DataIso, estimada: z.boolean() })).min(1);

/** Uma requisição com timeout: aborta o sinal e rejeita mesmo que `buscar` ignore o sinal. */
export async function obterJson(buscar: Buscar, url: string, timeoutMs: number): Promise<unknown> {
  const controle = new AbortController();
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const estouro = new Promise<never>((_, rejeitar) => {
    relogio = setTimeout(() => {
      controle.abort();
      rejeitar(new Error('Tempo esgotado'));
    }, timeoutMs);
  });
  try {
    const resposta = await Promise.race([buscar(url, { signal: controle.signal }), estouro]);
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    return await Promise.race([resposta.json(), estouro]);
  } finally {
    clearTimeout(relogio);
  }
}

const ultimo = <T>(pontos: readonly T[], fonte: string): T => {
  const p = pontos.at(-1);
  if (p === undefined) throw new RespostaInvalidaError(fonte);
  return p;
};

async function redeSgs(obter: (url: string) => Promise<unknown>): Promise<AtuaisSgs> {
  const serie = (codigo: number, n: number) => obter(urlSgsUltimos(codigo, n)).then(interpretarSgs);
  const [meta, cdi, ipca, tr] = await Promise.all([serie(432, 1), serie(4389, 1), serie(433, 12), serie(226, 1)]);
  if (ipca.length !== 12) throw new RespostaInvalidaError('SGS 433');
  const pontoCdi = ultimo(cdi, 'SGS 4389');
  return {
    // A 432 é preenchida para a frente até a próxima reunião: a data de referência vem da 4389.
    dataReferencia: pontoCdi.data,
    selicMetaAA: ultimo(meta, 'SGS 432').valor / 100,
    cdiAA: pontoCdi.valor / 100,
    ipca12mAA: ipca.reduce((fator, p) => fator * (1 + p.valor / 100), 1) - 1,
    trAM: ultimo(tr, 'SGS 226').valor / 100,
  };
}

async function redeFocus(obter: (url: string) => Promise<unknown>): Promise<FocusCarregado> {
  const [selic, mensal, anuais] = await Promise.all([
    obter(urlFocusSelic()).then(interpretarFocusSelic),
    obter(urlFocusIpcaMensal()).then(interpretarFocusIpcaMensal),
    obter(urlFocusAnuais()).then(interpretarFocusAnuais),
  ]);
  const coletas = [selic.dataColeta, mensal.dataColeta, anuais.dataColeta];
  const focus: DadosFocus = {
    dataColeta: coletas.reduce((min, d) => (d < min ? d : min)),
    selicPorReuniao: selic.selicPorReuniao,
    ipcaMensal: mensal.ipcaMensal,
    selicAnual: anuais.selicAnual,
    ipcaAnual: anuais.ipcaAnual,
  };
  return { focus, defasado: new Set(coletas).size > 1 };
}

async function redeCopom(obter: (url: string) => Promise<unknown>, agoraMs: number): Promise<ReuniaoCopom[]> {
  const ano = Number(new Date(agoraMs + BRT_MS).toISOString().slice(0, 4));
  const dias = interpretarCalendarioCopom(await obter(urlCalendarioCopom(`${ano}-01-01`, `${ano + 2}-12-31`)));
  // Reunião extraordinária (R9) fica de fora de propósito: numerarReunioes lança acima de 8 reuniões no ano,
  // o grupo cai no cache vencido (ou FALHOU) e o cenário usa o manual. É raro e aceitável.
  return numerarReunioes(anunciosDoCalendario(dias));
}

/** `validoAte` é uma função: calculada dentro do grupo, se lançar o grupo trata como falha da rede. */
interface Grupo<T> { chave: string; esquema: z.ZodType<T>; validoAte: () => number; rede: () => Promise<T> }
interface ResultadoGrupo<T> { dados: T | null; status: StatusFonte; obtidoEm?: number }

/** Cache válido → rede → cache vencido → FALHOU. Nunca lança. */
async function carregarGrupo<T>(g: Grupo<T>, armazenamento: Armazenamento, agoraMs: number): Promise<ResultadoGrupo<T>> {
  const cache = lerCache(armazenamento, g.chave, g.esquema, agoraMs);
  if (cache && !cache.vencido) return { dados: cache.dados, status: 'CACHE', obtidoEm: cache.obtidoEm };
  try {
    const dados = g.esquema.parse(await g.rede());
    gravarCache(armazenamento, g.chave, dados, agoraMs, g.validoAte());
    return { dados, status: 'REDE', obtidoEm: agoraMs };
  } catch {
    if (cache) return { dados: cache.dados, status: 'CACHE_VENCIDO', obtidoEm: cache.obtidoEm };
    return { dados: null, status: 'FALHOU' };
  }
}

const FALHA: ResultadoGrupo<never> = { dados: null, status: 'FALHOU' };
const resultado = <T>(r: PromiseSettledResult<ResultadoGrupo<T>>): ResultadoGrupo<T> => (r.status === 'fulfilled' ? r.value : FALHA);

export async function carregarIndicadores(deps: {
  buscar: Buscar; armazenamento: Armazenamento; agoraMs: number; timeoutMs?: number;
}): Promise<IndicadoresCarregados> {
  const { buscar, armazenamento, timeoutMs = TIMEOUT_PADRAO_MS } = deps;
  const agoraMs = Number.isFinite(deps.agoraMs) ? deps.agoraMs : Date.now();
  const obter = (url: string) => obterJson(buscar, url, timeoutMs);
  const [sgs, focus, copom] = await Promise.allSettled([
    carregarGrupo({ chave: 'sgs', esquema: EsquemaAtuais, validoAte: () => validadeDiaria(agoraMs), rede: () => redeSgs(obter) }, armazenamento, agoraMs),
    carregarGrupo({ chave: 'focus', esquema: EsquemaFocusCarregado, validoAte: () => validadeFocus(agoraMs), rede: () => redeFocus(obter) }, armazenamento, agoraMs),
    carregarGrupo({ chave: 'copom', esquema: EsquemaReunioes, validoAte: () => validadeHoras(agoraMs, 24 * 7), rede: () => redeCopom(obter, agoraMs) }, armazenamento, agoraMs),
  ]);
  const s = resultado(sgs);
  const f = resultado(focus);
  const c = resultado(copom);
  const obtidoEm: IndicadoresCarregados['obtidoEm'] = {};
  if (s.obtidoEm !== undefined) obtidoEm.sgs = s.obtidoEm;
  if (f.obtidoEm !== undefined) obtidoEm.focus = f.obtidoEm;
  if (c.obtidoEm !== undefined) obtidoEm.copom = c.obtidoEm;
  return {
    atuais: s.dados,
    focus: f.dados?.focus ?? null,
    reunioes: c.dados,
    status: { sgs: s.status, focus: f.status, copom: c.status },
    obtidoEm,
    focusDefasado: f.dados?.defasado ?? false,
  };
}

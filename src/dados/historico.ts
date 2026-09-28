// Histórico realizado do SGS (spec §4.3): CDI, Selic over, IPCA, TR e Selic meta, por ano civil, com cache por série e ano.
import { z } from '../zod';
import { type DataISO, ehDataValida } from '../engine/datas';
import type { SeriesRealizadas } from '../engine/historico';
import { type PontoSgs, RespostaInvalidaError, interpretarSgsAno, urlSgsAno } from './bcb';
import { gravarCache, lerCache, type Armazenamento } from './cache';
import { type Buscar, type StatusFonte, TIMEOUT_PADRAO_MS, obterJson } from './indicadores';
import { validadeDiaria } from './validade';

/** 12 (CDI, % a.d.), 11 (Selic over, % a.d.), 433 (IPCA, % a.m.), 226 (TR, % a.m.) e 432 (Selic meta, % a.a.). */
export const SERIES_HISTORICO = [12, 11, 433, 226, 432] as const;
export type SerieHistorico = (typeof SERIES_HISTORICO)[number];
/** Anos civis para trás, além do corrente. Aplicação mais antiga: o histórico começa no limite e, antes dele, vale o cenário. */
export const LIMITE_ANOS_HISTORICO = 10;

export interface HistoricoCarregado {
  /** null quando não há nenhum CDI realizado (sem ele não há `ultimaData`). */
  series: SeriesRealizadas | null;
  /** A pior situação entre as séries e anos: FALHOU se algum faltou (nem rede, nem cache). */
  status: StatusFonte;
  /** Série e ano sem dado: o valor sai sem o histórico completo, e a UI avisa. */
  faltando: { serie: SerieHistorico; ano: number }[];
  /** `desde` passou do limite de {@link LIMITE_ANOS_HISTORICO} anos: o histórico começa em `inicio`. */
  limitado: boolean;
  /** O primeiro dia buscado (1º de janeiro do primeiro ano). */
  inicio: DataISO;
}

const BRT_MS = -3 * 3_600_000;
/** Ano passado não muda mais: o cache fica valendo para sempre (Infinity não passa pelo JSON). */
const PERMANENTE = Number.MAX_SAFE_INTEGER;
/** Requisições ao mesmo tempo: a primeira carga de 11 anos são 55, uma por série e ano. */
const REQUISICOES_SIMULTANEAS = 5;

// No cache, o valor já em fração (0,05% a.d. → 0.0005), com a data do SGS em AAAA-MM-DD.
const EsquemaAno = z.array(z.tuple([z.string().refine(ehDataValida), z.number().gt(-1)])).max(366);
type PontosAno = z.infer<typeof EsquemaAno>;

interface ResultadoAno { serie: SerieHistorico; ano: number; pontos: PontosAno | null; status: StatusFonte }

/**
 * O ano está completo e não muda mais? Só depois de janeiro do ano seguinte: o IPCA de dezembro sai por volta do
 * dia 10 de janeiro, e um ano gravado como permanente antes disso ficaria sem ele para sempre.
 */
const ehPermanente = (ano: number, hoje: DataISO): boolean => hoje >= `${ano + 1}-02-01`;

/** Tarefas que nunca lançam, até `limite` ao mesmo tempo, com os resultados na ordem. */
async function comLimite<T, R>(itens: readonly T[], limite: number, f: (item: T) => Promise<R>): Promise<R[]> {
  const resultados: R[] = [];
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      resultados[i] = await f(itens[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
  return resultados;
}

/**
 * Os pontos do SGS em fração, uma data por ponto. Na 226 o dia 1º aparece mais de uma vez: o período que vai até o
 * dia 1º do mês seguinte (o da poupança com aniversário no dia 1º) e os que vão até 29, 30 e 31 (os aniversários
 * nesses dias no mês anterior, que o engine já leva para o dia 1º). Fica o de `dataFim` mais distante, o mês cheio.
 */
function paraFracao(serie: SerieHistorico, pontos: readonly PontoSgs[]): PontosAno {
  const porData = new Map<DataISO, PontoSgs>();
  for (const p of pontos) {
    const atual = porData.get(p.data);
    if (atual === undefined) porData.set(p.data, p);
    else if (serie !== 226) throw new RespostaInvalidaError(`SGS ${serie}`);
    else if ((p.dataFim ?? '') > (atual.dataFim ?? '')) porData.set(p.data, p);
  }
  return [...porData.values()].map((p) => [p.data, p.valor / 100]);
}

function montar(resultados: readonly ResultadoAno[]): SeriesRealizadas | null {
  const mapa = (serie: SerieHistorico, chave: (data: DataISO) => string = (d) => d) =>
    new Map(resultados.filter((r) => r.serie === serie).flatMap((r) => r.pontos ?? []).map(([d, v]) => [chave(d), v] as const));
  const cdiDiario = mapa(12);
  if (cdiDiario.size === 0) return null;
  const ultimaData = [...cdiDiario.keys()].reduce((max, d) => (d > max ? d : max));
  return {
    cdiDiario,
    selicOverDiaria: mapa(11),
    ipcaMensal: mapa(433, (d) => d.slice(0, 7)),
    // A 226 traz `data` e `dataFim`: a TR vale para o período que começa em `data` (o aniversário da poupança).
    trPorInicio: mapa(226),
    selicMetaAA: mapa(432),
    ultimaData,
  };
}

function statusGeral(resultados: readonly ResultadoAno[]): StatusFonte {
  const tem = (s: StatusFonte) => resultados.some((r) => r.status === s);
  if (resultados.length === 0 || tem('FALHOU')) return 'FALHOU';
  if (tem('CACHE_VENCIDO')) return 'CACHE_VENCIDO';
  if (tem('REDE')) return 'REDE';
  return 'CACHE';
}

/**
 * O histórico de `desde` até hoje, por ano civil e série. Cada série e ano: cache válido → rede → cache vencido →
 * falta. O ano passado (depois de janeiro) fica no cache para sempre; o corrente vale até a próxima publicação do
 * SGS. Só busca o que falta ou venceu, uma requisição por série e ano. Os percentuais viram fração aqui, uma vez.
 * Nunca lança.
 */
export async function carregarHistorico(deps: {
  buscar: Buscar; armazenamento: Armazenamento; agoraMs: number; desde: DataISO; timeoutMs?: number;
}): Promise<HistoricoCarregado> {
  const { buscar, armazenamento, desde, timeoutMs = TIMEOUT_PADRAO_MS } = deps;
  const agoraMs = Number.isFinite(deps.agoraMs) ? deps.agoraMs : Date.now();
  const hoje = new Date(agoraMs + BRT_MS).toISOString().slice(0, 10);
  const anoAtual = Number(hoje.slice(0, 4));
  const anoMinimo = anoAtual - LIMITE_ANOS_HISTORICO;
  if (!ehDataValida(desde)) return { series: null, status: 'FALHOU', faltando: [], limitado: false, inicio: `${anoAtual}-01-01` };

  const anoDesde = Math.min(Number(desde.slice(0, 4)), anoAtual);
  const anoInicio = Math.max(anoDesde, anoMinimo);
  const tarefas: { serie: SerieHistorico; ano: number }[] = [];
  for (let ano = anoInicio; ano <= anoAtual; ano++) for (const serie of SERIES_HISTORICO) tarefas.push({ serie, ano });

  const carregarAno = async ({ serie, ano }: { serie: SerieHistorico; ano: number }): Promise<ResultadoAno> => {
    const chave = `hist:${serie}:${ano}`;
    const cache = lerCache(armazenamento, chave, EsquemaAno, agoraMs);
    if (cache && !cache.vencido) return { serie, ano, pontos: cache.dados, status: 'CACHE' };
    try {
      const json = await obterJson(buscar, urlSgsAno(serie, ano), timeoutMs);
      const pontos: PontosAno = paraFracao(serie, interpretarSgsAno(json, ano));
      const dados = EsquemaAno.parse(pontos);
      gravarCache(armazenamento, chave, dados, agoraMs, ehPermanente(ano, hoje) ? PERMANENTE : validadeDiaria(agoraMs));
      return { serie, ano, pontos: dados, status: 'REDE' };
    } catch {
      if (cache) return { serie, ano, pontos: cache.dados, status: 'CACHE_VENCIDO' };
      return { serie, ano, pontos: null, status: 'FALHOU' };
    }
  };

  const resultados = await comLimite(tarefas, REQUISICOES_SIMULTANEAS, carregarAno);
  return {
    series: montar(resultados),
    status: statusGeral(resultados),
    faltando: resultados.filter((r) => r.pontos === null).map(({ serie, ano }) => ({ serie, ano })),
    limitado: anoDesde < anoMinimo,
    inicio: `${anoInicio}-01-01`,
  };
}

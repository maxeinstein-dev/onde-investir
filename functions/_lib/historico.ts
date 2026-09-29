// functions/_lib/historico.ts
// Lógica do histórico de um ticker (KV + brapi), separada da Pages Function para ser testável sem os tipos
// globais do Cloudflare: o KV e a chamada à brapi entram por parâmetro. A Function (api/mercado/historico.ts)
// só cuida da sessão e de montar a Response.
import { orcamentoDiario, precisaAtualizarHistorico } from './mercado';

/** O pedaço do KV que usamos (o KVNamespace de verdade satisfaz esta interface). */
export interface KvLike {
  get<T = unknown>(chave: string, tipo: 'json'): Promise<T | null>;
  get(chave: string): Promise<string | null>;
  put(chave: string, valor: string, opcoes?: { expirationTtl?: number }): Promise<void>;
}

/** A resposta da brapi que interessa: status e corpo. Nunca leva token nem cabeçalhos. */
export interface RespostaBrapi { ok: boolean; status: number; json(): Promise<unknown> }
export type BuscaBrapi = (ticker: string) => Promise<RespostaBrapi>;

/** Evento para o log (Cloudflare mostra em `wrangler tail`/Logs). Só ticker e status: sem token, sem cabeçalhos. */
export interface EventoLog { evento: 'brapi_erro' | 'brapi_sem_dados'; ticker: string; statusFonte?: number }

export interface EntradaHistorico {
  ticker: string;
  kv: KvLike;
  buscar: BuscaBrapi;
  agora: Date;
  registrar?: (e: EventoLog) => void;
}

export interface SaidaHistorico { status: number; corpo: Record<string, unknown> }

interface Candle { data: string; abertura: number; maxima: number; minima: number; fechamento: number; volume: number }
interface Meta { desde: string; ate: string }
interface PontoBrapi { date: number; open: number; high: number; low: number; close: number; volume: number }

const TETO_DIARIO = 400; // heurística do app, sem fonte legal — ajustável.
/** Quanto tempo lembrar que a brapi respondeu 404 para um código (evita gastar cota repetindo o pedido). */
const TTL_NAO_ENCONTRADO_S = 6 * 60 * 60;
/** 200 sem nenhum candle é um sinal mais ambíguo (ticker recém-listado): lembra por menos tempo. */
const TTL_SEM_CANDLES_S = 30 * 60;

const diaISO = (d: Date): string => d.toISOString().slice(0, 10);
const mesISO = (d: Date): string => d.toISOString().slice(0, 7);
const diaDoTimestamp = (unix: number): string => new Date(unix * 1000).toISOString().slice(0, 10);
/** Descarta pontos sem data de verdade (a brapi já devolveu null): `new Date(NaN).toISOString()` lançaria RangeError. */
const pontoValido = (p: PontoBrapi): boolean => typeof p?.date === 'number' && Number.isFinite(p.date);

function diasRestantesNoMes(d: Date): number {
  const ultimoDia = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return ultimoDia - d.getUTCDate() + 1;
}

const naoEncontrado = (): SaidaHistorico => ({ status: 404, corpo: { erro: 'TICKER_NAO_ENCONTRADO' } });
const indisponivel = (statusFonte?: number): SaidaHistorico => ({
  status: 502,
  corpo: statusFonte === undefined ? { erro: 'BRAPI_INDISPONIVEL' } : { erro: 'BRAPI_INDISPONIVEL', statusFonte },
});

export async function resolverHistorico(e: EntradaHistorico): Promise<SaidaHistorico> {
  const { ticker, kv, buscar, agora } = e;
  const registrar = e.registrar ?? (() => {});
  const hoje = diaISO(agora);
  const chaveNegativa = `historico:${ticker}:naoencontrado`;
  const meta = await kv.get<Meta>(`historico:${ticker}:meta`, 'json');

  // Sem nada salvo e a brapi já disse há pouco que não conhece o código: responde direto, sem gastar cota.
  if (!meta && (await kv.get(chaveNegativa)) !== null) return naoEncontrado();

  if (precisaAtualizarHistorico(meta?.ate ?? null, hoje)) {
    // Histórico não tem "servir desatualizado": o que está salvo nunca fica errado, só atrasado. Se o orçamento
    // do dia acabou, pula a atualização e serve o que já existe.
    const chaveMensal = `cota:mensal:${mesISO(agora)}`;
    const chaveDiaria = `cota:diario:${diaISO(agora)}`;
    const usoMensal = Number(await kv.get(chaveMensal)) || 0;
    const usoDiario = Number(await kv.get(chaveDiaria)) || 0;
    const orcamento = orcamentoDiario(usoMensal, diasRestantesNoMes(agora), TETO_DIARIO);

    if (usoDiario < orcamento) {
      let resp: RespostaBrapi;
      try {
        resp = await buscar(ticker);
      } catch {
        registrar({ evento: 'brapi_erro', ticker });
        return indisponivel();
      }

      if (resp.ok) {
        let dados: { results?: { historicalDataPrice?: PontoBrapi[] | null }[] | null };
        try {
          dados = await resp.json() as typeof dados;
        } catch {
          registrar({ evento: 'brapi_erro', ticker, statusFonte: resp.status });
          return indisponivel(resp.status);
        }
        const pontos = (dados?.results?.[0]?.historicalDataPrice ?? []).filter(pontoValido);

        if (pontos.length === 0 && !meta) {
          // A brapi respondeu, mas sem nenhum candle e não há histórico salvo: o código não existe na fonte.
          registrar({ evento: 'brapi_sem_dados', ticker, statusFonte: resp.status });
          await kv.put(chaveNegativa, '1', { expirationTtl: TTL_SEM_CANDLES_S });
          return naoEncontrado();
        }

        let maiorData = meta?.ate ?? '';
        for (const c of pontos) {
          const data = diaDoTimestamp(c.date);
          const candle: Candle = { data, abertura: c.open, maxima: c.high, minima: c.low, fechamento: c.close, volume: c.volume };
          await kv.put(`historico:${ticker}:${data}`, JSON.stringify(candle));
          if (data > maiorData) maiorData = data;
        }
        const novaMeta: Meta = { desde: meta?.desde ?? (pontos[0] ? diaDoTimestamp(pontos[0].date) : hoje), ate: maiorData || hoje };
        await kv.put(`historico:${ticker}:meta`, JSON.stringify(novaMeta));

        const conhecidos = (await kv.get<string[]>('tickers:conhecidos', 'json')) ?? [];
        if (!conhecidos.includes(ticker)) await kv.put('tickers:conhecidos', JSON.stringify([...conhecidos, ticker]));

        await kv.put(chaveMensal, String(usoMensal + 1));
        await kv.put(chaveDiaria, String(usoDiario + 1), { expirationTtl: 48 * 60 * 60 });
      } else if (resp.status === 404) {
        registrar({ evento: 'brapi_sem_dados', ticker, statusFonte: resp.status });
        if (!meta) {
          await kv.put(chaveNegativa, '1', { expirationTtl: TTL_NAO_ENCONTRADO_S });
          return naoEncontrado();
        }
      } else {
        // 401/402/403/429/5xx: plano, cota ou serviço da brapi. Não é culpa do código digitado: sem cache negativo.
        registrar({ evento: 'brapi_erro', ticker, statusFonte: resp.status });
        if (!meta) return indisponivel(resp.status);
      }
    }
  }

  const metaFinal = await kv.get<Meta>(`historico:${ticker}:meta`, 'json');
  if (!metaFinal) return indisponivel();

  // Varre dia a dia entre `desde` e `ate`, uma leitura de KV por dia (caro para históricos longos; aceitável
  // para o volume deste app pessoal — a melhoria óbvia seria uma lista serializada por ticker).
  const candles: Candle[] = [];
  for (let d = metaFinal.desde; d <= metaFinal.ate; ) {
    const c = await kv.get<Candle>(`historico:${ticker}:${d}`, 'json');
    if (c) candles.push(c);
    d = new Date(new Date(d).getTime() + 86400000).toISOString().slice(0, 10);
  }
  return { status: 200, corpo: { ticker, candles } };
}

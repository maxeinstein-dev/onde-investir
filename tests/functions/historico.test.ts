import { describe, expect, it, vi } from 'vitest';
import { type BuscaBrapi, type KvLike, resolverHistorico } from '../../functions/_lib/historico';

/** KV em memória: guarda o valor cru (string) e as opções do put, como o KV de verdade. */
function kvFalso(inicial: Record<string, unknown> = {}) {
  const dados = new Map<string, string>(Object.entries(inicial).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  const opcoes = new Map<string, { expirationTtl?: number } | undefined>();
  const kv: KvLike = {
    get: (async (chave: string, tipo?: 'json') => {
      const v = dados.get(chave);
      if (v === undefined) return null;
      return tipo === 'json' ? JSON.parse(v) : v;
    }) as KvLike['get'],
    put: async (chave, valor, o) => { dados.set(chave, valor); opcoes.set(chave, o); },
  };
  return { kv, dados, opcoes };
}

const AGORA = new Date('2026-09-29T15:00:00Z'); // terça-feira, 12h em Brasília
const HOJE = '2026-09-29';
const unix = (iso: string) => Math.floor(new Date(`${iso}T13:00:00Z`).getTime() / 1000);

const respostaBrapi = (status: number, corpo: unknown = {}): BuscaBrapi =>
  vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => corpo });

const comCandles = (datas: string[]) => ({
  results: [{ historicalDataPrice: datas.map((d, i) => ({ date: unix(d), open: 10 + i, high: 11 + i, low: 9 + i, close: 10.5 + i, volume: 1000 })) }],
});

const base = (kv: KvLike, buscar: BuscaBrapi, registrar = vi.fn()) => ({ ticker: 'KNSC11', kv, buscar, agora: AGORA, registrar });

describe('resolverHistorico: código que a brapi não conhece', () => {
  it('brapi 404: responde TICKER_NAO_ENCONTRADO (404), registra o status e guarda um cache negativo curto', async () => {
    const { kv, dados, opcoes } = kvFalso();
    const registrar = vi.fn();
    const r = await resolverHistorico(base(kv, respostaBrapi(404), registrar));
    expect(r.status).toBe(404);
    expect(r.corpo).toEqual({ erro: 'TICKER_NAO_ENCONTRADO' });
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ evento: 'brapi_sem_dados', ticker: 'KNSC11', statusFonte: 404 }));
    expect(dados.has('historico:KNSC11:naoencontrado')).toBe(true);
    expect(opcoes.get('historico:KNSC11:naoencontrado')?.expirationTtl).toBe(6 * 60 * 60);
    expect(dados.has('historico:KNSC11:meta')).toBe(false); // não grava um histórico "vazio"
  });

  it('brapi 200 sem candles e sem histórico salvo: também é "não encontrado", sem meta vazia', async () => {
    const { kv, dados, opcoes } = kvFalso();
    const r = await resolverHistorico(base(kv, respostaBrapi(200, { results: [] })));
    expect(r.status).toBe(404);
    expect(r.corpo).toEqual({ erro: 'TICKER_NAO_ENCONTRADO' });
    expect(dados.has('historico:KNSC11:meta')).toBe(false);
    expect(dados.has('historico:KNSC11:naoencontrado')).toBe(true);
    // 200 vazio é um sinal mais ambíguo que o 404 (ticker recém-listado): lembra por menos tempo.
    expect(opcoes.get('historico:KNSC11:naoencontrado')?.expirationTtl).toBe(30 * 60);
  });

  it.each([
    ['results ausente', {}],
    ['results null', { results: null }],
    ['historicalDataPrice null', { results: [{ historicalDataPrice: null }] }],
  ])('brapi 200 com %s: "não encontrado", sem lançar', async (_nome, corpo) => {
    const { kv } = kvFalso();
    const r = await resolverHistorico(base(kv, respostaBrapi(200, corpo)));
    expect(r.status).toBe(404);
  });

  it('brapi 200 com results sem historicalDataPrice: também é "não encontrado"', async () => {
    const { kv } = kvFalso();
    const r = await resolverHistorico(base(kv, respostaBrapi(200, { results: [{ symbol: 'KNSC11' }] })));
    expect(r.status).toBe(404);
  });

  it('cache negativo: a segunda consulta não chama a brapi', async () => {
    const { kv } = kvFalso({ 'historico:KNSC11:naoencontrado': '1' });
    const buscar = respostaBrapi(200, comCandles(['2026-09-29']));
    const r = await resolverHistorico(base(kv, buscar));
    expect(r.status).toBe(404);
    expect(r.corpo).toEqual({ erro: 'TICKER_NAO_ENCONTRADO' });
    expect(buscar).not.toHaveBeenCalled();
  });

  it('cache negativo não esconde um histórico que já existe', async () => {
    const { kv } = kvFalso({
      'historico:KNSC11:naoencontrado': '1',
      'historico:KNSC11:meta': { desde: HOJE, ate: HOJE },
      [`historico:KNSC11:${HOJE}`]: { data: HOJE, abertura: 1, maxima: 2, minima: 1, fechamento: 2, volume: 1 },
    });
    const r = await resolverHistorico(base(kv, respostaBrapi(404)));
    expect(r.status).toBe(200);
  });
});

describe('resolverHistorico: brapi indisponível (o motivo deixa de ser engolido)', () => {
  it.each([401, 402, 403, 429, 500, 503])('brapi %i: 502 BRAPI_INDISPONIVEL com statusFonte, registra o status e NÃO guarda cache negativo', async (status) => {
    const { kv, dados } = kvFalso();
    const registrar = vi.fn();
    const r = await resolverHistorico(base(kv, respostaBrapi(status), registrar));
    expect(r.status).toBe(502);
    expect(r.corpo).toEqual({ erro: 'BRAPI_INDISPONIVEL', statusFonte: status });
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ evento: 'brapi_erro', ticker: 'KNSC11', statusFonte: status }));
    expect(dados.has('historico:KNSC11:naoencontrado')).toBe(false);
  });

  it('a chamada à brapi que lança (rede) também vira 502, sem statusFonte', async () => {
    const { kv } = kvFalso();
    const buscar: BuscaBrapi = vi.fn().mockRejectedValue(new Error('rede'));
    const r = await resolverHistorico(base(kv, buscar));
    expect(r.status).toBe(502);
    expect(r.corpo).toEqual({ erro: 'BRAPI_INDISPONIVEL' });
  });

  it('o log nunca leva token nem cabeçalhos', async () => {
    const { kv } = kvFalso();
    const registrar = vi.fn();
    await resolverHistorico(base(kv, respostaBrapi(500), registrar));
    expect(JSON.stringify(registrar.mock.calls)).not.toMatch(/token|bearer|authorization/i);
  });
});

describe('resolverHistorico: caminho feliz (comportamento que já existia)', () => {
  it('busca na brapi, grava candles, meta e a lista de conhecidos, conta a cota e devolve os candles', async () => {
    const { kv, dados, opcoes } = kvFalso();
    const r = await resolverHistorico(base(kv, respostaBrapi(200, comCandles(['2026-09-28', '2026-09-29']))));
    expect(r.status).toBe(200);
    const corpo = r.corpo as { ticker: string; candles: { data: string; fechamento: number }[] };
    expect(corpo.ticker).toBe('KNSC11');
    expect(corpo.candles.map((c) => c.data)).toEqual(['2026-09-28', '2026-09-29']);
    expect(JSON.parse(dados.get('historico:KNSC11:meta') as string)).toEqual({ desde: '2026-09-28', ate: '2026-09-29' });
    expect(JSON.parse(dados.get('tickers:conhecidos') as string)).toEqual(['KNSC11']);
    expect(dados.get('cota:diario:2026-09-29')).toBe('1');
    expect(dados.get('cota:mensal:2026-09')).toBe('1');
    expect(opcoes.get('cota:diario:2026-09-29')?.expirationTtl).toBe(48 * 60 * 60);
    expect(dados.has('historico:KNSC11:naoencontrado')).toBe(false);
  });

  it('histórico já atualizado hoje: serve do KV sem chamar a brapi', async () => {
    const { kv } = kvFalso({
      'historico:KNSC11:meta': { desde: HOJE, ate: HOJE },
      [`historico:KNSC11:${HOJE}`]: { data: HOJE, abertura: 1, maxima: 2, minima: 1, fechamento: 2, volume: 1 },
    });
    const buscar = respostaBrapi(500);
    const r = await resolverHistorico(base(kv, buscar));
    expect(r.status).toBe(200);
    expect(buscar).not.toHaveBeenCalled();
  });

  it('orçamento diário esgotado e sem histórico: 502 sem chamar a brapi', async () => {
    const { kv } = kvFalso({ 'cota:diario:2026-09-29': '999', 'cota:mensal:2026-09': '999' });
    const buscar = respostaBrapi(200, comCandles([HOJE]));
    const r = await resolverHistorico(base(kv, buscar));
    expect(r.status).toBe(502);
    expect(r.corpo).toEqual({ erro: 'BRAPI_INDISPONIVEL' });
    expect(buscar).not.toHaveBeenCalled();
  });

  it('brapi sem candles novos, mas já há histórico antigo: serve o que existe (200), não vira 404', async () => {
    const { kv } = kvFalso({
      'historico:KNSC11:meta': { desde: '2026-09-01', ate: '2026-09-01' },
      'historico:KNSC11:2026-09-01': { data: '2026-09-01', abertura: 1, maxima: 2, minima: 1, fechamento: 2, volume: 1 },
    });
    const r = await resolverHistorico(base(kv, respostaBrapi(200, { results: [] })));
    expect(r.status).toBe(200);
    expect((r.corpo as { candles: unknown[] }).candles).toHaveLength(1);
  });
});

describe('resolverHistorico: falhas da fonte com histórico já salvo, e dados estranhos', () => {
  const comHistoricoAntigo = () => kvFalso({
    'historico:KNSC11:meta': { desde: '2026-09-01', ate: '2026-09-01' },
    'historico:KNSC11:2026-09-01': { data: '2026-09-01', abertura: 1, maxima: 2, minima: 1, fechamento: 2, volume: 1 },
  });

  it.each([404, 500, 429])('brapi %i com histórico antigo salvo: serve o que existe (200) e não grava cache negativo', async (status) => {
    const { kv, dados } = comHistoricoAntigo();
    const r = await resolverHistorico(base(kv, respostaBrapi(status)));
    expect(r.status).toBe(200);
    expect((r.corpo as { candles: unknown[] }).candles).toHaveLength(1);
    expect(dados.has('historico:KNSC11:naoencontrado')).toBe(false);
  });

  it('corpo 200 que não é JSON válido: 502, sem lançar', async () => {
    const { kv } = kvFalso();
    const buscar: BuscaBrapi = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('json'); } });
    const r = await resolverHistorico(base(kv, buscar));
    expect(r.status).toBe(502);
  });

  it('candle com data inválida é ignorado; os válidos entram', async () => {
    const { kv, dados } = kvFalso();
    const corpo = { results: [{ historicalDataPrice: [
      { date: null, open: 1, high: 1, low: 1, close: 1, volume: 1 },
      { date: unix('2026-09-29'), open: 10, high: 11, low: 9, close: 10.5, volume: 1000 },
    ] }] };
    const r = await resolverHistorico(base(kv, respostaBrapi(200, corpo)));
    expect(r.status).toBe(200);
    expect((r.corpo as { candles: { data: string }[] }).candles.map((c) => c.data)).toEqual(['2026-09-29']);
    expect(JSON.parse(dados.get('historico:KNSC11:meta') as string)).toEqual({ desde: '2026-09-29', ate: '2026-09-29' });
  });

  it('só candles inválidos e sem histórico salvo: "não encontrado"', async () => {
    const { kv } = kvFalso();
    const r = await resolverHistorico(base(kv, respostaBrapi(200, { results: [{ historicalDataPrice: [{ date: 'x', open: 1, high: 1, low: 1, close: 1, volume: 1 }] }] })));
    expect(r.status).toBe(404);
  });
});

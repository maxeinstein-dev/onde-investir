import { describe, expect, it } from 'vitest';
import {
  urlCalendarioCopom, urlFocusAnuais, urlFocusIpcaMensal, urlFocusSelic, urlSgsUltimos,
} from '../../src/dados/bcb';
import type { Armazenamento } from '../../src/dados/cache';
import { carregarIndicadores, type Buscar } from '../../src/dados/indicadores';
import { ANUNCIOS_2026_2027 } from '../engine/copomFixture';
import copom from '../fixtures/bcb/copom.json';
import focusAnuais from '../fixtures/bcb/focus-anuais.json';
import focusIpcaMensal from '../fixtures/bcb/focus-ipca-mensal.json';
import focusSelic from '../fixtures/bcb/focus-selic.json';
import sgs226 from '../fixtures/bcb/sgs-226.json';
import sgs432 from '../fixtures/bcb/sgs-432.json';
import sgs433 from '../fixtures/bcb/sgs-433.json';
import sgs4389 from '../fixtures/bcb/sgs-4389.json';

const t = (s: string) => Date.parse(s);
const AGORA = t('2026-09-27T12:00:00-03:00'); // domingo
const ANTES_DA_VALIDADE = t('2026-09-28T09:00:00-03:00'); // SGS e Focus valem até segunda 10h
const DEPOIS_DA_VALIDADE = t('2026-10-06T12:00:00-03:00'); // Copom vale 7 dias

const RESPOSTAS = new Map<string, unknown>([
  [urlSgsUltimos(432, 1), sgs432],
  [urlSgsUltimos(4389, 1), sgs4389],
  [urlSgsUltimos(433, 12), sgs433],
  [urlSgsUltimos(226, 1), sgs226],
  [urlFocusSelic(), focusSelic],
  [urlFocusIpcaMensal(), focusIpcaMensal],
  [urlFocusAnuais(), focusAnuais],
  [urlCalendarioCopom('2026-01-01', '2028-12-31'), copom],
]);

const memoria = (): Armazenamento => {
  const dados = new Map<string, string>();
  return { getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => void dados.set(k, v) };
};

interface Troca { ok: boolean; status: number; json: unknown }

/** `fetch` falso: responde com as fixtures; `trocas` substitui a resposta de uma URL. */
function falso(trocas: Map<string, Troca> = new Map()) {
  const chamadas: string[] = [];
  const buscar: Buscar = async (url) => {
    chamadas.push(url);
    const troca = trocas.get(url);
    if (troca) return { ok: troca.ok, status: troca.status, json: async () => troca.json };
    if (!RESPOSTAS.has(url)) return { ok: false, status: 404, json: async () => null };
    return { ok: true, status: 200, json: async () => structuredClone(RESPOSTAS.get(url)) };
  };
  return { buscar, chamadas };
}
const foraDoAr: Buscar = () => Promise.reject(new TypeError('Failed to fetch'));

describe('carregarIndicadores', () => {
  it('1. primeira carga: tudo REDE, 8 chamadas, dados batem com as fixtures', async () => {
    const { buscar, chamadas } = falso();
    const r = await carregarIndicadores({ buscar, armazenamento: memoria(), agoraMs: AGORA });
    expect(r.status).toEqual({ sgs: 'REDE', focus: 'REDE', copom: 'REDE' });
    expect(chamadas).toHaveLength(8);
    expect(new Set(chamadas)).toEqual(new Set(RESPOSTAS.keys()));
    expect(r.obtidoEm).toEqual({ sgs: AGORA, focus: AGORA, copom: AGORA });

    expect(r.atuais?.dataReferencia).toBe('2026-09-24'); // da 4389, não da 432 (04/11/2026)
    expect(r.atuais?.selicMetaAA).toBeCloseTo(0.1375, 12);
    expect(r.atuais?.cdiAA).toBeCloseTo(0.1365, 12);
    expect(r.atuais?.trAM).toBeCloseTo(0.001646, 12);
    // ∏(1 + v/100) − 1 de set/2025 a ago/2026
    expect(r.atuais?.ipca12mAA).toBeCloseTo(0.042234527370682784, 12);

    expect(r.focus?.dataColeta).toBe('2026-09-18');
    expect(r.focusDefasado).toBe(false);
    expect(r.focus?.selicPorReuniao).toHaveLength(16);
    expect(r.focus?.ipcaMensal).toHaveLength(25);
    expect(r.focus?.selicAnual).toHaveLength(5);
    expect(r.focus?.ipcaAnual).toHaveLength(5);
    expect(r.focus?.selicPorReuniao.find((l) => l.reuniao === 'R7/2026')?.est.mediana).toBe(13.625);

    expect(r.reunioes?.map((x) => x.anuncio)).toEqual(ANUNCIOS_2026_2027);
    expect(r.reunioes?.[0]).toEqual({ id: 'R1/2026', anuncio: '2026-01-28', estimada: false });
  });

  it('2. segunda carga antes da validade: tudo CACHE e 0 chamadas', async () => {
    const armazenamento = memoria();
    const primeira = await carregarIndicadores({ buscar: falso().buscar, armazenamento, agoraMs: AGORA });
    const { buscar, chamadas } = falso();
    const r = await carregarIndicadores({ buscar, armazenamento, agoraMs: ANTES_DA_VALIDADE });
    expect(r.status).toEqual({ sgs: 'CACHE', focus: 'CACHE', copom: 'CACHE' });
    expect(chamadas).toHaveLength(0);
    expect(r.atuais).toEqual(primeira.atuais);
    expect(r.focus).toEqual(primeira.focus);
    expect(r.reunioes).toEqual(primeira.reunioes);
    expect(r.obtidoEm).toEqual({ sgs: AGORA, focus: AGORA, copom: AGORA });
  });

  it('3. depois da validade e rede fora: tudo CACHE_VENCIDO, com os mesmos dados', async () => {
    const armazenamento = memoria();
    const primeira = await carregarIndicadores({ buscar: falso().buscar, armazenamento, agoraMs: AGORA });
    const r = await carregarIndicadores({ buscar: foraDoAr, armazenamento, agoraMs: DEPOIS_DA_VALIDADE });
    expect(r.status).toEqual({ sgs: 'CACHE_VENCIDO', focus: 'CACHE_VENCIDO', copom: 'CACHE_VENCIDO' });
    expect(r.atuais).toEqual(primeira.atuais);
    expect(r.focus).toEqual(primeira.focus);
    expect(r.reunioes).toEqual(primeira.reunioes);
    expect(r.obtidoEm).toEqual({ sgs: AGORA, focus: AGORA, copom: AGORA });
  });

  it('4. sem cache e rede fora: tudo FALHOU, dados null, sem lançar', async () => {
    const r = await carregarIndicadores({ buscar: foraDoAr, armazenamento: memoria(), agoraMs: AGORA });
    expect(r).toEqual({
      atuais: null, focus: null, reunioes: null,
      status: { sgs: 'FALHOU', focus: 'FALHOU', copom: 'FALHOU' },
      obtidoEm: {},
      focusDefasado: false,
    });
  });

  it('5. Focus fora do esquema: focus FALHOU (ou CACHE_VENCIDO com cache); sgs e copom REDE', async () => {
    const invalido = new Map([[urlFocusSelic(), { ok: true, status: 200, json: { value: [{ Data: 1 }] } }]]);
    const semCache = await carregarIndicadores({ buscar: falso(invalido).buscar, armazenamento: memoria(), agoraMs: AGORA });
    expect(semCache.status).toEqual({ sgs: 'REDE', focus: 'FALHOU', copom: 'REDE' });
    expect(semCache.focus).toBeNull();
    expect(semCache.atuais).not.toBeNull();
    expect(semCache.reunioes).not.toBeNull();

    const armazenamento = memoria();
    const primeira = await carregarIndicadores({ buscar: falso().buscar, armazenamento, agoraMs: AGORA });
    const comCache = await carregarIndicadores({ buscar: falso(invalido).buscar, armazenamento, agoraMs: DEPOIS_DA_VALIDADE });
    expect(comCache.status).toEqual({ sgs: 'REDE', focus: 'CACHE_VENCIDO', copom: 'REDE' });
    expect(comCache.focus).toEqual(primeira.focus);
    expect(comCache.obtidoEm).toEqual({ sgs: DEPOIS_DA_VALIDADE, focus: AGORA, copom: DEPOIS_DA_VALIDADE });
  });

  it('6. ok: false (HTTP 500) conta como falha', async () => {
    const erro = new Map([[urlSgsUltimos(226, 1), { ok: false, status: 500, json: sgs226 }]]);
    const r = await carregarIndicadores({ buscar: falso(erro).buscar, armazenamento: memoria(), agoraMs: AGORA });
    expect(r.status).toEqual({ sgs: 'FALHOU', focus: 'REDE', copom: 'REDE' });
    expect(r.atuais).toBeNull();
  });

  it('7. timeout: buscar que nunca resolve e timeoutMs 20 → FALHOU, com o sinal abortado', async () => {
    const sinais: AbortSignal[] = [];
    const nunca: Buscar = (_url, init) => {
      if (init?.signal) sinais.push(init.signal);
      return new Promise(() => {});
    };
    const r = await carregarIndicadores({ buscar: nunca, armazenamento: memoria(), agoraMs: AGORA, timeoutMs: 20 });
    expect(r.status).toEqual({ sgs: 'FALHOU', focus: 'FALHOU', copom: 'FALHOU' });
    expect(sinais).toHaveLength(8);
    expect(sinais.every((s) => s.aborted)).toBe(true);
  });

  it('433 com menos de 12 meses não vira IPCA 12m: SGS falha', async () => {
    const curta = new Map([[urlSgsUltimos(433, 12), { ok: true, status: 200, json: sgs433.slice(1) }]]);
    const r = await carregarIndicadores({ buscar: falso(curta).buscar, armazenamento: memoria(), agoraMs: AGORA });
    expect(r.status.sgs).toBe('FALHOU');
  });

  it.each([
    ['mensal', urlFocusIpcaMensal(), { value: focusIpcaMensal.value.filter((l) => l.Data !== '2026-09-18') }],
    ['anual (só o IPCA)', urlFocusAnuais(), { value: focusAnuais.value.filter((l) => !(l.Indicador === 'IPCA' && l.Data === '2026-09-18')) }],
  ] as const)('coletas divergentes (%s de 17/09): dataColeta é a menor e focusDefasado true, também do cache', async (_nome, url, json) => {
    const troca = new Map([[url, { ok: true, status: 200, json }]]);
    const armazenamento = memoria();
    const r = await carregarIndicadores({ buscar: falso(troca).buscar, armazenamento, agoraMs: AGORA });
    expect(r.status.focus).toBe('REDE');
    expect(r.focus?.dataColeta).toBe('2026-09-17');
    expect(r.focusDefasado).toBe(true);
    const doCache = await carregarIndicadores({ buscar: foraDoAr, armazenamento, agoraMs: ANTES_DA_VALIDADE });
    expect(doCache.status.focus).toBe('CACHE');
    expect(doCache.focus).toEqual(r.focus);
    expect(doCache.focusDefasado).toBe(true);
  });
});

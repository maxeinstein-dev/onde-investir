import { describe, expect, it } from 'vitest';
import { RespostaInvalidaError, interpretarSgsAno, urlSgsAno } from '../../src/dados/bcb';
import type { Armazenamento } from '../../src/dados/cache';
import { LIMITE_ANOS_HISTORICO, SERIES_HISTORICO, carregarHistorico } from '../../src/dados/historico';
import type { Buscar } from '../../src/dados/indicadores';
import { cenarioComHistorico } from '../../src/engine/historico';
import type { Cenario } from '../../src/engine/indexadores';
import sgs11de2025 from '../fixtures/bcb/historico/sgs-11-2025.json';
import sgs11de2026 from '../fixtures/bcb/historico/sgs-11-2026.json';
import sgs12de2025 from '../fixtures/bcb/historico/sgs-12-2025.json';
import sgs12de2026 from '../fixtures/bcb/historico/sgs-12-2026.json';
import sgs226de2025 from '../fixtures/bcb/historico/sgs-226-2025.json';
import sgs226de2026 from '../fixtures/bcb/historico/sgs-226-2026.json';
import sgs432de2025 from '../fixtures/bcb/historico/sgs-432-2025.json';
import sgs432de2026 from '../fixtures/bcb/historico/sgs-432-2026.json';
import sgs433de2025 from '../fixtures/bcb/historico/sgs-433-2025.json';
import sgs433de2026 from '../fixtures/bcb/historico/sgs-433-2026.json';

const t = (s: string) => Date.parse(s);
const AGORA = t('2026-09-28T12:00:00-03:00'); // segunda, depois das 10h: o ano corrente vale até terça 10h
const MESMO_DIA = t('2026-09-28T18:00:00-03:00');
const DIA_SEGUINTE = t('2026-09-29T11:00:00-03:00');
const DESDE = '2025-03-10';

const FIXTURES = new Map<string, unknown>([
  [urlSgsAno(12, 2025), sgs12de2025], [urlSgsAno(12, 2026), sgs12de2026],
  [urlSgsAno(11, 2025), sgs11de2025], [urlSgsAno(11, 2026), sgs11de2026],
  [urlSgsAno(433, 2025), sgs433de2025], [urlSgsAno(433, 2026), sgs433de2026],
  [urlSgsAno(226, 2025), sgs226de2025], [urlSgsAno(226, 2026), sgs226de2026],
  [urlSgsAno(432, 2025), sgs432de2025], [urlSgsAno(432, 2026), sgs432de2026],
]);
const urlsDoAno = (ano: number) => SERIES_HISTORICO.map((s) => urlSgsAno(s, ano));

const memoria = (): Armazenamento & { dados: Map<string, string> } => {
  const dados = new Map<string, string>();
  return { dados, getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => void dados.set(k, v) };
};

interface Troca { ok: boolean; status: number; json: unknown }

/** `fetch` falso: as fixtures; ano sem fixture responde lista vazia; `trocas` substitui a resposta de uma URL. */
function falso(trocas: Map<string, Troca> = new Map()) {
  const chamadas: string[] = [];
  const buscar: Buscar = async (url) => {
    chamadas.push(url);
    const troca = trocas.get(url);
    if (troca) return { ok: troca.ok, status: troca.status, json: async () => troca.json };
    return { ok: true, status: 200, json: async () => structuredClone(FIXTURES.get(url) ?? []) };
  };
  return { buscar, chamadas };
}
const foraDoAr: Buscar = () => Promise.reject(new TypeError('Failed to fetch'));

const constante = (aa: number): Cenario => ({ cdiAA: () => aa, selicOverAA: () => aa, selicMetaAA: () => aa, ipcaAA: () => aa, trAM: () => 0 });

describe('urlSgsAno / interpretarSgsAno', () => {
  it('URL do ano civil', () => {
    expect(urlSgsAno(12, 2025)).toBe('https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=01/01/2025&dataFinal=31/12/2025');
  });
  it('12 de 2025: 252 dias úteis, com a data convertida e o valor ainda em %', () => {
    const pontos = interpretarSgsAno(sgs12de2025, 2025);
    expect(pontos).toHaveLength(252);
    expect(pontos[0]).toEqual({ data: '2025-01-02', valor: 0.045513 });
    expect(pontos.at(-1)).toEqual({ data: '2025-12-31', valor: 0.055131 });
  });
  it('226 guarda o dataFim e aceita a mesma data com dataFim diferentes (aniversários 29, 30 e 31)', () => {
    const pontos = interpretarSgsAno(sgs226de2025, 2025);
    expect(pontos).toHaveLength(372);
    expect(pontos[0]).toEqual({ data: '2025-01-01', dataFim: '2025-02-01', valor: 0.169 });
    expect(pontos.filter((p) => p.data === '2025-03-01').map((p) => p.dataFim)).toEqual(['2025-03-29', '2025-03-30', '2025-03-31', '2025-04-01']);
    const repetido = [{ data: '01/03/2025', dataFim: '01/04/2025', valor: '1' }, { data: '01/03/2025', dataFim: '01/04/2025', valor: '1' }];
    expect(() => interpretarSgsAno(repetido, 2025)).toThrow(RespostaInvalidaError);
  });
  it('lista vazia é válida (ano sem dado ainda)', () => {
    expect(interpretarSgsAno([], 2026)).toEqual([]);
  });
  it('ponto fora do ano, data repetida, valor não numérico ou dataFim antes da data: RespostaInvalidaError', () => {
    expect(() => interpretarSgsAno(sgs12de2025, 2026)).toThrow(RespostaInvalidaError);
    expect(() => interpretarSgsAno([{ data: '02/01/2025', valor: '1' }, { data: '02/01/2025', valor: '1' }], 2025)).toThrow(RespostaInvalidaError);
    expect(() => interpretarSgsAno([{ data: '02/01/2025', valor: 'x' }], 2025)).toThrow(RespostaInvalidaError);
    expect(() => interpretarSgsAno([{ data: '02/01/2025', dataFim: '01/01/2025', valor: '1' }], 2025)).toThrow(RespostaInvalidaError);
    expect(() => interpretarSgsAno({ erro: 'x' }, 2025)).toThrow(RespostaInvalidaError);
  });
  it('mais de 400 pontos: RespostaInvalidaError', () => {
    const muitos = Array.from({ length: 401 }, (_, i) => ({ data: '02/01/2025', dataFim: `${String((i % 28) + 1).padStart(2, '0')}/02/2025`, valor: '1' }));
    expect(() => interpretarSgsAno(muitos, 2025)).toThrow(RespostaInvalidaError);
  });
});

describe('carregarHistorico', () => {
  it('séries 12, 11, 433, 226 e 432, até 10 anos para trás', () => {
    expect(SERIES_HISTORICO).toEqual([12, 11, 433, 226, 432]);
    expect(LIMITE_ANOS_HISTORICO).toBe(10);
  });

  it('1. primeira carga: uma chamada por série e ano (10), tudo em fração', async () => {
    const { buscar, chamadas } = falso();
    const r = await carregarHistorico({ buscar, armazenamento: memoria(), agoraMs: AGORA, desde: DESDE });
    expect(chamadas).toHaveLength(10);
    expect(new Set(chamadas)).toEqual(new Set(FIXTURES.keys()));
    expect(r.status).toBe('REDE');
    expect(r.faltando).toEqual([]);
    expect(r.limitado).toBe(false);
    expect(r.inicio).toBe('2025-01-01');

    const s = r.series;
    expect(s).not.toBeNull();
    if (s === null) return;
    expect(s.ultimaData).toBe('2026-09-25');
    expect(s.cdiDiario.size).toBe(252 + 184);
    expect(s.cdiDiario.get('2025-01-02')).toBeCloseTo(0.00045513, 15);
    expect(s.selicOverDiaria.get('2026-09-25')).toBeCloseTo(0.00050788, 15);
    expect(s.ipcaMensal.size).toBe(12 + 8);
    expect(s.ipcaMensal.get('2025-01')).toBeCloseTo(0.0016, 15);
    expect(s.ipcaMensal.get('2026-08')).toBeCloseTo(-0.0032, 15);
    // TR: a chave é o início do período (`data`); o `dataFim` fica de fora.
    expect(s.trPorInicio.get('2025-01-01')).toBeCloseTo(0.00169, 15);
    expect(s.trPorInicio.get('2025-01-31')).toBeCloseTo(0.00163, 15);
    // O dia 1º repetido: fica o período até o dia 1º do mês seguinte (o mês cheio), não os que vão até 29, 30 e 31.
    expect(s.trPorInicio.size).toBe(365 + 268);
    expect(s.trPorInicio.get('2025-03-01')).toBeCloseTo(0.001092, 15);
    expect(s.trPorInicio.get('2025-07-01')).toBeCloseTo(0.001758, 15);
    expect(s.trPorInicio.get('2026-09-25')).toBeCloseTo(0.001332, 15);
    expect(s.selicMetaAA.get('2025-01-01')).toBeCloseTo(0.1225, 15);
    expect(s.selicMetaAA.get('2026-11-04')).toBeCloseTo(0.1375, 15);

    // O cenário aceita as séries e devolve o fator do dia: CDB 100% do CDI em 02/01/2025.
    const cen = cenarioComHistorico(s, constante(0.1));
    expect(Math.pow(1 + cen.cdiAA('2025-01-02'), 1 / 252) - 1).toBeCloseTo(0.00045513, 15);
  });

  it('2. segunda carga no mesmo dia: nenhuma chamada, séries iguais', async () => {
    const arm = memoria();
    const primeira = await carregarHistorico({ buscar: falso().buscar, armazenamento: arm, agoraMs: AGORA, desde: DESDE });
    const { buscar, chamadas } = falso();
    const r = await carregarHistorico({ buscar, armazenamento: arm, agoraMs: MESMO_DIA, desde: DESDE });
    expect(chamadas).toEqual([]);
    expect(r.status).toBe('CACHE');
    expect(r.series).toEqual(primeira.series);
  });

  it('3. ano corrente vencido: refaz só o ano corrente (5 chamadas), nada dos anos passados', async () => {
    const arm = memoria();
    await carregarHistorico({ buscar: falso().buscar, armazenamento: arm, agoraMs: AGORA, desde: DESDE });
    const { buscar, chamadas } = falso();
    const r = await carregarHistorico({ buscar, armazenamento: arm, agoraMs: DIA_SEGUINTE, desde: DESDE });
    expect(new Set(chamadas)).toEqual(new Set(urlsDoAno(2026)));
    expect(chamadas).toHaveLength(5);
    expect(r.status).toBe('REDE');
  });

  it('4. ano passado é permanente: anos depois, só o que falta', async () => {
    const arm = memoria();
    await carregarHistorico({ buscar: falso().buscar, armazenamento: arm, agoraMs: AGORA, desde: DESDE });
    // Em março de 2027: 2025 segue no cache; 2026 (gravado como ano corrente) vence e é refeito; 2027 é novo.
    const marco = t('2027-03-01T12:00:00-03:00');
    const segunda = falso();
    await carregarHistorico({ buscar: segunda.buscar, armazenamento: arm, agoraMs: marco, desde: DESDE });
    expect(new Set(segunda.chamadas)).toEqual(new Set([...urlsDoAno(2026), ...urlsDoAno(2027)]));
    expect(segunda.chamadas).toHaveLength(10);
    // Um ano depois: 2025 e 2026 permanentes; só 2028.
    const terceira = falso();
    await carregarHistorico({ buscar: terceira.buscar, armazenamento: arm, agoraMs: t('2028-03-01T12:00:00-03:00'), desde: DESDE });
    expect(new Set(terceira.chamadas)).toEqual(new Set([...urlsDoAno(2027), ...urlsDoAno(2028)]));
  });

  it('5. em janeiro o ano anterior ainda não é permanente (o IPCA de dezembro sai em janeiro)', async () => {
    const arm = memoria();
    await carregarHistorico({ buscar: falso().buscar, armazenamento: arm, agoraMs: t('2027-01-15T12:00:00-03:00'), desde: '2026-05-01' });
    const fevereiro = falso();
    await carregarHistorico({ buscar: fevereiro.buscar, armazenamento: arm, agoraMs: t('2027-02-02T12:00:00-03:00'), desde: '2026-05-01' });
    expect(new Set(fevereiro.chamadas)).toEqual(new Set([...urlsDoAno(2026), ...urlsDoAno(2027)]));
    const depois = falso();
    await carregarHistorico({ buscar: depois.buscar, armazenamento: arm, agoraMs: t('2027-02-10T12:00:00-03:00'), desde: '2026-05-01' });
    expect(new Set(depois.chamadas)).toEqual(new Set(urlsDoAno(2027)));
  });

  it('6. rede fora com cache vencido: usa o cache', async () => {
    const arm = memoria();
    const primeira = await carregarHistorico({ buscar: falso().buscar, armazenamento: arm, agoraMs: AGORA, desde: DESDE });
    const r = await carregarHistorico({ buscar: foraDoAr, armazenamento: arm, agoraMs: DIA_SEGUINTE, desde: DESDE });
    expect(r.status).toBe('CACHE_VENCIDO');
    expect(r.faltando).toEqual([]);
    expect(r.series).toEqual(primeira.series);
  });

  it('7. rede fora sem cache: séries nulas e tudo faltando', async () => {
    const r = await carregarHistorico({ buscar: foraDoAr, armazenamento: memoria(), agoraMs: AGORA, desde: DESDE });
    expect(r.series).toBeNull();
    expect(r.status).toBe('FALHOU');
    expect(r.faltando).toHaveLength(10);
    expect(r.faltando).toContainEqual({ serie: 433, ano: 2025 });
  });

  it('8. uma série e ano falha: as outras seguem, e a próxima carga busca só a que faltou', async () => {
    const arm = memoria();
    const erro = new Map([[urlSgsAno(433, 2026), { ok: false, status: 500, json: null }]]);
    const primeira = falso(erro);
    const r = await carregarHistorico({ buscar: primeira.buscar, armazenamento: arm, agoraMs: AGORA, desde: DESDE });
    expect(primeira.chamadas).toHaveLength(10);
    expect(r.status).toBe('FALHOU');
    expect(r.faltando).toEqual([{ serie: 433, ano: 2026 }]);
    expect(r.series?.ipcaMensal.has('2026-08')).toBe(false);
    expect(r.series?.ipcaMensal.has('2025-12')).toBe(true);
    expect(r.series?.ultimaData).toBe('2026-09-25');

    const segunda = falso();
    const r2 = await carregarHistorico({ buscar: segunda.buscar, armazenamento: arm, agoraMs: MESMO_DIA, desde: DESDE });
    expect(segunda.chamadas).toEqual([urlSgsAno(433, 2026)]);
    expect(r2.status).toBe('REDE');
    expect(r2.faltando).toEqual([]);
  });

  it('9. resposta fora do esquema conta como falha daquela série e ano', async () => {
    const erro = new Map([[urlSgsAno(12, 2026), { ok: true, status: 200, json: [{ data: '02/01/2026', valor: 'NaN' }] }]]);
    const r = await carregarHistorico({ buscar: falso(erro).buscar, armazenamento: memoria(), agoraMs: AGORA, desde: DESDE });
    expect(r.faltando).toEqual([{ serie: 12, ano: 2026 }]);
    expect(r.series?.ultimaData).toBe('2025-12-31');
  });

  it('10. 11 anos atrás: limitado a 10, com aviso, sem repetir chamada', async () => {
    const { buscar, chamadas } = falso();
    const r = await carregarHistorico({ buscar, armazenamento: memoria(), agoraMs: AGORA, desde: '2015-06-01' });
    expect(r.limitado).toBe(true);
    expect(r.inicio).toBe('2016-01-01');
    expect(chamadas).toHaveLength(5 * 11); // 2016 a 2026
    expect(new Set(chamadas).size).toBe(chamadas.length);
    expect(chamadas.some((u) => u.includes('/2015'))).toBe(false);
    expect(chamadas).toContain(urlSgsAno(12, 2016));
  });

  it('11. exatamente 10 anos atrás não é limitado', async () => {
    const r = await carregarHistorico({ buscar: falso().buscar, armazenamento: memoria(), agoraMs: AGORA, desde: '2016-01-04' });
    expect(r.limitado).toBe(false);
    expect(r.inicio).toBe('2016-01-01');
  });

  it('12. timeout: a série falha sem travar', async () => {
    const nunca: Buscar = () => new Promise(() => {});
    const r = await carregarHistorico({ buscar: nunca, armazenamento: memoria(), agoraMs: AGORA, desde: DESDE, timeoutMs: 5 });
    expect(r.status).toBe('FALHOU');
    expect(r.series).toBeNull();
  });

  it('13. cache corrompido é rebuscado', async () => {
    const arm = memoria();
    await carregarHistorico({ buscar: falso().buscar, armazenamento: arm, agoraMs: AGORA, desde: DESDE });
    arm.setItem('rende:cache:v1:hist:12:2025', '{quebrado');
    const { buscar, chamadas } = falso();
    await carregarHistorico({ buscar, armazenamento: arm, agoraMs: MESMO_DIA, desde: DESDE });
    expect(chamadas).toEqual([urlSgsAno(12, 2025)]);
  });

  it('14. desde inválida ou depois de hoje: sem chamada ou só o ano corrente, e nunca lança', async () => {
    const invalida = falso();
    const r = await carregarHistorico({ buscar: invalida.buscar, armazenamento: memoria(), agoraMs: AGORA, desde: '2025-02-30' });
    expect(invalida.chamadas).toEqual([]);
    expect(r.series).toBeNull();
    expect(r.status).toBe('FALHOU');
    const futura = falso();
    await carregarHistorico({ buscar: futura.buscar, armazenamento: memoria(), agoraMs: AGORA, desde: '2027-01-01' });
    expect(new Set(futura.chamadas)).toEqual(new Set(urlsDoAno(2026)));
  });

  it('15. storage que lança: busca tudo e devolve as séries', async () => {
    const quebrado: Armazenamento = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('Quota'); } };
    const r = await carregarHistorico({ buscar: falso().buscar, armazenamento: quebrado, agoraMs: AGORA, desde: DESDE });
    expect(r.status).toBe('REDE');
    expect(r.series?.ultimaData).toBe('2026-09-25');
  });
});

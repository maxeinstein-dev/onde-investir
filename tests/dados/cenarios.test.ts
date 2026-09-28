import { beforeAll, describe, expect, it } from 'vitest';
import {
  urlCalendarioCopom, urlFocusAnuais, urlFocusIpcaMensal, urlFocusSelic, urlSgsUltimos,
} from '../../src/dados/bcb';
import { CENARIO_INICIAL } from '../../src/dados/cenarioInicial';
import { cenarioAtivo, type ValoresManuais } from '../../src/dados/cenarios';
import { carregarIndicadores, type Buscar, type IndicadoresCarregados } from '../../src/dados/indicadores';
import { PREMISSAS_PADRAO } from '../../src/engine/projecao';
import copom from '../fixtures/bcb/copom.json';
import focusAnuais from '../fixtures/bcb/focus-anuais.json';
import focusIpcaMensal from '../fixtures/bcb/focus-ipca-mensal.json';
import focusSelic from '../fixtures/bcb/focus-selic.json';
import sgs226 from '../fixtures/bcb/sgs-226.json';
import sgs432 from '../fixtures/bcb/sgs-432.json';
import sgs433 from '../fixtures/bcb/sgs-433.json';
import sgs4389 from '../fixtures/bcb/sgs-4389.json';

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
const buscar: Buscar = async (url) =>
  (RESPOSTAS.has(url) ? { ok: true, status: 200, json: async () => structuredClone(RESPOSTAS.get(url)) } : { ok: false, status: 404, json: async () => null });

const MANUAL: ValoresManuais = { cdi: 14.9, selicMeta: 15, ipca: 4.5, tr: 0.17 };

let ind: IndicadoresCarregados;
beforeAll(async () => {
  const dados = new Map<string, string>();
  ind = await carregarIndicadores({
    buscar, armazenamento: { getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => void dados.set(k, v) },
    agoraMs: Date.parse('2026-09-27T12:00:00-03:00'),
  });
});

describe('cenarioAtivo', () => {
  it('MANUAL: constante com os valores manuais ÷ 100', () => {
    const r = cenarioAtivo('MANUAL', ind, PREMISSAS_PADRAO, MANUAL);
    expect(r.projetado).toBeNull();
    expect(r.motivoManual).toBeUndefined();
    for (const d of ['2026-09-24', '2030-01-01']) {
      expect(r.cenario.cdiAA(d)).toBeCloseTo(0.149, 12);
      expect(r.cenario.selicMetaAA(d)).toBeCloseTo(0.15, 12);
      expect(r.cenario.ipcaAA(d)).toBeCloseTo(0.045, 12);
      expect(r.cenario.trAM(d)).toBeCloseTo(0.0017, 12);
    }
  });

  it('BASE com as fixtures: Selic meta na data de referência = 432 ÷ 100', () => {
    const r = cenarioAtivo('BASE', ind, PREMISSAS_PADRAO, MANUAL);
    expect(r.motivoManual).toBeUndefined();
    expect(r.projetado?.tipo).toBe('BASE');
    expect(r.cenario.selicMetaAA('2026-09-24')).toBeCloseTo(0.1375, 12);
    expect(r.cenario.cdiAA('2026-09-24')).toBeCloseTo(0.1375 - PREMISSAS_PADRAO.spreadCDI, 12);
    expect(r.cenario.trAM('2027-06-01')).toBeCloseTo(0.001646, 12); // TR constante no último valor da 226
    // R7/2026 anunciada em 04/11/2026 vale a partir de 05/11: mediana do Focus 13,625%
    expect(r.cenario.selicMetaAA('2026-11-04')).toBeCloseTo(0.1375, 12);
    expect(r.cenario.selicMetaAA('2026-11-05')).toBeCloseTo(0.13625, 12);
  });

  it('SOBEM fica acima de CAEM depois da primeira reunião', () => {
    const sobem = cenarioAtivo('SOBEM', ind, PREMISSAS_PADRAO, MANUAL).cenario.selicMetaAA('2027-06-01');
    const caem = cenarioAtivo('CAEM', ind, PREMISSAS_PADRAO, MANUAL).cenario.selicMetaAA('2027-06-01');
    expect(sobem).toBeGreaterThan(caem);
  });

  it.each([
    ['atuais', 'Sem dados do SGS: usando o cenário manual.'],
    ['focus', 'Sem dados do Focus: usando o cenário manual.'],
    ['reunioes', 'Sem o calendário do Copom: usando o cenário manual.'],
  ] as const)('sem %s → manual com motivo', (campo, motivo) => {
    const r = cenarioAtivo('BASE', { ...ind, [campo]: null }, PREMISSAS_PADRAO, MANUAL);
    expect(r.projetado).toBeNull();
    expect(r.motivoManual).toBe(motivo);
    expect(r.cenario.selicMetaAA('2026-09-24')).toBeCloseTo(0.15, 12);
  });

  it('premissas inválidas → manual com motivo, sem lançar', () => {
    const invalidas = { ...PREMISSAS_PADRAO, anosConvergencia: 2.5 };
    let r: ReturnType<typeof cenarioAtivo> | undefined;
    expect(() => { r = cenarioAtivo('BASE', ind, invalidas, MANUAL); }).not.toThrow();
    expect(r?.projetado).toBeNull();
    expect(r?.motivoManual).toBe('Premissas do cenário inválidas: usando o cenário manual.');
    expect(r?.cenario.cdiAA('2026-09-24')).toBeCloseTo(0.149, 12);
  });

  it('BASE sem Focus e manual com CDI NaN → valores de referência, com os dois motivos, sem lançar', () => {
    let r: ReturnType<typeof cenarioAtivo> | undefined;
    expect(() => { r = cenarioAtivo('BASE', { ...ind, focus: null }, PREMISSAS_PADRAO, { ...MANUAL, cdi: Number.NaN }); }).not.toThrow();
    expect(r?.projetado).toBeNull();
    expect(r?.motivoManual).toBe(
      `Sem dados do Focus: usando o cenário manual. Valores manuais inválidos: usando os valores de referência de ${CENARIO_INICIAL.dataReferencia}.`,
    );
    expect(r?.cenario.cdiAA('2026-09-24')).toBeCloseTo(CENARIO_INICIAL.valores.cdi / 100, 12);
    expect(r?.cenario.selicMetaAA('2026-09-24')).toBeCloseTo(CENARIO_INICIAL.valores.selicMeta / 100, 12);
  });

  it('MANUAL com −150 → valores de referência, com motivo, sem lançar', () => {
    let r: ReturnType<typeof cenarioAtivo> | undefined;
    expect(() => { r = cenarioAtivo('MANUAL', ind, PREMISSAS_PADRAO, { ...MANUAL, ipca: -150 }); }).not.toThrow();
    expect(r?.projetado).toBeNull();
    expect(r?.motivoManual).toBe(`Valores manuais inválidos: usando os valores de referência de ${CENARIO_INICIAL.dataReferencia}.`);
    expect(r?.cenario.ipcaAA('2026-09-24')).toBeCloseTo(CENARIO_INICIAL.valores.ipca / 100, 12);
    expect(r?.cenario.trAM('2026-09-24')).toBeCloseTo(CENARIO_INICIAL.valores.tr / 100, 12);
  });
});

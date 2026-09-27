import { describe, expect, it } from 'vitest';
import { montarCenario, PREMISSAS_PADRAO } from '../../src/engine/projecao';
import { fatorIPCA } from '../../src/engine/indexadores';
import { diasCorridos } from '../../src/engine/datas';
import { ATUAIS, FOCUS, OFICIAIS, est } from './focusSintetico';

const base = () => montarCenario('BASE', FOCUS, ATUAIS, OFICIAIS, PREMISSAS_PADRAO);
const SELIC_LP = 1.03 * 1.05 - 1;

describe('cenário projetado — Selic', () => {
  it('degraus no dia útil seguinte ao anúncio', () => {
    const c = base();
    expect(c.selicMetaAA('2026-11-04')).toBe(0.1375);
    expect(c.selicMetaAA('2026-11-05')).toBeCloseTo(0.1325, 12);
    expect(c.selicMetaAA('2026-12-10')).toBeCloseTo(0.13, 12);
  });
  it('CDI = Selic − spread; Selic over = CDI', () => {
    const c = base();
    expect(c.cdiAA('2026-11-05')).toBeCloseTo(0.1315, 12);
    expect(c.selicOverAA('2026-11-05')).toBe(c.cdiAA('2026-11-05'));
  });
  it('interpolação linear mês a mês até o fim do ano do Focus anual', () => {
    // âncoras: fim de 2026 (13%) e fim de 2027 (12%), ambas do Focus anual
    const esperado = 0.13 + (0.12 - 0.13) * (diasCorridos('2026-12-31', '2027-07-01') / diasCorridos('2026-12-31', '2027-12-31'));
    expect(base().selicMetaAA('2027-07-01')).toBeCloseTo(esperado, 12);
    expect(base().selicMetaAA('2027-07-15')).toBeCloseTo(esperado, 12); // degrau mensal
  });
  it('convergência linear em 5 anos até a premissa, depois constante', () => {
    const c = base();
    expect(c.selicMetaAA('2033-01-01')).toBeCloseTo(SELIC_LP, 12);
    expect(c.selicMetaAA('2040-06-01')).toBeCloseTo(SELIC_LP, 12);
    const meses = ['2028-01-01', '2029-01-01', '2030-01-01', '2031-01-01', '2032-01-01', '2032-12-01'].map((d) => c.selicMetaAA(d));
    for (let i = 1; i < meses.length; i++) expect(meses[i]).toBeLessThan(meses[i - 1] as number);
    expect(c.inicioPremissa).toBe('2028-01-01');
    expect(c.ultimoAnoFocus).toBe(2027);
  });
  it('sem convergência (0 anos): salta para a premissa em 1º de janeiro', () => {
    const c = montarCenario('BASE', FOCUS, ATUAIS, OFICIAIS, { ...PREMISSAS_PADRAO, anosConvergencia: 0 });
    expect(c.selicMetaAA('2028-01-01')).toBeCloseTo(SELIC_LP, 12);
  });
  it('juros sobem/caem: mediana ± k·DP, limitado ao mínimo/máximo', () => {
    const sobem = montarCenario('SOBEM', FOCUS, ATUAIS, OFICIAIS, PREMISSAS_PADRAO);
    const caem = montarCenario('CAEM', FOCUS, ATUAIS, OFICIAIS, PREMISSAS_PADRAO);
    expect(sobem.selicMetaAA('2026-11-05')).toBeCloseTo(0.135, 12); // 13,25 + 0,25 = 13,5 (= máximo)
    expect(sobem.selicMetaAA('2026-12-10')).toBeCloseTo(0.135, 12); // 13 + 0,5
    expect(caem.selicMetaAA('2026-11-05')).toBeCloseTo(0.13, 12);
    expect(caem.selicMetaAA('2026-12-10')).toBeCloseTo(0.125, 12);
    const k2 = montarCenario('SOBEM', FOCUS, ATUAIS, OFICIAIS, { ...PREMISSAS_PADRAO, k: 2 });
    expect(k2.selicMetaAA('2026-11-05')).toBeCloseTo(0.135, 12); // 13,75 limitado a 13,5
  });
  it('reunião sem data oficial entra como estimada', () => {
    const focus = { ...FOCUS, selicPorReuniao: [...FOCUS.selicPorReuniao, { reuniao: 'R1/2028', est: est(11) }] };
    const c = montarCenario('BASE', focus, ATUAIS, OFICIAIS, PREMISSAS_PADRAO);
    expect(c.reunioesEstimadas).toEqual(['R1/2028']);
    expect(c.selicMetaAA('2028-01-27')).toBeCloseTo(0.11, 12); // anúncio estimado 26/01/2028
  });
  it('reuniões já decididas (antes da data de referência) são ignoradas', () => {
    const focus = { ...FOCUS, selicPorReuniao: [{ reuniao: 'R6/2026', est: est(20) }, ...FOCUS.selicPorReuniao] };
    expect(montarCenario('BASE', focus, ATUAIS, OFICIAIS, PREMISSAS_PADRAO).selicMetaAA('2026-09-24')).toBe(0.1375);
  });
});

describe('cenário projetado — IPCA', () => {
  const mes = (c: ReturnType<typeof base>, inicio: string, fim: string) => fatorIPCA(c, inicio, fim);
  it('mês com Focus mensal rende exatamente a mediana mensal', () => {
    expect(mes(base(), '2026-10-01', '2026-11-01')).toBeCloseTo(1.004, 12);
  });
  it('mês sem Focus mensal: (1 + anual)^(1/12)', () => {
    expect(mes(base(), '2026-11-01', '2026-12-01')).toBeCloseTo(Math.pow(1.049, 1 / 12), 12);
    expect(mes(base(), '2027-03-01', '2027-04-01')).toBeCloseTo(Math.pow(1.043, 1 / 12), 12);
  });
  it('juros sobem também sobe a inflação', () => {
    const sobem = montarCenario('SOBEM', FOCUS, ATUAIS, OFICIAIS, PREMISSAS_PADRAO);
    expect(mes(sobem, '2026-10-01', '2026-11-01')).toBeCloseTo(1.005, 12);
    expect(mes(sobem, '2027-03-01', '2027-04-01')).toBeCloseTo(Math.pow(1.047, 1 / 12), 12);
  });
  it('longo prazo: premissa de IPCA depois da convergência', () => {
    expect(mes(base(), '2033-01-01', '2033-02-01')).toBeCloseTo(Math.pow(1.03, 1 / 12), 12);
  });
  it('TR constante no último valor do SGS', () => {
    expect(base().trAM('2030-01-01')).toBe(0.001646);
  });
});

describe('validação', () => {
  it('Focus sem projeções anuais → erro', () => {
    expect(() => montarCenario('BASE', { ...FOCUS, selicAnual: [] }, ATUAIS, OFICIAIS, PREMISSAS_PADRAO)).toThrow();
  });
  it('premissas inválidas → erro', () => {
    expect(() => montarCenario('BASE', FOCUS, ATUAIS, OFICIAIS, { ...PREMISSAS_PADRAO, anosConvergencia: 1.5 })).toThrow();
    expect(() => montarCenario('BASE', FOCUS, ATUAIS, OFICIAIS, { ...PREMISSAS_PADRAO, k: -1 })).toThrow();
  });
});

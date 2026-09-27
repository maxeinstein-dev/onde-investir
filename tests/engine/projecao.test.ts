import { describe, expect, it } from 'vitest';
import { montarCenario, PREMISSAS_PADRAO } from '../../src/engine/projecao';
import { fatorIPCA } from '../../src/engine/indexadores';
import { diasCorridos } from '../../src/engine/datas';
import { ATUAIS, FOCUS, OFICIAIS, est } from './focusSintetico';
import { OfertaInvalidaError } from '../../src/engine/erros';
import { cenarioReal, FOCUS_REAL } from './cenarioReal';

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
    // âncoras: R8/2026 (13%, vale de 10/12/2026) e fim de 2027 (12%, Focus anual). O anual de 2026 fica de fora:
    // a R8 é a última reunião de 2026.
    const esperado = 0.13 + (0.12 - 0.13) * (diasCorridos('2026-12-10', '2027-07-01') / diasCorridos('2026-12-10', '2027-12-31'));
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
  it('sem reunião depois da última do Focus no ano, a âncora anual desse ano não cria degrau em 1º/jan', () => {
    const focus = {
      ...FOCUS,
      selicPorReuniao: [{ reuniao: 'R7/2026', est: est(13.25) }, { reuniao: 'R8/2026', est: est(13.5) }],
      selicAnual: [{ ano: 2026, est: est(13.25) }, { ano: 2027, est: est(12) }],
    };
    const c = montarCenario('BASE', focus, ATUAIS, OFICIAIS, PREMISSAS_PADRAO);
    expect(c.selicMetaAA('2026-12-31')).toBeCloseTo(0.135, 12);
    // R8/2026 vale de 10/12/2026; interpola direto até o anual de 2027 (12%) em 31/12/2027
    const esperado = 0.135 + (0.12 - 0.135) * (diasCorridos('2026-12-10', '2027-01-01') / diasCorridos('2026-12-10', '2027-12-31'));
    expect(c.selicMetaAA('2027-01-01')).toBeCloseTo(esperado, 12);
    // com uma reunião oficial de 2026 depois da última do Focus, a âncora anual de 2026 continua valendo
    const soAteR7 = { ...focus, selicPorReuniao: focus.selicPorReuniao.slice(0, 1) };
    expect(montarCenario('BASE', soAteR7, ATUAIS, OFICIAIS, PREMISSAS_PADRAO).selicMetaAA('2027-01-01')).toBeCloseTo(
      0.1325 + (0.12 - 0.1325) * (1 / 365), 12,
    );
  });
  it('reunião anunciada na própria data de referência já está na 432: fica de fora', () => {
    const focus = { ...FOCUS, selicPorReuniao: [{ reuniao: 'R6/2026', est: est(20) }, ...FOCUS.selicPorReuniao] };
    const c = montarCenario('BASE', focus, { ...ATUAIS, dataReferencia: '2026-09-16' }, OFICIAIS, PREMISSAS_PADRAO);
    expect(c.selicMetaAA('2026-09-17')).toBe(0.1375);
    expect(c.selicMetaAA('2026-11-05')).toBeCloseTo(0.1325, 12);
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
    // mês com Focus mensal: a mediana mensal recebe 1/12 da abertura ANUAL do ano (2026 tem DP 0 aqui)
    expect(mes(sobem, '2026-10-01', '2026-11-01')).toBeCloseTo(1.004, 12);
    const comDP = { ...FOCUS, ipcaAnual: [{ ano: 2026, est: est(4.9, 0.3, 4, 6) }, ...FOCUS.ipcaAnual.slice(1)] };
    const sobemComDP = montarCenario('SOBEM', comDP, ATUAIS, OFICIAIS, PREMISSAS_PADRAO);
    expect(mes(sobemComDP, '2026-10-01', '2026-11-01')).toBeCloseTo(1.004 * Math.pow(1.052 / 1.049, 1 / 12), 12);
    expect(mes(sobem, '2027-03-01', '2027-04-01')).toBeCloseTo(Math.pow(1.047, 1 / 12), 12);
  });
  it('longo prazo: premissa de IPCA depois da convergência', () => {
    expect(mes(base(), '2033-01-01', '2033-02-01')).toBeCloseTo(Math.pow(1.03, 1 / 12), 12);
  });
  it('TR constante no último valor do SGS', () => {
    expect(base().trAM('2030-01-01')).toBe(0.001646);
  });
});

describe('cenário projetado — IPCA com as fixtures reais (Focus de 18/09/2026)', () => {
  // Focus anual IPCA: 2027 = 4,3 ± 0,4196 (mín 3,17, máx 6); 2029 = 3,5 ± 0,47 (mín 3, máx 6).
  const anoCivil = (c: ReturnType<typeof base>, ano: number) => fatorIPCA(c, `${ano}-01-01`, `${ano + 1}-01-01`);
  const anual = (ano: number) => FOCUS_REAL.ipcaAnual.find((a) => a.ano === ano)?.est;
  it('nas fixtures, o DP anual de 2029 é maior que o de 2027', () => {
    expect(anual(2027)).toEqual({ mediana: 4.3, desvioPadrao: 0.4196, minimo: 3.17, maximo: 6 });
    expect(anual(2029)).toEqual({ mediana: 3.5, desvioPadrao: 0.47, minimo: 3, maximo: 6 });
  });
  it('SOBEM/CAEM em 2027 (meses com Focus mensal) abrem pelo desvio ANUAL, não por um DP por mês', () => {
    const fBase = anoCivil(cenarioReal('BASE'), 2027);
    const fSobem = anoCivil(cenarioReal('SOBEM'), 2027);
    const fCaem = anoCivil(cenarioReal('CAEM'), 2027);
    expect(fSobem).toBeCloseTo(1.047196 * (fBase / 1.043), 10);
    expect(fCaem).toBeCloseTo(1.038804 * (fBase / 1.043), 10);
    expect(Math.abs((fSobem - fBase) * 100 - 0.4196)).toBeLessThan(0.05);
    expect(Math.abs((fBase - fCaem) * 100 - 0.4196)).toBeLessThan(0.05);
  });
  it('a abertura não encolhe com o prazo: 2029 (DP 0,47) ≥ 2027 (DP 0,4196)', () => {
    const abertura = (ano: number) => anoCivil(cenarioReal('SOBEM'), ano) - anoCivil(cenarioReal('BASE'), ano);
    expect(abertura(2029)).toBeCloseTo(0.0047, 10);
    expect(abertura(2029)).toBeGreaterThanOrEqual(abertura(2027));
  });
});

describe('reuniões do Focus sem data', () => {
  it('sem calendário do Copom (nenhuma reunião datável) → erro', () => {
    expect(() => montarCenario('BASE', FOCUS, ATUAIS, [], PREMISSAS_PADRAO)).toThrow(
      new OfertaInvalidaError('Sem o calendário do Copom não dá para posicionar as reuniões do Focus'),
    );
  });
  it('reunião que não pôde ser datada aparece em reunioesSemData', () => {
    const semR8 = OFICIAIS.filter((r) => r.id !== 'R8/2026');
    const c = montarCenario('BASE', FOCUS, ATUAIS, semR8, PREMISSAS_PADRAO);
    expect(c.reunioesSemData).toEqual(['R8/2026']);
    expect(base().reunioesSemData).toEqual([]);
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

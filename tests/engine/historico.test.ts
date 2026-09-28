// tests/engine/historico.test.ts
import { describe, expect, it } from 'vitest';
import { paraCadaDiaUtil } from '../../src/engine/calendario';
import { somarDias, type DataISO } from '../../src/engine/datas';
import { cenarioComHistorico, type SeriesRealizadas } from '../../src/engine/historico';
import { cenarioConstante, fatorIPCA, fatorPercentualCDI, fatorSelic, taxaDiaria } from '../../src/engine/indexadores';
import { simular } from '../../src/engine/produtos';

const FUTURO = cenarioConstante({ cdiAA: 0.1365, selicMetaAA: 0.1375, ipcaAA: 0.0422, trAM: 0.001646 });

/** CDI diário sintético com 8 casas decimais (a série 12 vem em % a.d. com 6 casas), variando dia a dia. */
function cdiSintetico(inicio: DataISO, fim: DataISO): Map<DataISO, number> {
  const m = new Map<DataISO, number>();
  let k = 0;
  paraCadaDiaUtil(inicio, fim, (d) => {
    m.set(d, Math.round((0.00041 + ((k * 37) % 23) * 3.1e-7) * 1e8) / 1e8);
    k++;
  });
  return m;
}

function series(parcial: Partial<SeriesRealizadas> = {}): SeriesRealizadas {
  const cdi = cdiSintetico('2025-01-02', '2025-07-02');
  return {
    cdiDiario: cdi,
    selicOverDiaria: new Map([...cdi].map(([d, v]) => [d, v + 1e-8])),
    ipcaMensal: new Map([['2025-03', 0.0056], ['2025-04', 0.0043]]),
    trPorInicio: new Map([['2025-02-10', 0.0012], ['2025-03-10', 0.0015]]),
    selicMetaAA: new Map([['2025-01-01', 0.1225]]),
    ultimaData: '2025-06-30',
    ...parcial,
  };
}

const produtoDe = (m: ReadonlyMap<DataISO, number>, inicio: DataISO, fim: DataISO) => {
  let f = 1;
  paraCadaDiaUtil(inicio, fim, (d) => { f *= 1 + (m.get(d) as number); });
  return f;
};

describe('cenarioComHistorico', () => {
  it('ida e volta: a taxa diária da série sai de cdiAA com erro abaixo de 1e-15', () => {
    const s = series();
    const cen = cenarioComHistorico(s, FUTURO);
    expect(s.cdiDiario.size).toBeGreaterThan(100);
    for (const [d, v] of s.cdiDiario) if (d <= s.ultimaData) expect(Math.abs(taxaDiaria(cen.cdiAA(d)) - v)).toBeLessThan(1e-15);
  });

  it('CDB 100% do CDI num período todo realizado dá exatamente ∏(1 + d)', () => {
    const s = series();
    const cen = cenarioComHistorico(s, FUTURO);
    const esperado = produtoDe(s.cdiDiario, '2025-01-02', '2025-06-30');
    expect(fatorPercentualCDI(cen, 1, '2025-01-02', '2025-06-30')).toBe(esperado);
    const r = simular({ produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 }, valor: 10000, dataAplicacao: '2025-01-02' }, '2025-06-30', cen);
    expect(r.fator).toBe(esperado);
    expect(r.valorBruto).toBe(10000 * esperado);
  });

  it('um período que cruza a ultimaData emenda o realizado com o projetado', () => {
    const s = series();
    const cen = cenarioComHistorico(s, FUTURO);
    // A série tem 2025-07-01, depois da ultimaData: não entra.
    expect(s.cdiDiario.has('2025-07-01')).toBe(true);
    const realizado = produtoDe(s.cdiDiario, '2025-04-01', '2025-07-01');
    const projetado = fatorPercentualCDI(FUTURO, 1, '2025-07-01', '2025-10-01');
    expect(fatorPercentualCDI(cen, 1, '2025-04-01', '2025-10-01')).toBeCloseTo(realizado * projetado, 14);
    expect(cen.cdiAA('2025-07-01')).toBe(FUTURO.cdiAA('2025-07-01'));
  });

  it('dia útil sem dado na série (lacuna) cai no projetado', () => {
    const cdi = cdiSintetico('2025-01-02', '2025-07-02');
    cdi.delete('2025-02-12');
    const cen = cenarioComHistorico(series({ cdiDiario: cdi }), FUTURO);
    expect(cen.cdiAA('2025-02-12')).toBe(0.1365);
  });

  it('Selic over realizada: o Tesouro Selic acumula a série 11', () => {
    const s = series();
    const cen = cenarioComHistorico(s, FUTURO);
    expect(fatorSelic(cen, '2025-01-02', '2025-06-30')).toBe(produtoDe(s.selicOverDiaria, '2025-01-02', '2025-06-30'));
  });

  it('IPCA de um mês realizado bate com o fator mensal; mês sem dado cai no projetado', () => {
    const cen = cenarioComHistorico(series(), FUTURO);
    expect(fatorIPCA(cen, '2025-03-01', '2025-04-01')).toBeCloseTo(1.0056, 14);
    expect(fatorIPCA(cen, '2025-03-01', '2025-05-01')).toBeCloseTo(1.0056 * 1.0043, 14);
    expect(fatorIPCA(cen, '2025-05-01', '2025-06-01')).toBeCloseTo(Math.pow(1.0422, 1 / 12), 14);
  });

  it('TR realizada pelo início do período; sem dado, a do cenário', () => {
    const cen = cenarioComHistorico(series(), FUTURO);
    expect(cen.trAM('2025-02-10')).toBe(0.0012);
    expect(cen.trAM('2025-02-11')).toBe(0.001646);
  });

  it('Selic meta: vale a última vigência até a data, só até a ultimaData', () => {
    const meta = new Map([['2025-01-01', 0.1225], ['2025-02-15', 0.1225], ['2025-03-20', 0.1425], ['2025-05-15', 0.1425]]);
    const cen = cenarioComHistorico(series({ selicMetaAA: meta }), FUTURO);
    expect(cen.selicMetaAA('2025-03-19')).toBe(0.1225);
    expect(cen.selicMetaAA('2025-03-20')).toBe(0.1425);
    expect(cen.selicMetaAA('2025-06-30')).toBe(0.1425);
    expect(cen.selicMetaAA('2025-07-01')).toBe(0.1375);
    expect(cen.selicMetaAA('2024-12-31')).toBe(0.1375); // antes da primeira vigência
  });

  it('poupança no passado com Selic meta de 2% (regra dos 70%) e TR zero, mesmo com o futuro a 13,75%', () => {
    const s = series({
      cdiDiario: new Map(), selicOverDiaria: new Map(), ipcaMensal: new Map(),
      trPorInicio: new Map([['2021-01-10', 0], ['2021-02-10', 0], ['2021-03-10', 0]]),
      selicMetaAA: new Map([['2020-12-15', 0.02], ['2021-02-01', 0.02], ['2021-03-01', 0.0275]]),
      ultimaData: '2021-06-30',
    });
    const cen = cenarioComHistorico(s, FUTURO);
    const r = simular({ produto: 'POUPANCA', indexacao: { tipo: 'POUPANCA' }, valor: 10000, dataAplicacao: '2021-01-10' }, '2021-04-10', cen);
    const mes2 = Math.pow(1 + 0.7 * 0.02, 1 / 12);
    const mes275 = Math.pow(1 + 0.7 * 0.0275, 1 / 12);
    expect(r.valorBruto).toBeCloseTo(10000 * mes2 * mes2 * mes275, 9);
  });

  it('Selic meta: o preenchimento para a frente vai até 60 dias corridos; depois, o cenário', () => {
    const cen = cenarioComHistorico(series({ selicMetaAA: new Map([['2025-01-01', 0.1225]]) }), FUTURO);
    expect(cen.selicMetaAA(somarDias('2025-01-01', 60))).toBe(0.1225);
    expect(cen.selicMetaAA(somarDias('2025-01-01', 61))).toBe(0.1375);
    expect(cen.selicMetaAA('2025-06-30')).toBe(0.1375);
  });

  describe('lacunas', () => {
    it('sem lacuna, lista vazia', () => {
      expect(cenarioComHistorico(series(), FUTURO).lacunas).toEqual([]);
    });
    it('os dias úteis sem CDI até a ultimaData, em ordem (depois dela, não conta)', () => {
      const cdi = cdiSintetico('2025-01-02', '2025-07-02');
      for (const d of ['2025-03-05', '2025-02-12', '2025-07-01']) cdi.delete(d);
      expect(cenarioComHistorico(series({ cdiDiario: cdi }), FUTURO).lacunas).toEqual(['2025-02-12', '2025-03-05']);
    });
    it('fim de semana e feriado não são lacuna', () => {
      const cdi = cdiSintetico('2025-01-02', '2025-07-02');
      expect([...cdi.keys()]).not.toContain('2025-03-03'); // segunda de Carnaval
      expect(cenarioComHistorico(series({ cdiDiario: cdi }), FUTURO).lacunas).not.toContain('2025-03-03');
    });
  });

  describe('sanidade das séries: valor fora da faixa lança RangeError', () => {
    it.each<[string, Partial<SeriesRealizadas>]>([
      ['CDI negativo', { cdiDiario: new Map([['2025-01-02', -0.0001]]) }],
      ['CDI diário de 1% (erro de unidade)', { cdiDiario: new Map([['2025-01-02', 0.01]]) }],
      ['Selic over negativa', { selicOverDiaria: new Map([['2025-01-02', -1e-9]]) }],
      ['Selic over diária de 1%', { selicOverDiaria: new Map([['2025-01-02', 0.01]]) }],
      ['meta negativa', { selicMetaAA: new Map([['2025-01-01', -0.01]]) }],
      ['meta de 100% (13,75 no lugar de 0,1375)', { selicMetaAA: new Map([['2025-01-01', 1]]) }],
      ['IPCA mensal de 20%', { ipcaMensal: new Map([['2025-03', 0.2]]) }],
      ['IPCA mensal de −20%', { ipcaMensal: new Map([['2025-03', -0.2]]) }],
      ['TR negativa', { trPorInicio: new Map([['2025-02-10', -0.0001]]) }],
      ['TR mensal de 5%', { trPorInicio: new Map([['2025-02-10', 0.05]]) }],
    ])('%s', (_, parcial) => {
      expect(() => cenarioComHistorico(series(parcial), FUTURO)).toThrow(RangeError);
    });
    it.each<[string, Partial<SeriesRealizadas>]>([
      ['CDI zero e logo abaixo de 1%', { cdiDiario: new Map([['2025-01-02', 0], ['2025-01-03', 0.0099]]) }],
      ['Selic over zero e logo abaixo de 1%', { selicOverDiaria: new Map([['2025-01-02', 0], ['2025-01-03', 0.0099]]) }],
      ['meta zero e 99%', { selicMetaAA: new Map([['2025-01-01', 0], ['2025-02-01', 0.99]]) }],
      ['IPCA de ±19,9%', { ipcaMensal: new Map([['2025-03', 0.199], ['2025-04', -0.199]]) }],
      ['TR zero e 4,9%', { trPorInicio: new Map([['2025-02-10', 0], ['2025-03-10', 0.049]]) }],
    ])('na fronteira aceita: %s', (_, parcial) => {
      expect(() => cenarioComHistorico(series(parcial), FUTURO)).not.toThrow();
    });
  });

  it('série com valor inválido lança RangeError', () => {
    expect(() => cenarioComHistorico(series({ cdiDiario: new Map([['2025-01-02', Number.NaN]]) }), FUTURO)).toThrow(RangeError);
    expect(() => cenarioComHistorico(series({ ipcaMensal: new Map([['2025-13', 0.01]]) }), FUTURO)).toThrow(RangeError);
    expect(() => cenarioComHistorico(series({ ultimaData: '2025-02-30' }), FUTURO)).toThrow(RangeError);
    expect(() => cenarioComHistorico(series({ trPorInicio: new Map([[somarDias('2025-01-01', 0), -1]]) }), FUTURO)).toThrow(RangeError);
  });
});

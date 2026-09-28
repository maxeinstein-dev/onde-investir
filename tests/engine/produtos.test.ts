// tests/engine/produtos.test.ts
import { describe, expect, it } from 'vitest';
import { cenarioConstante } from '../../src/engine/indexadores';
import { simular, type Aplicacao, type ResultadoSimulacao } from '../../src/engine/produtos';
import { CEN, INI } from './cenarioPadrao';

const cdb103: Aplicacao = { produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, valor: 10000, dataAplicacao: INI };
const lci80: Aplicacao = { produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 }, valor: 10000, dataAplicacao: INI };

function somaDosPassos(r: ResultadoSimulacao): number {
  const v = Object.fromEntries(r.passos.map((p) => [p.id, p.valor]));
  return (v.aplicado ?? 0) + (v.rendimentoBruto ?? 0) - (v.iof ?? 0) - (v.custodia ?? 0) - (v.ir ?? 0);
}

describe('simular — renda fixa bancária (valores da referência)', () => {
  it.each([
    ['2027-03-29', 10527.063976, 0.2, 10508.07648],
    ['2027-09-28', 11152.33631, 0.175, 11068.912881],
    ['2028-09-28', 12551.897435, 0.15, 12262.041408],
    ['2029-09-28', 14089.009211, 0.15, 13567.234383],
  ])('resgate em %s', (resgate, liquidoCDB, aliquota, liquidoLCI) => {
    const cdb = simular(cdb103, resgate, CEN);
    expect(cdb.valorLiquido).toBeCloseTo(liquidoCDB, 4);
    expect(cdb.aliquotaIR).toBe(aliquota);
    const lci = simular(lci80, resgate, CEN);
    expect(lci.valorLiquido).toBeCloseTo(liquidoLCI, 4);
    expect(lci.ir).toBe(0);
    expect(lci.isentoIR).toBe(true);
  });
  it('CDB prefixado 13% a.a., 2 anos', () => {
    const r = simular({ ...cdb103, indexacao: { tipo: 'PRE', taxaAA: 0.13 } }, '2028-09-28', CEN);
    expect(r.valorBruto).toBeCloseTo(12756.620315, 4);
    expect(r.valorLiquido).toBeCloseTo(12343.127268, 4);
  });
  it('CDB IPCA + 7% a.a., 3 anos', () => {
    const r = simular({ ...cdb103, indexacao: { tipo: 'IPCA_MAIS', taxaRealAA: 0.07 } }, '2029-09-28', CEN);
    expect(r.valorLiquido).toBeCloseTo(13275.393373, 3);
  });
  it('IOF antes do IR: CDB 100% resgatado em 15 dias', () => {
    const r = simular({ ...cdb103, indexacao: { tipo: 'POS_CDI', percentualCDI: 1 } }, '2026-10-13', CEN);
    expect(r.diasUteis).toBe(10);
    expect(r.aliquotaIOF).toBe(0.5);
    expect(r.iof).toBeCloseTo(25.452134, 5);
    expect(r.ir).toBeCloseTo(5.72673, 5);
    expect(r.valorLiquido).toBeCloseTo(10019.725404, 5);
  });
  it('memória de cálculo: os passos fecham no líquido', () => {
    for (const r of [simular(cdb103, '2026-10-13', CEN), simular(lci80, '2028-09-28', CEN)]) {
      expect(r.passos.map((p) => p.id)).toEqual(['aplicado', 'rendimentoBruto', 'iof', 'custodia', 'ir', 'liquido']);
      expect(somaDosPassos(r)).toBeCloseTo(r.valorLiquido, 9);
      expect(r.passos.at(-1)?.valor).toBe(r.valorLiquido);
    }
  });
});

describe('simular — Tesouro', () => {
  const selic = (valor: number): Aplicacao => ({ produto: 'TESOURO_SELIC', indexacao: { tipo: 'SELIC' }, valor, dataAplicacao: INI });
  it.each([
    [8000, 0, 8893.286681],
    [10100, 1.566999, 11226.48166],
    [50000, 86.767323, 55511.458713],
  ])('Tesouro Selic R$ %i por 1 ano', (valor, custodia, liquido) => {
    const r = simular(selic(valor), '2027-09-28', CEN);
    expect(r.custodia).toBeCloseTo(custodia, 4);
    expect(r.valorLiquido).toBeCloseTo(liquido, 3);
  });
  it('a custódia sai da base do IR', () => {
    const r = simular(selic(50000), '2027-09-28', CEN);
    expect(r.ir).toBeCloseTo((r.rendimentoBruto - r.custodia) * 0.175, 8);
  });
  it('Tesouro Prefixado paga custódia sobre tudo', () => {
    const r = simular({ produto: 'TESOURO_PREFIXADO', indexacao: { tipo: 'PRE', taxaAA: 0.13 }, valor: 8000, dataAplicacao: INI }, '2028-09-28', CEN);
    expect(r.custodia).toBeGreaterThan(0);
  });
});

describe('simular — poupança', () => {
  const poup = (dataAplicacao: string): Aplicacao => ({ produto: 'POUPANCA', indexacao: { tipo: 'POUPANCA' }, valor: 10000, dataAplicacao });
  it('só rende no aniversário: 5 meses na véspera, 6 no dia', () => {
    const antes = simular(poup(INI), '2027-03-27', CEN);
    expect(antes.mesesPoupanca).toBe(5);
    expect(antes.valorLiquido).toBeCloseTo(10337.16894, 5);
    const noDia = simular(poup(INI), '2027-03-28', CEN);
    expect(noDia.mesesPoupanca).toBe(6);
    expect(noDia.valorLiquido).toBeCloseTo(10405.95484, 5);
  });
  it('depósito no dia 31 faz aniversário no dia 1º do mês seguinte', () => {
    expect(simular(poup('2026-10-31'), '2026-11-30', CEN).valorLiquido).toBe(10000);
    expect(simular(poup('2026-10-31'), '2026-12-01', CEN).valorLiquido).toBeCloseTo(10066.5423, 5);
  });
  it('regra dos 70% da Selic quando Selic ≤ 8,5%', () => {
    const cen8 = cenarioConstante({ cdiAA: 0.079, selicMetaAA: 0.08, ipcaAA: 0.04, trAM: 0 });
    expect(simular(poup(INI), '2026-12-28', cen8).valorLiquido).toBeCloseTo(10137.152491, 5);
  });
  describe('regra pela data do depósito (Lei 12.703/2012 só vale para depósitos a partir de 04/05/2012)', () => {
    // Meta de 10% até 2019 e de 2% em 2020: com a regra nova, 2020 rende 70% da Selic.
    const TR = 0.0001;
    const cen2020 = { ...cenarioConstante({ cdiAA: 0.02, selicMetaAA: 0.02, ipcaAA: 0.04, trAM: TR }), selicMetaAA: (d: string) => (d < '2020-01-01' ? 0.1 : 0.02) };
    /** O rendimento do aniversário de 10/06/2020 a 10/07/2020. */
    const mesDe2020 = (dataAplicacao: string) =>
      simular(poup(dataAplicacao), '2020-07-10', cen2020).valorBruto / simular(poup(dataAplicacao), '2020-06-10', cen2020).valorBruto;
    it('depósito de 2011: 0,5% + TR, mesmo em 2020 com a Selic abaixo de 8,5%', () => {
      expect(mesDe2020('2011-03-10')).toBeCloseTo(1.005 * (1 + TR), 12);
    });
    it('depósito de 2015: 70% da Selic + TR em 2020', () => {
      expect(mesDe2020('2015-03-10')).toBeCloseTo(Math.pow(1 + 0.7 * 0.02, 1 / 12) * (1 + TR), 12);
    });
    it('a véspera da lei nova ainda é a regra antiga; o dia da lei, a nova', () => {
      expect(mesDe2020('2012-05-03')).toBeCloseTo(1.005 * (1 + TR), 12);
      expect(mesDe2020('2012-05-04')).toBeCloseTo(Math.pow(1 + 0.7 * 0.02, 1 / 12) * (1 + TR), 12);
    });
  });
  it('isenta de IR e de IOF', () => {
    const r = simular(poup(INI), '2026-10-28', CEN);
    expect(r.ir).toBe(0);
    expect(r.iof).toBe(0);
  });
});

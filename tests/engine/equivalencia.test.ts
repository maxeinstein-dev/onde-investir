import { describe, expect, it } from 'vitest';
import { calcularEquivalencias, type Equivalente } from '../../src/engine/equivalencia';
import { simular, type Aplicacao, type Indexacao, type TipoProduto } from '../../src/engine/produtos';
import { CEN, INI } from './cenarioPadrao';

const lci80: Aplicacao = { produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 }, valor: 10000, dataAplicacao: INI };
const cdb103: Aplicacao = { ...lci80, produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 } };

/** Taxa de um equivalente disponível; falha o teste se estiver indisponível. */
function taxa(e: Equivalente): number {
  if (!e.disponivel) throw new Error(`equivalente indisponível: ${e.motivo}`);
  return e.taxa;
}
function motivo(e: Equivalente): string {
  if (e.disponivel) throw new Error(`equivalente disponível: ${e.taxa}`);
  return e.motivo;
}

describe('equivalência', () => {
  it('LCI 80% por 2 anos: exata 92,57% × regra de bolso 94,12%', () => {
    const eq = calcularEquivalencias(lci80, '2028-09-28', CEN);
    expect(taxa(eq.tributadoPosCDI)).toBeCloseTo(0.925707, 5);
    expect(eq.regraDeBolso?.destino).toBe('TRIBUTADO');
    expect(eq.regraDeBolso?.taxa).toBeCloseTo(0.8 / 0.85, 10);
    expect(taxa(eq.tributadoPre)).toBeCloseTo(0.12575, 5);
    expect(taxa(eq.tributadoIpcaMais)).toBeCloseTo(0.079909, 5);
    expect(taxa(eq.isentoPosCDI)).toBeCloseTo(0.8, 6);
    expect(eq.aliquotaIR).toBe(0.15);
  });
  it('LCI 80% por 1 ano: exata 95,98% × regra de bolso 96,97%', () => {
    const eq = calcularEquivalencias(lci80, '2027-09-28', CEN);
    expect(taxa(eq.tributadoPosCDI)).toBeCloseTo(0.959773, 5);
    expect(eq.regraDeBolso?.taxa).toBeCloseTo(0.8 / 0.825, 10);
    expect(taxa(eq.tributadoPre)).toBeCloseTo(0.130667, 5);
    expect(taxa(eq.tributadoIpcaMais)).toBeCloseTo(0.084526, 5);
  });
  it('CDB 103% por 2 anos equivale a LCI 89,17% (bolso 87,55%, destino isento)', () => {
    const eq = calcularEquivalencias(cdb103, '2028-09-28', CEN);
    expect(taxa(eq.isentoPosCDI)).toBeCloseTo(0.891676, 5);
    expect(eq.regraDeBolso?.destino).toBe('ISENTO');
    expect(eq.regraDeBolso?.taxa).toBeCloseTo(1.03 * 0.85, 10);
  });

  describe('ida e volta: simular na taxa exata reproduz o líquido da origem', () => {
    const casos: { nome: string; origem: Aplicacao; campo: 'tributadoPosCDI' | 'tributadoPre' | 'tributadoIpcaMais' | 'isentoPosCDI';
      produto: TipoProduto; indexacao: (t: number) => Indexacao }[] = [
      { nome: 'CDB pós', origem: lci80, campo: 'tributadoPosCDI', produto: 'CDB', indexacao: (t) => ({ tipo: 'POS_CDI', percentualCDI: t }) },
      { nome: 'CDB pré', origem: lci80, campo: 'tributadoPre', produto: 'CDB', indexacao: (t) => ({ tipo: 'PRE', taxaAA: t }) },
      { nome: 'CDB IPCA+', origem: lci80, campo: 'tributadoIpcaMais', produto: 'CDB', indexacao: (t) => ({ tipo: 'IPCA_MAIS', taxaRealAA: t }) },
      { nome: 'LCI pós', origem: cdb103, campo: 'isentoPosCDI', produto: 'LCI', indexacao: (t) => ({ tipo: 'POS_CDI', percentualCDI: t }) },
    ];
    for (const c of casos) {
      it(c.nome, () => {
        for (const resgate of ['2027-09-28', '2028-09-28', '2031-03-10'] as const) {
          const eq = calcularEquivalencias(c.origem, resgate, CEN);
          const r = simular({ ...c.origem, produto: c.produto, indexacao: c.indexacao(taxa(eq[c.campo])) }, resgate, CEN);
          expect(Math.abs(r.valorLiquido - eq.liquidoAlvo)).toBeLessThan(1e-6);
        }
      });
    }
    it('com IOF (resgate em 20 dias corridos)', () => {
      const pre: Aplicacao = { ...cdb103, indexacao: { tipo: 'PRE', taxaAA: 0.14 } };
      const eq = calcularEquivalencias(pre, '2026-10-18', CEN);
      const r = simular({ ...cdb103, indexacao: { tipo: 'POS_CDI', percentualCDI: taxa(eq.tributadoPosCDI) } }, '2026-10-18', CEN);
      expect(Math.abs(r.valorLiquido - eq.liquidoAlvo)).toBeLessThan(1e-6);
    });
  });

  it('prazo menor que o mínimo da LCI → isento indisponível com o motivo do prazo mínimo', () => {
    expect(motivo(calcularEquivalencias(cdb103, '2026-12-28', CEN).isentoPosCDI)).toMatch(/prazo mínimo/);
  });
  it('origem prefixada não tem regra de bolso', () => {
    const pre: Aplicacao = { ...lci80, produto: 'CDB', indexacao: { tipo: 'PRE', taxaAA: 0.13 } };
    expect(calcularEquivalencias(pre, '2028-09-28', CEN).regraDeBolso).toBeNull();
  });
  it('CDB 103% por 5 meses → regra de bolso null (não há LCI nesse prazo)', () => {
    const eq = calcularEquivalencias(cdb103, '2027-02-28', CEN);
    expect(eq.isentoPosCDI.disponivel).toBe(false);
    expect(eq.regraDeBolso).toBeNull();
  });

  it('poupança resgatada antes do 1º aniversário → indisponível com motivo, sem lançar', () => {
    const poup: Aplicacao = { produto: 'POUPANCA', indexacao: { tipo: 'POUPANCA' }, valor: 10000, dataAplicacao: INI };
    const eq = calcularEquivalencias(poup, '2026-10-20', CEN);
    expect(eq.liquidoAlvo).toBe(10000);
    expect(motivo(eq.tributadoPosCDI)).toBe('a origem não rende nada nesse prazo');
    expect(motivo(eq.tributadoPre)).toBe('a origem não rende nada nesse prazo');
    expect(motivo(eq.tributadoIpcaMais)).toBe('a origem não rende nada nesse prazo');
    expect(motivo(eq.isentoPosCDI).length).toBeGreaterThan(0);
    expect(eq.regraDeBolso).toBeNull();
  });
  it('origem aplicada antes da regra de prazo mínimo cadastrada → só o isento fica indisponível', () => {
    const cdb: Aplicacao = { ...cdb103, dataAplicacao: '2025-01-10' };
    const eq = calcularEquivalencias(cdb, '2027-01-11', CEN);
    expect(motivo(eq.isentoPosCDI)).toMatch(/não está cadastrada/);
    expect(taxa(eq.tributadoPosCDI)).toBeCloseTo(1.03, 8);
    expect(eq.tributadoPre.disponivel).toBe(true);
    expect(eq.tributadoIpcaMais.disponivel).toBe(true);
    expect(eq.regraDeBolso).toBeNull();
  });
  it('sábado → segunda: sem dias úteis', () => {
    const tesouro: Aplicacao = { produto: 'TESOURO_PREFIXADO', indexacao: { tipo: 'PRE', taxaAA: 0.13 }, valor: 10000, dataAplicacao: '2026-10-03' };
    const eq = calcularEquivalencias(tesouro, '2026-10-05', CEN);
    for (const e of [eq.tributadoPosCDI, eq.tributadoPre, eq.tributadoIpcaMais, eq.isentoPosCDI]) {
      expect(motivo(e)).toBe('sem dias úteis no período');
    }
  });
  it('desempenho: 10 anos em menos de 200 ms', () => {
    calcularEquivalencias(cdb103, '2027-09-28', CEN); // aquece caches de feriados
    const t0 = performance.now();
    calcularEquivalencias(cdb103, '2036-09-29', CEN);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

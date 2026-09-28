// tests/engine/custoExtra.test.ts
import { describe, expect, it } from 'vitest';
import { calcularEquivalencias } from '../../src/engine/equivalencia';
import { OfertaInvalidaError } from '../../src/engine/erros';
import { ofertaDeReinvestimento, projetar, validarOfertaCadastrada, type OfertaCadastrada } from '../../src/engine/ofertas';
import { CUSTO_EXTRA_MAXIMO_AA, simular, type Aplicacao, type ResultadoSimulacao } from '../../src/engine/produtos';
import { seriesDeValorLiquido } from '../../src/engine/serie';
import { CEN, INI } from './cenarioPadrao';

const cdb: Aplicacao = { produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 }, valor: 10000, dataAplicacao: INI };
const UM_ANO = '2027-09-28'; // 365 dias corridos

/** Os passos na ordem da memória de cálculo, somados da esquerda para a direita. */
function somaDosPassos(r: ResultadoSimulacao): number {
  const sinal: Record<string, number> = { aplicado: 1, rendimentoBruto: 1, iof: -1, custodia: -1, ir: -1, custoExtra: -1 };
  return r.passos.filter((p) => p.id !== 'liquido').reduce((s, p) => s + (sinal[p.id] as number) * p.valor, 0);
}

describe('simular com custo extra', () => {
  it('custo zero ou ausente não muda nada', () => {
    const sem = simular(cdb, UM_ANO, CEN);
    expect(sem.custoExtra).toBe(0);
    expect(sem.passos.map((p) => p.id)).not.toContain('custoExtra');
    const zero = simular({ ...cdb, custoExtraAA: 0 }, UM_ANO, CEN);
    expect({ ...zero, aplicacao: sem.aplicacao }).toEqual(sem);
  });
  it('0,5% a.a. em 1 ano (365 dias) custa 0,5% do bruto, descontado depois do IR', () => {
    const sem = simular(cdb, UM_ANO, CEN);
    const com = simular({ ...cdb, custoExtraAA: 0.005 }, UM_ANO, CEN);
    expect(com.diasCorridos).toBe(365);
    expect(com.custoExtra).toBeCloseTo(sem.valorBruto * 0.005, 9);
    expect(com.ir).toBe(sem.ir); // a tarifa não reduz a base do IR
    expect(com.iof).toBe(sem.iof);
    expect(com.valorLiquido).toBe(sem.valorBruto - sem.iof - sem.custodia - sem.ir - com.custoExtra);
  });
  it('fórmula pró-rata: bruto × (1 − (1 − c)^(dc/365))', () => {
    const r = simular({ ...cdb, custoExtraAA: 0.01 }, '2027-03-29', CEN);
    expect(r.custoExtra).toBe(r.valorBruto * (1 - Math.pow(1 - 0.01, r.diasCorridos / 365)));
  });
  it('memória de cálculo: o passo custoExtra antes do líquido, e os passos fecham exatamente', () => {
    for (const ap of [
      { ...cdb, custoExtraAA: 0.005 },
      { ...cdb, produto: 'LCI' as const, custoExtraAA: 0.003 },
      { ...cdb, produto: 'TESOURO_SELIC' as const, indexacao: { tipo: 'SELIC' as const }, valor: 50000, custoExtraAA: 0.002 },
      { produto: 'POUPANCA' as const, indexacao: { tipo: 'POUPANCA' as const }, valor: 10000, dataAplicacao: INI, custoExtraAA: 0.004 },
    ]) {
      const r = simular(ap, '2028-09-28', CEN);
      expect(r.passos.map((p) => p.id)).toEqual(['aplicado', 'rendimentoBruto', 'iof', 'custodia', 'ir', 'custoExtra', 'liquido']);
      expect(r.passos.find((p) => p.id === 'custoExtra')?.valor).toBe(r.custoExtra);
      expect(r.custoExtra).toBeGreaterThan(0);
      expect(somaDosPassos(r)).toBe(r.valorLiquido);
      expect(r.passos.at(-1)?.valor).toBe(r.valorLiquido);
    }
  });
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.001, 0.0501])('custo inválido (%s) lança', (c) => {
    expect(() => simular({ ...cdb, custoExtraAA: c }, UM_ANO, CEN)).toThrow(OfertaInvalidaError);
  });
  it('o teto é 5% a.a., aceito', () => {
    expect(CUSTO_EXTRA_MAXIMO_AA).toBe(0.05);
    expect(() => simular({ ...cdb, custoExtraAA: 0.05 }, UM_ANO, CEN)).not.toThrow();
  });
});

describe('custo extra nas ofertas', () => {
  const oferta: OfertaCadastrada = {
    id: 'o', emissor: 'Corretora X', conglomerado: 'X', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.1 },
    vencimento: UM_ANO, liquidez: 'NO_VENCIMENTO', custoExtraAA: 0.005,
  };
  it('validarOfertaCadastrada recusa custo fora de [0, 5%]', () => {
    expect(() => validarOfertaCadastrada(oferta)).not.toThrow();
    for (const c of [Number.NaN, -0.01, 0.06]) expect(() => validarOfertaCadastrada({ ...oferta, custoExtraAA: c })).toThrow(OfertaInvalidaError);
  });
  it('projetar usa o custo da oferta', () => {
    const p = projetar(oferta, 10000, INI, UM_ANO, CEN);
    const esperado = simular({ ...cdb, indexacao: oferta.indexacao, custoExtraAA: 0.005 }, UM_ANO, CEN).valorLiquido;
    expect(p.estado === 'DISPONIVEL' && p.liquido).toBe(esperado);
  });
  it('a reaplicação na mesma oferta leva o custo; em CDB 100% ou taxa fixa, não', () => {
    expect(ofertaDeReinvestimento(oferta, { tipo: 'MESMA_TAXA' }).custoExtraAA).toBe(0.005);
    expect(ofertaDeReinvestimento(oferta, { tipo: 'PADRAO' }).custoExtraAA).toBe(0.005);
    expect(ofertaDeReinvestimento(oferta, { tipo: 'CDI_100' }).custoExtraAA).toBeUndefined();
    expect(ofertaDeReinvestimento(oferta, { tipo: 'TAXA_FIXA', taxaAA: 0.1 }).custoExtraAA).toBeUndefined();
    expect('custoExtraAA' in ofertaDeReinvestimento({ ...oferta, custoExtraAA: undefined }, { tipo: 'MESMA_TAXA' })).toBe(false);
  });
  it('a série usa o custo também no valor de referência (antes do vencimento)', () => {
    const [serie] = seriesDeValorLiquido([oferta], 10000, INI, UM_ANO, CEN, { tipo: 'PADRAO' });
    const ponto = serie?.pontos[0];
    expect(ponto?.resgatavel).toBe(false);
    const esperado = simular({ ...cdb, indexacao: oferta.indexacao, custoExtraAA: 0.005 }, ponto?.data as string, CEN).valorLiquido;
    expect(ponto?.liquido).toBe(esperado);
  });
});

describe('equivalência com custo extra', () => {
  it('a origem usa o custo dela; os equivalentes são sem custo', () => {
    const origem = { ...cdb, custoExtraAA: 0.005 };
    const eq = calcularEquivalencias(origem, '2028-09-28', CEN);
    expect(eq.liquidoAlvo).toBe(simular(origem, '2028-09-28', CEN).valorLiquido);
    if (!eq.tributadoPosCDI.disponivel || !eq.tributadoPre.disponivel || !eq.isentoPosCDI.disponivel) throw new Error('indisponível');
    expect(eq.tributadoPosCDI.taxa).toBeLessThan(1);
    const cdbEquivalente = simular({ ...cdb, indexacao: { tipo: 'POS_CDI', percentualCDI: eq.tributadoPosCDI.taxa } }, '2028-09-28', CEN);
    expect(cdbEquivalente.custoExtra).toBe(0);
    expect(cdbEquivalente.valorLiquido).toBeCloseTo(eq.liquidoAlvo, 6);
    const pre = simular({ ...cdb, indexacao: { tipo: 'PRE', taxaAA: eq.tributadoPre.taxa } }, '2028-09-28', CEN);
    expect(pre.valorLiquido).toBeCloseTo(eq.liquidoAlvo, 6);
    const lci = simular({ ...cdb, produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: eq.isentoPosCDI.taxa } }, '2028-09-28', CEN);
    expect(lci.valorLiquido).toBeCloseTo(eq.liquidoAlvo, 6);
  });
});

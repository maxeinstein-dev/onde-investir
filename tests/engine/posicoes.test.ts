// tests/engine/posicoes.test.ts
import { describe, expect, it } from 'vitest';
import { OfertaInvalidaError } from '../../src/engine/erros';
import { LIMIAR_EXTRATO_SUSPEITO, type Posicao, validarPosicao, valorAtual } from '../../src/engine/posicoes';
import { simular } from '../../src/engine/produtos';
import { CEN } from './cenarioPadrao';

const HOJE = '2026-09-28';
const APLICADO_EM = '2025-09-29';

const cdb: Posicao = {
  id: 'pos-1', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 }, emissor: 'Banco X', conglomerado: 'Banco X',
  vencimento: '2027-09-29', liquidez: 'DIARIA', valorAplicado: 10000, dataAplicacao: APLICADO_EM, eventos: [],
};

const simulado = (p: Posicao, data: string) =>
  simular({ produto: p.produto, indexacao: p.indexacao, valor: p.valorAplicado, dataAplicacao: p.dataAplicacao }, data, CEN, { ignorarPrazoMinimo: true });

describe('validarPosicao', () => {
  it('aceita uma posição válida', () => {
    expect(() => validarPosicao(cdb, HOJE)).not.toThrow();
  });
  it.each<[string, Partial<Posicao>]>([
    ['valor zero', { valorAplicado: 0 }],
    ['valor negativo', { valorAplicado: -1 }],
    ['valor NaN', { valorAplicado: Number.NaN }],
    ['aplicação no futuro', { dataAplicacao: '2026-09-29' }],
    ['data de aplicação inválida', { dataAplicacao: '2026-02-30' }],
    ['vencimento inválido', { vencimento: '2027-13-01' }],
    ['vencimento antes da aplicação', { vencimento: '2025-09-01' }],
    ['vencimento no dia da aplicação', { vencimento: APLICADO_EM }],
    ['emissor vazio (regra da oferta)', { emissor: '  ' }],
    ['percentual do CDI inválido', { indexacao: { tipo: 'POS_CDI', percentualCDI: 103 } }],
    ['extrato sem data', { valorExtrato: 10500 }],
    ['data do extrato sem valor', { dataExtrato: '2026-09-01' }],
    ['extrato com valor zero', { valorExtrato: 0, dataExtrato: '2026-09-01' }],
    ['extrato antes da aplicação', { valorExtrato: 10500, dataExtrato: '2025-09-28' }],
    ['extrato depois de hoje', { valorExtrato: 10500, dataExtrato: '2026-09-29' }],
    ['extrato com data inválida', { valorExtrato: 10500, dataExtrato: '2026-02-30' }],
    ['base do extrato sem extrato', { baseExtrato: 'LIQUIDO' }],
    ['eventos no M3a', { eventos: [{ tipo: 'APORTE', data: '2026-01-05', valor: 1000 }] }],
  ])('recusa: %s', (_, mudanca) => {
    expect(() => validarPosicao({ ...cdb, ...mudanca }, HOJE)).toThrow(OfertaInvalidaError);
  });
  it('não cobra o prazo mínimo da LCI: a posição já existe', () => {
    const lci: Posicao = { ...cdb, produto: 'LCI', dataAplicacao: '2026-09-01', vencimento: '2027-09-01' };
    expect(() => validarPosicao(lci, HOJE)).not.toThrow();
  });
  it('aceita posição vencida e extrato no dia da aplicação e no dia de hoje', () => {
    expect(() => validarPosicao({ ...cdb, vencimento: '2026-03-02' }, HOJE)).not.toThrow();
    expect(() => validarPosicao({ ...cdb, valorExtrato: 10000, dataExtrato: APLICADO_EM }, HOJE)).not.toThrow();
    expect(() => validarPosicao({ ...cdb, valorExtrato: 11000, dataExtrato: HOJE, baseExtrato: 'BRUTO' }, HOJE)).not.toThrow();
  });
});

describe('simular com ignorarPrazoMinimo', () => {
  it('sem a opção nada muda; com ela, a LCI dentro do prazo mínimo é simulada', () => {
    const ap = { produto: 'CDB' as const, indexacao: cdb.indexacao, valor: 10000, dataAplicacao: APLICADO_EM };
    expect(simular(ap, HOJE, CEN)).toEqual(simular(ap, HOJE, CEN, { ignorarPrazoMinimo: true }));
    const lci = { ...ap, produto: 'LCI' as const };
    expect(() => simular(lci, '2025-10-29', CEN)).toThrow(OfertaInvalidaError);
    expect(simular(lci, '2025-10-29', CEN, { ignorarPrazoMinimo: true }).valorBruto).toBeGreaterThan(10000);
  });
});

describe('valorAtual', () => {
  it('CDB: o bruto e o líquido da simulação até a data', () => {
    const r = simulado(cdb, HOJE);
    expect(valorAtual(cdb, HOJE, CEN)).toEqual({ data: HOJE, bruto: r.valorBruto, liquido: r.valorLiquido, vencida: false });
  });
  it('no dia da aplicação vale o aplicado', () => {
    expect(valorAtual(cdb, APLICADO_EM, CEN)).toEqual({ data: APLICADO_EM, bruto: 10000, liquido: 10000, vencida: false });
  });
  it('data antes da aplicação lança', () => {
    expect(() => valorAtual(cdb, '2025-09-28', CEN)).toThrow(OfertaInvalidaError);
  });
  it('extrato coerente: diferença pequena, sem suspeita', () => {
    const calculado = simulado(cdb, '2026-09-01').valorBruto;
    const v = valorAtual({ ...cdb, valorExtrato: calculado * 1.004, dataExtrato: '2026-09-01' }, HOJE, CEN);
    expect(v.extrato).toEqual({
      valor: calculado * 1.004, data: '2026-09-01', base: 'BRUTO', calculado, diferencaPercentual: expect.closeTo(0.004, 12), suspeita: false,
    });
  });
  it.each([1.02, 0.985])('extrato suspeito: diferença acima de 1%% (fator %s)', (fator) => {
    const calculado = simulado(cdb, '2026-09-01').valorBruto;
    const v = valorAtual({ ...cdb, valorExtrato: calculado * fator, dataExtrato: '2026-09-01' }, HOJE, CEN);
    expect(v.extrato?.suspeita).toBe(true);
    expect(v.extrato?.diferencaPercentual).toBeCloseTo(fator - 1, 12);
  });
  it('o limiar da suspeita é 1%, e exatamente no limiar não é suspeita', () => {
    expect(LIMIAR_EXTRATO_SUSPEITO).toBe(0.01);
    const v = valorAtual({ ...cdb, valorExtrato: 10000 * (1 + LIMIAR_EXTRATO_SUSPEITO), dataExtrato: APLICADO_EM }, HOJE, CEN);
    expect(v.extrato?.suspeita).toBe(false);
  });
  it('extrato líquido: compara com o líquido calculado na data do extrato', () => {
    const r = simulado(cdb, '2026-09-01');
    const v = valorAtual({ ...cdb, valorExtrato: r.valorLiquido, dataExtrato: '2026-09-01', baseExtrato: 'LIQUIDO' }, HOJE, CEN);
    expect(v.extrato).toMatchObject({ base: 'LIQUIDO', calculado: r.valorLiquido, diferencaPercentual: 0, suspeita: false });
  });
  it('poupança segue a regra do aniversário', () => {
    const poup: Posicao = { ...cdb, produto: 'POUPANCA', indexacao: { tipo: 'POUPANCA' }, liquidez: 'DIARIA' };
    delete (poup as { vencimento?: string }).vencimento;
    const r = simulado(poup, HOJE);
    expect(r.mesesPoupanca).toBe(11); // 29/09 vira aniversário no dia 1º
    expect(valorAtual(poup, HOJE, CEN)).toEqual({ data: HOJE, bruto: r.valorBruto, liquido: r.valorLiquido, vencida: false });
  });
  it('Tesouro Selic: a Selic e a custódia de sempre', () => {
    const ts: Posicao = { ...cdb, produto: 'TESOURO_SELIC', indexacao: { tipo: 'SELIC' }, emissor: 'Tesouro Nacional', conglomerado: 'Tesouro Nacional', vencimento: '2031-03-01' };
    const r = simulado(ts, HOJE);
    expect(r.custodia).toBeGreaterThan(0);
    expect(valorAtual(ts, HOJE, CEN)).toEqual({ data: HOJE, bruto: r.valorBruto, liquido: r.valorLiquido, vencida: false });
  });
  it('Tesouro Prefixado antes do vencimento: valor na curva, com a marcação a mercado sinalizada', () => {
    const tp: Posicao = { ...cdb, produto: 'TESOURO_PREFIXADO', indexacao: { tipo: 'PRE', taxaAA: 0.13 }, vencimento: '2029-01-01' };
    const v = valorAtual(tp, HOJE, CEN);
    expect(v.marcacaoAMercado).toBe(true);
    expect(v.bruto).toBe(simulado(tp, HOJE).valorBruto);
    expect(valorAtual(tp, '2029-01-01', CEN).marcacaoAMercado).toBeUndefined();
  });
  it('LCI dentro do prazo mínimo tem valor atual', () => {
    const lci: Posicao = { ...cdb, produto: 'LCI', dataAplicacao: '2026-09-01', vencimento: '2027-09-01' };
    expect(valorAtual(lci, HOJE, CEN).bruto).toBe(simulado(lci, HOJE).valorBruto);
  });
  it('posição vencida: o valor no vencimento, com vencida', () => {
    const venc = '2026-03-30';
    const p = { ...cdb, vencimento: venc };
    const r = simulado(p, venc);
    expect(valorAtual(p, HOJE, CEN)).toEqual({ data: venc, bruto: r.valorBruto, liquido: r.valorLiquido, vencida: true });
    expect(valorAtual(p, venc, CEN).vencida).toBe(false);
  });
  it('extrato depois do vencimento confere com o valor no vencimento', () => {
    const venc = '2026-03-30';
    const bruto = simulado(cdb, venc).valorBruto;
    const v = valorAtual({ ...cdb, vencimento: venc, valorExtrato: bruto, dataExtrato: '2026-06-01' }, HOJE, CEN);
    expect(v.extrato).toMatchObject({ calculado: bruto, diferencaPercentual: 0, suspeita: false });
  });
});

import { describe, expect, it } from 'vitest';
import { diasCorridos, somarDias } from '../../src/engine/datas';
import { taxaDiaria } from '../../src/engine/indexadores';
import { projetar, type OfertaCadastrada } from '../../src/engine/ofertas';
import { datasDaSerie, seriesDeValorLiquido } from '../../src/engine/serie';
import { CEN, INI } from './cenarioPadrao';
import { cenarioReal } from './cenarioReal';

const b = { emissor: 'B', conglomerado: 'B' };
const cdb2027: OfertaCadastrada = { ...b, id: '1', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, vencimento: '2027-09-28', liquidez: 'NO_VENCIMENTO' };
const lci2028: OfertaCadastrada = { ...b, id: '2', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 }, vencimento: '2028-09-28', liquidez: 'NO_VENCIMENTO' };
const cdbDiario: OfertaCadastrada = { ...b, id: '3', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 }, liquidez: 'DIARIA' };
const prefixado2029: OfertaCadastrada = { ...b, id: '4', produto: 'TESOURO_PREFIXADO', indexacao: { tipo: 'PRE', taxaAA: 0.13 }, vencimento: '2029-01-01', liquidez: 'DIARIA' };
const PADRAO = { tipo: 'PADRAO' } as const;

describe('datasDaSerie', () => {
  const fim = '2029-09-28';
  const datas = datasDaSerie(INI, fim, [cdb2027]);

  it('a cada 7 dias corridos a partir da aplicação', () => {
    expect(datas.slice(0, 3)).toEqual([somarDias(INI, 7), somarDias(INI, 14), somarDias(INI, 21)]);
    expect(datas).toContain(somarDias(INI, 7 * 100));
  });
  it('as datas-limite do IR da aplicação', () => {
    for (const n of [180, 181, 360, 361, 720, 721]) expect(datas, String(n)).toContain(somarDias(INI, n));
  });
  it('o vencimento, o dia seguinte e as datas-limite do IR da reaplicação', () => {
    expect(datas).toContain('2027-09-28');
    expect(datas).toContain('2027-09-29');
    for (const n of [180, 181, 360, 361, 720, 721]) expect(datas, String(n)).toContain(somarDias('2027-09-28', n));
  });
  it('o fim, em ordem, sem duplicatas e dentro de (aplicação, fim]', () => {
    expect(datas.at(-1)).toBe(fim);
    expect([...datas].sort()).toEqual(datas);
    expect(new Set(datas).size).toBe(datas.length);
    expect(datas.every((d) => d > INI && d <= fim)).toBe(true);
  });
  it('vencimento fora do intervalo não entra', () => {
    const d = datasDaSerie(INI, '2027-06-01', [cdb2027]);
    expect(d).not.toContain('2027-09-28');
    expect(d.at(-1)).toBe('2027-06-01');
  });
  it('fim antes ou na aplicação → lista vazia', () => {
    expect(datasDaSerie(INI, INI, [cdb2027])).toEqual([]);
  });
});

describe('seriesDeValorLiquido', () => {
  it('uma série por oferta, um ponto por data', () => {
    const fim = '2028-09-28';
    const s = seriesDeValorLiquido([cdb2027, lci2028], 10000, INI, fim, CEN, PADRAO);
    const datas = datasDaSerie(INI, fim, [cdb2027, lci2028]);
    expect(s.map((x) => x.ofertaIndice)).toEqual([0, 1]);
    expect(s[0]?.pontos.map((p) => p.data)).toEqual(datas);
    expect(s[1]?.pontos.map((p) => p.data)).toEqual(datas);
  });

  it('DISPONIVEL: o líquido de projetar, resgatável', () => {
    const [s] = seriesDeValorLiquido([cdbDiario], 10000, INI, '2027-09-28', CEN, PADRAO);
    const ponto = s?.pontos.find((p) => p.data === '2027-03-28');
    const p = projetar(cdbDiario, 10000, INI, '2027-03-28', CEN);
    expect(p.estado).toBe('DISPONIVEL');
    expect(ponto).toEqual({ data: '2027-03-28', liquido: p.estado === 'DISPONIVEL' ? p.liquido : NaN, resgatavel: true });
  });

  it('LCI "só no vencimento": não resgatável antes do vencimento, resgatável no vencimento', () => {
    const [s] = seriesDeValorLiquido([lci2028], 10000, INI, '2029-03-28', CEN, PADRAO);
    const pontos = s?.pontos ?? [];
    const antes = pontos.filter((p) => p.data < '2028-09-28');
    expect(antes.length).toBeGreaterThan(0);
    expect(antes.every((p) => !p.resgatavel)).toBe(true);
    expect(pontos.find((p) => p.data === '2028-09-28')?.resgatavel).toBe(true);
    expect(pontos.filter((p) => p.data > '2028-09-28').every((p) => p.resgatavel)).toBe(true);
  });

  it('LCI: antes do prazo mínimo legal, liquido null; depois, o valor de referência (simular direto)', () => {
    const [s] = seriesDeValorLiquido([lci2028], 10000, INI, '2028-09-28', CEN, PADRAO);
    const pontos = s?.pontos ?? [];
    // prazo mínimo de 6 meses: 2027-03-28
    expect(pontos.filter((p) => p.data < '2027-03-28').every((p) => p.liquido === null && !p.resgatavel)).toBe(true);
    const referencia = pontos.find((p) => p.data === somarDias(INI, 364)); // 2027-09-27, um ponto semanal
    expect(referencia?.resgatavel).toBe(false);
    // LCI isenta, sem IOF: a referência é o bruto, 80% do CDI por dia útil
    expect(referencia?.liquido).toBeGreaterThan(10000);
    const noVencimento = pontos.find((p) => p.data === '2028-09-28');
    expect(noVencimento?.liquido).toBeGreaterThan(referencia?.liquido ?? Infinity);
  });

  it('Tesouro prefixado com marcação a mercado: referência na curva, não resgatável até o vencimento', () => {
    const [s] = seriesDeValorLiquido([prefixado2029], 10000, INI, '2029-06-01', CEN, PADRAO);
    const pontos = s?.pontos ?? [];
    const antes = pontos.filter((p) => p.data < '2029-01-01');
    expect(antes.every((p) => !p.resgatavel && p.liquido !== null && p.liquido > 10000)).toBe(true);
    expect(pontos.filter((p) => p.data >= '2029-01-01').every((p) => p.resgatavel)).toBe(true);
  });

  it('degrau do IR: no dia 181 o líquido sobe mais que um dia de rendimento (22,5% → 20%)', () => {
    const [s] = seriesDeValorLiquido([cdbDiario], 10000, INI, '2027-09-28', CEN, PADRAO);
    const em = (n: number) => s?.pontos.find((p) => p.data === somarDias(INI, n))?.liquido ?? NaN;
    const d180 = em(180);
    const d181 = em(181);
    const umDia = d180 * taxaDiaria(CEN.cdiAA(INI));
    expect(d181 - d180).toBeGreaterThan(umDia);
    // a conta: o degrau é 2,5% do rendimento bruto
    expect(d181 - d180).toBeCloseTo((d180 - 10000) / (1 - 0.225) * 0.025, 2);
  });

  it('oferta vencida antes da aplicação: todos os pontos null', () => {
    const vencida = { ...cdb2027, vencimento: '2026-01-01' };
    const [s] = seriesDeValorLiquido([vencida], 10000, INI, '2027-01-01', CEN, PADRAO);
    expect(s?.pontos.every((p) => p.liquido === null && !p.resgatavel)).toBe(true);
  });

  it('LCI com vencimento antes do prazo mínimo: nunca resgatável e sem referência depois do vencimento', () => {
    const curta = { ...lci2028, vencimento: '2027-01-28' };
    const [s] = seriesDeValorLiquido([curta], 10000, INI, '2027-09-28', CEN, PADRAO);
    expect(s?.pontos.every((p) => !p.resgatavel && p.liquido === null)).toBe(true);
  });

  it('desempenho: 5 ofertas × 5 anos com o cenário projetado real < 300 ms', () => {
    const cen = cenarioReal('BASE');
    const ofertas: OfertaCadastrada[] = [
      { ...b, id: '1', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.05 }, vencimento: '2027-09-28', liquidez: 'NO_VENCIMENTO' },
      { ...b, id: '2', produto: 'CDB', indexacao: { tipo: 'PRE', taxaAA: 0.14 }, vencimento: '2029-09-28', liquidez: 'NO_VENCIMENTO' },
      { ...b, id: '3', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.9 }, vencimento: '2028-09-28', liquidez: 'NO_VENCIMENTO' },
      { ...b, id: '4', produto: 'TESOURO_SELIC', indexacao: { tipo: 'SELIC' }, vencimento: '2031-03-01', liquidez: 'DIARIA' },
      { ...b, id: '5', produto: 'TESOURO_IPCA', indexacao: { tipo: 'IPCA_MAIS', taxaRealAA: 0.075 }, vencimento: '2035-05-15', liquidez: 'DIARIA' },
    ];
    const fim = '2031-09-28';
    expect(diasCorridos(INI, fim)).toBeGreaterThanOrEqual(5 * 365);
    const t0 = performance.now();
    const s = seriesDeValorLiquido(ofertas, 10000, INI, fim, cen, PADRAO);
    const ms = performance.now() - t0;
    console.info(`seriesDeValorLiquido 5 ofertas × 5 anos: ${ms.toFixed(1)} ms`);
    expect(s).toHaveLength(5);
    expect(ms).toBeLessThan(300);
  });
});

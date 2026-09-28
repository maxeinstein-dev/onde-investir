import { describe, expect, it } from 'vitest';
import { lideres } from '../../src/engine/comparacao';
import { diasCorridos, somarDias, somarMeses } from '../../src/engine/datas';
import { taxaDiaria } from '../../src/engine/indexadores';
import { projetar, type OfertaCadastrada } from '../../src/engine/ofertas';
import { datasDaSerie, lideresNoPonto, seriesDeValorLiquido, trocasDeLider, trocasRelevantes, type Serie, type TrocaDeLider } from '../../src/engine/serie';
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
    // Reaplicada em LCI no vencimento (regra padrão), só volta a ser resgatável 6 meses depois (prazo mínimo).
    expect(pontos.filter((p) => p.data > '2028-09-28' && p.data < '2029-03-28').every((p) => !p.resgatavel && p.motivo === 'PRAZO_MINIMO')).toBe(true);
    expect(pontos.find((p) => p.data === '2029-03-28')?.resgatavel).toBe(true);
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

  // Limite com folga para a CI (medido localmente ~100-170 ms; o runner do GitHub Actions já
  // registrou até 326 ms). O mesmo padrão de "meta real menor, limite do teste mais folgado"
  // já usado no teste de desempenho da Carteira (M3a).
  it('desempenho: 5 ofertas × 5 anos com o cenário projetado real < 900 ms', () => {
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
    expect(ms).toBeLessThan(900);
  });
});

describe('trocasDeLider', () => {
  const cdb103Diario: OfertaCadastrada = { ...cdbDiario, id: '5', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 } };

  it('CDB 103% contra LCI 80% "só no vencimento" em 2 anos: a LCI nunca lidera antes de vencer', () => {
    const ofertas = [cdb103Diario, lci2028];
    const series = seriesDeValorLiquido(ofertas, 10000, INI, '2028-09-28', CEN, PADRAO);
    const trocas = trocasDeLider(series, { ofertas, valor: 10000, dataAplicacao: INI, cen: CEN, regra: PADRAO });
    expect(trocas.filter((t) => t.para.includes(1) && t.data < '2028-09-28')).toEqual([]);
    expect(lideresNoPonto(series, 0)).toEqual([0]);
    // no vencimento a LCI 80% isenta (≈ 80% do CDI) ainda perde para o CDB 103% com IR de 15% (≈ 87,6%)
    expect(trocas).toEqual([]);
  });

  describe('prefixado 13% contra pós 100% do CDI no cenário projetado (Selic caindo)', () => {
    const cen = cenarioReal('BASE');
    const pre: OfertaCadastrada = { ...b, id: 'p', produto: 'CDB', indexacao: { tipo: 'PRE', taxaAA: 0.13 }, liquidez: 'DIARIA' };
    const ofertas = [pre, cdbDiario];
    const ctx = { ofertas, valor: 10000, dataAplicacao: INI, cen, regra: PADRAO };
    const series = seriesDeValorLiquido(ofertas, 10000, INI, '2029-09-28', cen, PADRAO);
    const trocas = trocasDeLider(series, ctx);
    const lideresEm = (data: string) => lideres(ofertas.map((o) => projetar(o, 10000, INI, data, cen)));

    it('o pós lidera no começo e o prefixado passa à frente uma vez', () => {
      expect(lideresNoPonto(series, 0)).toEqual([1]);
      expect(trocas).toHaveLength(1);
      expect(trocas[0]?.de).toEqual([1]);
      expect(trocas[0]?.para).toEqual([0]);
    });
    it('a data sai exata pela busca por dia: projetar confere no dia anterior, no dia e no dia seguinte', () => {
      const t = trocas[0];
      if (!t) throw new Error('sem troca');
      // entre dois pontos semanais: sem a busca, a data seria a do ponto seguinte
      const datas = series[0]?.pontos.map((p) => p.data) ?? [];
      const seguinte = datas.find((d) => d >= t.data) ?? '';
      expect(diasCorridos(t.data, seguinte)).toBeLessThan(7);
      expect(lideresEm(somarDias(t.data, -1))).toEqual([1]);
      expect(lideresEm(t.data)).toEqual([0]);
      expect(lideresEm(somarDias(t.data, 1))).toEqual([0]);
    });
    it('sem o contexto de projeção, a troca fica no primeiro ponto da série com o novo líder', () => {
      const [t] = trocasDeLider(series);
      const k = series[0]?.pontos.findIndex((p) => p.data === t?.data) ?? -1;
      expect(k).toBeGreaterThan(0);
      expect(lideresNoPonto(series, k - 1)).toEqual([1]);
      expect(lideresNoPonto(series, k)).toEqual([0]);
      expect(t?.data).toBe(seguinteDoPonto(series, trocas[0]?.data ?? ''));
    });
  });

  it('empate em centavos entra no conjunto de líderes, e a mudança de conjunto é uma troca', () => {
    const serie = (ofertaIndice: number, valores: (number | null)[]): Serie => ({
      ofertaIndice,
      pontos: valores.map((v, k) => ({ data: somarDias(INI, 7 * (k + 1)), liquido: v, resgatavel: v !== null })),
    });
    const series = [serie(0, [101, 102.004, 103]), serie(1, [100, 102.001, 104])];
    expect(trocasDeLider(series)).toEqual([
      { data: somarDias(INI, 14), de: [0], para: [0, 1] },
      { data: somarDias(INI, 21), de: [0, 1], para: [1] },
    ]);
  });

  it('não resgatável não lidera, mesmo com valor de referência maior', () => {
    const series: Serie[] = [
      { ofertaIndice: 0, pontos: [{ data: '2026-10-05', liquido: 200, resgatavel: false }] },
      { ofertaIndice: 1, pontos: [{ data: '2026-10-05', liquido: 100, resgatavel: true }] },
    ];
    expect(lideresNoPonto(series, 0)).toEqual([1]);
  });

  it('sem ofertas resgatáveis → nenhuma troca', () => {
    const series = seriesDeValorLiquido([lci2028], 10000, INI, '2028-06-01', CEN, PADRAO);
    expect(series[0]?.pontos.every((p) => !p.resgatavel)).toBe(true);
    expect(trocasDeLider(series, { ofertas: [lci2028], valor: 10000, dataAplicacao: INI, cen: CEN, regra: PADRAO })).toEqual([]);
    expect(trocasDeLider([])).toEqual([]);
  });

  it('ninguém resgatável no começo: a primeira oferta que fica resgatável é uma troca de [] para ela', () => {
    const ofertas = [lci2028];
    const series = seriesDeValorLiquido(ofertas, 10000, INI, '2029-01-01', CEN, PADRAO);
    // Resgatável só no dia do vencimento: no dia seguinte o dinheiro está na LCI reaplicada, dentro do prazo mínimo.
    expect(trocasDeLider(series, { ofertas, valor: 10000, dataAplicacao: INI, cen: CEN, regra: PADRAO }))
      .toEqual([{ data: '2028-09-28', de: [], para: [0] }, { data: '2028-09-29', de: [0], para: [] }]);
  });
});

/** Primeiro ponto da série na data ou depois dela. */
function seguinteDoPonto(series: readonly Serie[], data: string): string | undefined {
  return series[0]?.pontos.find((p) => p.data >= data)?.data;
}

describe('reaplicação fixa na série (a mesma oferta de reinvestimento depois do vencimento)', () => {
  const cen = cenarioReal('BASE');
  const lci90: OfertaCadastrada = { ...b, id: 'l9', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.9 }, vencimento: '2027-09-28', liquidez: 'NO_VENCIMENTO' };
  const fim = '2028-09-28';
  const [s] = seriesDeValorLiquido([lci90], 10000, INI, fim, cen, PADRAO);
  const pontos = s?.pontos ?? [];
  // A reaplicação em LCI só pode ser resgatada 6 meses depois do vencimento.
  const liberada = '2028-03-28';

  it('entre o vencimento e o fim do prazo mínimo da reaplicação: não resgatável, motivo PRAZO_MINIMO, com valor de referência', () => {
    const carencia = pontos.filter((p) => p.data > '2027-09-28' && p.data < liberada);
    expect(carencia.length).toBeGreaterThan(20);
    for (const p of carencia) {
      expect(p.resgatavel, p.data).toBe(false);
      expect(p.motivo, p.data).toBe('PRAZO_MINIMO');
      expect(p.liquido, p.data).not.toBeNull();
    }
    expect(pontos.find((p) => p.data === '2027-09-28')).toMatchObject({ resgatavel: true });
    expect(pontos.filter((p) => p.data >= liberada).every((p) => p.resgatavel && p.motivo === undefined)).toBe(true);
  });

  it('nenhum salto de categoria: o rendimento diário fica contínuo depois do vencimento (sem CDB no meio)', () => {
    const depois = pontos.filter((p) => p.data >= '2027-09-28');
    const taxas = depois.slice(1).map((p, k) => {
      const anterior = depois[k] as (typeof depois)[number];
      return ((p.liquido as number) / (anterior.liquido as number)) ** (1 / diasCorridos(anterior.data, p.data)) - 1;
    });
    const ordenadas = [...taxas].sort((x, y) => x - y);
    const mediana = ordenadas[Math.floor(ordenadas.length / 2)] as number;
    expect(Math.max(...taxas)).toBeLessThan(mediana * 1.6);
    expect(Math.min(...taxas)).toBeGreaterThanOrEqual(0);
  });

  it('a partir do fim do prazo mínimo, o valor é o da tabela (projetar sem fallback)', () => {
    for (const p of pontos.filter((x) => x.data >= liberada)) {
      const proj = projetar(lci90, 10000, INI, p.data, cen);
      expect(proj.estado === 'DISPONIVEL' && proj.reinvestimento?.fallback, p.data).toBe(false);
      expect(p.liquido).toBe(proj.estado === 'DISPONIVEL' ? proj.liquido : NaN);
    }
  });

  it('a tabela continua usando o fallback em CDB antes do prazo mínimo da reaplicação', () => {
    const proj = projetar(lci90, 10000, INI, '2027-12-28', cen);
    expect(proj.estado === 'DISPONIVEL' && proj.reinvestimento).toMatchObject({ fallback: true });
  });
});

describe('motivo do ponto não resgatável', () => {
  it('só no vencimento, prazo mínimo e marcação a mercado', () => {
    const lciDiaria: OfertaCadastrada = { ...lci2028, id: 'ld', liquidez: 'DIARIA' };
    const [noVenc, prazo, marcacao, diario] = seriesDeValorLiquido([lci2028, lciDiaria, prefixado2029, cdbDiario], 10000, INI, '2027-06-01', CEN, PADRAO);
    expect(noVenc?.pontos.every((p) => p.motivo === 'NO_VENCIMENTO')).toBe(true);
    expect(prazo?.pontos.filter((p) => p.data < '2027-03-28').every((p) => p.motivo === 'PRAZO_MINIMO')).toBe(true);
    expect(prazo?.pontos.filter((p) => p.data >= '2027-03-28').every((p) => p.resgatavel && p.motivo === undefined)).toBe(true);
    expect(marcacao?.pontos.every((p) => p.motivo === 'MARCACAO_A_MERCADO')).toBe(true);
    expect(diario?.pontos.every((p) => !('motivo' in p))).toBe(true);
  });
});

describe('trocas transitórias e poupança', () => {
  const cen = cenarioReal('BASE');
  const poupanca: OfertaCadastrada = { ...b, id: 'p', produto: 'POUPANCA', indexacao: { tipo: 'POUPANCA' }, liquidez: 'DIARIA' };
  const lci = (percentualCDI: number): OfertaCadastrada => ({ ...b, id: `l${percentualCDI}`, produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI }, liquidez: 'DIARIA' });
  const fim = somarDias(INI, 365);

  it('datasDaSerie inclui os aniversários da poupança e a véspera de cada um', () => {
    const datas = datasDaSerie(INI, fim, [poupanca]);
    for (let k = 1; k <= 12; k++) {
      expect(datas, String(k)).toContain(somarMeses(INI, k));
      expect(datas, String(k)).toContain(somarDias(somarMeses(INI, k), -1));
    }
  });

  /** A verdade dia a dia: `projetar` em cada dia, a partir do primeiro ponto da série. */
  function verdade(ofertas: OfertaCadastrada[], inicio: string): TrocaDeLider[] {
    const trocas: TrocaDeLider[] = [];
    let atual = lideres(ofertas.map((o) => projetar(o, 10000, INI, inicio, cen)));
    for (let d = somarDias(inicio, 1); d <= fim; d = somarDias(d, 1)) {
      const novo = lideres(ofertas.map((o) => projetar(o, 10000, INI, d, cen)));
      if (novo.join() !== atual.join()) trocas.push({ data: d, de: atual, para: novo });
      atual = novo;
    }
    return trocas;
  }

  // 74% do CDI (o caso da revisão): no cenário real a LCI fica à frente desde o fim do prazo mínimo. Entre 58% e
  // 64% do CDI a poupança volta a liderar a cada aniversário, e a busca antiga perdia trocas.
  for (const pct of [0.74, 0.64, 0.62, 0.58]) {
    it(`poupança × LCI ${Math.round(pct * 100)}% do CDI, cenário real, 1 ano: trocasDeLider bate com a verdade dia a dia`, () => {
      const ofertas = [poupanca, lci(pct)];
      const series = seriesDeValorLiquido(ofertas, 10000, INI, fim, cen, PADRAO);
      const trocas = trocasDeLider(series, { ofertas, valor: 10000, dataAplicacao: INI, cen, regra: PADRAO });
      expect(trocas).toEqual(verdade(ofertas, series[0]?.pontos[0]?.data ?? ''));
    });
  }

  it('uma terceira oferta que lidera por poucos dias entre dois pontos entra na busca (todas as ofertas, não só as envolvidas)', () => {
    const ofertas = [poupanca, lci(0.62), lci(0.61)];
    const series = seriesDeValorLiquido(ofertas, 10000, INI, fim, cen, PADRAO);
    const trocas = trocasDeLider(series, { ofertas, valor: 10000, dataAplicacao: INI, cen, regra: PADRAO });
    expect(trocas).toEqual(verdade(ofertas, series[0]?.pontos[0]?.data ?? ''));
  });

  // Limite com folga para a CI (medido localmente ~110-170 ms; o runner do GitHub Actions já
  // registrou até 432 ms). Mesmo padrão de folga do teste de desempenho acima.
  it('desempenho: 5 ofertas com poupança e trocas mensais, 5 anos, série + trocas < 1100 ms', () => {
    const ofertas = [poupanca, lci(0.62), lci(0.6), { ...cdbDiario, id: 'c75', indexacao: { tipo: 'POS_CDI' as const, percentualCDI: 0.75 } }, lci(0.58)];
    const t0 = performance.now();
    const series = seriesDeValorLiquido(ofertas, 10000, INI, '2031-09-28', cen, PADRAO);
    const t1 = performance.now();
    const trocas = trocasDeLider(series, { ofertas, valor: 10000, dataAplicacao: INI, cen, regra: PADRAO });
    const t2 = performance.now();
    console.info(`série ${(t1 - t0).toFixed(1)} ms, trocas ${(t2 - t1).toFixed(1)} ms (${trocas.length} trocas)`);
    expect(trocas.length).toBeGreaterThan(10);
    expect(t2 - t0).toBeLessThan(1100);
  });
});

describe('trocasRelevantes', () => {
  const t = (data: string, de: number[], para: number[]): TrocaDeLider => ({ data, de, para });

  it('sem lideranças curtas, as mesmas trocas', () => {
    const trocas = [t('2027-01-01', [0], [1]), t('2027-06-01', [1], [0])];
    expect(trocasRelevantes(trocas, { duracaoMinimaDias: 30 })).toEqual({ trocas });
  });

  it('A longo, B por 1 dia, A longo: some a troca e o trecho de A fica oscilante', () => {
    const trocas = [t('2027-01-01', [0], [1]), t('2027-03-01', [1], [0]), t('2027-03-02', [0], [1])];
    expect(trocasRelevantes(trocas, { duracaoMinimaDias: 30 })).toEqual({
      trocas: [{ data: '2027-01-01', de: [0], para: [1], oscilante: true, alternancias: 2, alternam: [0, 1] }],
    });
  });

  it('liderança curta logo depois do começo: o trecho inicial fica oscilante', () => {
    const trocas = [t('2027-01-01', [0], [1]), t('2027-01-10', [1], [0])];
    expect(trocasRelevantes(trocas, { duracaoMinimaDias: 30 })).toEqual({
      inicial: { oscilante: true, alternancias: 2, alternam: [0, 1] }, trocas: [],
    });
  });

  it('alternância mensal (poupança): funde as mais curtas primeiro, e quem lidera mais tempo fica', () => {
    // 1 lidera ~20 dias, 0 (a poupança) ~10 dias a cada aniversário; no fim, 0 volta por 1 dia.
    const trocas = [
      t('2027-04-07', [0], [1]), t('2027-04-28', [1], [0]), t('2027-05-07', [0], [1]), t('2027-05-28', [1], [0]),
      t('2027-06-09', [0], [1]), t('2027-06-28', [1], [0]), t('2027-07-09', [0], [1]), t('2027-09-28', [1], [0]),
    ];
    expect(trocasRelevantes(trocas, { duracaoMinimaDias: 30, fim: '2027-09-28' })).toEqual({
      trocas: [{ data: '2027-04-07', de: [0], para: [1], oscilante: true, alternancias: 7, alternam: [0, 1] }],
    });
  });

  it('o último trecho curto com um líder novo fica (não é alternância); sem `fim`, o último trecho nunca é curto', () => {
    const trocas = [t('2027-01-01', [0], [1]), t('2029-09-10', [1], [2])];
    expect(trocasRelevantes(trocas, { duracaoMinimaDias: 30, fim: '2029-09-28' })).toEqual({ trocas });
    const volta = [t('2027-01-01', [0], [1]), t('2029-09-10', [1], [0])];
    expect(trocasRelevantes(volta, { duracaoMinimaDias: 30 })).toEqual({ trocas: volta });
  });

  it('liderança curta entre líderes diferentes: fundida no trecho anterior', () => {
    const trocas = [t('2027-01-01', [0], [1]), t('2027-06-01', [1], [2]), t('2027-06-05', [2], [0])];
    expect(trocasRelevantes(trocas, { duracaoMinimaDias: 30 })).toEqual({
      trocas: [
        { data: '2027-01-01', de: [0], para: [1], oscilante: true, alternancias: 1, alternam: [1, 2] },
        { data: '2027-06-05', de: [1], para: [0] },
      ],
    });
  });

  it('sem trocas, nada; duração mínima inválida lança', () => {
    expect(trocasRelevantes([], { duracaoMinimaDias: 30 })).toEqual({ trocas: [] });
    expect(() => trocasRelevantes([], { duracaoMinimaDias: -1 })).toThrow(RangeError);
  });
});

describe('trocasDeLider: contexto e séries', () => {
  it('o contexto precisa ter uma oferta por série', () => {
    const series = seriesDeValorLiquido([cdbDiario, lci2028], 10000, INI, '2027-06-01', CEN, PADRAO);
    expect(() => trocasDeLider(series, { ofertas: [cdbDiario], valor: 10000, dataAplicacao: INI, cen: CEN, regra: PADRAO })).toThrow(RangeError);
  });
});

describe('investigação: CDB 103% só no vencimento (1 ano) × CDB 102,8% diário, cenário real', () => {
  const cen = cenarioReal('BASE');
  const noVencimento: OfertaCadastrada = { ...b, id: 'a', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, vencimento: '2027-09-28', liquidez: 'NO_VENCIMENTO' };
  const diario: OfertaCadastrada = { ...b, id: 'c', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.028 }, liquidez: 'DIARIA' };
  const ofertas = [noVencimento, diario];
  const fim = '2031-09-28';
  const series = seriesDeValorLiquido(ofertas, 10000, INI, fim, cen, PADRAO);
  const trocas = trocasDeLider(series, { ofertas, valor: 10000, dataAplicacao: INI, cen, regra: PADRAO });

  it('A lidera só no dia do vencimento: no dia seguinte a reaplicação paga IOF de 96% e IR de 22,5% sobre 1 dia', () => {
    expect(trocas).toEqual([{ data: '2027-09-28', de: [1], para: [0] }, { data: '2027-09-29', de: [0], para: [1] }]);
    const p = projetar(noVencimento, 10000, INI, '2027-09-29', cen);
    const reaplicacao = p.estado === 'DISPONIVEL' ? p.etapas[1] : undefined;
    expect(reaplicacao).toMatchObject({ diasCorridos: 1, aliquotaIOF: 0.96, aliquotaIR: 0.225 });
  });

  it('nas trocas relevantes, a liderança de 1 dia é fundida: B lidera o período com oscilação', () => {
    expect(trocasRelevantes(trocas, { duracaoMinimaDias: 30, fim })).toEqual({ inicial: { oscilante: true, alternancias: 2, alternam: [0, 1] }, trocas: [] });
  });
});

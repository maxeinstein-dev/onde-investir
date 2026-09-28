import { describe, expect, it } from 'vitest';
import { decidirVencedor, horizontesPadrao, lideres, linhaDoTempo, tabelaPorHorizonte } from '../../src/engine/comparacao';
import type { OfertaCadastrada } from '../../src/engine/ofertas';
import { OfertaInvalidaError } from '../../src/engine/erros';
import { CEN, INI } from './cenarioPadrao';
import { cenarioReal } from './cenarioReal';

const base = { emissor: 'B', conglomerado: 'B', liquidez: 'NO_VENCIMENTO' as const };
const cdb2027: OfertaCadastrada = { ...base, id: '1', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, vencimento: '2027-09-28' };
const lci2028: OfertaCadastrada = { ...base, id: '2', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 }, vencimento: '2028-09-28' };

describe('horizontes', () => {
  it('6m, 1a, 2a, 3a, 5a e a data do usuário, em ordem', () => {
    expect(horizontesPadrao(INI, '2027-12-15').map((h) => [h.rotulo, h.data])).toEqual([
      ['6 meses', '2027-03-28'], ['1 ano', '2027-09-28'], ['Sua data', '2027-12-15'],
      ['2 anos', '2028-09-28'], ['3 anos', '2029-09-28'], ['5 anos', '2031-09-28'],
    ]);
  });
  it('data do usuário igual a um horizonte padrão não duplica', () => {
    expect(horizontesPadrao(INI, '2028-09-28')).toHaveLength(5);
    expect(horizontesPadrao(INI, null)).toHaveLength(5);
  });
});

describe('líderes', () => {
  it('maior líquido em centavos; empate inclui todos; indisponíveis fora', () => {
    expect(lideres([
      { estado: 'DISPONIVEL', liquido: 100.004, etapas: [] },
      { estado: 'DISPONIVEL', liquido: 100.001, etapas: [] },
      { estado: 'INDISPONIVEL', motivo: 'x' },
    ])).toEqual([0, 1]);
    expect(lideres([{ estado: 'INDISPONIVEL', motivo: 'x' }])).toEqual([]);
  });
});

// Portado de tests/engine/comparador.test.ts (o duelo saiu; a regra de empate ficou aqui, ao lado de `lideres`).
describe('decidirVencedor: comparação em centavos arredondados', () => {
  it('100,0051 × 100,0111 arredondam para os mesmos 100,01 → empate', () => {
    expect(decidirVencedor(100.0051, 100.0111)).toBe('EMPATE');
    expect(decidirVencedor(100.0111, 100.0051)).toBe('EMPATE');
  });
  it('centavos diferentes decidem o vencedor', () => {
    expect(decidirVencedor(100.0149, 100.0151)).toBe('B');
    expect(decidirVencedor(100.02, 100.01)).toBe('A');
    expect(decidirVencedor(100, 100)).toBe('EMPATE');
  });
  it('concorda com `lideres`', () => {
    const p = (liquido: number) => ({ estado: 'DISPONIVEL' as const, liquido, etapas: [] });
    expect(lideres([p(100.0051), p(100.0111)])).toEqual([0, 1]);
    expect(lideres([p(100.0149), p(100.0151)])).toEqual([1]);
  });
});

describe('tabelaPorHorizonte', () => {
  it('uma coluna por horizonte, uma projeção por oferta, líderes marcados', () => {
    const t = tabelaPorHorizonte([cdb2027, lci2028], 10000, INI, horizontesPadrao(INI, null), CEN, { tipo: 'PADRAO' });
    expect(t).toHaveLength(5);
    const umAno = t.find((c) => c.rotulo === '1 ano');
    expect(umAno?.projecoes.map((p) => p.estado)).toEqual(['DISPONIVEL', 'INDISPONIVEL']);
    expect(umAno?.lideres).toEqual([0]);
  });
  // Limite folgado para a CI; os limites reais estão nos testes com o cenário projetado, abaixo.
  it('desempenho: 10 ofertas × 6 horizontes < 1500 ms', () => {
    const ofertas = Array.from({ length: 10 }, (_, i) => ({ ...cdb2027, id: String(i), vencimento: `${2027 + (i % 5)}-09-28` }));
    const t0 = performance.now();
    tabelaPorHorizonte(ofertas, 10000, INI, horizontesPadrao(INI, '2030-01-15'), CEN, { tipo: 'PADRAO' });
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe('linhaDoTempo', () => {
  it('um marco por vencimento, em ordem, com ranking em cada um', () => {
    const l = linhaDoTempo([lci2028, cdb2027], 10000, INI, CEN, { tipo: 'PADRAO' });
    expect(l.marcos.map((m) => m.data)).toEqual(['2027-09-28', '2028-09-28']);
    expect(l.marcos[0]?.ofertasQueVencem).toEqual([1]);
    expect(l.marcos[0]?.lideres).toEqual([1]); // só o CDB está disponível em 2027
    expect(l.marcos[1]?.projecoes.every((p) => p.estado === 'DISPONIVEL')).toBe(true);
  });
  it('sem vencimentos → sem marcos', () => {
    expect(linhaDoTempo([{ ...cdb2027, vencimento: undefined, liquidez: 'DIARIA' }], 10000, INI, CEN, { tipo: 'PADRAO' }).marcos).toEqual([]);
  });
});

describe('regra de reinvestimento inválida', () => {
  const invalida = { tipo: 'TAXA_FIXA', taxaAA: Number.NaN } as const;
  const erro = new OfertaInvalidaError('Taxa de reinvestimento inválida');
  it('tabelaPorHorizonte e linhaDoTempo lançam antes de projetar', () => {
    expect(() => tabelaPorHorizonte([cdb2027], 10000, INI, horizontesPadrao(INI, null), CEN, invalida)).toThrow(erro);
    expect(() => linhaDoTempo([cdb2027], 10000, INI, CEN, invalida)).toThrow(erro);
    // mesmo sem nenhuma oferta que chegue a reinvestir
    expect(() => tabelaPorHorizonte([], 10000, INI, horizontesPadrao(INI, null), CEN, invalida)).toThrow(erro);
  });
});

describe('desempenho com o cenário PROJETADO real (fixtures do BCB)', () => {
  const cen = cenarioReal('BASE');
  const b = { emissor: 'B', conglomerado: 'B' };
  const mix: OfertaCadastrada[] = [
    { ...b, id: '1', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.05 }, vencimento: '2027-09-28', liquidez: 'NO_VENCIMENTO' },
    { ...b, id: '2', produto: 'CDB', indexacao: { tipo: 'PRE', taxaAA: 0.14 }, vencimento: '2029-09-28', liquidez: 'NO_VENCIMENTO' },
    { ...b, id: '3', produto: 'CDB', indexacao: { tipo: 'IPCA_MAIS', taxaRealAA: 0.075 }, vencimento: '2031-09-29', liquidez: 'NO_VENCIMENTO' },
    { ...b, id: '4', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.9 }, vencimento: '2028-09-28', liquidez: 'NO_VENCIMENTO' },
    { ...b, id: '5', produto: 'LCA', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.92 }, vencimento: '2028-03-28', liquidez: 'NO_VENCIMENTO' },
    { ...b, id: '6', produto: 'TESOURO_SELIC', indexacao: { tipo: 'SELIC' }, vencimento: '2031-03-01', liquidez: 'DIARIA' },
    { ...b, id: '7', produto: 'TESOURO_PREFIXADO', indexacao: { tipo: 'PRE', taxaAA: 0.135 }, vencimento: '2032-01-01', liquidez: 'DIARIA' },
    { ...b, id: '8', produto: 'TESOURO_IPCA', indexacao: { tipo: 'IPCA_MAIS', taxaRealAA: 0.075 }, vencimento: '2035-05-15', liquidez: 'DIARIA' },
    { ...b, id: '9', produto: 'TESOURO_IPCA', indexacao: { tipo: 'IPCA_MAIS', taxaRealAA: 0.074 }, vencimento: '2033-05-15', liquidez: 'DIARIA' },
    { ...b, id: '10', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.1 }, vencimento: '2030-09-30', liquidez: 'NO_VENCIMENTO' },
  ];
  const ipcaLongos = Array.from({ length: 10 }, (_, i): OfertaCadastrada => ({
    ...b, id: String(i), produto: 'TESOURO_IPCA', indexacao: { tipo: 'IPCA_MAIS', taxaRealAA: 0.07 }, vencimento: `${2030 + 2 * i}-05-15`, liquidez: 'DIARIA',
  }));
  const tempo = (f: () => unknown) => {
    const t0 = performance.now();
    f();
    return performance.now() - t0;
  };
  it('linhaDoTempo com um mix de 10 produtos (vencimentos 2027–2035) < 300 ms', () => {
    expect(tempo(() => linhaDoTempo(mix, 10000, INI, cen, { tipo: 'PADRAO' }))).toBeLessThan(300);
  });
  it('linhaDoTempo com 10 Tesouro IPCA+ (2030–2048) < 800 ms', () => {
    expect(tempo(() => linhaDoTempo(ipcaLongos, 10000, INI, cen, { tipo: 'PADRAO' }))).toBeLessThan(800);
  });
  it('tabela do plano (10 ofertas × 6 horizontes) < 300 ms', () => {
    const ofertas = Array.from({ length: 10 }, (_, i) => ({ ...cdb2027, id: String(i), vencimento: `${2027 + (i % 5)}-09-28` }));
    expect(tempo(() => tabelaPorHorizonte(ofertas, 10000, INI, horizontesPadrao(INI, '2030-01-15'), cen, { tipo: 'PADRAO' }))).toBeLessThan(300);
  });
});

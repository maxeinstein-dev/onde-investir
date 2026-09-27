import { describe, expect, it } from 'vitest';
import { horizontesPadrao, lideres, linhaDoTempo, tabelaPorHorizonte } from '../../src/engine/comparacao';
import type { OfertaCadastrada } from '../../src/engine/ofertas';
import { CEN, INI } from './cenarioPadrao';

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

describe('tabelaPorHorizonte', () => {
  it('uma coluna por horizonte, uma projeção por oferta, líderes marcados', () => {
    const t = tabelaPorHorizonte([cdb2027, lci2028], 10000, INI, horizontesPadrao(INI, null), CEN, { tipo: 'PADRAO' });
    expect(t).toHaveLength(5);
    const umAno = t.find((c) => c.rotulo === '1 ano');
    expect(umAno?.projecoes.map((p) => p.estado)).toEqual(['DISPONIVEL', 'INDISPONIVEL']);
    expect(umAno?.lideres).toEqual([0]);
  });
  // Limite folgado para a CI; se passar de ~300 ms localmente, otimizar o acúmulo diário
  // (pré-calcular os dias úteis) antes do Lote C.
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

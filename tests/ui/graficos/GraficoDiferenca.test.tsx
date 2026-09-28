// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { paraDia } from '../../../src/engine/datas';
import type { OfertaCadastrada } from '../../../src/engine/ofertas';
import type { Serie } from '../../../src/engine/serie';
import { TRACEJADO } from '../../../src/ui/graficos/cores';
import { diferencaEntre, trechosDaDiferenca } from '../../../src/ui/graficos/diferenca';
import { GraficoDiferenca } from '../../../src/ui/graficos/GraficoDiferenca';
import { graficos } from './mockChart';

vi.mock('chart.js', () => import('./mockChart'));
vi.mock('chartjs-plugin-annotation', () => ({ default: { id: 'annotation' } }));

afterEach(() => {
  cleanup();
  graficos.length = 0;
});

const base = { conglomerado: 'G', liquidez: 'DIARIA' as const, produto: 'CDB' as const };
const oferta = (id: string, pct: number): OfertaCadastrada => ({ ...base, id, emissor: `Banco ${id}`, indexacao: { tipo: 'POS_CDI', percentualCDI: pct } });
const OFERTAS = [oferta('X', 1.1), oferta('Y', 1.0), oferta('Z', 0.9)];
const DATAS = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'] as const;
const serie = (ofertaIndice: number, valores: (number | null)[], resgatavel = [true, true, true, true]): Serie => ({
  ofertaIndice, pontos: DATAS.map((data, k) => ({ data, liquido: valores[k] ?? null, resgatavel: resgatavel[k] ?? true })),
});
// A começa atrás de B e passa à frente em 19/10; C fica sempre atrás e não resgata no começo.
const SERIES = [
  serie(0, [100, 110, 130, 140]),
  serie(1, [105, 115, 120, 125]),
  serie(2, [null, 90, 95, 100], [false, false, true, true]),
];

type Anotacao = { type: string; xMin?: number; yMin?: number; yMax?: number; label?: { content?: string } };
const ultimo = () => graficos.at(-1) as (typeof graficos)[number];
const anotacoes = () => Object.values((ultimo().config.options?.plugins as { annotation: { annotations: Record<string, Anotacao> } }).annotation.annotations);
const dataset = () => ultimo().config.data.datasets[0] as (typeof graficos)[number]['config']['data']['datasets'][number];

describe('diferença entre duas séries', () => {
  it('ponto a ponto, nula onde falta um dos valores, e não resgatável se uma das duas não for', () => {
    expect(diferencaEntre(SERIES[0] as Serie, SERIES[2] as Serie)).toEqual([
      { data: DATAS[0], diferenca: null, resgatavel: false },
      { data: DATAS[1], diferenca: 20, resgatavel: false },
      { data: DATAS[2], diferenca: 35, resgatavel: true },
      { data: DATAS[3], diferenca: 40, resgatavel: true },
    ]);
  });
  it('os trechos: quem está à frente desde cada data, em centavos', () => {
    expect(trechosDaDiferenca(diferencaEntre(SERIES[0] as Serie, SERIES[1] as Serie)))
      .toEqual([{ data: DATAS[0], frente: 'B' }, { data: DATAS[2], frente: 'A' }]);
    expect(trechosDaDiferenca([{ data: DATAS[0], diferenca: 0.004, resgatavel: true }, { data: DATAS[1], diferenca: 1, resgatavel: true }]))
      .toEqual([{ data: DATAS[0], frente: 'EMPATE' }, { data: DATAS[1], frente: 'A' }]);
    expect(trechosDaDiferenca([{ data: DATAS[0], diferenca: null, resgatavel: false }])).toEqual([]);
  });
});

describe('GraficoDiferenca', () => {
  it('seletores "Comparar A com B", com as ofertas da comparação; o padrão é A com B', () => {
    render(<GraficoDiferenca series={SERIES} ofertas={OFERTAS} />);
    const a = screen.getByLabelText('Comparar') as HTMLSelectElement;
    const b = screen.getByLabelText('com') as HTMLSelectElement;
    expect([...a.options].map((o) => o.textContent)).toEqual(['A: CDB 110% do CDI (Banco X)', 'B: CDB 100% do CDI (Banco Y)', 'C: CDB 90% do CDI (Banco Z)']);
    expect([a.value, b.value]).toEqual(['0', '1']);
    expect(a.id).toMatch(/^grafico-diferenca-/);
  });

  it('a linha A − B, com o zero destacado e as trocas de sinal anotadas', () => {
    render(<GraficoDiferenca series={SERIES} ofertas={OFERTAS} />);
    expect(dataset().label).toBe('A − B');
    expect(dataset().data).toEqual(DATAS.map((d, k) => ({ x: paraDia(d), y: [-5, -5, 10, 15][k] })));
    expect(anotacoes().find((x) => x.type === 'line' && x.yMin === 0)).toMatchObject({ yMax: 0 });
    const trocas = anotacoes().filter((x) => x.xMin !== undefined);
    expect(trocas).toEqual([expect.objectContaining({ xMin: paraDia(DATAS[2]), label: expect.objectContaining({ content: 'A à frente' }) })]);
    // O eixo y sempre mostra o zero.
    expect(ultimo().config.options?.scales?.y).toMatchObject({ suggestedMin: 0, suggestedMax: 0 });
  });

  it('resumo no aria-label e em texto visível', () => {
    render(<GraficoDiferenca series={SERIES} ofertas={OFERTAS} />);
    const resumo = 'CDB 100% do CDI (Banco Y) fica à frente até 18/10/2026; depois CDB 110% do CDI (Banco X).';
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', resumo);
    expect(screen.getByText(resumo)).toBeVisible();
  });

  it('trocar a oferta refaz o gráfico e destrói o anterior; tracejado onde uma delas não resgata', () => {
    const { unmount } = render(<GraficoDiferenca series={SERIES} ofertas={OFERTAS} />);
    const primeiro = ultimo();
    fireEvent.change(screen.getByLabelText('com'), { target: { value: '2' } });
    expect(primeiro.destroy).toHaveBeenCalledTimes(1);
    expect(dataset().label).toBe('A − C');
    const borda = (dataset().segment as { borderDash: (ctx: { p0DataIndex: number; p1DataIndex: number }) => number[] | undefined }).borderDash;
    expect(borda({ p0DataIndex: 1, p1DataIndex: 2 })).toEqual(TRACEJADO);
    expect(borda({ p0DataIndex: 2, p1DataIndex: 3 })).toBeUndefined();
    const cb = ultimo().config.options?.plugins?.tooltip?.callbacks as { label: (i: { dataIndex: number; parsed: { y: number } }) => string };
    expect(cb.label({ dataIndex: 1, parsed: { y: 20 } })).toMatch(/^A − C: R\$\s20,00 \(valor de referência\)$/);
    unmount();
    expect(ultimo().destroy).toHaveBeenCalledTimes(1);
  });

  it('escolher em A a oferta que está em B troca as duas de lugar', () => {
    render(<GraficoDiferenca series={SERIES} ofertas={OFERTAS} />);
    fireEvent.change(screen.getByLabelText('Comparar'), { target: { value: '1' } });
    expect((screen.getByLabelText('Comparar') as HTMLSelectElement).value).toBe('1');
    expect((screen.getByLabelText('com') as HTMLSelectElement).value).toBe('0');
    expect(dataset().label).toBe('B − A');
  });

  it('se a escolha deixar de existir (menos ofertas), volta para A com B', () => {
    const { rerender } = render(<GraficoDiferenca series={SERIES} ofertas={OFERTAS} />);
    fireEvent.change(screen.getByLabelText('com'), { target: { value: '2' } });
    rerender(<GraficoDiferenca series={SERIES.slice(0, 2)} ofertas={OFERTAS.slice(0, 2)} />);
    expect((screen.getByLabelText('com') as HTMLSelectElement).value).toBe('1');
    expect(dataset().label).toBe('A − B');
  });
});

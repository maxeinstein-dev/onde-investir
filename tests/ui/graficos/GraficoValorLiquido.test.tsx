// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resumirTrocas } from '../../../src/conteudo/serie';
import { paraDia } from '../../../src/engine/datas';
import type { OfertaCadastrada } from '../../../src/engine/ofertas';
import type { Serie, TrocaDeLider } from '../../../src/engine/serie';
import { TRACEJADO } from '../../../src/ui/graficos/cores';
import { GraficoValorLiquido } from '../../../src/ui/graficos/GraficoValorLiquido';
import { graficos } from './mockChart';

vi.mock('chart.js', () => import('./mockChart'));
vi.mock('chartjs-plugin-annotation', () => ({ default: { id: 'annotation' } }));

afterEach(() => {
  cleanup();
  graficos.length = 0;
});

const base = { conglomerado: 'G' };
const cdb: OfertaCadastrada = { ...base, id: 'x', emissor: 'Banco X', liquidez: 'DIARIA', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 } };
const lci: OfertaCadastrada = { ...base, id: 'y', emissor: 'Banco Y', liquidez: 'NO_VENCIMENTO', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.95 }, vencimento: '2027-01-04' };
const OFERTAS = [cdb, lci];
const [D1, D2, D3, D4] = ['2026-10-05', '2026-10-12', '2027-01-04', '2027-01-05'] as const;

const SERIES: Serie[] = [
  { ofertaIndice: 0, pontos: [
    { data: D1, liquido: 10010, resgatavel: true }, { data: D2, liquido: 10020, resgatavel: true },
    { data: D3, liquido: 10100, resgatavel: true }, { data: D4, liquido: 10101, resgatavel: true },
  ] },
  { ofertaIndice: 1, pontos: [
    { data: D1, liquido: null, resgatavel: false }, { data: D2, liquido: 10015, resgatavel: false, motivo: 'NO_VENCIMENTO' },
    { data: D3, liquido: 10150, resgatavel: true }, { data: D4, liquido: 10152, resgatavel: true },
  ] },
];
const TROCAS: TrocaDeLider[] = [{ data: D3, de: [0], para: [1] }];

type Anotacao = { type: string; xMin?: number; xMax?: number; label?: { content?: string } };
/** O Chart.js vem por import dinâmico: espera o gráfico ser criado. */
const carregou = (n = 1) => waitFor(() => expect(graficos.length).toBeGreaterThanOrEqual(n));
const ultimo = () => graficos.at(-1) as (typeof graficos)[number];
const anotacoes = () => Object.values((ultimo().config.options?.plugins as { annotation: { annotations: Record<string, Anotacao> } }).annotation.annotations);
const dataset = (i: number) => ultimo().config.data.datasets[i] as (typeof graficos)[number]['config']['data']['datasets'][number];

function montar(props: Partial<Parameters<typeof GraficoValorLiquido>[0]> = {}) {
  return render(<GraficoValorLiquido series={SERIES} trocas={TROCAS} ofertas={OFERTAS} inicioPremissa={D3} {...props} />);
}

describe('GraficoValorLiquido', () => {
  it('uma linha por oferta, com a letra e o nome na legenda, em dias desde a época', async () => {
    montar();
    await carregou();
    expect(graficos).toHaveLength(1);
    expect(ultimo().config.type).toBe('line');
    expect(dataset(0).label).toBe('A: CDB 103% do CDI (Banco X)');
    expect(dataset(1).label).toBe('B: LCI 95% do CDI (Banco Y)');
    expect(dataset(1).data).toEqual([
      { x: paraDia(D1), y: null }, { x: paraDia(D2), y: 10015 }, { x: paraDia(D3), y: 10150 }, { x: paraDia(D4), y: 10152 },
    ]);
    // Cor e forma do ponto diferentes por série.
    expect(dataset(0).borderColor).not.toBe(dataset(1).borderColor);
    expect(dataset(0).pointStyle).not.toBe(dataset(1).pointStyle);
    expect(ultimo().config.options?.scales?.x?.type).toBe('linear');
  });

  it('os trechos não resgatáveis ficam tracejados', async () => {
    montar();
    await carregou();
    const tracejado = (i: number, p0: number) =>
      ((dataset(i).segment as { borderDash: unknown }).borderDash as (ctx: { p0DataIndex: number; p1DataIndex: number }) => number[] | undefined)({ p0DataIndex: p0, p1DataIndex: p0 + 1 });
    expect(tracejado(0, 0)).toBeUndefined();
    expect(tracejado(1, 1)).toEqual(TRACEJADO);
    expect(tracejado(1, 2)).toBeUndefined();
  });

  it('anota as trocas de líder e a faixa da premissa', async () => {
    montar();
    await carregou();
    const linhas = anotacoes().filter((a) => a.type === 'line');
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ xMin: paraDia(D3), xMax: paraDia(D3), label: { content: 'B passa a liderar' } });
    const faixa = anotacoes().find((a) => a.type === 'box');
    expect(faixa).toMatchObject({ xMin: paraDia(D3), xMax: paraDia(D4), label: { content: 'premissa' } });
  });

  it('sem início de premissa dentro do período, sem faixa', async () => {
    montar({ inicioPremissa: '2030-01-01' });
    await carregou();
    expect(anotacoes().some((a) => a.type === 'box')).toBe(false);
    cleanup();
    montar({ inicioPremissa: undefined });
    await carregou();
    expect(anotacoes().some((a) => a.type === 'box')).toBe(false);
  });

  it('tooltip: a data, o líquido e, quando não resgatável, o motivo', async () => {
    montar();
    await carregou();
    const cb = ultimo().config.options?.plugins?.tooltip?.callbacks as {
      title: (itens: { parsed: { x: number } }[]) => string;
      label: (item: { datasetIndex: number; dataIndex: number; parsed: { y: number } }) => string;
    };
    expect(cb.title([{ parsed: { x: paraDia(D2) } }])).toBe('12/10/2026');
    expect(cb.label({ datasetIndex: 1, dataIndex: 1, parsed: { y: 10015 } })).toMatch(/^B: R\$\s10\.015,00 \(só no vencimento\)$/);
    expect(cb.label({ datasetIndex: 0, dataIndex: 1, parsed: { y: 10020 } })).toMatch(/^A: R\$\s10\.020,00$/);
  });

  it('tooltip: o motivo vem do ponto, sem recalcular pela oferta; no Tesouro Prefixado, a curva contratada', async () => {
    const prefixado: OfertaCadastrada = { ...base, id: 'z', emissor: 'Tesouro', liquidez: 'DIARIA', produto: 'TESOURO_PREFIXADO', indexacao: { tipo: 'PRE', taxaAA: 0.13 }, vencimento: '2030-01-01' };
    const series: Serie[] = [
      // A LCI "só no vencimento" já venceu e está na reaplicação, dentro do prazo mínimo.
      { ofertaIndice: 0, pontos: [{ data: D1, liquido: 10010, resgatavel: false, motivo: 'PRAZO_MINIMO' }] },
      { ofertaIndice: 1, pontos: [{ data: D1, liquido: 10020, resgatavel: false, motivo: 'MARCACAO_A_MERCADO' }] },
    ];
    render(<GraficoValorLiquido series={series} trocas={[]} ofertas={[lci, prefixado]} />);
    await carregou();
    const cb = ultimo().config.options?.plugins?.tooltip?.callbacks as { label: (item: { datasetIndex: number; dataIndex: number; parsed: { y: number } }) => string };
    expect(cb.label({ datasetIndex: 0, dataIndex: 0, parsed: { y: 10010 } })).toMatch(/^A: R\$\s10\.010,00 \(prazo mínimo\)$/);
    expect(cb.label({ datasetIndex: 1, dataIndex: 0, parsed: { y: 10020 } })).toMatch(/^B: R\$\s10\.020,00 \(valor na curva contratada\)$/);
  });

  it('a dica explica o tracejado, inclusive no Tesouro', async () => {
    montar();
    await carregou();
    expect(screen.getByText(/Linha tracejada/)).toHaveTextContent(/Tesouro Prefixado/);
  });

  it('figure com figcaption; o canvas tem role="img" e o resumo das trocas no aria-label e em texto visível', async () => {
    montar();
    await carregou();
    const resumo = resumirTrocas(TROCAS, OFERTAS, [0]);
    const img = screen.getByRole('img');
    expect(img.tagName).toBe('CANVAS');
    expect(img).toHaveAttribute('aria-label', resumo.join(' '));
    expect(img.closest('figure')?.querySelector('figcaption')).toHaveTextContent('Valor líquido ao longo do tempo');
    for (const frase of resumo) expect(screen.getByText(frase)).toBeVisible();
  });

  it('destrói o gráfico ao desmontar e ao trocar os dados', async () => {
    const { rerender, unmount } = montar();
    await carregou();
    const primeiro = ultimo();
    rerender(<GraficoValorLiquido series={SERIES} trocas={TROCAS} ofertas={OFERTAS} inicioPremissa={D3} />);
    expect(graficos).toHaveLength(1);
    expect(primeiro.destroy).not.toHaveBeenCalled();
    rerender(<GraficoValorLiquido series={SERIES} trocas={[]} ofertas={OFERTAS} inicioPremissa={D3} />);
    expect(primeiro.destroy).toHaveBeenCalledTimes(1);
    expect(graficos).toHaveLength(2);
    unmount();
    expect(ultimo().destroy).toHaveBeenCalledTimes(1);
  });
});

describe('GraficoValorLiquido com trocas relevantes', () => {
  it('o resumo cita a oscilação do trecho do começo', async () => {
    montar({ trocas: [], oscilacaoInicial: { oscilante: true, alternancias: 2, alternam: [0, 1] } });
    await carregou();
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/quase o tempo todo e alterna outras 2 vezes\.$/);
  });
  it('trecho oscilante: a linha vertical fica, e o resumo diz que alterna', async () => {
    montar({ trocas: [{ data: D3, de: [0], para: [1], oscilante: true, alternancias: 3, alternam: [0, 1] }] });
    await carregou();
    expect(anotacoes().filter((a) => a.type === 'line')).toHaveLength(1);
    expect(screen.getByText(/passa a liderar e alterna outras 3 vezes\.$/)).toBeVisible();
  });
});

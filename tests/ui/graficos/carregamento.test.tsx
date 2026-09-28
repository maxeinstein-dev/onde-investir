// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OfertaCadastrada } from '../../../src/engine/ofertas';
import type { Serie } from '../../../src/engine/serie';
import { GraficoValorLiquido } from '../../../src/ui/graficos/GraficoValorLiquido';
import { graficos } from './mockChart';

vi.mock('chart.js', () => import('./mockChart'));
vi.mock('chartjs-plugin-annotation', () => ({ default: { id: 'annotation' } }));

afterEach(() => {
  cleanup();
  graficos.length = 0;
});

const cdb: OfertaCadastrada = { id: 'x', emissor: 'Banco X', conglomerado: 'G', liquidez: 'DIARIA', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 } };
const SERIES: Serie[] = [{ ofertaIndice: 0, pontos: [{ data: '2026-10-05', liquido: 10010, resgatavel: true }] }];

describe('Chart.js sob demanda', () => {
  it('enquanto carrega: "Carregando gráfico…" dentro da figura, com aria-busy; depois some', async () => {
    render(<GraficoValorLiquido series={SERIES} trocas={[]} ofertas={[cdb]} />);
    const figura = screen.getByRole('figure');
    expect(figura).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Carregando gráfico…').closest('figure')).toBe(figura);
    expect(graficos).toHaveLength(0);
    await waitFor(() => expect(graficos).toHaveLength(1));
    expect(figura).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByText('Carregando gráfico…')).toBeNull();
  });
});

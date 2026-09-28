// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OfertaCadastrada } from '../../../src/engine/ofertas';
import type { Serie } from '../../../src/engine/serie';

vi.mock('chart.js', () => import('./mockChart'));
vi.mock('chartjs-plugin-annotation', () => ({ default: { id: 'annotation' } }));

const ERRO = 'Não deu para carregar o gráfico. A tabela acima e o resumo abaixo têm os principais dados.';
const cdb: OfertaCadastrada = { id: 'x', emissor: 'Banco X', conglomerado: 'G', liquidez: 'DIARIA', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 } };
const serie = (liquido: number): Serie[] => [{ ofertaIndice: 0, pontos: [{ data: '2026-10-05', liquido, resgatavel: true }] }];

/**
 * Módulos novos a cada teste (o Chart.js carregado fica guardado no módulo), com o primeiro import do chunk
 * falhando, como numa queda de rede ou num chunk apagado por um deploy novo.
 */
async function comRedeFalhandoUmaVez() {
  vi.resetModules();
  const { importador } = await import('../../../src/ui/graficos/useGrafico');
  vi.spyOn(importador, 'chart').mockRejectedValueOnce(new Error('falha de rede'));
  const { GraficoValorLiquido } = await import('../../../src/ui/graficos/GraficoValorLiquido');
  // Os gráficos criados, pelo mesmo módulo que o componente recebe no lugar do Chart.js.
  const { graficos } = (await import('chart.js')) as unknown as typeof import('./mockChart');
  return { GraficoValorLiquido, graficos };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Chart.js que falhou ao carregar', () => {
  it('o botão "Tentar de novo" dentro do aviso carrega o gráfico', async () => {
    const { GraficoValorLiquido, graficos } = await comRedeFalhandoUmaVez();
    render(<GraficoValorLiquido series={serie(10010)} trocas={[]} ofertas={[cdb]} />);
    const aviso = await screen.findByText(ERRO);
    const botao = screen.getByRole('button', { name: 'Tentar de novo' });
    expect(aviso.closest('.grafico__aviso')?.contains(botao)).toBe(true);
    fireEvent.click(botao);
    await waitFor(() => expect(graficos).toHaveLength(1));
    expect(screen.queryByText(ERRO)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull();
    expect(screen.getByRole('img')).toBeVisible();
  });

  it('com dados novos (as deps mudam), o erro é zerado e tenta de novo sozinho', async () => {
    const { GraficoValorLiquido, graficos } = await comRedeFalhandoUmaVez();
    const { rerender } = render(<GraficoValorLiquido series={serie(10010)} trocas={[]} ofertas={[cdb]} />);
    await screen.findByText(ERRO);
    rerender(<GraficoValorLiquido series={serie(10020)} trocas={[]} ofertas={[cdb]} />);
    await waitFor(() => expect(graficos).toHaveLength(1));
    expect(screen.queryByText(ERRO)).toBeNull();
  });
});

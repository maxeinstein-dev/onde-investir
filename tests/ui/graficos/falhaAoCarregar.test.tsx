// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OfertaCadastrada } from '../../../src/engine/ofertas';
import type { Serie } from '../../../src/engine/serie';
import { GraficoDiferenca } from '../../../src/ui/graficos/GraficoDiferenca';
import { GraficoValorLiquido } from '../../../src/ui/graficos/GraficoValorLiquido';

// O import dinâmico do Chart.js falha (rede, chunk apagado por um deploy novo...).
vi.mock('chart.js', () => {
  throw new Error('falha de rede');
});
vi.mock('chartjs-plugin-annotation', () => ({ default: { id: 'annotation' } }));

afterEach(cleanup);

const oferta = (id: string): OfertaCadastrada => ({ id, emissor: `Banco ${id}`, conglomerado: 'G', liquidez: 'DIARIA', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 } });
const serie = (ofertaIndice: number): Serie => ({ ofertaIndice, pontos: [{ data: '2026-10-05', liquido: 10010 + ofertaIndice, resgatavel: true }] });

describe('Chart.js que não carrega', () => {
  it('mostra o aviso com a tabela como alternativa e não quebra: o resumo continua', async () => {
    render(<div>
      <GraficoValorLiquido series={[serie(0), serie(1)]} trocas={[]} ofertas={[oferta('X'), oferta('Y')]} />
      <GraficoDiferenca series={[serie(0), serie(1)]} ofertas={[oferta('X'), oferta('Y')]} />
    </div>);
    const avisos = await screen.findAllByText('Não deu para carregar o gráfico. A tabela acima tem os mesmos dados.');
    expect(avisos).toHaveLength(2);
    for (const figura of screen.getAllByRole('figure')) expect(figura).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByText('Carregando gráfico…')).toBeNull();
    expect(screen.getByText(/lidera o tempo todo\.$/)).toBeVisible();
  });
});

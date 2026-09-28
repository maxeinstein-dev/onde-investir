// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { descreverFatia } from '../../../src/conteudo/sugestao';
import type { Fatia } from '../../../src/engine/sugestao';
import { GraficoObjetivo } from '../../../src/ui/graficos/GraficoObjetivo';
import { graficos } from './mockChartPizza';

vi.mock('chart.js', () => import('./mockChartPizza'));

afterEach(() => {
  cleanup();
  graficos.length = 0;
});

const FATIAS: Fatia[] = [
  { produto: 'TESOURO_SELIC', indexacaoTipo: 'SELIC', percentual: 0.5, motivo: 'RESERVA_TESOURO_SELIC', garantia: 'TESOURO_NACIONAL', valor: 6000 },
  { produto: 'CDB', indexacaoTipo: 'POS_CDI', percentual: 0.5, motivo: 'RESERVA_CDB_LIQUIDEZ', garantia: 'FGC', valor: 6000 },
];

const ERRO = 'Não deu para carregar o gráfico. A tabela acima e o resumo abaixo têm os principais dados.';

const carregou = (n = 1) => waitFor(() => expect(graficos.length).toBeGreaterThanOrEqual(n));
const ultimo = () => graficos.at(-1) as (typeof graficos)[number];

function montar(props: Partial<Parameters<typeof GraficoObjetivo>[0]> = {}) {
  return render(<GraficoObjetivo fatias={FATIAS} {...props} />);
}

describe('GraficoObjetivo', () => {
  it('a config tem um dataset com os percentuais e os rótulos de descreverFatia', async () => {
    montar();
    await carregou();
    expect(ultimo().config.data.labels).toEqual(FATIAS.map((f) => descreverFatia(f)));
    expect(ultimo().config.data.datasets[0]?.data).toEqual(FATIAS.map((f) => f.percentual));
  });

  it('enquanto carrega, mostra o aviso e não monta o gráfico', async () => {
    // Módulo novo, sem o chunk já em cache (o cache do módulo é o que faz os outros testes verem o gráfico
    // pronto de cara): aqui o import fica pendente de propósito, para capturar o estado "carregando".
    vi.resetModules();
    let resolver: (() => void) | undefined;
    const { importador } = await import('../../../src/ui/graficos/useGraficoPizza');
    vi.spyOn(importador, 'chartPizza').mockReturnValueOnce(new Promise((r) => { resolver = () => r(import('../../../src/ui/graficos/chartPizza')); }));
    const { GraficoObjetivo: Componente } = await import('../../../src/ui/graficos/GraficoObjetivo');
    const { graficos: graficosCarregando } = (await import('chart.js')) as unknown as typeof import('./mockChartPizza');
    render(<Componente fatias={FATIAS} />);
    expect(screen.getByText('Carregando gráfico…')).toBeVisible();
    expect(graficosCarregando).toHaveLength(0);
    resolver?.();
    vi.restoreAllMocks();
  });

  it('falha no import mostra "Tentar de novo", e o clique refaz a tentativa', async () => {
    vi.resetModules();
    const { importador } = await import('../../../src/ui/graficos/useGraficoPizza');
    vi.spyOn(importador, 'chartPizza').mockRejectedValueOnce(new Error('falha de rede'));
    const { GraficoObjetivo: Componente } = await import('../../../src/ui/graficos/GraficoObjetivo');
    const { graficos: graficosFalha } = (await import('chart.js')) as unknown as typeof import('./mockChartPizza');
    render(<Componente fatias={FATIAS} />);
    const aviso = await screen.findByText(ERRO);
    const botao = screen.getByRole('button', { name: 'Tentar de novo' });
    expect(aviso.closest('.grafico__aviso')?.contains(botao)).toBe(true);
    fireEvent.click(botao);
    await waitFor(() => expect(graficosFalha).toHaveLength(1));
    expect(screen.queryByText(ERRO)).toBeNull();
    vi.restoreAllMocks();
    graficosFalha.length = 0;
  });

  it('destrói o gráfico ao desmontar e ao trocar as fatias', async () => {
    const { rerender, unmount } = montar();
    await carregou();
    const primeiro = ultimo();
    rerender(<GraficoObjetivo fatias={FATIAS} />);
    expect(graficos).toHaveLength(1);
    expect(primeiro.destroy).not.toHaveBeenCalled();
    const outras: Fatia[] = [{ ...FATIAS[0] as Fatia, percentual: 1 }];
    rerender(<GraficoObjetivo fatias={outras} />);
    expect(primeiro.destroy).toHaveBeenCalledTimes(1);
    expect(graficos).toHaveLength(2);
    unmount();
    expect(ultimo().destroy).toHaveBeenCalledTimes(1);
  });

  it('figure com figcaption; o canvas tem role="img" com nome pelo resumo (aria-labelledby); a legenda lista cada fatia', async () => {
    montar();
    await carregou();
    const img = screen.getByRole('img');
    expect(img.tagName).toBe('CANVAS');
    expect(img).not.toHaveAttribute('aria-label');
    expect(img.closest('figure')?.querySelector('figcaption')).toBeTruthy();
    const idResumo = img.getAttribute('aria-labelledby');
    expect(idResumo).toBeTruthy();
    const resumo = document.getElementById(idResumo ?? '');
    expect(resumo).toHaveClass('grafico__resumo');
    expect(img).toHaveAccessibleName(resumo?.textContent ?? '');
    expect(resumo?.textContent).toMatch(/50%.*Tesouro Selic/);
    expect(resumo?.textContent).toMatch(/50%.*CDB pós-fixado \(CDI\)/);
    const legenda = screen.getByRole('list');
    const itens = within(legenda).getAllByRole('listitem');
    expect(itens).toHaveLength(2);
    expect(itens[0]?.textContent).toMatch(/Tesouro Selic/);
    expect(itens[0]?.textContent).toMatch(/50%/);
  });
});

// @vitest-environment jsdom
// A aba Carteira oculta não recalcula o resumo quando nada dela mudou (M3a, item 8).
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAVE_POSICOES } from '../../../src/armazenamento/posicoes';
import { App } from '../../../src/ui/App';
import * as resumo from '../../../src/ui/carteira/resumo';

vi.mock('chart.js', () => import('../graficos/mockChart'));
vi.mock('chartjs-plugin-annotation', () => ({ default: { id: 'annotation' } }));
vi.mock('../../../src/ui/carteira/resumo', async (original) => {
  const real = await original<typeof import('../../../src/ui/carteira/resumo')>();
  return { ...real, resumirCarteira: vi.fn(real.resumirCarteira) };
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-28T12:00:00-03:00'));
  localStorage.clear();
  history.replaceState(null, '', '/');
  // Sem rede: indicadores e histórico falham, e os valores saem pelo cenário manual.
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Carteira oculta', () => {
  it('trocar entre as outras abas e digitar na comparação não recalcula o resumo da carteira', async () => {
    localStorage.setItem(CHAVE_POSICOES, JSON.stringify([{
      id: 'p-1', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 }, emissor: 'Banco X', conglomerado: 'Grupo X',
      liquidez: 'DIARIA', valorAplicado: 10_000, dataAplicacao: '2025-01-02', eventos: [],
    }]));
    render(<App />);
    const carteira = document.getElementById('painel-carteira') as HTMLElement;
    await waitFor(() => expect(within(carteira).getAllByRole('status', { hidden: true })[0]).toHaveTextContent('Não deu para buscar o histórico'));
    await waitFor(() => expect(screen.queryByText(/Enquanto os indicadores carregam/)).toBeNull());
    const chamadas = vi.mocked(resumo.resumirCarteira).mock.calls.length;
    expect(chamadas).toBeGreaterThan(0);
    // Trocar de aba renderiza o App inteiro de novo, com a Carteira oculta e nada dela mudado.
    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Comparar' }));
    const valor = within(screen.getByRole('tabpanel')).getByLabelText('Valor (R$)');
    for (const v of ['1', '12', '123', '1234']) fireEvent.input(valor, { target: { value: v } });
    expect(vi.mocked(resumo.resumirCarteira).mock.calls.length).toBe(chamadas);
  });
});

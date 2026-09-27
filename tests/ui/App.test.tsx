// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAVE_OFERTAS } from '../../src/armazenamento/ofertas';
import { CHAVE_PREFERENCIAS } from '../../src/armazenamento/preferencias';
import {
  urlCalendarioCopom, urlFocusAnuais, urlFocusIpcaMensal, urlFocusSelic, urlSgsUltimos,
} from '../../src/dados/bcb';
import { App } from '../../src/ui/App';
import copom from '../fixtures/bcb/copom.json';
import focusAnuais from '../fixtures/bcb/focus-anuais.json';
import focusIpcaMensal from '../fixtures/bcb/focus-ipca-mensal.json';
import focusSelic from '../fixtures/bcb/focus-selic.json';
import sgs226 from '../fixtures/bcb/sgs-226.json';
import sgs432 from '../fixtures/bcb/sgs-432.json';
import sgs433 from '../fixtures/bcb/sgs-433.json';
import sgs4389 from '../fixtures/bcb/sgs-4389.json';

const RESPOSTAS = new Map<string, unknown>([
  [urlSgsUltimos(432, 1), sgs432],
  [urlSgsUltimos(4389, 1), sgs4389],
  [urlSgsUltimos(433, 12), sgs433],
  [urlSgsUltimos(226, 1), sgs226],
  [urlFocusSelic(), focusSelic],
  [urlFocusIpcaMensal(), focusIpcaMensal],
  [urlFocusAnuais(), focusAnuais],
  [urlCalendarioCopom('2026-01-01', '2028-12-31'), copom],
]);

/** `fetch` falso com as fixtures do BCB; nenhum teste chama a rede. */
const fetchFixtures = vi.fn(async (url: string) => {
  const corpo = RESPOSTAS.get(url);
  return corpo === undefined
    ? { ok: false, status: 404, json: async () => null }
    : { ok: true, status: 200, json: async () => structuredClone(corpo) };
});
const fetchForaDoAr = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-27T12:00:00-03:00'));
  localStorage.clear();
  history.replaceState(null, '', '/');
  fetchFixtures.mockClear();
  fetchForaDoAr.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const painel = () => screen.getByRole('region', { name: 'Indicadores e cenário' });
const aba = (nome: string) => screen.getByRole('tab', { name: nome });

describe('App', () => {
  it('abre em "Comparar ofertas"', () => {
    vi.stubGlobal('fetch', fetchForaDoAr);
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Rende' })).toBeInTheDocument();
    expect(screen.getByText(/não é recomendação de investimento/)).toBeInTheDocument();
    expect(aba('Comparar ofertas')).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByRole('tabpanel')).getByRole('heading', { name: 'Minhas ofertas' })).toBeInTheDocument();
  });
  it('clicar em "Duelo rápido" muda o hash e a aba', () => {
    vi.stubGlobal('fetch', fetchForaDoAr);
    render(<App />);
    fireEvent.click(aba('Duelo rápido'));
    expect(location.hash).toBe('#duelo');
    expect(aba('Duelo rápido')).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByRole('tabpanel')).getByRole('button', { name: 'Comparar' })).toBeInTheDocument();
  });
  it('mostra que está buscando os indicadores enquanto carrega', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<App />);
    expect(within(painel()).getByText('Buscando indicadores no Banco Central…')).toHaveAttribute('aria-live', 'polite');
  });
  it('com fetch rejeitando, mostra o aviso de cenário manual e o duelo funciona', async () => {
    vi.stubGlobal('fetch', fetchForaDoAr);
    render(<App />);
    expect(await within(painel()).findByText('Sem dados do SGS: usando o cenário manual.')).toBeInTheDocument();
    expect(within(painel()).getByRole('radio', { name: /Manual/ })).toBeChecked();
    expect(within(painel()).getByRole('radio', { name: /Base/ })).toBeDisabled();
    fireEvent.click(aba('Duelo rápido'));
    const duelo = screen.getByRole('tabpanel');
    expect(within(duelo).getByText(/usando o cenário manual/)).toBeInTheDocument();
    fireEvent.click(within(duelo).getByRole('button', { name: 'Comparar' }));
    expect(screen.getByRole('heading', { name: /qual você acha que rende mais/i })).toBeInTheDocument();
  });
  it('com os indicadores, usa o cenário Base do Focus, buscando uma vez só', async () => {
    vi.stubGlobal('fetch', fetchFixtures);
    render(<App />);
    expect(await within(painel()).findByText('Selic e IPCA seguem as medianas do Focus de 18/09/2026.')).toBeInTheDocument();
    expect(within(painel()).getByRole('radio', { name: /Base/ })).toBeChecked();
    expect(fetchFixtures).toHaveBeenCalledTimes(RESPOSTAS.size);
    fireEvent.click(aba('Duelo rápido'));
    expect(within(screen.getByRole('tabpanel')).getByText(/medianas do Focus de 18\/09\/2026/)).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: 'Comparar' }));
    fireEvent.click(screen.getByRole('button', { name: /pular/i }));
    expect(screen.getByRole('heading', { name: 'Resultado' })).toBeInTheDocument();
    expect(fetchFixtures).toHaveBeenCalledTimes(RESPOSTAS.size);
  });
  it('trocar para "Juros sobem" muda a explicação e fica salvo', async () => {
    vi.stubGlobal('fetch', fetchFixtures);
    render(<App />);
    await within(painel()).findByText(/medianas do Focus/);
    fireEvent.click(within(painel()).getByRole('radio', { name: /Juros sobem/ }));
    expect(within(painel()).getByText(/^Juros sobem: Selic e IPCA 1 desvio-padrão acima/)).toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(localStorage.getItem(CHAVE_PREFERENCIAS) ?? '{}').escolha).toBe('SOBEM'));
  });
  it('cadastrar uma oferta em "Comparar ofertas" salva no localStorage e sobrevive à recarga', () => {
    vi.stubGlobal('fetch', fetchForaDoAr);
    render(<App />);
    const ofertas = screen.getByRole('tabpanel');
    fireEvent.input(within(ofertas).getByLabelText('Emissor'), { target: { value: 'Banco X' } });
    fireEvent.input(within(ofertas).getByLabelText('Conglomerado'), { target: { value: 'Grupo X' } });
    fireEvent.click(within(ofertas).getByRole('button', { name: 'Adicionar oferta' }));
    const salvas = JSON.parse(localStorage.getItem(CHAVE_OFERTAS) ?? '[]');
    expect(salvas).toHaveLength(1);
    expect(salvas[0]).toMatchObject({ produto: 'CDB', emissor: 'Banco X', conglomerado: 'Grupo X', liquidez: 'DIARIA' });
    cleanup();
    render(<App />);
    expect(screen.getByRole('article', { name: /A: CDB 100% do CDI/ })).toBeInTheDocument();
  });
});

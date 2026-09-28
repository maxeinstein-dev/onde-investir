// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAVE_COMPARACAO } from '../../src/armazenamento/comparacao';
import { CHAVE_OFERTAS } from '../../src/armazenamento/ofertas';
import { CHAVE_POSICOES } from '../../src/armazenamento/posicoes';
import { urlSgsAno } from '../../src/dados/bcb';
import { SERIES_HISTORICO } from '../../src/dados/historico';
import { paraCadaDiaUtil } from '../../src/engine/calendario';
import { formatarMoeda } from '../../src/formato';
import { App } from '../../src/ui/App';
import sgs11de2025 from '../fixtures/bcb/historico/sgs-11-2025.json';
import sgs11de2026 from '../fixtures/bcb/historico/sgs-11-2026.json';
import sgs12de2025 from '../fixtures/bcb/historico/sgs-12-2025.json';
import sgs12de2026 from '../fixtures/bcb/historico/sgs-12-2026.json';
import sgs226de2025 from '../fixtures/bcb/historico/sgs-226-2025.json';
import sgs226de2026 from '../fixtures/bcb/historico/sgs-226-2026.json';
import sgs432de2025 from '../fixtures/bcb/historico/sgs-432-2025.json';
import sgs432de2026 from '../fixtures/bcb/historico/sgs-432-2026.json';
import sgs433de2025 from '../fixtures/bcb/historico/sgs-433-2025.json';
import sgs433de2026 from '../fixtures/bcb/historico/sgs-433-2026.json';
import { graficos } from './graficos/mockChart';

vi.mock('chart.js', () => import('./graficos/mockChart'));
vi.mock('chartjs-plugin-annotation', () => ({ default: { id: 'annotation' } }));

const HISTORICO = new Map<string, unknown>([
  [urlSgsAno(12, 2025), sgs12de2025], [urlSgsAno(12, 2026), sgs12de2026],
  [urlSgsAno(11, 2025), sgs11de2025], [urlSgsAno(11, 2026), sgs11de2026],
  [urlSgsAno(433, 2025), sgs433de2025], [urlSgsAno(433, 2026), sgs433de2026],
  [urlSgsAno(226, 2025), sgs226de2025], [urlSgsAno(226, 2026), sgs226de2026],
  [urlSgsAno(432, 2025), sgs432de2025], [urlSgsAno(432, 2026), sgs432de2026],
]);

/** `fetch` falso: o histórico das fixtures; os indicadores não respondem (vale o cenário manual). Nada vai à rede. */
const fetchHistorico = vi.fn(async (url: string) => {
  const corpo = HISTORICO.get(url);
  return corpo === undefined
    ? { ok: false, status: 404, json: async () => null }
    : { ok: true, status: 200, json: async () => structuredClone(corpo) };
});
const chamadasDoHistorico = () => fetchHistorico.mock.calls.map(([url]) => url).filter((u) => HISTORICO.has(u));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-27T12:00:00-03:00'));
  localStorage.clear();
  history.replaceState(null, '', '/');
  fetchHistorico.mockClear();
  vi.stubGlobal('fetch', fetchHistorico);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  graficos.length = 0;
});

const aba = (nome: string) => screen.getByRole('tab', { name: nome });
const painelAtivo = () => screen.getByRole('tabpanel');
const moeda = (v: number) => formatarMoeda(v).replace(/\s/g, ' ');

const cdbCdi = {
  id: 'p-1', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 }, emissor: 'Banco X', conglomerado: 'Grupo X',
  liquidez: 'DIARIA', valorAplicado: 10_000, dataAplicacao: '2025-01-02', eventos: [],
};

/** O fator do CDI realizado nas fixtures, de `inicio` (inclusive) a `fim` (exclusive). */
function fatorRealizado(inicio: string, fim: string): number {
  const cdi = new Map<string, number>();
  for (const serie of [sgs12de2025, sgs12de2026] as { data: string; valor: string }[][]) {
    for (const p of serie) cdi.set(p.data.split('/').reverse().join('-'), Number(p.valor) / 100);
  }
  let fator = 1;
  paraCadaDiaUtil(inicio, fim, (d) => { fator *= 1 + (cdi.get(d) ?? NaN); });
  return fator;
}

describe('aba Carteira no App', () => {
  it('fica em #carteira, depois de Comparar e Catálogo', () => {
    history.replaceState(null, '', '/#carteira');
    render(<App />);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Comparar', 'Catálogo', 'Carteira']);
    expect(aba('Carteira')).toHaveAttribute('aria-selected', 'true');
    expect(within(painelAtivo()).getByRole('heading', { level: 2, name: 'Carteira' })).toBeInTheDocument();
  });

  it('sem posições, não busca o histórico', async () => {
    render(<App />);
    await waitFor(() => expect(fetchHistorico).toHaveBeenCalled());
    expect(chamadasDoHistorico()).toEqual([]);
  });

  it('com posições, busca o histórico uma vez (uma requisição por série e ano) e calcula o valor pelo realizado', async () => {
    localStorage.setItem(CHAVE_POSICOES, JSON.stringify([cdbCdi]));
    history.replaceState(null, '', '/#carteira');
    render(<App />);
    const status = within(painelAtivo()).getByRole('status');
    expect(status).toHaveTextContent('Buscando o histórico do Banco Central…');
    await waitFor(() => expect(status).toHaveTextContent('Valores calculados com o histórico do Banco Central até 25/09/2026.'));
    expect(within(painelAtivo()).getByRole('status')).toBe(status);
    expect(chamadasDoHistorico().sort()).toEqual([...SERIES_HISTORICO.map((s) => urlSgsAno(s, 2025)), ...SERIES_HISTORICO.map((s) => urlSgsAno(s, 2026))].sort());
    // Hoje é domingo, 27/09/2026: o último dia útil com CDI é sexta, 25/09, e todo o período está realizado.
    const bruto = 10_000 * fatorRealizado('2025-01-02', '2026-09-27');
    expect(screen.getByRole('article', { name: /CDB 100% do CDI/ })).toHaveTextContent(`Hoje: ${moeda(bruto)} bruto`);

    // Uma posição nova no mesmo ano não busca de novo.
    const antes = fetchHistorico.mock.calls.length;
    const p = painelAtivo();
    fireEvent.input(within(p).getByLabelText('Emissor'), { target: { value: 'Banco Y' } });
    fireEvent.input(within(p).getByLabelText('Conglomerado'), { target: { value: 'Grupo Y' } });
    fireEvent.input(within(p).getByLabelText('Valor aplicado (R$)'), { target: { value: '5000' } });
    fireEvent.input(within(p).getByLabelText('Data da aplicação'), { target: { value: '2025-06-02' } });
    fireEvent.click(within(p).getByRole('button', { name: 'Adicionar posição' }));
    expect(JSON.parse(localStorage.getItem(CHAVE_POSICOES) ?? '[]')).toHaveLength(2);
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(fetchHistorico.mock.calls.length).toBe(antes);
  });

  it('com a rede fora, avisa e calcula pelo cenário', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    localStorage.setItem(CHAVE_POSICOES, JSON.stringify([cdbCdi]));
    history.replaceState(null, '', '/#carteira');
    render(<App />);
    const status = within(painelAtivo()).getByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('Não deu para buscar o histórico do Banco Central. Os valores saem pelo cenário.'));
    expect(screen.getByRole('article', { name: /CDB 100% do CDI/ })).toHaveTextContent(/Hoje: R\$ [\d.]+,\d\d bruto/);
  });

  it('histórico que falhou: "Tentar de novo" busca outra vez e, com a rede de volta, calcula pelo realizado', async () => {
    let rede = false;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (!rede) throw new TypeError('Failed to fetch');
      return fetchHistorico(url);
    }));
    localStorage.setItem(CHAVE_POSICOES, JSON.stringify([cdbCdi]));
    history.replaceState(null, '', '/#carteira');
    render(<App />);
    const status = within(painelAtivo()).getAllByRole('status')[0] as HTMLElement;
    await waitFor(() => expect(status).toHaveTextContent('Não deu para buscar o histórico do Banco Central.'));
    rede = true;
    fireEvent.click(within(painelAtivo()).getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(status).toHaveTextContent('Valores calculados com o histórico do Banco Central até 25/09/2026.'));
    expect(within(painelAtivo()).queryByRole('button', { name: 'Tentar de novo' })).toBeNull();
    expect(chamadasDoHistorico()).toHaveLength(SERIES_HISTORICO.length * 2);
  });

  describe('alerta do FGC na comparação', () => {
    const oferta = (id: string, emissor: string, conglomerado: string) => ({
      id, produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.1 }, emissor, conglomerado, liquidez: 'NO_VENCIMENTO',
      vencimento: '2028-09-28',
    });
    async function comparar(valor: string) {
      render(<App />);
      await waitFor(() => expect(fetchHistorico).toHaveBeenCalled());
      // Os indicadores terminam de carregar (aqui, sem resposta): o cenário não muda mais depois de comparar.
      await waitFor(() => expect(screen.queryByText(/Enquanto os indicadores carregam/)).toBeNull());
      const p = painelAtivo();
      fireEvent.input(within(p).getByLabelText('Valor (R$)'), { target: { value: valor } });
      fireEvent.click(within(p).getByRole('button', { name: 'Comparar' }));
      const pular = screen.queryByRole('button', { name: /pular/i });
      if (pular) fireEvent.click(pular);
      return within(screen.getByRole('region', { name: 'Resultado da comparação' }));
    }

    it('a carteira do mesmo conglomerado mais o valor da comparação passa do limite: FGC_LIMITE na oferta dele', async () => {
      localStorage.setItem(CHAVE_POSICOES, JSON.stringify([{ ...cdbCdi, valorAplicado: 150_000, dataAplicacao: '2026-01-05' }]));
      localStorage.setItem(CHAVE_OFERTAS, JSON.stringify([oferta('a', 'Banco X2', 'grupo x'), oferta('b', 'Banco Z', 'Grupo Z')]));
      localStorage.setItem(CHAVE_COMPARACAO, JSON.stringify(['a', 'b']));
      const resultado = await comparar('100000');
      const alertas = within(resultado.getByRole('region', { name: 'Alertas' }));
      const fgc = alertas.getAllByRole('listitem').filter((li) => li.textContent?.includes('Acima do limite do FGC'));
      expect(fgc).toHaveLength(1);
      expect(fgc[0]).toHaveTextContent('Banco X2');
      expect(fgc[0]).toHaveTextContent('conglomerado grupo x');
    });

    it('comparar antes de o histórico chegar: quando ele chega, o resultado fica, recalculado, e o status avisa', async () => {
      let liberar: () => void = () => {};
      const portao = new Promise<void>((r) => { liberar = r; });
      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (HISTORICO.has(url)) await portao;
        return fetchHistorico(url);
      }));
      localStorage.setItem(CHAVE_POSICOES, JSON.stringify([{ ...cdbCdi, valorAplicado: 150_000, dataAplicacao: '2026-01-05' }]));
      localStorage.setItem(CHAVE_OFERTAS, JSON.stringify([oferta('a', 'Banco X2', 'grupo x'), oferta('b', 'Banco Z', 'Grupo Z')]));
      localStorage.setItem(CHAVE_COMPARACAO, JSON.stringify(['a', 'b']));
      const resultado = await comparar('100000');
      const titulo = resultado.getByRole('heading', { name: 'Resultado da comparação' });
      const fgcAntes = resultado.getByRole('region', { name: 'Alertas' }).textContent;
      const status = within(painelAtivo()).getAllByRole('status').find((s) => s.closest('.comparacao')) as HTMLElement;
      expect(status).toHaveTextContent('');
      liberar();
      await waitFor(() => expect(status).toHaveTextContent('Resultado atualizado com o histórico do Banco Central.'));
      expect(screen.getByRole('heading', { name: 'Resultado da comparação' })).toBe(titulo);
      // O alerta foi refeito com o valor da carteira pelo histórico realizado.
      expect(screen.getByRole('region', { name: 'Alertas' }).textContent).not.toBe(fgcAntes);
      expect(screen.getByRole('region', { name: 'Alertas' })).toHaveTextContent('Acima do limite do FGC');
    });

    it('uma posição nova na Carteira recalcula o resultado aberto, com o aviso da carteira', async () => {
      localStorage.setItem(CHAVE_OFERTAS, JSON.stringify([oferta('a', 'Banco X2', 'grupo x'), oferta('b', 'Banco Z', 'Grupo Z')]));
      localStorage.setItem(CHAVE_COMPARACAO, JSON.stringify(['a', 'b']));
      const resultado = await comparar('100000');
      expect(resultado.queryByText('Acima do limite do FGC')).toBeNull();
      fireEvent.click(aba('Carteira'));
      const p = painelAtivo();
      fireEvent.input(within(p).getByLabelText('Emissor'), { target: { value: 'Banco X' } });
      fireEvent.input(within(p).getByLabelText('Conglomerado'), { target: { value: 'Grupo X' } });
      fireEvent.input(within(p).getByLabelText('Valor aplicado (R$)'), { target: { value: '200000' } });
      fireEvent.input(within(p).getByLabelText('Data da aplicação'), { target: { value: '2026-09-01' } });
      fireEvent.click(within(p).getByRole('button', { name: 'Adicionar posição' }));
      fireEvent.click(aba('Comparar'));
      const comparacao = painelAtivo();
      await waitFor(() => expect(within(comparacao).getAllByRole('status').find((s) => s.closest('.comparacao')))
        .toHaveTextContent('Resultado atualizado com a carteira.'));
      expect(within(comparacao).getByRole('region', { name: 'Alertas' })).toHaveTextContent('Acima do limite do FGC');
    });

    it('sem posições, o mesmo valor não gera o alerta', async () => {
      localStorage.setItem(CHAVE_OFERTAS, JSON.stringify([oferta('a', 'Banco X2', 'grupo x'), oferta('b', 'Banco Z', 'Grupo Z')]));
      localStorage.setItem(CHAVE_COMPARACAO, JSON.stringify(['a', 'b']));
      const resultado = await comparar('100000');
      expect(resultado.queryByText('Acima do limite do FGC')).toBeNull();
    });
  });
});

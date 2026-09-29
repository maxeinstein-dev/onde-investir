// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cenarioConstante } from '../../../src/engine/indexadores';
import { RendaVariavel } from '../../../src/ui/rendaVariavel/RendaVariavel';

vi.mock('../../../src/dados/turnstile', () => ({ obterSessao: vi.fn() }));
vi.mock('../../../src/dados/mercado', async (orig) => ({
  ...(await orig<typeof import('../../../src/dados/mercado')>()),
  buscarHistorico: vi.fn(),
}));
import { buscarHistorico } from '../../../src/dados/mercado';
import { obterSessao } from '../../../src/dados/turnstile';

const cen = cenarioConstante({ cdiAA: 0.1365, selicMetaAA: 0.1375, ipcaAA: 0.0422, trAM: 0.001646 });
const candles = [
  { data: '2026-07-01', fechamento: 100 },
  { data: '2026-08-03', fechamento: 90 },
  { data: '2026-09-29', fechamento: 110 },
];
const sessao = vi.mocked(obterSessao);
const historico = vi.mocked(buscarHistorico);

async function consultar(ticker: string) {
  // O botão fica desabilitado enquanto o acesso é verificado.
  await waitFor(() => expect(screen.getByRole('button', { name: 'Consultar' })).toBeEnabled());
  fireEvent.input(screen.getByLabelText('Ticker'), { target: { value: ticker } });
  fireEvent.click(screen.getByRole('button', { name: 'Consultar' }));
}

beforeEach(() => {
  sessao.mockReset().mockResolvedValue({ ok: true });
  historico.mockReset().mockResolvedValue({ ok: true, candles });
});
afterEach(cleanup);

describe('RendaVariavel', () => {
  it('não chama o Turnstile com a aba inativa', () => {
    render(<RendaVariavel ativa={false} cenario={cen} />);
    expect(sessao).not.toHaveBeenCalled();
  });

  it('chama uma vez ao ficar ativa', async () => {
    const { rerender } = render(<RendaVariavel ativa={false} cenario={cen} />);
    rerender(<RendaVariavel ativa cenario={cen} />);
    await waitFor(() => expect(sessao).toHaveBeenCalledTimes(1));
    rerender(<RendaVariavel ativa={false} cenario={cen} />);
    rerender(<RendaVariavel ativa cenario={cen} />);
    expect(sessao).toHaveBeenCalledTimes(1);
  });

  it('ticker inválido não chama a API', async () => {
    render(<RendaVariavel ativa cenario={cen} />);
    await consultar('XX');
    expect(await screen.findByRole('alert')).toHaveTextContent('Código inválido');
    expect(historico).not.toHaveBeenCalled();
  });

  it('renderiza rentabilidade, volatilidade, drawdown, CDI e IPCA', async () => {
    render(<RendaVariavel ativa cenario={cen} />);
    await consultar('petr4');
    expect(await screen.findByText('Rentabilidade no período')).toBeInTheDocument();
    expect(historico).toHaveBeenCalledWith('PETR4');
    for (const t of ['Volatilidade anualizada', 'Queda máxima (drawdown)', 'CDI no mesmo período', 'IPCA no mesmo período']) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    expect(screen.getByText(/de 01\/07\/2026 a 29\/09\/2026/i)).toBeInTheDocument();
    expect(screen.getByText('Histórico ainda curto: ele cresce com o tempo.')).toBeInTheDocument();
  });

  it('SEM_SESSAO renova a sessão uma vez e repete a consulta', async () => {
    historico.mockResolvedValueOnce({ ok: false, erro: 'SEM_SESSAO' });
    render(<RendaVariavel ativa cenario={cen} />);
    await waitFor(() => expect(sessao).toHaveBeenCalledTimes(1));
    await consultar('PETR4');
    expect(await screen.findByText('Rentabilidade no período')).toBeInTheDocument();
    expect(sessao).toHaveBeenCalledTimes(2);
    expect(historico).toHaveBeenCalledTimes(2);
  });

  it('erro do Turnstile mostra "Tentar de novo"', async () => {
    sessao.mockResolvedValueOnce({ ok: false, erro: 'TURNSTILE_INDISPONIVEL' });
    render(<RendaVariavel ativa cenario={cen} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(sessao).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull());
  });

  it('mostra o aviso educativo e o link da lição', () => {
    render(<RendaVariavel ativa={false} cenario={cen} />);
    expect(screen.getByText(/Conteúdo educativo/)).toBeInTheDocument();
    expect(screen.getByText(/não indica ações/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver lição/ })).toHaveAttribute('href', '#aprender/renda-variavel');
  });
});

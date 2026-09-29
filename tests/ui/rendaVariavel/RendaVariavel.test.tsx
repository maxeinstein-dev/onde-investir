// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AVISO_TURNSTILE, fraseComparacao } from '../../../src/conteudo/rendaVariavel';
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
const onPeriodo = vi.fn();
const historico = vi.mocked(buscarHistorico);

async function consultar(ticker: string) {
  // O botão fica desabilitado enquanto o acesso é verificado.
  await waitFor(() => expect(screen.getByRole('button', { name: 'Consultar' })).toBeEnabled());
  fireEvent.input(screen.getByLabelText('Ticker'), { target: { value: ticker } });
  fireEvent.click(screen.getByRole('button', { name: 'Consultar' }));
}

beforeEach(() => {
  onPeriodo.mockReset();
  sessao.mockReset().mockResolvedValue({ ok: true });
  historico.mockReset().mockResolvedValue({ ok: true, candles });
});
afterEach(cleanup);

describe('RendaVariavel', () => {
  it('não chama o Turnstile com a aba inativa', () => {
    render(<RendaVariavel ativa={false} cenario={cen} cenarioRealizado onPeriodo={onPeriodo} />);
    expect(sessao).not.toHaveBeenCalled();
  });

  it('chama uma vez ao ficar ativa', async () => {
    const { rerender } = render(<RendaVariavel ativa={false} cenario={cen} cenarioRealizado onPeriodo={onPeriodo} />);
    rerender(<RendaVariavel ativa cenario={cen} cenarioRealizado onPeriodo={onPeriodo} />);
    await waitFor(() => expect(sessao).toHaveBeenCalledTimes(1));
    rerender(<RendaVariavel ativa={false} cenario={cen} cenarioRealizado onPeriodo={onPeriodo} />);
    rerender(<RendaVariavel ativa cenario={cen} cenarioRealizado onPeriodo={onPeriodo} />);
    expect(sessao).toHaveBeenCalledTimes(1);
  });

  it('mostra o aviso do Turnstile dentro da aba', () => {
    render(<RendaVariavel ativa={false} cenario={cen} cenarioRealizado onPeriodo={onPeriodo} />);
    expect(screen.getByText(AVISO_TURNSTILE)).toBeInTheDocument();
  });

  it('ticker inválido não chama a API', async () => {
    render(<RendaVariavel ativa cenario={cen} cenarioRealizado onPeriodo={onPeriodo} />);
    await consultar('XX');
    expect(await screen.findByRole('alert')).toHaveTextContent('Código inválido');
    expect(historico).not.toHaveBeenCalled();
  });

  it('renderiza rentabilidade, volatilidade, drawdown, CDI e IPCA', async () => {
    render(<RendaVariavel ativa cenario={cen} cenarioRealizado onPeriodo={onPeriodo} />);
    await consultar('petr4');
    expect(await screen.findByText('Rentabilidade no período')).toBeInTheDocument();
    expect(historico).toHaveBeenCalledWith('PETR4');
    for (const t of ['Volatilidade anualizada', 'Queda máxima (drawdown)', 'CDI no mesmo período', 'IPCA no mesmo período']) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    expect(screen.getByText(/de 01\/07\/2026 a 29\/09\/2026/i)).toBeInTheDocument();
    expect(screen.getByText('Histórico ainda curto: ele cresce com o tempo.')).toBeInTheDocument();
  });

  it('a rentabilidade vira o número em destaque, com a comparação ao CDI em frase', async () => {
    render(<RendaVariavel ativa cenario={cen} cenarioRealizado onPeriodo={onPeriodo} />);
    await consultar('PETR4');
    const destaque = await screen.findByRole('group', { name: 'Rentabilidade do ativo' });
    expect(destaque).toHaveTextContent('10');
    expect(destaque).toHaveTextContent('Acima do CDI no mesmo período.');
    // O <dt> do <dl> segue sendo um texto isolado, sem colidir com o destaque.
    expect(screen.getAllByText('Rentabilidade no período')).toHaveLength(1);
  });

  it('sem histórico de CDI e IPCA o destaque não traz frase de comparação', async () => {
    render(<RendaVariavel ativa cenario={cen} cenarioRealizado={false} onPeriodo={onPeriodo} />);
    await consultar('PETR4');
    const destaque = await screen.findByRole('group', { name: 'Rentabilidade do ativo' });
    expect(destaque).not.toHaveTextContent(/CDI/);
  });

  it('volatilidade e queda máxima ficam num detalhe recolhido', async () => {
    render(<RendaVariavel ativa cenario={cen} cenarioRealizado onPeriodo={onPeriodo} />);
    await consultar('PETR4');
    await screen.findByRole('group', { name: 'Rentabilidade do ativo' });
    const detalhe = screen.getByText('Mais detalhes do período').closest('details');
    expect(detalhe).not.toHaveAttribute('open');
    expect(detalhe).toContainElement(screen.getByText('Volatilidade anualizada'));
    expect(detalhe).toContainElement(screen.getByText('Queda máxima (drawdown)'));
  });

  it('o período e o CDI/IPCA ficam fora do detalhe recolhido', async () => {
    render(<RendaVariavel ativa cenario={cen} cenarioRealizado onPeriodo={onPeriodo} />);
    await consultar('PETR4');
    await screen.findByRole('group', { name: 'Rentabilidade do ativo' });
    const detalhe = screen.getByText('Mais detalhes do período').closest('details');
    expect(detalhe).not.toContainElement(screen.getByText('CDI no mesmo período'));
    expect(detalhe).not.toContainElement(screen.getByText('IPCA no mesmo período'));
  });

  it('SEM_SESSAO renova a sessão uma vez e repete a consulta', async () => {
    historico.mockResolvedValueOnce({ ok: false, erro: 'SEM_SESSAO' });
    render(<RendaVariavel ativa cenario={cen} cenarioRealizado onPeriodo={onPeriodo} />);
    await waitFor(() => expect(sessao).toHaveBeenCalledTimes(1));
    await consultar('PETR4');
    expect(await screen.findByText('Rentabilidade no período')).toBeInTheDocument();
    expect(sessao).toHaveBeenCalledTimes(2);
    expect(historico).toHaveBeenCalledTimes(2);
  });

  it('erro do Turnstile mostra "Tentar de novo"', async () => {
    sessao.mockResolvedValueOnce({ ok: false, erro: 'TURNSTILE_INDISPONIVEL' });
    render(<RendaVariavel ativa cenario={cen} cenarioRealizado onPeriodo={onPeriodo} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(sessao).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull());
  });

  it('informa o início do período ao App ao consultar', async () => {
    render(<RendaVariavel ativa cenario={cen} cenarioRealizado onPeriodo={onPeriodo} />);
    await consultar('PETR4');
    await screen.findByText('Rentabilidade no período');
    expect(onPeriodo).toHaveBeenCalledWith('2026-07-01');
  });

  it('sem histórico de CDI e IPCA: consulta funciona, sem CDI e IPCA, com aviso', async () => {
    render(<RendaVariavel ativa cenario={cen} cenarioRealizado={false} onPeriodo={onPeriodo} />);
    await consultar('PETR4');
    expect(await screen.findByText('Rentabilidade no período')).toBeInTheDocument();
    expect(screen.queryByText('CDI no mesmo período')).toBeNull();
    expect(screen.getByText(/Carregando o histórico de CDI e IPCA/)).toBeInTheDocument();
  });

  it('mostra o aviso educativo e o link da lição', () => {
    render(<RendaVariavel ativa={false} cenario={cen} cenarioRealizado onPeriodo={onPeriodo} />);
    expect(screen.getByText(/Conteúdo educativo/)).toBeInTheDocument();
    expect(screen.getByText(/não indica ações/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver lição/ })).toHaveAttribute('href', '#aprender/renda-variavel');
  });
});

describe('fraseComparacao', () => {
  it('compara a rentabilidade ao CDI do mesmo período', () => {
    expect(fraseComparacao(0.1, 0.03)).toBe('Acima do CDI no mesmo período.');
    expect(fraseComparacao(0.01, 0.03)).toBe('Abaixo do CDI no mesmo período.');
    expect(fraseComparacao(0.03, 0.03)).toBe('Igual ao CDI no mesmo período.');
  });
  it('sem CDI, sem frase', () => {
    expect(fraseComparacao(0.1, null)).toBeUndefined();
    expect(fraseComparacao(0.1, Number.NaN)).toBeUndefined();
  });
});

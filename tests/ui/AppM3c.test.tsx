// @vitest-environment jsdom
// Os fluxos do M3c de ponta a ponta no App (plano M3c, C3): o que atravessa abas, o storage e o link.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { CHAVE_COMPARACAO } from '../../src/armazenamento/comparacao';
import { codificar, type EstadoCompartilhado } from '../../src/armazenamento/link';
import { CHAVE_OFERTAS } from '../../src/armazenamento/ofertas';
import { CHAVE_POSICOES } from '../../src/armazenamento/posicoes';
import { CHAVE_PREFERENCIAS, PREFERENCIAS_PADRAO } from '../../src/armazenamento/preferencias';
import { CHAVE_PROGRESSO } from '../../src/armazenamento/progresso';
import { CASOS_CLASSICOS } from '../../src/conteudo/casos';
import { licaoPorId } from '../../src/conteudo/licoes';
import type { CasoClassico } from '../../src/conteudo/licoes/tipos';
import { App } from '../../src/ui/App';
import { fetchFixtures, fetchForaDoAr } from './bcbFalso';
import { graficos } from './graficos/mockChart';

vi.mock('chart.js', () => import('./graficos/mockChart'));
vi.mock('chartjs-plugin-annotation', () => ({ default: { id: 'annotation' } }));

/** O painel de cenário começa recolhido: abre (uma vez) e devolve a região "Indicadores e cenário". */
function abrirPainel(): HTMLElement {
  const botao = screen.getByRole('button', { name: /^Cenário:/ });
  if (botao.getAttribute('aria-expanded') === 'false') fireEvent.click(botao);
  return screen.getByRole('region', { name: 'Indicadores e cenário' });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-28T12:00:00-03:00'));
  localStorage.clear();
  history.replaceState(null, '', '/');
  vi.stubGlobal('fetch', fetchForaDoAr);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  graficos.length = 0;
});

const aba = (nome: string) => screen.getByRole('tab', { name: nome });
const painelAtivo = () => screen.getByRole('tabpanel');
const colunas = () => within(painelAtivo()).queryAllByRole('columnheader').filter((c) => c.getAttribute('scope') === 'col');
const nomesDasColunas = () => colunas().map((c) => c.querySelector('.tabela-comparacao__nome')?.textContent);
const salvas = (chave: string) => JSON.parse(localStorage.getItem(chave) ?? 'null');
const compararDireto = () => {
  fireEvent.click(within(painelAtivo()).getByRole('button', { name: 'Comparar' }));
  fireEvent.click(screen.getByRole('button', { name: /pular/i }));
};
function comClipboard(valor: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value: valor, configurable: true });
  onTestFinished(() => { Reflect.deleteProperty(navigator, 'clipboard'); });
}

const base = { conglomerado: 'G', liquidez: 'DIARIA' };
const X = { ...base, id: 'a', emissor: 'Banco X', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 } };
const LCI = { ...base, id: 'l', emissor: 'Banco L', conglomerado: 'L', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.9 } };
const casoSobem = CASOS_CLASSICOS.find((c) => c.experimente.cenario === 'SOBEM') as CasoClassico;

describe('M3c de ponta a ponta', () => {
  it('compartilhar e abrir o link num navegador sem catálogo: a mesma comparação, sem a carteira', async () => {
    const writeText = vi.fn(async () => {});
    comClipboard({ writeText });
    localStorage.setItem(CHAVE_OFERTAS, JSON.stringify([X, LCI]));
    localStorage.setItem(CHAVE_COMPARACAO, JSON.stringify(['a', 'l']));
    localStorage.setItem(CHAVE_POSICOES, JSON.stringify([{ ...X, id: 'p-1', valorAplicado: 54_321, dataAplicacao: '2026-01-05', eventos: [] }]));
    render(<App />);
    fireEvent.input(within(painelAtivo()).getByLabelText('Valor (R$)'), { target: { value: '4321' } });
    compararDireto();
    fireEvent.click(screen.getByRole('button', { name: 'Compartilhar esta comparação' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const url = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(url).not.toMatch(/54321|54\.321/);

    // "Aba anônima": sem nada no storage.
    cleanup();
    localStorage.clear();
    history.replaceState(null, '', url.slice(url.indexOf('/', 'http://x'.length)));
    render(<App />);
    expect(await screen.findByText('Comparação compartilhada com 2 ofertas.')).toBeInTheDocument();
    expect(nomesDasColunas()).toEqual(['CDB 103% do CDI (Banco X)', 'LCI 90% do CDI (Banco L)']);
    expect(within(painelAtivo()).getByLabelText('Valor (R$)')).toHaveValue(4321);
    expect(location.hash).toBe('#comparar');
    expect(localStorage.getItem(CHAVE_OFERTAS)).toBeNull();
    expect(localStorage.getItem(CHAVE_POSICOES)).toBeNull();
  });

  it('"Ver lição" num alerta da comparação abre a lição na aba Aprender, com o foco no título', () => {
    localStorage.setItem(CHAVE_OFERTAS, JSON.stringify([LCI, X]));
    localStorage.setItem(CHAVE_COMPARACAO, JSON.stringify(['l', 'a']));
    render(<App />);
    fireEvent.input(within(painelAtivo()).getByLabelText('Sua data (opcional)'), { target: { value: '2026-12-28' } });
    compararDireto();
    const alertas = within(painelAtivo()).getByRole('region', { name: 'Alertas' });
    const link = within(alertas).getAllByRole('link', { name: /^Ver lição: / })[0] as HTMLElement;
    const id = (link.getAttribute('href') ?? '').replace('#aprender/', '');
    fireEvent.click(link);
    expect(aba('Aprender')).toHaveAttribute('aria-selected', 'true');
    expect(location.hash).toBe(`#aprender/${id}`);
    const titulo = licaoPorId(id as Parameters<typeof licaoPorId>[0])?.titulo ?? '';
    expect(document.activeElement).toBe(within(painelAtivo()).getByRole('heading', { level: 2, name: titulo }));
  });

  it('ir à lição e voltar a Comparar mantém a comparação temporária', () => {
    render(<App />);
    fireEvent.click(aba('Aprender'));
    fireEvent.click(screen.getByRole('button', { name: `Experimente: ${casoSobem.titulo}` }));
    const antes = nomesDasColunas();
    fireEvent.click(aba('Aprender'));
    fireEvent.click(aba('Comparar'));
    expect(screen.getByText(`Comparação do caso clássico “${casoSobem.titulo}”.`)).toBeInTheDocument();
    expect(nomesDasColunas()).toEqual(antes);
  });

  it('na temporária, "+ Adicionar oferta" do catálogo entra nela sem mexer na seleção salva', () => {
    localStorage.setItem(CHAVE_OFERTAS, JSON.stringify([X]));
    localStorage.setItem(CHAVE_COMPARACAO, JSON.stringify(['a']));
    render(<App />);
    fireEvent.click(aba('Aprender'));
    fireEvent.click(screen.getByRole('button', { name: `Experimente: ${casoSobem.titulo}` }));
    const n = colunas().length;
    fireEvent.click(within(painelAtivo()).getByRole('button', { name: /^\+ Adicionar oferta/ }));
    fireEvent.click(within(painelAtivo()).getByRole('button', { name: 'Adicionar CDB 103% do CDI (Banco X)' }));
    expect(colunas()).toHaveLength(n + 1);
    expect(salvas(CHAVE_COMPARACAO)).toEqual(['a']);
    // As do caso continuam fora do catálogo.
    expect(salvas(CHAVE_OFERTAS)).toHaveLength(1);
  });

  it('link com "Juros sobem" e o Focus disponível: projeta com o cenário do link, e o painel continua como estava', async () => {
    vi.stubGlobal('fetch', fetchFixtures);
    const estado: EstadoCompartilhado = {
      versao: 1,
      ofertas: [
        { produto: 'TESOURO_SELIC', indexacao: { tipo: 'SELIC' }, emissor: 'Tesouro Nacional', conglomerado: 'Tesouro Nacional', liquidez: 'DIARIA', vencimento: '2029-03-01' },
        { produto: 'CDB', indexacao: { tipo: 'PRE', taxaAA: 0.13 }, emissor: 'Banco P', conglomerado: 'P', liquidez: 'NO_VENCIMENTO', vencimento: '2029-03-01' },
      ],
      valor: 10_000, dataAplicacao: '2026-09-28', regra: { tipo: 'PADRAO' },
      cenario: { escolha: 'SOBEM', premissas: PREFERENCIAS_PADRAO.premissas, manual: PREFERENCIAS_PADRAO.manual },
    };
    history.replaceState(null, '', `/#comparar/${await codificar(estado)}`);
    render(<App />);
    await screen.findByText('Comparação compartilhada com 2 ofertas.');
    const painel = abrirPainel();
    await within(painel).findByText(/medianas do Focus/);
    expect(within(painelAtivo()).getByText(/^Cenário: Juros sobem: /)).toBeInTheDocument();
    expect(within(painel).getByRole('radio', { name: /Base/ })).toBeChecked();
    expect(localStorage.getItem(CHAVE_PREFERENCIAS)).toBeNull();
  });

  it('#aprender com lição desconhecida abre o índice', () => {
    history.replaceState(null, '', '/#aprender/inventada');
    render(<App />);
    expect(aba('Aprender')).toHaveAttribute('aria-selected', 'true');
    expect(within(painelAtivo()).getByRole('heading', { level: 2, name: 'Aprender' })).toBeInTheDocument();
  });

  it('salvar no catálogo leva o foco ao aviso da temporária, e o catálogo mostra as ofertas novas', () => {
    render(<App />);
    fireEvent.click(aba('Aprender'));
    fireEvent.click(screen.getByRole('button', { name: `Experimente: ${casoSobem.titulo}` }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar estas ofertas no catálogo' }));
    expect(document.activeElement).toBe(screen.getByText(`Comparação do caso clássico “${casoSobem.titulo}”.`));
    fireEvent.click(aba('Catálogo'));
    expect(within(painelAtivo()).getAllByRole('article')).toHaveLength(casoSobem.experimente.ofertas.length);
  });

  it('com o storage bloqueado, a trilha funciona na visita e nada avisa ao carregar', () => {
    const gravar = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    onTestFinished(() => gravar.mockRestore());
    history.replaceState(null, '', '/#aprender/fgc');
    render(<App />);
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como concluída' }));
    fireEvent.click(screen.getByRole('link', { name: 'Voltar ao índice' }));
    expect(screen.getByRole('progressbar', { name: '1 de 10 lições' })).toBeInTheDocument();
    expect(localStorage.getItem(CHAVE_PROGRESSO)).toBeNull();
  });
});

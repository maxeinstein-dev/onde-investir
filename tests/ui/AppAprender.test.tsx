// @vitest-environment jsdom
// A trilha "Aprender" no App (plano M3c, C1): a aba, a lição no hash, o progresso salvo e a comparação temporária
// do "Experimente" e dos casos clássicos.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAVE_COMPARACAO } from '../../src/armazenamento/comparacao';
import { CHAVE_OFERTAS } from '../../src/armazenamento/ofertas';
import { CHAVE_PREFERENCIAS } from '../../src/armazenamento/preferencias';
import { CHAVE_PROGRESSO } from '../../src/armazenamento/progresso';
import { CASOS_CLASSICOS } from '../../src/conteudo/casos';
import { nomesDistintos } from '../../src/conteudo/comparacao';
import { LICOES } from '../../src/conteudo/licoes';
import { type CasoClassico, type Licao, montarExperimente } from '../../src/conteudo/licoes/tipos';
import { App } from '../../src/ui/App';
import { fetchFixtures, fetchForaDoAr } from './bcbFalso';
import { graficos } from './graficos/mockChart';

vi.mock('chart.js', () => import('./graficos/mockChart'));

/** O painel de cenário começa recolhido: abre (uma vez) e devolve a região "Indicadores e cenário". */
function abrirPainel(): HTMLElement {
  const botao = screen.getByRole('button', { name: /^Cenário:/ });
  if (botao.getAttribute('aria-expanded') === 'false') fireEvent.click(botao);
  return screen.getByRole('region', { name: 'Indicadores e cenário' });
}
vi.mock('chartjs-plugin-annotation', () => ({ default: { id: 'annotation' } }));

const HOJE = '2026-09-28';
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${HOJE}T12:00:00-03:00`));
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

const base = { conglomerado: 'G', liquidez: 'DIARIA' };
const X = { ...base, id: 'a', emissor: 'Banco X', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 } };
const Y = { ...base, id: 'b', emissor: 'Banco Y', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.1 } };
function semear(ofertas: unknown[], selecao?: string[]) {
  localStorage.setItem(CHAVE_OFERTAS, JSON.stringify(ofertas));
  if (selecao) localStorage.setItem(CHAVE_COMPARACAO, JSON.stringify(selecao));
}

const comExperimente = LICOES.find((l) => l.experimente !== undefined) as Licao;
const nomesDoExperimente = (e: NonNullable<Licao['experimente']>) =>
  nomesDistintos(montarExperimente(e, HOJE).ofertas.map((o, i) => ({ ...o, id: `x${i}` })));
const casoSobem = CASOS_CLASSICOS.find((c) => c.experimente.cenario === 'SOBEM') as CasoClassico;

function abrirNaTrilha(l: Licao) {
  fireEvent.click(aba('Aprender'));
  fireEvent.click(within(screen.getByRole('list', { name: 'Lições' })).getByRole('link', { name: new RegExp(`^${l.ordem}\\. `) }));
}

describe('App: aba Aprender', () => {
  it('é a última aba; #aprender abre o índice e #aprender/<lição> abre a lição', async () => {
    history.replaceState(null, '', '/#aprender');
    render(<App />);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Comparar', 'Catálogo', 'Carteira', 'Objetivos', 'Renda variável', 'Aprender']);
    expect(aba('Aprender')).toHaveAttribute('aria-selected', 'true');
    expect(within(painelAtivo()).getByRole('heading', { level: 2, name: 'Aprender' })).toBeInTheDocument();
    cleanup();
    history.replaceState(null, '', '/#aprender/fgc');
    render(<App />);
    expect(await within(painelAtivo()).findByRole('heading', { level: 2, name: 'FGC e garantias' })).toBeInTheDocument();
  });
  it('abrir a lição põe o id no hash; voltar ao índice tira', () => {
    render(<App />);
    abrirNaTrilha(comExperimente);
    expect(location.hash).toBe(`#aprender/${comExperimente.id}`);
    fireEvent.click(screen.getByRole('link', { name: 'Voltar ao índice' }));
    expect(location.hash).toBe('#aprender');
  });
  it('trocar de aba e voltar mantém a lição aberta', () => {
    render(<App />);
    abrirNaTrilha(comExperimente);
    fireEvent.click(aba('Comparar'));
    fireEvent.click(aba('Aprender'));
    expect(location.hash).toBe(`#aprender/${comExperimente.id}`);
    expect(within(painelAtivo()).getByRole('heading', { level: 2, name: comExperimente.titulo })).toBeInTheDocument();
  });
  it('o voltar do navegador (hashchange) troca a lição', async () => {
    render(<App />);
    abrirNaTrilha(comExperimente);
    history.replaceState(null, '', '/#aprender/reserva');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(await within(painelAtivo()).findByRole('heading', { level: 2, name: 'Reserva de emergência' })).toBeInTheDocument();
  });
  it('marcar como concluída fica salvo e sobrevive à recarga', () => {
    render(<App />);
    abrirNaTrilha(comExperimente);
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como concluída' }));
    expect(salvas(CHAVE_PROGRESSO).concluidas).toEqual([comExperimente.id]);
    cleanup();
    history.replaceState(null, '', '/#aprender');
    render(<App />);
    expect(screen.getByRole('progressbar', { name: '1 de 10 lições' })).toBeInTheDocument();
  });
  it('cada carregamento do app conta uma visita', () => {
    render(<App />);
    expect(salvas(CHAVE_PROGRESSO).visitas).toBe(1);
    cleanup();
    render(<App />);
    expect(salvas(CHAVE_PROGRESSO).visitas).toBe(2);
  });
});

describe('App: comparação temporária do "Experimente"', () => {
  it('abre em Comparar com as ofertas da lição, sem mexer na seleção salva nem no catálogo', () => {
    semear([X, Y], ['a', 'b']);
    render(<App />);
    abrirNaTrilha(comExperimente);
    fireEvent.click(screen.getByRole('button', { name: 'Experimente' }));
    expect(aba('Comparar')).toHaveAttribute('aria-selected', 'true');
    const banner = screen.getByText(`Comparação da lição “${comExperimente.titulo}”.`);
    expect(document.activeElement).toBe(banner);
    expect(nomesDasColunas()).toEqual(nomesDoExperimente(comExperimente.experimente as NonNullable<Licao['experimente']>));
    expect(salvas(CHAVE_COMPARACAO)).toEqual(['a', 'b']);
    expect(salvas(CHAVE_OFERTAS)).toHaveLength(2);
  });
  it('"Voltar para a minha comparação" restaura a seleção salva', () => {
    semear([X, Y], ['b', 'a']);
    render(<App />);
    abrirNaTrilha(comExperimente);
    fireEvent.click(screen.getByRole('button', { name: 'Experimente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para a minha comparação' }));
    expect(nomesDasColunas()).toEqual(['CDB 110% do CDI (Banco Y)', 'CDB 103% do CDI (Banco X)']);
    expect(screen.queryByText(/^Comparação da lição/)).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Comparar' }));
  });
  it('tirar uma coluna da temporária não mexe na seleção salva', () => {
    semear([X, Y], ['a', 'b']);
    render(<App />);
    abrirNaTrilha(comExperimente);
    fireEvent.click(screen.getByRole('button', { name: 'Experimente' }));
    const n = colunas().length;
    fireEvent.click(within(painelAtivo()).getAllByRole('button', { name: /^Tirar da comparação/ })[0] as HTMLElement);
    expect(colunas()).toHaveLength(n - 1);
    expect(salvas(CHAVE_COMPARACAO)).toEqual(['a', 'b']);
  });
  it('"Salvar estas ofertas no catálogo" grava cópias com ids novos e avisa', () => {
    semear([X, Y], ['a', 'b']);
    render(<App />);
    abrirNaTrilha(comExperimente);
    fireEvent.click(screen.getByRole('button', { name: 'Experimente' }));
    const n = colunas().length;
    fireEvent.click(screen.getByRole('button', { name: 'Salvar estas ofertas no catálogo' }));
    const catalogo = salvas(CHAVE_OFERTAS) as { id: string }[];
    expect(catalogo).toHaveLength(2 + n);
    expect(new Set(catalogo.map((o) => o.id)).size).toBe(2 + n);
    expect(screen.getByText(`${n} ofertas salvas no catálogo.`)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar estas ofertas no catálogo' })).toBeNull();
    // A seleção salva continua a da pessoa.
    expect(salvas(CHAVE_COMPARACAO)).toEqual(['a', 'b']);
  });
  it('com o catálogo cheio, não salva e explica', () => {
    const cheio = Array.from({ length: 30 }, (_, i) => ({ ...X, id: `o${i}` }));
    semear(cheio);
    render(<App />);
    abrirNaTrilha(comExperimente);
    fireEvent.click(screen.getByRole('button', { name: 'Experimente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar estas ofertas no catálogo' }));
    expect(screen.getByText(/O catálogo já tem 30 ofertas, o máximo/)).toBeInTheDocument();
    expect(salvas(CHAVE_OFERTAS)).toHaveLength(30);
  });
  it('o palpite respondido na temporária entra na taxa de acerto', () => {
    render(<App />);
    abrirNaTrilha(comExperimente);
    fireEvent.click(screen.getByRole('button', { name: 'Experimente' }));
    fireEvent.click(within(painelAtivo()).getByRole('button', { name: 'Comparar' }));
    const palpite = within(painelAtivo()).getByRole('heading', { level: 2, name: /\?$/ }).closest('section') as HTMLElement;
    fireEvent.click(within(palpite).getAllByRole('button', { name: /^[A-E]: / })[0] as HTMLElement);
    const feedback = (document.querySelector('.feedback') as HTMLElement).textContent ?? '';
    const esperado = feedback === 'Você acertou.' ? { acertos: 1, total: 1 }
      : feedback.startsWith('Não foi dessa vez') ? { acertos: 0, total: 1 }
        : { acertos: 0, total: 0 }; // empate não conta
    expect(salvas(CHAVE_PROGRESSO).palpites).toEqual(esperado);
    fireEvent.click(aba('Aprender'));
    fireEvent.click(screen.getByRole('link', { name: 'Voltar ao índice' }));
    if (esperado.total === 1) expect(screen.getByText(`Você acertou ${esperado.acertos} de 1 palpite.`)).toBeInTheDocument();
  });
});

describe('App: ofertas com o mesmo nome no "Experimente"', () => {
  const reaplicacao = LICOES.find((l) => l.id === 'reaplicacao') as Licao;
  it('Reaplicação: os dois CDBs aparecem distintos na tabela e no palpite', () => {
    render(<App />);
    abrirNaTrilha(reaplicacao);
    fireEvent.click(screen.getByRole('button', { name: 'Experimente' }));
    const nomes = nomesDasColunas();
    expect(nomes).toEqual([
      'LCI 90% do CDI (Banco Alfa)',
      'CDB 103% do CDI (Banco Alfa) · vence em 28/09/2027',
      'CDB 103% do CDI (Banco Alfa) · vence em 28/09/2031',
    ]);
    fireEvent.click(within(painelAtivo()).getByRole('button', { name: 'Comparar' }));
    const palpite = within(painelAtivo()).getByRole('heading', { level: 2, name: /\?$/ }).closest('section') as HTMLElement;
    expect(within(palpite).getAllByRole('button', { name: /^[A-E]: / }).map((b) => b.textContent)).toEqual(nomes.map((n, i) => `${'ABC'[i]}: ${n}`));
  });
});

describe('App: casos clássicos', () => {
  it('o caso abre a temporária com a pergunta dele no palpite', () => {
    render(<App />);
    fireEvent.click(aba('Aprender'));
    fireEvent.click(screen.getByRole('button', { name: `Experimente: ${casoSobem.titulo}` }));
    expect(screen.getByText(`Comparação do caso clássico “${casoSobem.titulo}”.`)).toBeInTheDocument();
    expect(nomesDasColunas()).toEqual(nomesDoExperimente(casoSobem.experimente));
    fireEvent.click(within(painelAtivo()).getByRole('button', { name: 'Comparar' }));
    expect(screen.getByRole('heading', { level: 2, name: casoSobem.pergunta })).toBeInTheDocument();
  });
  it('cenário "Juros sobem" sem o Focus: cai no manual e avisa, sem mudar as preferências', async () => {
    render(<App />);
    fireEvent.click(aba('Aprender'));
    fireEvent.click(screen.getByRole('button', { name: `Experimente: ${casoSobem.titulo}` }));
    expect(await screen.findByText(/O cenário “Juros sobem” desta comparação precisa das projeções do Focus/)).toBeInTheDocument();
    expect(localStorage.getItem(CHAVE_PREFERENCIAS)).toBeNull();
  });
  it('cenário "Juros sobem" com o Focus: a comparação usa a projeção, e o painel continua no Base', async () => {
    vi.stubGlobal('fetch', fetchFixtures);
    render(<App />);
    const painel = abrirPainel();
    await within(painel).findByText(/medianas do Focus/);
    fireEvent.click(aba('Aprender'));
    fireEvent.click(screen.getByRole('button', { name: `Experimente: ${casoSobem.titulo}` }));
    expect(within(painelAtivo()).getByText(/^Cenário: Juros sobem: /)).toBeInTheDocument();
    expect(screen.queryByText(/precisa das projeções do Focus/)).toBeNull();
    expect(within(painel).getByRole('radio', { name: /Base/ })).toBeChecked();
    await waitFor(() => expect(localStorage.getItem(CHAVE_PREFERENCIAS)).toBeNull());
  });
});

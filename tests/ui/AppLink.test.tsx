// @vitest-environment jsdom
// O link compartilhável, as dicas e o "Você sabia?" no App (plano M3c, C2).
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { CHAVE_COMPARACAO } from '../../src/armazenamento/comparacao';
import { codificar, decodificar, type EstadoCompartilhado, lerEstadoDoHash } from '../../src/armazenamento/link';
import { CHAVE_OFERTAS } from '../../src/armazenamento/ofertas';
import { CHAVE_PREFERENCIAS, PREFERENCIAS_PADRAO } from '../../src/armazenamento/preferencias';
import { CHAVE_PROGRESSO } from '../../src/armazenamento/progresso';
import { VOCE_SABIA } from '../../src/conteudo/dicas';
import { licaoPorId } from '../../src/conteudo/licoes';
import { App } from '../../src/ui/App';
import { fetchForaDoAr } from './bcbFalso';
import { graficos } from './graficos/mockChart';

vi.mock('chart.js', () => import('./graficos/mockChart'));
vi.mock('chartjs-plugin-annotation', () => ({ default: { id: 'annotation' } }));

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

const LCI = {
  produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.92 }, emissor: 'Banco Beta', conglomerado: 'Beta',
  vencimento: '2028-09-28', liquidez: 'NO_VENCIMENTO',
} as const;
const CDB = {
  produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.1 }, emissor: 'Banco Alfa', conglomerado: 'Alfa',
  vencimento: '2028-09-28', liquidez: 'NO_VENCIMENTO',
} as const;
const ESTADO: EstadoCompartilhado = {
  versao: 1, ofertas: [LCI, CDB], valor: 25_000, dataAplicacao: '2026-09-28', suaData: '2027-09-28',
  regra: { tipo: 'CDI_100' },
  cenario: { escolha: 'MANUAL', premissas: PREFERENCIAS_PADRAO.premissas, manual: { cdi: 11, selicMeta: 11.1, ipca: 4, tr: 0.1 } },
};
const X = { conglomerado: 'G', liquidez: 'DIARIA', id: 'a', emissor: 'Banco X', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 } };
const Y = { conglomerado: 'G', liquidez: 'DIARIA', id: 'b', emissor: 'Banco Y', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.1 } };

async function abrirComLink(estado: EstadoCompartilhado | string) {
  const fragmento = typeof estado === 'string' ? estado : await codificar(estado);
  history.replaceState(null, '', `/#comparar/${fragmento}`);
  const antes = history.length;
  render(<App />);
  return { antes };
}

function comClipboard(valor: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value: valor, configurable: true });
  onTestFinished(() => { Reflect.deleteProperty(navigator, 'clipboard'); });
}

describe('App: abrir um link', () => {
  it('link válido, sem catálogo: a comparação compartilhada abre, com as entradas e o cenário do link', async () => {
    const { antes } = await abrirComLink(ESTADO);
    expect(await screen.findByText('Comparação compartilhada com 2 ofertas.')).toBeInTheDocument();
    expect(aba('Comparar')).toHaveAttribute('aria-selected', 'true');
    expect(nomesDasColunas()).toEqual(['LCI 92% do CDI (Banco Beta)', 'CDB 110% do CDI (Banco Alfa)']);
    expect(screen.getByLabelText('Valor (R$)')).toHaveValue(25_000);
    expect(screen.getByLabelText('Sua data (opcional)')).toHaveValue('2027-09-28');
    expect(screen.getByLabelText('Reinvestimento')).toHaveValue('CDI_100');
    expect(within(painelAtivo()).getByText(/^Cenário: Cenário manual/)).toBeInTheDocument();
    // Nada foi gravado: nem catálogo, nem seleção, nem preferências.
    expect(localStorage.getItem(CHAVE_OFERTAS)).toBeNull();
    expect(localStorage.getItem(CHAVE_COMPARACAO)).toBeNull();
    expect(localStorage.getItem(CHAVE_PREFERENCIAS)).toBeNull();
    // O estado saiu da barra com replaceState, sem entrada nova no histórico.
    expect(location.hash).toBe('#comparar');
    expect(history.length).toBe(antes);
  });
  it('o palpite e o resultado usam os valores manuais do link, não os do painel', async () => {
    await abrirComLink(ESTADO);
    await screen.findByText('Comparação compartilhada com 2 ofertas.');
    fireEvent.click(within(painelAtivo()).getByRole('button', { name: 'Comparar' }));
    fireEvent.click(screen.getByRole('button', { name: /pular/i }));
    expect(screen.getByRole('heading', { name: 'Resultado da comparação' })).toBeInTheDocument();
    expect(screen.getByText(/25\.000,00 aplicados em 28\/09\/2026/)).toBeInTheDocument();
  });
  it('link com cenário do Focus sem o Focus: cai no manual e avisa', async () => {
    await abrirComLink({ ...ESTADO, cenario: { ...ESTADO.cenario, escolha: 'CAEM' } });
    expect(await screen.findByText(/O cenário “Juros caem” desta comparação precisa das projeções do Focus/)).toBeInTheDocument();
  });
  it('link inválido: avisa e não carrega nada', async () => {
    localStorage.setItem(CHAVE_OFERTAS, JSON.stringify([X, Y]));
    localStorage.setItem(CHAVE_COMPARACAO, JSON.stringify(['a', 'b']));
    await abrirComLink('c1.nao-e-um-link');
    expect(await screen.findByText('Este link de comparação não pôde ser aberto.')).toHaveAttribute('role', 'alert');
    expect(screen.queryByText(/^Comparação compartilhada/)).toBeNull();
    expect(nomesDasColunas()).toEqual(['CDB 103% do CDI (Banco X)', 'CDB 110% do CDI (Banco Y)']);
    expect(location.hash).toBe('#comparar');
  });
  it('um link colado com o app aberto (só o hash muda) também abre', async () => {
    render(<App />);
    history.replaceState(null, '', `/#comparar/${await codificar(ESTADO)}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(await screen.findByText('Comparação compartilhada com 2 ofertas.')).toBeInTheDocument();
    expect(location.hash).toBe('#comparar');
  });
  it('"Voltar para a minha comparação" sai do link e volta à seleção salva', async () => {
    localStorage.setItem(CHAVE_OFERTAS, JSON.stringify([X, Y]));
    localStorage.setItem(CHAVE_COMPARACAO, JSON.stringify(['b']));
    await abrirComLink(ESTADO);
    await screen.findByText('Comparação compartilhada com 2 ofertas.');
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para a minha comparação' }));
    expect(nomesDasColunas()).toEqual(['CDB 110% do CDI (Banco Y)']);
  });
  it('"Salvar estas ofertas no catálogo" grava as do link', async () => {
    await abrirComLink(ESTADO);
    await screen.findByText('Comparação compartilhada com 2 ofertas.');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar estas ofertas no catálogo' }));
    expect(salvas(CHAVE_OFERTAS)).toEqual([expect.objectContaining(LCI), expect.objectContaining(CDB)]);
    expect(screen.getByText('2 ofertas salvas no catálogo.')).toBeInTheDocument();
  });
});

describe('App: compartilhar', () => {
  it('o link leva a comparação e o cenário em uso (manual, sem os indicadores)', async () => {
    const writeText = vi.fn(async () => {});
    comClipboard({ writeText });
    localStorage.setItem(CHAVE_OFERTAS, JSON.stringify([X, Y]));
    localStorage.setItem(CHAVE_COMPARACAO, JSON.stringify(['a', 'b']));
    render(<App />);
    await within(painelAtivo()).findByText(/^Cenário: Sem dados do SGS/);
    fireEvent.click(within(painelAtivo()).getByRole('button', { name: 'Comparar' }));
    fireEvent.click(screen.getByRole('button', { name: /pular/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Compartilhar esta comparação' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const url = (writeText.mock.calls[0] as unknown as [string])[0];
    const r = await decodificar(lerEstadoDoHash(url.slice(url.indexOf('#'))) ?? '');
    if (!r.ok) throw new Error(r.erro);
    expect(r.estado.cenario.escolha).toBe('MANUAL');
    expect(r.estado.ofertas.map((o) => o.emissor)).toEqual(['Banco X', 'Banco Y']);
    expect(JSON.stringify(r.estado)).not.toMatch(/posic/i);
  });
});

describe('App: "Você sabia?", dicas e "Ver lição"', () => {
  it('o "Você sabia?" muda a cada visita', () => {
    render(<App />);
    const cartao = () => screen.getByRole('complementary', { name: 'Você sabia?' });
    expect(cartao()).toHaveTextContent(VOCE_SABIA[0]?.texto ?? '');
    cleanup();
    render(<App />);
    expect(cartao()).toHaveTextContent(VOCE_SABIA[1]?.texto ?? '');
  });
  it('"Ver lição" do "Você sabia?" abre a lição na aba Aprender, com o foco no título', () => {
    render(<App />);
    const item = VOCE_SABIA[0];
    const titulo = licaoPorId(item?.licao ?? 'impostos')?.titulo ?? '';
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Você sabia?' })).getByRole('link', { name: `Ver lição: ${titulo}` }));
    expect(aba('Aprender')).toHaveAttribute('aria-selected', 'true');
    expect(location.hash).toBe(`#aprender/${item?.licao}`);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: titulo }));
  });
  it('dispensar uma dica fica gravado e ela não volta na próxima visita', async () => {
    const lci = { ...X, id: 'l', produto: 'LCI', emissor: 'Banco L', conglomerado: 'L', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.9 } };
    localStorage.setItem(CHAVE_OFERTAS, JSON.stringify([lci, Y]));
    localStorage.setItem(CHAVE_COMPARACAO, JSON.stringify(['l', 'b']));
    render(<App />);
    fireEvent.click(within(painelAtivo()).getByRole('button', { name: 'Comparar' }));
    fireEvent.click(screen.getByRole('button', { name: /pular/i }));
    const dicas = screen.getByRole('complementary', { name: 'Dicas' });
    const antes = within(dicas).getAllByRole('listitem').length;
    fireEvent.click(within(dicas).getByRole('button', { name: 'Dispensar a dica 1' }));
    expect(salvas(CHAVE_PROGRESSO).dicasDispensadas).toEqual(['dica-prazo-minimo']);
    const depois = screen.queryByRole('complementary', { name: 'Dicas' });
    expect(depois === null ? 0 : within(depois).getAllByRole('listitem').length).toBe(antes - 1);
  });
});

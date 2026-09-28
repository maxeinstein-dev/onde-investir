// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { CHAVE_COMPARACAO } from '../../src/armazenamento/comparacao';
import { exportarDados } from '../../src/armazenamento/arquivo';
import { CHAVE_OFERTAS } from '../../src/armazenamento/ofertas';
import { CHAVE_POSICOES } from '../../src/armazenamento/posicoes';
import { CHAVE_PREFERENCIAS } from '../../src/armazenamento/preferencias';
import {
  urlCalendarioCopom, urlFocusAnuais, urlFocusIpcaMensal, urlFocusSelic, urlSgsUltimos,
} from '../../src/dados/bcb';
import type { OfertaCadastrada } from '../../src/engine/ofertas';
import type { Posicao } from '../../src/engine/posicoes';
import { App } from '../../src/ui/App';
import { idColuna } from '../../src/ui/comparacao/TabelaComparacao';
import copom from '../fixtures/bcb/copom.json';
import focusAnuais from '../fixtures/bcb/focus-anuais.json';
import focusIpcaMensal from '../fixtures/bcb/focus-ipca-mensal.json';
import focusSelic from '../fixtures/bcb/focus-selic.json';
import sgs226 from '../fixtures/bcb/sgs-226.json';
import sgs432 from '../fixtures/bcb/sgs-432.json';
import sgs433 from '../fixtures/bcb/sgs-433.json';
import sgs4389 from '../fixtures/bcb/sgs-4389.json';
import { graficos } from './graficos/mockChart';

// Sem canvas no jsdom: o Chart.js falso guarda a configuração de cada gráfico.
vi.mock('chart.js', () => import('./graficos/mockChart'));
vi.mock('chartjs-plugin-annotation', () => ({ default: { id: 'annotation' } }));

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
  graficos.length = 0;
});

const painel = () => screen.getByRole('region', { name: 'Indicadores e cenário' });
const aba = (nome: string) => screen.getByRole('tab', { name: nome });

const base = { conglomerado: 'G', liquidez: 'DIARIA' };
const X = { ...base, id: 'a', emissor: 'Banco X', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 } };
const Y = { ...base, id: 'b', emissor: 'Banco Y', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.1 } };
/** Grava o catálogo e, se vier, a seleção da comparação, como uma visita anterior faria. */
function semear(ofertas: unknown[], selecao?: string[]) {
  localStorage.setItem(CHAVE_OFERTAS, JSON.stringify(ofertas));
  if (selecao) localStorage.setItem(CHAVE_COMPARACAO, JSON.stringify(selecao));
}
const painelAtivo = () => screen.getByRole('tabpanel');
const colunas = () => within(painelAtivo()).queryAllByRole('columnheader').filter((c) => c.getAttribute('scope') === 'col');
const nomesDasColunas = () => colunas().map((c) => c.querySelector('.tabela-comparacao__nome')?.textContent);
const salvas = (chave: string) => JSON.parse(localStorage.getItem(chave) ?? 'null');

describe('App', () => {
  it('abre em "Comparar", com duas abas', () => {
    vi.stubGlobal('fetch', fetchForaDoAr);
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Rende' })).toBeInTheDocument();
    expect(screen.getByText(/não é recomendação de investimento/)).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Comparar', 'Catálogo']);
    expect(aba('Comparar')).toHaveAttribute('aria-selected', 'true');
    expect(within(painelAtivo()).getByRole('heading', { level: 2, name: 'Comparar' })).toBeInTheDocument();
  });
  it.each(['#duelo', '#ofertas'])('o hash antigo %s leva para "Comparar"', (hash) => {
    vi.stubGlobal('fetch', fetchForaDoAr);
    history.replaceState(null, '', `/${hash}`);
    render(<App />);
    expect(aba('Comparar')).toHaveAttribute('aria-selected', 'true');
    expect(location.hash).toBe('#comparar');
  });
  it('clicar em "Catálogo" muda o hash e a aba; #catalogo abre nela', () => {
    vi.stubGlobal('fetch', fetchForaDoAr);
    render(<App />);
    fireEvent.click(aba('Catálogo'));
    expect(location.hash).toBe('#catalogo');
    expect(within(painelAtivo()).getByRole('heading', { name: 'Catálogo de ofertas' })).toBeInTheDocument();
    cleanup();
    render(<App />);
    expect(aba('Catálogo')).toHaveAttribute('aria-selected', 'true');
  });
  it('mostra que está buscando os indicadores enquanto carrega', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<App />);
    expect(within(painel()).getByText('Buscando indicadores no Banco Central…').closest('[aria-live="polite"]')).not.toBeNull();
  });
  it('se o navegador recusar a gravação, avisa com um alerta persistente', () => {
    vi.stubGlobal('fetch', fetchForaDoAr);
    const gravar = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('cheio', 'QuotaExceededError');
    });
    onTestFinished(() => gravar.mockRestore());
    render(<App />);
    const aviso = 'Não deu para salvar neste navegador. Exporte suas ofertas para não perdê-las.';
    expect(screen.queryByText(aviso)).toBeNull();
    fireEvent.click(aba('Catálogo'));
    const catalogo = painelAtivo();
    fireEvent.input(within(catalogo).getByLabelText('Emissor'), { target: { value: 'Banco X' } });
    fireEvent.input(within(catalogo).getByLabelText('Conglomerado'), { target: { value: 'Grupo X' } });
    fireEvent.click(within(catalogo).getByRole('button', { name: 'Adicionar oferta' }));
    expect(screen.getByText(aviso)).toHaveAttribute('role', 'alert');
    // Continua na tela depois de outras ações.
    fireEvent.click(aba('Comparar'));
    expect(screen.getByText(aviso)).toBeInTheDocument();
  });
  it('se falhar ao gravar a seleção da comparação, também avisa', () => {
    vi.stubGlobal('fetch', fetchForaDoAr);
    semear([X, Y]);
    render(<App />);
    const gravar = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('cheio', 'QuotaExceededError');
    });
    onTestFinished(() => gravar.mockRestore());
    fireEvent.click(within(painelAtivo()).getByRole('button', { name: /^\+ Adicionar oferta/ }));
    fireEvent.click(within(painelAtivo()).getByRole('button', { name: 'Adicionar CDB 103% do CDI (Banco X)' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Não deu para salvar neste navegador.');
  });
  it('se falhar ao gravar as preferências, também avisa', async () => {
    vi.stubGlobal('fetch', fetchFixtures);
    render(<App />);
    await within(painel()).findByText(/medianas do Focus/);
    const gravar = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    onTestFinished(() => gravar.mockRestore());
    fireEvent.click(within(painel()).getByRole('radio', { name: /Juros sobem/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Não deu para salvar neste navegador. Exporte suas ofertas para não perdê-las.');
  });
  it('com fetch rejeitando, mostra o aviso de cenário manual e a comparação funciona', async () => {
    vi.stubGlobal('fetch', fetchForaDoAr);
    semear([X, Y], ['a', 'b']);
    render(<App />);
    expect(await within(painel()).findByText('Sem dados do SGS: usando o cenário manual.')).toBeInTheDocument();
    expect(within(painel()).getByRole('radio', { name: /Manual/ })).toBeChecked();
    expect(within(painel()).getByRole('radio', { name: /Base/ })).toBeDisabled();
    expect(within(painelAtivo()).getByText(/^Cenário: Sem dados do SGS: usando o cenário manual./)).toBeInTheDocument();
    fireEvent.click(within(painelAtivo()).getByRole('button', { name: 'Comparar' }));
    expect(screen.getByRole('heading', { name: 'Qual lidera em 5 anos?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'B: CDB 110% do CDI (Banco Y)' }));
    expect(screen.getByText('Você acertou.')).toBeInTheDocument();
    expect(within(painelAtivo()).getByRole('rowgroup', { name: 'Valor líquido' })).toBeInTheDocument();
  });
  it('com os indicadores, usa o cenário Base do Focus, buscando uma vez só', async () => {
    vi.stubGlobal('fetch', fetchFixtures);
    semear([X, Y], ['a', 'b']);
    render(<App />);
    expect(await within(painel()).findByText('Selic e IPCA seguem as medianas do Focus de 18/09/2026.')).toBeInTheDocument();
    expect(within(painel()).getByRole('radio', { name: /Base/ })).toBeChecked();
    expect(fetchFixtures).toHaveBeenCalledTimes(RESPOSTAS.size);
    expect(within(painelAtivo()).getByText(/medianas do Focus de 18\/09\/2026/)).toBeInTheDocument();
    fireEvent.click(within(painelAtivo()).getByRole('button', { name: 'Comparar' }));
    fireEvent.click(screen.getByRole('button', { name: /pular/i }));
    expect(screen.getByRole('heading', { name: 'Resultado da comparação' })).toBeInTheDocument();
    expect(fetchFixtures).toHaveBeenCalledTimes(RESPOSTAS.size);
    // Com o cenário projetado, o gráfico do valor líquido sombreia a faixa em que a projeção vira premissa.
    // O Chart.js é carregado sob demanda: os gráficos aparecem depois do import dinâmico.
    await waitFor(() => expect(graficos).toHaveLength(2));
    const anotacoes = (graficos.at(-2)?.config.options?.plugins as { annotation: { annotations: Record<string, { type: string; label?: { content?: string } }> } })
      .annotation.annotations;
    expect(anotacoes.premissa).toMatchObject({ type: 'box', label: { content: 'premissa' } });
  });
  it('trocar para "Juros sobem" muda a explicação e fica salvo', async () => {
    vi.stubGlobal('fetch', fetchFixtures);
    render(<App />);
    await within(painel()).findByText(/medianas do Focus/);
    fireEvent.click(within(painel()).getByRole('radio', { name: /Juros sobem/ }));
    expect(within(painel()).getByText(/^Juros sobem: Selic e IPCA 1 desvio-padrão acima/)).toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(localStorage.getItem(CHAVE_PREFERENCIAS) ?? '{}').escolha).toBe('SOBEM'));
  });
  it('cadastrar uma oferta no catálogo salva no localStorage e sobrevive à recarga', () => {
    vi.stubGlobal('fetch', fetchForaDoAr);
    render(<App />);
    fireEvent.click(aba('Catálogo'));
    const catalogo = painelAtivo();
    fireEvent.input(within(catalogo).getByLabelText('Emissor'), { target: { value: 'Banco X' } });
    fireEvent.input(within(catalogo).getByLabelText('Conglomerado'), { target: { value: 'Grupo X' } });
    fireEvent.click(within(catalogo).getByRole('button', { name: 'Adicionar oferta' }));
    const lista = salvas(CHAVE_OFERTAS);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ produto: 'CDB', emissor: 'Banco X', conglomerado: 'Grupo X', liquidez: 'DIARIA' });
    cleanup();
    render(<App />);
    expect(screen.getByRole('article', { name: /A: CDB 100% do CDI/ })).toBeInTheDocument();
  });

  it('importar um arquivo v2 no catálogo grava também as posições', async () => {
    vi.stubGlobal('fetch', fetchForaDoAr);
    render(<App />);
    fireEvent.click(aba('Catálogo'));
    const posicao = { ...X, valorAplicado: 10_000, dataAplicacao: '2026-01-05', eventos: [] };
    const arquivo = new File([exportarDados([X as OfertaCadastrada], [posicao as Posicao], Date.now())], 'dados.json', { type: 'application/json' });
    fireEvent.change(within(painelAtivo()).getByLabelText('Importar ofertas (.json)'), { target: { files: [arquivo] } });
    expect(await within(painelAtivo()).findByText('1 oferta e 1 posição importadas.')).toBeInTheDocument();
    expect(salvas(CHAVE_OFERTAS)).toHaveLength(1);
    const gravadas = salvas(CHAVE_POSICOES);
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0]).toMatchObject({ emissor: 'Banco X', valorAplicado: 10_000, dataAplicacao: '2026-01-05' });
    expect(gravadas[0].id).toMatch(/^p-/);
  });

  describe('catálogo e comparação', () => {
    it('na primeira carga, sem seleção salva, a comparação começa vazia mesmo com ofertas no catálogo', () => {
      vi.stubGlobal('fetch', fetchForaDoAr);
      semear([X, Y]);
      render(<App />);
      expect(within(painelAtivo()).getByText('Adicione pelo menos duas ofertas para comparar (até 5).')).toBeInTheDocument();
      expect(colunas()).toHaveLength(0);
      expect(localStorage.getItem(CHAVE_COMPARACAO)).toBeNull();
    });
    it('"Comparar" no catálogo adiciona, troca de aba e leva o foco para a coluna nova', () => {
      vi.stubGlobal('fetch', fetchForaDoAr);
      semear([X, Y], ['b']);
      history.replaceState(null, '', '/#catalogo');
      render(<App />);
      const cartaoX = () => screen.getByRole('article', { name: /A: CDB 103% do CDI/ });
      fireEvent.click(within(cartaoX()).getByRole('button', { name: 'Comparar' }));
      expect(aba('Comparar')).toHaveAttribute('aria-selected', 'true');
      expect(location.hash).toBe('#comparar');
      expect(nomesDasColunas()).toEqual(['CDB 110% do CDI (Banco Y)', 'CDB 103% do CDI (Banco X)']);
      expect(document.getElementById(idColuna(1))).toHaveFocus();
      expect(salvas(CHAVE_COMPARACAO)).toEqual(['b', 'a']);
      // De volta ao catálogo, o cartão diz que já está na comparação.
      fireEvent.click(aba('Catálogo'));
      expect(within(cartaoX()).getByRole('button', { name: 'Na comparação ✓' })).toBeDisabled();
    });
    it('remover do catálogo tira a oferta da comparação', () => {
      vi.stubGlobal('fetch', fetchForaDoAr);
      semear([X, Y], ['a', 'b']);
      history.replaceState(null, '', '/#catalogo');
      render(<App />);
      const cartaoX = screen.getByRole('article', { name: /A: CDB 103% do CDI/ });
      fireEvent.click(within(cartaoX).getByRole('button', { name: 'Remover' }));
      fireEvent.click(within(cartaoX).getByRole('button', { name: 'Sim, remover' }));
      expect(salvas(CHAVE_COMPARACAO)).toEqual(['b']);
      fireEvent.click(aba('Comparar'));
      expect(nomesDasColunas()).toEqual(['CDB 110% do CDI (Banco Y)']);
    });
    it('a seleção persiste ao recarregar, na ordem', () => {
      vi.stubGlobal('fetch', fetchForaDoAr);
      semear([X, Y]);
      render(<App />);
      const adicionarDoCatalogo = (nome: string) => {
        fireEvent.click(within(painelAtivo()).getByRole('button', { name: /^\+ Adicionar oferta/ }));
        fireEvent.click(within(painelAtivo()).getByRole('button', { name: `Adicionar ${nome}` }));
      };
      adicionarDoCatalogo('CDB 110% do CDI (Banco Y)');
      adicionarDoCatalogo('CDB 103% do CDI (Banco X)');
      expect(salvas(CHAVE_COMPARACAO)).toEqual(['b', 'a']);
      cleanup();
      render(<App />);
      expect(nomesDasColunas()).toEqual(['CDB 110% do CDI (Banco Y)', 'CDB 103% do CDI (Banco X)']);
    });
    it('seleção salva com ids que não existem mais: eles somem', () => {
      vi.stubGlobal('fetch', fetchForaDoAr);
      semear([X, Y], ['sumiu', 'b']);
      render(<App />);
      expect(nomesDasColunas()).toEqual(['CDB 110% do CDI (Banco Y)']);
    });
    it('criar uma oferta pelo seletor grava no catálogo e na comparação', () => {
      vi.stubGlobal('fetch', fetchForaDoAr);
      render(<App />);
      const p = painelAtivo();
      fireEvent.click(within(p).getByRole('button', { name: /^\+ Adicionar oferta/ }));
      fireEvent.input(within(p).getByLabelText('Emissor'), { target: { value: 'Banco Novo' } });
      fireEvent.input(within(p).getByLabelText('Conglomerado'), { target: { value: 'Grupo Novo' } });
      fireEvent.click(within(p).getByRole('button', { name: 'Salvar no catálogo e comparar' }));
      const catalogo = salvas(CHAVE_OFERTAS);
      expect(catalogo).toHaveLength(1);
      expect(catalogo[0]).toMatchObject({ emissor: 'Banco Novo' });
      expect(salvas(CHAVE_COMPARACAO)).toEqual([catalogo[0].id]);
      expect(colunas()).toHaveLength(1);
      fireEvent.click(aba('Catálogo'));
      expect(screen.getByRole('article', { name: /A: CDB 100% do CDI/ })).toBeInTheDocument();
    });
  });

  describe('o objeto do cenário só muda quando muda o que ele usa', () => {
    const verResultado = () => {
      fireEvent.click(within(painelAtivo()).getByRole('button', { name: 'Comparar' }));
      // Pular desliga os palpites: da segunda vez, o resultado vem direto.
      const pular = screen.queryByRole('button', { name: /pular/i });
      if (pular) fireEvent.click(pular);
      expect(screen.getByRole('heading', { name: 'Resultado da comparação' })).toBeInTheDocument();
    };
    const resultado = () => screen.queryByRole('heading', { name: 'Resultado da comparação' });
    it('no Manual (por falta de dados), mudar as premissas não invalida o resultado', async () => {
      vi.stubGlobal('fetch', fetchForaDoAr);
      semear([X, Y], ['a', 'b']);
      render(<App />);
      await within(painel()).findByText('Sem dados do SGS: usando o cenário manual.');
      verResultado();
      fireEvent.input(within(painel()).getByLabelText('Desvios-padrão (k)'), { target: { value: '2' } });
      expect(resultado()).toBeInTheDocument();
      // Os valores manuais, sim, mudam o cenário.
      fireEvent.input(within(painel()).getByLabelText('CDI (% a.a.)'), { target: { value: '12' } });
      expect(resultado()).toBeNull();
    });
    it('no Manual escolhido, mudar as premissas não invalida; num projetado, invalida', async () => {
      vi.stubGlobal('fetch', fetchFixtures);
      semear([X, Y], ['a', 'b']);
      render(<App />);
      await within(painel()).findByText(/medianas do Focus/);
      fireEvent.click(within(painel()).getByRole('radio', { name: /Manual/ }));
      verResultado();
      fireEvent.input(within(painel()).getByLabelText('Desvios-padrão (k)'), { target: { value: '2' } });
      expect(resultado()).toBeInTheDocument();
      fireEvent.click(within(painel()).getByRole('radio', { name: /Juros sobem/ }));
      verResultado();
      fireEvent.input(within(painel()).getByLabelText('Desvios-padrão (k)'), { target: { value: '1.5' } });
      expect(resultado()).toBeNull();
    });
  });
  it('com um rascunho inválido no painel, "Comparar" fica desabilitado, com o aviso', async () => {
    vi.stubGlobal('fetch', fetchForaDoAr);
    semear([X, Y], ['a', 'b']);
    render(<App />);
    await within(painel()).findByText('Sem dados do SGS: usando o cenário manual.');
    const aviso = 'Corrija o cenário no painel antes de comparar.';
    const conferir = (bloqueado: boolean) => {
      const p = painelAtivo();
      const botao = within(p).getByRole('button', { name: 'Comparar' });
      if (bloqueado) {
        expect(botao).toBeDisabled();
        expect(within(p).getByText(aviso)).toBeInTheDocument();
      } else {
        expect(botao).toBeEnabled();
        expect(within(p).queryByText(aviso)).toBeNull();
      }
    };
    fireEvent.input(within(painel()).getByLabelText('CDI (% a.a.)'), { target: { value: '' } });
    conferir(true);
    fireEvent.input(within(painel()).getByLabelText('CDI (% a.a.)'), { target: { value: '13' } });
    conferir(false);
    fireEvent.input(within(painel()).getByLabelText('Desvios-padrão (k)'), { target: { value: '-1' } });
    conferir(true);
    fireEvent.click(within(painel()).getByRole('button', { name: 'Restaurar padrão' }));
    conferir(false);
  });
  it('o comparador e o catálogo ficam montados juntos sem ids repetidos, com o seletor e o palpite abertos', () => {
    vi.stubGlobal('fetch', fetchForaDoAr);
    semear([X, Y, { ...X, id: 'c', emissor: 'Banco Z' }], ['a', 'b']);
    render(<App />);
    const p = painelAtivo();
    fireEvent.click(within(p).getByRole('button', { name: 'Comparar' }));
    fireEvent.click(within(p).getByRole('button', { name: /^\+ Adicionar oferta/ }));
    expect(document.getElementById('comparador-palpite-titulo')).not.toBeNull();
    expect(document.getElementById('comparador-nova-titulo')).not.toBeNull();
    expect(document.getElementById('cadastro-titulo')).not.toBeNull();
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { useMemo, useState } from 'preact/hooks';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PREFERENCIAS_PADRAO, type PreferenciasCenario } from '../../src/armazenamento/preferencias';
import { explicarCenario } from '../../src/conteudo/comparacao';
import {
  urlCalendarioCopom, urlFocusAnuais, urlFocusIpcaMensal, urlFocusSelic, urlSgsUltimos,
} from '../../src/dados/bcb';
import { cenarioAtivo } from '../../src/dados/cenarios';
import { carregarIndicadores, type Buscar, type IndicadoresCarregados } from '../../src/dados/indicadores';
import { PREMISSAS_PADRAO } from '../../src/engine/projecao';
import { PainelIndicadores } from '../../src/ui/PainelIndicadores';
import { SEM_INDICADORES } from '../../src/ui/useIndicadores';
import copom from '../fixtures/bcb/copom.json';
import focusAnuais from '../fixtures/bcb/focus-anuais.json';
import focusIpcaMensal from '../fixtures/bcb/focus-ipca-mensal.json';
import focusSelic from '../fixtures/bcb/focus-selic.json';
import sgs226 from '../fixtures/bcb/sgs-226.json';
import sgs432 from '../fixtures/bcb/sgs-432.json';
import sgs433 from '../fixtures/bcb/sgs-433.json';
import sgs4389 from '../fixtures/bcb/sgs-4389.json';

afterEach(cleanup);

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
const buscar: Buscar = async (url) =>
  (RESPOSTAS.has(url) ? { ok: true, status: 200, json: async () => structuredClone(RESPOSTAS.get(url)) } : { ok: false, status: 404, json: async () => null });

let ind: IndicadoresCarregados;
beforeAll(async () => {
  const dados = new Map<string, string>();
  ind = await carregarIndicadores({
    buscar, armazenamento: { getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => void dados.set(k, v) },
    agoraMs: Date.parse('2026-09-27T12:00:00-03:00'),
  });
});

/** O painel com o estado e o cálculo do cenário como o App faz. */
function ComEstado({ indicadores, inicial = PREFERENCIAS_PADRAO, aoMudar = () => {} }: {
  indicadores: IndicadoresCarregados | null; inicial?: PreferenciasCenario; aoMudar?: (p: PreferenciasCenario) => void;
}) {
  const [p, setP] = useState(inicial);
  const ativo = useMemo(() => cenarioAtivo(indicadores === null ? 'MANUAL' : p.escolha, indicadores ?? SEM_INDICADORES, p.premissas, p.manual), [indicadores, p]);
  const explicacao = explicarCenario(ativo.projetado, ativo.motivoManual, { dataColetaFocus: indicadores?.focus?.dataColeta, k: p.premissas.k });
  return <PainelIndicadores indicadores={indicadores} preferencias={p} ativo={ativo} explicacao={explicacao}
    onChange={(n) => { setP(n); aoMudar(n); }} />;
}

const radio = (nome: RegExp) => screen.getByRole('radio', { name: nome });
const manual = { ...PREFERENCIAS_PADRAO, escolha: 'MANUAL' as const };

describe('PainelIndicadores', () => {
  it('enquanto carrega, avisa em aria-live e deixa o manual disponível', () => {
    render(<ComEstado indicadores={null} />);
    expect(screen.getByText('Buscando indicadores no Banco Central…')).toHaveAttribute('aria-live', 'polite');
    expect(radio(/Manual/)).toBeChecked();
    expect(radio(/Base/)).toBeDisabled();
  });

  it('mostra os valores atuais em pt-BR, a data de referência e a origem de cada grupo', () => {
    render(<ComEstado indicadores={ind} />);
    const valores = screen.getByRole('list', { name: 'Indicadores atuais' });
    expect(within(valores).getByText('13,65% a.a.')).toBeInTheDocument();
    expect(within(valores).getByText('13,75% a.a.')).toBeInTheDocument();
    expect(within(valores).getByText('4,22%')).toBeInTheDocument();
    expect(within(valores).getByText('0,1646% a.m.')).toBeInTheDocument();
    for (const nome of ['CDI', 'Selic meta', 'IPCA 12 meses', 'TR']) {
      expect(within(valores).getByRole('button', { name: nome })).toHaveAttribute('aria-expanded', 'false');
    }
    expect(screen.getByText(/Valores de 24\/09\/2026/)).toBeInTheDocument();
    const origem = screen.getByRole('list', { name: 'Origem dos dados' });
    expect(within(origem).getAllByText(/atualizado agora/)).toHaveLength(3);
  });

  it('origem do cache, do cache vencido e indisponível', () => {
    const doCache: IndicadoresCarregados = {
      ...ind,
      reunioes: null,
      status: { sgs: 'CACHE', focus: 'CACHE_VENCIDO', copom: 'FALHOU' },
      obtidoEm: { sgs: Date.parse('2026-09-27T09:30:00-03:00'), focus: Date.parse('2026-09-20T15:00:00-03:00') },
    };
    render(<ComEstado indicadores={doCache} />);
    const origem = screen.getByRole('list', { name: 'Origem dos dados' });
    expect(within(origem).getByText(/Valores atuais \(SGS\): do cache de 27\/09 09:30/)).toBeInTheDocument();
    expect(within(origem).getByText(/Focus: cache vencido de 20\/09/)).toBeInTheDocument();
    expect(within(origem).getByText(/Calendário do Copom: indisponível/)).toBeInTheDocument();
  });

  it('com o Focus FALHOU, os projetados ficam desabilitados, com o motivo, e o Manual selecionado', () => {
    const semFocus: IndicadoresCarregados = { ...ind, focus: null, status: { ...ind.status, focus: 'FALHOU' }, obtidoEm: { sgs: ind.obtidoEm.sgs } };
    render(<ComEstado indicadores={semFocus} />);
    for (const nome of [/Juros sobem/, /Base/, /Juros caem/]) expect(radio(nome)).toBeDisabled();
    expect(radio(/Manual/)).toBeChecked();
    expect(screen.getAllByText('(sem dados do Focus)')).toHaveLength(3);
    expect(screen.getByText('Sem dados do Focus: usando o cenário manual.')).toBeInTheDocument();
    expect(screen.getByLabelText('CDI (% a.a.)')).toBeInTheDocument();
  });

  it('trocar para "Juros sobem" chama onChange e mostra a explicação do cenário', () => {
    const aoMudar = vi.fn();
    render(<ComEstado indicadores={ind} aoMudar={aoMudar} />);
    expect(radio(/Base/)).toBeChecked();
    expect(screen.queryByLabelText('CDI (% a.a.)')).toBeNull();
    fireEvent.click(radio(/Juros sobem/));
    expect(aoMudar).toHaveBeenLastCalledWith({ ...PREFERENCIAS_PADRAO, escolha: 'SOBEM' });
    expect(screen.getByText(/^Juros sobem: Selic e IPCA 1 desvio-padrão acima/)).toBeInTheDocument();
  });

  describe('premissas', () => {
    it('ficam em "Ajustar premissas", em unidades humanas', () => {
      render(<ComEstado indicadores={ind} />);
      const detalhes = screen.getByText('Ajustar premissas').closest('details');
      expect(detalhes).not.toBeNull();
      expect(detalhes).not.toHaveAttribute('open');
      expect(screen.getByLabelText('Desvios-padrão (k)')).toHaveValue(1);
      expect(screen.getByLabelText('IPCA de longo prazo (% a.a.)')).toHaveValue(3);
      expect(screen.getByLabelText('Juro real de longo prazo (% a.a.)')).toHaveValue(5);
      expect(screen.getByLabelText('Anos de convergência')).toHaveValue(5);
      expect(screen.getByLabelText('Spread do CDI (p.p.)')).toHaveValue(0.1);
    });
    it('premissa válida propaga em fração', () => {
      const aoMudar = vi.fn();
      render(<ComEstado indicadores={ind} aoMudar={aoMudar} />);
      fireEvent.input(screen.getByLabelText('IPCA de longo prazo (% a.a.)'), { target: { value: '3.5' } });
      expect(aoMudar).toHaveBeenLastCalledWith({ ...PREFERENCIAS_PADRAO, premissas: { ...PREMISSAS_PADRAO, ipcaLongoPrazoAA: 0.035 } });
    });
    it.each([
      ['Desvios-padrão (k)', '-1', 'Os desvios-padrão (k) precisam ser um número maior ou igual a zero.'],
      ['IPCA de longo prazo (% a.a.)', '', 'Preencha o IPCA de longo prazo.'],
      ['Juro real de longo prazo (% a.a.)', '-100', 'O juro real de longo prazo precisa ser maior que −100%.'],
      ['Anos de convergência', '2.5', 'Os anos de convergência precisam ser um número inteiro de 0 a 30.'],
      ['Spread do CDI (p.p.)', '5', 'O spread do CDI precisa ficar entre 0 e 5 p.p. (sem chegar a 5).'],
    ])('%s inválido mostra o erro e não propaga', (rotulo, valor, mensagem) => {
      const aoMudar = vi.fn();
      render(<ComEstado indicadores={ind} aoMudar={aoMudar} />);
      fireEvent.input(screen.getByLabelText(rotulo), { target: { value: valor } });
      expect(screen.getByRole('alert')).toHaveTextContent(mensagem);
      expect(aoMudar).not.toHaveBeenCalled();
    });
    it('"Restaurar padrão" volta aos valores padrão e limpa o erro', () => {
      const aoMudar = vi.fn();
      const inicial = { ...PREFERENCIAS_PADRAO, premissas: { ...PREMISSAS_PADRAO, k: 2 } };
      render(<ComEstado indicadores={ind} inicial={inicial} aoMudar={aoMudar} />);
      expect(screen.getByLabelText('Desvios-padrão (k)')).toHaveValue(2);
      fireEvent.input(screen.getByLabelText('Anos de convergência'), { target: { value: '' } });
      expect(screen.getByRole('alert')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrão' }));
      expect(aoMudar).toHaveBeenLastCalledWith({ ...inicial, premissas: PREMISSAS_PADRAO });
      expect(screen.getByLabelText('Desvios-padrão (k)')).toHaveValue(1);
      expect(screen.getByLabelText('Anos de convergência')).toHaveValue(5);
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe('cenário manual (migrado do App do M1)', () => {
    it('labels do cenário manual são texto simples, com o Termo ao lado', () => {
      render(<ComEstado indicadores={ind} inicial={manual} />);
      const label = document.querySelector('label[for="manual-cdi"]');
      expect(label).toHaveTextContent(/^CDI \(% a\.a\.\)$/);
      expect(label?.querySelector('button, [role="note"]')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /o que é cdi/i }));
      expect(screen.getByLabelText('CDI (% a.a.)')).toHaveAttribute('id', 'manual-cdi');
    });
    it('valor manual válido propaga', () => {
      const aoMudar = vi.fn();
      render(<ComEstado indicadores={ind} inicial={manual} aoMudar={aoMudar} />);
      fireEvent.input(screen.getByLabelText('CDI (% a.a.)'), { target: { value: '12' } });
      expect(aoMudar).toHaveBeenLastCalledWith({ ...manual, manual: { ...manual.manual, cdi: 12 } });
    });
    it('CDI vazio continua vazio e gera alerta, sem propagar', () => {
      const aoMudar = vi.fn();
      render(<ComEstado indicadores={ind} inicial={manual} aoMudar={aoMudar} />);
      const cdi = screen.getByLabelText('CDI (% a.a.)') as HTMLInputElement;
      fireEvent.input(cdi, { target: { value: '' } });
      expect(cdi.value).toBe('');
      expect(screen.getByRole('alert')).toHaveTextContent('Preencha o CDI do cenário.');
      expect(aoMudar).not.toHaveBeenCalled();
    });
    it.each([
      ['Selic meta (% a.a.)', 'Preencha a Selic meta do cenário.'],
      ['IPCA (% a.a.)', 'Preencha o IPCA do cenário.'],
      ['TR (% a.m.)', 'Preencha a TR do cenário.'],
    ])('%s vazio gera alerta', (rotulo, mensagem) => {
      const aoMudar = vi.fn();
      render(<ComEstado indicadores={ind} inicial={manual} aoMudar={aoMudar} />);
      const campo = screen.getByLabelText(rotulo) as HTMLInputElement;
      fireEvent.input(campo, { target: { value: '' } });
      expect(campo.value).toBe('');
      expect(screen.getByRole('alert')).toHaveTextContent(mensagem);
      expect(aoMudar).not.toHaveBeenCalled();
    });
    it('corrigir o campo tira o alerta', () => {
      render(<ComEstado indicadores={ind} inicial={manual} />);
      const cdi = screen.getByLabelText('CDI (% a.a.)');
      fireEvent.input(cdi, { target: { value: '' } });
      fireEvent.input(cdi, { target: { value: '13' } });
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});

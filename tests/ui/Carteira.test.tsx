// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HistoricoCarregado } from '../../src/dados/historico';
import { RegraNaoEncontradaError } from '../../src/engine/erros';
import { cenarioConstante, type Cenario } from '../../src/engine/indexadores';
import { type Posicao, valorAtual } from '../../src/engine/posicoes';
import { formatarMoeda } from '../../src/formato';
import { Carteira, type PropsCarteira } from '../../src/ui/carteira/Carteira';
import type { EstadoHistorico } from '../../src/ui/useHistorico';

const CEN = cenarioConstante({ cdiAA: 0.1365, selicMetaAA: 0.1375, ipcaAA: 0.0422, trAM: 0.001646 });
const HOJE = '2026-09-28';
/** O toHaveTextContent troca o espaço fixo do formato de moeda por espaço comum. */
const moeda = (v: number) => formatarMoeda(v).replace(/\s/g, ' ');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-28T12:00:00-03:00'));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const cdb: Posicao = {
  id: 'p-a', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 }, emissor: 'Banco A', conglomerado: 'Grupo A',
  liquidez: 'NO_VENCIMENTO', vencimento: '2028-01-03', valorAplicado: 10_000, dataAplicacao: '2026-01-05', eventos: [],
};
const PRONTO: EstadoHistorico = {
  fase: 'pronto',
  carregado: { series: null, status: 'REDE', faltando: [], limitado: false, inicio: '2026-01-01' } as HistoricoCarregado,
};

type Props = Partial<PropsCarteira> & { inicial?: Posicao[]; aoMudar?: (p: Posicao[]) => void };
function Tela({ inicial = [], aoMudar = () => {}, ...resto }: Props) {
  const [posicoes, setPosicoes] = useState(inicial);
  let n = 0;
  return (
    <Carteira posicoes={posicoes} onChange={(p) => { setPosicoes(p); aoMudar(p); }} cenario={CEN} historico={PRONTO}
      lacunas={0} historicoInvalido={false} conglomerados={[]} gerarId={() => `p-novo-${++n}`} {...resto} />
  );
}

const preencher = (rotulo: string | RegExp, valor: string) => fireEvent.input(screen.getByLabelText(rotulo), { target: { value: valor } });
const cartao = (nome: RegExp) => screen.getByRole('article', { name: nome });
const adicionar = () => fireEvent.click(screen.getByRole('button', { name: 'Adicionar posição' }));

describe('aba Carteira', () => {
  it('título "Carteira" e, sem posições, a dica', () => {
    render(<Tela />);
    expect(screen.getByRole('heading', { level: 2, name: 'Carteira' })).toBeInTheDocument();
    expect(screen.getByText(/Cadastre as aplicações que você já tem/)).toBeInTheDocument();
  });

  describe('formulário', () => {
    it('reaproveita o cadastro de oferta e acrescenta valor aplicado, data da aplicação (até hoje) e o extrato', () => {
      render(<Tela />);
      expect(screen.getByRole('heading', { name: 'Nova posição' })).toBeInTheDocument();
      expect(screen.getByLabelText('Produto')).toBeInTheDocument();
      expect(screen.getByLabelText('Custo extra (% ao ano, opcional)')).toBeInTheDocument();
      expect(screen.getByLabelText('Valor aplicado (R$)')).toBeInTheDocument();
      const data = screen.getByLabelText('Data da aplicação');
      expect(data).toHaveAttribute('max', HOJE);
      expect(data).toHaveAttribute('min', '1990-01-01');
      expect(screen.getByLabelText('Valor do extrato (R$, opcional)')).toBeInTheDocument();
      expect(screen.getByLabelText('Data do extrato')).toHaveAttribute('max', HOJE);
      expect(screen.getByLabelText('O extrato mostra o valor')).toHaveValue('BRUTO');
      // O prazo mínimo da LCI/LCA não vale para quem já aplicou.
      fireEvent.change(screen.getByLabelText('Produto'), { target: { value: 'LCI' } });
      expect(screen.queryByText(/Prazo mínimo legal/)).toBeNull();
    });

    it('cadastrar grava a posição com id novo, sem eventos, e limpa o formulário', () => {
      const aoMudar = vi.fn();
      render(<Tela aoMudar={aoMudar} />);
      preencher('Emissor', 'Banco B');
      preencher('Conglomerado', 'Grupo B');
      preencher('Valor aplicado (R$)', '15000');
      preencher('Data da aplicação', '2026-02-02');
      preencher('Valor do extrato (R$, opcional)', '15900');
      preencher('Data do extrato', '2026-09-01');
      fireEvent.change(screen.getByLabelText('O extrato mostra o valor'), { target: { value: 'LIQUIDO' } });
      adicionar();
      expect(aoMudar).toHaveBeenLastCalledWith([{
        id: 'p-novo-1', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 }, emissor: 'Banco B', conglomerado: 'Grupo B',
        liquidez: 'DIARIA', valorAplicado: 15_000, dataAplicacao: '2026-02-02', valorExtrato: 15_900, dataExtrato: '2026-09-01',
        baseExtrato: 'LIQUIDO', eventos: [],
      }]);
      expect(screen.getByLabelText('Valor aplicado (R$)')).toHaveValue(null);
      expect(screen.getByLabelText('Data da aplicação')).toHaveValue('');
    });

    it.each([
      ['sem o valor aplicado', {}, 'Preencha o valor aplicado.'],
      ['sem a data da aplicação', { valor: '1000' }, 'Informe a data da aplicação.'],
      ['aplicação depois de hoje', { valor: '1000', data: '2026-10-01' }, 'A data de aplicação não pode ser depois de hoje.'],
      ['extrato sem data', { valor: '1000', data: '2026-02-02', extrato: '1100' }, 'Informe a data do extrato.'],
      ['data do extrato sem valor', { valor: '1000', data: '2026-02-02', dataExtrato: '2026-09-01' }, 'Preencha o valor do extrato.'],
      ['extrato antes da aplicação', { valor: '1000', data: '2026-02-02', extrato: '1100', dataExtrato: '2026-01-02' },
        'A data do extrato precisa ficar entre a aplicação e hoje.'],
    ])('%s: a mensagem, e nada é salvo', (_, campos: { valor?: string; data?: string; extrato?: string; dataExtrato?: string }, msg) => {
      const aoMudar = vi.fn();
      render(<Tela aoMudar={aoMudar} />);
      preencher('Emissor', 'Banco B');
      preencher('Conglomerado', 'Grupo B');
      if (campos.valor) preencher('Valor aplicado (R$)', campos.valor);
      if (campos.data) preencher('Data da aplicação', campos.data);
      if (campos.extrato) preencher('Valor do extrato (R$, opcional)', campos.extrato);
      if (campos.dataExtrato) preencher('Data do extrato', campos.dataExtrato);
      adicionar();
      expect(screen.getByRole('alert')).toHaveTextContent(msg);
      expect(aoMudar).not.toHaveBeenCalled();
    });

    it('o erro some quando a pessoa muda um campo da posição', () => {
      render(<Tela />);
      preencher('Emissor', 'Banco B');
      preencher('Conglomerado', 'Grupo B');
      adicionar();
      expect(screen.getByRole('alert')).toBeInTheDocument();
      preencher('Valor aplicado (R$)', '100');
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('editar abre com os dados, leva o foco ao título e mantém extrato e custo', () => {
      const aoMudar = vi.fn();
      const comTudo: Posicao = { ...cdb, custoExtraAA: 0.002, valorExtrato: 10_500, dataExtrato: '2026-09-01' };
      render(<Tela inicial={[comTudo]} aoMudar={aoMudar} />);
      fireEvent.click(within(cartao(/CDB/)).getByRole('button', { name: 'Editar' }));
      expect(screen.getByRole('heading', { name: 'Editar posição' })).toHaveFocus();
      expect(screen.getByLabelText('Valor aplicado (R$)')).toHaveValue(10_000);
      preencher('Valor aplicado (R$)', '12000');
      fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
      expect(aoMudar).toHaveBeenLastCalledWith([{ ...comTudo, valorAplicado: 12_000 }]);
      expect(screen.getByRole('heading', { level: 3, name: /CDB 100% do CDI/ })).toHaveFocus();
    });

    it('remover pede confirmação e leva o foco ao título da seção', () => {
      const aoMudar = vi.fn();
      render(<Tela inicial={[cdb]} aoMudar={aoMudar} />);
      fireEvent.click(within(cartao(/CDB/)).getByRole('button', { name: 'Remover' }));
      fireEvent.click(screen.getByRole('button', { name: 'Sim, remover' }));
      expect(aoMudar).toHaveBeenLastCalledWith([]);
      expect(screen.getByRole('heading', { level: 2, name: 'Carteira' })).toHaveFocus();
    });
  });

  describe('lista', () => {
    it('cada posição com o conglomerado, a data da aplicação e o valor de hoje, bruto e líquido', () => {
      render(<Tela inicial={[cdb]} />);
      const v = valorAtual(cdb, HOJE, CEN);
      const c = cartao(/CDB 100% do CDI \(Banco A\)/);
      expect(c).toHaveTextContent('Conglomerado: Grupo A');
      expect(c).toHaveTextContent(`Aplicado em 05/01/2026: ${moeda(10_000)}`);
      expect(c).toHaveTextContent(`Hoje: ${moeda(v.bruto)} bruto, ${moeda(v.liquido)} líquido`);
    });

    it('extrato coerente: o valor, o calculado e a diferença, sem aviso', () => {
      const calculado = valorAtual(cdb, '2026-09-01', CEN).bruto;
      render(<Tela inicial={[{ ...cdb, valorExtrato: Math.round(calculado * 1.002 * 100) / 100, dataExtrato: '2026-09-01' }]} />);
      const c = cartao(/CDB/);
      expect(c).toHaveTextContent('Extrato de 01/09/2026 (bruto)');
      expect(c).toHaveTextContent(`O app calcula ${moeda(calculado)} nessa data: diferença de +0,2%`);
      expect(c).not.toHaveTextContent('A diferença passa de 1%');
    });

    it('extrato suspeito: o aviso', () => {
      const calculado = valorAtual(cdb, '2026-09-01', CEN).bruto;
      render(<Tela inicial={[{ ...cdb, valorExtrato: Math.round(calculado * 0.95), dataExtrato: '2026-09-01' }]} />);
      expect(cartao(/CDB/)).toHaveTextContent('A diferença passa de 1%. Confira a taxa e a data digitadas.');
    });

    it('Tesouro Prefixado com extrato: o texto da marcação a mercado, nunca o de suspeita', () => {
      const pre: Posicao = {
        ...cdb, id: 'p-t', produto: 'TESOURO_PREFIXADO', indexacao: { tipo: 'PRE', taxaAA: 0.13 }, emissor: 'Tesouro Nacional',
        conglomerado: 'Tesouro Nacional', liquidez: 'DIARIA', vencimento: '2031-01-01', valorExtrato: 9_000, dataExtrato: '2026-09-01',
      };
      render(<Tela inicial={[pre]} />);
      const c = cartao(/Tesouro Prefixado/);
      expect(c).toHaveTextContent('O extrato do Tesouro mostra o preço de mercado');
      expect(c).not.toHaveTextContent('A diferença passa de 1%');
    });

    it('posição vencida: "Venceu em" e o valor no vencimento', () => {
      const vencida: Posicao = { ...cdb, dataAplicacao: '2025-01-06', vencimento: '2026-01-05' };
      render(<Tela inicial={[vencida]} />);
      const v = valorAtual(vencida, HOJE, CEN);
      expect(cartao(/CDB/)).toHaveTextContent('Venceu em 05/01/2026');
      expect(cartao(/CDB/)).toHaveTextContent(`No vencimento: ${moeda(v.bruto)} bruto`);
    });

    it('posição não calculada: o motivo, fora do total', () => {
      const quebra: Cenario = { ...CEN, selicOverAA: (d) => { throw new RegraNaoEncontradaError('Selic over', d); } };
      const selic: Posicao = {
        ...cdb, id: 'p-s', produto: 'TESOURO_SELIC', indexacao: { tipo: 'SELIC' }, emissor: 'Tesouro Nacional',
        conglomerado: 'Tesouro Nacional', liquidez: 'DIARIA', vencimento: '2031-03-01',
      };
      render(<Tela inicial={[cdb, selic]} cenario={quebra} />);
      expect(cartao(/Tesouro Selic/)).toHaveTextContent('Não deu para calcular: A regra "Selic over" não está cadastrada');
      const v = valorAtual(cdb, HOJE, quebra);
      const total = screen.getByRole('region', { name: 'Total da carteira' });
      expect(total).toHaveTextContent(`${moeda(v.bruto)} bruto`);
      expect(total).toHaveTextContent('1 posição ficou de fora');
    });

    it('total bruto e líquido', () => {
      const b: Posicao = { ...cdb, id: 'p-b', emissor: 'Banco B', valorAplicado: 20_000 };
      render(<Tela inicial={[cdb, b]} />);
      const va = valorAtual(cdb, HOJE, CEN);
      const vb = valorAtual(b, HOJE, CEN);
      const total = screen.getByRole('region', { name: 'Total da carteira' });
      expect(total).toHaveTextContent(`${moeda(va.bruto + vb.bruto)} bruto`);
      expect(total).toHaveTextContent(`${moeda(va.liquido + vb.liquido)} líquido`);
    });
  });

  describe('exposição ao FGC', () => {
    const a1: Posicao = { ...cdb, valorAplicado: 100_000, vencimento: '2027-01-04' };
    const a2: Posicao = { ...cdb, id: 'p-a2', emissor: 'Banco A2', conglomerado: 'grupo  a', valorAplicado: 100_000, vencimento: '2029-01-02' };
    const tesouro: Posicao = {
      ...cdb, id: 'p-t', produto: 'TESOURO_SELIC', indexacao: { tipo: 'SELIC' }, emissor: 'Tesouro Nacional',
      conglomerado: 'Tesouro Nacional', liquidez: 'DIARIA', vencimento: '2031-03-01', valorAplicado: 30_000,
    };

    it('uma barra acessível por conglomerado, até o limite, com o valor de hoje e o do vencimento mais distante', () => {
      render(<Tela inicial={[a1, a2, tesouro]} />);
      const fgc = screen.getByRole('region', { name: /Exposição ao FGC/ });
      const hoje = valorAtual(a1, HOJE, CEN).bruto + valorAtual(a2, HOJE, CEN).bruto;
      const barra = within(fgc).getByLabelText(/^Grupo A:/);
      expect(barra.tagName).toBe('METER');
      expect(barra).toHaveAttribute('min', '0');
      expect(barra).toHaveAttribute('max', '250000');
      expect(Number(barra.getAttribute('value'))).toBeCloseTo(hoje, 2);
      expect(fgc).toHaveTextContent(`Grupo A: ${moeda(hoje)} hoje, de R$ 250 mil`);
      const fim = valorAtual(a1, '2029-01-02', CEN).bruto + valorAtual(a2, '2029-01-02', CEN).bruto;
      expect(fgc).toHaveTextContent(`No vencimento mais distante (02/01/2029): ${moeda(fim)}`);
      expect(fgc.querySelectorAll('meter')).toHaveLength(1);
    });

    it('o alerta quando passa do limite, com a data', () => {
      render(<Tela inicial={[a1, a2]} />);
      const fgc = screen.getByRole('region', { name: /Exposição ao FGC/ });
      expect(fgc).toHaveTextContent(/O total no conglomerado Grupo A passa do limite do FGC em \d\d\/\d\d\/\d{4}/);
    });

    it('o Tesouro fica à parte, sem limite do FGC', () => {
      render(<Tela inicial={[a1, tesouro]} />);
      const fgc = screen.getByRole('region', { name: /Exposição ao FGC/ });
      expect(fgc).toHaveTextContent(`Tesouro Nacional (sem limite do FGC): ${moeda(valorAtual(tesouro, HOJE, CEN).bruto)}`);
    });

    it('teto global: a garantia somada; acima de R$ 1 milhão, o texto qualitativo', () => {
      const { unmount } = render(<Tela inicial={[a1]} />);
      expect(screen.getByRole('region', { name: /Exposição ao FGC/ })).toHaveTextContent(/Garantia somada: R\$ .* de R\$ 1 milhão/);
      unmount();
      const cinco = ['A', 'B', 'C', 'D', 'E'].map((g) => ({ ...cdb, id: `p-${g}`, conglomerado: `Grupo ${g}`, valorAplicado: 240_000 }));
      render(<Tela inicial={cinco} />);
      const fgc = screen.getByRole('region', { name: /Exposição ao FGC/ });
      expect(fgc).toHaveTextContent('Acima do teto global do FGC');
      expect(fgc).toHaveTextContent('O app não calcula essa janela');
    });
  });

  describe('histórico do Banco Central', () => {
    const status = () => screen.getByRole('status');
    const carregado = (c: Partial<HistoricoCarregado>): EstadoHistorico => ({
      fase: 'pronto',
      carregado: { series: null, status: 'REDE', faltando: [], limitado: false, inicio: '2026-01-01', ...c } as HistoricoCarregado,
    });
    const series = { ultimaData: '2026-09-25' } as HistoricoCarregado['series'];

    it('carregando: "Buscando o histórico do Banco Central…" num contêiner vivo que fica montado', () => {
      const { rerender } = render(<Tela inicial={[cdb]} historico={{ fase: 'carregando' }} />);
      const s = status();
      expect(s).toHaveTextContent('Buscando o histórico do Banco Central…');
      rerender(<Tela inicial={[cdb]} historico={carregado({ series })} />);
      expect(status()).toBe(s);
      expect(s).toHaveTextContent('Valores calculados com o histórico do Banco Central até 25/09/2026.');
    });
    it('histórico incompleto (série faltando ou lacunas): o aviso', () => {
      const { rerender } = render(<Tela inicial={[cdb]} historico={carregado({ series, faltando: [{ serie: 433, ano: 2026 }] })} />);
      expect(status()).toHaveTextContent('Valor calculado sem histórico completo: faltam IPCA (2026).');
      rerender(<Tela inicial={[cdb]} historico={carregado({ series })} lacunas={3} />);
      expect(status()).toHaveTextContent('Valor calculado sem histórico completo: faltam 3 dias úteis do CDI.');
    });
    it('limitado a 10 anos: o aviso', () => {
      render(<Tela inicial={[cdb]} historico={carregado({ series, limitado: true, inicio: '2016-01-01' })} />);
      expect(status()).toHaveTextContent('O histórico cobre só os últimos 10 anos, desde 01/01/2016. Antes disso, vale o cenário.');
    });
    it('sem histórico nenhum: o aviso de que o valor sai pelo cenário', () => {
      render(<Tela inicial={[cdb]} historico={carregado({ series: null, status: 'FALHOU' })} />);
      expect(status()).toHaveTextContent('Não deu para buscar o histórico do Banco Central. Os valores saem pelo cenário.');
    });
    it('sem posições, o contêiner fica vazio', () => {
      render(<Tela historico={{ fase: 'inativo' }} />);
      expect(status()).toHaveTextContent('');
    });
  });
});

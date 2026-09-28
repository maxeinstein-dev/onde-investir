// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIMITE_OBJETIVOS, type ObjetivoSalvo } from '../../../src/armazenamento/objetivos';
import type { OfertaCadastrada } from '../../../src/engine/ofertas';
import { Objetivos } from '../../../src/ui/objetivos/Objetivos';
import { graficos } from '../graficos/mockChartPizza';

vi.mock('chart.js', () => import('../graficos/mockChartPizza'));

afterEach(() => {
  cleanup();
  graficos.length = 0;
});

const HOJE = '2026-09-29';

function ComEstado({ inicial = [], aoMudar = () => {} }: { inicial?: ObjetivoSalvo[]; aoMudar?: (o: ObjetivoSalvo[]) => void }) {
  const [objetivos, setObjetivos] = useState(inicial);
  let n = 0;
  return (
    <Objetivos objetivos={objetivos} gerarId={() => `novo-${++n}`} onChange={(o) => { setObjetivos(o); aoMudar(o); }}
      catalogo={[]} carteira={[]} hoje={HOJE} onIrParaComparar={() => {}} />
  );
}

const cartao = (nome: RegExp) => screen.getByRole('article', { name: nome });

describe('Objetivos — estado vazio e criação', () => {
  it('estado vazio', () => {
    render(<ComEstado />);
    expect(screen.getByText('Cadastre um objetivo para receber uma sugestão de carteira.')).toBeInTheDocument();
  });

  it('cria um objetivo de cada tipo', () => {
    const aoMudar = vi.fn();
    render(<ComEstado aoMudar={aoMudar} />);

    fireEvent.click(screen.getByRole('button', { name: '+ Novo objetivo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reserva de emergência' }));
    fireEvent.input(screen.getByLabelText('Gasto mensal (R$)'), { target: { value: '2000' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    expect(aoMudar).toHaveBeenLastCalledWith([
      { id: 'novo-1', nome: undefined, criadoEm: HOJE, entradas: { tipo: 'RESERVA', gastoMensal: 2000, rendaEstavel: true } },
    ]);
    expect(cartao(/Objetivo sem nome/)).toBeInTheDocument();
  });

  it('o limite de objetivos desabilita "+ Novo objetivo" com uma mensagem', () => {
    const muitos: ObjetivoSalvo[] = Array.from({ length: LIMITE_OBJETIVOS }, (_, i) => ({
      id: `o${i}`, criadoEm: HOJE, entradas: { tipo: 'SEM_OBJETIVO', horizonteAnos: 1 },
    }));
    render(<ComEstado inicial={muitos} />);
    expect(screen.queryByRole('button', { name: '+ Novo objetivo' })).toBeNull();
    expect(screen.getByText(`Limite de ${LIMITE_OBJETIVOS} objetivos: remova um para cadastrar outro.`)).toBeInTheDocument();
  });
});

describe('Objetivos — editar e remover', () => {
  const existente: ObjetivoSalvo = {
    id: 'o1', nome: 'Minha reserva', criadoEm: HOJE, entradas: { tipo: 'RESERVA', gastoMensal: 1000, rendaEstavel: true },
  };
  const outro: ObjetivoSalvo = {
    id: 'o2', nome: 'Viagem', criadoEm: HOJE, entradas: { tipo: 'COM_DATA', valorAlvo: 5000, data: '2030-01-01' },
  };

  it('editar atualiza o objetivo', () => {
    const aoMudar = vi.fn();
    render(<ComEstado inicial={[existente]} aoMudar={aoMudar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.input(screen.getByLabelText('Gasto mensal (R$)'), { target: { value: '3000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(aoMudar).toHaveBeenLastCalledWith([
      { ...existente, entradas: { tipo: 'RESERVA', gastoMensal: 3000, rendaEstavel: true } },
    ]);
  });

  it('remover pede confirmação inline (nunca window.confirm)', () => {
    const aoMudar = vi.fn();
    const confirmar = vi.spyOn(window, 'confirm');
    render(<ComEstado inicial={[existente, outro]} aoMudar={aoMudar} />);
    fireEvent.click(within(cartao(/Viagem/)).getByRole('button', { name: 'Remover' }));
    expect(within(cartao(/Viagem/)).getByText(/Remover este objetivo\?/)).toBeInTheDocument();
    fireEvent.click(within(cartao(/Viagem/)).getByRole('button', { name: 'Sim, remover' }));
    expect(aoMudar).toHaveBeenLastCalledWith([existente]);
    expect(confirmar).not.toHaveBeenCalled();
  });

  it('remover o último objetivo leva o foco ao título "Objetivos"', () => {
    render(<ComEstado inicial={[existente]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim, remover' }));
    expect(screen.getByRole('heading', { name: 'Objetivos' })).toHaveFocus();
  });

  it('remover um objetivo do meio leva o foco ao próximo cartão', () => {
    render(<ComEstado inicial={[existente, outro]} />);
    fireEvent.click(within(cartao(/Minha reserva/)).getByRole('button', { name: 'Remover' }));
    fireEvent.click(within(cartao(/Minha reserva/)).getByRole('button', { name: 'Sim, remover' }));
    expect(screen.getByRole('heading', { name: 'Viagem' })).toHaveFocus();
  });
});

describe('Objetivos — ver sugestão', () => {
  const existente: ObjetivoSalvo = {
    id: 'o1', nome: 'Minha reserva', criadoEm: HOJE, entradas: { tipo: 'RESERVA', gastoMensal: 1000, rendaEstavel: true },
  };

  it('mostra a sugestão calculada e volta para a lista', async () => {
    render(<ComEstado inicial={[existente]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver sugestão' }));
    await waitFor(() => expect(graficos.length).toBeGreaterThanOrEqual(1));
    expect(screen.getByRole('heading', { level: 2, name: 'Minha reserva' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para Objetivos' }));
    expect(screen.getByRole('heading', { name: 'Objetivos' })).toBeInTheDocument();
  });

  it('"Comparar" numa fatia chama onIrParaComparar', async () => {
    const cdb: OfertaCadastrada = {
      id: 'c1', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 }, emissor: 'X', conglomerado: 'X', liquidez: 'DIARIA',
    };
    const onIrParaComparar = vi.fn();
    render(
      <Objetivos objetivos={[existente]} onChange={() => {}} catalogo={[cdb]} carteira={[]} hoje={HOJE} onIrParaComparar={onIrParaComparar} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ver sugestão' }));
    await waitFor(() => expect(graficos.length).toBeGreaterThanOrEqual(1));
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    expect(onIrParaComparar).toHaveBeenCalledWith(cdb);
  });
});

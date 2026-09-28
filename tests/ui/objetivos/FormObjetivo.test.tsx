// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ObjetivoSalvo } from '../../../src/armazenamento/objetivos';
import { FormObjetivo } from '../../../src/ui/objetivos/FormObjetivo';

afterEach(cleanup);

const preencher = (rotulo: string, valor: string) => fireEvent.input(screen.getByLabelText(rotulo), { target: { value: valor } });
const salvar = () => fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));

describe('FormObjetivo — RESERVA', () => {
  it('preenche e salva', () => {
    const onSalvar = vi.fn();
    render(<FormObjetivo tipo="RESERVA" onSalvar={onSalvar} onCancelar={() => {}} />);
    preencher('Nome do objetivo (opcional)', 'Minha reserva');
    preencher('Gasto mensal (R$)', '3000');
    fireEvent.click(screen.getByRole('radio', { name: 'Variável' }));
    salvar();
    expect(onSalvar).toHaveBeenCalledWith('Minha reserva', { tipo: 'RESERVA', gastoMensal: 3000, rendaEstavel: false });
  });
  it('gasto mensal inválido não salva e mostra alerta', () => {
    const onSalvar = vi.fn();
    render(<FormObjetivo tipo="RESERVA" onSalvar={onSalvar} onCancelar={() => {}} />);
    salvar();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });
});

describe('FormObjetivo — COM_DATA', () => {
  it('preenche e salva', () => {
    const onSalvar = vi.fn();
    render(<FormObjetivo tipo="COM_DATA" onSalvar={onSalvar} onCancelar={() => {}} />);
    preencher('Valor-alvo (R$)', '50000');
    preencher('Data', '2030-01-01');
    salvar();
    expect(onSalvar).toHaveBeenCalledWith(undefined, { tipo: 'COM_DATA', valorAlvo: 50000, data: '2030-01-01' });
  });
  it('data no passado não salva', () => {
    const onSalvar = vi.fn();
    render(<FormObjetivo tipo="COM_DATA" onSalvar={onSalvar} onCancelar={() => {}} />);
    preencher('Valor-alvo (R$)', '50000');
    preencher('Data', '2020-01-01');
    salvar();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });
});

describe('FormObjetivo — LONGO_PRAZO / SEM_OBJETIVO', () => {
  it('preenche e salva LONGO_PRAZO', () => {
    const onSalvar = vi.fn();
    render(<FormObjetivo tipo="LONGO_PRAZO" onSalvar={onSalvar} onCancelar={() => {}} />);
    preencher('Horizonte (anos)', '15');
    salvar();
    expect(onSalvar).toHaveBeenCalledWith(undefined, { tipo: 'LONGO_PRAZO', horizonteAnos: 15 });
  });
  it('horizonte não inteiro não salva', () => {
    const onSalvar = vi.fn();
    render(<FormObjetivo tipo="SEM_OBJETIVO" onSalvar={onSalvar} onCancelar={() => {}} />);
    preencher('Horizonte (anos)', '5.5');
    salvar();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });
});

describe('FormObjetivo — edição e cancelar', () => {
  const inicial: ObjetivoSalvo = {
    id: 'obj-1', nome: 'Casa', criadoEm: '2026-01-01', entradas: { tipo: 'COM_DATA', valorAlvo: 100000, data: '2030-01-01' },
  };
  it('inicial preenche o formulário', () => {
    render(<FormObjetivo tipo="COM_DATA" onSalvar={() => {}} onCancelar={() => {}} inicial={inicial} />);
    expect(screen.getByLabelText('Nome do objetivo (opcional)')).toHaveValue('Casa');
    expect(screen.getByLabelText('Valor-alvo (R$)')).toHaveValue(100000);
    expect(screen.getByLabelText('Data')).toHaveValue('2030-01-01');
  });
  it('cancelar não chama onSalvar', () => {
    const onSalvar = vi.fn();
    const onCancelar = vi.fn();
    render(<FormObjetivo tipo="COM_DATA" onSalvar={onSalvar} onCancelar={onCancelar} inicial={inicial} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onSalvar).not.toHaveBeenCalled();
    expect(onCancelar).toHaveBeenCalled();
  });
});

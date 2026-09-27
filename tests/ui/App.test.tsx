// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/ui/App';
import { somarDias } from '../../src/engine/datas';
import { hoje } from '../../src/ui/hoje';

afterEach(cleanup);
beforeEach(() => localStorage.clear());

describe('App', () => {
  it('esconde o resultado até o palpite e depois explica', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    expect(screen.getByRole('heading', { name: /qual você acha que rende mais/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Resultado' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'LCI 80% do CDI' }));
    expect(screen.getByRole('heading', { name: 'Resultado' })).toBeInTheDocument();
    expect(screen.getByText(/Você errou/)).toBeInTheDocument();
    expect(screen.getByText(/CDB 103% do CDI termina com/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Equivalências de CDB 103% do CDI/ })).toBeInTheDocument();
  });
  it('pular desliga os palpites e vale para a próxima comparação', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    fireEvent.click(screen.getByRole('button', { name: /pular/i }));
    expect(screen.getByRole('heading', { name: 'Resultado' })).toBeInTheDocument();
    cleanup();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    expect(screen.getByRole('heading', { name: 'Resultado' })).toBeInTheDocument();
  });
  it('explica o erro de prazo mínimo da LCI', () => {
    render(<App />);
    fireEvent.input(screen.getByLabelText('Data do resgate'), { target: { value: somarDias(hoje(), 30) } });
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/prazo mínimo legal/);
  });
});

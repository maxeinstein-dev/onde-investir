// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Termo } from '../../src/ui/Termo';
import { PalpiteAntesDeVer } from '../../src/ui/PalpiteAntesDeVer';

afterEach(cleanup);

describe('Termo', () => {
  it('abre e fecha a explicação', () => {
    render(<p>Rende <Termo id="cdi">CDI</Termo></p>);
    const botao = screen.getByRole('button', { name: 'CDI' });
    expect(botao).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(botao);
    expect(botao).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('note')).toHaveTextContent(/empréstimos de um dia/);
    fireEvent.click(botao);
    expect(screen.queryByRole('note')).toBeNull();
  });
});

describe('PalpiteAntesDeVer', () => {
  it('escolher e pular', () => {
    const escolher = vi.fn();
    const pular = vi.fn();
    render(<PalpiteAntesDeVer nomeA="CDB 103% do CDI" nomeB="LCI 80% do CDI" onEscolher={escolher} onPular={pular} />);
    fireEvent.click(screen.getByRole('button', { name: 'LCI 80% do CDI' }));
    expect(escolher).toHaveBeenCalledWith('B');
    fireEvent.click(screen.getByRole('button', { name: /pular/i }));
    expect(pular).toHaveBeenCalled();
  });
});

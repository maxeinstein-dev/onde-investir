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
    const painel = document.getElementById(botao.getAttribute('aria-controls') ?? '');
    expect(painel).not.toBeNull();
    expect(botao).toHaveAttribute('aria-expanded', 'false');
    expect(painel).toHaveAttribute('hidden');
    fireEvent.click(botao);
    expect(botao).toHaveAttribute('aria-expanded', 'true');
    expect(painel).not.toHaveAttribute('hidden');
    expect(screen.getByRole('note')).toHaveTextContent(/empréstimos de um dia/);
    fireEvent.click(botao);
    expect(painel).toHaveAttribute('hidden');
    expect(screen.queryByRole('note')).toBeNull();
  });
});

describe('PalpiteAntesDeVer', () => {
  it('escolher e pular', () => {
    const escolher = vi.fn();
    const pular = vi.fn();
    render(<PalpiteAntesDeVer id="teste" opcoes={['CDB 103% do CDI', 'LCI 80% do CDI']} onEscolher={escolher} onPular={pular} />);
    fireEvent.click(screen.getByRole('button', { name: 'B: LCI 80% do CDI' }));
    expect(escolher).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: /pular/i }));
    expect(pular).toHaveBeenCalled();
  });
  it('um botão por opção, com letras, e ids com o prefixo recebido', () => {
    render(
      <>
        <PalpiteAntesDeVer id="um" opcoes={['X', 'Y', 'Z']} pergunta="Qual lidera em 5 anos?" onEscolher={() => {}} onPular={() => {}} />
        <PalpiteAntesDeVer id="dois" opcoes={['X', 'Y']} onEscolher={() => {}} onPular={() => {}} />
      </>,
    );
    const um = screen.getByRole('region', { name: 'Qual lidera em 5 anos?' });
    expect(um.querySelectorAll('button')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'C: Z' })).toBeInTheDocument();
    expect(document.getElementById('um-titulo')).toHaveTextContent('Qual lidera em 5 anos?');
    expect(document.getElementById('dois-titulo')).toHaveTextContent('Antes de ver: qual você acha que rende mais?');
  });
});

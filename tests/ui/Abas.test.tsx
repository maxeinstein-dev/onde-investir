// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Abas } from '../../src/ui/Abas';

afterEach(cleanup);
beforeEach(() => history.replaceState(null, '', '/'));

const ABAS = [
  { id: 'ofertas', rotulo: 'Comparar ofertas', conteudo: <p>Conteúdo das ofertas</p> },
  { id: 'duelo', rotulo: 'Duelo rápido', conteudo: <p>Conteúdo do duelo</p> },
];
const aba = (nome: string) => screen.getByRole('tab', { name: nome });

describe('Abas', () => {
  it('tablist rotulada, primeira aba ativa por padrão e só o painel dela visível', () => {
    render(<Abas rotulo="Seções" abas={ABAS} />);
    expect(screen.getByRole('tablist', { name: 'Seções' })).toBeInTheDocument();
    expect(aba('Comparar ofertas')).toHaveAttribute('aria-selected', 'true');
    expect(aba('Duelo rápido')).toHaveAttribute('aria-selected', 'false');
    expect(aba('Comparar ofertas')).toHaveAttribute('tabindex', '0');
    expect(aba('Duelo rápido')).toHaveAttribute('tabindex', '-1');
    const painel = screen.getByRole('tabpanel');
    expect(painel).toHaveTextContent('Conteúdo das ofertas');
    expect(painel).toHaveAccessibleName('Comparar ofertas');
    expect(aba('Comparar ofertas')).toHaveAttribute('aria-controls', painel.id);
    expect(screen.getByText('Conteúdo do duelo')).not.toBeVisible();
  });
  it('abre na aba do hash', () => {
    history.replaceState(null, '', '/#duelo');
    render(<Abas rotulo="Seções" abas={ABAS} />);
    expect(aba('Duelo rápido')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Conteúdo do duelo');
  });
  it('hash desconhecido abre a primeira', () => {
    history.replaceState(null, '', '/#outra');
    render(<Abas rotulo="Seções" abas={ABAS} />);
    expect(aba('Comparar ofertas')).toHaveAttribute('aria-selected', 'true');
  });
  it('clicar troca a aba e o hash', () => {
    render(<Abas rotulo="Seções" abas={ABAS} />);
    fireEvent.click(aba('Duelo rápido'));
    expect(location.hash).toBe('#duelo');
    expect(aba('Duelo rápido')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Conteúdo do duelo');
  });
  it('setas trocam de aba, com volta, e levam o foco', () => {
    render(<Abas rotulo="Seções" abas={ABAS} />);
    aba('Comparar ofertas').focus();
    fireEvent.keyDown(aba('Comparar ofertas'), { key: 'ArrowRight' });
    expect(aba('Duelo rápido')).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(aba('Duelo rápido'));
    expect(location.hash).toBe('#duelo');
    fireEvent.keyDown(aba('Duelo rápido'), { key: 'ArrowRight' });
    expect(aba('Comparar ofertas')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(aba('Comparar ofertas'), { key: 'ArrowLeft' });
    expect(aba('Duelo rápido')).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(aba('Duelo rápido'));
  });
  it('voltar no navegador (hashchange) troca a aba', () => {
    render(<Abas rotulo="Seções" abas={ABAS} />);
    history.replaceState(null, '', '/#duelo');
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(aba('Duelo rápido')).toHaveAttribute('aria-selected', 'true');
  });
  it('o painel escondido mantém o estado (fica montado)', () => {
    render(<Abas rotulo="Seções" abas={ABAS} />);
    fireEvent.click(aba('Duelo rápido'));
    expect(screen.getByText('Conteúdo das ofertas')).toBeInTheDocument();
  });
});

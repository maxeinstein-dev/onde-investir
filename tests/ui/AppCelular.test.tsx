// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/ui/App';

vi.mock('chart.js', () => import('./graficos/mockChart'));
vi.mock('chartjs-plugin-annotation', () => ({ default: { id: 'annotation' } }));

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, '', '/');
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
  vi.stubGlobal('matchMedia', (consulta: string) => ({
    matches: consulta === '(max-width: 639px)', media: consulta, addEventListener() {}, removeEventListener() {},
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const mais = () => screen.getByRole('button', { name: /^Mais/ });

describe('App no celular', () => {
  it('a tablist tem só as quatro principais; Catálogo e Aprender ficam no Mais', () => {
    render(<App />);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Comparar', 'Carteira', 'Objetivos', 'Renda variável']);
    fireEvent.click(mais());
    const lista = document.getElementById(mais().getAttribute('aria-controls') as string) as HTMLElement;
    expect(within(lista).getAllByRole('button').map((b) => b.textContent)).toEqual(['Catálogo', 'Aprender']);
  });
  it('escolher Catálogo troca o painel e leva o foco a ele', () => {
    render(<App />);
    fireEvent.click(mais());
    fireEvent.click(screen.getByRole('button', { name: 'Catálogo' }));
    expect(location.hash).toBe('#catalogo');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'painel-catalogo');
    expect(screen.getByRole('tabpanel')).toHaveFocus();
    expect(mais()).toHaveAccessibleName('Mais: Catálogo');
  });
  it('o hash #aprender abre com o Mais marcado "Mais: Aprender"', () => {
    history.replaceState(null, '', '/#aprender');
    render(<App />);
    expect(screen.getByRole('button', { name: 'Mais: Aprender' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'painel-aprender');
  });
  it('Esc com o foco no Mais e clique fora fecham a lista', () => {
    render(<App />);
    fireEvent.click(mais());
    mais().focus();
    fireEvent.keyDown(mais(), { key: 'Escape' });
    expect(mais()).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(mais());
    fireEvent.pointerDown(document.body);
    expect(mais()).toHaveAttribute('aria-expanded', 'false');
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Abas } from '../../src/ui/Abas';

const abas = ['comparar', 'catalogo', 'carteira', 'aprender'].map((id) => ({ id, rotulo: id === 'catalogo' ? 'Catálogo' : id[0]!.toUpperCase() + id.slice(1), conteudo: <p>{id}</p> }));
const SEC = ['catalogo', 'aprender'];

beforeEach(() => { history.replaceState(null, '', '/'); vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const mostrar = () => render(<Abas rotulo="Seções" abas={abas} secundarias={SEC} />);
const menuAberto = () => document.querySelector('.abas__menu');

describe('Abas no celular', () => {
  it('a tablist tem só as principais e um botão Mais (disclosure, sem aria-haspopup)', () => {
    mostrar();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Comparar', 'Carteira']);
    const mais = screen.getByRole('button', { name: 'Mais' });
    expect(mais).toHaveAttribute('aria-expanded', 'false');
    expect(mais).not.toHaveAttribute('aria-haspopup');
  });
  it('Mais abre uma lista de botões com as secundárias; escolher uma troca de aba, fecha e foca o painel', () => {
    mostrar();
    const mais = screen.getByRole('button', { name: 'Mais' });
    fireEvent.click(mais);
    expect(mais).toHaveAttribute('aria-expanded', 'true');
    const lista = document.getElementById(mais.getAttribute('aria-controls') as string) as HTMLElement;
    expect(lista.tagName).toBe('UL');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('menuitem')).toBeNull();
    const itens = within(lista).getAllByRole('button');
    expect(itens.map((i) => i.textContent)).toEqual(['Catálogo', 'Aprender']);
    expect(itens[0]).toHaveFocus();
    fireEvent.click(itens[0] as HTMLElement);
    expect(menuAberto()).toBeNull();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('catalogo');
    expect(screen.getByRole('tabpanel')).toHaveFocus();
  });
  it('com aba secundária ativa, o Mais se chama "Mais: Aprender" e marca aria-current', () => {
    history.replaceState(null, '', '/#aprender');
    mostrar();
    const mais = screen.getByRole('button', { name: 'Mais: Aprender' });
    expect(mais).toHaveAttribute('aria-current', 'true');
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('tabindex', '0');
    fireEvent.click(mais);
    expect(screen.getByRole('button', { name: 'Aprender' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Catálogo' })).not.toHaveAttribute('aria-current');
  });
  it('todos os painéis continuam montados (escondidos)', () => {
    mostrar();
    expect(document.querySelectorAll('[role="tabpanel"]')).toHaveLength(4);
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });
  it('Esc fecha a lista e devolve o foco ao Mais, com o foco na lista', () => {
    mostrar();
    const mais = screen.getByRole('button', { name: 'Mais' });
    fireEvent.click(mais);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Catálogo' }), { key: 'Escape' });
    expect(menuAberto()).toBeNull();
    expect(mais).toHaveFocus();
  });
  it('Esc fecha a lista também com o foco no Mais', () => {
    mostrar();
    const mais = screen.getByRole('button', { name: 'Mais' });
    fireEvent.click(mais);
    mais.focus();
    fireEvent.keyDown(mais, { key: 'Escape' });
    expect(menuAberto()).toBeNull();
    expect(mais).toHaveFocus();
  });
  it('Tab na lista fecha, devolve o foco ao Mais e não é cancelado', () => {
    mostrar();
    const mais = screen.getByRole('button', { name: 'Mais' });
    fireEvent.click(mais);
    const livre = fireEvent.keyDown(screen.getByRole('button', { name: 'Catálogo' }), { key: 'Tab' });
    expect(livre).toBe(true);
    expect(menuAberto()).toBeNull();
    expect(mais).toHaveFocus();
  });
  it('clique fora fecha a lista; clique dentro do Mais não', () => {
    mostrar();
    fireEvent.click(screen.getByRole('button', { name: 'Mais' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais' }));
    expect(menuAberto()).not.toBeNull();
    fireEvent.pointerDown(document.body);
    expect(menuAberto()).toBeNull();
  });
  it('setas percorrem os itens da lista', () => {
    mostrar();
    fireEvent.click(screen.getByRole('button', { name: 'Mais' }));
    const cat = screen.getByRole('button', { name: 'Catálogo' });
    const apr = screen.getByRole('button', { name: 'Aprender' });
    fireEvent.keyDown(cat, { key: 'ArrowDown' });
    expect(apr).toHaveFocus();
    fireEvent.keyDown(apr, { key: 'ArrowDown' });
    expect(cat).toHaveFocus();
  });
  it('setas e End operam só sobre as abas visíveis', () => {
    mostrar();
    const [comparar, carteira] = screen.getAllByRole('tab') as [HTMLElement, HTMLElement];
    fireEvent.keyDown(comparar, { key: 'ArrowRight' });
    expect(carteira).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(carteira, { key: 'ArrowRight' });
    expect(comparar).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(comparar, { key: 'End' });
    expect(carteira).toHaveAttribute('aria-selected', 'true');
  });
});

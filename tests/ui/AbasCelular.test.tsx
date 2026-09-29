// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Abas } from '../../src/ui/Abas';

const abas = ['comparar', 'catalogo', 'carteira', 'aprender'].map((id) => ({ id, rotulo: id === 'catalogo' ? 'Catálogo' : id[0]!.toUpperCase() + id.slice(1), conteudo: <p>{id}</p> }));
const SEC = ['catalogo', 'aprender'];

beforeEach(() => { history.replaceState(null, '', '/'); vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Abas no celular', () => {
  it('a tablist tem só as principais e um botão Mais', () => {
    render(<Abas rotulo="Seções" abas={abas} secundarias={SEC} />);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Comparar', 'Carteira']);
    expect(screen.getByRole('button', { name: /Mais/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /Mais/ })).toHaveAttribute('aria-haspopup', 'menu');
  });
  it('Mais abre um menu com as secundárias; escolher uma troca de aba e fecha', async () => {
    render(<Abas rotulo="Seções" abas={abas} secundarias={SEC} />);
    fireEvent.click(screen.getByRole('button', { name: /Mais/ }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Catálogo', 'Aprender']);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Catálogo' }));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('catalogo');
  });
  it('com aba secundária ativa, o Mais mostra o nome dela e marca aria-current', () => {
    history.replaceState(null, '', '/#aprender');
    render(<Abas rotulo="Seções" abas={abas} secundarias={SEC} />);
    expect(screen.getByRole('button', { name: /Aprender/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('tabindex', '0');
  });
  it('todos os painéis continuam montados (escondidos)', () => {
    render(<Abas rotulo="Seções" abas={abas} secundarias={SEC} />);
    expect(document.querySelectorAll('[role="tabpanel"]')).toHaveLength(4);
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });
  it('Esc fecha o menu e devolve o foco ao Mais', () => {
    render(<Abas rotulo="Seções" abas={abas} secundarias={SEC} />);
    const mais = screen.getByRole('button', { name: /Mais/ });
    fireEvent.click(mais);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(mais).toHaveFocus();
  });
  it('setas e End operam só sobre as abas visíveis', () => {
    render(<Abas rotulo="Seções" abas={abas} secundarias={SEC} />);
    const [comparar, carteira] = screen.getAllByRole('tab') as [HTMLElement, HTMLElement];
    fireEvent.keyDown(comparar, { key: 'ArrowRight' });
    expect(carteira).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(carteira, { key: 'ArrowRight' });
    expect(comparar).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(comparar, { key: 'End' });
    expect(carteira).toHaveAttribute('aria-selected', 'true');
  });
});

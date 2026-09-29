// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { PainelRecolhivel } from '../../src/ui/PainelRecolhivel';

afterEach(cleanup);
const Conteudo = () => <input aria-label="campo do painel" />;

describe('PainelRecolhivel', () => {
  it('começa fechado: o botão mostra o resumo e o conteúdo está escondido, mas montado', () => {
    render(<PainelRecolhivel resumo="Cenário: Base (Focus) · CDI 14,9%"><Conteudo /></PainelRecolhivel>);
    const botao = screen.getByRole('button', { name: /Cenário: Base/ });
    expect(botao).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('input')).not.toBeNull(); // montado
    expect(screen.getByLabelText('campo do painel')).not.toBeVisible(); // mas escondido
  });
  it('tocar abre e mostra o conteúdo; tocar de novo fecha', () => {
    render(<PainelRecolhivel resumo="Cenário: Base"><Conteudo /></PainelRecolhivel>);
    const botao = screen.getByRole('button', { name: /Cenário: Base/ });
    fireEvent.click(botao);
    expect(botao).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('campo do painel')).toBeVisible();
    fireEvent.click(botao);
    expect(screen.getByLabelText('campo do painel')).not.toBeVisible();
  });
  it('Esc fecha e devolve o foco ao botão', () => {
    render(<PainelRecolhivel resumo="Cenário: Base"><Conteudo /></PainelRecolhivel>);
    const botao = screen.getByRole('button', { name: /Cenário: Base/ });
    fireEvent.click(botao);
    screen.getByLabelText('campo do painel').focus();
    fireEvent.keyDown(screen.getByLabelText('campo do painel'), { key: 'Escape' });
    expect(botao).toHaveAttribute('aria-expanded', 'false');
    expect(botao).toHaveFocus();
  });
  it('Esc vindo de um <select> aberto não fecha o painel', () => {
    render(<PainelRecolhivel resumo="Cenário: Base"><select aria-label="lista do painel"><option>a</option></select></PainelRecolhivel>);
    const botao = screen.getByRole('button', { name: /Cenário: Base/ });
    fireEvent.click(botao);
    fireEvent.keyDown(screen.getByLabelText('lista do painel'), { key: 'Escape' });
    expect(botao).toHaveAttribute('aria-expanded', 'true');
  });
  it('o valor digitado sobrevive a fechar e reabrir', () => {
    render(<PainelRecolhivel resumo="Cenário: Base"><Conteudo /></PainelRecolhivel>);
    const botao = screen.getByRole('button', { name: /Cenário: Base/ });
    fireEvent.click(botao);
    fireEvent.input(screen.getByLabelText('campo do painel'), { target: { value: '1,5' } });
    fireEvent.click(botao);
    fireEvent.click(botao);
    expect(screen.getByLabelText('campo do painel')).toHaveValue('1,5');
  });
});

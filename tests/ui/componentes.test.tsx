// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  describe('toggletip: hover, foco, Esc e fixado', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    function montar() {
      render(<div><p>Rende <Termo id="cdi">CDI</Termo></p><p>fora</p></div>);
      const botao = screen.getByRole('button', { name: 'CDI' });
      const painel = document.getElementById(botao.getAttribute('aria-controls') ?? '')!;
      return { botao, painel };
    }
    const avancar = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
    // fireEvent.focusOut do Preact dispara "FocusOut" (o jsdom não tem onfocusout); o evento nativo é "focusout".
    const focoSai = (de: Element, para: Element) =>
      act(() => { de.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: para })); });

    it('hover abre', () => {
      const { botao, painel } = montar();
      fireEvent.pointerEnter(botao);
      expect(botao).toHaveAttribute('aria-expanded', 'true');
      expect(painel).not.toHaveAttribute('hidden');
    });
    it('sair com o mouse fecha depois do atraso', () => {
      const { botao, painel } = montar();
      fireEvent.pointerEnter(botao);
      fireEvent.pointerLeave(botao);
      avancar(100);
      expect(painel).not.toHaveAttribute('hidden');
      avancar(100);
      expect(painel).toHaveAttribute('hidden');
      expect(botao).toHaveAttribute('aria-expanded', 'false');
    });
    it('entrar no painel antes do atraso mantém aberto', () => {
      const { botao, painel } = montar();
      fireEvent.pointerEnter(botao);
      fireEvent.pointerLeave(botao);
      avancar(100);
      fireEvent.pointerEnter(painel);
      avancar(500);
      expect(painel).not.toHaveAttribute('hidden');
      fireEvent.pointerLeave(painel);
      avancar(200);
      expect(painel).toHaveAttribute('hidden');
    });
    it('foco pelo teclado abre, e o foco saindo do conjunto fecha', () => {
      const { botao, painel } = montar();
      fireEvent.focus(botao);
      expect(painel).not.toHaveAttribute('hidden');
      const fonte = screen.getByRole('link', { name: 'Fonte' });
      focoSai(botao, fonte);
      expect(painel).not.toHaveAttribute('hidden');
      focoSai(fonte, document.body);
      expect(painel).toHaveAttribute('hidden');
    });
    it('Esc fecha', () => {
      const { botao, painel } = montar();
      fireEvent.focus(botao);
      expect(painel).not.toHaveAttribute('hidden');
      fireEvent.keyDown(botao, { key: 'Escape' });
      expect(painel).toHaveAttribute('hidden');
      fireEvent.click(botao);
      fireEvent.keyDown(botao, { key: 'Escape' });
      expect(painel).toHaveAttribute('hidden');
      expect(botao).toHaveAttribute('aria-expanded', 'false');
    });
    it('clique fixa: tirar o mouse não fecha, novo clique fecha', () => {
      const { botao, painel } = montar();
      fireEvent.pointerEnter(botao);
      fireEvent.click(botao);
      fireEvent.pointerLeave(botao);
      avancar(1000);
      expect(painel).not.toHaveAttribute('hidden');
      fireEvent.click(botao);
      expect(painel).toHaveAttribute('hidden');
    });
    it('toque (sem hover) abre e fecha pelo clique', () => {
      const { botao, painel } = montar();
      fireEvent.pointerEnter(botao, { pointerType: 'touch' });
      fireEvent.pointerLeave(botao, { pointerType: 'touch' });
      fireEvent.click(botao);
      avancar(1000);
      expect(painel).not.toHaveAttribute('hidden');
      fireEvent.click(botao);
      expect(painel).toHaveAttribute('hidden');
    });
    it('clique fora fecha o fixado', () => {
      const { botao, painel } = montar();
      fireEvent.click(botao);
      fireEvent.pointerDown(screen.getByText('fora'));
      expect(painel).toHaveAttribute('hidden');
      expect(botao).toHaveAttribute('aria-expanded', 'false');
    });
    it('clique dentro do painel não fecha o fixado', () => {
      const { botao, painel } = montar();
      fireEvent.click(botao);
      fireEvent.pointerDown(painel);
      expect(painel).not.toHaveAttribute('hidden');
    });
  });
  describe('posição do painel: fixo e dentro da tela', () => {
    const MARGEM = 8;
    let largura = 1280;
    let altura = 800;
    beforeEach(() => {
      vi.spyOn(window, 'innerWidth', 'get').mockImplementation(() => largura);
      vi.spyOn(window, 'innerHeight', 'get').mockImplementation(() => altura);
    });
    afterEach(() => { vi.restoreAllMocks(); largura = 1280; altura = 800; });

    const retangulo = (left: number, top: number, width: number, height: number) =>
      ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

    /** Abre a dica com o botão e o painel nas posições dadas e devolve o top/left aplicados no painel. */
    function abrirEm(botaoRet: DOMRect, painelLargura: number, painelAltura: number) {
      render(<p>Rende <Termo id="fgc">FGC</Termo></p>);
      const botao = screen.getByRole('button', { name: 'FGC' });
      const painel = document.getElementById(botao.getAttribute('aria-controls') ?? '')!;
      vi.spyOn(botao, 'getBoundingClientRect').mockReturnValue(botaoRet);
      vi.spyOn(painel, 'getBoundingClientRect').mockReturnValue(retangulo(0, 0, painelLargura, painelAltura));
      fireEvent.click(botao);
      return { painel, top: parseFloat(painel.style.top), left: parseFloat(painel.style.left) };
    }
    function dentroDaTela(top: number, left: number, w: number, h: number) {
      expect(left).toBeGreaterThanOrEqual(MARGEM);
      expect(left + w).toBeLessThanOrEqual(largura - MARGEM);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(top + h).toBeLessThanOrEqual(altura);
    }

    it('usa a classe de painel com position: fixed', () => {
      const { painel } = abrirEm(retangulo(100, 100, 40, 20), 200, 80);
      expect(painel).toHaveClass('termo__painel');
    });
    it('por padrão fica logo abaixo do termo, alinhado a ele', () => {
      const { top, left } = abrirEm(retangulo(100, 100, 40, 20), 200, 80);
      expect(top).toBeGreaterThanOrEqual(120);
      expect(top).toBeLessThan(130);
      expect(left).toBe(100);
    });
    it('termo perto da borda direita: o painel é puxado para caber na tela', () => {
      const { top, left } = abrirEm(retangulo(1250, 100, 25, 20), 320, 80);
      dentroDaTela(top, left, 320, 80);
      expect(left).toBe(1280 - 320 - MARGEM);
    });
    it('termo perto da borda inferior: o painel vai para cima', () => {
      const { top, left } = abrirEm(retangulo(100, 760, 40, 20), 200, 120);
      dentroDaTela(top, left, 200, 120);
      expect(top + 120).toBeLessThanOrEqual(760);
    });
    it('em tela de 375px o painel cabe com a margem de 8px', () => {
      largura = 375;
      altura = 700;
      const { top, left } = abrirEm(retangulo(300, 200, 30, 20), 359, 140);
      dentroDaTela(top, left, 359, 140);
      expect(left).toBe(MARGEM);
    });
    it('reposiciona no scroll enquanto aberto', () => {
      const { painel } = abrirEm(retangulo(100, 100, 40, 20), 200, 80);
      const botao = screen.getByRole('button', { name: 'FGC' });
      vi.spyOn(botao, 'getBoundingClientRect').mockReturnValue(retangulo(100, 300, 40, 20));
      fireEvent.scroll(window);
      expect(parseFloat(painel.style.top)).toBeGreaterThanOrEqual(320);
    });
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

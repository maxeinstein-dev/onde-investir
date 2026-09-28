import type { ComponentChildren } from 'preact';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { GLOSSARIO, type IdTermo } from '../conteudo/glossario';
import { MarkdownRestrito } from './MarkdownRestrito';

/** Tempo para levar o mouse do termo até o painel (e o link "Fonte") sem a dica fechar. */
const ATRASO_FECHAR_MS = 150;
/** Distância mínima entre o painel e as bordas da tela. */
const MARGEM_TELA = 8;
/** Espaço entre o termo e o painel. */
const AFASTAMENTO = 4;

/**
 * Posição (em coordenadas da tela) do painel `position: fixed`: abaixo do termo, ou acima se não couber embaixo,
 * e deslocado na horizontal para caber na tela com a margem de 8px.
 */
function posicaoDoPainel(termo: DOMRect, largura: number, altura: number) {
  const embaixo = termo.bottom + AFASTAMENTO;
  const emCima = termo.top - AFASTAMENTO - altura;
  const top = embaixo + altura <= window.innerHeight - MARGEM_TELA || emCima < MARGEM_TELA ? embaixo : emCima;
  const maxLeft = window.innerWidth - largura - MARGEM_TELA;
  const left = Math.max(MARGEM_TELA, Math.min(termo.left, maxLeft));
  return { top, left };
}

/**
 * Termo com dica no padrão toggletip: abre com o mouse por cima ou com o foco do teclado e fecha quando
 * os dois saem. O clique (ou o toque) fixa a dica, que aí só fecha com novo clique, com Esc ou com clique fora.
 */
export function Termo({ id, children }: { id: IdTermo; children: ComponentChildren }) {
  const [aberto, setAberto] = useState(false);
  const [fixado, setFixado] = useState(false);
  const idPainel = useId();
  const raiz = useRef<HTMLSpanElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLSpanElement>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const termo = GLOSSARIO[id];

  function cancelarFechamento() {
    clearTimeout(temporizador.current);
    temporizador.current = undefined;
  }

  function abrir() {
    cancelarFechamento();
    setAberto(true);
  }

  function fechar() {
    cancelarFechamento();
    setAberto(false);
    setFixado(false);
  }

  function agendarFechamento() {
    cancelarFechamento();
    temporizador.current = setTimeout(() => {
      temporizador.current = undefined;
      setAberto(false);
    }, ATRASO_FECHAR_MS);
  }

  // O toque também gera pointerenter/pointerleave; no toque, quem manda é o clique.
  const entrar = (e: PointerEvent) => { if (e.pointerType !== 'touch') abrir(); };
  const sair = (e: PointerEvent) => { if (e.pointerType !== 'touch' && !fixado) agendarFechamento(); };

  function alternarFixado() {
    if (fixado) fechar();
    else { abrir(); setFixado(true); }
  }

  useEffect(() => () => clearTimeout(temporizador.current), []);

  // O painel é `position: fixed` para não alargar a área rolável de contêineres com overflow (a tabela da
  // comparação). A posição vai por CSSOM (el.style.top): a CSP `style-src 'self'` bloqueia o atributo
  // `style` no markup, mas não o CSSOM. Recalcula ao abrir e, enquanto aberto, no scroll e no resize.
  useLayoutEffect(() => {
    if (!aberto) return;
    const posicionar = () => {
      const el = painel.current;
      const b = botao.current;
      if (!el || !b) return;
      const { width, height } = el.getBoundingClientRect();
      const { top, left } = posicaoDoPainel(b.getBoundingClientRect(), width, height);
      el.style.top = `${top}px`;
      el.style.left = `${left}px`;
    };
    posicionar();
    window.addEventListener('scroll', posicionar, { capture: true, passive: true });
    window.addEventListener('resize', posicionar);
    return () => {
      window.removeEventListener('scroll', posicionar, { capture: true });
      window.removeEventListener('resize', posicionar);
    };
  }, [aberto]);

  // O foco saindo do conjunto botão + painel fecha a dica que não está fixada.
  useEffect(() => {
    const el = raiz.current;
    if (!el || fixado) return;
    const aoSairFoco = (e: FocusEvent) => {
      if (!(e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) fechar();
    };
    el.addEventListener('focusout', aoSairFoco);
    return () => el.removeEventListener('focusout', aoSairFoco);
  }, [fixado]);

  // Aberta, a dica fecha com Esc e com clique ou toque fora dela.
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    const aoApontar = (e: PointerEvent) => {
      if (!(e.target instanceof Node && raiz.current?.contains(e.target))) fechar();
    };
    document.addEventListener('keydown', aoTeclar);
    document.addEventListener('pointerdown', aoApontar);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.removeEventListener('pointerdown', aoApontar);
    };
  }, [aberto]);

  return (
    <span class="termo" ref={raiz}>
      <button type="button" class="termo__botao" ref={botao} aria-expanded={aberto} aria-controls={idPainel}
        onClick={alternarFixado} onFocus={abrir} onPointerEnter={entrar} onPointerLeave={sair}>
        {children}
      </button>
      <span id={idPainel} role="note" class="termo__painel" ref={painel} hidden={!aberto}
        onPointerEnter={entrar} onPointerLeave={sair}>
        <strong>{termo.termo}:</strong> <MarkdownRestrito texto={termo.curto} inline />{' '}
        <a href={termo.fonte} target="_blank" rel="noopener noreferrer">Fonte</a>
      </span>
    </span>
  );
}

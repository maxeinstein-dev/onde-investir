import type { ComponentChildren } from 'preact';
import { useId, useState } from 'preact/hooks';
import { GLOSSARIO, type IdTermo } from '../conteudo/glossario';
import { MarkdownRestrito } from './MarkdownRestrito';

export function Termo({ id, children }: { id: IdTermo; children: ComponentChildren }) {
  const [aberto, setAberto] = useState(false);
  const idPainel = useId();
  const termo = GLOSSARIO[id];
  return (
    <span class="termo">
      <button type="button" class="termo__botao" aria-expanded={aberto} aria-controls={idPainel} onClick={() => setAberto(!aberto)}>
        {children}
      </button>
      <span id={idPainel} role="note" class="termo__painel" hidden={!aberto}>
        <strong>{termo.termo}:</strong> <MarkdownRestrito texto={termo.curto} inline />{' '}
        <a href={termo.fonte} target="_blank" rel="noopener noreferrer">Fonte</a>
      </span>
    </span>
  );
}

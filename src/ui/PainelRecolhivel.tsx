import type { ComponentChildren } from 'preact';
import { useId, useRef, useState } from 'preact/hooks';

/** Painel de revelação (não <dialog>: o jsdom não tem showModal e o projeto já adotou este padrão no M2.1). */
export function PainelRecolhivel({ resumo, children }: { resumo: string; children: ComponentChildren }) {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  const botao = useRef<HTMLButtonElement>(null);
  return (
    <div class="recolhivel" onKeyDown={(e) => { if (e.key === 'Escape' && aberto && !(e.target instanceof HTMLSelectElement)) { setAberto(false); botao.current?.focus(); } }}>
      <button ref={botao} type="button" class="recolhivel__resumo" aria-expanded={aberto} aria-controls={id} onClick={() => setAberto(!aberto)}>
        <span>{resumo}</span>
        <span aria-hidden="true">{aberto ? '▴' : '▾'}</span>
      </button>
      <div id={id} class="recolhivel__conteudo" hidden={!aberto}>{children}</div>
    </div>
  );
}

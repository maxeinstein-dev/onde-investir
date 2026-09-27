import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

export interface Aba { id: string; rotulo: string; conteudo: ComponentChildren }

/** A aba do hash atual (`#duelo` → "duelo"); a primeira se o hash não for de nenhuma. */
function abaDoHash(abas: readonly Aba[]): string {
  const id = location.hash.replace(/^#/, '');
  return abas.some((a) => a.id === id) ? id : (abas[0]?.id ?? '');
}

/**
 * Abas acessíveis (padrão WAI-ARIA com ativação automática), sincronizadas com o hash da URL.
 * Todos os painéis ficam montados; os inativos, com `hidden`, para não perder o que foi digitado.
 */
export function Abas({ abas, rotulo }: { abas: readonly Aba[]; rotulo: string }) {
  const [ativa, setAtiva] = useState(() => abaDoHash(abas));
  const botoes = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const aoMudarHash = () => setAtiva(abaDoHash(abas));
    window.addEventListener('hashchange', aoMudarHash);
    return () => window.removeEventListener('hashchange', aoMudarHash);
  }, [abas]);

  function ativar(id: string, focar = false) {
    setAtiva(id);
    if (location.hash !== `#${id}`) location.hash = id;
    if (focar) botoes.current[id]?.focus();
  }

  function aoTeclar(e: KeyboardEvent, indice: number) {
    const n = abas.length;
    const destino = e.key === 'ArrowRight' ? (indice + 1) % n
      : e.key === 'ArrowLeft' ? (indice - 1 + n) % n
        : e.key === 'Home' ? 0
          : e.key === 'End' ? n - 1
            : null;
    const aba = destino === null ? undefined : abas[destino];
    if (!aba) return;
    e.preventDefault();
    ativar(aba.id, true);
  }

  return (
    <div class="abas">
      <div role="tablist" aria-label={rotulo} class="abas__lista">
        {abas.map((a, i) => (
          <button key={a.id} type="button" role="tab" id={`aba-${a.id}`} aria-controls={`painel-${a.id}`}
            aria-selected={a.id === ativa} tabIndex={a.id === ativa ? 0 : -1} class="abas__aba"
            ref={(el) => { botoes.current[a.id] = el; }}
            onClick={() => ativar(a.id)} onKeyDown={(e) => aoTeclar(e, i)}>
            {a.rotulo}
          </button>
        ))}
      </div>
      {abas.map((a) => (
        <div key={a.id} role="tabpanel" id={`painel-${a.id}`} aria-labelledby={`aba-${a.id}`} hidden={a.id !== ativa}
          tabIndex={0} class="abas__painel">
          {a.conteudo}
        </div>
      ))}
    </div>
  );
}

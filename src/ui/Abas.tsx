import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

export interface Aba { id: string; rotulo: string; conteudo: ComponentChildren }

/** Hashes antigos que levam a uma aba de hoje (`#duelo` → "comparar"). */
export type Apelidos = Readonly<Record<string, string>>;

/**
 * A aba do hash atual; a primeira se o hash não for de nenhuma. O hash pode levar um estado depois da aba
 * (`#comparar/c1.…`, o link compartilhável): a aba é o prefixo antes da `/`, e o estado fica no hash para quem o lê
 * (armazenamento/link). Hash com apelido vira o da aba de destino, com o mesmo estado, sem criar uma entrada nova
 * no histórico.
 */
function abaDoHash(ids: readonly string[], apelidos: Apelidos): string {
  const hash = location.hash.replace(/^#/, '');
  const barra = hash.indexOf('/');
  const prefixo = barra === -1 ? hash : hash.slice(0, barra);
  const resto = barra === -1 ? '' : hash.slice(barra);
  const destino = Object.hasOwn(apelidos, prefixo) ? apelidos[prefixo] : undefined;
  if (destino !== undefined && ids.includes(destino)) {
    history.replaceState(null, '', `#${destino}${resto}`);
    return destino;
  }
  return ids.includes(prefixo) ? prefixo : (ids[0] ?? '');
}

/** A aba ativa sincronizada com o hash da URL (e com o voltar do navegador), para quem precisa trocar de aba por fora. */
export function useAbaDaUrl(ids: readonly string[], apelidos: Apelidos = {}): [string, (id: string) => void] {
  const [ativa, setAtiva] = useState(() => abaDoHash(ids, apelidos));
  const atuais = useRef({ ids, apelidos });
  atuais.current = { ids, apelidos };

  useEffect(() => {
    const aoMudarHash = () => setAtiva(abaDoHash(atuais.current.ids, atuais.current.apelidos));
    window.addEventListener('hashchange', aoMudarHash);
    return () => window.removeEventListener('hashchange', aoMudarHash);
  }, []);

  function ativar(id: string) {
    setAtiva(id);
    if (location.hash !== `#${id}`) location.hash = id;
  }
  return [ativa, ativar];
}

export interface PropsAbas {
  abas: readonly Aba[];
  rotulo: string;
  apelidos?: Apelidos;
  /** Controlada: a aba ativa e a troca vêm de fora (em geral, do `useAbaDaUrl`). */
  ativa?: string;
  onAtivar?: (id: string) => void;
}

/**
 * Abas acessíveis (padrão WAI-ARIA com ativação automática), sincronizadas com o hash da URL.
 * Todos os painéis ficam montados; os inativos, com `hidden`, para não perder o que foi digitado.
 */
export function Abas({ abas, rotulo, apelidos, ativa: ativaExterna, onAtivar }: PropsAbas) {
  const [ativaInterna, ativarInterna] = useAbaDaUrl(abas.map((a) => a.id), apelidos);
  const ativa = ativaExterna ?? ativaInterna;
  const trocar = onAtivar ?? ativarInterna;
  const botoes = useRef<Record<string, HTMLButtonElement | null>>({});

  function ativar(id: string, focar = false) {
    trocar(id);
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

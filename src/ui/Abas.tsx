import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useEhCelular } from './useEhCelular';

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

/**
 * A aba ativa sincronizada com o hash da URL (e com o voltar do navegador), para quem precisa trocar de aba por fora.
 * `ativar(id, sub)` põe no hash também o que vem depois da `/` (`#aprender/fgc`, a lição aberta).
 */
export function useAbaDaUrl(ids: readonly string[], apelidos: Apelidos = {}): [string, (id: string, sub?: string) => void] {
  const [ativa, setAtiva] = useState(() => abaDoHash(ids, apelidos));
  const atuais = useRef({ ids, apelidos });
  atuais.current = { ids, apelidos };

  useEffect(() => {
    const aoMudarHash = () => setAtiva(abaDoHash(atuais.current.ids, atuais.current.apelidos));
    window.addEventListener('hashchange', aoMudarHash);
    return () => window.removeEventListener('hashchange', aoMudarHash);
  }, []);

  function ativar(id: string, sub?: string) {
    setAtiva(id);
    const alvo = sub === undefined || sub === '' ? id : `${id}/${sub}`;
    if (location.hash !== `#${alvo}`) location.hash = alvo;
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
  /** Ids das abas que, no celular, saem da barra e vão para o menu "Mais". Fora do celular não têm efeito. */
  secundarias?: readonly string[];
}

/**
 * Abas acessíveis (padrão WAI-ARIA com ativação automática), sincronizadas com o hash da URL.
 * Todos os painéis ficam montados; os inativos, com `hidden`, para não perder o que foi digitado.
 */
export function Abas({ abas, rotulo, apelidos, ativa: ativaExterna, onAtivar, secundarias = [] }: PropsAbas) {
  const [ativaInterna, ativarInterna] = useAbaDaUrl(abas.map((a) => a.id), apelidos);
  const ativa = ativaExterna ?? ativaInterna;
  const trocar = onAtivar ?? ativarInterna;
  const celular = useEhCelular();
  const botoes = useRef<Record<string, HTMLButtonElement | null>>({});
  const botaoMais = useRef<HTMLButtonElement | null>(null);
  const itens = useRef<Record<string, HTMLButtonElement | null>>({});
  const [menuAberto, setMenuAberto] = useState(false);

  const visiveis = celular ? abas.filter((a) => !secundarias.includes(a.id)) : abas;
  const menu = celular ? abas.filter((a) => secundarias.includes(a.id)) : [];
  const abaSecundariaAtiva = menu.find((a) => a.id === ativa);
  const primeiraFocavel = abaSecundariaAtiva ? visiveis[0]?.id : ativa;

  useEffect(() => {
    if (!celular) setMenuAberto(false);
  }, [celular]);

  useEffect(() => {
    if (!menuAberto) return;
    const fora = (e: Event) => {
      const alvo = e.target as Element | null;
      if (!alvo?.closest('.abas__mais')) setMenuAberto(false);
    };
    document.addEventListener('pointerdown', fora);
    return () => document.removeEventListener('pointerdown', fora);
  }, [menuAberto]);

  function ativar(id: string, focar = false) {
    trocar(id);
    if (focar) botoes.current[id]?.focus();
  }

  function aoTeclar(e: KeyboardEvent, indice: number) {
    const n = visiveis.length;
    const destino = e.key === 'ArrowRight' ? (indice + 1) % n
      : e.key === 'ArrowLeft' ? (indice - 1 + n) % n
        : e.key === 'Home' ? 0
          : e.key === 'End' ? n - 1
            : null;
    const aba = destino === null ? undefined : visiveis[destino];
    if (!aba) return;
    e.preventDefault();
    ativar(aba.id, true);
  }

  function abrirMenu() {
    setMenuAberto(true);
    setTimeout(() => { const primeiro = menu[0]; if (primeiro) itens.current[primeiro.id]?.focus(); }, 0);
  }

  function fecharMenu() {
    setMenuAberto(false);
    botaoMais.current?.focus();
  }

  function escolher(id: string) {
    trocar(id);
    setMenuAberto(false);
    setTimeout(() => document.getElementById(`painel-${id}`)?.focus(), 0);
  }

  function aoTeclarMenu(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); fecharMenu(); return; }
    if (e.key === 'Tab') { setMenuAberto(false); return; }
    const n = menu.length;
    const atual = menu.findIndex((a) => itens.current[a.id] === document.activeElement);
    const destino = e.key === 'ArrowDown' ? (atual + 1) % n
      : e.key === 'ArrowUp' ? (atual - 1 + n) % n
        : e.key === 'Home' ? 0
          : e.key === 'End' ? n - 1
            : null;
    const item = destino === null ? undefined : menu[destino];
    if (!item) return;
    e.preventDefault();
    itens.current[item.id]?.focus();
  }

  const lista = (
    <div role="tablist" aria-label={rotulo} class="abas__lista">
      {visiveis.map((a, i) => (
        <button key={a.id} type="button" role="tab" id={`aba-${a.id}`} aria-controls={`painel-${a.id}`}
          aria-selected={a.id === ativa} tabIndex={a.id === primeiraFocavel ? 0 : -1} class="abas__aba"
          ref={(el) => { botoes.current[a.id] = el; }}
          onClick={() => ativar(a.id)} onKeyDown={(e) => aoTeclar(e, i)}>
          {a.rotulo}
        </button>
      ))}
    </div>
  );

  return (
    <div class="abas">
      {celular && menu.length > 0 ? (
        <div class="abas__barra">
          {lista}
          <div class="abas__mais">
            <button type="button" ref={botaoMais} class="abas__aba abas__botao-mais" aria-haspopup="menu" aria-expanded={menuAberto}
              aria-current={abaSecundariaAtiva ? 'true' : undefined}
              onClick={() => (menuAberto ? fecharMenu() : abrirMenu())}>
              {abaSecundariaAtiva ? abaSecundariaAtiva.rotulo : 'Mais'}
            </button>
            {menuAberto && (
              <div role="menu" aria-label="Mais seções" class="abas__menu" onKeyDown={aoTeclarMenu}>
                {menu.map((a) => (
                  <button key={a.id} type="button" role="menuitem" tabIndex={-1} class="abas__item"
                    aria-current={a.id === ativa ? 'true' : undefined}
                    ref={(el) => { itens.current[a.id] = el; }}
                    onClick={() => escolher(a.id)}>
                    {a.rotulo}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : lista}
      {abas.map((a) => (
        <div key={a.id} role="tabpanel" id={`painel-${a.id}`} aria-labelledby={`aba-${a.id}`} hidden={a.id !== ativa}
          tabIndex={0} class="abas__painel">
          {a.conteudo}
        </div>
      ))}
    </div>
  );
}

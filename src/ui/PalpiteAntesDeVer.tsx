import type { Ref } from 'preact';

export interface PropsPalpite {
  nomeA: string;
  nomeB: string;
  onEscolher: (escolha: 'A' | 'B') => void;
  onPular: () => void;
  /** Recebe o foco quando a fase do palpite começa. */
  refTitulo?: Ref<HTMLHeadingElement>;
}

export function PalpiteAntesDeVer({ nomeA, nomeB, onEscolher, onPular, refTitulo }: PropsPalpite) {
  return (
    <section class="palpite" aria-labelledby="palpite-titulo">
      <h2 id="palpite-titulo" ref={refTitulo} tabIndex={-1}>Antes de ver: qual você acha que rende mais?</h2>
      <p>Chutar antes ajuda a lembrar o porquê depois.</p>
      <div class="palpite__opcoes">
        <button type="button" onClick={() => onEscolher('A')}>A: {nomeA}</button>
        <button type="button" onClick={() => onEscolher('B')}>B: {nomeB}</button>
      </div>
      <button type="button" class="link" onClick={onPular}>Pular e desligar os palpites</button>
    </section>
  );
}

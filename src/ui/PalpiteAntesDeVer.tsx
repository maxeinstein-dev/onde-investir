import type { Ref } from 'preact';
import { letraDaOferta } from './letras';

export interface PropsPalpite {
  /** Prefixo dos ids: o duelo e a comparação ficam montados ao mesmo tempo, em abas diferentes. */
  id: string;
  /** O título da pergunta. */
  pergunta?: string;
  /** Nome de cada opção; o botão mostra "A: nome", "B: nome"… */
  opcoes: readonly string[];
  /** Índice da opção escolhida (0 = A). */
  onEscolher: (indice: number) => void;
  onPular: () => void;
  /** Recebe o foco quando a fase do palpite começa. */
  refTitulo?: Ref<HTMLHeadingElement>;
}

export function PalpiteAntesDeVer({
  id, pergunta = 'Antes de ver: qual você acha que rende mais?', opcoes, onEscolher, onPular, refTitulo,
}: PropsPalpite) {
  const idTitulo = `${id}-titulo`;
  return (
    <section class="palpite" aria-labelledby={idTitulo}>
      <h2 id={idTitulo} ref={refTitulo} tabIndex={-1}>{pergunta}</h2>
      <p>Chutar antes ajuda a lembrar o porquê depois.</p>
      <div class="palpite__opcoes">
        {opcoes.map((nome, i) => (
          <button key={i} type="button" onClick={() => onEscolher(i)}>{letraDaOferta(i)}: {nome}</button>
        ))}
      </div>
      <button type="button" class="link" onClick={onPular}>Pular e desligar os palpites</button>
    </section>
  );
}

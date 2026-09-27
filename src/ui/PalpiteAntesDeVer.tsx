export interface PropsPalpite {
  nomeA: string;
  nomeB: string;
  onEscolher: (escolha: 'A' | 'B') => void;
  onPular: () => void;
}

export function PalpiteAntesDeVer({ nomeA, nomeB, onEscolher, onPular }: PropsPalpite) {
  return (
    <section class="palpite" aria-labelledby="palpite-titulo">
      <h2 id="palpite-titulo">Antes de ver: qual você acha que rende mais?</h2>
      <p>Arriscar um palpite antes ajuda a fixar o porquê do resultado.</p>
      <div class="palpite__opcoes">
        <button type="button" onClick={() => onEscolher('A')}>{nomeA}</button>
        <button type="button" onClick={() => onEscolher('B')}>{nomeB}</button>
      </div>
      <button type="button" class="link" onClick={onPular}>Pular e desligar os palpites</button>
    </section>
  );
}

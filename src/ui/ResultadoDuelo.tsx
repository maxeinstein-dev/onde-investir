import type { Ref } from 'preact';
import { descreverOferta, explicarVencedor } from '../conteudo/motivos';
import type { Duelo } from '../engine/comparador';
import { garantiaDe, type ResultadoSimulacao } from '../engine/produtos';
import { formatarMoeda } from '../formato';
import { PorQueEsseResultado } from './PorQueEsseResultado';
import { Termo } from './Termo';

function Cartao({ rotulo, r, vencedor }: { rotulo: string; r: ResultadoSimulacao; vencedor: boolean }) {
  return (
    <article class={vencedor ? 'cartao cartao--vencedor' : 'cartao'}>
      <h3>{rotulo} {vencedor && <span class="selo">maior valor líquido</span>}</h3>
      <p class="cartao__liquido">{formatarMoeda(r.valorLiquido)}</p>
      <p class="cartao__garantia">
        Garantia: {garantiaDe(r.aplicacao.produto) === 'FGC' ? <Termo id="fgc">FGC</Termo> : <Termo id="tesouro">Tesouro Nacional</Termo>}
      </p>
      <PorQueEsseResultado resultado={r} />
    </article>
  );
}

export function ResultadoDuelo({ duelo, palpite, refTitulo }: { duelo: Duelo; palpite: 'A' | 'B' | null; refTitulo?: Ref<HTMLHeadingElement> }) {
  const nomeA = descreverOferta(duelo.a.aplicacao);
  const nomeB = descreverOferta(duelo.b.aplicacao);
  let feedback: string | null = null;
  if (palpite !== null) {
    feedback = duelo.vencedor === 'EMPATE' ? 'Deu empate: os dois palpites valiam.'
      : palpite === duelo.vencedor ? 'Você acertou.' : 'Não foi dessa vez. O motivo está logo abaixo.';
  }
  return (
    <section class="resultado" aria-labelledby="resultado-titulo">
      <h2 id="resultado-titulo" ref={refTitulo} tabIndex={-1}>Resultado</h2>
      {feedback && <p class="feedback">{feedback}</p>}
      <ul class="motivos">{explicarVencedor(duelo).map((linha) => <li>{linha}</li>)}</ul>
      <div class="cartoes">
        <Cartao rotulo={`A: ${nomeA}`} r={duelo.a} vencedor={duelo.vencedor === 'A'} />
        <Cartao rotulo={`B: ${nomeB}`} r={duelo.b} vencedor={duelo.vencedor === 'B'} />
      </div>
    </section>
  );
}

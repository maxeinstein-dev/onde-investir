import type { Ref } from 'preact';
import { descreverProjecao } from '../conteudo/comparacao';
import { descreverOferta, explicarVencedor, fraseDoPlacar } from '../conteudo/motivos';
import { decidirVencedor, montarDuelo } from '../engine/comparador';
import type { Projecao } from '../engine/ofertas';
import { garantiaDe, type Oferta } from '../engine/produtos';
import { formatarMoeda } from '../formato';
import { PorQueEsseResultado } from './PorQueEsseResultado';
import { Termo } from './Termo';

/** Uma opção do duelo: a oferta digitada e a projeção dela na data do resgate. */
export interface LadoDuelo {
  oferta: Oferta;
  projecao: Projecao;
}

type Disponivel = Extract<Projecao, { estado: 'DISPONIVEL' }>;
const disponivel = (p: Projecao): p is Disponivel => p.estado === 'DISPONIVEL';

function Cartao({ rotulo, lado, vencedor }: { rotulo: string; lado: LadoDuelo; vencedor: boolean }) {
  const p = lado.projecao;
  const frase = descreverProjecao(p);
  const [etapa1, etapa2] = disponivel(p) ? p.etapas : [];
  return (
    <article class={vencedor ? 'cartao cartao--vencedor' : 'cartao'}>
      <h3>{rotulo} {vencedor && <span class="selo">maior valor líquido</span>}</h3>
      {disponivel(p)
        ? <p class="cartao__liquido">{formatarMoeda(p.liquido)}</p>
        : <p class="cartao__estado">{frase}</p>}
      {disponivel(p) && frase && <p class="cartao__nota">{frase}</p>}
      <p class="cartao__garantia">
        Garantia: {garantiaDe(lado.oferta.produto) === 'FGC' ? <Termo id="fgc">FGC</Termo> : <Termo id="tesouro">Tesouro Nacional</Termo>}
      </p>
      {etapa1 && <PorQueEsseResultado resultado={etapa1} reaplicacao={etapa2 && frase ? { frase, resultado: etapa2 } : undefined} />}
    </article>
  );
}

/** As frases do topo: o placar (com os motivos quando não houve reaplicação) ou quem dá para resgatar. */
function motivos(a: LadoDuelo, b: LadoDuelo, nomeA: string, nomeB: string): string[] {
  const pa = a.projecao;
  const pb = b.projecao;
  if (disponivel(pa) && disponivel(pb)) {
    const [ra, rb] = [pa.etapas[0], pb.etapas[0]];
    // Sem reaplicação, cada lado é uma simulação só, e os motivos de IR e rendimento bruto valem.
    if (pa.etapas.length === 1 && pb.etapas.length === 1 && ra && rb) return explicarVencedor(montarDuelo(ra, rb));
    return [fraseDoPlacar(nomeA, pa.liquido, nomeB, pb.liquido)];
  }
  if (disponivel(pa)) return [`Só ${nomeA} pode ser resgatada nessa data.`];
  if (disponivel(pb)) return [`Só ${nomeB} pode ser resgatada nessa data.`];
  return ['Nenhuma das duas pode ser resgatada nessa data.'];
}

export interface PropsResultadoDuelo {
  a: LadoDuelo;
  b: LadoDuelo;
  palpite: 'A' | 'B' | null;
  refTitulo?: Ref<HTMLHeadingElement>;
}

export function ResultadoDuelo({ a, b, palpite, refTitulo }: PropsResultadoDuelo) {
  const nomeA = descreverOferta(a.oferta);
  const nomeB = descreverOferta(b.oferta);
  const pa = a.projecao;
  const pb = b.projecao;
  // Vencedor só quando as duas podem ser resgatadas na data.
  const vencedor = disponivel(pa) && disponivel(pb) ? decidirVencedor(pa.liquido, pb.liquido) : null;
  let feedback: string | null = null;
  if (palpite !== null && vencedor !== null) {
    feedback = vencedor === 'EMPATE' ? 'Deu empate: os dois palpites valiam.'
      : palpite === vencedor ? 'Você acertou.' : 'Não foi dessa vez. O motivo está logo abaixo.';
  }
  return (
    <section class="resultado" aria-labelledby="resultado-titulo">
      <h2 id="resultado-titulo" ref={refTitulo} tabIndex={-1}>Resultado</h2>
      {feedback && <p class="feedback">{feedback}</p>}
      <ul class="motivos">{motivos(a, b, nomeA, nomeB).map((linha) => <li>{linha}</li>)}</ul>
      <div class="cartoes">
        <Cartao rotulo={`A: ${nomeA}`} lado={a} vencedor={vencedor === 'A'} />
        <Cartao rotulo={`B: ${nomeB}`} lado={b} vencedor={vencedor === 'B'} />
      </div>
    </section>
  );
}

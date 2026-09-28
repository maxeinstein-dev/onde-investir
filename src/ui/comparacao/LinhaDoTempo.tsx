import { concluirLinhaDoTempo, descreverProjecao, nomesDistintos } from '../../conteudo/comparacao';
import type { ColunaHorizonte, Marco } from '../../engine/comparacao';
import { dataBR } from '../../engine/datas';
import type { OfertaCadastrada, Projecao } from '../../engine/ofertas';
import { formatarMoeda } from '../../formato';
import { letraDaOferta } from '../letras';

export interface PropsLinhaDoTempo {
  ofertas: readonly OfertaCadastrada[];
  linha: { marcos: readonly Marco[] };
  /** A última coluna da tabela: se a liderança mudar depois do último vencimento, a conclusão diz. */
  ultimaColuna?: ColunaHorizonte;
}

type Disponivel = Extract<Projecao, { estado: 'DISPONIVEL' }>;

const rotulo = (ofertas: readonly OfertaCadastrada[], i: number): string => {
  const nome = nomesDistintos(ofertas)[i];
  return nome === undefined ? letraDaOferta(i) : `${letraDaOferta(i)}: ${nome}`;
};

function MarcoDaLinha({ ofertas, m }: { ofertas: readonly OfertaCadastrada[]; m: Marco }) {
  const disponiveis = m.projecoes
    .flatMap((p, i) => (p.estado === 'DISPONIVEL' ? [{ p: p as Disponivel, i }] : []))
    .sort((a, b) => b.p.liquido - a.p.liquido);
  const outras = m.projecoes.flatMap((p, i) => (p.estado === 'DISPONIVEL' ? [] : [{ p, i }]));
  const data = dataBR(m.data);
  return (
    <li class="marco">
      <h4>{data}</h4>
      <p>Vence: {m.ofertasQueVencem.map((i) => rotulo(ofertas, i)).join('; ')}.</p>
      {disponiveis.length > 0 && (
        <ol class="marco__ranking" aria-label={`Ranking em ${data}`}>
          {disponiveis.map(({ p, i }) => (
            <li key={i} class={m.lideres.includes(i) ? 'marco__lider' : undefined}>
              {rotulo(ofertas, i)}: {formatarMoeda(p.liquido)}
              {m.lideres.includes(i) && <span class="visualmente-oculto"> (maior valor líquido)</span>}
            </li>
          ))}
        </ol>
      )}
      {outras.map(({ p, i }) => <p key={i} class="dica">{rotulo(ofertas, i)}: {descreverProjecao(p)}</p>)}
    </li>
  );
}

/** Um marco por vencimento, com o ranking naquela data, e a conclusão no último. */
export function LinhaDoTempo({ ofertas, linha, ultimaColuna }: PropsLinhaDoTempo) {
  const conclusao = concluirLinhaDoTempo(ofertas, linha, ultimaColuna);
  return (
    <section class="linha-do-tempo" aria-labelledby="comparacao-linha-titulo">
      <h3 id="comparacao-linha-titulo">Linha do tempo dos vencimentos</h3>
      {linha.marcos.length === 0 ? (
        <p class="dica">Nenhuma oferta vence depois da aplicação, então não há vencimentos para acompanhar.</p>
      ) : (
        <ol class="linha-do-tempo__marcos">
          {linha.marcos.map((m) => <MarcoDaLinha key={m.data} ofertas={ofertas} m={m} />)}
        </ol>
      )}
      {conclusao.map((frase) => <p key={frase} class="linha-do-tempo__conclusao">{frase}</p>)}
    </section>
  );
}

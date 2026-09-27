import { useState } from 'preact/hooks';
import { descreverProjecao, nomeOferta } from '../../conteudo/comparacao';
import type { ColunaHorizonte } from '../../engine/comparacao';
import { dataBR } from '../../engine/datas';
import type { OfertaCadastrada, Projecao } from '../../engine/ofertas';
import { formatarMoeda } from '../../formato';
import { letraDaOferta } from '../letras';
import { PorQueEsseResultado } from '../PorQueEsseResultado';

export interface PropsTabelaHorizontes {
  ofertas: readonly OfertaCadastrada[];
  colunas: readonly ColunaHorizonte[];
  /** O que foi comparado, para a legenda: "R$ 10.000,00 aplicados em 28/09/2026". */
  descricao: string;
}

const ID_LEGENDA = 'comparacao-tabela-legenda';

function Celula({ p, lider }: { p: Projecao; lider: boolean }) {
  // Os passos só são renderizados quando o "Por que?" abre (e ficam depois): a tabela tem até 30 × 6 células.
  const [aberto, setAberto] = useState(false);
  const texto = descreverProjecao(p);
  if (p.estado !== 'DISPONIVEL') return <td class="celula celula--estado">{texto}</td>;
  return (
    <td class={lider ? 'celula celula--lider' : 'celula'}>
      <span class="celula__valor">{formatarMoeda(p.liquido)}</span>
      {lider && (
        <>
          <span class="celula__selo" aria-hidden="true">maior</span>
          <span class="visualmente-oculto">(maior valor líquido)</span>
        </>
      )}
      {texto && <span class="celula__nota">{texto}</span>}
      <details class="celula__porque" onToggle={(e) => { if (e.currentTarget.open) setAberto(true); }}>
        <summary>Por que?</summary>
        {aberto && p.etapas.map((etapa, i) => (
          <div key={i}>
            {/* Entre a primeira etapa e a reaplicação, a frase do reinvestimento. */}
            {i > 0 && texto && <p class="celula__reinvestimento">{texto}</p>}
            <PorQueEsseResultado resultado={etapa} />
          </div>
        ))}
      </details>
    </td>
  );
}

/** Valor líquido de cada oferta (linhas) em cada horizonte (colunas), com o líder de cada coluna destacado. */
export function TabelaHorizontes({ ofertas, colunas, descricao }: PropsTabelaHorizontes) {
  return (
    // No celular a tabela rola dentro deste contêiner, sem rolar a página; tabindex para rolar pelo teclado.
    <div class="tabela-rolavel" role="region" aria-labelledby={ID_LEGENDA} tabIndex={0}>
      <table class="tabela-horizontes">
        <caption id={ID_LEGENDA}>Valor líquido por horizonte, com {descricao}</caption>
        <thead>
          <tr>
            <th scope="col">Oferta</th>
            {colunas.map((c) => (
              <th scope="col" key={c.data}>{c.rotulo}<span class="tabela__data">{dataBR(c.data)}</span></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ofertas.map((o, i) => (
            <tr key={o.id}>
              <th scope="row">{letraDaOferta(i)}: {nomeOferta(o)}</th>
              {colunas.map((c) => {
                const p = c.projecoes[i];
                return p ? <Celula key={c.data} p={p} lider={c.lideres.includes(i)} /> : <td key={c.data} />;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

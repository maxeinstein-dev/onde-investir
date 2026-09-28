// Tela de sugestão de um objetivo: recalcula a cada visualização contra o catálogo e a carteira
// atuais (spec §9.1, plano M4a C4). O engine nunca produz texto; aqui cada fatia vira frases,
// com src/conteudo/sugestao.ts, e o link para a lição de cada motivo.
import { useMemo } from 'preact/hooks';
import type { ObjetivoSalvo } from '../../armazenamento/objetivos';
import { nomeOferta } from '../../conteudo/comparacao';
import { AVISO_EDUCATIVO, descreverFatia, licaoDaFatia, textoDaFatia, textoDoFgc } from '../../conteudo/sugestao';
import type { DataISO } from '../../engine/datas';
import type { ItemFGC } from '../../engine/fgc';
import type { OfertaCadastrada } from '../../engine/ofertas';
import { sugerir, type Fatia } from '../../engine/sugestao';
import { LinkLicao } from '../aprender/LinkLicao';
import { formatarMoeda, formatarPercentual } from '../../formato';
import { GraficoObjetivo } from '../graficos/GraficoObjetivo';

export interface PropsSugestao {
  objetivo: ObjetivoSalvo;
  catalogo: readonly OfertaCadastrada[];
  carteira: readonly ItemFGC[];
  hoje: DataISO;
  /** "Comparar esta oferta", quando a fatia tem uma oferta do catálogo casada. */
  onIrParaComparar: (oferta: OfertaCadastrada) => void;
}

function ItemFatia({ f, onIrParaComparar }: { f: Fatia; onIrParaComparar: (oferta: OfertaCadastrada) => void }) {
  const avisoFgc = textoDoFgc(f);
  return (
    <li class="cartao cartao--fatia">
      <h3>{descreverFatia(f)} — {formatarPercentual(f.percentual)}</h3>
      {f.valor !== null && <p class="cartao__detalhe">{formatarMoeda(f.valor)}</p>}
      <p>{textoDaFatia(f)} <LinkLicao licao={licaoDaFatia(f)} /></p>
      {avisoFgc && <p class="aviso">{avisoFgc}</p>}
      {f.ofertaCatalogo && (
        <p class="cartao__detalhe">
          Já disponível: {nomeOferta(f.ofertaCatalogo)}{' '}
          <button type="button" onClick={() => onIrParaComparar(f.ofertaCatalogo as OfertaCadastrada)}>Comparar</button>
        </p>
      )}
    </li>
  );
}

export function Sugestao({ objetivo, catalogo, carteira, hoje, onIrParaComparar }: PropsSugestao) {
  // useMemo (não useState/congelar): a sugestão nunca pode ficar parada no tempo, tem que recalcular sempre
  // que entradas/catálogo/carteira/hoje mudarem de verdade. Só evita recriar o array (e, com isso, o gráfico
  // de pizza em GraficoObjetivo) em renders que não afetam a sugestão.
  const fatias = useMemo(
    () => sugerir(objetivo.entradas, { catalogo, carteira, hoje }),
    [objetivo.entradas, catalogo, carteira, hoje],
  );
  return (
    <section class="sugestao" aria-labelledby="sugestao-titulo">
      <h2 id="sugestao-titulo">{objetivo.nome ?? 'Sugestão'}</h2>
      <p class="aviso">{AVISO_EDUCATIVO}</p>
      <GraficoObjetivo fatias={fatias} />
      <ul class="lista-ofertas" aria-label="Fatias sugeridas">
        {fatias.map((f, i) => <ItemFatia key={`${f.motivo}-${i}`} f={f} onIrParaComparar={onIrParaComparar} />)}
      </ul>
    </section>
  );
}

import { GRAFICO_LEGENDA } from '../../conteudo/serie';
import { FORMAS_DO_PONTO, formaDaSerie, TOKENS } from './cores';

export interface ItemLegenda {
  /** O índice da série: dá a cor e a forma, as mesmas da linha no canvas. */
  serie: number;
  texto: string;
}

type Forma = (typeof FORMAS_DO_PONTO)[number];

/** A forma do ponto do Chart.js (`pointStyle`) desenhada num quadrado de 12 por 12. */
function desenho(forma: Forma) {
  switch (forma) {
    case 'circle': return <circle cx="6" cy="6" r="5" />;
    case 'rect': return <rect x="1" y="1" width="10" height="10" />;
    case 'triangle': return <polygon points="6,1 11,11 1,11" />;
    case 'rectRot': return <polygon points="6,0 12,6 6,12 0,6" />;
    case 'crossRot': return <path d="M2 2L10 10M10 2L2 10" fill="none" stroke="currentColor" stroke-width="2" />;
  }
}

/**
 * A legenda dos gráficos, em HTML abaixo do canvas: no celular, a do Chart.js tomava boa parte da altura do
 * canvas e cortava os nomes longos. Aqui o texto quebra normalmente. O marcador tem a cor da série (a classe
 * aplica o mesmo token CSS que o canvas lê) e a forma do ponto, para não depender só da cor.
 */
export function Legenda({ itens, hidden = false }: { itens: readonly ItemLegenda[]; hidden?: boolean }) {
  return (
    <ul class="grafico__legenda" role="list" aria-label={GRAFICO_LEGENDA} hidden={hidden}>
      {itens.map(({ serie, texto }) => {
        const forma = formaDaSerie(serie);
        const cor = (serie % TOKENS.series.length) + 1;
        return (
          <li key={`${serie}-${texto}`}>
            <svg class={`grafico__marca grafico__marca--${cor}`} data-forma={forma} viewBox="0 0 12 12" width="12" height="12"
              fill="currentColor" aria-hidden="true" focusable="false">
              {desenho(forma)}
            </svg>
            {texto}
          </li>
        );
      })}
    </ul>
  );
}

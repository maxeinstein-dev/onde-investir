import type { TooltipItem } from 'chart.js';
import { useId, useRef } from 'preact/hooks';
import { descreverFatia } from '../../conteudo/sugestao';
import type { Fatia } from '../../engine/sugestao';
import { formatarPercentual } from '../../formato';
import { AvisoCarregamento } from './AvisoCarregamento';
import { corDaSerie, TOKENS, type PaletaGrafico } from './cores';
import { type ConfigPizza, useGraficoPizza } from './useGraficoPizza';

export interface PropsGraficoObjetivo {
  fatias: readonly Fatia[];
}

const TITULO = 'Distribuição sugerida';

function montarConfig(p: PaletaGrafico, fatias: readonly Fatia[]): ConfigPizza {
  return {
    type: 'doughnut',
    data: {
      labels: fatias.map((f) => descreverFatia(f)),
      datasets: [{
        data: fatias.map((f) => f.percentual),
        backgroundColor: fatias.map((_, i) => corDaSerie(p, i)),
        borderColor: p.premissa,
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item: TooltipItem<'doughnut'>) => `${item.label}: ${formatarPercentual(item.parsed)}`,
          },
        },
      },
    },
  };
}

/** "50% Tesouro Selic, 50% CDB pós-fixado (CDI)". */
function resumoTextual(fatias: readonly Fatia[]): string {
  return fatias.map((f) => `${formatarPercentual(f.percentual)} ${descreverFatia(f)}`).join(', ');
}

/** A distribuição sugerida por fatia (produto + indexador), em pizza: cada fatia com sua cor, percentual e nome. */
export function GraficoObjetivo({ fatias }: PropsGraficoObjetivo) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const idResumo = useId();
  const { estado, tentarDeNovo } = useGraficoPizza(canvas, (p) => montarConfig(p, fatias), [fatias]);
  return (
    <figure class="grafico" aria-busy={estado === 'carregando' ? 'true' : 'false'}>
      <figcaption class="grafico__titulo">{TITULO}</figcaption>
      <div class="grafico__area">
        <canvas ref={canvas} role="img" aria-labelledby={idResumo} hidden={estado === 'erro'} />
        <AvisoCarregamento estado={estado} onTentarDeNovo={tentarDeNovo} />
      </div>
      <ul class="grafico__legenda" role="list" hidden={estado === 'erro'}>
        {fatias.map((f, i) => (
          <li key={`${f.motivo}-${i}`}>
            <svg class={`grafico__marca grafico__marca--${(i % TOKENS.series.length) + 1}`} viewBox="0 0 12 12" width="12" height="12"
              fill="currentColor" aria-hidden="true" focusable="false">
              <circle cx="6" cy="6" r="5" />
            </svg>
            {`${descreverFatia(f)} — ${formatarPercentual(f.percentual)}`}
          </li>
        ))}
      </ul>
      <p class="grafico__resumo" id={idResumo}>{resumoTextual(fatias)}</p>
    </figure>
  );
}

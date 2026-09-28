// Configuração comum dos gráficos de linha: eixo x em dias desde a época, reais no eixo y, a forma do ponto e
// anotações. A legenda não vai no canvas (ver `Legenda`). Funções puras: quem cria o Chart é `useGrafico`.
import type { ChartConfiguration, ScriptableContext, ScriptableLineSegmentContext, TooltipItem } from 'chart.js';
import type { AnnotationOptions } from 'chartjs-plugin-annotation';
import { type DataISO, dataBR } from '../../engine/datas';
import { corDaSerie, formaDaSerie, type PaletaGrafico, TRACEJADO } from './cores';
import { dataDoEixo, formatarEixoMoeda, rotuloDoEixo } from './eixo';

export interface PontoXY { x: number; y: number | null }
export type ConfigLinha = ChartConfiguration<'line', PontoXY[]>;
export type Anotacoes = Record<string, AnnotationOptions>;

/** Quantas marcas (a forma do ponto) cada linha mostra, mais ou menos: o bastante para distinguir sem poluir. */
const MARCAS_POR_LINHA = 8;

const semMovimento = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Uma linha: cor e forma da série `i`, marcas espaçadas (deslocadas entre as séries, para não caírem juntas) e
 * tracejado nos trechos em que `solido(k)` é falso em uma das pontas.
 */
export function linha(p: PaletaGrafico, i: number, rotulo: string, data: PontoXY[], solido: (k: number) => boolean): ConfigLinha['data']['datasets'][number] {
  const intervalo = Math.max(1, Math.round(data.length / MARCAS_POR_LINHA));
  const deslocamento = Math.round((i * intervalo) / 5) % intervalo;
  return {
    label: rotulo,
    data,
    borderColor: corDaSerie(p, i),
    backgroundColor: corDaSerie(p, i),
    borderWidth: 2,
    pointStyle: formaDaSerie(i),
    pointRadius: (ctx: ScriptableContext<'line'>) => (ctx.dataIndex % intervalo === deslocamento ? 4 : 0),
    pointHoverRadius: 5,
    spanGaps: false,
    segment: {
      borderDash: (ctx: ScriptableLineSegmentContext) => (solido(ctx.p0DataIndex) && solido(ctx.p1DataIndex) ? undefined : TRACEJADO),
    },
  };
}

/** Linha vertical com rótulo numa data do eixo x. */
export function linhaVertical(p: PaletaGrafico, x: number, rotulo: string, k: number): AnnotationOptions {
  return {
    type: 'line', xMin: x, xMax: x, borderColor: p.marcador, borderWidth: 1.5,
    label: {
      display: true, content: rotulo, backgroundColor: p.marcador, color: '#ffffff', font: { size: 11 },
      // Alterna em cima e embaixo, para rótulos de trocas próximas não ficarem um sobre o outro.
      position: k % 2 === 0 ? 'start' : 'end',
    },
  };
}

export interface OpcoesLinhas {
  datasets: ConfigLinha['data']['datasets'];
  xMin: number;
  xMax: number;
  anotacoes: Anotacoes;
  /** O texto de cada linha do tooltip. */
  rotuloTooltip: (item: TooltipItem<'line'>) => string;
  /** O eixo y sempre mostra o zero (o gráfico da diferença). */
  incluirZero?: boolean;
}

export function configLinhas(p: PaletaGrafico, { datasets, xMin, xMax, anotacoes, rotuloTooltip, incluirZero = false }: OpcoesLinhas): ConfigLinha {
  const eixo = { color: p.texto };
  return {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: semMovimento() ? false : undefined,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          type: 'linear', min: xMin, max: xMax, grid: { color: p.grade },
          ticks: { ...eixo, maxTicksLimit: 6, callback: (v) => rotuloDoEixo(Number(v)) },
        },
        y: {
          grid: { color: p.grade }, ticks: { ...eixo, callback: (v) => formatarEixoMoeda(Number(v)) },
          ...(incluirZero ? { suggestedMin: 0, suggestedMax: 0 } : {}),
        },
      },
      plugins: {
        // A legenda fica em HTML, abaixo do canvas (`Legenda`): no celular, a do canvas tomava a área do gráfico.
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (itens) => (itens[0] ? dataBR(dataDoEixo(itens[0].parsed.x ?? 0)) : ''),
            label: rotuloTooltip,
          },
        },
        annotation: { annotations: anotacoes },
      },
    },
  };
}

/** O eixo x do gráfico vai da primeira à última data da série. */
export const limites = (datas: readonly DataISO[]): [DataISO, DataISO] | null =>
  datas.length === 0 ? null : [datas[0] as DataISO, datas.at(-1) as DataISO];

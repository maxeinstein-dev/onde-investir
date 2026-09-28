// Chart.js falso para os testes (o jsdom não tem canvas): guarda o canvas e a configuração de cada gráfico criado.
// Uso: vi.mock('chart.js', () => import('./mockChart')) e vi.mock('chartjs-plugin-annotation', () => ({ default: { id: 'annotation' } })).
import type { ChartConfiguration } from 'chart.js';
import { vi } from 'vitest';

export interface GraficoFalso {
  canvas: HTMLCanvasElement;
  config: ChartConfiguration<'line', { x: number; y: number | null }[]>;
  destroy: ReturnType<typeof vi.fn>;
}

export const graficos: GraficoFalso[] = [];

export class Chart {
  static register = vi.fn();
  canvas: HTMLCanvasElement;
  config: GraficoFalso['config'];
  destroy = vi.fn();
  constructor(canvas: HTMLCanvasElement, config: GraficoFalso['config']) {
    this.canvas = canvas;
    this.config = config;
    graficos.push(this);
  }
}

export const LineController = { id: 'line' };
export const LineElement = { id: 'lineElement' };
export const PointElement = { id: 'pointElement' };
export const LinearScale = { id: 'linear' };
export const Tooltip = { id: 'tooltip' };
export const Legend = { id: 'legend' };

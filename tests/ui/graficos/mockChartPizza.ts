// Chart.js falso para os testes da pizza (o jsdom não tem canvas): guarda o canvas e a configuração de cada
// gráfico criado. Uso: vi.mock('chart.js', () => import('./mockChartPizza')).
import type { ChartConfiguration } from 'chart.js';
import { vi } from 'vitest';

export interface GraficoFalso {
  canvas: HTMLCanvasElement;
  config: ChartConfiguration<'doughnut', number[]>;
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

export const ArcElement = { id: 'arc' };
export const DoughnutController = { id: 'doughnut' };
export const Tooltip = { id: 'tooltip' };

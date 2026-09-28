// Chart.js com só o que o gráfico de pizza usa (tree-shaking): fatias e o tooltip. Chunk à parte de chart.ts
// (que registra linhas): assim o gráfico de linha não paga pelo ArcElement e vice-versa.
import { ArcElement, Chart, DoughnutController, Tooltip } from 'chart.js';

Chart.register(ArcElement, DoughnutController, Tooltip);

export { Chart };

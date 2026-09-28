// Chart.js com só o que os gráficos usam (tree-shaking): linhas numa escala linear e as anotações.
// O eixo das datas é linear em dias desde a época (ver `eixo.ts`), então não entra adaptador de datas.
import { Chart, Legend, LinearScale, LineController, LineElement, PointElement, Tooltip } from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';

Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip, Legend, annotationPlugin);

export { Chart };

// Chart.js com só o que os gráficos usam (tree-shaking): linhas numa escala linear e as anotações.
// O eixo das datas é linear em dias desde a época (ver `eixo.ts`), então não entra adaptador de datas. A legenda
// é HTML, abaixo do canvas (`Legenda.tsx`), então o plugin de legenda também fica de fora.
import { Chart, LinearScale, LineController, LineElement, PointElement, Tooltip } from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';

Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip, annotationPlugin);

export { Chart };

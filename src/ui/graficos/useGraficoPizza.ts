import type { ChartConfiguration } from 'chart.js';
import type { RefObject } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useEsquemaDeCores } from './useEsquemaDeCores';
import { lerPaleta, type PaletaGrafico } from './cores';
import type { EstadoGrafico } from './useGrafico';

type ModuloChartPizza = typeof import('./chartPizza');
export type ConfigPizza = ChartConfiguration<'doughnut', number[]>;

// Mesmo padrão de useGrafico.ts (import() sob demanda, cache em módulo, estado carregando/pronto/erro,
// tentarDeNovo), mas para o chunk de pizza. NÃO reaproveita useGrafico diretamente porque ele é tipado para
// ConfigLinha; duplicar o hook pequeno é mais simples que generalizar os dois para um tipo genérico agora
// (YAGNI). Cache e promessa em módulo à parte de useGrafico.ts: os dois chunks (linha e pizza) carregam e
// falham independentemente.
let modulo: ModuloChartPizza | null = null;
let carregando: Promise<ModuloChartPizza> | null = null;

/** O import do chunk, num objeto para os testes simularem a rede caindo e voltando. */
export const importador = { chartPizza: (): Promise<ModuloChartPizza> => import('./chartPizza') };

function carregarChartPizza(): Promise<ModuloChartPizza> {
  carregando ??= importador.chartPizza().then(
    (m) => { modulo = m; return m; },
    (e: unknown) => { carregando = null; throw e; }, // uma falha não fica guardada: o próximo gráfico tenta de novo
  );
  return carregando;
}

/**
 * Carrega o Chart.js (chunk da pizza) sob demanda, cria o gráfico no canvas e o destrói ao desmontar e sempre
 * que `deps` mudar (antes de criar o novo). As cores saem dos tokens CSS na hora. Devolve o estado do
 * carregamento, para a figura mostrar o aviso certo, e `tentarDeNovo`, para o botão do aviso de falha. Depois
 * de uma falha, `deps` mudar também tenta de novo.
 */
export function useGraficoPizza(
  canvas: RefObject<HTMLCanvasElement>, montar: (p: PaletaGrafico) => ConfigPizza, deps: readonly unknown[],
): { estado: EstadoGrafico; tentarDeNovo: () => void } {
  const [chart, setChart] = useState<ModuloChartPizza | null>(modulo);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const esquema = useEsquemaDeCores();
  useEffect(() => {
    if (chart) return;
    let vivo = true;
    setErro(false);
    carregarChartPizza().then((m) => { if (vivo) setChart(m); }, () => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [chart, tentativa, ...deps]);
  useEffect(() => {
    const el = canvas.current;
    if (!el || !chart) return;
    const grafico = new chart.Chart(el, montar(lerPaleta(el)));
    return () => grafico.destroy();
    // `montar` é recriada a cada renderização; quem diz quando refazer é `deps`.
  }, [chart, esquema, ...deps]);
  const estado: EstadoGrafico = erro ? 'erro' : chart ? 'pronto' : 'carregando';
  return { estado, tentarDeNovo: () => setTentativa((t) => t + 1) };
}

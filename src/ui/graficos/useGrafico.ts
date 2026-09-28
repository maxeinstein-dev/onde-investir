import type { RefObject } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { type PaletaGrafico, lerPaleta } from './cores';
import type { ConfigLinha } from './config';

type ModuloChart = typeof import('./chart');
export type EstadoGrafico = 'carregando' | 'pronto' | 'erro';

// O Chart.js (e o plugin de anotação) fica num chunk à parte, carregado só quando um gráfico é montado: o bundle
// inicial não paga por ele. O Vite gera o chunk em /assets, no mesmo domínio (a CSP com script-src 'self' aceita).
let modulo: ModuloChart | null = null;
let carregando: Promise<ModuloChart> | null = null;

/** O import do chunk, num objeto para os testes simularem a rede caindo e voltando. */
export const importador = { chart: (): Promise<ModuloChart> => import('./chart') };

function carregarChart(): Promise<ModuloChart> {
  carregando ??= importador.chart().then(
    (m) => { modulo = m; return m; },
    (e: unknown) => { carregando = null; throw e; }, // uma falha não fica guardada: o próximo gráfico tenta de novo
  );
  return carregando;
}

/**
 * Carrega o Chart.js sob demanda, cria o gráfico no canvas e o destrói ao desmontar e sempre que `deps` mudar
 * (antes de criar o novo), para não deixar instâncias nem observadores de redimensionamento para trás. As cores
 * saem dos tokens CSS na hora. Devolve o estado do carregamento, para a figura mostrar o aviso certo, e
 * `tentarDeNovo`, para o botão do aviso de falha. Depois de uma falha, `deps` mudar também tenta de novo.
 */
export function useGrafico(
  canvas: RefObject<HTMLCanvasElement>, montar: (p: PaletaGrafico) => ConfigLinha, deps: readonly unknown[],
): { estado: EstadoGrafico; tentarDeNovo: () => void } {
  const [chart, setChart] = useState<ModuloChart | null>(modulo);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    if (chart) return;
    let vivo = true;
    setErro(false);
    carregarChart().then((m) => { if (vivo) setChart(m); }, () => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [chart, tentativa, ...deps]);
  useEffect(() => {
    const el = canvas.current;
    if (!el || !chart) return;
    const grafico = new chart.Chart(el, montar(lerPaleta(el)));
    return () => grafico.destroy();
    // `montar` é recriada a cada renderização; quem diz quando refazer é `deps`.
  }, [chart, ...deps]);
  const estado: EstadoGrafico = erro ? 'erro' : chart ? 'pronto' : 'carregando';
  return { estado, tentarDeNovo: () => setTentativa((t) => t + 1) };
}

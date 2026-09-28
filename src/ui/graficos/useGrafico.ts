import type { RefObject } from 'preact';
import { useEffect } from 'preact/hooks';
import { Chart } from './chart';
import { type PaletaGrafico, lerPaleta } from './cores';
import type { ConfigLinha } from './config';

/**
 * Cria o gráfico no canvas e o destrói ao desmontar e sempre que `deps` mudar (antes de criar o novo), para não
 * deixar instâncias nem observadores de redimensionamento para trás. As cores saem dos tokens CSS na hora.
 */
export function useGrafico(canvas: RefObject<HTMLCanvasElement>, montar: (p: PaletaGrafico) => ConfigLinha, deps: readonly unknown[]): void {
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const grafico = new Chart(el, montar(lerPaleta(el)));
    return () => grafico.destroy();
    // `montar` é recriada a cada renderização; quem diz quando refazer é `deps`.
  }, deps);
}

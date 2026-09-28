import { GRAFICO_CARREGAMENTO } from '../../conteudo/serie';
import type { EstadoGrafico } from './useGrafico';

/** O aviso dentro da área do gráfico enquanto o Chart.js carrega, ou se ele não carregar. */
export function AvisoCarregamento({ estado }: { estado: EstadoGrafico }) {
  if (estado === 'pronto') return null;
  return <p class="grafico__aviso">{estado === 'carregando' ? GRAFICO_CARREGAMENTO.carregando : GRAFICO_CARREGAMENTO.erro}</p>;
}

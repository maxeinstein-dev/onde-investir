import { GRAFICO_CARREGAMENTO } from '../../conteudo/serie';
import type { EstadoGrafico } from './useGrafico';

/**
 * O aviso dentro da área do gráfico enquanto o Chart.js carrega ou, se ele não carregar, a falha com o botão
 * para tentar de novo.
 */
export function AvisoCarregamento({ estado, onTentarDeNovo }: { estado: EstadoGrafico; onTentarDeNovo: () => void }) {
  if (estado === 'pronto') return null;
  if (estado === 'carregando') return <div class="grafico__aviso"><p>{GRAFICO_CARREGAMENTO.carregando}</p></div>;
  return (
    <div class="grafico__aviso">
      <p>{GRAFICO_CARREGAMENTO.erro}</p>
      <button type="button" onClick={onTentarDeNovo}>{GRAFICO_CARREGAMENTO.tentarDeNovo}</button>
    </div>
  );
}

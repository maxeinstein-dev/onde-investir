import type { PreferenciasCenario } from '../armazenamento/preferencias';
import type { CenarioAtivo } from '../dados/cenarios';
import type { IndicadoresCarregados } from '../dados/indicadores';
import { dataBR } from '../engine/datas';
import { formatarPercentual } from '../formato';
import { OPCOES } from './PainelIndicadores';

/** A linha-resumo do cenário em uso, mostrada no botão do painel recolhido. */
export function textoResumoCenario(
  indicadores: IndicadoresCarregados | null, preferencias: PreferenciasCenario, ativo: CenarioAtivo,
): string {
  if (indicadores === null) return 'Cenário: carregando indicadores…';
  // Sem projeção, o cenário em uso é o manual, mesmo que a escolha salva seja outra (como no painel).
  const escolha = ativo.projetado ? preferencias.escolha : 'MANUAL';
  const rotulo = OPCOES.find((o) => o.valor === escolha)?.rotulo ?? escolha;
  const a = indicadores.atuais;
  if (a === null) return `Cenário: ${rotulo} · valores atuais indisponíveis`;
  return `Cenário: ${rotulo} · CDI ${formatarPercentual(a.cdiAA)} · IPCA ${formatarPercentual(a.ipca12mAA)} · ${dataBR(a.dataReferencia)}`;
}

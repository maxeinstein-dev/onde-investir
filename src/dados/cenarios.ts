// src/dados/cenarios.ts
import { type Cenario, cenarioConstante } from '../engine/indexadores';
import { type CenarioProjetado, montarCenario, type Premissas, type TipoCenario } from '../engine/projecao';
import { CENARIO_INICIAL } from './cenarioInicial';
import type { IndicadoresCarregados } from './indicadores';

export type EscolhaCenario = TipoCenario | 'MANUAL';
/** Em %, como na UI do M1. */
export interface ValoresManuais { cdi: number; selicMeta: number; ipca: number; tr: number }

export interface CenarioAtivo { cenario: Cenario; projetado: CenarioProjetado | null; motivoManual?: string }

/** Cada valor finito e acima de −100% (a mesma regra de `cenarioConstante`). */
export const valoresManuaisValidos = (m: ValoresManuais): boolean =>
  [m.cdi, m.selicMeta, m.ipca, m.tr].every((v) => Number.isFinite(v) && v > -100);

const constanteDe = (m: ValoresManuais): Cenario =>
  cenarioConstante({ cdiAA: m.cdi / 100, selicMetaAA: m.selicMeta / 100, ipcaAA: m.ipca / 100, trAM: m.tr / 100 });

const MOTIVO_MANUAL_INVALIDO = `Valores manuais inválidos: usando os valores de referência de ${CENARIO_INICIAL.dataReferencia}.`;

/** O cenário manual; se os valores forem inválidos, os de referência, com o motivo acrescentado. Nunca lança. */
function comManual(manual: ValoresManuais, motivo?: string): CenarioAtivo {
  if (valoresManuaisValidos(manual)) {
    return motivo === undefined ? { cenario: constanteDe(manual), projetado: null } : { cenario: constanteDe(manual), projetado: null, motivoManual: motivo };
  }
  return {
    cenario: constanteDe(CENARIO_INICIAL.valores),
    projetado: null,
    motivoManual: motivo === undefined ? MOTIVO_MANUAL_INVALIDO : `${motivo} ${MOTIVO_MANUAL_INVALIDO}`,
  };
}

const noManual = (manual: ValoresManuais, motivo: string): CenarioAtivo => comManual(manual, `${motivo}: usando o cenário manual.`);

/** Cenário projetado a partir dos indicadores; se faltar dado ou as premissas forem inválidas, o manual, com o motivo. Nunca lança. */
export function cenarioAtivo(
  escolha: EscolhaCenario, ind: IndicadoresCarregados, premissas: Premissas, manual: ValoresManuais,
): CenarioAtivo {
  if (escolha === 'MANUAL') return comManual(manual);
  const { atuais, focus, reunioes } = ind;
  if (!atuais) return noManual(manual, 'Sem dados do SGS');
  if (!focus) return noManual(manual, 'Sem dados do Focus');
  if (!reunioes) return noManual(manual, 'Sem o calendário do Copom');
  try {
    const projetado = montarCenario(
      escolha, focus, { dataReferencia: atuais.dataReferencia, selicMetaAA: atuais.selicMetaAA, trAM: atuais.trAM }, reunioes, premissas,
    );
    return { cenario: projetado, projetado };
  } catch (e) {
    return noManual(manual, e instanceof Error ? e.message : 'Não foi possível projetar o cenário');
  }
}

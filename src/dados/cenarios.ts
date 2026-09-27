// src/dados/cenarios.ts
import { type Cenario, cenarioConstante } from '../engine/indexadores';
import { type CenarioProjetado, montarCenario, type Premissas, type TipoCenario } from '../engine/projecao';
import type { IndicadoresCarregados } from './indicadores';

export type EscolhaCenario = TipoCenario | 'MANUAL';
/** Em %, como na UI do M1. */
export interface ValoresManuais { cdi: number; selicMeta: number; ipca: number; tr: number }

export interface CenarioAtivo { cenario: Cenario; projetado: CenarioProjetado | null; motivoManual?: string }

const manualDe = (m: ValoresManuais): Cenario =>
  cenarioConstante({ cdiAA: m.cdi / 100, selicMetaAA: m.selicMeta / 100, ipcaAA: m.ipca / 100, trAM: m.tr / 100 });

const noManual = (manual: ValoresManuais, motivo: string): CenarioAtivo =>
  ({ cenario: manualDe(manual), projetado: null, motivoManual: `${motivo}: usando o cenário manual.` });

/** Cenário projetado a partir dos indicadores; se faltar dado ou as premissas forem inválidas, o manual, com o motivo. */
export function cenarioAtivo(
  escolha: EscolhaCenario, ind: IndicadoresCarregados, premissas: Premissas, manual: ValoresManuais,
): CenarioAtivo {
  if (escolha === 'MANUAL') return { cenario: manualDe(manual), projetado: null };
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

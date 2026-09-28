// Preferências do usuário no localStorage: palpites (chave do M1) e cenário (escolha, premissas, valores manuais).
import { z } from '../zod';
import type { Armazenamento } from '../dados/cache';
import { CENARIO_INICIAL } from '../dados/cenarioInicial';
import { type EscolhaCenario, type ValoresManuais, valoresManuaisValidos } from '../dados/cenarios';
import { PREMISSAS_PADRAO, type Premissas } from '../engine/projecao';

/** Chave e valores ('ligados' / 'desligados') do M1: quem desligou os palpites continua com eles desligados. */
export const CHAVE_PALPITES = 'rende:palpites';
export const CHAVE_PREFERENCIAS = 'rende:preferencias:v1';

export function lerPalpitesLigados(arm: Armazenamento): boolean {
  try {
    return arm.getItem(CHAVE_PALPITES) !== 'desligados';
  } catch {
    return true;
  }
}

export function salvarPalpitesLigados(arm: Armazenamento, ligados: boolean): void {
  try {
    arm.setItem(CHAVE_PALPITES, ligados ? 'ligados' : 'desligados');
  } catch {
    // Sem storage (aba anônima, bloqueio): a preferência vale só nesta visita.
  }
}

export interface PreferenciasCenario { escolha: EscolhaCenario; premissas: Premissas; manual: ValoresManuais }

export const PREFERENCIAS_PADRAO: PreferenciasCenario = {
  escolha: 'BASE', premissas: PREMISSAS_PADRAO, manual: CENARIO_INICIAL.valores,
};

const EsquemaEscolha = z.enum(['SOBEM', 'BASE', 'CAEM', 'MANUAL']);
/** Os mesmos limites de `validarPremissas` no engine. */
const EsquemaPremissas = z.strictObject({
  k: z.number().min(0),
  ipcaLongoPrazoAA: z.number().gt(-1),
  juroRealLongoPrazoAA: z.number().gt(-1),
  anosConvergencia: z.number().int().min(0).max(30),
  spreadCDI: z.number().min(0).lt(0.05),
});
const EsquemaManual = z.strictObject({ cdi: z.number(), selicMeta: z.number(), ipca: z.number(), tr: z.number() })
  .refine(valoresManuaisValidos);

/** Cada parte é validada sozinha: uma parte inválida volta ao padrão sem apagar as outras. */
export function lerPreferencias(arm: Armazenamento): PreferenciasCenario {
  let bruto: unknown;
  try {
    const texto = arm.getItem(CHAVE_PREFERENCIAS);
    if (texto === null) return PREFERENCIAS_PADRAO;
    bruto = JSON.parse(texto);
  } catch {
    return PREFERENCIAS_PADRAO;
  }
  const obj = typeof bruto === 'object' && bruto !== null ? (bruto as Record<string, unknown>) : {};
  const escolha = EsquemaEscolha.safeParse(obj.escolha);
  const premissas = EsquemaPremissas.safeParse(obj.premissas);
  const manual = EsquemaManual.safeParse(obj.manual);
  return {
    escolha: escolha.success ? escolha.data : PREFERENCIAS_PADRAO.escolha,
    premissas: premissas.success ? premissas.data : PREFERENCIAS_PADRAO.premissas,
    manual: manual.success ? manual.data : PREFERENCIAS_PADRAO.manual,
  };
}

/** false se o storage recusar. */
export function salvarPreferencias(arm: Armazenamento, p: PreferenciasCenario): boolean {
  try {
    arm.setItem(CHAVE_PREFERENCIAS, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

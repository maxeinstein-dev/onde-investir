/** Valores do SGS/BCB em 24/09/2026 (séries 4389, 432, 433 acumulada 12m, 226). No M2 vêm ao vivo. */
export const CENARIO_INICIAL = {
  dataReferencia: '24/09/2026',
  valores: { cdi: 13.65, selicMeta: 13.75, ipca: 4.22, tr: 0.1646 },
};
export type ValoresCenario = typeof CENARIO_INICIAL.valores;

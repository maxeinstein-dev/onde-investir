// Regras de alocação da sugestão por objetivo (spec §9.1, design M4a §3). Ao contrário das
// demais regras de `regras/`, estas não têm fonte legal: são uma heurística própria do
// app, por isso NÃO usam `resolverRegra`/`VersaoRegra` (não há "vigência" de uma lei).
// Ficam num arquivo à parte, no mesmo espírito de "regra como dado", para serem fáceis de
// achar e ajustar sem espalhar números pelo código de sugestão.

/** Reserva de emergência: quantas vezes o gasto mensal, conforme a estabilidade da renda. */
export const MULTIPLICADOR_RESERVA = { estavel: 6, variavel: 12 } as const;

export interface FaixaLongoPrazo {
  /** Fronteira superior da faixa, em anos (inclusive). A última faixa usa Infinity. */
  ateAnos: number;
  /** Fração em Tesouro IPCA+ (ou, no longo prazo dentro de "sem objetivo definido", o mesmo papel). */
  ipca: number;
  /** Fração em pós-fixado. */
  pos: number;
}

/** Longo prazo / aposentadoria e a faixa "5+ anos" de "sem objetivo definido" (design M4a §3). */
export const FAIXAS_LONGO_PRAZO: readonly FaixaLongoPrazo[] = [
  { ateAnos: 10, ipca: 0.6, pos: 0.4 },
  { ateAnos: 20, ipca: 0.7, pos: 0.3 },
  { ateAnos: Infinity, ipca: 0.8, pos: 0.2 },
];

/** A primeira faixa cujo `ateAnos` cobre o horizonte. */
export function faixaLongoPrazo(horizonteAnos: number): FaixaLongoPrazo {
  return FAIXAS_LONGO_PRAZO.find((f) => horizonteAnos <= f.ateAnos) ?? (FAIXAS_LONGO_PRAZO.at(-1) as FaixaLongoPrazo);
}

/** Janela usada para calcular a renda mensal necessária: 30 dias corridos a partir de hoje. */
export const DIAS_RENDA_MENSAL = 30;

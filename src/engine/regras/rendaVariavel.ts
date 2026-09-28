// src/engine/regras/rendaVariavel.ts
// Regras tributárias de renda variável para pessoa física (spec §9.2, design M4b1). Só as
// regras que a lição 10 cita hoje; o cálculo (M4b2) pode precisar de mais regras depois.
import type { DataISO } from '../datas';
import { resolverRegra, type VersaoRegra } from './tipos';

export interface RegraFII {
  /** Cotistas mínimos do fundo para a isenção dos rendimentos distribuídos. */
  minimoCotistas: number;
  /** Participação máxima do cotista (fração) para manter a isenção dos rendimentos. */
  participacaoMaximaFracao: number;
  /** Alíquota do ganho de capital na venda de cotas: sempre tributado, sem isenção por valor. */
  aliquotaVendaCotas: number;
}

// Lei 14.754/2023 elevou o piso de 50 para 100 cotistas. Fonte secundária (escritório de
// advocacia), sem acesso direto ao Planalto na pesquisa de 2026-09-29 (ECONNRESET). Conferir o
// texto oficial da lei quando o Planalto estiver acessível.
export const VERSOES_FII: readonly VersaoRegra<RegraFII>[] = [
  {
    vigenciaInicio: '2023-12-13',
    fonte: 'https://www.mayerbrown.com/pt/insights/publications/2025/12/enactment-of-law-no-15270-2025-which-establishes-dividend-taxation-expands-the-exemption-threshold-and-introduces-a-minimum-tax-on-high-incomes',
    valor: { minimoCotistas: 100, participacaoMaximaFracao: 0.1, aliquotaVendaCotas: 0.2 },
  },
];

export const FONTE_FII = VERSOES_FII[0]?.fonte ?? '';

/** A regra de isenção dos rendimentos de FII vigente na data, e a alíquota (fixa) da venda de cotas. */
export function regraFII(data: DataISO): RegraFII {
  return resolverRegra('isenção de FII', VERSOES_FII, data);
}

export interface RegraVendaAcoes {
  /** Vendas de ações no mercado à vista, por mês, até este valor: isentas de IR sobre o ganho. */
  limiteMensalIsento: number;
}

// Lei 11.033/2004, art. 3º, I. Fonte oficial: legin da Câmara dos Deputados (publicação original).
export const VERSOES_VENDA_ACOES: readonly VersaoRegra<RegraVendaAcoes>[] = [
  {
    vigenciaInicio: '2004-12-21',
    fonte: 'https://www2.camara.leg.br/legin/fed/lei/2004/lei-11033-21-dezembro-2004-535177-publicacaooriginal-22704-pl.html',
    valor: { limiteMensalIsento: 20_000 },
  },
];

export const FONTE_VENDA_ACOES = VERSOES_VENDA_ACOES[0]?.fonte ?? '';

export function regraVendaAcoes(data: DataISO): RegraVendaAcoes {
  return resolverRegra('isenção de venda de ações', VERSOES_VENDA_ACOES, data);
}

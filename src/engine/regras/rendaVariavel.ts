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

// Lei 14.754/2023 elevou o piso de 50 para 100 cotistas. Fonte: Planalto (texto oficial da lei;
// trocada de uma fonte secundária — escritório de advocacia — na Tarefa B3 desta implementação,
// porque o teste de conteúdo só aceita domínio oficial, e não fazia parte do plano original). O
// conteúdo do artigo específico (100 cotistas, 10% de participação) não pôde ser conferido nesta
// tarefa: a busca da URL funcionou, mas o fetch da página deu ECONNRESET. Conferência literal do
// artigo fica para a revisão editorial (Tarefa C1).
export const VERSOES_FII: readonly VersaoRegra<RegraFII>[] = [
  {
    vigenciaInicio: '2023-12-13',
    fonte: 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14754.htm',
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

// Lei 11.033/2004, art. 3º, I. Fonte oficial: Planalto (publicação original; a Câmara dos
// Deputados não está no domínio oficial que o teste de conteúdo aceita — troca feita na
// Tarefa B3 desta implementação, não fazia parte do plano original).
export const VERSOES_VENDA_ACOES: readonly VersaoRegra<RegraVendaAcoes>[] = [
  {
    vigenciaInicio: '2004-12-21',
    fonte: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/L11033.htm',
    valor: { limiteMensalIsento: 20_000 },
  },
];

export const FONTE_VENDA_ACOES = VERSOES_VENDA_ACOES[0]?.fonte ?? '';

export function regraVendaAcoes(data: DataISO): RegraVendaAcoes {
  return resolverRegra('isenção de venda de ações', VERSOES_VENDA_ACOES, data);
}

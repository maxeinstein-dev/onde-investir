// Textos da sugestão por objetivo (spec §9.1). O engine (src/engine/sugestao.ts) nunca produz
// texto: aqui, cada MotivoFatia vira uma frase e uma lição, no mesmo padrão de conteudo/alertas.ts.
// Rascunho: a revisão editorial é a Tarefa D1 do M4a.
import type { IdLicao } from './licoes/tipos';
import type { Fatia, MotivoFatia, Objetivo } from '../engine/sugestao';
import type { TipoIndexacao, TipoProduto } from '../engine/produtos';
import { formatarMoeda, formatarPercentual } from '../formato';

export const AVISO_EDUCATIVO = 'Conteúdo educativo, a partir de regras gerais. Não é uma recomendação de investimento personalizada.';

const TEXTO_E_LICAO: Record<MotivoFatia, { texto: string; licao: IdLicao }> = {
  RESERVA_TESOURO_SELIC: { texto: 'Garantia do Tesouro Nacional e liquidez diária, sem risco de preço se vendido antes do vencimento.', licao: 'reserva' },
  RESERVA_CDB_LIQUIDEZ: { texto: 'Garantia do FGC, com liquidez diária. Divide o dinheiro entre dois tipos de garantia diferentes.', licao: 'reserva' },
  DATA_VENCIMENTO_CASADO: { texto: 'O vencimento bate com a sua data, então não é preciso vender antes. O preço de mercado no meio do caminho não importa.', licao: 'marcacao-mercado' },
  DATA_SEM_CASAMENTO: { texto: 'Nenhuma oferta do catálogo vence perto da sua data. Um pós-fixado com liquidez diária atravessa a data sem risco de preço.', licao: 'liquidez' },
  LONGO_PRAZO_IPCA: { texto: 'Protege o dinheiro da inflação ao longo dos anos.', licao: 'indexadores' },
  LONGO_PRAZO_POS: { texto: 'Mantém uma parte com liquidez, acompanhando os juros.', licao: 'diversificacao' },
  SEM_OBJETIVO_POS: { texto: 'Acompanha os juros e tem liquidez para prazos mais curtos.', licao: 'indexadores' },
  SEM_OBJETIVO_PRE: { texto: 'Taxa combinada hoje, para um horizonte de alguns anos.', licao: 'indexadores' },
  SEM_OBJETIVO_IPCA: { texto: 'Para a parte do horizonte mais distante, protege contra a inflação.', licao: 'indexadores' },
  RENDA_MENSAL_TRIBUTADO: { texto: 'Rende junto com os juros, mas o Imposto de Renda desconta parte do rendimento a cada resgate.', licao: 'impostos' },
  RENDA_MENSAL_ISENTO: { texto: 'Sem Imposto de Renda sobre o rendimento, mas tem carência mínima de 6 meses antes do primeiro resgate.', licao: 'liquidez' },
};

export function textoDaFatia(f: Fatia): string {
  return TEXTO_E_LICAO[f.motivo].texto;
}

export function licaoDaFatia(f: Fatia): IdLicao {
  return TEXTO_E_LICAO[f.motivo].licao;
}

const NOME_PRODUTO: Record<TipoProduto, string> = {
  CDB: 'CDB', RDB: 'RDB', LC: 'LC', LCI: 'LCI', LCA: 'LCA',
  TESOURO_SELIC: 'Tesouro Selic', TESOURO_PREFIXADO: 'Tesouro Prefixado', TESOURO_IPCA: 'Tesouro IPCA+', POUPANCA: 'Poupança',
};

const SUFIXO_INDEXADOR: Partial<Record<TipoIndexacao, string>> = {
  POS_CDI: ' pós-fixado (CDI)', PRE: ' prefixado', IPCA_MAIS: ' IPCA+',
};

/** Nome genérico do produto, sem taxa (a sugestão nunca inventa um número de mercado). */
export function descreverFatia(f: Fatia): string {
  if (f.produto === 'TESOURO_SELIC' || f.produto === 'TESOURO_PREFIXADO' || f.produto === 'TESOURO_IPCA' || f.produto === 'POUPANCA') {
    return NOME_PRODUTO[f.produto];
  }
  return `${NOME_PRODUTO[f.produto]}${SUFIXO_INDEXADOR[f.indexacaoTipo] ?? ''}`;
}

/** A frase do aviso de FGC combinado, ou null quando a fatia não tem `fgc`. */
export function textoDoFgc(f: Fatia): string | null {
  if (!f.fgc) return null;
  return `Somado ao que você já tem em ${f.fgc.conglomerado}, isso passa do limite do FGC em ${formatarMoeda(f.fgc.excedente)}. Considere outro emissor.`;
}

/** Nota fixa (sem cálculo) para a lição de renda variável, em objetivos de longo prazo (spec §9.1/§9.2). */
export function notaRendaVariavel(objetivo: Objetivo): string | null {
  const horizonte = objetivo.tipo === 'LONGO_PRAZO' || objetivo.tipo === 'SEM_OBJETIVO' ? objetivo.horizonteAnos : 0;
  return horizonte > 5 ? 'Para prazos acima de 5 anos, carteiras costumam incluir renda variável.' : null;
}

/** Rótulo do destaque do principal necessário: a referência é sempre um CDB a 100% do CDI, fácil de achar. */
export const ROTULO_PRINCIPAL_NECESSARIO = 'Principal necessário (CDB a 100% do CDI)';

/** Frase abaixo do número em destaque: só formata valores que o motor já calculou. */
export function fraseReferenciaPrincipal(rendaMensal: number, principalAtual: number): string {
  return `Uma oferta fácil de encontrar. Com ${formatarMoeda(principalAtual)}, a renda de ${formatarMoeda(rendaMensal)} por mês não fecha.`;
}

/** A mesma conta pela melhor oferta do catálogo da pessoa. */
export function fraseMelhorOferta(nomeDaOferta: string, percentualCDI: number, valor: number): string {
  return `Com a sua melhor oferta (${nomeDaOferta}, ${formatarPercentual(percentualCDI)} do CDI): cerca de ${formatarMoeda(valor)}.`;
}

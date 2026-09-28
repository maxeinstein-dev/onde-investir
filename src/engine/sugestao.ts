// Sugestão de carteira por objetivo (spec §9.1). Motor puro: recebe o catálogo e a carteira
// como dados (não busca nada), e devolve fatias ESTRUTURADAS — nunca texto nem IdLicao,
// no mesmo padrão de src/engine/alertas.ts. A tradução para texto fica em
// src/conteudo/sugestao.ts.
import { type DataISO, ehDataValida } from './datas';
import { OfertaInvalidaError } from './erros';
import type { ItemFGC } from './fgc';
import { coberto, normalizarConglomerado } from './fgc';
import type { OfertaCadastrada } from './ofertas';
import type { TipoIndexacao, TipoProduto } from './produtos';
import { regraFGC } from './regras/fgc';
import { MULTIPLICADOR_RESERVA } from './regras/sugestao';

export type Objetivo =
  | { tipo: 'RESERVA'; gastoMensal: number; rendaEstavel: boolean }
  | { tipo: 'COM_DATA'; valorAlvo: number; data: DataISO }
  | { tipo: 'LONGO_PRAZO'; horizonteAnos: number }
  | { tipo: 'SEM_OBJETIVO'; horizonteAnos: number };

export type MotivoFatia =
  | 'RESERVA_TESOURO_SELIC' | 'RESERVA_CDB_LIQUIDEZ'
  | 'DATA_VENCIMENTO_CASADO' | 'DATA_SEM_CASAMENTO'
  | 'LONGO_PRAZO_IPCA' | 'LONGO_PRAZO_POS'
  | 'SEM_OBJETIVO_POS' | 'SEM_OBJETIVO_PRE' | 'SEM_OBJETIVO_IPCA';

export interface Fatia {
  produto: TipoProduto;
  indexacaoTipo: TipoIndexacao;
  /** Fração desta fatia no objetivo; a soma das fatias de um objetivo é 1. */
  percentual: number;
  motivo: MotivoFatia;
  garantia: 'FGC' | 'TESOURO_NACIONAL';
  /** `valorAlvo(objetivo) * percentual`; null quando o objetivo não tem valor-alvo (longo prazo, sem objetivo). */
  valor: number | null;
  /** A primeira oferta do catálogo compatível (mesmo produto + mesma família de indexador). */
  ofertaCatalogo?: OfertaCadastrada;
  /** Presente só quando há `ofertaCatalogo` e a soma com a carteira, no conglomerado dela, passa do limite do FGC. */
  fgc?: { conglomerado: string; excedente: number };
}

export interface ContextoSugestao {
  catalogo: readonly OfertaCadastrada[];
  /** A exposição já existente (carteira do M3a), para o aviso de FGC combinado. */
  carteira: readonly ItemFGC[];
  hoje: DataISO;
}

export function valorAlvo(objetivo: Objetivo): number | null {
  switch (objetivo.tipo) {
    case 'RESERVA': return objetivo.gastoMensal * (objetivo.rendaEstavel ? MULTIPLICADOR_RESERVA.estavel : MULTIPLICADOR_RESERVA.variavel);
    case 'COM_DATA': return objetivo.valorAlvo;
    case 'LONGO_PRAZO':
    case 'SEM_OBJETIVO':
      return null;
  }
}

export function validarObjetivo(o: Objetivo, hoje: DataISO): void {
  switch (o.tipo) {
    case 'RESERVA':
      if (!Number.isFinite(o.gastoMensal) || o.gastoMensal <= 0) throw new OfertaInvalidaError('Preencha o gasto mensal, maior que zero.');
      break;
    case 'COM_DATA':
      if (!Number.isFinite(o.valorAlvo) || o.valorAlvo <= 0) throw new OfertaInvalidaError('Preencha o valor-alvo, maior que zero.');
      if (!ehDataValida(o.data)) throw new OfertaInvalidaError('A data é inválida.');
      else if (o.data <= hoje) throw new OfertaInvalidaError('A data precisa ser no futuro.');
      break;
    case 'LONGO_PRAZO':
    case 'SEM_OBJETIVO':
      if (!Number.isInteger(o.horizonteAnos) || o.horizonteAnos <= 0) {
        throw new OfertaInvalidaError('Informe um horizonte em anos inteiro, maior que zero.');
      }
      break;
  }
}

function primeiraCompativel(
  catalogo: readonly OfertaCadastrada[], produto: TipoProduto, indexacaoTipo: TipoIndexacao, liquidezDiaria: boolean,
): OfertaCadastrada | undefined {
  return catalogo.find(
    (o) => o.produto === produto && o.indexacao.tipo === indexacaoTipo && (!liquidezDiaria || o.liquidez === 'DIARIA'),
  );
}

function excedenteFGC(conglomerado: string, valorFatia: number, carteira: readonly ItemFGC[], hoje: DataISO): Fatia['fgc'] {
  const limite = regraFGC(hoje).porConglomerado;
  const chave = normalizarConglomerado(conglomerado);
  const jaTem = carteira
    .filter((i) => coberto(i.produto) && normalizarConglomerado(i.conglomerado) === chave)
    .reduce((soma, i) => soma + i.brutoEm(hoje), 0);
  const total = jaTem + valorFatia;
  return total > limite ? { conglomerado, excedente: total - limite } : undefined;
}

export interface OpcoesCasamento {
  /** Exige liquidez diária na oferta do catálogo (reserva de emergência). Padrão: false. */
  liquidezDiaria?: boolean;
}

/**
 * Preenche `ofertaCatalogo` (a primeira compatível) e `fgc` (quando há oferta casada, garantia FGC, valor
 * definido e a soma com a carteira do mesmo conglomerado passa do limite) em cada fatia.
 */
export function casarComCatalogo(
  fatias: readonly Fatia[], catalogo: readonly OfertaCadastrada[], carteira: readonly ItemFGC[], hoje: DataISO,
  opcoes: OpcoesCasamento = {},
): Fatia[] {
  return fatias.map((f) => {
    const ofertaCatalogo = primeiraCompativel(catalogo, f.produto, f.indexacaoTipo, opcoes.liquidezDiaria ?? false);
    const fgc = f.garantia === 'FGC' && f.valor !== null && ofertaCatalogo
      ? excedenteFGC(ofertaCatalogo.conglomerado, f.valor, carteira, hoje)
      : undefined;
    return { ...f, ofertaCatalogo, fgc };
  });
}

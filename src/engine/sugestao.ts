// Sugestão de carteira por objetivo (spec §9.1). Motor puro: recebe o catálogo e a carteira
// como dados (não busca nada), e devolve fatias ESTRUTURADAS — nunca texto nem IdLicao,
// no mesmo padrão de src/engine/alertas.ts. A tradução para texto fica em
// src/conteudo/sugestao.ts.
import { type DataISO, ehDataValida } from './datas';
import { OfertaInvalidaError } from './erros';
import type { ItemFGC } from './fgc';
import { coberto, normalizarConglomerado } from './fgc';
import type { OfertaCadastrada } from './ofertas';
import { garantiaDe, type TipoIndexacao, type TipoProduto } from './produtos';
import { regraFGC } from './regras/fgc';
import { faixaLongoPrazo, MULTIPLICADOR_RESERVA } from './regras/sugestao';

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
  // ">" e não ">=": o limite do FGC precisa ser ULTRAPASSADO, não só atingido. Exatamente R$ 250 mil
  // ainda está coberto, sem excedente.
  return total > limite ? { conglomerado, excedente: total - limite } : undefined;
}

export interface OpcoesCasamento {
  /** Exige liquidez diária na oferta do catálogo (reserva de emergência). Padrão: false. */
  liquidezDiaria?: boolean;
}

/**
 * Preenche `ofertaCatalogo` (a primeira compatível) e `fgc` (quando há oferta casada, garantia FGC, valor
 * definido e a soma com a carteira do mesmo conglomerado — MAIS outras fatias do mesmo lote já casadas no
 * mesmo conglomerado — passa do limite) em cada fatia.
 *
 * Feito em duas passadas: primeiro casa todas as fatias com o catálogo (sem calcular `fgc`), depois calcula
 * o excedente de cada uma somando a carteira e as OUTRAS fatias já casadas no mesmo conglomerado. Assim
 * nenhuma fatia soma com ela mesma.
 */
export function casarComCatalogo(
  fatias: readonly Fatia[], catalogo: readonly OfertaCadastrada[], carteira: readonly ItemFGC[], hoje: DataISO,
  opcoes: OpcoesCasamento = {},
): Fatia[] {
  const casadas = fatias.map((f) => ({
    ...f,
    ofertaCatalogo: primeiraCompativel(catalogo, f.produto, f.indexacaoTipo, opcoes.liquidezDiaria ?? false),
  }));
  return casadas.map((f, i) => {
    if (f.garantia !== 'FGC' || f.valor === null || !f.ofertaCatalogo) return { ...f, fgc: undefined };
    const chave = normalizarConglomerado(f.ofertaCatalogo.conglomerado);
    const outrasFatias = casadas
      .filter((outra, j) => j !== i && outra.garantia === 'FGC' && outra.valor !== null
        && outra.ofertaCatalogo && normalizarConglomerado(outra.ofertaCatalogo.conglomerado) === chave)
      .reduce((soma, outra) => soma + (outra.valor as number), 0);
    const fgc = excedenteFGC(f.ofertaCatalogo.conglomerado, f.valor + outrasFatias, carteira, hoje);
    return { ...f, fgc };
  });
}

function sugerirReserva(o: Extract<Objetivo, { tipo: 'RESERVA' }>, ctx: ContextoSugestao): Fatia[] {
  const total = valorAlvo(o) as number;
  const base: Fatia[] = [
    { produto: 'TESOURO_SELIC', indexacaoTipo: 'SELIC', percentual: 0.5, motivo: 'RESERVA_TESOURO_SELIC', garantia: 'TESOURO_NACIONAL', valor: total * 0.5 },
    { produto: 'CDB', indexacaoTipo: 'POS_CDI', percentual: 0.5, motivo: 'RESERVA_CDB_LIQUIDEZ', garantia: 'FGC', valor: total * 0.5 },
  ];
  return casarComCatalogo(base, ctx.catalogo, ctx.carteira, ctx.hoje, { liquidezDiaria: true });
}

function sugerirLongoPrazo(o: Extract<Objetivo, { tipo: 'LONGO_PRAZO' }>, ctx: ContextoSugestao): Fatia[] {
  const faixa = faixaLongoPrazo(o.horizonteAnos);
  const base: Fatia[] = [
    { produto: 'TESOURO_IPCA', indexacaoTipo: 'IPCA_MAIS', percentual: faixa.ipca, motivo: 'LONGO_PRAZO_IPCA', garantia: 'TESOURO_NACIONAL', valor: null },
    { produto: 'CDB', indexacaoTipo: 'POS_CDI', percentual: faixa.pos, motivo: 'LONGO_PRAZO_POS', garantia: 'FGC', valor: null },
  ];
  return casarComCatalogo(base, ctx.catalogo, ctx.carteira, ctx.hoje);
}

function ofertaCasadaComData(catalogo: readonly OfertaCadastrada[], dataAlvo: DataISO): OfertaCadastrada | undefined {
  const candidatas = catalogo.filter((o) => o.vencimento !== undefined && o.vencimento <= dataAlvo);
  if (candidatas.length === 0) return undefined;
  // DataISO é AAAA-MM-DD: compara como string. A maior é a mais próxima da data-alvo, sem passar dela.
  return candidatas.reduce((melhor, o) => ((o.vencimento as DataISO) > (melhor.vencimento as DataISO) ? o : melhor));
}

function sugerirComData(o: Extract<Objetivo, { tipo: 'COM_DATA' }>, ctx: ContextoSugestao): Fatia[] {
  const casada = ofertaCasadaComData(ctx.catalogo, o.data);
  if (casada) {
    const fgc = coberto(casada.produto)
      ? excedenteFGC(casada.conglomerado, o.valorAlvo, ctx.carteira, ctx.hoje)
      : undefined;
    return [{
      produto: casada.produto, indexacaoTipo: casada.indexacao.tipo, percentual: 1, motivo: 'DATA_VENCIMENTO_CASADO',
      garantia: garantiaDe(casada.produto), valor: o.valorAlvo, ofertaCatalogo: casada, fgc,
    }];
  }
  return casarComCatalogo(
    [{ produto: 'CDB', indexacaoTipo: 'POS_CDI', percentual: 1, motivo: 'DATA_SEM_CASAMENTO', garantia: 'FGC', valor: o.valorAlvo }],
    ctx.catalogo, ctx.carteira, ctx.hoje, { liquidezDiaria: true },
  );
}

function sugerirSemObjetivo(o: Extract<Objetivo, { tipo: 'SEM_OBJETIVO' }>, ctx: ContextoSugestao): Fatia[] {
  let base: Fatia[];
  if (o.horizonteAnos <= 1) {
    base = [{ produto: 'CDB', indexacaoTipo: 'POS_CDI', percentual: 1, motivo: 'SEM_OBJETIVO_POS', garantia: 'FGC', valor: null }];
  } else if (o.horizonteAnos <= 5) {
    base = [
      { produto: 'CDB', indexacaoTipo: 'POS_CDI', percentual: 0.5, motivo: 'SEM_OBJETIVO_POS', garantia: 'FGC', valor: null },
      { produto: 'CDB', indexacaoTipo: 'PRE', percentual: 0.5, motivo: 'SEM_OBJETIVO_PRE', garantia: 'FGC', valor: null },
    ];
  } else {
    const faixa = faixaLongoPrazo(o.horizonteAnos);
    base = [
      { produto: 'TESOURO_IPCA', indexacaoTipo: 'IPCA_MAIS', percentual: faixa.ipca, motivo: 'SEM_OBJETIVO_IPCA', garantia: 'TESOURO_NACIONAL', valor: null },
      { produto: 'CDB', indexacaoTipo: 'POS_CDI', percentual: faixa.pos, motivo: 'SEM_OBJETIVO_POS', garantia: 'FGC', valor: null },
    ];
  }
  return casarComCatalogo(base, ctx.catalogo, ctx.carteira, ctx.hoje);
}

/**
 * Dispatcher por tipo de objetivo. Valida `objetivo` (chamando `validarObjetivo`, que lança
 * `OfertaInvalidaError`) antes de qualquer cálculo, então as funções internas por tipo podem supor
 * um objetivo já validado.
 */
export function sugerir(objetivo: Objetivo, ctx: ContextoSugestao): Fatia[] {
  validarObjetivo(objetivo, ctx.hoje);
  switch (objetivo.tipo) {
    case 'RESERVA': return sugerirReserva(objetivo, ctx);
    case 'COM_DATA': return sugerirComData(objetivo, ctx);
    case 'LONGO_PRAZO': return sugerirLongoPrazo(objetivo, ctx);
    case 'SEM_OBJETIVO': return sugerirSemObjetivo(objetivo, ctx);
  }
}

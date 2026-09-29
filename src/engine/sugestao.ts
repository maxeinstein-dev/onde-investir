// Sugestão de carteira por objetivo (spec §9.1). Motor puro: recebe o catálogo e a carteira
// como dados (não busca nada), e devolve fatias ESTRUTURADAS — nunca texto nem IdLicao,
// no mesmo padrão de src/engine/alertas.ts. A tradução para texto fica em
// src/conteudo/sugestao.ts.
import { type DataISO, ehDataValida, somarDias } from './datas';
import { disponivel, indisponivel, resolverPercentual, taxasDiariasCDI, type Equivalente } from './equivalencia';
import { OfertaInvalidaError } from './erros';
import type { ItemFGC } from './fgc';
import { coberto, normalizarConglomerado } from './fgc';
import type { Cenario } from './indexadores';
import type { OfertaCadastrada } from './ofertas';
import {
  ehIsentoIR, garantiaDe, simular, type TipoIndexacao, type TipoProduto,
} from './produtos';
import { aliquotaIOF } from './regras/iof';
import { aliquotaIR } from './regras/ir';
import { regraFGC } from './regras/fgc';
import { DIAS_RENDA_MENSAL, faixaLongoPrazo, MULTIPLICADOR_RESERVA } from './regras/sugestao';

export type Objetivo =
  | { tipo: 'RESERVA'; gastoMensal: number; rendaEstavel: boolean }
  | { tipo: 'COM_DATA'; valorAlvo: number; data: DataISO }
  | { tipo: 'LONGO_PRAZO'; horizonteAnos: number }
  | { tipo: 'SEM_OBJETIVO'; horizonteAnos: number }
  | { tipo: 'RENDA_MENSAL'; principal: number; rendaMensalDesejada: number }
  | { tipo: 'CARTEIRA_COMBINADA'; principal: number; gastoMensal: number; rendaEstavel: boolean; horizonteAnos: number };

export type MotivoFatia =
  | 'RESERVA_TESOURO_SELIC' | 'RESERVA_CDB_LIQUIDEZ'
  | 'DATA_VENCIMENTO_CASADO' | 'DATA_SEM_CASAMENTO'
  | 'LONGO_PRAZO_IPCA' | 'LONGO_PRAZO_POS'
  | 'SEM_OBJETIVO_POS' | 'SEM_OBJETIVO_PRE' | 'SEM_OBJETIVO_IPCA'
  | 'RENDA_MENSAL_TRIBUTADO' | 'RENDA_MENSAL_ISENTO';

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
    case 'RENDA_MENSAL':
      return null;
    case 'CARTEIRA_COMBINADA':
      return objetivo.principal;
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
    case 'RENDA_MENSAL':
      if (!Number.isFinite(o.principal) || o.principal <= 0) throw new OfertaInvalidaError('Preencha o principal, maior que zero.');
      if (!Number.isFinite(o.rendaMensalDesejada) || o.rendaMensalDesejada <= 0) throw new OfertaInvalidaError('Preencha a renda mensal desejada, maior que zero.');
      break;
    case 'CARTEIRA_COMBINADA': {
      if (!Number.isFinite(o.principal) || o.principal <= 0) throw new OfertaInvalidaError('Preencha o principal, maior que zero.');
      if (!Number.isFinite(o.gastoMensal) || o.gastoMensal <= 0) throw new OfertaInvalidaError('Preencha o gasto mensal, maior que zero.');
      if (!Number.isInteger(o.horizonteAnos) || o.horizonteAnos <= 0) {
        throw new OfertaInvalidaError('Informe um horizonte em anos inteiro, maior que zero.');
      }
      const valorReserva = o.gastoMensal * (o.rendaEstavel ? MULTIPLICADOR_RESERVA.estavel : MULTIPLICADOR_RESERVA.variavel);
      if (valorReserva > o.principal) {
        throw new OfertaInvalidaError(`A reserva de emergência sozinha (${valorReserva}) já passa do total informado.`);
      }
      break;
    }
  }
}

function primeiraCompativel(
  catalogo: readonly OfertaCadastrada[], produto: TipoProduto, indexacaoTipo: TipoIndexacao, liquidezDiaria: boolean,
): OfertaCadastrada | undefined {
  return catalogo.find(
    (o) => o.produto === produto && o.indexacao.tipo === indexacaoTipo && (!liquidezDiaria || o.liquidez === 'DIARIA'),
  );
}

export function excedenteFGC(conglomerado: string, valorFatia: number, carteira: readonly ItemFGC[], hoje: DataISO): Fatia['fgc'] {
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

function sugerirCarteiraCombinada(o: Extract<Objetivo, { tipo: 'CARTEIRA_COMBINADA' }>, ctx: ContextoSugestao): Fatia[] {
  const valorReserva = o.gastoMensal * (o.rendaEstavel ? MULTIPLICADOR_RESERVA.estavel : MULTIPLICADOR_RESERVA.variavel);
  const restante = o.principal - valorReserva;
  const faixa = faixaLongoPrazo(o.horizonteAnos);

  const base: Fatia[] = [
    {
      produto: 'TESOURO_SELIC', indexacaoTipo: 'SELIC', motivo: 'RESERVA_TESOURO_SELIC', garantia: 'TESOURO_NACIONAL',
      valor: valorReserva * 0.5, percentual: (valorReserva * 0.5) / o.principal,
    },
    {
      produto: 'CDB', indexacaoTipo: 'POS_CDI', motivo: 'RESERVA_CDB_LIQUIDEZ', garantia: 'FGC',
      valor: valorReserva * 0.5, percentual: (valorReserva * 0.5) / o.principal,
    },
    {
      produto: 'TESOURO_IPCA', indexacaoTipo: 'IPCA_MAIS', motivo: 'LONGO_PRAZO_IPCA', garantia: 'TESOURO_NACIONAL',
      valor: restante * faixa.ipca, percentual: (restante * faixa.ipca) / o.principal,
    },
    {
      produto: 'CDB', indexacaoTipo: 'POS_CDI', motivo: 'LONGO_PRAZO_POS', garantia: 'FGC',
      valor: restante * faixa.pos, percentual: (restante * faixa.pos) / o.principal,
    },
  ];
  return casarComCatalogo(base, ctx.catalogo, ctx.carteira, ctx.hoje, { liquidezDiaria: true });
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

export interface TaxaNecessaria {
  /** %CDI necessário num CDB/RDB (tributado) para a renda mensal desejada. */
  tributadoPosCDI: Equivalente;
  /**
   * %CDI necessário numa LCI/LCA (isenta) para a renda mensal desejada — taxa de REFERÊNCIA: a
   * LCI/LCA tem carência legal mínima de 6 meses (regras/prazoMinimo.ts), então não dá pra
   * resgatar de fato a cada 30 dias. Ver a nota da seção 2 do design do M5.
   */
  isentoPosCDI: Equivalente;
}

const SEM_DIAS_UTEIS_RENDA_MENSAL = 'sem dias úteis no período';

/**
 * Taxa necessária (%CDI) para que `principal` renda `rendaMensalDesejada` líquidos em
 * {@link DIAS_RENDA_MENSAL} dias corridos a partir de `hoje`, sacando só o rendimento (o principal
 * nunca é reduzido). Nunca lança: indisponível vira `Equivalente.disponivel === false`.
 */
export function calcularTaxaNecessaria(
  principal: number, rendaMensalDesejada: number, hoje: DataISO, cen: Cenario,
): TaxaNecessaria {
  const dataResgate = somarDias(hoje, DIAS_RENDA_MENSAL);
  const taxas = taxasDiariasCDI(cen, hoje, dataResgate);
  if (taxas.length === 0) {
    const semDias = indisponivel(SEM_DIAS_UTEIS_RENDA_MENSAL);
    return { tributadoPosCDI: semDias, isentoPosCDI: semDias };
  }

  const isentoPosCDI = disponivel(resolverPercentual(taxas, (principal + rendaMensalDesejada) / principal));

  const aIOF = aliquotaIOF(DIAS_RENDA_MENSAL, dataResgate);
  const aIR = aliquotaIR(DIAS_RENDA_MENSAL, dataResgate);
  const fatorAlvoTributado = 1 + rendaMensalDesejada / (principal * (1 - aIOF) * (1 - aIR));
  const tributadoPosCDI = disponivel(resolverPercentual(taxas, fatorAlvoTributado));

  return { tributadoPosCDI, isentoPosCDI };
}

export type ResultadoRendaMensal =
  | { modo: 'UNICA'; fatia: Fatia }
  // 0 ou 1 fatia: 0 só se o catálogo estiver vazio nos dois regimes.
  | { modo: 'INSUFICIENTE'; fatias: Fatia[]; faltaMensal: number };

function melhorOfertaPosCDI(catalogo: readonly OfertaCadastrada[], isenta: boolean): OfertaCadastrada | undefined {
  let melhor: OfertaCadastrada | undefined;
  for (const o of catalogo) {
    if (o.indexacao.tipo !== 'POS_CDI' || ehIsentoIR(o.produto) !== isenta) continue;
    if (!melhor || o.indexacao.percentualCDI > (melhor.indexacao as { percentualCDI: number }).percentualCDI) melhor = o;
  }
  return melhor;
}

function construirFatiaRendaMensal(
  oferta: OfertaCadastrada, percentual: number, principal: number, motivo: MotivoFatia,
  carteira: readonly ItemFGC[], hoje: DataISO,
): Fatia {
  const valor = principal * percentual;
  const fgc = coberto(oferta.produto) ? excedenteFGC(oferta.conglomerado, valor, carteira, hoje) : undefined;
  return {
    produto: oferta.produto, indexacaoTipo: oferta.indexacao.tipo, percentual, motivo,
    garantia: garantiaDe(oferta.produto), valor, ofertaCatalogo: oferta, fgc,
  };
}

/** Líquido de 100% do principal numa oferta pós-CDI, na janela de renda mensal (LCI/LCA ignora a carência: ver TaxaNecessaria.isentoPosCDI). */
function liquidoNaJanela(oferta: OfertaCadastrada, valor: number, hoje: DataISO, dataResgate: DataISO, cen: Cenario): number {
  const ix = oferta.indexacao as { tipo: 'POS_CDI'; percentualCDI: number };
  return simular(
    { produto: oferta.produto, indexacao: ix, valor, dataAplicacao: hoje }, dataResgate, cen,
    { ignorarPrazoMinimo: ehIsentoIR(oferta.produto) },
  ).valorLiquido;
}

export function sugerirRendaMensal(
  o: Extract<Objetivo, { tipo: 'RENDA_MENSAL' }>, ctx: ContextoSugestao, cen: Cenario,
): ResultadoRendaMensal {
  const necessaria = calcularTaxaNecessaria(o.principal, o.rendaMensalDesejada, ctx.hoje, cen);
  const melhorTributada = melhorOfertaPosCDI(ctx.catalogo, false);
  const melhorIsenta = melhorOfertaPosCDI(ctx.catalogo, true);

  const tribResolve = necessaria.tributadoPosCDI.disponivel && melhorTributada
    && (melhorTributada.indexacao as { percentualCDI: number }).percentualCDI >= necessaria.tributadoPosCDI.taxa;
  const isnResolve = necessaria.isentoPosCDI.disponivel && melhorIsenta
    && (melhorIsenta.indexacao as { percentualCDI: number }).percentualCDI >= necessaria.isentoPosCDI.taxa;

  if (tribResolve || isnResolve) {
    // Entre as duas que resolveram, prefere a que precisava da taxa necessária mais baixa
    // (empate → isenta, por não ter IR a considerar depois).
    const usaIsenta = isnResolve && (!tribResolve
      || (necessaria.isentoPosCDI as { disponivel: true; taxa: number }).taxa <= (necessaria.tributadoPosCDI as { disponivel: true; taxa: number }).taxa);
    const oferta = (usaIsenta ? melhorIsenta : melhorTributada) as OfertaCadastrada;
    const motivo = usaIsenta ? 'RENDA_MENSAL_ISENTO' : 'RENDA_MENSAL_TRIBUTADO';
    return { modo: 'UNICA', fatia: construirFatiaRendaMensal(oferta, 1, o.principal, motivo, ctx.carteira, ctx.hoje) };
  }

  // Nenhuma resolve sozinha. NÃO tem sentido misturar (ver a nota do design, seção 3): o retorno de
  // qualquer oferta pós-CDI é linear no valor aplicado (IR/IOF só dependem do prazo), então uma
  // mistura nunca supera a melhor das duas isoladas. Usa 100% na que render mais de verdade.
  const candidatas: { oferta: OfertaCadastrada; motivo: MotivoFatia }[] = [];
  if (melhorTributada) candidatas.push({ oferta: melhorTributada, motivo: 'RENDA_MENSAL_TRIBUTADO' });
  if (melhorIsenta) candidatas.push({ oferta: melhorIsenta, motivo: 'RENDA_MENSAL_ISENTO' });

  if (candidatas.length === 0) {
    return { modo: 'INSUFICIENTE', fatias: [], faltaMensal: o.rendaMensalDesejada };
  }

  const dataResgate = somarDias(ctx.hoje, DIAS_RENDA_MENSAL);
  const rendimentos = candidatas.map((c) => ({ ...c, liquido: liquidoNaJanela(c.oferta, o.principal, ctx.hoje, dataResgate, cen) }));
  const melhor = rendimentos.reduce((a, b) => (b.liquido > a.liquido ? b : a));
  const fatia = construirFatiaRendaMensal(melhor.oferta, 1, o.principal, melhor.motivo, ctx.carteira, ctx.hoje);
  const faltaMensal = Math.max(0, o.rendaMensalDesejada - (melhor.liquido - o.principal));
  return { modo: 'INSUFICIENTE', fatias: [fatia], faltaMensal };
}

/**
 * Dispatcher por tipo de objetivo. Valida `objetivo` (chamando `validarObjetivo`, que lança
 * `OfertaInvalidaError`) antes de qualquer cálculo, então as funções internas por tipo podem supor
 * um objetivo já validado.
 */
export function sugerir(objetivo: Objetivo, ctx: ContextoSugestao, cen?: Cenario): Fatia[] {
  validarObjetivo(objetivo, ctx.hoje);
  switch (objetivo.tipo) {
    case 'RESERVA': return sugerirReserva(objetivo, ctx);
    case 'COM_DATA': return sugerirComData(objetivo, ctx);
    case 'LONGO_PRAZO': return sugerirLongoPrazo(objetivo, ctx);
    case 'SEM_OBJETIVO': return sugerirSemObjetivo(objetivo, ctx);
    case 'RENDA_MENSAL': {
      if (!cen) throw new Error('RENDA_MENSAL precisa de um Cenario para calcular a taxa necessária');
      const r = sugerirRendaMensal(objetivo, ctx, cen);
      return r.modo === 'UNICA' ? [r.fatia] : r.fatias;
    }
    case 'CARTEIRA_COMBINADA': return sugerirCarteiraCombinada(objetivo, ctx);
  }
}

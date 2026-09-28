// src/engine/ofertas.ts
import { type DataISO, dataBR, ehDataValida } from './datas';
import { OfertaInvalidaError, RegraNaoEncontradaError } from './erros';
import type { Cenario } from './indexadores';
import { INDEXACOES_PERMITIDAS, simular, validarCustoExtra, type Aplicacao, type Oferta, type ResultadoSimulacao } from './produtos';
import { dataMinimaResgate } from './regras/prazoMinimo';

export type Liquidez = 'DIARIA' | 'NO_VENCIMENTO';

export interface OfertaCadastrada extends Oferta {
  id: string;
  emissor: string;
  conglomerado: string;
  vencimento?: DataISO;
  liquidez: Liquidez;
}

export type RegraReinvestimento =
  | { tipo: 'PADRAO' } | { tipo: 'MESMA_TAXA' } | { tipo: 'CDI_100' } | { tipo: 'TAXA_FIXA'; taxaAA: number };

export type Projecao =
  | { estado: 'DISPONIVEL'; liquido: number; etapas: ResultadoSimulacao[]; reinvestimento?: { data: DataISO; oferta: Oferta; fallback: boolean } }
  | { estado: 'INDISPONIVEL'; motivo: string; disponivelEm?: DataISO }
  | { estado: 'MARCACAO_A_MERCADO'; vencimento: DataISO };

const LIMITE_TEXTO = 80;
const CDB_100: Oferta = { produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 } };
const ehTesouroComMarcacao = (o: Oferta) => o.produto === 'TESOURO_PREFIXADO' || o.produto === 'TESOURO_IPCA';

export function validarOfertaCadastrada(o: OfertaCadastrada): void {
  for (const [campo, valor] of [['emissor', o.emissor], ['conglomerado', o.conglomerado]] as const) {
    if (valor.trim() === '' || valor.length > LIMITE_TEXTO) throw new OfertaInvalidaError(`Preencha o ${campo} (até ${LIMITE_TEXTO} caracteres)`);
  }
  if (o.vencimento !== undefined && !ehDataValida(o.vencimento)) throw new OfertaInvalidaError('Data de vencimento inválida');
  if (!INDEXACOES_PERMITIDAS[o.produto]?.includes(o.indexacao.tipo)) throw new OfertaInvalidaError('Indexação não aceita para esse produto');
  if (o.produto === 'POUPANCA' && (o.vencimento !== undefined || o.liquidez !== 'DIARIA')) {
    throw new OfertaInvalidaError('Poupança não tem vencimento e tem liquidez diária');
  }
  if (o.produto.startsWith('TESOURO_') && o.vencimento === undefined) throw new OfertaInvalidaError('Títulos do Tesouro têm vencimento: informe a data');
  if (o.produto.startsWith('TESOURO_') && o.liquidez !== 'DIARIA') {
    throw new OfertaInvalidaError('Títulos do Tesouro têm liquidez diária (com marcação a mercado nos prefixados e IPCA+)');
  }
  if (o.liquidez === 'NO_VENCIMENTO' && o.vencimento === undefined) throw new OfertaInvalidaError('Informe o vencimento de uma oferta sem liquidez diária');
  validarCustoExtra(o.custoExtraAA);
}

/** O produto, a indexação e o custo extra (quando há) da oferta: o que `simular` precisa, sem o cadastro. */
export function ofertaPura(o: Oferta): Oferta {
  return { produto: o.produto, indexacao: o.indexacao, ...(o.custoExtraAA === undefined ? {} : { custoExtraAA: o.custoExtraAA }) };
}

/** A oferta aplicada com valor e data. */
export const aplicacaoDe = (o: Oferta, valor: number, dataAplicacao: DataISO): Aplicacao => ({ ...ofertaPura(o), valor, dataAplicacao });

/** TAXA_FIXA exige taxa finita, maior que −100% e até 100% a.a. A UI valida antes; o engine lança. */
export function validarRegraReinvestimento(regra: RegraReinvestimento): void {
  if (regra.tipo !== 'TAXA_FIXA') return;
  const t = regra.taxaAA;
  if (!Number.isFinite(t) || t <= -1 || t > 1) throw new OfertaInvalidaError('Taxa de reinvestimento inválida');
}

/**
 * A oferta em que o dinheiro é reaplicado no vencimento, pela regra (sem o fallback em CDB 100%). Na mesma oferta,
 * o custo extra vai junto (mesmo lugar, mesma tarifa); no CDB 100% e na taxa fixa, sem custo.
 *
 * Premissa do PADRAO (spec §5.4): o pós-fixado é reaplicado na mesma oferta; o prefixado, o IPCA+ e a poupança,
 * num CDB 100% do CDI SEM custo extra, mesmo que a oferta original tenha custo. A taxa pré e o IPCA+ de hoje não
 * valem para a reaplicação daqui a anos, e o CDI do cenário é a referência neutra.
 */
export function ofertaDeReinvestimento(o: Oferta, regra: RegraReinvestimento): Oferta {
  const mesma = ofertaPura(o);
  switch (regra.tipo) {
    case 'MESMA_TAXA': return mesma;
    case 'CDI_100': return CDB_100;
    case 'TAXA_FIXA': return { produto: 'CDB', indexacao: { tipo: 'PRE', taxaAA: regra.taxaAA } };
    case 'PADRAO': return o.indexacao.tipo === 'POS_CDI' ? mesma : CDB_100;
  }
}

function indisponivelPorRegra(o: OfertaCadastrada, dataAplicacao: DataISO, erro: OfertaInvalidaError): Projecao {
  if (o.produto === 'LCI' || o.produto === 'LCA') {
    try {
      return { estado: 'INDISPONIVEL', motivo: erro.message, disponivelEm: dataMinimaResgate(o.produto, o.indexacao.tipo === 'IPCA_MAIS', dataAplicacao) };
    } catch (e) {
      if (!(e instanceof RegraNaoEncontradaError)) throw e;
    }
  }
  return { estado: 'INDISPONIVEL', motivo: erro.message };
}

/**
 * Aviso para o cadastro: LCI/LCA cujo vencimento cai antes do prazo mínimo legal de resgate, contado da
 * data de aplicação. null quando não se aplica (outro produto, sem vencimento, regra não cadastrada) ou está certo.
 */
export function conferirPrazoMinimo(o: OfertaCadastrada, dataAplicacao: DataISO): string | null {
  if ((o.produto !== 'LCI' && o.produto !== 'LCA') || o.vencimento === undefined) return null;
  let minima: DataISO;
  try {
    minima = dataMinimaResgate(o.produto, o.indexacao.tipo === 'IPCA_MAIS', dataAplicacao);
  } catch (e) {
    if (e instanceof RegraNaoEncontradaError) return null;
    throw e;
  }
  return o.vencimento < minima ? `O vencimento (${dataBR(o.vencimento)}) é anterior ao prazo mínimo legal (${dataBR(minima)})` : null;
}

/** Valor líquido da oferta na data-alvo, com reinvestimento depois do vencimento. */
export function projetar(
  o: OfertaCadastrada, valor: number, dataAplicacao: DataISO, dataAlvo: DataISO, cen: Cenario,
  regra: RegraReinvestimento = { tipo: 'PADRAO' },
): Projecao {
  validarRegraReinvestimento(regra); // fora do try: regra inválida não vira fallback nem "indisponível"
  const aplicacao = aplicacaoDe(o, valor, dataAplicacao);
  const venc = o.vencimento;
  if (venc !== undefined && venc <= dataAplicacao) return { estado: 'INDISPONIVEL', motivo: 'A oferta vence antes da data de aplicação' };
  if (dataAlvo <= dataAplicacao) return { estado: 'INDISPONIVEL', motivo: 'Escolha uma data depois da aplicação' };
  const prazo = conferirPrazoMinimo(o, dataAplicacao);
  if (prazo !== null) return { estado: 'INDISPONIVEL', motivo: prazo };
  try {
    if (venc !== undefined && dataAlvo > venc) {
      const etapa1 = simular(aplicacao, venc, cen);
      const preferida = ofertaDeReinvestimento(o, regra);
      try {
        const etapa2 = simular({ ...preferida, valor: etapa1.valorLiquido, dataAplicacao: venc }, dataAlvo, cen);
        return { estado: 'DISPONIVEL', liquido: etapa2.valorLiquido, etapas: [etapa1, etapa2], reinvestimento: { data: venc, oferta: preferida, fallback: false } };
      } catch (e) {
        if (!(e instanceof OfertaInvalidaError)) throw e;
        const etapa2 = simular({ ...CDB_100, valor: etapa1.valorLiquido, dataAplicacao: venc }, dataAlvo, cen);
        return { estado: 'DISPONIVEL', liquido: etapa2.valorLiquido, etapas: [etapa1, etapa2], reinvestimento: { data: venc, oferta: CDB_100, fallback: true } };
      }
    }
    if (venc !== undefined && dataAlvo < venc) {
      if (ehTesouroComMarcacao(o)) return { estado: 'MARCACAO_A_MERCADO', vencimento: venc };
      if (o.liquidez === 'NO_VENCIMENTO') return { estado: 'INDISPONIVEL', motivo: 'Só pode ser resgatado no vencimento', disponivelEm: venc };
    }
    const r = simular(aplicacao, dataAlvo, cen);
    return { estado: 'DISPONIVEL', liquido: r.valorLiquido, etapas: [r] };
  } catch (e) {
    if (e instanceof OfertaInvalidaError) return indisponivelPorRegra(o, dataAplicacao, e);
    throw e;
  }
}

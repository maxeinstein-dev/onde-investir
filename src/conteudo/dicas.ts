// src/conteudo/dicas.ts
// Dicas contextuais e "Você sabia?" (spec §6). RASCUNHO: passa pelo /vozmax e pela revisão do usuário (plano M3c,
// D1). Os valores de regra saem das regras versionadas do engine (ver licoes/regras.ts).
import type { Alerta } from '../engine/alertas';
import { coberto, normalizarConglomerado } from '../engine/fgc';
import type { OfertaCadastrada } from '../engine/ofertas';
import type { TipoIndexacao } from '../engine/produtos';
import { GLOSSARIO } from './glossario';
import { FONTES } from './licoes/fontes';
import { REGRAS } from './licoes/regras';
import type { IdLicao } from './licoes/tipos';

export interface ContextoDica { ofertasNaComparacao: readonly OfertaCadastrada[]; alertas: readonly Alerta[]; temCarteira: boolean }
export interface DicaContextual { id: string; quando: (ctx: ContextoDica) => boolean; texto: string; licao: IdLicao; fonte: string }
export interface VoceSabia { texto: string; licao: IdLicao; fonte: string }

/** No máximo tantas dicas por vez, acima do resultado. */
export const MAXIMO_DICAS = 2;

const { ir, iof, fgc, custodia, prazoMinimo } = REGRAS;

const tem = (ctx: ContextoDica, f: (o: OfertaCadastrada) => boolean) => ctx.ofertasNaComparacao.some(f);

/** Mais de uma oferta com FGC no mesmo conglomerado (pelo nome normalizado). */
function mesmoConglomerado(ctx: ContextoDica): boolean {
  const vistos = new Set<string>();
  for (const o of ctx.ofertasNaComparacao) {
    if (!coberto(o.produto)) continue;
    const chave = normalizarConglomerado(o.conglomerado);
    if (vistos.has(chave)) return true;
    vistos.add(chave);
  }
  return false;
}

/** A família do indexador: CDI e Selic contam juntos como pós-fixado. */
const FAMILIA: Record<TipoIndexacao, string> = { POS_CDI: 'POS', SELIC: 'POS', PRE: 'PRE', IPCA_MAIS: 'IPCA', POUPANCA: 'POUPANCA' };

/** Duas ou mais ofertas, todas da mesma família de indexador. */
function umIndexadorSo(ctx: ContextoDica): boolean {
  const o = ctx.ofertasNaComparacao;
  return o.length >= 2 && new Set(o.map((x) => FAMILIA[x.indexacao.tipo])).size === 1;
}

/** Na ordem de prioridade: quando há mais de {@link MAXIMO_DICAS}, ficam as primeiras. */
export const DICAS: readonly DicaContextual[] = [
  {
    id: 'dica-prazo-minimo',
    quando: (ctx) => tem(ctx, (o) => o.produto === 'LCI' || o.produto === 'LCA'),
    texto: `LCI e LCA só podem ser resgatadas depois de um prazo mínimo, mesmo com liquidez diária: ${prazoMinimo.demais} meses nas pós-fixadas e nas prefixadas. Por isso não servem para o dinheiro que pode precisar sair a qualquer momento.`,
    licao: 'liquidez',
    fonte: FONTES.prazoMinimoB3,
  },
  {
    id: 'dica-marcacao',
    quando: (ctx) => tem(ctx, (o) => o.produto === 'TESOURO_PREFIXADO' || o.produto === 'TESOURO_IPCA'),
    texto: 'O Tesouro Prefixado e o IPCA+ vendidos antes do vencimento saem pelo preço de mercado do dia, que pode ficar acima ou abaixo do previsto. Levados até o vencimento, pagam a taxa combinada.',
    licao: 'marcacao-mercado',
    fonte: FONTES.titulosPublicos,
  },
  {
    id: 'dica-aniversario',
    quando: (ctx) => tem(ctx, (o) => o.produto === 'POUPANCA'),
    texto: 'A poupança só rende no aniversário mensal do depósito. Quem saca um dia antes perde o rendimento daquele mês.',
    licao: 'liquidez',
    fonte: FONTES.poupancaBCB,
  },
  {
    id: 'dica-reaplicacao',
    quando: (ctx) => ctx.alertas.some((a) => a.tipo === 'IR_REINICIA'),
    texto: `Quando uma aplicação vence e o dinheiro é aplicado de novo, a contagem do IR recomeça, e a alíquota volta para ${ir.maior}.`,
    licao: 'reaplicacao',
    fonte: FONTES.lei11033,
  },
  {
    id: 'dica-conglomerado',
    quando: mesmoConglomerado,
    texto: `Há mais de uma oferta do mesmo conglomerado. O FGC cobre até ${fgc.porConglomerado} por pessoa em cada conglomerado, somando tudo o que você tem nele, então essas ofertas dividem um limite só.`,
    licao: 'fgc',
    fonte: FONTES.regulamentoFGC,
  },
  {
    id: 'dica-um-indexador',
    quando: umIndexadorSo,
    texto: 'Todas as ofertas desta comparação dependem do mesmo indexador. Se o cenário for outro, todas sentem juntas; misturar indexadores diminui essa dependência.',
    licao: 'diversificacao',
    fonte: FONTES.diversificacao,
  },
];

/** As dicas que valem para o contexto, sem as já dispensadas, no máximo {@link MAXIMO_DICAS}, pela prioridade. */
export function dicasPara(ctx: ContextoDica, jaVistas: ReadonlySet<string>): DicaContextual[] {
  return DICAS.filter((d) => !jaVistas.has(d.id) && d.quando(ctx)).slice(0, MAXIMO_DICAS);
}

export const VOCE_SABIA: readonly VoceSabia[] = [
  {
    texto: `O IR da renda fixa cai com o prazo: começa em ${ir.maior} e chega a ${ir.menor} depois de ${ir.limites.at(-1) ?? 0} dias de aplicação.`,
    licao: 'impostos', fonte: FONTES.lei11033,
  },
  {
    texto: `Resgatar com menos de ${iof.diaQueZera} dias paga IOF: ${iof.primeiroDia} do rendimento no 1º dia, caindo até zerar no ${iof.diaQueZera}º.`,
    licao: 'impostos', fonte: FONTES.decretoIOF,
  },
  {
    texto: 'LCI e LCA são isentas de imposto de renda para pessoa física.',
    licao: 'impostos', fonte: FONTES.lciLca,
  },
  {
    texto: `O limite de ${fgc.porConglomerado} do FGC conta o valor aplicado e os rendimentos, por pessoa, em cada conglomerado financeiro.`,
    licao: 'fgc', fonte: FONTES.regulamentoFGC,
  },
  {
    texto: `Além do limite por conglomerado, o FGC tem um teto global: ${fgc.tetoGlobal} a cada ${fgc.janelaAnos} anos, somando todas as instituições.`,
    licao: 'fgc', fonte: FONTES.regulamentoFGC,
  },
  {
    texto: 'Os títulos do Tesouro Direto não têm FGC: a garantia é do Tesouro Nacional, considerada o menor risco de crédito do país.',
    licao: 'renda-fixa', fonte: FONTES.titulosPublicos,
  },
  {
    texto: `Mesmo com liquidez diária, LCI e LCA têm prazo mínimo antes do primeiro resgate: ${prazoMinimo.demais} meses nas pós-fixadas e nas prefixadas.`,
    licao: 'liquidez', fonte: FONTES.prazoMinimoB3,
  },
  {
    texto: 'A poupança só rende no aniversário mensal do depósito. Sacar um dia antes perde o rendimento do mês.',
    licao: 'reserva', fonte: FONTES.poupancaBCB,
  },
  {
    texto: `A B3 cobra ${custodia.taxa} ao ano de custódia nos títulos do Tesouro. No Tesouro Selic, os primeiros ${custodia.isencaoSelic} são isentos.`,
    licao: 'marcacao-mercado', fonte: FONTES.custodiaB3,
  },
  {
    texto: 'Quem leva um título do Tesouro até o vencimento recebe a taxa combinada, não importa o que o preço de mercado fez no caminho.',
    licao: 'marcacao-mercado', fonte: FONTES.titulosPublicos,
  },
  {
    texto: 'O CDI e a Selic só rendem em dias úteis. Fim de semana e feriado não rendem.',
    licao: 'indexadores', fonte: GLOSSARIO['dias-uteis'].fonte,
  },
  {
    texto: 'A nova Selic decidida pelo Copom vale a partir do dia útil seguinte ao anúncio.',
    licao: 'indexadores', fonte: FONTES.copomBCB,
  },
  {
    texto: `Reaplicar o dinheiro de uma aplicação que venceu recomeça a contagem do IR, na alíquota de ${ir.maior}.`,
    licao: 'reaplicacao', fonte: FONTES.lei11033,
  },
  {
    texto: 'O risco de um investimento não pode ser eliminado, mas pode ser reduzido com diversificação.',
    licao: 'diversificacao', fonte: FONTES.diversificacao,
  },
  {
    texto: 'Na renda variável, o retorno pode ser negativo, e dá até para perder todo o valor investido.',
    licao: 'renda-variavel', fonte: FONTES.rendaFixaXVariavel,
  },
];

/** O "Você sabia?" da visita: um por visita, em rodízio. Índice inválido, negativo ou fracionário não quebra. */
export function vocePassaSaber(indiceVisita: number): VoceSabia {
  const n = VOCE_SABIA.length;
  const i = Number.isFinite(indiceVisita) ? ((Math.floor(indiceVisita) % n) + n) % n : 0;
  const item = VOCE_SABIA[i] ?? VOCE_SABIA[0];
  if (!item) throw new Error('VOCE_SABIA vazio');
  return item;
}

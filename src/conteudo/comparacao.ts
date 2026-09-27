// Textos da comparação de ofertas e do cenário. Rascunho: a revisão editorial é a Tarefa C8.
import type { Marco } from '../engine/comparacao';
import { type DataISO, dataBR } from '../engine/datas';
import type { OfertaCadastrada, Projecao } from '../engine/ofertas';
import type { CenarioProjetado } from '../engine/projecao';
import { formatarMoeda, formatarNumero, formatarPercentual } from '../formato';
import { descreverOferta } from './motivos';

/** Como a oferta aparece nos textos: a descrição e o emissor, que distingue ofertas iguais. */
export const nomeOferta = (o: OfertaCadastrada): string => `${descreverOferta(o)} (${o.emissor})`;

/** Primeira letra minúscula, a não ser que a palavra seja uma sigla ("LCI"). */
function continuarFrase(texto: string): string {
  const t = texto.trim().replace(/\.$/, '');
  const [primeira, segunda] = [t.charAt(0), t.charAt(1)];
  return segunda !== '' && segunda === segunda.toUpperCase() && segunda !== segunda.toLowerCase() ? t : primeira.toLowerCase() + t.slice(1);
}

/** "a", "a e b", "a, b e c". */
function listar(itens: readonly string[]): string {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`;
}

export function descreverProjecao(p: Projecao): string {
  switch (p.estado) {
    case 'DISPONIVEL': {
      const r = p.reinvestimento;
      if (!r) return '';
      const inicio = `Venceu em ${dataBR(r.data)} e foi reaplicado em ${descreverOferta(r.oferta)}`;
      return r.fallback ? `${inicio}, porque o mesmo produto não aceitava esse prazo.` : `${inicio}.`;
    }
    case 'INDISPONIVEL':
      return p.disponivelEm === undefined
        ? `Indisponível: ${continuarFrase(p.motivo)}.`
        : `Indisponível até ${dataBR(p.disponivelEm)}: ${continuarFrase(p.motivo)}.`;
    case 'MARCACAO_A_MERCADO':
      return `Vence em ${dataBR(p.vencimento)}. Vender antes sai pelo preço de mercado do dia, que pode ser maior ou menor.`;
  }
}

/** Conclusão no último vencimento: quem termina na frente, por quanto e o efeito da reaplicação. */
export function concluirLinhaDoTempo(ofertas: readonly OfertaCadastrada[], l: { marcos: readonly Marco[] }): string[] {
  const ultimo = l.marcos.at(-1);
  if (!ultimo || ultimo.lideres.length === 0) return [];
  const data = dataBR(ultimo.data);
  const disponiveis = ultimo.projecoes
    .flatMap((p, i) => (p.estado === 'DISPONIVEL' ? [{ p, o: ofertas[i] }] : []))
    .filter((x): x is { p: Extract<Projecao, { estado: 'DISPONIVEL' }>; o: OfertaCadastrada } => x.o !== undefined)
    .sort((a, b) => b.p.liquido - a.p.liquido);
  const lider = disponiveis[0];
  if (!lider) return [];
  const liquido = formatarMoeda(lider.p.liquido);

  if (ultimo.lideres.length > 1) {
    const nomes = ultimo.lideres.flatMap((i) => (ofertas[i] ? [nomeOferta(ofertas[i])] : []));
    return [`${listar(nomes)} terminam empatados em ${data}, com ${liquido} líquidos.`];
  }

  const segundo = disponiveis[1];
  const linhas = [
    segundo
      ? `${nomeOferta(lider.o)} termina na frente em ${data}, com ${liquido} líquidos, ${formatarMoeda(lider.p.liquido - segundo.p.liquido)} a mais que ${nomeOferta(segundo.o)}.`
      : `${nomeOferta(lider.o)} termina na frente em ${data}, com ${liquido} líquidos.`,
  ];
  const reaplicacao = lider.p.reinvestimento ? lider.p.etapas.at(-1) : undefined;
  if (segundo && reaplicacao) {
    linhas.push(`Mesmo vencendo antes, ${nomeOferta(lider.o)} reaplicado termina em ${liquido}.`);
    if (!reaplicacao.isentoIR) linhas.push(`O IR recomeçou na reaplicação, com alíquota de ${formatarPercentual(reaplicacao.aliquotaIR)}.`);
  }
  return linhas;
}

export interface ContextoCenario {
  /** Data da coleta do Focus usada na projeção. */
  dataColetaFocus?: DataISO;
  /** As consultas do Focus vieram de coletas diferentes. */
  focusDefasado?: boolean;
  /** Desvios-padrão dos cenários "sobem/caem" (padrão 1). */
  k?: number;
}

function frasePrincipal(c: CenarioProjetado, ctx: ContextoCenario): string {
  const focus = ctx.dataColetaFocus === undefined ? 'do Focus' : `do Focus de ${dataBR(ctx.dataColetaFocus)}`;
  if (c.tipo === 'BASE') return `Selic e IPCA seguem as medianas ${focus}.`;
  const nome = c.tipo === 'SOBEM' ? 'Juros sobem' : 'Juros caem';
  const k = ctx.k ?? 1;
  if (k === 0) return `${nome}: com 0 desvio-padrão, Selic e IPCA ficam na mediana ${focus}.`;
  const desvios = `${formatarNumero(k)} ${k === 1 ? 'desvio-padrão' : 'desvios-padrão'}`;
  return `${nome}: Selic e IPCA ${desvios} ${c.tipo === 'SOBEM' ? 'acima' : 'abaixo'} da mediana ${focus}.`;
}

/** O que o cenário ativo supõe, em frases curtas. `c` null = cenário manual. */
export function explicarCenario(c: CenarioProjetado | null, motivoManual?: string, ctx: ContextoCenario = {}): string[] {
  if (c === null) {
    const manual = 'Cenário manual: os valores digitados ficam constantes até o resgate.';
    return motivoManual === undefined ? [manual] : [motivoManual, manual];
  }
  const linhas = [
    frasePrincipal(c, ctx),
    `A partir de ${c.inicioPremissa.slice(0, 4)} a projeção é premissa, não expectativa de mercado.`,
  ];
  const est = c.reunioesEstimadas;
  if (est.length === 1) linhas.push(`A data de ${est[0]} foi estimada: o BC ainda não publicou o calendário.`);
  else if (est.length > 1) linhas.push(`As datas de ${listar(est)} foram estimadas: o BC ainda não publicou o calendário.`);
  const sem = c.reunioesSemData;
  if (sem.length === 1) linhas.push(`A reunião ${sem[0]} ficou de fora da projeção: não foi possível estimar a data.`);
  else if (sem.length > 1) linhas.push(`As reuniões ${listar(sem)} ficaram de fora da projeção: não foi possível estimar as datas.`);
  if (ctx.focusDefasado) linhas.push('O Focus veio de coletas diferentes; os números podem estar defasados.');
  return linhas;
}

// Textos da comparação de ofertas e do cenário.
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
      return r.fallback ? `${inicio}, porque o mesmo produto não aceitava um prazo tão curto.` : `${inicio}.`;
    }
    case 'INDISPONIVEL':
      return p.disponivelEm === undefined
        ? `Indisponível: ${continuarFrase(p.motivo)}.`
        : `Indisponível até ${dataBR(p.disponivelEm)}: ${continuarFrase(p.motivo)}.`;
    case 'MARCACAO_A_MERCADO':
      return `Vence em ${dataBR(p.vencimento)}. Se vender antes, recebe o preço de mercado do dia, que pode ficar acima ou abaixo do previsto.`;
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
  const inicio = `No último vencimento, em ${data}, ${nomeOferta(lider.o)} termina na frente com ${liquido} líquidos`;
  const fim = 'Para outras datas, veja a tabela acima.';
  const linhas = [
    segundo
      ? `${inicio}, ${formatarMoeda(lider.p.liquido - segundo.p.liquido)} a mais que ${nomeOferta(segundo.o)}. ${fim}`
      : `${inicio}. ${fim}`,
  ];
  const reaplicacao = lider.p.reinvestimento ? lider.p.etapas.at(-1) : undefined;
  if (segundo && reaplicacao) {
    linhas.push(`${nomeOferta(lider.o)} vence antes, é reaplicado e mesmo assim termina na frente.`);
    if (!reaplicacao.isentoIR) linhas.push(`Na reaplicação o IR recomeçou do zero, com alíquota de ${formatarPercentual(reaplicacao.aliquotaIR)} nesse prazo.`);
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
    `A partir de ${c.inicioPremissa.slice(0, 4)} os números são premissas do app, e o mercado não projeta tão longe.`,
  ];
  const est = c.reunioesEstimadas;
  if (est.length === 1) linhas.push(`A data de ${est[0]} foi estimada, porque o BC ainda não publicou o calendário desse ano.`);
  else if (est.length > 1) linhas.push(`As datas de ${listar(est)} foram estimadas, porque o BC ainda não publicou o calendário desse ano.`);
  const sem = c.reunioesSemData;
  if (sem.length === 1) linhas.push(`A reunião ${sem[0]} ficou de fora da projeção, porque não deu para estimar a data.`);
  else if (sem.length > 1) linhas.push(`As reuniões ${listar(sem)} ficaram de fora da projeção, porque não deu para estimar as datas.`);
  if (ctx.focusDefasado) linhas.push('As consultas do Focus vieram de semanas diferentes, então parte dos números pode estar desatualizada.');
  return linhas;
}

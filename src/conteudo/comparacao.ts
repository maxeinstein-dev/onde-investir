// Textos da comparação de ofertas e do cenário.
import type { ColunaHorizonte, Horizonte, Marco } from '../engine/comparacao';
import { type DataISO, dataBR } from '../engine/datas';
import type { OfertaCadastrada, Projecao } from '../engine/ofertas';
import type { CenarioProjetado } from '../engine/projecao';
import { formatarMoeda, formatarNumero, formatarPercentual } from '../formato';
import { descreverOferta, explicarVencedor, fraseDoPlacar } from './motivos';

/** Perto dos botões Comparar, enquanto o painel tem um rascunho inválido. */
export const AVISO_CENARIO_INVALIDO = 'Corrija o cenário no painel antes de comparar.';

/** Como a oferta aparece nos textos: a descrição e o emissor, que distingue ofertas iguais. */
export const nomeOferta = (o: OfertaCadastrada): string => `${descreverOferta(o)} (${o.emissor})`;

/** Primeira letra minúscula, a não ser que a palavra seja uma sigla ("LCI"). */
function continuarFrase(texto: string): string {
  const t = texto.trim().replace(/\.$/, '');
  const [primeira, segunda] = [t.charAt(0), t.charAt(1)];
  return segunda !== '' && segunda === segunda.toUpperCase() && segunda !== segunda.toLowerCase() ? t : primeira.toLowerCase() + t.slice(1);
}

/** "a", "a e b", "a, b e c". */
export function listar(itens: readonly string[]): string {
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

/** Como o horizonte aparece nos textos: "5 anos", ou "15/01/2032 (sua data)". */
export const nomeDoHorizonte = (h: Horizonte): string => (h.rotulo === 'Sua data' ? `${dataBR(h.data)} (sua data)` : h.rotulo);

type Disponivel = Extract<Projecao, { estado: 'DISPONIVEL' }>;

export interface Lideranca {
  /** "Por que X lidera em 5 anos?", ou "Por que X e Y empatam em 5 anos?". */
  titulo: string;
  motivos: string[];
}

/**
 * Por que quem lidera no horizonte lidera: o 1º contra o 2º colocado disponível. Sem reaplicação nos dois, os
 * motivos de IR e de rendimento bruto (`explicarVencedor`); com reaplicação em algum, a conta tem duas etapas e
 * esses motivos não valem: só o placar e a frase da reaplicação. null quando ninguém pode ser resgatado no prazo.
 */
export function explicarLideranca(ofertas: readonly OfertaCadastrada[], coluna: ColunaHorizonte): Lideranca | null {
  if (coluna.lideres.length === 0) return null;
  const prazo = nomeDoHorizonte(coluna);
  const ranking = coluna.projecoes
    .flatMap((p, i) => {
      const o = ofertas[i];
      return p.estado === 'DISPONIVEL' && o ? [{ p, o, nome: nomeOferta(o), lider: coluna.lideres.includes(i) }] : [];
    })
    // Os líderes primeiro (empate em centavos), depois pelo líquido.
    .sort((a, b) => Number(b.lider) - Number(a.lider) || b.p.liquido - a.p.liquido);
  const [primeiro, segundo] = ranking;
  if (!primeiro) return null;

  const empatados = ranking.filter((x) => x.lider);
  if (empatados.length > 1) {
    const nomes = listar(empatados.map((x) => x.nome));
    return { titulo: `Por que ${nomes} empatam em ${prazo}?`, motivos: [`${nomes} terminam empatados, com ${formatarMoeda(primeiro.p.liquido)} líquidos.`] };
  }
  const titulo = `Por que ${primeiro.nome} lidera em ${prazo}?`;
  if (!segundo) return { titulo, motivos: [`Só ${primeiro.nome} pode ser resgatada nesse prazo.`] };
  return { titulo, motivos: explicarDuas(primeiro, segundo) };
}

function explicarDuas(v: { p: Disponivel; nome: string }, s: { p: Disponivel; nome: string }): string[] {
  const [ev, es] = [v.p.etapas, s.p.etapas];
  if (ev.length === 1 && es.length === 1 && ev[0] && es[0]) return explicarVencedor(ev[0], es[0], v.nome, s.nome);
  const reaplicacoes = [v, s].flatMap((x) => (x.p.reinvestimento ? [`${x.nome} ${continuarFrase(descreverProjecao(x.p))}.`] : []));
  return [fraseDoPlacar(v.nome, v.p.liquido, s.nome, s.p.liquido), ...reaplicacoes];
}

/**
 * Conclusão no último vencimento: quem termina na frente, por quanto e o efeito da reaplicação. Com a última
 * coluna da tabela (o horizonte mais distante), avisa quando a liderança muda depois do último vencimento,
 * para a conclusão não contradizer a tabela.
 */
export function concluirLinhaDoTempo(
  ofertas: readonly OfertaCadastrada[], l: { marcos: readonly Marco[] }, ultimaColuna?: ColunaHorizonte,
): string[] {
  const linhas = concluirNoUltimoVencimento(ofertas, l);
  const ultimo = l.marcos.at(-1);
  if (linhas.length === 0 || !ultimo || !ultimaColuna || ultimaColuna.data <= ultimo.data || ultimaColuna.lideres.length === 0) return linhas;
  const mesmos = ultimaColuna.lideres.length === ultimo.lideres.length && ultimaColuna.lideres.every((i) => ultimo.lideres.includes(i));
  if (mesmos) return linhas;
  const nomes = ultimaColuna.lideres.flatMap((i) => (ofertas[i] ? [nomeOferta(ofertas[i])] : []));
  return [...linhas, `Depois disso a ordem muda: em ${nomeDoHorizonte(ultimaColuna)} quem lidera é ${listar(nomes)}.`];
}

function concluirNoUltimoVencimento(ofertas: readonly OfertaCadastrada[], l: { marcos: readonly Marco[] }): string[] {
  const ultimo = l.marcos.at(-1);
  if (!ultimo || ultimo.lideres.length === 0) return [];
  const data = dataBR(ultimo.data);
  const disponiveis = ultimo.projecoes
    .flatMap((p, i) => (p.estado === 'DISPONIVEL' ? [{ p, o: ofertas[i] }] : []))
    .filter((x): x is { p: Disponivel; o: OfertaCadastrada } => x.o !== undefined)
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

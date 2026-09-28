// A comparação temporária (plano M3c, C1 e C2): a do "Experimente", a de um caso clássico ou a de um link aberto.
// Fica só em memória: não mexe na seleção salva nem no catálogo, e o cenário dela não muda as preferências.
import { LIMITE_OFERTAS } from '../../armazenamento/ofertas';
import type { ExperimenteMontado } from '../../conteudo/licoes/tipos';
import type { EscolhaCenario, ValoresManuais } from '../../dados/cenarios';
import type { OfertaCadastrada } from '../../engine/ofertas';
import type { Premissas } from '../../engine/projecao';
import type { EntradaInicial } from './Comparador';

export type OrigemTemporaria = { tipo: 'licao'; titulo: string } | { tipo: 'caso'; titulo: string } | { tipo: 'link' };

/** O cenário pedido: a lição traz só a escolha (o resto é o da pessoa); o link traz tudo. */
export interface CenarioDaTemporaria { escolha: EscolhaCenario; premissas?: Premissas; manual?: ValoresManuais }

export interface ComparacaoTemporaria {
  /** Nova a cada abertura: o formulário da comparação recomeça com as entradas dela. */
  chave: string;
  origem: OrigemTemporaria;
  /** As ofertas da comparação, com ids só de memória. */
  ofertas: readonly OfertaCadastrada[];
  /** Os ids na comparação: começa com todas; a pessoa pode tirar e pôr (inclusive do catálogo). */
  selecao: readonly string[];
  inicial: EntradaInicial;
  cenario?: CenarioDaTemporaria;
  pergunta?: string;
  /** Já salvas no catálogo (o botão some). */
  salvas: boolean;
}

let aberturas = 0;
const novaChave = () => `temporaria-${++aberturas}`;

export function temporariaDoExperimente(
  m: ExperimenteMontado, origem: OrigemTemporaria, gerarId: () => string,
): ComparacaoTemporaria {
  const ofertas = m.ofertas.map((o) => ({ ...o, id: gerarId() }));
  return {
    chave: novaChave(), origem, ofertas, selecao: ofertas.map((o) => o.id), salvas: false,
    inicial: { valor: m.valor, dataAplicacao: m.dataAplicacao, regra: m.regra, ...(m.suaData === undefined ? {} : { suaData: m.suaData }) },
    ...(m.cenario === undefined ? {} : { cenario: { escolha: m.cenario } }),
    ...(m.pergunta === undefined ? {} : { pergunta: m.pergunta }),
  };
}

export function textoDoBanner(origem: OrigemTemporaria, n: number): string {
  switch (origem.tipo) {
    case 'licao': return `Comparação da lição “${origem.titulo}”.`;
    case 'caso': return `Comparação do caso clássico “${origem.titulo}”.`;
    case 'link': return `Comparação compartilhada com ${n} ${n === 1 ? 'oferta' : 'ofertas'}.`;
  }
}

const NOME_CENARIO: Record<EscolhaCenario, string> = { SOBEM: 'Juros sobem', BASE: 'Base (Focus)', CAEM: 'Juros caem', MANUAL: 'Manual' };

/** O aviso de quando o cenário pedido precisa do Focus e a comparação caiu no manual; null se não caiu. */
export function avisoDoCenario(escolha: EscolhaCenario, projetado: boolean): string | null {
  if (escolha === 'MANUAL' || projetado) return null;
  return `O cenário “${NOME_CENARIO[escolha]}” desta comparação precisa das projeções do Focus, que não estão disponíveis agora. Por isso ela usa o cenário manual.`;
}

export type ResultadoSalvar = { ok: true; catalogo: OfertaCadastrada[]; salvas: number } | { ok: false; erro: string };

/**
 * O catálogo com cópias (ids novos) das ofertas da comparação temporária que ainda estão nela. Se não couberem
 * todas no limite do catálogo, não salva nenhuma.
 */
export function salvarNoCatalogo(
  catalogo: readonly OfertaCadastrada[], t: ComparacaoTemporaria, gerarId: () => string,
): ResultadoSalvar {
  const estas = t.ofertas.filter((o) => t.selecao.includes(o.id));
  const livres = LIMITE_OFERTAS - catalogo.length;
  if (estas.length > livres) {
    const erro = livres <= 0
      ? `O catálogo já tem ${LIMITE_OFERTAS} ofertas, o máximo. Tire alguma de lá para salvar estas.`
      : `Só ${livres === 1 ? 'cabe mais 1 oferta' : `cabem mais ${livres} ofertas`} no catálogo (o máximo é ${LIMITE_OFERTAS}). Tire alguma de lá para salvar estas.`;
    return { ok: false, erro };
  }
  return { ok: true, catalogo: [...catalogo, ...estas.map((o) => ({ ...o, id: gerarId() }))], salvas: estas.length };
}

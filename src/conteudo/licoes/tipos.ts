// src/conteudo/licoes/tipos.ts
// O modelo da trilha "Aprender" (spec §6): lições e casos clássicos como dados, separados da interface.
import type { EscolhaCenario } from '../../dados/cenarios';
import { type DataISO, somarMeses } from '../../engine/datas';
import type { OfertaCadastrada, RegraReinvestimento } from '../../engine/ofertas';
import type { IdTermo } from '../glossario';

export type IdLicao =
  | 'renda-fixa' | 'indexadores' | 'impostos' | 'fgc' | 'liquidez' | 'marcacao-mercado'
  | 'reserva' | 'reaplicacao' | 'diversificacao' | 'renda-variavel';

/**
 * Uma oferta do "Experimente". O vencimento é relativo ao dia em que a lição é aberta (`vencimentoEmMeses`), não
 * uma data fixa: assim o exemplo não envelhece e nenhuma oferta vence antes da aplicação daqui a alguns anos.
 */
export type OfertaDoExperimente = Omit<OfertaCadastrada, 'id' | 'vencimento'> & { vencimentoEmMeses?: number };

export interface Experimente {
  /** De 2 a 5. */
  ofertas: readonly OfertaDoExperimente[];
  valor: number;
  /** "Sua data", em meses a partir de hoje. */
  mesesAteSuaData?: number;
  /** Ausente: a regra padrão. */
  regra?: RegraReinvestimento;
  /** Ausente: o cenário que a pessoa já usa. */
  cenario?: EscolhaCenario;
  /** Palpite próprio da lição (opcional). */
  pergunta?: string;
}

export interface SecaoLicao {
  titulo: string;
  /** Markdown restrito (ver MarkdownRestrito). */
  texto: string;
}

export interface Licao {
  id: IdLicao;
  ordem: number;
  titulo: string;
  /** Uma frase. */
  resumo: string;
  secoes: readonly SecaoLicao[];
  /** Sem nas lições conceituais (diversificação e renda variável). */
  experimente?: Experimente;
  termos: readonly IdTermo[];
  /** URLs https oficiais. */
  fontes: readonly string[];
  tempoLeituraMin: number;
}

export interface CasoClassico {
  id: string;
  titulo: string;
  pergunta: string;
  explicacao: string;
  experimente: Experimente;
  licao: IdLicao;
}

export const PALAVRAS_POR_MINUTO = 200;

/** As palavras do título, do resumo e das seções (títulos e textos), sem a marcação do Markdown restrito. */
export function palavrasDaLicao(l: Pick<Licao, 'titulo' | 'resumo' | 'secoes'>): number {
  const texto = [l.titulo, l.resumo, ...l.secoes.flatMap((s) => [s.titulo, s.texto])].join(' ');
  return texto.replace(/\]\([^)\s]+\)/g, ' ').replace(/[*[\]]/g, ' ').split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p)).length;
}

/** A lição com o tempo de leitura calculado pelas palavras, a {@link PALAVRAS_POR_MINUTO}, arredondado para cima. */
export function definirLicao(l: Omit<Licao, 'tempoLeituraMin'>): Licao {
  return { ...l, tempoLeituraMin: Math.max(1, Math.ceil(palavrasDaLicao(l) / PALAVRAS_POR_MINUTO)) };
}

/** O "Experimente" com as datas resolvidas a partir de `hoje`, pronto para a comparação temporária. */
export interface ExperimenteMontado {
  ofertas: Omit<OfertaCadastrada, 'id'>[];
  valor: number;
  dataAplicacao: DataISO;
  suaData?: DataISO;
  regra: RegraReinvestimento;
  cenario?: EscolhaCenario;
  pergunta?: string;
}

export function montarExperimente(e: Experimente, hoje: DataISO): ExperimenteMontado {
  const ofertas = e.ofertas.map(({ vencimentoEmMeses, ...o }) => (
    vencimentoEmMeses === undefined ? o : { ...o, vencimento: somarMeses(hoje, vencimentoEmMeses) }
  ));
  return {
    ofertas, valor: e.valor, dataAplicacao: hoje, regra: e.regra ?? { tipo: 'PADRAO' },
    ...(e.mesesAteSuaData === undefined ? {} : { suaData: somarMeses(hoje, e.mesesAteSuaData) }),
    ...(e.cenario === undefined ? {} : { cenario: e.cenario }),
    ...(e.pergunta === undefined ? {} : { pergunta: e.pergunta }),
  };
}

// A carteira calculada para a aba Carteira: o valor de cada posição, o total e a exposição ao FGC (spec §3.4 e §5.3).
import type { DataISO } from '../../engine/datas';
import { OfertaInvalidaError, RegraNaoEncontradaError } from '../../engine/erros';
import {
  type AlertaFGC, coberto, type ItemFGC, normalizarConglomerado, primeiraDataAcimaDoLimite, type TetoGlobal, tetoGlobalExcedido,
} from '../../engine/fgc';
import type { Cenario } from '../../engine/indexadores';
import { itemFGCDaPosicao, type Posicao, type ValorAtual, valorAtual } from '../../engine/posicoes';
import { ehTesouro } from '../../engine/produtos';
import { regraFGC } from '../../engine/regras/fgc';

/** Uma posição com o valor de hoje, ou com o motivo de não ter sido calculada. */
export type LinhaPosicao = { posicao: Posicao; valor: ValorAtual } | { posicao: Posicao; erro: string };

export interface ConglomeradoFGC {
  /** O nome como está na primeira posição do grupo. */
  nome: string;
  /** Bruto somado hoje (o extrato recente entra, ver `itemFGCDaPosicao`). */
  hoje: number;
  /** O vencimento mais distante das posições do grupo (se houver um depois de hoje) e o bruto somado nele. */
  fim?: { data: DataISO; valor: number };
  limite: number;
  /** A primeira data, entre hoje e os vencimentos, em que o grupo passa do limite. */
  alerta?: AlertaFGC;
}

export type ExposicaoCarteira =
  | {
    ok: true;
    conglomerados: ConglomeradoFGC[];
    /** Σ min(exposição do conglomerado, limite) hoje. */
    garantiaSomada: number;
    teto: number;
    tetoGlobal: TetoGlobal | null;
    /** As posições do Tesouro, sem limite do FGC; null se não houver nenhuma calculada. */
    tesouro: { bruto: number; quantidade: number } | null;
  }
  | { ok: false; erro: string };

export interface ResumoCarteira {
  linhas: LinhaPosicao[];
  /** Soma das posições calculadas que ainda não venceram. */
  total: { bruto: number; liquido: number };
  naoCalculadas: Posicao[];
  /** As posições calculadas que já venceram: ficam fora do total e da exposição ao FGC. */
  vencidas: Posicao[];
  fgc: ExposicaoCarteira;
}

const ehErroDeDado = (e: unknown): e is Error => e instanceof RegraNaoEncontradaError || e instanceof OfertaInvalidaError;
const mensagem = (e: Error) => `${e.message.replace(/\.$/, '')}.`;

function calcularLinha(p: Posicao, hoje: DataISO, cen: Cenario): LinhaPosicao {
  try {
    const valor = valorAtual(p, hoje, cen);
    // O FGC vai até o vencimento: se ele não puder ser calculado, a posição fica de fora de tudo.
    if (p.vencimento !== undefined && p.vencimento > hoje) valorAtual(p, p.vencimento, cen);
    return { posicao: p, valor };
  } catch (e) {
    if (!ehErroDeDado(e)) throw e;
    return { posicao: p, erro: mensagem(e) };
  }
}

function exposicaoDaCarteira(calculadas: readonly { posicao: Posicao; valor: ValorAtual }[], hoje: DataISO, cen: Cenario): ExposicaoCarteira {
  try {
    const regra = regraFGC(hoje);
    const grupos = new Map<string, { nome: string; posicoes: Posicao[]; itens: ItemFGC[] }>();
    for (const { posicao } of calculadas) {
      if (!coberto(posicao.produto)) continue;
      const chave = normalizarConglomerado(posicao.conglomerado);
      const grupo = grupos.get(chave) ?? { nome: posicao.conglomerado.trim().replace(/\s+/g, ' '), posicoes: [], itens: [] };
      grupo.posicoes.push(posicao);
      grupo.itens.push(itemFGCDaPosicao(posicao, hoje, cen));
      grupos.set(chave, grupo);
    }
    const soma = (itens: readonly ItemFGC[], data: DataISO) => itens.reduce((s, i) => s + i.brutoEm(data), 0);
    const conglomerados = [...grupos.values()].map(({ nome, posicoes, itens }): ConglomeradoFGC => {
      const vencimentos = posicoes.flatMap((p) => (p.vencimento !== undefined && p.vencimento > hoje ? [p.vencimento] : [])).sort();
      const maisDistante = vencimentos.at(-1);
      const alerta = primeiraDataAcimaDoLimite(itens, [hoje, ...vencimentos])[0];
      return {
        nome, hoje: soma(itens, hoje), limite: regra.porConglomerado,
        ...(maisDistante === undefined ? {} : { fim: { data: maisDistante, valor: soma(itens, maisDistante) } }),
        ...(alerta === undefined ? {} : { alerta }),
      };
    });
    const itens = [...grupos.values()].flatMap((g) => g.itens);
    const tesouro = calculadas.filter((c) => ehTesouro(c.posicao.produto));
    return {
      ok: true, conglomerados,
      garantiaSomada: conglomerados.reduce((s, g) => s + Math.min(g.hoje, regra.porConglomerado), 0),
      teto: regra.tetoGlobal,
      tetoGlobal: tetoGlobalExcedido(itens, hoje),
      tesouro: tesouro.length === 0 ? null : { bruto: tesouro.reduce((s, c) => s + c.valor.bruto, 0), quantidade: tesouro.length },
    };
  } catch (e) {
    if (!ehErroDeDado(e)) throw e;
    return { ok: false, erro: mensagem(e) };
  }
}

/**
 * O valor de hoje de cada posição, pelo cenário (com o histórico, ver `cenarioComHistorico`), o total e a
 * exposição ao FGC. Uma posição que não pode ser calculada (regra não cadastrada ou dado inválido) fica de fora
 * do total e do FGC, com o motivo; as outras seguem. Uma posição vencida (hoje depois do vencimento; o próprio dia
 * ainda conta) tem a linha, com o valor no vencimento, mas fica fora do total e do FGC: o dinheiro já saiu dela.
 */
export function resumirCarteira(posicoes: readonly Posicao[], hoje: DataISO, cen: Cenario): ResumoCarteira {
  const linhas = posicoes.map((p) => calcularLinha(p, hoje, cen));
  const calculadas = linhas.flatMap((l) => ('valor' in l ? [l] : []));
  const ativas = calculadas.filter((l) => !l.valor.vencida);
  return {
    linhas,
    total: {
      bruto: ativas.reduce((s, l) => s + l.valor.bruto, 0),
      liquido: ativas.reduce((s, l) => s + l.valor.liquido, 0),
    },
    naoCalculadas: linhas.flatMap((l) => ('erro' in l ? [l.posicao] : [])),
    vencidas: calculadas.flatMap((l) => (l.valor.vencida ? [l.posicao] : [])),
    fgc: exposicaoDaCarteira(ativas, hoje, cen),
  };
}

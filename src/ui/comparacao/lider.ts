import { listar, nomeDoHorizonte, nomesDistintos } from '../../conteudo/comparacao';
import type { ColunaHorizonte } from '../../engine/comparacao';
import type { OfertaCadastrada } from '../../engine/ofertas';
import { formatarMoeda } from '../../formato';

export interface FrasesDoLider {
  rotulo: string;
  /** O valor líquido do líder, já formatado. */
  valor: string;
  frase: string;
}

/**
 * O destaque do topo do resultado: o valor líquido do líder no horizonte mais distante que tem líder (o mesmo
 * critério de `PorQueLidera`: `coluna.lideres`, que já trata o empate em centavos). null sem nenhum líder.
 */
export function frasesDoLider(ofertas: readonly OfertaCadastrada[], colunas: readonly ColunaHorizonte[]): FrasesDoLider | null {
  const coluna = colunas.filter((c) => c.lideres.length > 0).at(-1);
  if (!coluna) return null;
  const nomes = nomesDistintos(ofertas);
  const ranking = coluna.projecoes.flatMap((p, i) => (p.estado === 'DISPONIVEL' ? [{ p, i, nome: nomes[i] ?? '', lider: coluna.lideres.includes(i) }] : []));
  const lideres = ranking.filter((x) => x.lider);
  const [primeiro] = lideres;
  if (!primeiro) return null;
  const rotulo = `Valor líquido do líder em ${nomeDoHorizonte(coluna)}`;
  const valor = formatarMoeda(primeiro.p.liquido);
  if (lideres.length > 1) return { rotulo, valor, frase: `Empate técnico entre ${listar(lideres.map((x) => x.nome))}.` };
  const segundo = ranking.filter((x) => !x.lider).sort((a, b) => b.p.liquido - a.p.liquido)[0];
  if (!segundo) return { rotulo, valor, frase: `Só ${primeiro.nome} pode ser resgatada nesse prazo.` };
  return { rotulo, valor, frase: `A liderança é de ${primeiro.nome}, ${formatarMoeda(primeiro.p.liquido - segundo.p.liquido)} a mais que a segunda colocada.` };
}

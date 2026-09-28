// Textos do gráfico do valor líquido. Rascunho: a revisão editorial é a tarefa C5 do M3b.
import { dataBR, somarDias } from '../engine/datas';
import type { OfertaCadastrada } from '../engine/ofertas';
import type { TrocaDeLider } from '../engine/serie';
import { listar, nomeOferta } from './comparacao';

const NINGUEM = 'nenhuma oferta pode ser resgatada';

function nomes(ofertas: readonly OfertaCadastrada[], indices: readonly number[]): string {
  return listar(indices.map((i) => (ofertas[i] ? nomeOferta(ofertas[i]) : `Oferta ${i + 1}`)));
}

/** "X lidera", "X e Y empatam na liderança" ou "nenhuma oferta pode ser resgatada". */
function quemLidera(ofertas: readonly OfertaCadastrada[], indices: readonly number[], singular: string): string {
  if (indices.length === 0) return NINGUEM;
  return indices.length === 1 ? `${nomes(ofertas, indices)} ${singular}` : `${nomes(ofertas, indices)} empatam na liderança`;
}

const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Resumo acessível do gráfico (o `aria-label` do canvas e o texto abaixo dele), uma frase por item.
 * `lideresIniciais`: quem lidera no primeiro ponto da série (`lideresNoPonto(series, 0)`), porque o começo não é
 * uma troca.
 */
export function resumirTrocas(trocas: readonly TrocaDeLider[], ofertas: readonly OfertaCadastrada[], lideresIniciais: readonly number[]): string[] {
  const primeira = trocas[0];
  if (!primeira) {
    return [lideresIniciais.length === 0 ? `${maiuscula(NINGUEM)} no período.` : `${maiuscula(quemLidera(ofertas, lideresIniciais, 'lidera'))} o tempo todo.`];
  }
  return [
    `Até ${dataBR(somarDias(primeira.data, -1))}, ${quemLidera(ofertas, lideresIniciais, 'lidera')}.`,
    ...trocas.map((t) => `A partir de ${dataBR(t.data)}, ${quemLidera(ofertas, t.para, 'passa a liderar')}.`),
  ];
}

/** Textos fixos do gráfico do valor líquido. */
export const GRAFICO_VALOR = {
  titulo: 'Valor líquido ao longo do tempo',
  tracejado: 'Linha tracejada: a oferta ainda não pode ser resgatada, e o valor é só referência.',
  premissa: 'premissa',
} as const;

/** Rótulo da linha vertical de uma troca de líder, pelas letras de quem passa a liderar. */
export function rotuloDaTroca(letras: readonly string[]): string {
  if (letras.length === 0) return 'Ninguém pode resgatar';
  return letras.length === 1 ? `${letras[0]} passa a liderar` : `${listar(letras)} empatam`;
}

/** Por que o valor da oferta é só referência naquele trecho (no tooltip). */
export function motivoSemResgate(o: OfertaCadastrada): string {
  if (o.produto === 'TESOURO_PREFIXADO' || o.produto === 'TESOURO_IPCA') return '(marcação a mercado)';
  return o.liquidez === 'NO_VENCIMENTO' ? '(só no vencimento)' : '(prazo mínimo)';
}

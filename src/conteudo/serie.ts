// Textos do gráfico do valor líquido. Rascunho: a revisão editorial é a tarefa C5 do M3b.
import { type DataISO, dataBR, somarDias } from '../engine/datas';
import type { OfertaCadastrada } from '../engine/ofertas';
import type { MotivoSemResgate, TrocaDeLider } from '../engine/serie';
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
  tracejado: 'Linha tracejada: o valor é só referência. A oferta ainda não pode ser resgatada (só no vencimento ou no prazo mínimo) ou, no Tesouro Prefixado e no IPCA+, a venda antes do vencimento sai pelo preço de mercado, e a linha mostra o valor na curva contratada.',
  premissa: 'premissa',
} as const;

/** Rótulo da linha vertical de uma troca de líder, pelas letras de quem passa a liderar. */
export function rotuloDaTroca(letras: readonly string[]): string {
  if (letras.length === 0) return 'Ninguém pode resgatar';
  return letras.length === 1 ? `${letras[0]} passa a liderar` : `${listar(letras)} empatam`;
}

const MOTIVOS: Record<MotivoSemResgate, string> = {
  NO_VENCIMENTO: '(só no vencimento)',
  PRAZO_MINIMO: '(prazo mínimo)',
  MARCACAO_A_MERCADO: '(na curva contratada, não é o preço de mercado)',
};

/** Por que o valor do ponto é só referência (no tooltip), pelo motivo que a série já calculou. */
export const motivoSemResgate = (motivo: MotivoSemResgate): string => MOTIVOS[motivo];

/** Textos fixos do gráfico da diferença entre duas ofertas. */
export const GRAFICO_DIFERENCA = {
  titulo: 'Diferença entre duas ofertas',
  comparar: 'Comparar',
  com: 'com',
  explicacao: 'Acima do zero, a primeira oferta está à frente; abaixo, a segunda.',
  referencia: '(valor de referência)',
} as const;

/** Quem está à frente desde `data`: a primeira oferta escolhida (A), a segunda (B) ou ninguém (empate em centavos). */
export interface TrechoDiferenca { data: DataISO; frente: 'A' | 'B' | 'EMPATE' }

/** Rótulo da linha vertical onde o sinal da diferença troca. */
export function rotuloDaTrocaDeSinal(frente: TrechoDiferenca['frente'], letraA: string, letraB: string): string {
  if (frente === 'EMPATE') return 'Empate';
  return `${frente === 'A' ? letraA : letraB} à frente`;
}

/** Resumo acessível do gráfico da diferença: "{A} fica à frente até dd/mm/aaaa; depois {B}." */
export function resumirDiferenca(trechos: readonly TrechoDiferenca[], nomeA: string, nomeB: string): string {
  const [primeiro, ...resto] = trechos;
  if (!primeiro) return 'Não há datas em que as duas ofertas tenham valor para comparar.';
  const quem = (f: TrechoDiferenca['frente']) => (f === 'A' ? nomeA : nomeB);
  const inicio = primeiro.frente === 'EMPATE' ? `${nomeA} e ${nomeB} empatam` : `${quem(primeiro.frente)} fica à frente`;
  if (resto.length === 0) return `${inicio} o tempo todo.`;
  const ate = (i: number) => dataBR(somarDias((trechos[i] as TrechoDiferenca).data, -1));
  const partes = [`${inicio} até ${ate(1)}`];
  resto.forEach((t, k) => {
    const depois = t.frente === 'EMPATE' ? 'depois as duas empatam' : `depois ${quem(t.frente)}`;
    partes.push(k === resto.length - 1 ? depois : `${depois}, até ${ate(k + 2)}`);
  });
  return `${partes.join('; ')}.`;
}

// Textos do gráfico do valor líquido. Rascunho: a revisão editorial é a tarefa C5 do M3b.
import { type DataISO, dataBR, somarDias } from '../engine/datas';
import type { OfertaCadastrada } from '../engine/ofertas';
import type { MotivoSemResgate, Oscilacao, TrocaRelevante } from '../engine/serie';
import { listar, nomesDistintos } from './comparacao';

const NINGUEM = 'nenhuma oferta pode ser resgatada';

function nomes(ofertas: readonly OfertaCadastrada[], indices: readonly number[]): string {
  const distintos = nomesDistintos(ofertas);
  return listar(indices.map((i) => distintos[i] ?? `Oferta ${i + 1}`));
}

/** "X lidera", "X e Y empatam na liderança" ou "nenhuma oferta pode ser resgatada". */
function quemLidera(ofertas: readonly OfertaCadastrada[], indices: readonly number[], singular: string): string {
  if (indices.length === 0) return NINGUEM;
  return indices.length === 1 ? `${nomes(ofertas, indices)} ${singular}` : `${nomes(ofertas, indices)} empatam na liderança`;
}

const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** O máximo de frases do resumo. */
export const MAXIMO_FRASES_RESUMO = 5;

/**
 * " e alterna outras N vezes", com "entre {líder} e {outra} por causa do aniversário da poupança" quando a
 * alternância é entre duas ofertas e uma delas é a poupança. Vazio sem oscilação.
 */
function alternancia(ofertas: readonly OfertaCadastrada[], lideres: readonly number[], osc: Partial<Oscilacao> | undefined): string {
  if (!osc?.oscilante || !osc.alternancias) return '';
  const vezes = osc.alternancias === 1 ? 'outra vez' : `outras ${osc.alternancias} vezes`;
  const alternam = osc.alternam ?? [];
  const lider = lideres.length === 1 ? lideres[0] : undefined;
  const outra = alternam.find((i) => i !== lider);
  const temPoupanca = alternam.some((i) => ofertas[i]?.produto === 'POUPANCA');
  if (alternam.length !== 2 || lider === undefined || outra === undefined || !temPoupanca) return ` e alterna ${vezes}`;
  return ` e alterna ${vezes} entre ${nomes(ofertas, [lider])} e ${nomes(ofertas, [outra])} por causa do aniversário da poupança`;
}

/**
 * Resumo acessível do gráfico (o `aria-label` do canvas e o texto abaixo dele), uma frase por trecho, no máximo
 * {@link MAXIMO_FRASES_RESUMO}. Recebe as trocas relevantes (`trocasRelevantes`): um trecho oscilante ganha
 * "e alterna outras N vezes". `lideresIniciais`: quem lidera no primeiro ponto da série
 * (`lideresNoPonto(series, 0)`), porque o começo não é uma troca; `inicial`: a oscilação do trecho do começo.
 */
export function resumirTrocas(
  trocas: readonly TrocaRelevante[], ofertas: readonly OfertaCadastrada[], lideresIniciais: readonly number[], inicial?: Oscilacao,
): string[] {
  const primeira = trocas[0];
  const doInicio = alternancia(ofertas, lideresIniciais, inicial);
  if (!primeira) {
    if (lideresIniciais.length === 0) return [`${maiuscula(NINGUEM)} no período.`];
    const quanto = doInicio === '' ? 'o tempo todo' : 'quase o tempo todo';
    return [`${maiuscula(quemLidera(ofertas, lideresIniciais, 'lidera'))} ${quanto}${doInicio}.`];
  }
  const frases = [
    `Até ${dataBR(somarDias(primeira.data, -1))}, ${quemLidera(ofertas, lideresIniciais, 'lidera')}${doInicio}.`,
    ...trocas.map((t) => `A partir de ${dataBR(t.data)}, ${quemLidera(ofertas, t.para, 'passa a liderar')}${alternancia(ofertas, t.para, t)}.`),
  ];
  if (frases.length <= MAXIMO_FRASES_RESUMO) return frases;
  const restantes = frases.length - (MAXIMO_FRASES_RESUMO - 1);
  return [...frases.slice(0, MAXIMO_FRASES_RESUMO - 1), `Depois, a liderança ainda muda outras ${restantes} vezes até o fim do período.`];
}

/** O Chart.js é carregado sob demanda: o que a figura diz enquanto carrega e se o carregamento falhar. */
export const GRAFICO_CARREGAMENTO = {
  carregando: 'Carregando gráfico…',
  erro: 'Não deu para carregar o gráfico. A tabela acima e o resumo abaixo têm os principais dados.',
  tentarDeNovo: 'Tentar de novo',
} as const;

/** O nome da lista da legenda, abaixo de cada gráfico. */
export const GRAFICO_LEGENDA = 'Legenda';

/** Textos fixos do gráfico do valor líquido. */
export const GRAFICO_VALOR = {
  titulo: 'Valor líquido ao longo do tempo',
  tracejado: 'Linha tracejada: valor só de referência. Ou a oferta ainda não pode ser resgatada (só no vencimento ou por prazo mínimo), ou, no Tesouro Prefixado e no IPCA+, vender antes do vencimento sai pelo preço de mercado, e a linha mostra o valor na curva contratada.',
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
  MARCACAO_A_MERCADO: '(valor na curva contratada)',
};

/** Por que o valor do ponto é só referência (no tooltip), pelo motivo que a série já calculou. */
export const motivoSemResgate = (motivo: MotivoSemResgate): string => MOTIVOS[motivo];

/** Textos fixos do gráfico da diferença entre duas ofertas. */
export const GRAFICO_DIFERENCA = {
  titulo: 'Diferença entre duas ofertas',
  comparar: 'Comparar',
  com: 'com',
  /** O nome acessível do seletor B: contém o rótulo visível "com" (WCAG 2.5.3). */
  compararCom: 'Comparar com',
  explicacao: 'Acima do zero a primeira oferta está à frente, e abaixo dele, a segunda.',
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

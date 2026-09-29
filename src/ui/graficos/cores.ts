// Cores dos gráficos: tokens CSS de :root, lidos na hora de desenhar (o canvas não herda CSS).

export const TOKENS = {
  series: ['--grafico-1', '--grafico-2', '--grafico-3', '--grafico-4', '--grafico-5'],
  texto: '--grafico-texto',
  grade: '--grafico-grade',
  /** Linhas de referência: as trocas de líder, as trocas de sinal e o zero. */
  marcador: '--grafico-marcador',
  /** Fundo da faixa em que a projeção vira premissa. */
  premissa: '--grafico-premissa',
} as const;

/** Os mesmos valores de estilos.css, para quando a folha de estilo não estiver carregada. */
const PADRAO = {
  series: ['#0f766e', '#b45309', '#1d6b3a', '#7e22ce', '#be123c'],
  texto: '#46514f',
  grade: '#e0e7e5',
  marcador: '#14201f',
  premissa: '#eef3f2',
};

export interface PaletaGrafico {
  series: string[];
  texto: string;
  grade: string;
  marcador: string;
  premissa: string;
}

/**
 * Forma do ponto de cada série, além da cor (legenda e marcas ao longo da linha). O tracejado fica reservado
 * aos trechos em que a oferta não pode ser resgatada.
 */
export const FORMAS_DO_PONTO = ['circle', 'rect', 'triangle', 'rectRot', 'crossRot'] as const;

/** O traço dos trechos não resgatáveis (e da linha de referência). */
export const TRACEJADO = [6, 4];

export function lerPaleta(el: Element = document.documentElement): PaletaGrafico {
  const estilo = getComputedStyle(el);
  const ler = (token: string, padrao: string) => estilo.getPropertyValue(token).trim() || padrao;
  return {
    series: TOKENS.series.map((t, i) => ler(t, PADRAO.series[i] as string)),
    texto: ler(TOKENS.texto, PADRAO.texto),
    grade: ler(TOKENS.grade, PADRAO.grade),
    marcador: ler(TOKENS.marcador, PADRAO.marcador),
    premissa: ler(TOKENS.premissa, PADRAO.premissa),
  };
}

/** A cor e a forma da oferta de índice `i` (a paleta repete depois da quinta). */
export const corDaSerie = (p: PaletaGrafico, i: number): string => p.series[i % p.series.length] as string;
export const formaDaSerie = (i: number): (typeof FORMAS_DO_PONTO)[number] => FORMAS_DO_PONTO[i % FORMAS_DO_PONTO.length] as (typeof FORMAS_DO_PONTO)[number];

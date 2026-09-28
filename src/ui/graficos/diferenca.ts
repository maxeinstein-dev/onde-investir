// A diferença entre duas séries do valor líquido, ponto a ponto, e quem fica à frente em cada trecho.
import type { TrechoDiferenca } from '../../conteudo/serie';
import type { DataISO } from '../../engine/datas';
import type { Serie } from '../../engine/serie';

export interface PontoDiferenca {
  data: DataISO;
  /** A − B; null quando falta o valor de uma das duas. */
  diferenca: number | null;
  /** false quando uma das duas não pode ser resgatada na data (a diferença é de valores de referência). */
  resgatavel: boolean;
}

/** A − B em cada data. As séries têm as mesmas datas (as de `seriesDeValorLiquido`). */
export function diferencaEntre(a: Serie, b: Serie): PontoDiferenca[] {
  return a.pontos.map((pa, k) => {
    const pb = b.pontos[k];
    const diferenca = pa.liquido === null || pb?.liquido == null ? null : pa.liquido - pb.liquido;
    return { data: pa.data, diferenca, resgatavel: pa.resgatavel && (pb?.resgatavel ?? false) };
  });
}

const frente = (diferenca: number): TrechoDiferenca['frente'] => {
  const centavos = Math.round(diferenca * 100);
  return centavos > 0 ? 'A' : centavos < 0 ? 'B' : 'EMPATE';
};

/**
 * Quem está à frente desde cada data, comparando em centavos (a regra dos líderes): o primeiro trecho começa no
 * primeiro ponto com valor, e cada troca abre um trecho novo. Pontos sem valor não mudam o trecho.
 */
export function trechosDaDiferenca(pontos: readonly PontoDiferenca[]): TrechoDiferenca[] {
  const trechos: TrechoDiferenca[] = [];
  for (const p of pontos) {
    if (p.diferenca === null) continue;
    const f = frente(p.diferenca);
    if (trechos.at(-1)?.frente !== f) trechos.push({ data: p.data, frente: f });
  }
  return trechos;
}

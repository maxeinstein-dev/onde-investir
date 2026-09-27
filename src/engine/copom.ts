// src/engine/copom.ts
import { ehDiaUtil } from './calendario';
import { type DataISO, diasCorridos, somarDias } from './datas';

export interface ReuniaoCopom { id: string; anuncio: DataISO; estimada: boolean }

/** O calendário do BC traz um item por dia de reunião; o anúncio é o último dia de cada bloco consecutivo. */
export function anunciosDoCalendario(dias: readonly DataISO[]): DataISO[] {
  const ordenados = [...new Set(dias)].sort();
  return ordenados.filter((d, i) => {
    const proximo = ordenados[i + 1];
    return proximo === undefined || diasCorridos(d, proximo) > 1;
  });
}

export function numerarReunioes(anuncios: readonly DataISO[]): ReuniaoCopom[] {
  const contagem = new Map<string, number>();
  return [...anuncios].sort().map((anuncio) => {
    const ano = anuncio.slice(0, 4);
    const n = (contagem.get(ano) ?? 0) + 1;
    contagem.set(ano, n);
    return { id: `R${n}/${ano}`, anuncio, estimada: false };
  });
}

const ID_REUNIAO = /^R([1-8])\/(\d{4})$/;

/** Data oficial, ou estimada pela mesma reunião do último ano oficial + 364 dias por ano. */
export function dataDaReuniao(id: string, oficiais: readonly ReuniaoCopom[]): ReuniaoCopom | null {
  const oficial = oficiais.find((r) => r.id === id);
  if (oficial) return oficial;
  const m = ID_REUNIAO.exec(id);
  if (!m) return null;
  const ano = Number(m[2]);
  const referencia = oficiais.filter((r) => r.id.startsWith(`R${m[1]}/`)).sort((a, b) => (a.anuncio < b.anuncio ? -1 : 1)).at(-1);
  if (!referencia) return null;
  const anoReferencia = Number(referencia.id.slice(-4));
  if (ano <= anoReferencia) return null;
  return { id, anuncio: somarDias(referencia.anuncio, 364 * (ano - anoReferencia)), estimada: true };
}

export function vigenciaDaDecisao(anuncio: DataISO): DataISO {
  let d = somarDias(anuncio, 1);
  while (!ehDiaUtil(d)) d = somarDias(d, 1);
  return d;
}

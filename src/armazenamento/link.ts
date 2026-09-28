// O link compartilhável (spec §5.7 e §7.2): a comparação completa no fragmento da URL (`#comparar/c1.…`), que não
// chega a nenhum servidor. NUNCA leva posições: o tipo não tem o campo, `codificar` só copia os campos conhecidos
// e o esquema estrito recusa qualquer extra (ver tests/seguranca/linkSemPosicoes.test.ts).
import { z } from '../zod';
import type { EscolhaCenario, ValoresManuais } from '../dados/cenarios';
import type { DataISO } from '../engine/datas';
import { OfertaInvalidaError } from '../engine/erros';
import {
  type OfertaCadastrada, type RegraReinvestimento, validarOfertaCadastrada, validarRegraReinvestimento,
} from '../engine/ofertas';
import type { Indexacao } from '../engine/produtos';
import type { Premissas } from '../engine/projecao';
import { DataIso, camposOferta } from './ofertas';
import { EsquemaEscolha, EsquemaManual, EsquemaPremissas } from './preferencias';

export type OfertaDoLink = Omit<OfertaCadastrada, 'id'>;

export interface EstadoCompartilhado {
  versao: 1;
  /** De 2 a 5. */
  ofertas: readonly OfertaDoLink[];
  valor: number;
  dataAplicacao: DataISO;
  suaData?: DataISO;
  regra: RegraReinvestimento;
  cenario: { escolha: EscolhaCenario; premissas: Premissas; manual: ValoresManuais };
}

export type ResultadoLink = { ok: true; estado: EstadoCompartilhado } | { ok: false; erro: string };

/** Tamanho máximo do fragmento (sem o `#comparar/`). */
export const LIMITE_FRAGMENTO = 8000;
/** Tamanho máximo do JSON descomprimido: defesa contra zip bomb. */
export const LIMITE_DESCOMPRIMIDO = 64 * 1024;
export const MIN_OFERTAS_LINK = 2;
export const MAX_OFERTAS_LINK = 5;
/** Teto de sanidade do valor aplicado (R$ 1 trilhão). */
const VALOR_MAXIMO = 1e12;
/** Tamanho dos pedaços entregues ao descompressor: cada pedaço de zeros vira no máximo ~260 KB. */
const PEDACO_ENTRADA = 256;

const PREFIXO_COMPRIMIDO = 'c1.';
const PREFIXO_JSON = 'j1.';

const EsquemaRegra = z.discriminatedUnion('tipo', [
  z.strictObject({ tipo: z.literal('PADRAO') }),
  z.strictObject({ tipo: z.literal('MESMA_TAXA') }),
  z.strictObject({ tipo: z.literal('CDI_100') }),
  z.strictObject({ tipo: z.literal('TAXA_FIXA'), taxaAA: z.number() }),
]);

const EsquemaEstado = z.strictObject({
  versao: z.literal(1),
  ofertas: z.array(z.strictObject(camposOferta)).min(MIN_OFERTAS_LINK).max(MAX_OFERTAS_LINK),
  valor: z.number().gt(0).max(VALOR_MAXIMO),
  dataAplicacao: DataIso,
  suaData: DataIso.optional(),
  regra: EsquemaRegra,
  cenario: z.strictObject({ escolha: EsquemaEscolha, premissas: EsquemaPremissas, manual: EsquemaManual }),
});

// --- cópia campo a campo: o que não está aqui não entra no link, nem por engano ---

function soIndexacao(i: Indexacao): Indexacao {
  switch (i.tipo) {
    case 'POS_CDI': return { tipo: 'POS_CDI', percentualCDI: i.percentualCDI };
    case 'PRE': return { tipo: 'PRE', taxaAA: i.taxaAA };
    case 'IPCA_MAIS': return { tipo: 'IPCA_MAIS', taxaRealAA: i.taxaRealAA };
    case 'SELIC': return { tipo: 'SELIC' };
    case 'POUPANCA': return { tipo: 'POUPANCA' };
  }
}

function soOferta(o: OfertaDoLink): OfertaDoLink {
  return {
    produto: o.produto, indexacao: soIndexacao(o.indexacao), emissor: o.emissor, conglomerado: o.conglomerado,
    ...(o.vencimento === undefined ? {} : { vencimento: o.vencimento }),
    liquidez: o.liquidez,
    ...(o.custoExtraAA === undefined ? {} : { custoExtraAA: o.custoExtraAA }),
  };
}

function soRegra(r: RegraReinvestimento): RegraReinvestimento {
  return r.tipo === 'TAXA_FIXA' ? { tipo: 'TAXA_FIXA', taxaAA: r.taxaAA } : { tipo: r.tipo };
}

function soEstado(e: EstadoCompartilhado): EstadoCompartilhado {
  const { premissas: p, manual: m } = e.cenario;
  return {
    versao: 1,
    ofertas: e.ofertas.map(soOferta),
    valor: e.valor,
    dataAplicacao: e.dataAplicacao,
    ...(e.suaData === undefined ? {} : { suaData: e.suaData }),
    regra: soRegra(e.regra),
    cenario: {
      escolha: e.cenario.escolha,
      premissas: {
        k: p.k, ipcaLongoPrazoAA: p.ipcaLongoPrazoAA, juroRealLongoPrazoAA: p.juroRealLongoPrazoAA,
        anosConvergencia: p.anosConvergencia, spreadCDI: p.spreadCDI,
      },
      manual: { cdi: m.cdi, selicMeta: m.selicMeta, ipca: m.ipca, tr: m.tr },
    },
  };
}

// --- validação: esquema estrito e regras do engine ---

function descreverProblema(erro: z.ZodError): string {
  const problema = erro.issues[0];
  if (problema?.code === 'unrecognized_keys') return `O link tem campo não reconhecido (${problema.keys.join(', ')}).`;
  const caminho = problema?.path.map(String).join('.') ?? '';
  return caminho === '' ? 'O link não está no formato de comparação do Rende.' : `O link tem o campo "${caminho}" inválido.`;
}

function validarEstado(bruto: unknown): ResultadoLink {
  const r = EsquemaEstado.safeParse(bruto);
  if (!r.success) return { ok: false, erro: descreverProblema(r.error) };
  const estado = r.data as EstadoCompartilhado;
  try {
    estado.ofertas.forEach((o, i) => {
      try {
        validarOfertaCadastrada({ ...o, id: `link-${i + 1}` });
      } catch (e) {
        if (e instanceof OfertaInvalidaError) throw new OfertaInvalidaError(`Oferta ${i + 1}: ${e.message}`);
        throw e;
      }
    });
    validarRegraReinvestimento(estado.regra);
  } catch (e) {
    if (e instanceof OfertaInvalidaError) return { ok: false, erro: `${e.message}.` };
    throw e;
  }
  return { ok: true, estado };
}

// --- base64url e compressão ---

function paraBase64Url(bytes: Uint8Array): string {
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/** null se não for base64url válido. */
function deBase64Url(texto: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(texto) || texto.length % 4 === 1) return null;
  try {
    return Uint8Array.from(atob(texto.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Corta o prefixo (`c1.` ou `j1.`) pelo tamanho de quem bateu, não por um tamanho fixo dos dois. */
export function cortarPrefixo(fragmento: string, comprimido: boolean, prefixoComprimido: string, prefixoJson: string): string {
  return fragmento.slice((comprimido ? prefixoComprimido : prefixoJson).length);
}

const temCompressao = () => typeof CompressionStream === 'function';
const temDescompressao = () => typeof DecompressionStream === 'function';


/** Os bytes aos pedaços, um pedaço por leitura (sem adiantar): quem lê controla quanto entra no descompressor. */
function aosPedacos(bytes: Uint8Array, tamanho: number): ReadableStream<BufferSource> {
  let pos = 0;
  return new ReadableStream<BufferSource>({
    pull(ctl) {
      if (pos >= bytes.length) {
        ctl.close();
        return;
      }
      ctl.enqueue(bytes.slice(pos, pos + tamanho));
      pos += tamanho;
    },
  }, { highWaterMark: 0 });
}

/**
 * Lê o stream até o fim, aos pedaços, e devolve os bytes; null (e cancela o stream) assim que passar de `limite`.
 * Erro do stream (dado corrompido) propaga.
 */
export async function lerLimitado(stream: ReadableStream<Uint8Array>, limite: number): Promise<Uint8Array | null> {
  const leitor = stream.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) {
      await leitor.cancel().catch(() => undefined);
      return null;
    }
    partes.push(value);
  }
  const bytes = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    bytes.set(p, pos);
    pos += p.byteLength;
  }
  return bytes;
}

/** Sem `Blob.stream()` (o jsdom não tem): os bytes entram no compressor pelo mesmo leitor aos pedaços. */
async function comprimir(bytes: Uint8Array): Promise<Uint8Array> {
  const saida = aosPedacos(bytes, PEDACO_ENTRADA).pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(saida).arrayBuffer());
}

// --- o link no hash da URL: #comparar/c1.… ---

/** A aba que abre o link; o fragmento vai depois da `/` (ver `useAbaDaUrl`). */
export const ABA_DO_LINK = 'comparar';
const PREFIXO_HASH = `#${ABA_DO_LINK}/`;

/** O fragmento do link no hash (`#comparar/c1.…` → `c1.…`), sem validar; null se o hash não trouxer estado. */
export function lerEstadoDoHash(hash: string = location.hash): string | null {
  if (!hash.startsWith(PREFIXO_HASH)) return null;
  const fragmento = hash.slice(PREFIXO_HASH.length);
  return fragmento === '' ? null : fragmento;
}

/**
 * Troca `#comparar/c1.…` por `#comparar` com `replaceState`: o estado sai da barra (e do histórico) sem entrada
 * nova nem `hashchange`. Sem estado no hash, não mexe na URL.
 */
export function limparEstadoDoHash(): void {
  if (lerEstadoDoHash() === null) return;
  history.replaceState(history.state, '', `${location.pathname}${location.search}#${ABA_DO_LINK}`);
}

/** A URL para compartilhar: a página atual, sem a query, com `#comparar/` e o fragmento. */
export function urlCompartilhavel(fragmento: string): string {
  return `${location.origin}${location.pathname}${PREFIXO_HASH}${fragmento}`;
}

// --- API ---

/**
 * O fragmento do link: `c1.` + base64url(deflate-raw(JSON)); sem CompressionStream, `j1.` + base64url(JSON).
 * Só os campos conhecidos entram. Lança se o estado não passar na mesma validação de `decodificar`.
 */
export async function codificar(e: EstadoCompartilhado): Promise<string> {
  const estado = soEstado(e);
  const valido = validarEstado(estado);
  if (!valido.ok) throw new Error(`Estado inválido para o link: ${valido.erro}`);
  const json = new TextEncoder().encode(JSON.stringify(estado));
  const fragmento = temCompressao()
    ? PREFIXO_COMPRIMIDO + paraBase64Url(await comprimir(json))
    : PREFIXO_JSON + paraBase64Url(json);
  if (fragmento.length > LIMITE_FRAGMENTO) throw new Error(`O link passa do limite de ${LIMITE_FRAGMENTO} caracteres.`);
  return fragmento;
}

/** Lê um fragmento `c1.…` ou `j1.…`. Nunca lança: qualquer problema vira `{ ok: false, erro }`, e nada é aproveitado. */
export async function decodificar(fragmento: string): Promise<ResultadoLink> {
  if (fragmento.length > LIMITE_FRAGMENTO) return { ok: false, erro: `O link passa do limite de ${LIMITE_FRAGMENTO} caracteres.` };
  const comprimido = fragmento.startsWith(PREFIXO_COMPRIMIDO);
  if (!comprimido && !fragmento.startsWith(PREFIXO_JSON)) return { ok: false, erro: 'Formato de link desconhecido.' };
  const bytes = deBase64Url(cortarPrefixo(fragmento, comprimido, PREFIXO_COMPRIMIDO, PREFIXO_JSON));
  if (bytes === null) return { ok: false, erro: 'O link está corrompido (base64 inválido).' };

  let json = bytes;
  if (comprimido) {
    if (!temDescompressao()) return { ok: false, erro: 'Este navegador não consegue abrir links comprimidos.' };
    try {
      const saida = await lerLimitado(aosPedacos(bytes, PEDACO_ENTRADA).pipeThrough(new DecompressionStream('deflate-raw')), LIMITE_DESCOMPRIMIDO);
      if (saida === null) return { ok: false, erro: 'O link passa do limite de 64 KB descomprimido.' };
      json = saida;
    } catch {
      return { ok: false, erro: 'O link está corrompido (não descomprime).' };
    }
  }
  if (json.byteLength > LIMITE_DESCOMPRIMIDO) return { ok: false, erro: 'O link passa do limite de 64 KB descomprimido.' };

  let bruto: unknown;
  try {
    bruto = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(json));
  } catch {
    return { ok: false, erro: 'O link está corrompido (JSON inválido).' };
  }
  try {
    return validarEstado(bruto);
  } catch {
    return { ok: false, erro: 'O link não está no formato de comparação do Rende.' };
  }
}

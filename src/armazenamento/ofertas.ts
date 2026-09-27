// Ofertas cadastradas: localStorage e exportar/importar JSON, sempre validados por esquema (spec §5.8 e §7.2).
import { z } from '../zod';
import type { Armazenamento } from '../dados/cache';
import { ehDataValida } from '../engine/datas';
import { OfertaInvalidaError } from '../engine/erros';
import { validarOfertaCadastrada, type OfertaCadastrada } from '../engine/ofertas';
import { PERCENTUAL_CDI_MAXIMO } from '../engine/produtos';

export const CHAVE_OFERTAS = 'rende:ofertas:v1';
export const LIMITE_OFERTAS = 30;
export const LIMITE_CARACTERES_IMPORTACAO = 100_000;
const LIMITE_TEXTO = 80;

const DataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(ehDataValida);
const taxaAnual = z.number().gt(-1);

const EsquemaIndexacao = z.discriminatedUnion('tipo', [
  z.strictObject({ tipo: z.literal('POS_CDI'), percentualCDI: z.number().gt(0).max(PERCENTUAL_CDI_MAXIMO) }),
  z.strictObject({ tipo: z.literal('PRE'), taxaAA: taxaAnual }),
  z.strictObject({ tipo: z.literal('IPCA_MAIS'), taxaRealAA: taxaAnual }),
  z.strictObject({ tipo: z.literal('SELIC') }),
  z.strictObject({ tipo: z.literal('POUPANCA') }),
]);

const camposOferta = {
  produto: z.enum(['CDB', 'RDB', 'LC', 'LCI', 'LCA', 'TESOURO_SELIC', 'TESOURO_PREFIXADO', 'TESOURO_IPCA', 'POUPANCA']),
  indexacao: EsquemaIndexacao,
  // Texto livre: a renderização escapa (Preact, sem innerHTML), então "<script>" fica só como texto.
  emissor: z.string().max(LIMITE_TEXTO),
  conglomerado: z.string().max(LIMITE_TEXTO),
  vencimento: DataIso.optional(),
  liquidez: z.enum(['DIARIA', 'NO_VENCIMENTO']),
};

const EsquemaOferta = z.strictObject({ id: z.string().min(1).max(LIMITE_TEXTO), ...camposOferta });
/** No arquivo importado o id é opcional: as ofertas sempre recebem ids novos. */
const EsquemaOfertaImportada = z.strictObject({ id: z.string().max(LIMITE_TEXTO).optional(), ...camposOferta });
const EsquemaArquivo = z.strictObject({
  versao: z.literal(1),
  exportadoEm: z.string().max(40),
  ofertas: z.array(z.unknown()),
});

/** A oferta passa no esquema e nas regras do engine? */
function valida(o: OfertaCadastrada): boolean {
  try {
    validarOfertaCadastrada(o);
    return true;
  } catch (e) {
    if (e instanceof OfertaInvalidaError) return false;
    throw e;
  }
}

/** Ofertas salvas; as inválidas (e ids repetidos) são descartadas uma a uma. Storage indisponível ou corrompido → lista vazia. */
export function lerOfertas(arm: Armazenamento): OfertaCadastrada[] {
  try {
    const bruto = arm.getItem(CHAVE_OFERTAS);
    if (bruto === null) return [];
    const lista: unknown = JSON.parse(bruto);
    if (!Array.isArray(lista)) return [];
    const ids = new Set<string>();
    return lista.slice(0, LIMITE_OFERTAS).flatMap((item) => {
      const r = EsquemaOferta.safeParse(item);
      if (!r.success || !valida(r.data) || ids.has(r.data.id)) return [];
      ids.add(r.data.id);
      return [r.data];
    });
  } catch {
    return [];
  }
}

/** Grava as ofertas; false se o storage recusar (cheio ou bloqueado). */
export function salvarOfertas(arm: Armazenamento, ofertas: readonly OfertaCadastrada[]): boolean {
  try {
    arm.setItem(CHAVE_OFERTAS, JSON.stringify(ofertas));
    return true;
  } catch {
    return false;
  }
}

export function exportarOfertas(ofertas: readonly OfertaCadastrada[], agoraMs: number): string {
  return JSON.stringify({ versao: 1, exportadoEm: new Date(agoraMs).toISOString(), ofertas }, null, 2);
}

export type ResultadoImportacao = { ok: true; ofertas: OfertaCadastrada[] } | { ok: false; erro: string };

function descreverProblema(n: number, erro: z.ZodError): string {
  const problema = erro.issues[0];
  if (problema?.code === 'unrecognized_keys') {
    const campos = problema.keys.map((k) => `"${k}"`).join(', ');
    return `Oferta ${n}: campo não reconhecido (${campos}).`;
  }
  const caminho = problema?.path.map(String).join('.') ?? '';
  return caminho === '' ? `Oferta ${n}: formato inválido.` : `Oferta ${n}: o campo "${caminho}" está inválido.`;
}

/**
 * Lê um arquivo exportado pelo Rende. Tudo ou nada: qualquer problema rejeita o arquivo inteiro, com a
 * mensagem, e nada é aproveitado pela metade. As ofertas recebem ids novos.
 */
export function importarOfertas(texto: string, gerarId: () => string): ResultadoImportacao {
  if (texto.length > LIMITE_CARACTERES_IMPORTACAO) return { ok: false, erro: 'O arquivo passa do limite de 100 mil caracteres.' };
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return { ok: false, erro: 'O arquivo não é um JSON válido.' };
  }
  const arquivo = EsquemaArquivo.safeParse(json);
  if (!arquivo.success) return { ok: false, erro: 'O arquivo não está no formato de exportação do Rende.' };
  const itens = arquivo.data.ofertas;
  if (itens.length > LIMITE_OFERTAS) return { ok: false, erro: `O arquivo tem ${itens.length} ofertas; o limite é ${LIMITE_OFERTAS} ofertas.` };
  const ofertas: OfertaCadastrada[] = [];
  for (const [i, item] of itens.entries()) {
    const r = EsquemaOfertaImportada.safeParse(item);
    if (!r.success) return { ok: false, erro: descreverProblema(i + 1, r.error) };
    const oferta: OfertaCadastrada = { ...r.data, id: gerarId() };
    try {
      validarOfertaCadastrada(oferta);
    } catch (e) {
      if (!(e instanceof OfertaInvalidaError)) throw e;
      return { ok: false, erro: `Oferta ${i + 1}: ${e.message}.` };
    }
    ofertas.push(oferta);
  }
  return { ok: true, ofertas };
}

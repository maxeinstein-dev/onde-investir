// Ofertas cadastradas no localStorage, validadas por esquema (spec §5.8 e §7.2). O arquivo exportado: armazenamento/arquivo.
import { z } from '../zod';
import type { Armazenamento } from '../dados/cache';
import { ehDataValida } from '../engine/datas';
import { OfertaInvalidaError } from '../engine/erros';
import { validarOfertaCadastrada, type OfertaCadastrada } from '../engine/ofertas';
import { PERCENTUAL_CDI_MAXIMO } from '../engine/produtos';

export const CHAVE_OFERTAS = 'rende:ofertas:v1';
export const LIMITE_OFERTAS = 30;
export const LIMITE_TEXTO = 80;

export const DataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(ehDataValida);
const taxaAnual = z.number().gt(-1);

const EsquemaIndexacao = z.discriminatedUnion('tipo', [
  z.strictObject({ tipo: z.literal('POS_CDI'), percentualCDI: z.number().gt(0).max(PERCENTUAL_CDI_MAXIMO) }),
  z.strictObject({ tipo: z.literal('PRE'), taxaAA: taxaAnual }),
  z.strictObject({ tipo: z.literal('IPCA_MAIS'), taxaRealAA: taxaAnual }),
  z.strictObject({ tipo: z.literal('SELIC') }),
  z.strictObject({ tipo: z.literal('POUPANCA') }),
]);

/** Os campos da oferta cadastrada, sem o id: as posições (armazenamento/posicoes) têm os mesmos. */
export const camposOferta = {
  produto: z.enum(['CDB', 'RDB', 'LC', 'LCI', 'LCA', 'TESOURO_SELIC', 'TESOURO_PREFIXADO', 'TESOURO_IPCA', 'POUPANCA']),
  indexacao: EsquemaIndexacao,
  // Texto livre: a renderização escapa (Preact, sem innerHTML), então "<script>" fica só como texto.
  emissor: z.string().max(LIMITE_TEXTO),
  conglomerado: z.string().max(LIMITE_TEXTO),
  vencimento: DataIso.optional(),
  liquidez: z.enum(['DIARIA', 'NO_VENCIMENTO']),
  // A faixa (0 a 5% a.a.) fica com validarOfertaCadastrada, que dá a mensagem.
  custoExtraAA: z.number().optional(),
};

const EsquemaOferta = z.strictObject({ id: z.string().min(1).max(LIMITE_TEXTO), ...camposOferta });

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

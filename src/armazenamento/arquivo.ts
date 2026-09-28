// O arquivo JSON de exportação e importação (spec §5.8 e §7.2): v2 com ofertas e posições; a importação aceita a v1.
import { z } from '../zod';
import type { DataISO } from '../engine/datas';
import { OfertaInvalidaError } from '../engine/erros';
import { validarOfertaCadastrada, type OfertaCadastrada } from '../engine/ofertas';
import { validarPosicao, type Posicao } from '../engine/posicoes';
import { LIMITE_OFERTAS, LIMITE_TEXTO, camposOferta } from './ofertas';
import { LIMITE_POSICOES, camposPosicao } from './posicoes';

export const LIMITE_CARACTERES_IMPORTACAO = 100_000;

/** No arquivo importado o id é opcional: ofertas e posições sempre recebem ids novos. */
const idOpcional = z.string().max(LIMITE_TEXTO).optional();
const EsquemaOfertaImportada = z.strictObject({ id: idOpcional, ...camposOferta });
const EsquemaPosicaoImportada = z.strictObject({ id: idOpcional, ...camposPosicao });

const exportadoEm = z.string().max(40);
/** v1: só as ofertas (até o M2). v2: ofertas e posições (M3a). */
const EsquemaArquivo = z.discriminatedUnion('versao', [
  z.strictObject({ versao: z.literal(1), exportadoEm, ofertas: z.array(z.unknown()) }),
  z.strictObject({ versao: z.literal(2), exportadoEm, ofertas: z.array(z.unknown()), posicoes: z.array(z.unknown()) }),
]);

/** O arquivo v2. As posições vão no arquivo, que fica com a pessoa; nunca no link compartilhável (M3c). */
export function exportarDados(ofertas: readonly OfertaCadastrada[], posicoes: readonly Posicao[], agoraMs: number): string {
  return JSON.stringify({ versao: 2, exportadoEm: new Date(agoraMs).toISOString(), ofertas, posicoes }, null, 2);
}

export type ResultadoImportacao = { ok: true; ofertas: OfertaCadastrada[]; posicoes: Posicao[] } | { ok: false; erro: string };

function descreverProblema(rotulo: string, erro: z.ZodError): string {
  const problema = erro.issues[0];
  if (problema?.code === 'unrecognized_keys') {
    const campos = problema.keys.map((k) => `"${k}"`).join(', ');
    return `${rotulo}: campo não reconhecido (${campos}).`;
  }
  const caminho = problema?.path.map(String).join('.') ?? '';
  return caminho === '' ? `${rotulo}: formato inválido.` : `${rotulo}: o campo "${caminho}" está inválido.`;
}

/**
 * Valida os itens um a um, pelo esquema e pela regra do engine, com id novo. O primeiro problema devolve a mensagem
 * ("Oferta 2: ..."), e nada é aproveitado.
 */
function importarItens<T extends { id: string }>(
  itens: readonly unknown[], rotulo: string, esquema: z.ZodType<Omit<T, 'id'> & { id?: string | undefined }>,
  gerarId: () => string, validar: (item: T) => void,
): { ok: true; itens: T[] } | { ok: false; erro: string } {
  const resultado: T[] = [];
  for (const [i, item] of itens.entries()) {
    const r = esquema.safeParse(item);
    if (!r.success) return { ok: false, erro: descreverProblema(`${rotulo} ${i + 1}`, r.error) };
    const novo = { ...r.data, id: gerarId() } as T;
    try {
      validar(novo);
    } catch (e) {
      if (!(e instanceof OfertaInvalidaError)) throw e;
      return { ok: false, erro: `${rotulo} ${i + 1}: ${e.message}.` };
    }
    resultado.push(novo);
  }
  return { ok: true, itens: resultado };
}

/**
 * Lê um arquivo exportado pelo Rende, v1 (só ofertas) ou v2 (ofertas e posições). Tudo ou nada: qualquer problema
 * rejeita o arquivo inteiro, com a mensagem, e nada é aproveitado pela metade. Ofertas e posições recebem ids
 * novos; as posições são validadas no dia `hoje`.
 */
export function importarDados(texto: string, opcoes: {
  hoje: DataISO; gerarIdOferta: () => string; gerarIdPosicao: () => string;
}): ResultadoImportacao {
  if (texto.length > LIMITE_CARACTERES_IMPORTACAO) return { ok: false, erro: 'O arquivo passa do limite de 100 mil caracteres.' };
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return { ok: false, erro: 'O arquivo não é um JSON válido.' };
  }
  const arquivo = EsquemaArquivo.safeParse(json);
  if (!arquivo.success) return { ok: false, erro: 'O arquivo não está no formato de exportação do Rende.' };
  const brutasOfertas = arquivo.data.ofertas;
  const brutasPosicoes = arquivo.data.versao === 2 ? arquivo.data.posicoes : [];
  if (brutasOfertas.length > LIMITE_OFERTAS) {
    return { ok: false, erro: `O arquivo tem ${brutasOfertas.length} ofertas; o limite é ${LIMITE_OFERTAS} ofertas.` };
  }
  if (brutasPosicoes.length > LIMITE_POSICOES) {
    return { ok: false, erro: `O arquivo tem ${brutasPosicoes.length} posições; o limite é ${LIMITE_POSICOES} posições.` };
  }
  const ofertas = importarItens<OfertaCadastrada>(brutasOfertas, 'Oferta', EsquemaOfertaImportada, opcoes.gerarIdOferta, validarOfertaCadastrada);
  if (!ofertas.ok) return ofertas;
  const posicoes = importarItens<Posicao>(brutasPosicoes, 'Posição', EsquemaPosicaoImportada, opcoes.gerarIdPosicao, (p) => validarPosicao(p, opcoes.hoje));
  if (!posicoes.ok) return posicoes;
  return { ok: true, ofertas: ofertas.itens, posicoes: posicoes.itens };
}

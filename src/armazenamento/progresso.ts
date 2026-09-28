// O progresso da trilha "Aprender" (plano M3c, C1): lições concluídas, taxa de acerto dos palpites, dicas
// dispensadas e o número de visitas (para o "Você sabia?"). Validado por esquema (spec §7.2), parte a parte.
import { z } from '../zod';
import type { Armazenamento } from '../dados/cache';
import type { IdLicao } from '../conteudo/licoes/tipos';

export const CHAVE_PROGRESSO = 'rende:progresso:v1';

/** Os ids das lições, sem importar o conteúdo delas (o teste confere que batem com a trilha). */
export const IDS_LICAO = [
  'renda-fixa', 'indexadores', 'impostos', 'fgc', 'liquidez', 'marcacao-mercado',
  'reserva', 'reaplicacao', 'diversificacao', 'renda-variavel',
] as const satisfies readonly IdLicao[];

export interface Progresso {
  concluidas: readonly IdLicao[];
  palpites: { acertos: number; total: number };
  dicasDispensadas: readonly string[];
  visitas: number;
}

export const PROGRESSO_VAZIO: Progresso = { concluidas: [], palpites: { acertos: 0, total: 0 }, dicasDispensadas: [], visitas: 0 };

const MAX_DICAS = 50;
const LIMITE_ID_DICA = 80;

const EsquemaId = z.enum(IDS_LICAO);
const EsquemaDica = z.string().min(1).max(LIMITE_ID_DICA);
const inteiro = z.number().int().min(0);
const EsquemaPalpites = z.strictObject({ acertos: inteiro, total: inteiro }).refine((p) => p.acertos <= p.total);

/** Os itens válidos da lista, sem repetidos; o que não passa no esquema sai sozinho. */
function itensValidos<T>(bruto: unknown, esquema: z.ZodType<T>, maximo: number): T[] {
  if (!Array.isArray(bruto)) return [];
  const saida: T[] = [];
  for (const item of bruto) {
    const r = esquema.safeParse(item);
    if (r.success && !saida.includes(r.data)) saida.push(r.data);
    if (saida.length >= maximo) break;
  }
  return saida;
}

/** Storage indisponível ou corrompido → o vazio. Cada parte inválida volta ao padrão sem apagar as outras. */
export function lerProgresso(arm: Armazenamento): Progresso {
  let bruto: unknown;
  try {
    const texto = arm.getItem(CHAVE_PROGRESSO);
    if (texto === null) return PROGRESSO_VAZIO;
    bruto = JSON.parse(texto);
  } catch {
    return PROGRESSO_VAZIO;
  }
  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) return PROGRESSO_VAZIO;
  const obj = bruto as Record<string, unknown>;
  const palpites = EsquemaPalpites.safeParse(obj.palpites);
  const visitas = inteiro.safeParse(obj.visitas);
  return {
    concluidas: itensValidos(obj.concluidas, EsquemaId, IDS_LICAO.length),
    palpites: palpites.success ? palpites.data : PROGRESSO_VAZIO.palpites,
    dicasDispensadas: itensValidos(obj.dicasDispensadas, EsquemaDica, MAX_DICAS),
    visitas: visitas.success ? visitas.data : 0,
  };
}

/** false se o storage recusar (cheio ou bloqueado). */
export function salvarProgresso(arm: Armazenamento, p: Progresso): boolean {
  try {
    arm.setItem(CHAVE_PROGRESSO, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

export function marcarConcluida(p: Progresso, id: IdLicao, concluida: boolean): Progresso {
  const sem = p.concluidas.filter((x) => x !== id);
  return { ...p, concluidas: concluida ? [...sem, id] : sem };
}

export function registrarPalpite(p: Progresso, acertou: boolean): Progresso {
  return { ...p, palpites: { acertos: p.palpites.acertos + (acertou ? 1 : 0), total: p.palpites.total + 1 } };
}

export function dispensarDica(p: Progresso, id: string): Progresso {
  return p.dicasDispensadas.includes(id) ? p : { ...p, dicasDispensadas: [...p.dicasDispensadas, id].slice(-MAX_DICAS) };
}

export function contarVisita(p: Progresso): Progresso {
  return { ...p, visitas: p.visitas + 1 };
}

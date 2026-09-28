// src/conteudo/licoes/index.ts
// A trilha "Aprender", na ordem. RASCUNHO: passa pelo /vozmax e pela revisão do usuário (plano M3c, D1).
import { DIVERSIFICACAO } from './diversificacao';
import { FGC } from './fgc';
import { IMPOSTOS } from './impostos';
import { INDEXADORES } from './indexadores';
import { LIQUIDEZ } from './liquidez';
import { MARCACAO_MERCADO } from './marcacaoMercado';
import { REAPLICACAO } from './reaplicacao';
import { RENDA_FIXA } from './rendaFixa';
import { RENDA_VARIAVEL } from './rendaVariavel';
import { RESERVA } from './reserva';
import type { IdLicao, Licao } from './tipos';

export const LICOES: readonly Licao[] = [
  RENDA_FIXA, INDEXADORES, IMPOSTOS, FGC, LIQUIDEZ, MARCACAO_MERCADO, RESERVA, REAPLICACAO, DIVERSIFICACAO, RENDA_VARIAVEL,
];

/** A lição pelo id (sempre existe: o teste de integridade confere que há uma para cada id). */
export function licaoPorId(id: IdLicao): Licao | undefined {
  return LICOES.find((l) => l.id === id);
}

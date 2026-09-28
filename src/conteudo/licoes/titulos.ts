// src/conteudo/licoes/titulos.ts
// Só os títulos das lições (spec §6), fora do chunk pesado do conteúdo completo (seções, fontes longas): o link
// "Ver lição" nas dicas, no "Você sabia?" e nos alertas (LinkLicao) usa só isto, sem puxar as 10 lições inteiras
// para o bundle principal (elas ficam no chunk carregado sob demanda por useConteudoAprender). Um teste de
// integridade (tests/conteudo/licoes.test.ts) confere que bate com o título de cada lição.
import type { IdLicao } from './tipos';

export const TITULOS_LICOES: Record<IdLicao, string> = {
  'renda-fixa': 'Como funciona a renda fixa',
  indexadores: 'Indexadores: CDI, Selic, IPCA e prefixado',
  impostos: 'IR regressivo e IOF',
  fgc: 'FGC e garantias',
  liquidez: 'Liquidez e prazo mínimo',
  'marcacao-mercado': 'Marcação a mercado no Tesouro',
  reserva: 'Reserva de emergência',
  reaplicacao: 'Reaplicação e o IR que recomeça',
  diversificacao: 'Diversificação',
  'renda-variavel': 'Renda variável',
};

/** Os ids de todas as lições, na ordem (1..10), sem carregar o conteúdo completo. */
export const ID_LICOES: readonly IdLicao[] = [
  'renda-fixa', 'indexadores', 'impostos', 'fgc', 'liquidez', 'marcacao-mercado', 'reserva', 'reaplicacao',
  'diversificacao', 'renda-variavel',
];

/** true se `id` for de uma lição de verdade, sem carregar o conteúdo completo (para validar o hash). */
export function idLicaoValido(id: string): id is IdLicao {
  return (ID_LICOES as readonly string[]).includes(id);
}

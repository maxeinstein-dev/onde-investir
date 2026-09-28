// Espelha tests/seguranca/linkSemPosicoes.test.ts: objetivos são dados pessoais (gasto mensal,
// metas) e nunca podem vazar para quem abre um link compartilhado.
import { describe, expect, it } from 'vitest';
import { codificar, decodificar, type EstadoCompartilhado } from '../../src/armazenamento/link';
import { PREMISSAS_PADRAO } from '../../src/engine/projecao';

// ESTADO_BASE copiado de tests/armazenamento/link.test.ts, para os tipos de Premissas/ValoresManuais
// baterem com os do projeto.
const CDB = {
  produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.1 }, emissor: 'Banco Alfa', conglomerado: 'Alfa',
  vencimento: '2028-09-28', liquidez: 'NO_VENCIMENTO',
} as const;
const LCI = {
  produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.92 }, emissor: 'Banco Beta', conglomerado: 'Beta',
  vencimento: '2028-09-28', liquidez: 'NO_VENCIMENTO',
} as const;

const ESTADO_BASE: EstadoCompartilhado = {
  versao: 1,
  ofertas: [CDB, LCI],
  valor: 10000,
  dataAplicacao: '2026-09-28',
  regra: { tipo: 'PADRAO' },
  cenario: {
    escolha: 'MANUAL', premissas: PREMISSAS_PADRAO, manual: { cdi: 14.15, selicMeta: 15, ipca: 5, tr: 0.2 },
  },
};

describe('link nunca leva objetivos', () => {
  it('o tipo EstadoCompartilhado não tem campo objetivos', () => {
    // Prova de tipo: se alguém adicionar `objetivos` a EstadoCompartilhado sem querer, isto não
    // pega sozinho (TS não impede campo a mais em objeto literal sem "as"), então o teste abaixo
    // é a prova de execução.
    expect(Object.keys(ESTADO_BASE)).not.toContain('objetivos');
  });

  it('um estado com objetivos "encostado" por engano nunca aparece no link nem no decodificado', async () => {
    const comObjetivosDemais = { ...ESTADO_BASE, objetivos: [{ id: 'x', entradas: { tipo: 'RESERVA', gastoMensal: 9999 } }] } as unknown as EstadoCompartilhado;
    const fragmento = await codificar(comObjetivosDemais);
    expect(fragmento).not.toMatch(/objetiv/i);
    expect(fragmento).not.toMatch(/9999/);
    const resultado = await decodificar(fragmento);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect('objetivos' in resultado.estado).toBe(false);
  });
});

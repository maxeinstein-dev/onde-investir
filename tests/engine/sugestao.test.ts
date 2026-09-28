import { describe, expect, it } from 'vitest';
import { OfertaInvalidaError } from '../../src/engine/erros';
import type { ItemFGC } from '../../src/engine/fgc';
import type { OfertaCadastrada } from '../../src/engine/ofertas';
import { casarComCatalogo, validarObjetivo, valorAlvo, type Fatia, type Objetivo } from '../../src/engine/sugestao';

const HOJE = '2026-09-29';

describe('valorAlvo', () => {
  it('reserva: gasto × 6 (estável) ou × 12 (variável)', () => {
    expect(valorAlvo({ tipo: 'RESERVA', gastoMensal: 3000, rendaEstavel: true })).toBe(18000);
    expect(valorAlvo({ tipo: 'RESERVA', gastoMensal: 3000, rendaEstavel: false })).toBe(36000);
  });
  it('com data: o próprio valor-alvo', () => {
    expect(valorAlvo({ tipo: 'COM_DATA', valorAlvo: 50000, data: '2028-01-01' })).toBe(50000);
  });
  it('longo prazo e sem objetivo: sem valor-alvo (só horizonte)', () => {
    expect(valorAlvo({ tipo: 'LONGO_PRAZO', horizonteAnos: 15 })).toBeNull();
    expect(valorAlvo({ tipo: 'SEM_OBJETIVO', horizonteAnos: 3 })).toBeNull();
  });
});

describe('validarObjetivo', () => {
  it('reserva: gasto mensal precisa ser positivo', () => {
    expect(() => validarObjetivo({ tipo: 'RESERVA', gastoMensal: 0, rendaEstavel: true }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ tipo: 'RESERVA', gastoMensal: Number.NaN, rendaEstavel: true }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ tipo: 'RESERVA', gastoMensal: 2000, rendaEstavel: true }, HOJE)).not.toThrow();
  });
  it('com data: valor positivo, data válida e no futuro', () => {
    const base: Objetivo = { tipo: 'COM_DATA', valorAlvo: 1000, data: '2028-01-01' };
    expect(() => validarObjetivo({ ...base, valorAlvo: 0 }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ ...base, data: '2026-13-01' }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ ...base, data: '2026-01-01' }, HOJE)).toThrow(OfertaInvalidaError); // no passado
    expect(() => validarObjetivo({ ...base, data: HOJE }, HOJE)).toThrow(OfertaInvalidaError); // hoje não é "no futuro"
    expect(() => validarObjetivo(base, HOJE)).not.toThrow();
  });
  it('longo prazo e sem objetivo: horizonte inteiro maior que zero', () => {
    expect(() => validarObjetivo({ tipo: 'LONGO_PRAZO', horizonteAnos: 0 }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ tipo: 'LONGO_PRAZO', horizonteAnos: 5.5 }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ tipo: 'SEM_OBJETIVO', horizonteAnos: 10 }, HOJE)).not.toThrow();
  });
});

const catalogoBase = (over: Partial<OfertaCadastrada> = {}): OfertaCadastrada => ({
  id: 'o1', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 },
  emissor: 'Banco X', conglomerado: 'Banco X', liquidez: 'DIARIA', ...over,
});
const fatiaBase = (over: Partial<Fatia> = {}): Fatia => ({
  produto: 'CDB', indexacaoTipo: 'POS_CDI', percentual: 1, motivo: 'SEM_OBJETIVO_POS', garantia: 'FGC', valor: 10000, ...over,
});
const carteiraItem = (conglomerado: string, valor: number, vencimento?: string): ItemFGC => ({
  conglomerado, produto: 'CDB', vencimento, brutoEm: () => valor,
});

describe('casarComCatalogo', () => {
  it('acha a primeira oferta compatível (produto + tipo de indexação)', () => {
    const catalogo = [catalogoBase({ id: 'a', produto: 'LCI' }), catalogoBase({ id: 'b' })];
    const [f] = casarComCatalogo([fatiaBase()], catalogo, [], HOJE);
    expect(f?.ofertaCatalogo?.id).toBe('b');
  });
  it('sem oferta compatível, fica sem ofertaCatalogo e sem fgc', () => {
    const [f] = casarComCatalogo([fatiaBase()], [], [], HOJE);
    expect(f?.ofertaCatalogo).toBeUndefined();
    expect(f?.fgc).toBeUndefined();
  });
  it('liquidezDiaria=true só casa com ofertas de liquidez diária', () => {
    const catalogo = [catalogoBase({ liquidez: 'NO_VENCIMENTO', vencimento: '2030-01-01' })];
    const [f] = casarComCatalogo([fatiaBase()], catalogo, [], HOJE, { liquidezDiaria: true });
    expect(f?.ofertaCatalogo).toBeUndefined();
  });
  it('soma com a carteira do mesmo conglomerado (normalizado) e alerta ao passar do limite', () => {
    const catalogo = [catalogoBase({ conglomerado: 'Banco  X' })]; // com espaço extra, mesmo conglomerado normalizado
    const carteira = [carteiraItem('BANCO X', 240000)];
    const [f] = casarComCatalogo([fatiaBase({ valor: 20000 })], catalogo, carteira, HOJE);
    expect(f?.fgc).toEqual({ conglomerado: 'Banco  X', excedente: 10000 }); // 240000 + 20000 − 250000
  });
  it('abaixo do limite, sem alerta', () => {
    const catalogo = [catalogoBase()];
    const carteira = [carteiraItem('Banco X', 100000)];
    const [f] = casarComCatalogo([fatiaBase({ valor: 20000 })], catalogo, carteira, HOJE);
    expect(f?.fgc).toBeUndefined();
  });
  it('fatia sem garantia FGC (Tesouro) nunca gera aviso de FGC', () => {
    const catalogo = [catalogoBase({ produto: 'TESOURO_SELIC', indexacao: { tipo: 'SELIC' }, vencimento: '2030-01-01' })];
    const carteira = [carteiraItem('Banco X', 500000)]; // outro conglomerado (Tesouro não soma com CDB de banco)
    const [f] = casarComCatalogo(
      [fatiaBase({ produto: 'TESOURO_SELIC', indexacaoTipo: 'SELIC', garantia: 'TESOURO_NACIONAL', valor: 500000 })],
      catalogo, carteira, HOJE,
    );
    expect(f?.fgc).toBeUndefined();
  });
  it('valor null (longo prazo, sem objetivo): nunca gera aviso de FGC', () => {
    const catalogo = [catalogoBase()];
    const carteira = [carteiraItem('Banco X', 260000)];
    const [f] = casarComCatalogo([fatiaBase({ valor: null })], catalogo, carteira, HOJE);
    expect(f?.fgc).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { OfertaInvalidaError } from '../../src/engine/erros';
import type { ItemFGC } from '../../src/engine/fgc';
import type { OfertaCadastrada } from '../../src/engine/ofertas';
import {
  casarComCatalogo, sugerir, validarObjetivo, valorAlvo,
  type ContextoSugestao, type Fatia, type Objetivo,
} from '../../src/engine/sugestao';

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

const ctx = (over: Partial<ContextoSugestao> = {}): ContextoSugestao => ({ catalogo: [], carteira: [], hoje: HOJE, ...over });

describe('sugerir — RESERVA', () => {
  it('duas fatias: 50% Tesouro Selic + 50% CDB pós liquidez diária, somando o valor-alvo', () => {
    const fatias = sugerir({ tipo: 'RESERVA', gastoMensal: 2000, rendaEstavel: true }, ctx());
    expect(fatias).toHaveLength(2);
    expect(fatias[0]).toMatchObject({ produto: 'TESOURO_SELIC', indexacaoTipo: 'SELIC', percentual: 0.5, motivo: 'RESERVA_TESOURO_SELIC', garantia: 'TESOURO_NACIONAL', valor: 6000 });
    expect(fatias[1]).toMatchObject({ produto: 'CDB', indexacaoTipo: 'POS_CDI', percentual: 0.5, motivo: 'RESERVA_CDB_LIQUIDEZ', garantia: 'FGC', valor: 6000 });
    expect(fatias.reduce((s, f) => s + f.percentual, 0)).toBeCloseTo(1, 10);
  });
  it('só casa com CDB de liquidez diária no catálogo', () => {
    const catalogo = [
      { id: 'a', produto: 'CDB' as const, indexacao: { tipo: 'POS_CDI' as const, percentualCDI: 1 }, emissor: 'Y', conglomerado: 'Y', liquidez: 'NO_VENCIMENTO' as const, vencimento: '2030-01-01' },
      { id: 'b', produto: 'CDB' as const, indexacao: { tipo: 'POS_CDI' as const, percentualCDI: 1.1 }, emissor: 'Z', conglomerado: 'Z', liquidez: 'DIARIA' as const },
    ];
    const fatias = sugerir({ tipo: 'RESERVA', gastoMensal: 1000, rendaEstavel: true }, ctx({ catalogo }));
    expect(fatias[1]?.ofertaCatalogo?.id).toBe('b');
  });
});

describe('sugerir — LONGO_PRAZO', () => {
  it('duas fatias pela faixa do horizonte, sem valor (não há valor-alvo)', () => {
    const fatias = sugerir({ tipo: 'LONGO_PRAZO', horizonteAnos: 15 }, ctx());
    expect(fatias).toEqual([
      { produto: 'TESOURO_IPCA', indexacaoTipo: 'IPCA_MAIS', percentual: 0.7, motivo: 'LONGO_PRAZO_IPCA', garantia: 'TESOURO_NACIONAL', valor: null, ofertaCatalogo: undefined, fgc: undefined },
      { produto: 'CDB', indexacaoTipo: 'POS_CDI', percentual: 0.3, motivo: 'LONGO_PRAZO_POS', garantia: 'FGC', valor: null, ofertaCatalogo: undefined, fgc: undefined },
    ]);
  });
});

describe('sugerir — COM_DATA', () => {
  const objetivo = { tipo: 'COM_DATA' as const, valorAlvo: 50000, data: '2029-06-01' };

  it('sem catálogo, cai no pós-fixado genérico de fallback', () => {
    const [f] = sugerir(objetivo, ctx());
    expect(f).toMatchObject({ produto: 'CDB', indexacaoTipo: 'POS_CDI', percentual: 1, motivo: 'DATA_SEM_CASAMENTO', garantia: 'FGC', valor: 50000 });
  });

  it('casa com o vencimento mais próximo, sem passar da data', () => {
    const catalogo = [
      { id: 'longe', produto: 'TESOURO_PREFIXADO' as const, indexacao: { tipo: 'PRE' as const, taxaAA: 0.12 }, emissor: 'Tesouro', conglomerado: 'Tesouro', liquidez: 'DIARIA' as const, vencimento: '2035-01-01' },
      { id: 'certo', produto: 'CDB' as const, indexacao: { tipo: 'PRE' as const, taxaAA: 0.13 }, emissor: 'Banco Y', conglomerado: 'Banco Y', liquidez: 'NO_VENCIMENTO' as const, vencimento: '2029-05-15' },
      { id: 'passa', produto: 'CDB' as const, indexacao: { tipo: 'POS_CDI' as const, percentualCDI: 1 }, emissor: 'Banco Z', conglomerado: 'Banco Z', liquidez: 'NO_VENCIMENTO' as const, vencimento: '2029-07-01' }, // depois da data-alvo, não serve
    ];
    const [f] = sugerir(objetivo, ctx({ catalogo }));
    expect(f?.ofertaCatalogo?.id).toBe('certo');
    expect(f).toMatchObject({ produto: 'CDB', indexacaoTipo: 'PRE', motivo: 'DATA_VENCIMENTO_CASADO', garantia: 'FGC', valor: 50000 });
  });

  it('entre duas ofertas que casam, escolhe a de vencimento mais próximo da data', () => {
    const catalogo = [
      { id: 'longe', produto: 'CDB' as const, indexacao: { tipo: 'PRE' as const, taxaAA: 0.1 }, emissor: 'A', conglomerado: 'A', liquidez: 'NO_VENCIMENTO' as const, vencimento: '2029-01-01' },
      { id: 'perto', produto: 'CDB' as const, indexacao: { tipo: 'PRE' as const, taxaAA: 0.1 }, emissor: 'B', conglomerado: 'B', liquidez: 'NO_VENCIMENTO' as const, vencimento: '2029-05-30' },
    ];
    const [f] = sugerir(objetivo, ctx({ catalogo }));
    expect(f?.ofertaCatalogo?.id).toBe('perto');
  });

  it('gera aviso de FGC quando o valor-alvo somado à carteira passa do limite', () => {
    const catalogo = [{ id: 'a', produto: 'CDB' as const, indexacao: { tipo: 'PRE' as const, taxaAA: 0.1 }, emissor: 'Banco X', conglomerado: 'Banco X', liquidez: 'NO_VENCIMENTO' as const, vencimento: '2029-05-01' }];
    const carteira: ItemFGC[] = [{ conglomerado: 'Banco X', produto: 'CDB', brutoEm: () => 210000 }];
    const [f] = sugerir(objetivo, ctx({ catalogo, carteira }));
    expect(f?.fgc).toEqual({ conglomerado: 'Banco X', excedente: 10000 }); // 210000 + 50000 − 250000
  });
});

describe('sugerir — SEM_OBJETIVO', () => {
  it('até 1 ano: 100% pós-fixado', () => {
    const fatias = sugerir({ tipo: 'SEM_OBJETIVO', horizonteAnos: 1 }, ctx());
    expect(fatias).toEqual([{ produto: 'CDB', indexacaoTipo: 'POS_CDI', percentual: 1, motivo: 'SEM_OBJETIVO_POS', garantia: 'FGC', valor: null, ofertaCatalogo: undefined, fgc: undefined }]);
  });
  it('de 1 a 5 anos: metade pós, metade prefixado', () => {
    const fatias = sugerir({ tipo: 'SEM_OBJETIVO', horizonteAnos: 3 }, ctx());
    expect(fatias.map((f) => [f.motivo, f.percentual])).toEqual([['SEM_OBJETIVO_POS', 0.5], ['SEM_OBJETIVO_PRE', 0.5]]);
  });
  it('acima de 5 anos: entra o IPCA+ na proporção da tabela de longo prazo', () => {
    const fatias = sugerir({ tipo: 'SEM_OBJETIVO', horizonteAnos: 12 }, ctx());
    expect(fatias.map((f) => [f.produto, f.motivo, f.percentual])).toEqual([
      ['TESOURO_IPCA', 'SEM_OBJETIVO_IPCA', 0.7], ['CDB', 'SEM_OBJETIVO_POS', 0.3],
    ]);
  });
  it('toda fatia soma 100%, em qualquer faixa', () => {
    for (const horizonteAnos of [1, 3, 5, 6, 12, 25]) {
      const fatias = sugerir({ tipo: 'SEM_OBJETIVO', horizonteAnos }, ctx());
      expect(fatias.reduce((s, f) => s + f.percentual, 0)).toBeCloseTo(1, 10);
    }
  });
});

describe('sugerir — dispatcher completo', () => {
  it('os 4 tipos de objetivo funcionam', () => {
    expect(sugerir({ tipo: 'RESERVA', gastoMensal: 1000, rendaEstavel: true }, ctx()).length).toBeGreaterThan(0);
    expect(sugerir({ tipo: 'COM_DATA', valorAlvo: 1000, data: '2030-01-01' }, ctx()).length).toBeGreaterThan(0);
    expect(sugerir({ tipo: 'LONGO_PRAZO', horizonteAnos: 10 }, ctx()).length).toBeGreaterThan(0);
    expect(sugerir({ tipo: 'SEM_OBJETIVO', horizonteAnos: 10 }, ctx()).length).toBeGreaterThan(0);
  });
});

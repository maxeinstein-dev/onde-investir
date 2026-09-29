import { describe, expect, it } from 'vitest';
import { somarDias } from '../../src/engine/datas';
import { OfertaInvalidaError } from '../../src/engine/erros';
import type { Equivalente } from '../../src/engine/equivalencia';
import type { ItemFGC } from '../../src/engine/fgc';
import { cenarioConstante } from '../../src/engine/indexadores';
import type { OfertaCadastrada } from '../../src/engine/ofertas';
import { simular } from '../../src/engine/produtos';
import {
  calcularTaxaNecessaria, casarComCatalogo, principalNecessario, sugerir, sugerirRendaMensal, validarObjetivo, valorAlvo,
  type ContextoSugestao, type Fatia, type Objetivo,
} from '../../src/engine/sugestao';
import { CEN, INI } from './cenarioPadrao';

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
  it('renda mensal: sem valor-alvo (é o principal que importa, não um alvo a atingir)', () => {
    expect(valorAlvo({ tipo: 'RENDA_MENSAL', principal: 100000, rendaMensalDesejada: 1000 })).toBeNull();
  });
  it('carteira combinada: o próprio principal', () => {
    expect(valorAlvo({ tipo: 'CARTEIRA_COMBINADA', principal: 100000, gastoMensal: 3000, rendaEstavel: true, horizonteAnos: 20 })).toBe(100000);
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
  it('renda mensal: principal e renda desejada precisam ser positivos', () => {
    const base: Objetivo = { tipo: 'RENDA_MENSAL', principal: 100000, rendaMensalDesejada: 1000 };
    expect(() => validarObjetivo({ ...base, principal: 0 }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ ...base, principal: Number.NaN }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ ...base, rendaMensalDesejada: 0 }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ ...base, rendaMensalDesejada: -100 }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo(base, HOJE)).not.toThrow();
  });
  it('carteira combinada: os 4 campos válidos, e a reserva não pode passar do principal', () => {
    const base: Objetivo = { tipo: 'CARTEIRA_COMBINADA', principal: 100000, gastoMensal: 3000, rendaEstavel: true, horizonteAnos: 20 };
    expect(() => validarObjetivo({ ...base, principal: 0 }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ ...base, gastoMensal: 0 }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ ...base, horizonteAnos: 0 }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ ...base, horizonteAnos: 5.5 }, HOJE)).toThrow(OfertaInvalidaError);
    // reserva = 3000 × 6 = 18000 (rendaEstavel: true); principal menor que isso deve lançar.
    expect(() => validarObjetivo({ ...base, principal: 17999 }, HOJE)).toThrow(OfertaInvalidaError);
    expect(() => validarObjetivo({ ...base, principal: 18000 }, HOJE)).not.toThrow(); // limite: igual é aceito
    expect(() => validarObjetivo(base, HOJE)).not.toThrow();
  });
});

function taxaOuFalha(e: Equivalente): number {
  if (!e.disponivel) throw new Error(`indisponível: ${e.motivo}`);
  return e.taxa;
}

describe('calcularTaxaNecessaria', () => {
  const DATA_RESGATE = somarDias(INI, 30);

  it('ida e volta: o %CDI tributado encontrado, aplicado num CDB, rende a renda mensal desejada', () => {
    const r = calcularTaxaNecessaria(100000, 1000, INI, CEN);
    const pct = taxaOuFalha(r.tributadoPosCDI);
    const sim = simular({ produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: pct }, valor: 100000, dataAplicacao: INI }, DATA_RESGATE, CEN);
    expect(sim.valorLiquido).toBeCloseTo(101000, 2);
  });

  it('ida e volta: o %CDI isento encontrado, aplicado numa LCI (ignorando a carência), rende a renda mensal desejada', () => {
    const r = calcularTaxaNecessaria(100000, 1000, INI, CEN);
    const pct = taxaOuFalha(r.isentoPosCDI);
    const sim = simular(
      { produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: pct }, valor: 100000, dataAplicacao: INI },
      DATA_RESGATE, CEN, { ignorarPrazoMinimo: true },
    );
    expect(sim.valorLiquido).toBeCloseTo(101000, 2);
  });

  it('o %CDI isento necessário é menor que o tributado (sem IR a descontar)', () => {
    const r = calcularTaxaNecessaria(100000, 1000, INI, CEN);
    expect(taxaOuFalha(r.isentoPosCDI)).toBeLessThan(taxaOuFalha(r.tributadoPosCDI));
  });

  it('indisponível se a renda desejada for desproporcional ao principal (estoura o teto de busca)', () => {
    // O plano original sugeria dobrar o principal em 30 dias (rendaMensalDesejada = principal),
    // mas isso não estoura PERCENTUAL_TETO_BUSCA (1e6): com ~22 dias úteis em 30 dias corridos, o
    // produto acumulado em p = 1e6 já alcança algo em torno de 1e59 vezes o principal, então
    // qualquer fator-alvo abaixo disso ainda encontra taxa. Ajustado empiricamente (rodando o
    // teste) para uma renda desejada MUITO mais desproporcional, que realmente estoura o teto.
    const r = calcularTaxaNecessaria(100000, 1e60, INI, CEN);
    expect(r.tributadoPosCDI.disponivel).toBe(false);
    expect(r.isentoPosCDI.disponivel).toBe(false);
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

describe('sugerirRendaMensal', () => {
  const objetivo: Extract<Objetivo, { tipo: 'RENDA_MENSAL' }> = { tipo: 'RENDA_MENSAL', principal: 100000, rendaMensalDesejada: 1000 };
  const ctxBase = { catalogo: [] as OfertaCadastrada[], carteira: [] as ItemFGC[], hoje: INI };

  it('uma oferta isenta sozinha resolve: fatia única de 100%', () => {
    const catalogo = [catalogoBase({ id: 'lci', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.95 } })];
    const r = sugerirRendaMensal(objetivo, { ...ctxBase, catalogo }, CEN);
    expect(r.modo).toBe('UNICA');
    if (r.modo === 'UNICA') {
      expect(r.fatia.produto).toBe('LCI');
      expect(r.fatia.percentual).toBe(1);
      expect(r.fatia.motivo).toBe('RENDA_MENSAL_ISENTO');
    }
  });

  it('nenhuma sozinha resolve: usa 100% na que rende mais de verdade (não faz sentido misturar — ver nota do design)', () => {
    // Nem CDB a 50% do CDI nem LCI a 90% do CDI batem a meta sozinhos (o necessário é bem maior),
    // mas a LCI (isenta, sem IR) rende mais de verdade que o CDB nessa janela — ela é escolhida.
    const catalogo = [
      catalogoBase({ id: 'cdb', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.5 } }),
      catalogoBase({ id: 'lci', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.9 } }),
    ];
    const r = sugerirRendaMensal(objetivo, { ...ctxBase, catalogo }, CEN);
    expect(r.modo).toBe('INSUFICIENTE');
    if (r.modo === 'INSUFICIENTE') {
      expect(r.fatias).toHaveLength(1);
      expect(r.fatias[0]?.produto).toBe('LCI');
      expect(r.fatias[0]?.percentual).toBe(1);
      expect(r.faltaMensal).toBeGreaterThan(0);
    }
  });

  it('catálogo vazio: insuficiente, sem fatias, faltando a renda mensal inteira', () => {
    const r = sugerirRendaMensal(objetivo, ctxBase, CEN);
    expect(r.modo).toBe('INSUFICIENTE');
    if (r.modo === 'INSUFICIENTE') {
      expect(r.fatias).toHaveLength(0);
      expect(r.faltaMensal).toBeCloseTo(1000, 2);
    }
  });

  it('só oferta tributada no catálogo, e ela não basta sozinha: insuficiente com 1 fatia', () => {
    const catalogo = [catalogoBase({ id: 'cdb', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.5 } })];
    const r = sugerirRendaMensal(objetivo, { ...ctxBase, catalogo }, CEN);
    expect(r.modo).toBe('INSUFICIENTE');
    if (r.modo === 'INSUFICIENTE') {
      expect(r.fatias).toHaveLength(1);
      expect(r.fatias[0]?.percentual).toBe(1);
      expect(r.faltaMensal).toBeGreaterThan(0);
    }
  });

  it('só a oferta tributada resolve sozinha (sem nenhuma isenta no catálogo): fatia única tributada', () => {
    const necessaria = calcularTaxaNecessaria(objetivo.principal, objetivo.rendaMensalDesejada, ctxBase.hoje, CEN);
    const taxaTributadaNecessaria = taxaOuFalha(necessaria.tributadoPosCDI);
    const catalogo = [
      catalogoBase({ id: 'cdb', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: taxaTributadaNecessaria + 0.1 } }),
    ];
    const r = sugerirRendaMensal(objetivo, { ...ctxBase, catalogo }, CEN);
    expect(r.modo).toBe('UNICA');
    if (r.modo === 'UNICA') {
      expect(r.fatia.produto).toBe('CDB');
      expect(r.fatia.percentual).toBe(1);
      expect(r.fatia.motivo).toBe('RENDA_MENSAL_TRIBUTADO');
    }
  });

  it('quando tributada e isenta resolvem sozinhas, a isenta é sempre preferida (não precisa de IR, então nunca perde o desempate)', () => {
    const necessaria = calcularTaxaNecessaria(objetivo.principal, objetivo.rendaMensalDesejada, ctxBase.hoje, CEN);
    const taxaTributadaNecessaria = taxaOuFalha(necessaria.tributadoPosCDI);
    const taxaIsentaNecessaria = taxaOuFalha(necessaria.isentoPosCDI);
    const catalogo = [
      catalogoBase({ id: 'cdb', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: taxaTributadaNecessaria + 0.1 } }),
      catalogoBase({ id: 'lci', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: taxaIsentaNecessaria + 0.001 } }),
    ];
    const r = sugerirRendaMensal(objetivo, { ...ctxBase, catalogo }, CEN);
    expect(r.modo).toBe('UNICA');
    if (r.modo === 'UNICA') {
      expect(r.fatia.produto).toBe('LCI');
      expect(r.fatia.percentual).toBe(1);
      expect(r.fatia.motivo).toBe('RENDA_MENSAL_ISENTO');
    }
  });
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
  it('soma também com outras fatias FGC do mesmo objetivo casadas no mesmo conglomerado', () => {
    // Duas fatias do mesmo lote, cada uma casando com uma oferta do mesmo conglomerado (Banco X).
    // Sozinha, nenhuma passa do limite (150000 e 150000, sem carteira); juntas (300000) passam.
    const catalogo = [catalogoBase({ id: 'a', conglomerado: 'Banco X' })];
    const fatias = [
      fatiaBase({ produto: 'CDB', valor: 150000 }),
      fatiaBase({ produto: 'CDB', valor: 150000 }),
    ];
    const [f1, f2] = casarComCatalogo(fatias, catalogo, [], HOJE);
    expect(f1?.fgc).toEqual({ conglomerado: 'Banco X', excedente: 50000 }); // 150000 + 150000 − 250000
    expect(f2?.fgc).toEqual({ conglomerado: 'Banco X', excedente: 50000 });
  });
  it('exatamente no limite do FGC (carteira + fatia = 250000): sem aviso, a regra é ">", não ">="', () => {
    const catalogo = [catalogoBase()];
    const carteira = [carteiraItem('Banco X', 230000)];
    const [f] = casarComCatalogo([fatiaBase({ valor: 20000 })], catalogo, carteira, HOJE);
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
  it('valida o objetivo antes de calcular: horizonte negativo ou fracionário lança', () => {
    expect(() => sugerir({ tipo: 'LONGO_PRAZO', horizonteAnos: -5 }, ctx())).toThrow(OfertaInvalidaError);
    expect(() => sugerir({ tipo: 'LONGO_PRAZO', horizonteAnos: 5.5 }, ctx())).toThrow(OfertaInvalidaError);
  });
  it('renda mensal: delega para sugerirRendaMensal e achata o resultado em Fatia[]', () => {
    const catalogo = [catalogoBase({ id: 'lci', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.95 } })];
    const fatias = sugerir(
      { tipo: 'RENDA_MENSAL', principal: 100000, rendaMensalDesejada: 1000 },
      { catalogo, carteira: [], hoje: INI }, CEN,
    );
    expect(fatias).toHaveLength(1);
    expect(fatias[0]?.motivo).toBe('RENDA_MENSAL_ISENTO');
  });
  it('renda mensal: lança se chamado sem Cenario', () => {
    expect(() => sugerir(
      { tipo: 'RENDA_MENSAL', principal: 100000, rendaMensalDesejada: 1000 },
      { catalogo: [], carteira: [], hoje: INI },
    )).toThrow();
  });
});

describe('sugerirCarteiraCombinada', () => {
  const objetivo: Extract<Objetivo, { tipo: 'CARTEIRA_COMBINADA' }> = {
    tipo: 'CARTEIRA_COMBINADA', principal: 100000, gastoMensal: 3000, rendaEstavel: true, horizonteAnos: 20,
  };
  const ctxBase = { catalogo: [] as OfertaCadastrada[], carteira: [] as ItemFGC[], hoje: HOJE };

  it('4 fatias (2 da reserva + 2 do restante), somando 100% e o valor do principal', () => {
    const fatias = sugerir(objetivo, ctxBase);
    expect(fatias).toHaveLength(4);
    const somaPercentual = fatias.reduce((s, f) => s + f.percentual, 0);
    expect(somaPercentual).toBeCloseTo(1, 10);
    const somaValor = fatias.reduce((s, f) => s + (f.valor ?? 0), 0);
    expect(somaValor).toBeCloseTo(100000, 6);
  });

  it('a reserva é 18000 (3000 × 6, rendaEstavel), dividida 50/50 entre Tesouro Selic e CDB', () => {
    const fatias = sugerir(objetivo, ctxBase);
    const selic = fatias.find((f) => f.motivo === 'RESERVA_TESOURO_SELIC');
    const cdbReserva = fatias.find((f) => f.motivo === 'RESERVA_CDB_LIQUIDEZ');
    expect(selic?.valor).toBeCloseTo(9000, 6);
    expect(cdbReserva?.valor).toBeCloseTo(9000, 6);
    expect(selic?.percentual).toBeCloseTo(0.09, 6); // 9000 / 100000
  });

  it('o restante (82000) segue a faixa de 20 anos (faixaLongoPrazo): 70% IPCA+, 30% pós', () => {
    const fatias = sugerir(objetivo, ctxBase);
    const ipca = fatias.find((f) => f.motivo === 'LONGO_PRAZO_IPCA');
    const pos = fatias.find((f) => f.motivo === 'LONGO_PRAZO_POS');
    expect(ipca?.valor).toBeCloseTo(82000 * 0.7, 6);
    expect(pos?.valor).toBeCloseTo(82000 * 0.3, 6);
  });

  it('FGC cruzado: reserva (CDB) e restante (CDB pós) no mesmo conglomerado somam', () => {
    const catalogo = [
      catalogoBase({ id: 'cdb1', produto: 'CDB', conglomerado: 'Banco X', liquidez: 'DIARIA' }),
    ];
    const carteira = [carteiraItem('Banco X', 220000)]; // já perto do limite do FGC sozinha
    const fatias = sugerir(objetivo, { ...ctxBase, catalogo, carteira });
    const comFgc = fatias.filter((f) => f.fgc !== undefined);
    expect(comFgc.length).toBeGreaterThan(0);
  });
});

describe('principalNecessario', () => {
  const RENDA = 3000;

  it('CDB a 100% do CDI: aplicar esse principal rende a renda desejada em 30 dias (ida e volta)', () => {
    const p = principalNecessario(RENDA, 'CDB', 1, HOJE, CEN) as number;
    const r = simular({ produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 }, valor: p, dataAplicacao: HOJE }, somarDias(HOJE, 30), CEN);
    expect(r.valorLiquido - p).toBeCloseTo(RENDA, 2);
  });
  it('percentual maior do CDI pede principal menor', () => {
    expect(principalNecessario(RENDA, 'CDB', 1.1, HOJE, CEN) as number).toBeLessThan(principalNecessario(RENDA, 'CDB', 1, HOJE, CEN) as number);
  });
  it('LCI (isenta) pede principal menor que o CDB tributado no mesmo %CDI', () => {
    expect(principalNecessario(RENDA, 'LCI', 1, HOJE, CEN) as number).toBeLessThan(principalNecessario(RENDA, 'CDB', 1, HOJE, CEN) as number);
  });
  it('dobrar a renda dobra o principal (o retorno é linear no valor aplicado)', () => {
    const um = principalNecessario(1500, 'CDB', 1, HOJE, CEN) as number;
    expect(principalNecessario(3000, 'CDB', 1, HOJE, CEN)).toBeCloseTo(um * 2, 4);
  });
  it('CDI zero: rendimento não positivo devolve null', () => {
    const semCdi = cenarioConstante({ cdiAA: 0, selicMetaAA: 0, ipcaAA: 0, trAM: 0 });
    expect(principalNecessario(RENDA, 'CDB', 1, HOJE, semCdi)).toBeNull();
  });
});

describe('sugerirRendaMensal: principal necessário quando a renda é inviável', () => {
  const objetivo: Extract<Objetivo, { tipo: 'RENDA_MENSAL' }> = { tipo: 'RENDA_MENSAL', principal: 50000, rendaMensalDesejada: 3000 };
  const ctxBase = { catalogo: [] as OfertaCadastrada[], carteira: [] as ItemFGC[], hoje: INI };

  it('catálogo vazio: só a referência de CDB a 100% do CDI, bem acima do principal informado', () => {
    const r = sugerirRendaMensal(objetivo, ctxBase, CEN);
    expect(r.modo).toBe('INSUFICIENTE');
    if (r.modo === 'INSUFICIENTE') {
      expect(r.principalNecessario.catalogo).toBeNull();
      expect(r.principalNecessario.referencia).toBeCloseTo(principalNecessario(3000, 'CDB', 1, INI, CEN) as number, 6);
      expect(r.principalNecessario.referencia as number).toBeGreaterThan(objetivo.principal);
    }
  });
  it('com uma oferta melhor que 100% do CDI: o valor pela melhor oferta é menor que o da referência', () => {
    const catalogo = [catalogoBase({ id: 'cdb', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.1 } })];
    const r = sugerirRendaMensal(objetivo, { ...ctxBase, catalogo }, CEN);
    expect(r.modo).toBe('INSUFICIENTE');
    if (r.modo === 'INSUFICIENTE') {
      const c = r.principalNecessario.catalogo;
      expect(c?.oferta.id).toBe('cdb');
      expect(c?.valor as number).toBeLessThan(r.principalNecessario.referencia as number);
      expect(c?.valor).toBeCloseTo(principalNecessario(3000, 'CDB', 1.1, INI, CEN) as number, 6);
    }
  });
  it('a oferta escolhida é a mesma da fatia sugerida (LCI que rende mais)', () => {
    const catalogo = [
      catalogoBase({ id: 'cdb', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.5 } }),
      catalogoBase({ id: 'lci', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.9 } }),
    ];
    const r = sugerirRendaMensal(objetivo, { ...ctxBase, catalogo }, CEN);
    if (r.modo === 'INSUFICIENTE') {
      expect(r.principalNecessario.catalogo?.oferta.id).toBe(r.fatias[0]?.ofertaCatalogo?.id);
    } else {
      throw new Error('esperava INSUFICIENTE');
    }
  });
});

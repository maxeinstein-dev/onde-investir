import { describe, expect, it } from 'vitest';
import { gerarAlertas, LIMIAR_QUASE_EMPATE, type Alerta } from '../../src/engine/alertas';
import { horizontesPadrao, tabelaPorHorizonte } from '../../src/engine/comparacao';
import type { OfertaCadastrada, Projecao } from '../../src/engine/ofertas';
import { CEN, INI } from './cenarioPadrao';

const b = { emissor: 'B', conglomerado: 'B' };
const PADRAO = { tipo: 'PADRAO' } as const;
const cdbVenc2031: OfertaCadastrada = { ...b, id: '1', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, vencimento: '2031-09-28', liquidez: 'NO_VENCIMENTO' };
const cdbDiario = (percentualCDI: number, id = 'd'): OfertaCadastrada => ({ ...b, id, produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI }, liquidez: 'DIARIA' });
const tesouroSelic: OfertaCadastrada = { ...b, id: 's', produto: 'TESOURO_SELIC', indexacao: { tipo: 'SELIC' }, vencimento: '2032-03-01', liquidez: 'DIARIA' };

function alertas(ofertas: OfertaCadastrada[], dataUsuario: string | null = null, limiar?: number): Alerta[] {
  const colunas = tabelaPorHorizonte(ofertas, 10000, INI, horizontesPadrao(INI, dataUsuario), CEN, PADRAO);
  return gerarAlertas(ofertas, colunas, limiar);
}
const doTipo = <T extends Alerta['tipo']>(xs: Alerta[], tipo: T) => xs.filter((a): a is Extract<Alerta, { tipo: T }> => a.tipo === tipo);
const liquido = (p: Projecao | undefined) => (p?.estado === 'DISPONIVEL' ? p.liquido : NaN);

describe('QUASE_EMPATE', () => {
  it('limiar padrão de 0,5%', () => {
    expect(LIMIAR_QUASE_EMPATE).toBe(0.005);
  });

  it('a outra fica a menos de 0,5% do líder e tem liquidez diária, o líder não: um alerta, no horizonte mais distante', () => {
    const ofertas = [cdbVenc2031, cdbDiario(1.028)];
    const colunas = tabelaPorHorizonte(ofertas, 10000, INI, horizontesPadrao(INI, null), CEN, PADRAO);
    const cincoAnos = colunas.at(-1);
    expect(cincoAnos?.lideres).toEqual([0]);
    const [a, ...resto] = doTipo(gerarAlertas(ofertas, colunas), 'QUASE_EMPATE');
    expect(resto).toEqual([]);
    const diferenca = liquido(cincoAnos?.projecoes[0]) - liquido(cincoAnos?.projecoes[1]);
    expect(a).toEqual({
      tipo: 'QUASE_EMPATE', horizonte: '2031-09-28', lider: 0, alternativa: 1,
      diferenca, diferencaPercentual: diferenca / liquido(cincoAnos?.projecoes[0]), vantagem: 'LIQUIDEZ',
    });
    expect(a?.diferencaPercentual).toBeGreaterThan(0);
    expect(a?.diferencaPercentual).toBeLessThan(0.005);
  });

  it('acima do limiar não gera alerta', () => {
    expect(doTipo(alertas([cdbVenc2031, cdbDiario(0.95)]), 'QUASE_EMPATE')).toEqual([]);
    // o mesmo par do caso positivo, com um limiar menor que a diferença
    expect(doTipo(alertas([cdbVenc2031, cdbDiario(1.028)], null, 0.0001), 'QUASE_EMPATE')).toEqual([]);
  });

  it('liquidez igual (e mesma garantia) não gera alerta', () => {
    expect(doTipo(alertas([cdbDiario(1.03, 'a'), cdbDiario(1.028, 'b')]), 'QUASE_EMPATE')).toEqual([]);
    const outroNoVencimento = { ...cdbVenc2031, id: '2', indexacao: { tipo: 'POS_CDI' as const, percentualCDI: 1.028 } };
    expect(doTipo(alertas([cdbVenc2031, outroNoVencimento]), 'QUASE_EMPATE')).toEqual([]);
  });

  it('a alternativa com liquidez PIOR que a do líder não gera alerta', () => {
    const noVencimento = { ...cdbVenc2031, indexacao: { tipo: 'POS_CDI' as const, percentualCDI: 1.028 } };
    expect(doTipo(alertas([cdbDiario(1.03), noVencimento]), 'QUASE_EMPATE')).toEqual([]);
  });

  it('garantia do Tesouro contra FGC, com a mesma liquidez: vantagem GARANTIA', () => {
    // Tesouro Selic rende a Selic over (= CDI no cenário) menos a custódia: fica logo atrás do CDB 100,1% diário.
    const [a] = doTipo(alertas([cdbDiario(1.001), tesouroSelic]), 'QUASE_EMPATE');
    expect(a).toMatchObject({ lider: 0, alternativa: 1, vantagem: 'GARANTIA' });
  });

  it('liquidez e garantia melhores ao mesmo tempo: vantagem LIQUIDEZ', () => {
    const cdb = { ...cdbVenc2031, indexacao: { tipo: 'POS_CDI' as const, percentualCDI: 1.001 } };
    const [a] = doTipo(alertas([cdb, tesouroSelic]), 'QUASE_EMPATE');
    expect(a).toMatchObject({ lider: 0, alternativa: 1, vantagem: 'LIQUIDEZ' });
  });

  it('empate em centavos no topo não gera alerta (não há quem renda menos)', () => {
    const noVencimento = { ...cdbVenc2031, liquidez: 'NO_VENCIMENTO' as const };
    const diario = { ...cdbVenc2031, id: '2', liquidez: 'DIARIA' as const };
    expect(doTipo(alertas([noVencimento, diario]), 'QUASE_EMPATE')).toEqual([]);
  });
});

describe('IR_REINICIA', () => {
  const cdb2027: OfertaCadastrada = { ...b, id: 'c', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, vencimento: '2027-09-28', liquidez: 'NO_VENCIMENTO' };

  it('reaplicação tributada com alíquota maior que a de quem não reaplica: no horizonte mais distante em que vale', () => {
    // Em 2 anos: a etapa 2 tem 366 dias (17,5%); sem reaplicar seriam 731 dias (15%).
    // Em 3 e 5 anos a etapa 2 passa de 720 dias e as duas alíquotas são 15%: não há alerta.
    expect(doTipo(alertas([cdb2027]), 'IR_REINICIA')).toEqual([
      { tipo: 'IR_REINICIA', oferta: 0, data: '2027-09-28', aliquotaNova: 0.175, aliquotaSemReaplicar: 0.15 },
    ]);
  });

  it('reaplicação isenta (LCI reaplicada em LCI) não gera alerta', () => {
    const lci: OfertaCadastrada = { ...cdb2027, produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.9 } };
    expect(doTipo(alertas([lci]), 'IR_REINICIA')).toEqual([]);
  });

  it('sem reaplicação não gera alerta', () => {
    expect(doTipo(alertas([cdbVenc2031]), 'IR_REINICIA')).toEqual([]);
  });
});

describe('IOF', () => {
  it('a etapa final com menos de 30 dias paga IOF', () => {
    // Vence em 01/09/2027; em "1 ano" (28/09/2027) a reaplicação tem 27 dias.
    const cdb: OfertaCadastrada = { ...b, id: 'c', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, vencimento: '2027-09-01', liquidez: 'NO_VENCIMENTO' };
    const colunas = tabelaPorHorizonte([cdb], 10000, INI, horizontesPadrao(INI, null), CEN, PADRAO);
    const umAno = colunas.find((c) => c.data === '2027-09-28')?.projecoes[0];
    const iof = umAno?.estado === 'DISPONIVEL' ? umAno.etapas.at(-1)?.iof : undefined;
    expect(iof).toBeGreaterThan(0);
    expect(doTipo(gerarAlertas([cdb], colunas), 'IOF')).toEqual([{ tipo: 'IOF', oferta: 0, horizonte: '2027-09-28', iof }]);
  });

  it('sem IOF em nenhum horizonte, nenhum alerta', () => {
    expect(doTipo(alertas([cdbVenc2031, cdbDiario(1)]), 'IOF')).toEqual([]);
  });
});

describe('PRAZO_INCOMPATIVEL', () => {
  const lci = (vencimento: string): OfertaCadastrada => ({ ...b, id: 'l', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.9 }, vencimento, liquidez: 'NO_VENCIMENTO' });

  it('indisponível na data do usuário', () => {
    expect(doTipo(alertas([lci('2029-09-28')], '2028-01-15'), 'PRAZO_INCOMPATIVEL')).toEqual([
      { tipo: 'PRAZO_INCOMPATIVEL', oferta: 0, horizonte: '2028-01-15', disponivelEm: '2029-09-28' },
    ]);
  });

  it('indisponível na data do usuário e no mais distante: um alerta, no mais distante', () => {
    expect(doTipo(alertas([lci('2033-09-28')], '2028-01-15'), 'PRAZO_INCOMPATIVEL')).toEqual([
      { tipo: 'PRAZO_INCOMPATIVEL', oferta: 0, horizonte: '2031-09-28', disponivelEm: '2033-09-28' },
    ]);
  });

  it('indisponível só num horizonte intermediário (nem a data do usuário, nem o mais distante): sem alerta', () => {
    expect(doTipo(alertas([lci('2027-09-28')]), 'PRAZO_INCOMPATIVEL')).toEqual([]);
  });

  it('marcação a mercado não é prazo incompatível', () => {
    const prefixado: OfertaCadastrada = { ...b, id: 'p', produto: 'TESOURO_PREFIXADO', indexacao: { tipo: 'PRE', taxaAA: 0.13 }, vencimento: '2033-01-01', liquidez: 'DIARIA' };
    expect(doTipo(alertas([prefixado]), 'PRAZO_INCOMPATIVEL')).toEqual([]);
  });

  it('indisponível sem data de liberação (vence antes da aplicação): alerta sem disponivelEm', () => {
    const [a] = doTipo(alertas([lci('2026-01-01')]), 'PRAZO_INCOMPATIVEL');
    expect(a).toEqual({ tipo: 'PRAZO_INCOMPATIVEL', oferta: 0, horizonte: '2031-09-28' });
  });
});

describe('gerarAlertas', () => {
  it('ordem: por tipo e, dentro do tipo, pela oferta', () => {
    const cdb2027: OfertaCadastrada = { ...b, id: 'c', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, vencimento: '2027-09-01', liquidez: 'NO_VENCIMENTO' };
    const lci: OfertaCadastrada = { ...b, id: 'l', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.9 }, vencimento: '2033-09-28', liquidez: 'NO_VENCIMENTO' };
    const tipos = alertas([lci, cdb2027]).map((a) => a.tipo);
    expect(tipos).toEqual(['IR_REINICIA', 'IOF', 'PRAZO_INCOMPATIVEL']);
  });

  it('sem colunas, sem alertas; limiar inválido lança', () => {
    expect(gerarAlertas([cdbVenc2031], [])).toEqual([]);
    expect(() => gerarAlertas([cdbVenc2031], [], Number.NaN)).toThrow(RangeError);
    expect(() => gerarAlertas([cdbVenc2031], [], -0.01)).toThrow(RangeError);
  });
});

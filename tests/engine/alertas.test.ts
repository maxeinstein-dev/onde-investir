import { describe, expect, it } from 'vitest';
import { gerarAlertas, LIMIAR_QUASE_EMPATE, resgataQuandoQuiser, type Alerta } from '../../src/engine/alertas';
import { horizontesPadrao, tabelaPorHorizonte } from '../../src/engine/comparacao';
import { somarDias } from '../../src/engine/datas';
import { projetar, type OfertaCadastrada, type Projecao } from '../../src/engine/ofertas';
import { primeiraDataAcimaDoLimite, type ItemFGC } from '../../src/engine/fgc';
import { simular, type ResultadoSimulacao } from '../../src/engine/produtos';
import { CEN, INI } from './cenarioPadrao';

const b = { emissor: 'B', conglomerado: 'B' };
const PADRAO = { tipo: 'PADRAO' } as const;
const cdbVenc2031: OfertaCadastrada = { ...b, id: '1', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, vencimento: '2031-09-28', liquidez: 'NO_VENCIMENTO' };
const cdbDiario = (percentualCDI: number, id = 'd'): OfertaCadastrada => ({ ...b, id, produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI }, liquidez: 'DIARIA' });
const tesouroSelic: OfertaCadastrada = { ...b, id: 's', produto: 'TESOURO_SELIC', indexacao: { tipo: 'SELIC' }, vencimento: '2032-03-01', liquidez: 'DIARIA' };

function alertas(ofertas: OfertaCadastrada[], dataUsuario: string | null = null, limiar?: number): Alerta[] {
  const colunas = tabelaPorHorizonte(ofertas, 10000, INI, horizontesPadrao(INI, dataUsuario), CEN, PADRAO);
  return gerarAlertas(ofertas, colunas, limiar, dataUsuario ?? undefined);
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
      tipo: 'QUASE_EMPATE', horizonte: '2031-09-28', lider: 0, lideres: [0], alternativa: 1,
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

  // A expectativa antiga ("empate em centavos no topo não gera alerta") escondia o caso mais claro: rendendo o
  // mesmo, a oferta com liquidez é melhor. No empate exato, sempre alerta.
  it('o mesmo CDB com e sem liquidez (empate exato no topo): alerta para o que tem liquidez, com diferença zero', () => {
    const noVencimento = { ...cdbVenc2031, liquidez: 'NO_VENCIMENTO' as const };
    const diario = { ...cdbVenc2031, id: '2', liquidez: 'DIARIA' as const };
    expect(doTipo(alertas([noVencimento, diario]), 'QUASE_EMPATE')).toEqual([
      { tipo: 'QUASE_EMPATE', horizonte: '2031-09-28', lider: 0, lideres: [0], alternativa: 1, diferenca: 0, diferencaPercentual: 0, vantagem: 'LIQUIDEZ' },
    ]);
  });

  it('dois CDBs 103% empatados no topo e um 102,8% diário: o diário tem vantagem sobre os dois líderes', () => {
    const outro103 = { ...cdbVenc2031, id: '2' };
    const ofertas = [cdbVenc2031, outro103, cdbDiario(1.028)];
    const colunas = tabelaPorHorizonte(ofertas, 10000, INI, horizontesPadrao(INI, null), CEN, PADRAO);
    const cincoAnos = colunas.at(-1);
    expect(cincoAnos?.lideres).toEqual([0, 1]);
    const diferenca = liquido(cincoAnos?.projecoes[0]) - liquido(cincoAnos?.projecoes[2]);
    expect(doTipo(gerarAlertas(ofertas, colunas), 'QUASE_EMPATE')).toEqual([{
      tipo: 'QUASE_EMPATE', horizonte: '2031-09-28', lider: 0, lideres: [0, 1], alternativa: 2,
      diferenca, diferencaPercentual: diferenca / liquido(cincoAnos?.projecoes[0]), vantagem: 'LIQUIDEZ',
    }]);
  });

  it('vantagem só sobre um dos líderes empatados não gera alerta', () => {
    // Líderes: um CDB sem liquidez e o mesmo CDB diário; a alternativa diária não tem vantagem sobre o diário.
    const diario103 = { ...cdbVenc2031, id: '2', liquidez: 'DIARIA' as const };
    const alerta = doTipo(alertas([cdbVenc2031, diario103, cdbDiario(1.028)]), 'QUASE_EMPATE');
    expect(alerta.map((a) => a.alternativa)).toEqual([1]);
  });
});

describe('resgataQuandoQuiser', () => {
  const lciDiaria: OfertaCadastrada = { ...b, id: 'l', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.9 }, liquidez: 'DIARIA' };
  const poupanca: OfertaCadastrada = { ...b, id: 'p', produto: 'POUPANCA', indexacao: { tipo: 'POUPANCA' }, liquidez: 'DIARIA' };
  const prefixado: OfertaCadastrada = { ...b, id: 'x', produto: 'TESOURO_PREFIXADO', indexacao: { tipo: 'PRE', taxaAA: 0.13 }, vencimento: '2033-01-01', liquidez: 'DIARIA' };

  it('LCI/LCA com liquidez diária: só depois da carência (prazo mínimo)', () => {
    expect(resgataQuandoQuiser(lciDiaria, INI, '2027-03-27')).toBe(false);
    expect(resgataQuandoQuiser(lciDiaria, INI, '2027-03-28')).toBe(true);
  });
  it('poupança conta; Tesouro com marcação a mercado e oferta sem liquidez não', () => {
    expect(resgataQuandoQuiser(poupanca, INI, '2027-01-01')).toBe(true);
    expect(resgataQuandoQuiser(prefixado, INI, '2027-01-01')).toBe(false);
    expect(resgataQuandoQuiser(cdbVenc2031, INI, '2027-01-01')).toBe(false);
    expect(resgataQuandoQuiser(cdbDiario(1), INI, '2027-01-01')).toBe(true);
  });
});

describe('IR_REINICIA', () => {
  const CDB_103 = { produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 } };
  /** A etapa 2 (a reaplicação) da projeção na data. */
  const etapa2 = (o: OfertaCadastrada, data: string): ResultadoSimulacao => {
    const p = projetar(o, 10000, INI, data, CEN);
    if (p.estado !== 'DISPONIVEL' || !p.etapas[1]) throw new Error('sem reaplicação');
    return p.etapas[1];
  };
  const baseIR = (e: ResultadoSimulacao) => Math.max(0, e.rendimentoBruto - e.iof - e.custodia);
  const cdb2027: OfertaCadastrada = { ...b, id: 'c', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, vencimento: '2027-09-28', liquidez: 'NO_VENCIMENTO' };

  it('reaplicação tributada com alíquota maior que a de quem não reaplica: no horizonte mais distante em que vale', () => {
    // Em 2 anos: a etapa 2 tem 366 dias (17,5%); sem reaplicar seriam 731 dias (15%).
    // Em 3 e 5 anos a etapa 2 passa de 720 dias e as duas alíquotas são 15%: não há alerta.
    const e2 = etapa2(cdb2027, '2028-09-28');
    expect(doTipo(alertas([cdb2027]), 'IR_REINICIA')).toEqual([{
      tipo: 'IR_REINICIA', oferta: 0, data: '2027-09-28', horizonte: '2028-09-28', reinvestimento: CDB_103, etapa1Isenta: false,
      aliquotaNova: 0.175, aliquotaSemReaplicar: 0.15, custo: e2.ir - baseIR(e2) * 0.15,
    }]);
  });

  it('CDB que vence em 20 dias, horizonte de 2 anos: o custo é o IR a mais da etapa 2 (17,5% em vez de 15%)', () => {
    const curto: OfertaCadastrada = { ...cdb2027, vencimento: somarDias(INI, 20) };
    const e2 = etapa2(curto, '2028-09-28');
    expect(e2.diasCorridos).toBe(711);
    const [a, ...resto] = doTipo(alertas([curto]), 'IR_REINICIA');
    expect(resto).toEqual([]);
    expect(a).toEqual({
      tipo: 'IR_REINICIA', oferta: 0, data: somarDias(INI, 20), horizonte: '2028-09-28', reinvestimento: CDB_103, etapa1Isenta: false,
      aliquotaNova: 0.175, aliquotaSemReaplicar: 0.15, custo: e2.ir - baseIR(e2) * 0.15,
    });
    expect(a?.custo).toBeCloseTo(baseIR(e2) * 0.025, 6);
    expect(a?.custo).toBeGreaterThan(10);
  });

  it('LCI prefixada de 1 ano reaplicada em CDB: passa a pagar IR (etapa 1 isenta), o custo é todo o IR da etapa 2', () => {
    const lciPre: OfertaCadastrada = { ...cdb2027, produto: 'LCI', indexacao: { tipo: 'PRE', taxaAA: 0.12 } };
    const e2 = etapa2(lciPre, '2031-09-28');
    expect(doTipo(alertas([lciPre]), 'IR_REINICIA')).toEqual([{
      tipo: 'IR_REINICIA', oferta: 0, data: '2027-09-28', horizonte: '2031-09-28',
      reinvestimento: { produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 } }, etapa1Isenta: true,
      aliquotaNova: 0.15, aliquotaSemReaplicar: 0, custo: e2.ir,
    }]);
    expect(e2.ir).toBeGreaterThan(0);
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
    expect(doTipo(gerarAlertas([cdb], colunas), 'IOF')).toEqual([{ tipo: 'IOF', oferta: 0, horizonte: '2027-09-28', iof, etapa: 2, dias: 27, vencimento: '2027-09-01' }]);
  });

  it('vencimento antes de 30 dias: a etapa 1 paga IOF no vencimento', () => {
    const vinteDias: OfertaCadastrada = { ...b, id: 'c', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, vencimento: somarDias(INI, 20), liquidez: 'NO_VENCIMENTO' };
    const p = projetar(vinteDias, 10000, INI, '2031-09-28', CEN);
    const iof = p.estado === 'DISPONIVEL' ? p.etapas[0]?.iof : undefined;
    expect(iof).toBeGreaterThan(0);
    expect(doTipo(alertas([vinteDias]), 'IOF')).toEqual([
      { tipo: 'IOF', oferta: 0, horizonte: '2031-09-28', iof, etapa: 1, dias: 20, vencimento: somarDias(INI, 20) },
    ]);
  });

  it('sem reaplicação, a sua data antes de 30 dias: etapa 1, sem vencimento', () => {
    const data = somarDias(INI, 10);
    const p = projetar(cdbDiario(1), 10000, INI, data, CEN);
    const iof = p.estado === 'DISPONIVEL' ? p.etapas[0]?.iof : undefined;
    expect(doTipo(alertas([cdbDiario(1)], data), 'IOF')).toEqual([{ tipo: 'IOF', oferta: 0, horizonte: data, iof, etapa: 1, dias: 10 }]);
  });

  it('IOF abaixo de R$ 0,01 não gera alerta', () => {
    const data = somarDias(INI, 29);
    const colunas = tabelaPorHorizonte([cdbDiario(1)], 10, INI, horizontesPadrao(INI, data), CEN, PADRAO);
    const p = colunas.find((c) => c.data === data)?.projecoes[0];
    const iof = p?.estado === 'DISPONIVEL' ? p.etapas[0]?.iof ?? 0 : 0;
    expect(iof).toBeGreaterThan(0);
    expect(iof).toBeLessThan(0.01);
    expect(doTipo(gerarAlertas([cdbDiario(1)], colunas, LIMIAR_QUASE_EMPATE, data), 'IOF')).toEqual([]);
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

  // Antes o alerta ia para o horizonte mais distante, que não é o prazo da pessoa: com a data do usuário, é ela.
  it('indisponível na data do usuário e no mais distante: um alerta, na data do usuário', () => {
    expect(doTipo(alertas([lci('2033-09-28')], '2028-01-15'), 'PRAZO_INCOMPATIVEL')).toEqual([
      { tipo: 'PRAZO_INCOMPATIVEL', oferta: 0, horizonte: '2028-01-15', disponivelEm: '2033-09-28' },
    ]);
  });

  it('a data do usuário vale mesmo quando coincide com um horizonte padrão (sem a coluna "Sua data")', () => {
    // 28/09/2027 é o horizonte "1 ano": a tabela não cria a coluna "Sua data".
    expect(horizontesPadrao(INI, '2027-09-28').some((h) => h.rotulo === 'Sua data')).toBe(false);
    expect(doTipo(alertas([lci('2029-09-28')], '2027-09-28'), 'PRAZO_INCOMPATIVEL')).toEqual([
      { tipo: 'PRAZO_INCOMPATIVEL', oferta: 0, horizonte: '2027-09-28', disponivelEm: '2029-09-28' },
    ]);
  });

  it('com data do usuário, o mais distante não entra (o prazo é o da pessoa)', () => {
    expect(doTipo(alertas([lci('2033-09-28')], '2027-09-28'), 'PRAZO_INCOMPATIVEL').map((a) => a.horizonte)).toEqual(['2027-09-28']);
  });

  it('indisponível só num horizonte intermediário (nem a data do usuário, nem o mais distante): sem alerta', () => {
    expect(doTipo(alertas([lci('2027-09-28')]), 'PRAZO_INCOMPATIVEL')).toEqual([]);
  });

  const prefixado: OfertaCadastrada = { ...b, id: 'p', produto: 'TESOURO_PREFIXADO', indexacao: { tipo: 'PRE', taxaAA: 0.13 }, vencimento: '2033-01-01', liquidez: 'DIARIA' };

  it('sem data do usuário, marcação a mercado no horizonte mais distante não é prazo incompatível', () => {
    expect(doTipo(alertas([prefixado]), 'PRAZO_INCOMPATIVEL')).toEqual([]);
  });

  it('marcação a mercado na data do usuário: prazo incompatível com o motivo da marcação', () => {
    expect(doTipo(alertas([prefixado], '2028-01-15'), 'PRAZO_INCOMPATIVEL')).toEqual([
      { tipo: 'PRAZO_INCOMPATIVEL', oferta: 0, horizonte: '2028-01-15', disponivelEm: '2033-01-01', motivo: 'MARCACAO_A_MERCADO' },
    ]);
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

describe('FGC_LIMITE', () => {
  const carteiraFixa = (conglomerado: string, valor: number): ItemFGC => ({ conglomerado, produto: 'CDB', brutoEm: () => valor });
  const contexto = (carteira: ItemFGC[], valor = 45_000) => ({ carteira, valor, dataAplicacao: INI, cen: CEN });
  const comFGC = (ofertas: OfertaCadastrada[], carteira: ItemFGC[], valor = 45_000) => {
    const colunas = tabelaPorHorizonte(ofertas, valor, INI, horizontesPadrao(INI, null), CEN, PADRAO);
    return gerarAlertas(ofertas, colunas, LIMIAR_QUASE_EMPATE, undefined, contexto(carteira, valor));
  };
  /** O primeiro dia em que carteira + oferta passa de R$ 250 mil, dia a dia (a conta de referência). */
  function primeiroDia(carteira: number, o: OfertaCadastrada, valor: number): string {
    for (let d = somarDias(INI, 1); ; d = somarDias(d, 1)) {
      const bruto = simular({ produto: o.produto, indexacao: o.indexacao, valor, dataAplicacao: INI }, d, CEN).valorBruto;
      if (carteira + bruto > 250_000) return d;
    }
  }

  it('a carteira sozinha fica abaixo do limite; com a oferta aplicada pelo valor da comparação, passa, no dia exato', () => {
    const carteira = [carteiraFixa('  b ', 200_000)];
    expect(primeiraDataAcimaDoLimite(carteira, [INI, '2031-09-28'])).toEqual([]);
    const fgc = doTipo(comFGC([cdbVenc2031], carteira), 'FGC_LIMITE');
    const data = primeiroDia(200_000, cdbVenc2031, 45_000);
    const total = 200_000 + simular({ produto: 'CDB', indexacao: cdbVenc2031.indexacao, valor: 45_000, dataAplicacao: INI }, data, CEN).valorBruto;
    const totalNoFim = 200_000 + simular({ produto: 'CDB', indexacao: cdbVenc2031.indexacao, valor: 45_000, dataAplicacao: INI }, '2031-09-28', CEN).valorBruto;
    expect(fgc).toEqual([{
      tipo: 'FGC_LIMITE', oferta: 0, conglomerado: 'B', data, total, limite: 250_000, excedente: total - 250_000,
      fim: '2031-09-28', totalNoFim, excedenteNoFim: totalNoFim - 250_000,
    }]);
    expect(data > INI && data < '2028-09-28').toBe(true);
  });
  it('cenário da revisão: R$ 200 mil + R$ 40 mil em CDB 110% até 2031; o cruzamento e o excedente no fim', () => {
    const cdb110: OfertaCadastrada = { ...cdbVenc2031, indexacao: { tipo: 'POS_CDI', percentualCDI: 1.1 } };
    const [a, ...resto] = doTipo(comFGC([cdb110], [carteiraFixa('B', 200_000)], 40_000), 'FGC_LIMITE');
    expect(resto).toEqual([]);
    const brutoNoFim = simular({ produto: 'CDB', indexacao: cdb110.indexacao, valor: 40_000, dataAplicacao: INI }, '2031-09-28', CEN).valorBruto;
    expect(a).toMatchObject({ data: primeiroDia(200_000, cdb110, 40_000), fim: '2031-09-28', totalNoFim: 200_000 + brutoNoFim, excedenteNoFim: 200_000 + brutoNoFim - 250_000 });
    // No cruzamento o excedente é de centavos; no fim, dezenas de milhares.
    expect(a?.excedente).toBeLessThan(1_000);
    expect(a?.excedenteNoFim).toBeGreaterThan(29_000);
    expect(a?.excedenteNoFim).toBeLessThan(33_000);
  });
  it('sem vencimento, conta até o horizonte mais distante', () => {
    const fgc = doTipo(comFGC([cdbDiario(1)], [carteiraFixa('B', 200_000)]), 'FGC_LIMITE');
    expect(fgc.map((a) => a.data)).toEqual([primeiroDia(200_000, cdbDiario(1), 45_000)]);
  });
  it('só até o vencimento: a oferta que venceria abaixo do limite não alerta', () => {
    const curto: OfertaCadastrada = { ...cdbVenc2031, vencimento: '2027-03-01' };
    expect(doTipo(comFGC([curto], [carteiraFixa('B', 200_000)]), 'FGC_LIMITE')).toEqual([]);
  });
  it('o Tesouro não gera o alerta', () => {
    expect(doTipo(comFGC([tesouroSelic], [carteiraFixa('B', 249_000)]), 'FGC_LIMITE')).toEqual([]);
  });
  it('outro conglomerado não gera o alerta; o mesmo, com outra grafia, gera', () => {
    const outro: OfertaCadastrada = { ...cdbVenc2031, conglomerado: 'Outro Banco' };
    expect(doTipo(comFGC([outro], [carteiraFixa('B', 240_000)]), 'FGC_LIMITE')).toEqual([]);
    const acento: OfertaCadastrada = { ...cdbVenc2031, conglomerado: 'Banco São João' };
    expect(doTipo(comFGC([acento], [carteiraFixa('banco  sao joao', 240_000)]), 'FGC_LIMITE')).toHaveLength(1);
  });
  it('a carteira do conglomerado já acima: a oferta alerta na data de aplicação', () => {
    const [a] = doTipo(comFGC([cdbVenc2031], [carteiraFixa('B', 260_000)]), 'FGC_LIMITE');
    expect(a).toMatchObject({ oferta: 0, data: INI, total: 305_000, excedente: 55_000 });
  });
  it('sem o contexto, nada muda', () => {
    const ofertas = [cdbVenc2031, cdbDiario(1.028), tesouroSelic];
    const colunas = tabelaPorHorizonte(ofertas, 10000, INI, horizontesPadrao(INI, null), CEN, PADRAO);
    const sem = gerarAlertas(ofertas, colunas);
    expect(sem.some((a) => a.tipo === 'FGC_LIMITE')).toBe(false);
    expect(gerarAlertas(ofertas, colunas, LIMIAR_QUASE_EMPATE, undefined, contexto([], 10000))).toEqual(sem);
  });
  it('vem por último na ordem dos tipos', () => {
    const cdb2027: OfertaCadastrada = { ...cdbVenc2031, id: 'c', vencimento: '2027-09-01' };
    const tipos = comFGC([cdbVenc2031, cdb2027], [carteiraFixa('B', 200_000)]).map((a) => a.tipo);
    expect(tipos).toEqual(['IR_REINICIA', 'IOF', 'FGC_LIMITE', 'FGC_LIMITE']);
  });
  it('valor da comparação inválido lança', () => {
    expect(() => gerarAlertas([cdbVenc2031], [], LIMIAR_QUASE_EMPATE, undefined, contexto([], 0))).toThrow(RangeError);
  });
});

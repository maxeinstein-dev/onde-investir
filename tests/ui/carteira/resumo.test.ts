import { describe, expect, it } from 'vitest';
import { RegraNaoEncontradaError } from '../../../src/engine/erros';
import { cenarioConstante, type Cenario } from '../../../src/engine/indexadores';
import type { Posicao } from '../../../src/engine/posicoes';
import { valorAtual } from '../../../src/engine/posicoes';
import { resumirCarteira } from '../../../src/ui/carteira/resumo';

const CEN = cenarioConstante({ cdiAA: 0.1365, selicMetaAA: 0.1375, ipcaAA: 0.0422, trAM: 0.001646 });
const HOJE = '2026-09-28';

const base = { liquidez: 'NO_VENCIMENTO' as const, eventos: [], dataAplicacao: '2026-01-05' };
const cdb = (id: string, conglomerado: string, valorAplicado: number, vencimento: string): Posicao => ({
  ...base, id, produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 }, emissor: `Banco ${id}`, conglomerado,
  valorAplicado, vencimento,
});
const tesouro: Posicao = {
  ...base, id: 't', produto: 'TESOURO_SELIC', indexacao: { tipo: 'SELIC' }, emissor: 'Tesouro Nacional', conglomerado: 'Tesouro Nacional',
  liquidez: 'DIARIA', valorAplicado: 50_000, vencimento: '2031-03-01',
};

describe('resumirCarteira', () => {
  it('cada posição com o valor de hoje, e o total bruto e líquido', () => {
    const a = cdb('a', 'Grupo A', 10_000, '2028-01-03');
    const b = cdb('b', 'Grupo B', 20_000, '2027-01-04');
    const r = resumirCarteira([a, b], HOJE, CEN);
    const va = valorAtual(a, HOJE, CEN);
    const vb = valorAtual(b, HOJE, CEN);
    expect(r.linhas.map((l) => ('valor' in l ? l.valor : null))).toEqual([va, vb]);
    expect(r.total.bruto).toBeCloseTo(va.bruto + vb.bruto, 8);
    expect(r.total.liquido).toBeCloseTo(va.liquido + vb.liquido, 8);
    expect(r.naoCalculadas).toEqual([]);
  });

  it('posição que não pode ser calculada fica de fora do total e do FGC, com o motivo', () => {
    const quebra: Cenario = { ...CEN, selicOverAA: (d) => { throw new RegraNaoEncontradaError('Selic over', d); } };
    const a = cdb('a', 'Grupo A', 10_000, '2028-01-03');
    const r = resumirCarteira([a, tesouro], HOJE, quebra);
    expect(r.linhas[1]).toEqual({ posicao: tesouro, erro: expect.stringContaining('A regra "Selic over" não está cadastrada') });
    expect(r.naoCalculadas).toEqual([tesouro]);
    expect(r.total.bruto).toBeCloseTo(valorAtual(a, HOJE, quebra).bruto, 8);
    expect(r.fgc.ok && r.fgc.tesouro).toBeNull();
  });

  it('exposição por conglomerado (nome normalizado), com o valor de hoje e o do vencimento mais distante', () => {
    const a = cdb('a', 'Banco X', 100_000, '2028-01-03');
    const b = cdb('b', 'banco  x', 100_000, '2029-01-02');
    const c = cdb('c', 'Outro', 10_000, '2027-01-04');
    const r = resumirCarteira([a, b, c], HOJE, CEN);
    if (!r.fgc.ok) throw new Error('FGC deveria ter sido calculado');
    const [x, outro] = r.fgc.conglomerados;
    expect(x?.nome).toBe('Banco X');
    expect(x?.hoje).toBeCloseTo(valorAtual(a, HOJE, CEN).bruto + valorAtual(b, HOJE, CEN).bruto, 6);
    expect(x?.fim?.data).toBe('2029-01-02');
    // No vencimento mais distante, a que venceu antes já não conta.
    expect(x?.fim?.valor).toBeCloseTo(valorAtual(b, '2029-01-02', CEN).bruto, 6);
    expect(x?.limite).toBe(250_000);
    // R$ 200 mil a 13,65% a.a. passam de R$ 250 mil antes de 2028: o alerta traz a data do cruzamento.
    expect(x?.alerta?.data).toBeDefined();
    expect((x?.alerta?.data ?? '') > HOJE).toBe(true);
    expect((x?.alerta?.data ?? '9') < '2028-01-03').toBe(true);
    expect(outro?.nome).toBe('Outro');
    expect(outro?.alerta).toBeUndefined();
  });

  it('o Tesouro fica à parte, fora dos conglomerados', () => {
    const r = resumirCarteira([tesouro, cdb('a', 'Grupo A', 10_000, '2028-01-03')], HOJE, CEN);
    if (!r.fgc.ok) throw new Error('FGC deveria ter sido calculado');
    expect(r.fgc.conglomerados.map((g) => g.nome)).toEqual(['Grupo A']);
    expect(r.fgc.tesouro?.bruto).toBeCloseTo(valorAtual(tesouro, HOJE, CEN).bruto, 8);
  });

  it('teto global: a garantia somada conta até o limite em cada conglomerado; acima de R$ 1 milhão, o alerta', () => {
    const cinco = ['A', 'B', 'C', 'D', 'E'].map((g) => cdb(g, `Grupo ${g}`, 240_000, '2027-01-04'));
    const r = resumirCarteira(cinco, HOJE, CEN);
    if (!r.fgc.ok) throw new Error('FGC deveria ter sido calculado');
    expect(r.fgc.teto).toBe(1_000_000);
    expect(r.fgc.garantiaSomada).toBeGreaterThan(1_000_000);
    expect(r.fgc.tetoGlobal).not.toBeNull();
    const um = resumirCarteira([cdb('a', 'Grupo A', 1_200_000, '2027-01-04')], HOJE, CEN);
    if (!um.fgc.ok) throw new Error('FGC deveria ter sido calculado');
    expect(um.fgc.garantiaSomada).toBe(250_000);
    expect(um.fgc.tetoGlobal).toBeNull();
  });

  describe('posições vencidas', () => {
    const vencida = (id: string, conglomerado: string, valorAplicado: number, produto: Posicao['produto'] = 'CDB'): Posicao => ({
      ...cdb(id, conglomerado, valorAplicado, '2026-09-01'), produto, dataAplicacao: '2024-09-02',
    });

    it('ficam fora do total, com a linha e o valor no vencimento', () => {
      const ativa = cdb('a', 'Grupo A', 10_000, '2028-01-03');
      const v = vencida('v', 'Grupo A', 50_000);
      const r = resumirCarteira([ativa, v], HOJE, CEN);
      expect(r.linhas[1]).toEqual({ posicao: v, valor: valorAtual(v, HOJE, CEN) });
      expect(r.total.bruto).toBeCloseTo(valorAtual(ativa, HOJE, CEN).bruto, 8);
      expect(r.total.liquido).toBeCloseTo(valorAtual(ativa, HOJE, CEN).liquido, 8);
      expect(r.vencidas).toEqual([v]);
    });

    it('LCA de R$ 300 mil vencida: fora da exposição, sem barra estourada e sem alerta', () => {
      const r = resumirCarteira([vencida('v', 'Grupo A', 300_000, 'LCA')], HOJE, CEN);
      if (!r.fgc.ok) throw new Error('FGC deveria ter sido calculado');
      expect(r.fgc.conglomerados).toEqual([]);
      expect(r.fgc.garantiaSomada).toBe(0);
    });

    it('fora do "no vencimento mais distante" e do valor de hoje do conglomerado', () => {
      const ativa = cdb('a', 'Grupo A', 100_000, '2027-01-04');
      const r = resumirCarteira([ativa, vencida('v', 'grupo a', 200_000)], HOJE, CEN);
      if (!r.fgc.ok) throw new Error('FGC deveria ter sido calculado');
      const [g] = r.fgc.conglomerados;
      expect(g?.hoje).toBeCloseTo(valorAtual(ativa, HOJE, CEN).bruto, 6);
      expect(g?.fim).toEqual({ data: '2027-01-04', valor: valorAtual(ativa, '2027-01-04', CEN).bruto });
      expect(g?.alerta).toBeUndefined();
    });
  });

  it('carteira já acima do limite hoje: o alerta é de hoje', () => {
    const r = resumirCarteira([cdb('a', 'Grupo A', 300_000, '2027-01-04')], HOJE, CEN);
    if (!r.fgc.ok) throw new Error('FGC deveria ter sido calculado');
    expect(r.fgc.conglomerados[0]?.alerta?.data).toBe(HOJE);
  });
});

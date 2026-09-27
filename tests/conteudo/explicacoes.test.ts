import { describe, expect, it } from 'vitest';
import { explicarSimulacao } from '../../src/conteudo/explicacoes';
import { simular, type Aplicacao } from '../../src/engine/produtos';
import { CEN, INI } from '../engine/cenarioPadrao';

const cdb: Aplicacao = { produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, valor: 10000, dataAplicacao: INI };

describe('explicarSimulacao', () => {
  it('CDB: aplicado, rendimento, IOF, IR, líquido — com os números da simulação', () => {
    const passos = explicarSimulacao(simular(cdb, '2028-09-28', CEN));
    expect(passos.map((p) => p.id)).toEqual(['aplicado', 'rendimentoBruto', 'iof', 'ir', 'liquido']);
    const ir = passos.find((p) => p.id === 'ir');
    expect(ir?.curto).toMatch(/731 dias/);
    expect(ir?.curto).toMatch(/15%/);
    expect(ir?.fonte).toMatch(/l11033/);
    expect(passos.find((p) => p.id === 'iof')?.curto).toMatch(/Sem IOF/);
    expect(passos.find((p) => p.id === 'rendimentoBruto')?.matematica).toMatch(/502 dias úteis/);
  });
  it('IOF cobrado aparece com a alíquota', () => {
    const passos = explicarSimulacao(simular({ ...cdb, indexacao: { tipo: 'POS_CDI', percentualCDI: 1 } }, '2026-10-13', CEN));
    expect(passos.find((p) => p.id === 'iof')?.curto).toMatch(/15 dias.*50%/);
  });
  it('LCI: sem passo de IOF, IR explica a isenção', () => {
    const passos = explicarSimulacao(simular({ ...cdb, produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 } }, '2028-09-28', CEN));
    expect(passos.map((p) => p.id)).toEqual(['aplicado', 'rendimentoBruto', 'ir', 'liquido']);
    expect(passos.find((p) => p.id === 'ir')?.curto).toMatch(/isenta de IR/);
  });
  it('Tesouro: inclui custódia', () => {
    const passos = explicarSimulacao(simular({ ...cdb, produto: 'TESOURO_SELIC', indexacao: { tipo: 'SELIC' }, valor: 50000 }, '2027-09-28', CEN));
    expect(passos.map((p) => p.id)).toContain('custodia');
  });
  it('Poupança: explica o aniversário', () => {
    const passos = explicarSimulacao(simular({ ...cdb, produto: 'POUPANCA', indexacao: { tipo: 'POUPANCA' } }, '2027-03-27', CEN));
    expect(passos.find((p) => p.id === 'rendimentoBruto')?.curto).toMatch(/5 aniversários/);
  });
});

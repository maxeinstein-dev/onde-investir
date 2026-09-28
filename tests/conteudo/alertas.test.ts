import { describe, expect, it } from 'vitest';
import { textoDoAlerta } from '../../src/conteudo/alertas';
import { GLOSSARIO } from '../../src/conteudo/glossario';
import { resumirTrocas } from '../../src/conteudo/serie';
import type { Alerta } from '../../src/engine/alertas';
import { horizontesPadrao } from '../../src/engine/comparacao';
import type { OfertaCadastrada } from '../../src/engine/ofertas';
import { INI } from '../engine/cenarioPadrao';

/** R$ com espaço comum ou NBSP. */
const R = String.raw`R\$\s?`;
const re = (s: string) => new RegExp(`^${s}$`);

const base = { emissor: 'Banco B', conglomerado: 'B' };
const cdbNoVencimento: OfertaCadastrada = { ...base, id: '1', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, vencimento: '2031-09-28', liquidez: 'NO_VENCIMENTO' };
const cdbDiario: OfertaCadastrada = { ...base, id: '2', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.028 }, liquidez: 'DIARIA' };
const tesouroSelic: OfertaCadastrada = { ...base, id: '3', produto: 'TESOURO_SELIC', indexacao: { tipo: 'SELIC' }, vencimento: '2032-03-01', liquidez: 'DIARIA' };
const lciNoVencimento: OfertaCadastrada = { ...base, id: '4', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.9 }, vencimento: '2029-09-28', liquidez: 'NO_VENCIMENTO' };
const lciDiaria: OfertaCadastrada = { ...lciNoVencimento, id: '5', liquidez: 'DIARIA' };
const ofertas = [cdbNoVencimento, cdbDiario, tesouroSelic, lciNoVencimento, lciDiaria];
const horizontes = horizontesPadrao(INI, '2028-01-15');

describe('textoDoAlerta', () => {
  it('QUASE_EMPATE com liquidez', () => {
    const a: Alerta = { tipo: 'QUASE_EMPATE', horizonte: '2031-09-28', lider: 0, alternativa: 1, diferenca: 35.5, diferencaPercentual: 0.0023, vantagem: 'LIQUIDEZ' };
    const t = textoDoAlerta(a, ofertas, horizontes);
    expect(t.titulo).toBe('Diferença pequena, liquidez maior');
    expect(t.oQue).toMatch(re(String.raw`CDB 102,8% do CDI \(Banco B\) rende só ${R}35,50 \(0,23%\) a menos que CDB 103% do CDI \(Banco B\) em 5 anos e deixa resgatar quando quiser\.`));
    expect(t.porQue).toBe('Dinheiro que pode sair a qualquer momento vale mais quando o plano pode mudar.');
    expect(t.termo).toBe('liquidez');
  });

  it('QUASE_EMPATE com garantia do Tesouro', () => {
    const a: Alerta = { tipo: 'QUASE_EMPATE', horizonte: '2028-01-15', lider: 1, alternativa: 2, diferenca: 12, diferencaPercentual: 0.001, vantagem: 'GARANTIA' };
    const t = textoDoAlerta(a, ofertas, horizontes);
    expect(t.titulo).toBe('Diferença pequena, garantia do Tesouro');
    expect(t.oQue).toMatch(re(String.raw`Tesouro Selic \(Banco B\) rende só ${R}12,00 \(0,1%\) a menos que CDB 102,8% do CDI \(Banco B\) em 15/01/2028 \(sua data\) e tem a garantia do Tesouro Nacional\.`));
    expect(t.porQue).toMatch(/FGC/);
    expect(t.termo).toBe('tesouro');
  });

  it('IR_REINICIA', () => {
    const a: Alerta = { tipo: 'IR_REINICIA', oferta: 0, data: '2027-09-28', aliquotaNova: 0.175, aliquotaSemReaplicar: 0.15 };
    const t = textoDoAlerta(a, ofertas, horizontes);
    expect(t.titulo).toBe('O IR recomeça na reaplicação');
    expect(t.oQue).toBe('Na reaplicação de CDB 103% do CDI (Banco B) em 28/09/2027, o IR volta para 17,5%. Sem reaplicar, seria 15%.');
    expect(t.porQue).toMatch(/recomeça/);
    expect(t.termo).toBe('ir-regressivo');
  });

  it('IOF', () => {
    const a: Alerta = { tipo: 'IOF', oferta: 0, horizonte: '2027-09-28', iof: 3.21 };
    const t = textoDoAlerta(a, ofertas, horizontes);
    expect(t.titulo).toBe('Resgate com IOF');
    expect(t.oQue).toMatch(re(String.raw`Resgate antes de 30 dias: em 1 ano, CDB 103% do CDI \(Banco B\) paga ${R}3,21 de IOF\.`));
    expect(t.porQue).toMatch(/30 dias/);
    expect(t.termo).toBe('iof');
  });

  it('PRAZO_INCOMPATIVEL: só no vencimento', () => {
    const a: Alerta = { tipo: 'PRAZO_INCOMPATIVEL', oferta: 3, horizonte: '2028-01-15', disponivelEm: '2029-09-28' };
    const t = textoDoAlerta(a, ofertas, horizontes);
    expect(t.titulo).toBe('Prazo incompatível');
    expect(t.oQue).toBe('Não dá para resgatar LCI 90% do CDI (Banco B) em 15/01/2028 (sua data). Só no vencimento (28/09/2029).');
    expect(t.termo).toBe('liquidez');
  });

  it('PRAZO_INCOMPATIVEL: prazo mínimo legal', () => {
    const a: Alerta = { tipo: 'PRAZO_INCOMPATIVEL', oferta: 4, horizonte: '2031-09-28', disponivelEm: '2027-03-28' };
    const t = textoDoAlerta(a, ofertas, horizontes);
    expect(t.oQue).toBe('Não dá para resgatar LCI 90% do CDI (Banco B) em 5 anos. Prazo mínimo até 28/03/2027.');
    expect(t.termo).toBe('prazo-minimo');
  });

  it('PRAZO_INCOMPATIVEL sem data de liberação', () => {
    const a: Alerta = { tipo: 'PRAZO_INCOMPATIVEL', oferta: 3, horizonte: '2031-09-28' };
    const t = textoDoAlerta(a, ofertas, horizontes);
    expect(t.oQue).toBe('Não dá para resgatar LCI 90% do CDI (Banco B) em 5 anos.');
    expect(t.termo).toBe('liquidez');
  });

  it('horizonte fora da lista: a data', () => {
    const a: Alerta = { tipo: 'IOF', oferta: 0, horizonte: '2027-10-01', iof: 1 };
    expect(textoDoAlerta(a, ofertas).oQue).toMatch(/^Resgate antes de 30 dias: em 01\/10\/2027, /);
  });

  it('todo texto tem as três partes e um termo do glossário', () => {
    const todos: Alerta[] = [
      { tipo: 'QUASE_EMPATE', horizonte: '2031-09-28', lider: 0, alternativa: 1, diferenca: 1, diferencaPercentual: 0.001, vantagem: 'LIQUIDEZ' },
      { tipo: 'QUASE_EMPATE', horizonte: '2031-09-28', lider: 0, alternativa: 2, diferenca: 1, diferencaPercentual: 0.001, vantagem: 'GARANTIA' },
      { tipo: 'IR_REINICIA', oferta: 0, data: '2027-09-28', aliquotaNova: 0.2, aliquotaSemReaplicar: 0.15 },
      { tipo: 'IOF', oferta: 0, horizonte: '2027-09-28', iof: 1 },
      { tipo: 'PRAZO_INCOMPATIVEL', oferta: 3, horizonte: '2031-09-28', disponivelEm: '2029-09-28' },
      { tipo: 'PRAZO_INCOMPATIVEL', oferta: 4, horizonte: '2031-09-28', disponivelEm: '2027-03-28' },
    ];
    for (const a of todos) {
      const t = textoDoAlerta(a, ofertas, horizontes);
      expect(t.titulo.length, a.tipo).toBeGreaterThan(5);
      expect(t.oQue.length, a.tipo).toBeGreaterThan(20);
      expect(t.porQue.length, a.tipo).toBeGreaterThan(20);
      expect(GLOSSARIO[t.termo], a.tipo).toBeDefined();
    }
  });
});

describe('resumirTrocas', () => {
  const [a, b, c] = [cdbNoVencimento, cdbDiario, tesouroSelic];
  const lista = [a, b, c];

  it('sem trocas: quem lidera o tempo todo', () => {
    expect(resumirTrocas([], lista, [0])).toEqual(['CDB 103% do CDI (Banco B) lidera o tempo todo.']);
  });
  it('sem trocas e empate no topo', () => {
    expect(resumirTrocas([], lista, [0, 1])).toEqual(['CDB 103% do CDI (Banco B) e CDB 102,8% do CDI (Banco B) empatam na liderança o tempo todo.']);
  });
  it('sem trocas e ninguém resgatável', () => {
    expect(resumirTrocas([], lista, [])).toEqual(['Nenhuma oferta pode ser resgatada no período.']);
  });
  it('uma troca: até a véspera, A; a partir da data, B', () => {
    expect(resumirTrocas([{ data: '2027-12-18', de: [0], para: [1] }], lista, [0])).toEqual([
      'Até 17/12/2027, CDB 103% do CDI (Banco B) lidera.',
      'A partir de 18/12/2027, CDB 102,8% do CDI (Banco B) passa a liderar.',
    ]);
  });
  it('várias trocas, com empate e ninguém resgatável no começo', () => {
    expect(resumirTrocas([
      { data: '2027-03-28', de: [], para: [0] },
      { data: '2028-01-10', de: [0], para: [0, 2] },
      { data: '2028-02-01', de: [0, 2], para: [2] },
    ], lista, [])).toEqual([
      'Até 27/03/2027, nenhuma oferta pode ser resgatada.',
      'A partir de 28/03/2027, CDB 103% do CDI (Banco B) passa a liderar.',
      'A partir de 10/01/2028, CDB 103% do CDI (Banco B) e Tesouro Selic (Banco B) empatam na liderança.',
      'A partir de 01/02/2028, Tesouro Selic (Banco B) passa a liderar.',
    ]);
  });
  it('troca para ninguém resgatável', () => {
    expect(resumirTrocas([{ data: '2028-01-10', de: [0], para: [] }], lista, [0])).toEqual([
      'Até 09/01/2028, CDB 103% do CDI (Banco B) lidera.',
      'A partir de 10/01/2028, nenhuma oferta pode ser resgatada.',
    ]);
  });
});

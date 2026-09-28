import { describe, expect, it } from 'vitest';
import { LICAO_DO_ALERTA, textoDoAlerta, textoDoTetoGlobal } from '../../src/conteudo/alertas';
import { LICOES } from '../../src/conteudo/licoes';
import { GLOSSARIO } from '../../src/conteudo/glossario';
import { resumirTrocas } from '../../src/conteudo/serie';
import type { Alerta } from '../../src/engine/alertas';
import { horizontesPadrao } from '../../src/engine/comparacao';
import type { OfertaCadastrada } from '../../src/engine/ofertas';
import type { Oferta } from '../../src/engine/produtos';
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
// As duas LCIs dividem o nome e o vencimento: nos textos, cada uma ganha o vencimento e a letra (nomesDistintos).
const ofertas = [cdbNoVencimento, cdbDiario, tesouroSelic, lciNoVencimento, lciDiaria];
const horizontes = horizontesPadrao(INI, '2028-01-15');
const CDB_103: Oferta = { produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 } };
const CDB_100: Oferta = { produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 } };

describe('textoDoAlerta', () => {
  it('QUASE_EMPATE com liquidez', () => {
    const a: Alerta = { tipo: 'QUASE_EMPATE', horizonte: '2031-09-28', lider: 0, lideres: [0], alternativa: 1, diferenca: 35.5, diferencaPercentual: 0.0023, vantagem: 'LIQUIDEZ' };
    const t = textoDoAlerta(a, ofertas, horizontes);
    expect(t.titulo).toBe('Diferença pequena, liquidez maior');
    expect(t.oQue).toMatch(re(String.raw`CDB 102,8% do CDI \(Banco B\) rende só ${R}35,50 \(0,23%\) a menos que CDB 103% do CDI \(Banco B\) em 5 anos e dá para resgatar a qualquer momento\.`));
    expect(t.porQue).toBe('Dinheiro que pode sair a qualquer momento vale mais quando o plano pode mudar.');
    expect(t.termo).toBe('liquidez');
  });

  it('QUASE_EMPATE com a poupança: resgate a qualquer momento, perdendo o rendimento do mês incompleto', () => {
    const poupanca: OfertaCadastrada = { ...base, id: 'p', produto: 'POUPANCA', indexacao: { tipo: 'POUPANCA' }, liquidez: 'DIARIA' };
    const a: Alerta = { tipo: 'QUASE_EMPATE', horizonte: '2031-09-28', lider: 0, lideres: [0], alternativa: 5, diferenca: 10, diferencaPercentual: 0.001, vantagem: 'LIQUIDEZ' };
    expect(textoDoAlerta(a, [...ofertas, poupanca], horizontes).oQue)
      .toMatch(/e dá para resgatar a qualquer momento \(na poupança, perdendo o rendimento do mês incompleto\)\.$/);
  });

  it('QUASE_EMPATE com empate exato e com vários líderes', () => {
    const empate: Alerta = { tipo: 'QUASE_EMPATE', horizonte: '2031-09-28', lider: 0, lideres: [0], alternativa: 1, diferenca: 0, diferencaPercentual: 0, vantagem: 'LIQUIDEZ' };
    expect(textoDoAlerta(empate, ofertas, horizontes).oQue)
      .toBe('CDB 102,8% do CDI (Banco B) rende o mesmo que CDB 103% do CDI (Banco B) em 5 anos e dá para resgatar a qualquer momento.');
    const dois: Alerta = { tipo: 'QUASE_EMPATE', horizonte: '2031-09-28', lider: 0, lideres: [0, 3], alternativa: 1, diferenca: 1, diferencaPercentual: 0.0001, vantagem: 'LIQUIDEZ' };
    expect(textoDoAlerta(dois, ofertas, horizontes).oQue).toMatch(/a menos que CDB 103% do CDI \(Banco B\) e LCI 90% do CDI \(Banco B\) · vence em 28\/09\/2029 · D em 5 anos/);
  });

  it('QUASE_EMPATE com garantia do Tesouro', () => {
    const a: Alerta = { tipo: 'QUASE_EMPATE', horizonte: '2028-01-15', lider: 1, lideres: [1], alternativa: 2, diferenca: 12, diferencaPercentual: 0.001, vantagem: 'GARANTIA' };
    const t = textoDoAlerta(a, ofertas, horizontes);
    expect(t.titulo).toBe('Diferença pequena, garantia do Tesouro');
    expect(t.oQue).toMatch(re(String.raw`Tesouro Selic \(Banco B\) rende só ${R}12,00 \(0,1%\) a menos que CDB 102,8% do CDI \(Banco B\) em 15/01/2028 \(sua data\) e tem a garantia do Tesouro Nacional\.`));
    // O limite do FGC sai da regra versionada (regras/fgc.ts), não de um texto fixo.
    expect(t.porQue).toBe('O FGC cobre até R$ 250 mil por pessoa em cada conglomerado financeiro se o banco quebrar, com teto de R$ 1 milhão a cada 4 anos. O título público tem a garantia do governo federal, o menor risco de crédito do país.');
    expect(t.termo).toBe('tesouro');
  });

  it('IR_REINICIA', () => {
    const a: Alerta = {
      tipo: 'IR_REINICIA', oferta: 0, data: '2027-09-28', horizonte: '2028-09-28', reinvestimento: CDB_103, etapa1Isenta: false,
      aliquotaNova: 0.175, aliquotaSemReaplicar: 0.15, custo: 42.1,
    };
    const t = textoDoAlerta(a, ofertas, horizontes);
    expect(t.titulo).toBe('O IR recomeça na reaplicação');
    expect(t.oQue).toMatch(re(String.raw`Em 2 anos, a reaplicação de CDB 103% do CDI \(Banco B\), feita em 28/09/2027, paga 17,5% de IR\. Se o dinheiro tivesse ficado aplicado desde o início, pagaria 15%, então a reaplicação custa ${R}42,10 a mais\.`));
    expect(t.porQue).toMatch(/recomeça/);
    expect(t.termo).toBe('ir-regressivo');
  });

  it('IR_REINICIA com a original isenta: passa a pagar IR', () => {
    const a: Alerta = {
      tipo: 'IR_REINICIA', oferta: 3, data: '2029-09-28', horizonte: '2031-09-28', reinvestimento: CDB_100, etapa1Isenta: true,
      aliquotaNova: 0.175, aliquotaSemReaplicar: 0, custo: 250,
    };
    const t = textoDoAlerta(a, ofertas, horizontes);
    expect(t.titulo).toBe('A reaplicação passa a pagar IR');
    expect(t.oQue).toMatch(re(String.raw`LCI 90% do CDI \(Banco B\) · vence em 28/09/2029 · D é isenta, mas ao vencer em 28/09/2029 o dinheiro vai para CDB 100% do CDI, que paga IR: ${R}250,00 no prazo de 5 anos\.`));
    expect(t.porQue).toMatch(/isentas/);
    expect(t.termo).toBe('reinvestimento');
  });

  it('IR_REINICIA com a original isenta, na sua data: até a data', () => {
    const a: Alerta = {
      tipo: 'IR_REINICIA', oferta: 3, data: '2027-06-01', horizonte: '2028-01-15', reinvestimento: CDB_100, etapa1Isenta: true,
      aliquotaNova: 0.225, aliquotaSemReaplicar: 0, custo: 12.5,
    };
    expect(textoDoAlerta(a, ofertas, horizontes).oQue)
      .toMatch(re(String.raw`LCI 90% do CDI \(Banco B\) · vence em 28/09/2029 · D é isenta, mas ao vencer em 01/06/2027 o dinheiro vai para CDB 100% do CDI, que paga IR: ${R}12,50 até 15/01/2028\.`));
  });

  it('IOF', () => {
    const a: Alerta = { tipo: 'IOF', oferta: 0, horizonte: '2027-09-28', iof: 3.21, etapa: 1, dias: 20 };
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
    expect(t.oQue).toBe('Não dá para resgatar LCI 90% do CDI (Banco B) · vence em 28/09/2029 · D em 15/01/2028 (sua data). Só no vencimento (28/09/2029).');
    expect(t.termo).toBe('liquidez');
  });

  it('PRAZO_INCOMPATIVEL: prazo mínimo legal', () => {
    const a: Alerta = { tipo: 'PRAZO_INCOMPATIVEL', oferta: 4, horizonte: '2031-09-28', disponivelEm: '2027-03-28' };
    const t = textoDoAlerta(a, ofertas, horizontes);
    expect(t.oQue).toBe('Não dá para resgatar LCI 90% do CDI (Banco B) · vence em 28/09/2029 · E em 5 anos: o resgate só é possível a partir de 28/03/2027.');
    expect(t.termo).toBe('prazo-minimo');
  });

  it('PRAZO_INCOMPATIVEL por marcação a mercado na data do usuário', () => {
    const prefixado: OfertaCadastrada = { ...base, id: '9', produto: 'TESOURO_PREFIXADO', indexacao: { tipo: 'PRE', taxaAA: 0.13 }, vencimento: '2033-01-01', liquidez: 'DIARIA' };
    const a: Alerta = { tipo: 'PRAZO_INCOMPATIVEL', oferta: 5, horizonte: '2028-01-15', disponivelEm: '2033-01-01', motivo: 'MARCACAO_A_MERCADO' };
    const t = textoDoAlerta(a, [...ofertas, prefixado], horizontes);
    expect(t.titulo).toBe('Venda antes do vencimento');
    expect(t.oQue).toMatch(/^Vender Tesouro Prefixado 13% a\.a\. \(Banco B\) antes de 01\/01\/2033 sai pelo preço de mercado\.$/);
    expect(t.porQue).toMatch(/curva/);
    expect(t.termo).toBe('marcacao-mercado');
  });

  it('PRAZO_INCOMPATIVEL sem data de liberação', () => {
    const a: Alerta = { tipo: 'PRAZO_INCOMPATIVEL', oferta: 3, horizonte: '2031-09-28' };
    const t = textoDoAlerta(a, ofertas, horizontes);
    expect(t.oQue).toBe('Não dá para resgatar LCI 90% do CDI (Banco B) · vence em 28/09/2029 · D em 5 anos.');
    expect(t.termo).toBe('liquidez');
  });

  it('IOF na reaplicação e no vencimento antes de 30 dias', () => {
    const reaplicacao: Alerta = { tipo: 'IOF', oferta: 0, horizonte: '2027-09-28', iof: 3.21, etapa: 2, dias: 27, vencimento: '2027-09-01' };
    expect(textoDoAlerta(reaplicacao, ofertas, horizontes).oQue)
      .toMatch(re(String.raw`CDB 103% do CDI \(Banco B\) vence em 01/09/2027 e o dinheiro reaplicado é resgatado 27 dias depois, então paga ${R}3,21 de IOF\.`));
    const umDia: Alerta = { ...reaplicacao, dias: 1 };
    expect(textoDoAlerta(umDia, ofertas, horizontes).oQue).toMatch(/resgatado 1 dia depois, então/);
    const noVencimento: Alerta = { tipo: 'IOF', oferta: 0, horizonte: '2031-09-28', iof: 5, etapa: 1, dias: 20, vencimento: '2026-10-18' };
    expect(textoDoAlerta(noVencimento, ofertas, horizontes).oQue)
      .toMatch(re(String.raw`CDB 103% do CDI \(Banco B\) vence em 18/10/2026, 20 dias depois da aplicação, então paga ${R}5,00 de IOF no vencimento\.`));
  });

  it('horizonte fora da lista: a data', () => {
    const a: Alerta = { tipo: 'IOF', oferta: 0, horizonte: '2027-10-01', iof: 1, etapa: 1, dias: 20 };
    expect(textoDoAlerta(a, ofertas).oQue).toMatch(/^Resgate antes de 30 dias: em 01\/10\/2027, /);
  });

  it('todo texto tem as três partes e um termo do glossário', () => {
    const todos: Alerta[] = [
      { tipo: 'QUASE_EMPATE', horizonte: '2031-09-28', lider: 0, lideres: [0], alternativa: 1, diferenca: 1, diferencaPercentual: 0.001, vantagem: 'LIQUIDEZ' },
      { tipo: 'QUASE_EMPATE', horizonte: '2031-09-28', lider: 0, lideres: [0], alternativa: 2, diferenca: 1, diferencaPercentual: 0.001, vantagem: 'GARANTIA' },
      { tipo: 'IR_REINICIA', oferta: 0, data: '2027-09-28', horizonte: '2028-09-28', reinvestimento: CDB_103, etapa1Isenta: false, aliquotaNova: 0.2, aliquotaSemReaplicar: 0.15, custo: 1 },
      { tipo: 'IR_REINICIA', oferta: 3, data: '2029-09-28', horizonte: '2031-09-28', reinvestimento: CDB_100, etapa1Isenta: true, aliquotaNova: 0.175, aliquotaSemReaplicar: 0, custo: 1 },
      { tipo: 'IOF', oferta: 0, horizonte: '2027-09-28', iof: 1, etapa: 1, dias: 20 },
      { tipo: 'IOF', oferta: 0, horizonte: '2027-09-28', iof: 1, etapa: 1, dias: 20, vencimento: '2026-10-18' },
      { tipo: 'IOF', oferta: 0, horizonte: '2027-09-28', iof: 1, etapa: 2, dias: 27, vencimento: '2027-09-01' },
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

describe('resumirTrocas com trocas relevantes (alternância fundida)', () => {
  const poupanca: OfertaCadastrada = { ...base, id: 'p', produto: 'POUPANCA', indexacao: { tipo: 'POUPANCA' }, liquidez: 'DIARIA' };
  const lci: OfertaCadastrada = { ...lciDiaria, id: 'l', vencimento: undefined };
  const lista = [poupanca, lci, cdbDiario];

  it('trecho oscilante entre a poupança e outra oferta: cita o aniversário da poupança', () => {
    expect(resumirTrocas([{ data: '2027-04-07', de: [0], para: [1], oscilante: true, alternancias: 11, alternam: [0, 1] }], lista, [0])).toEqual([
      'Até 06/04/2027, Poupança (Banco B) lidera.',
      'A partir de 07/04/2027, LCI 90% do CDI (Banco B) passa a liderar e alterna outras 11 vezes entre LCI 90% do CDI (Banco B) e Poupança (Banco B) por causa do aniversário da poupança.',
    ]);
  });

  it('oscilação sem poupança (ou com mais de duas ofertas): texto genérico', () => {
    expect(resumirTrocas([{ data: '2027-04-07', de: [1], para: [2], oscilante: true, alternancias: 2, alternam: [1, 2] }], lista, [1])[1])
      .toBe('A partir de 07/04/2027, CDB 102,8% do CDI (Banco B) passa a liderar e alterna outras 2 vezes.');
    expect(resumirTrocas([{ data: '2027-04-07', de: [0], para: [1], oscilante: true, alternancias: 1, alternam: [0, 1, 2] }], lista, [0])[1])
      .toBe('A partir de 07/04/2027, LCI 90% do CDI (Banco B) passa a liderar e alterna outra vez.');
  });

  it('o trecho inicial oscilante, com e sem trocas depois', () => {
    const inicial = { oscilante: true as const, alternancias: 2, alternam: [1, 2] };
    expect(resumirTrocas([], lista, [2], inicial)).toEqual(['CDB 102,8% do CDI (Banco B) lidera quase o tempo todo e alterna outras 2 vezes.']);
    expect(resumirTrocas([{ data: '2028-01-10', de: [2], para: [1] }], lista, [2], inicial)[0])
      .toBe('Até 09/01/2028, CDB 102,8% do CDI (Banco B) lidera e alterna outras 2 vezes.');
  });

  it('no máximo 5 frases: o que passa disso vira uma frase só', () => {
    const trocas = Array.from({ length: 8 }, (_, k) => ({ data: `2027-0${k + 1}-15`, de: [k % 2], para: [(k + 1) % 2] }));
    const resumo = resumirTrocas(trocas, lista, [0]);
    expect(resumo).toHaveLength(5);
    expect(resumo.slice(0, 4)).toEqual(resumirTrocas(trocas.slice(0, 3), lista, [0]));
    expect(resumo[4]).toBe('Depois, a liderança ainda muda outras 5 vezes até o fim do período.');
  });
});

describe('textoDoAlerta — FGC_LIMITE (rascunho, revisão no C2/C3)', () => {
  it('conta o conglomerado, a data, o total e o excedente, com o termo fgc', () => {
    const a: Alerta = {
      tipo: 'FGC_LIMITE', oferta: 0, conglomerado: 'B', data: '2027-07-29', total: 250_010.5, limite: 250_000, excedente: 10.5,
      fim: '2031-09-28', totalNoFim: 281_800.25, excedenteNoFim: 31_800.25, jaAcima: false, carteiraNaAplicacao: 200_000,
    };
    const t = textoDoAlerta(a, ofertas, horizontes);
    expect(t.titulo).toBe('Acima do limite do FGC');
    expect(t.oQue).toMatch(re(String.raw`Aplicando o valor da comparação em CDB 103% do CDI \(Banco B\), o total no conglomerado B passa de ${R}250 mil em 29/07/2027 e chega a ${R}281\.800,25 em 28/09/2031, ${R}31\.800,25 acima do que o FGC cobre\.`));
    expect(t.porQue).toMatch(/^O FGC cobre até R\$ 250 mil/);
    expect(t.termo).toBe('fgc');
    expect(GLOSSARIO[t.termo]).toBeDefined();
  });
});

describe('textoDoAlerta — FGC_LIMITE com a carteira já acima', () => {
  it('avisa que aplicar mais aumenta a parte sem garantia', () => {
    const a: Alerta = {
      tipo: 'FGC_LIMITE', oferta: 0, conglomerado: 'B', data: INI, total: 305_000, limite: 250_000, excedente: 55_000,
      fim: '2031-09-28', totalNoFim: 330_000, excedenteNoFim: 80_000, jaAcima: true, carteiraNaAplicacao: 260_000,
    };
    const t = textoDoAlerta(a, ofertas, horizontes);
    expect(t.titulo).toBe('Acima do limite do FGC');
    expect(t.oQue).toMatch(re(String.raw`Você já tem ${R}260\.000,00 no conglomerado B, acima dos ${R}250 mil que o FGC cobre\. Aplicar mais aqui aumenta a parte sem garantia\.`));
    expect(t.termo).toBe('fgc');
  });
});

describe('textoDoAlerta — FGC_NAO_CALCULADO', () => {
  it('itens da carteira de fora da conta', () => {
    const a: Alerta = { tipo: 'FGC_NAO_CALCULADO', oferta: 0, conglomerado: 'B', carteira: [1, 3], ofertaForaDaConta: false };
    const t = textoDoAlerta(a, ofertas, horizontes);
    expect(t.titulo).toBe('Conta do FGC incompleta');
    expect(t.oQue).toBe('Não deu para calcular 2 aplicações da sua carteira no conglomerado B, e elas ficaram de fora da conta do limite do FGC.');
    expect(t.termo).toBe('fgc');
    expect(textoDoAlerta({ ...a, carteira: [1] }, ofertas, horizontes).oQue).toBe('Não deu para calcular 1 aplicação da sua carteira no conglomerado B, e ela ficou de fora da conta do limite do FGC.');
  });
  it('a própria oferta de fora da conta', () => {
    const a: Alerta = { tipo: 'FGC_NAO_CALCULADO', oferta: 0, conglomerado: 'B', carteira: [], ofertaForaDaConta: true };
    expect(textoDoAlerta(a, ofertas, horizontes).oQue).toBe('Não deu para calcular CDB 103% do CDI (Banco B) até o fim do prazo, então o app não conferiu o limite do FGC no conglomerado B.');
  });
});

describe('textoDoTetoGlobal', () => {
  it('qualitativo: a garantia somada passa de R$ 1 milhão e o teto vale para 4 anos', () => {
    const t = textoDoTetoGlobal({ garantiaSomada: 1_250_000, teto: 1_000_000, conglomerados: [] });
    expect(t.oQue).toBe('Somando o que o FGC cobre em cada conglomerado, sua garantia passa de R$ 1 milhão. O teto de R$ 1 milhão vale para o que o FGC pagar em 4 anos, somando todas as instituições.');
    expect(t.termo).toBe('fgc');
  });
});

describe('alerta → lição (M3c, A4)', () => {
  const idsDeLicao = new Set(LICOES.map((l) => l.id));
  it('todo tipo de alerta tem uma lição existente', () => {
    const tipos: Record<Alerta['tipo'], true> = {
      QUASE_EMPATE: true, IR_REINICIA: true, IOF: true, PRAZO_INCOMPATIVEL: true, FGC_LIMITE: true, FGC_NAO_CALCULADO: true,
    };
    expect(Object.keys(LICAO_DO_ALERTA).sort()).toEqual(Object.keys(tipos).sort());
    for (const licao of Object.values(LICAO_DO_ALERTA)) expect(idsDeLicao.has(licao)).toBe(true);
  });
  it('o texto de cada alerta leva a lição correspondente', () => {
    const prefixado: OfertaCadastrada = { ...base, id: '9', produto: 'TESOURO_PREFIXADO', indexacao: { tipo: 'PRE', taxaAA: 0.13 }, vencimento: '2033-01-01', liquidez: 'DIARIA' };
    const lista = [...ofertas, prefixado];
    const casos: [Alerta, string][] = [
      [{ tipo: 'QUASE_EMPATE', horizonte: '2031-09-28', lider: 0, lideres: [0], alternativa: 1, diferenca: 1, diferencaPercentual: 0.001, vantagem: 'LIQUIDEZ' }, 'liquidez'],
      [{ tipo: 'QUASE_EMPATE', horizonte: '2031-09-28', lider: 1, lideres: [1], alternativa: 2, diferenca: 1, diferencaPercentual: 0.001, vantagem: 'GARANTIA' }, 'fgc'],
      [{ tipo: 'IR_REINICIA', oferta: 0, data: '2027-09-28', horizonte: '2028-09-28', reinvestimento: CDB_103, etapa1Isenta: false, aliquotaNova: 0.2, aliquotaSemReaplicar: 0.15, custo: 1 }, 'reaplicacao'],
      [{ tipo: 'IR_REINICIA', oferta: 3, data: '2029-09-28', horizonte: '2031-09-28', reinvestimento: CDB_100, etapa1Isenta: true, aliquotaNova: 0.175, aliquotaSemReaplicar: 0, custo: 1 }, 'reaplicacao'],
      [{ tipo: 'IOF', oferta: 0, horizonte: '2027-09-28', iof: 1, etapa: 1, dias: 20 }, 'impostos'],
      [{ tipo: 'PRAZO_INCOMPATIVEL', oferta: 3, horizonte: '2031-09-28', disponivelEm: '2029-09-28' }, 'liquidez'],
      [{ tipo: 'PRAZO_INCOMPATIVEL', oferta: 4, horizonte: '2031-09-28', disponivelEm: '2027-03-28' }, 'liquidez'],
      [{ tipo: 'PRAZO_INCOMPATIVEL', oferta: 3, horizonte: '2031-09-28' }, 'liquidez'],
      [{ tipo: 'PRAZO_INCOMPATIVEL', oferta: 5, horizonte: '2028-01-15', disponivelEm: '2033-01-01', motivo: 'MARCACAO_A_MERCADO' }, 'marcacao-mercado'],
      [{
        tipo: 'FGC_LIMITE', oferta: 0, conglomerado: 'B', data: '2027-07-29', total: 250_010.5, limite: 250_000, excedente: 10.5,
        fim: '2031-09-28', totalNoFim: 281_800.25, excedenteNoFim: 31_800.25, jaAcima: false, carteiraNaAplicacao: 200_000,
      }, 'fgc'],
      [{ tipo: 'FGC_NAO_CALCULADO', oferta: 0, conglomerado: 'B', carteira: [1], ofertaForaDaConta: false }, 'fgc'],
    ];
    for (const [a, licao] of casos) expect(textoDoAlerta(a, lista, horizontes).licao, `${a.tipo}`).toBe(licao);
  });
  it('o teto global leva à lição do FGC', () => {
    expect(textoDoTetoGlobal({ garantiaSomada: 1_250_000, teto: 1_000_000, conglomerados: [] }).licao).toBe('fgc');
  });
});

describe('resumo do gráfico com dados reais', () => {
  it('poupança × LCI 62% do CDI em 5 anos: a alternância mensal vira um trecho oscilante, e o resumo tem ≤ 5 frases', async () => {
    const { seriesDeValorLiquido, trocasDeLider, trocasRelevantes, lideresNoPonto } = await import('../../src/engine/serie');
    const { cenarioReal } = await import('../engine/cenarioReal');
    const cen = cenarioReal('BASE');
    const poupanca: OfertaCadastrada = { ...base, id: 'p', produto: 'POUPANCA', indexacao: { tipo: 'POUPANCA' }, liquidez: 'DIARIA' };
    const lci: OfertaCadastrada = { ...base, id: 'l', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.62 }, liquidez: 'DIARIA' };
    const ofertas = [poupanca, lci];
    const fim = '2031-09-28';
    const series = seriesDeValorLiquido(ofertas, 10000, INI, fim, cen, { tipo: 'PADRAO' });
    const todas = trocasDeLider(series, { ofertas, valor: 10000, dataAplicacao: INI, cen, regra: { tipo: 'PADRAO' } });
    expect(todas.length).toBeGreaterThan(10);
    const relevantes = trocasRelevantes(todas, { duracaoMinimaDias: 30, fim });
    const resumo = resumirTrocas(relevantes.trocas, ofertas, lideresNoPonto(series, 0), relevantes.inicial);
    expect(resumo.length).toBeLessThanOrEqual(5);
    expect(resumo.join(' ')).toMatch(/por causa do aniversário da poupança/);
  });
});

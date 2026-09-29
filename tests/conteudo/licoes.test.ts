// @vitest-environment jsdom
import { cleanup } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { CASOS_CLASSICOS } from '../../src/conteudo/casos';
import { GLOSSARIO } from '../../src/conteudo/glossario';
import { LICOES } from '../../src/conteudo/licoes';
import {
  type Experimente, type IdLicao, type Licao, montarExperimente, PALAVRAS_POR_MINUTO, palavrasDaLicao,
} from '../../src/conteudo/licoes/tipos';
import { ID_LICOES, idLicaoValido, TITULOS_LICOES } from '../../src/conteudo/licoes/titulos';
import { CENARIO_INICIAL } from '../../src/dados/cenarioInicial';
import { gerarAlertas } from '../../src/engine/alertas';
import { horizontesPadrao, tabelaPorHorizonte } from '../../src/engine/comparacao';
import { cenarioConstante } from '../../src/engine/indexadores';
import { validarOfertaCadastrada } from '../../src/engine/ofertas';
import { INI } from '../engine/cenarioPadrao';
import { oficial, semSintaxeCrua, soNumerosDasRegras } from './textoOficial';

afterEach(cleanup);

const TODAS: Record<IdLicao, true> = {
  'renda-fixa': true, indexadores: true, impostos: true, fgc: true, liquidez: true, 'marcacao-mercado': true,
  reserva: true, reaplicacao: true, diversificacao: true, 'renda-variavel': true,
};
const CONCEITUAIS: readonly IdLicao[] = ['diversificacao', 'renda-variavel'];

/** O cenário padrão: os valores de referência do cenário manual. */
const v = CENARIO_INICIAL.valores;
const CEN_PADRAO = cenarioConstante({ cdiAA: v.cdi / 100, selicMetaAA: v.selicMeta / 100, ipcaAA: v.ipca / 100, trAM: v.tr / 100 });

/** Os textos de uma lição que vão pelo MarkdownRestrito. */
const textosDaLicao = (l: Licao) => l.secoes.map((s) => s.texto);

/** Monta o "Experimente" em `hoje` e roda a comparação com o cenário padrão. */
function conferirExperimente(e: Experimente, rotulo: string, hoje: string) {
  expect(e.ofertas.length, rotulo).toBeGreaterThanOrEqual(2);
  expect(e.ofertas.length, rotulo).toBeLessThanOrEqual(5);
  expect(e.valor, rotulo).toBeGreaterThan(0);
  for (const o of e.ofertas) {
    if (o.vencimentoEmMeses !== undefined) expect(Number.isInteger(o.vencimentoEmMeses) && o.vencimentoEmMeses >= 1, rotulo).toBe(true);
  }
  if (e.mesesAteSuaData !== undefined) expect(Number.isInteger(e.mesesAteSuaData) && e.mesesAteSuaData >= 1, rotulo).toBe(true);
  const m = montarExperimente(e, hoje);
  const ofertas = m.ofertas.map((o, i) => ({ ...o, id: `exp-${i}` }));
  for (const o of ofertas) expect(() => validarOfertaCadastrada(o), rotulo).not.toThrow();
  const horizontes = horizontesPadrao(m.dataAplicacao, m.suaData ?? null);
  const colunas = tabelaPorHorizonte(ofertas, m.valor, m.dataAplicacao, horizontes, CEN_PADRAO, m.regra);
  expect(() => gerarAlertas(ofertas, colunas, undefined, m.suaData, { carteira: [], valor: m.valor, dataAplicacao: m.dataAplicacao, cen: CEN_PADRAO }), rotulo).not.toThrow();
  // Ao menos uma oferta tem resultado em algum horizonte: o exemplo mostra alguma coisa.
  expect(colunas.some((c) => c.projecoes.some((p) => p.estado === 'DISPONIVEL')), rotulo).toBe(true);
  // Nenhuma oferta vence antes da aplicação.
  for (const c of colunas) for (const p of c.projecoes) if (p.estado === 'INDISPONIVEL') expect(p.motivo, rotulo).not.toMatch(/vence antes/);
}

describe('lições (integridade)', () => {
  it('10 lições, ids únicos e de todos os tipos, ordem 1..10', () => {
    expect(LICOES).toHaveLength(10);
    expect(new Set(LICOES.map((l) => l.id)).size).toBe(10);
    expect(new Set(LICOES.map((l) => l.id))).toEqual(new Set(Object.keys(TODAS)));
    expect(LICOES.map((l) => l.ordem)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('titulos.ts (fora do chunk pesado) bate com o título e a ordem de cada lição', () => {
    expect(ID_LICOES).toEqual(LICOES.map((l) => l.id));
    for (const l of LICOES) {
      expect(TITULOS_LICOES[l.id], l.id).toBe(l.titulo);
      expect(idLicaoValido(l.id)).toBe(true);
    }
    expect(idLicaoValido('nao-existe')).toBe(false);
  });

  it('título, resumo de uma frase e seções preenchidas', () => {
    for (const l of LICOES) {
      expect(l.titulo.trim().length, l.id).toBeGreaterThan(3);
      expect(l.resumo, l.id).toMatch(/^[^.!?]+[.!?]$/);
      expect(l.secoes.length, l.id).toBeGreaterThanOrEqual(2);
      for (const s of l.secoes) {
        expect(s.titulo.trim().length, l.id).toBeGreaterThan(2);
        expect(s.texto.trim().length, l.id).toBeGreaterThan(40);
      }
    }
  });

  it('toda fonte é https e de domínio oficial, e cada lição tem ao menos uma', () => {
    for (const l of LICOES) {
      expect(l.fontes.length, l.id).toBeGreaterThanOrEqual(1);
      expect(new Set(l.fontes).size, l.id).toBe(l.fontes.length);
      for (const f of l.fontes) expect(oficial(f), `${l.id}: ${f}`).toBe(true);
    }
  });

  it('todo termo existe no glossário', () => {
    for (const l of LICOES) {
      expect(l.termos.length, l.id).toBeGreaterThanOrEqual(1);
      for (const t of l.termos) expect(GLOSSARIO[t], `${l.id}: ${t}`).toBeDefined();
    }
  });

  it('as lições 1 a 8 têm "Experimente"; diversificação e renda variável, não', () => {
    for (const l of LICOES) expect(l.experimente === undefined, l.id).toBe(CONCEITUAIS.includes(l.id));
  });

  it('todo "Experimente" tem de 2 a 5 ofertas válidas e roda a comparação com o cenário padrão', () => {
    for (const l of LICOES) if (l.experimente) conferirExperimente(l.experimente, l.id, INI);
  });

  it('o "Experimente" não envelhece: continua válido aberto daqui a 10 anos', () => {
    for (const l of LICOES) if (l.experimente) conferirExperimente(l.experimente, l.id, '2036-09-29');
  });

  it('o texto passa pelo MarkdownRestrito sem sobrar sintaxe crua', () => {
    for (const l of LICOES) {
      for (const [i, t] of textosDaLicao(l).entries()) semSintaxeCrua(t, `${l.id}, seção ${i + 1}`);
      semSintaxeCrua(l.resumo, `${l.id}, resumo`);
    }
  });

  it('os números com % e R$ saem das regras do engine', () => {
    for (const l of LICOES) {
      for (const t of [l.titulo, l.resumo, ...l.secoes.flatMap((s) => [s.titulo, s.texto])]) soNumerosDasRegras(t, l.id);
    }
  });

  it('leitura de 1 a 4 minutos, a 200 palavras por minuto', () => {
    for (const l of LICOES) {
      const minutos = Math.max(1, Math.ceil(palavrasDaLicao(l) / PALAVRAS_POR_MINUTO));
      expect(l.tempoLeituraMin, l.id).toBe(minutos);
      expect(minutos, l.id).toBeGreaterThanOrEqual(1);
      expect(minutos, l.id).toBeLessThanOrEqual(4);
    }
  });

  it('a lição de renda variável explica o que o app faz e não indica ativo', () => {
    const rv = LICOES.find((l) => l.id === 'renda-variavel');
    const texto = rv?.secoes.map((s) => s.texto).join('\n') ?? '';
    expect(texto).toMatch(/aba Renda variável/);
    expect(texto).toMatch(/não indica ações/);
    // Sem códigos de negociação (PETR4, BOVA11...).
    expect(texto).not.toMatch(/\b[A-Z]{4}\d{1,2}\b/);
  });
});

describe('casos clássicos (integridade)', () => {
  it('4 casos com ids únicos', () => {
    expect(CASOS_CLASSICOS).toHaveLength(4);
    expect(new Set(CASOS_CLASSICOS.map((c) => c.id)).size).toBe(4);
  });

  it('cada caso tem pergunta, explicação sem sintaxe crua, lição existente e "Experimente" válido', () => {
    for (const c of CASOS_CLASSICOS) {
      expect(c.pergunta, c.id).toMatch(/\?$/);
      expect(c.explicacao.trim().length, c.id).toBeGreaterThan(40);
      expect(TODAS[c.licao], c.id).toBe(true);
      semSintaxeCrua(c.explicacao, c.id);
      soNumerosDasRegras(`${c.titulo} ${c.pergunta} ${c.explicacao}`, c.id);
      conferirExperimente(c.experimente, c.id, INI);
      conferirExperimente(c.experimente, c.id, '2036-09-29');
    }
  });

  it('Poupança × Tesouro Selic: a regra dos 70% vale só para depósitos desde 04/05/2012, com as duas leis', () => {
    const texto = CASOS_CLASSICOS.find((c) => c.id === 'caso-poupanca-selic')?.explicacao ?? '';
    expect(texto).toContain('Nos depósitos feitos desde 04/05/2012, a poupança rende 0,5% ao mês mais a TR quando a Selic está acima de 8,5% ao ano.');
    expect(texto).toContain('Com a Selic igual ou abaixo disso, rende 70% da Selic mais a TR');
    expect(texto).toContain('Depósitos anteriores seguem com 0,5% ao mês mais a TR');
    expect(texto).toContain('(https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2012/lei/l12703.htm)');
    expect(texto).toContain('[Lei 8.177/1991](https://www.planalto.gov.br/ccivil_03/leis/l8177.htm)');
  });

  it('o caso do prefixado usa o cenário "Juros sobem"', () => {
    const caso = CASOS_CLASSICOS.find((c) => /prefixado/i.test(c.titulo));
    expect(caso?.experimente.cenario).toBe('SOBEM');
  });
});

describe('montarExperimente', () => {
  it('resolve vencimentos e a sua data a partir de hoje, e a regra padrão', () => {
    const m = montarExperimente({
      ofertas: [
        { produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 }, emissor: 'Banco A', conglomerado: 'A', liquidez: 'DIARIA' },
        { produto: 'CDB', indexacao: { tipo: 'PRE', taxaAA: 0.12 }, emissor: 'Banco B', conglomerado: 'B', liquidez: 'NO_VENCIMENTO', vencimentoEmMeses: 24 },
      ],
      valor: 1000, mesesAteSuaData: 6,
    }, '2026-08-31');
    expect(m.dataAplicacao).toBe('2026-08-31');
    expect(m.ofertas[0]).not.toHaveProperty('vencimento');
    expect(m.ofertas[1]?.vencimento).toBe('2028-08-31');
    expect(m.ofertas[1]).not.toHaveProperty('vencimentoEmMeses');
    expect(m.suaData).toBe('2027-02-28');
    expect(m.regra).toEqual({ tipo: 'PADRAO' });
    expect(m).not.toHaveProperty('cenario');
  });
});

describe('os links do texto e as fontes', () => {
  it('todo link no texto de uma lição está na lista de fontes dela', () => {
    for (const l of LICOES) {
      for (const s of l.secoes) for (const m of s.texto.matchAll(/\]\(([^)\s]+)\)/g)) expect(l.fontes, `${l.id}: ${m[1]}`).toContain(m[1]);
    }
  });
});

/** Os alertas do "Experimente" com o cenário padrão, montado em INI. */
function alertasDo(e: Experimente) {
  const m = montarExperimente(e, INI);
  const ofertas = m.ofertas.map((o, i) => ({ ...o, id: `exp-${i}` }));
  const colunas = tabelaPorHorizonte(ofertas, m.valor, m.dataAplicacao, horizontesPadrao(m.dataAplicacao, m.suaData ?? null), CEN_PADRAO, m.regra);
  return { colunas, alertas: gerarAlertas(ofertas, colunas, undefined, m.suaData, { carteira: [], valor: m.valor, dataAplicacao: m.dataAplicacao, cen: CEN_PADRAO }) };
}
const experimenteDe = (id: IdLicao) => {
  const e = LICOES.find((l) => l.id === id)?.experimente;
  if (!e) throw new Error(`sem experimente: ${id}`);
  return e;
};
const casoDe = (id: string) => {
  const c = CASOS_CLASSICOS.find((x) => x.id === id);
  if (!c) throw new Error(`sem caso: ${id}`);
  return c.experimente;
};

describe('o que o texto promete, a comparação mostra', () => {
  it('FGC: o valor do exemplo passa do limite e gera o alerta', () => {
    expect(alertasDo(experimenteDe('fgc')).alertas.some((a) => a.tipo === 'FGC_LIMITE')).toBe(true);
  });
  it('liquidez: na data próxima, há ofertas indisponíveis', () => {
    expect(alertasDo(experimenteDe('liquidez')).alertas.some((a) => a.tipo === 'PRAZO_INCOMPATIVEL')).toBe(true);
  });
  it('marcação a mercado: aviso de venda a preço de mercado na sua data', () => {
    expect(alertasDo(experimenteDe('marcacao-mercado')).alertas.some((a) => a.tipo === 'PRAZO_INCOMPATIVEL' && a.motivo === 'MARCACAO_A_MERCADO')).toBe(true);
  });
  it('reaplicação: a LCI reaplicada passa a pagar IR, e o CDB reaplicado recomeça o IR', () => {
    const irs = alertasDo(experimenteDe('reaplicacao')).alertas.filter((a) => a.tipo === 'IR_REINICIA');
    expect(irs.some((a) => a.tipo === 'IR_REINICIA' && a.etapa1Isenta)).toBe(true);
    expect(irs.some((a) => a.tipo === 'IR_REINICIA' && !a.etapa1Isenta)).toBe(true);
  });
  it('LCI × CDB: a oferta vencedora muda ao longo dos prazos', () => {
    const lideres = alertasDo(casoDe('caso-lci-cdb')).colunas.map((c) => c.lideres.join());
    expect(new Set(lideres).size).toBeGreaterThan(1);
  });
  it('prefixado com juros subindo: aviso de venda a preço de mercado na sua data', () => {
    expect(alertasDo(casoDe('caso-prefixado-juros-sobem')).alertas.some((a) => a.tipo === 'PRAZO_INCOMPATIVEL' && a.motivo === 'MARCACAO_A_MERCADO')).toBe(true);
  });
  it('custo de reaplicar: há o alerta de IR na reaplicação', () => {
    expect(alertasDo(casoDe('caso-custo-reaplicar')).alertas.some((a) => a.tipo === 'IR_REINICIA')).toBe(true);
  });
});

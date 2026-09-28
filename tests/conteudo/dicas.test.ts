// @vitest-environment jsdom
import { cleanup } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { type ContextoDica, DICAS, dicasPara, VOCE_SABIA, vocePassaSaber } from '../../src/conteudo/dicas';
import { LICOES } from '../../src/conteudo/licoes';
import type { Alerta } from '../../src/engine/alertas';
import type { OfertaCadastrada } from '../../src/engine/ofertas';
import type { Oferta } from '../../src/engine/produtos';
import { oficial, semSintaxeCrua, soNumerosDasRegras } from './textoOficial';

afterEach(cleanup);

const alfa = { emissor: 'Banco Alfa', conglomerado: 'Alfa' };
const beta = { emissor: 'Banco Beta', conglomerado: 'Beta' };
const gama = { emissor: 'Banco Gama', conglomerado: 'Gama' };
const tesouro = { emissor: 'Tesouro Nacional', conglomerado: 'Tesouro Nacional' };
const cdbPos: OfertaCadastrada = { ...alfa, id: 'a', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 }, liquidez: 'DIARIA' };
const cdbPre: OfertaCadastrada = { ...beta, id: 'b', produto: 'CDB', indexacao: { tipo: 'PRE', taxaAA: 0.13 }, vencimento: '2029-09-28', liquidez: 'NO_VENCIMENTO' };
const lci: OfertaCadastrada = { ...gama, id: 'c', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.9 }, vencimento: '2029-09-28', liquidez: 'DIARIA' };
const lca: OfertaCadastrada = { ...lci, id: 'd', produto: 'LCA' };
const poupanca: OfertaCadastrada = { ...gama, id: 'e', produto: 'POUPANCA', indexacao: { tipo: 'POUPANCA' }, liquidez: 'DIARIA' };
const prefixado: OfertaCadastrada = { ...tesouro, id: 'f', produto: 'TESOURO_PREFIXADO', indexacao: { tipo: 'PRE', taxaAA: 0.13 }, vencimento: '2029-01-01', liquidez: 'DIARIA' };
const ipca: OfertaCadastrada = { ...tesouro, id: 'g', produto: 'TESOURO_IPCA', indexacao: { tipo: 'IPCA_MAIS', taxaRealAA: 0.07 }, vencimento: '2035-05-15', liquidez: 'DIARIA' };
const selic: OfertaCadastrada = { ...tesouro, id: 'h', produto: 'TESOURO_SELIC', indexacao: { tipo: 'SELIC' }, vencimento: '2031-03-01', liquidez: 'DIARIA' };

const CDB_100: Oferta = { produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 } };
const irReinicia: Alerta = {
  tipo: 'IR_REINICIA', oferta: 0, data: '2027-09-28', horizonte: '2028-09-28', reinvestimento: CDB_100, etapa1Isenta: false,
  aliquotaNova: 0.175, aliquotaSemReaplicar: 0.15, custo: 10,
};

const ctx = (ofertas: OfertaCadastrada[], alertas: Alerta[] = []): ContextoDica => ({ ofertasNaComparacao: ofertas, alertas, temCarteira: false });
const ids = (c: ContextoDica, vistas: string[] = []) => dicasPara(c, new Set(vistas)).map((d) => d.id);
const umaDica = (c: ContextoDica) => {
  const d = dicasPara(c, new Set());
  expect(d).toHaveLength(1);
  return d[0];
};

describe('dicasPara: gatilhos', () => {
  it('sem gatilho, nenhuma dica', () => {
    expect(ids(ctx([cdbPos, cdbPre]))).toEqual([]);
    expect(ids(ctx([]))).toEqual([]);
  });
  it('LCI ou LCA: prazo mínimo, com a lição de liquidez', () => {
    expect(umaDica(ctx([cdbPre, lci]))).toMatchObject({ id: 'dica-prazo-minimo', licao: 'liquidez' });
    expect(umaDica(ctx([cdbPre, lca]))?.id).toBe('dica-prazo-minimo');
  });
  it('Tesouro Prefixado ou IPCA+: marcação a mercado', () => {
    expect(umaDica(ctx([cdbPos, prefixado]))).toMatchObject({ id: 'dica-marcacao', licao: 'marcacao-mercado' });
    expect(umaDica(ctx([cdbPos, ipca]))?.id).toBe('dica-marcacao');
    expect(ids(ctx([cdbPre, selic]))).toEqual([]);
  });
  it('poupança: aniversário', () => {
    expect(umaDica(ctx([cdbPre, poupanca]))).toMatchObject({ id: 'dica-aniversario', licao: 'liquidez' });
  });
  it('alerta de reaplicação: a lição 8', () => {
    expect(umaDica(ctx([cdbPos, cdbPre], [irReinicia]))).toMatchObject({ id: 'dica-reaplicacao', licao: 'reaplicacao' });
  });
  it('mais de uma oferta do mesmo conglomerado com FGC: FGC e diversificação', () => {
    const outraAlfa: OfertaCadastrada = { ...cdbPre, id: 'x', emissor: 'Banco Alfa Digital', conglomerado: ' ALFA ' };
    expect(umaDica(ctx([cdbPos, outraAlfa]))).toMatchObject({ id: 'dica-conglomerado', licao: 'fgc' });
    // O Tesouro não tem FGC: dois títulos do Tesouro não contam.
    expect(ids(ctx([selic, prefixado]))).not.toContain('dica-conglomerado');
  });
  it('só um indexador na comparação: diversificação (Selic e CDI contam como pós-fixado)', () => {
    const outroPos: OfertaCadastrada = { ...cdbPos, id: 'y', ...beta, indexacao: { tipo: 'POS_CDI', percentualCDI: 1.1 } };
    expect(umaDica(ctx([cdbPos, outroPos]))).toMatchObject({ id: 'dica-um-indexador', licao: 'diversificacao' });
    expect(umaDica(ctx([cdbPos, selic]))?.id).toBe('dica-um-indexador');
    // Com uma oferta só, não há comparação.
    expect(ids(ctx([cdbPos]))).toEqual([]);
  });
});

describe('dicasPara: limite e dispensa', () => {
  const muitas = ctx([lci, prefixado, poupanca], [irReinicia]);
  it('no máximo 2, na ordem de prioridade', () => {
    expect(ids(muitas)).toEqual(['dica-prazo-minimo', 'dica-marcacao']);
  });
  it('as já dispensadas não voltam, e as seguintes ocupam o lugar', () => {
    expect(ids(muitas, ['dica-prazo-minimo'])).toEqual(['dica-marcacao', 'dica-aniversario']);
    expect(ids(muitas, ['dica-prazo-minimo', 'dica-marcacao', 'dica-aniversario', 'dica-reaplicacao'])).toEqual(['dica-conglomerado']);
  });
});

const idsDeLicao = new Set(LICOES.map((l) => l.id));

describe('textos das dicas', () => {
  it('ids únicos, lição existente, fonte oficial e texto limpo', () => {
    expect(new Set(DICAS.map((d) => d.id)).size).toBe(DICAS.length);
    expect(DICAS.length).toBeGreaterThanOrEqual(6);
    for (const d of DICAS) {
      expect(idsDeLicao.has(d.licao), d.id).toBe(true);
      expect(oficial(d.fonte), d.id).toBe(true);
      semSintaxeCrua(d.texto, d.id);
      soNumerosDasRegras(d.texto, d.id);
    }
  });
});

describe('Você sabia?', () => {
  it('de 12 a 15 itens, textos únicos, com lição e fonte oficial', () => {
    expect(VOCE_SABIA.length).toBeGreaterThanOrEqual(12);
    expect(VOCE_SABIA.length).toBeLessThanOrEqual(15);
    expect(new Set(VOCE_SABIA.map((x) => x.texto)).size).toBe(VOCE_SABIA.length);
    for (const [i, x] of VOCE_SABIA.entries()) {
      expect(idsDeLicao.has(x.licao), `${i}`).toBe(true);
      expect(oficial(x.fonte), `${i}: ${x.fonte}`).toBe(true);
      semSintaxeCrua(x.texto, `você sabia ${i}`);
      soNumerosDasRegras(x.texto, `você sabia ${i}`);
    }
  });
  it('cobre ao menos 8 das 10 lições', () => {
    expect(new Set(VOCE_SABIA.map((x) => x.licao)).size).toBeGreaterThanOrEqual(8);
  });
  it('muda a cada visita e volta ao começo depois do último', () => {
    const n = VOCE_SABIA.length;
    expect(vocePassaSaber(0)).toBe(VOCE_SABIA[0]);
    expect(vocePassaSaber(1)).toBe(VOCE_SABIA[1]);
    expect(vocePassaSaber(1)).not.toBe(vocePassaSaber(2));
    expect(vocePassaSaber(n)).toBe(VOCE_SABIA[0]);
    expect(vocePassaSaber(n + 3)).toBe(VOCE_SABIA[3]);
  });
  it('índice negativo, fracionário ou inválido não quebra', () => {
    expect(vocePassaSaber(-1)).toBe(VOCE_SABIA[VOCE_SABIA.length - 1]);
    expect(vocePassaSaber(2.7)).toBe(VOCE_SABIA[2]);
    expect(vocePassaSaber(Number.NaN)).toBe(VOCE_SABIA[0]);
    expect(vocePassaSaber(Number.POSITIVE_INFINITY)).toBe(VOCE_SABIA[0]);
  });
});

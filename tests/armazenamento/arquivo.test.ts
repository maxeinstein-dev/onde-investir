import { describe, expect, it } from 'vitest';
import { LIMITE_CARACTERES_IMPORTACAO, exportarDados, importarDados } from '../../src/armazenamento/arquivo';
import { LIMITE_OFERTAS } from '../../src/armazenamento/ofertas';
import { LIMITE_POSICOES } from '../../src/armazenamento/posicoes';
import type { OfertaCadastrada } from '../../src/engine/ofertas';
import type { Posicao } from '../../src/engine/posicoes';

const HOJE = '2026-09-28';

const cdb: OfertaCadastrada = {
  id: 'a', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, emissor: 'Banco X', conglomerado: 'X',
  liquidez: 'NO_VENCIMENTO', vencimento: '2028-09-28',
};
const tesouro: OfertaCadastrada = {
  id: 'b', produto: 'TESOURO_IPCA', indexacao: { tipo: 'IPCA_MAIS', taxaRealAA: 0.075 }, emissor: 'Tesouro Nacional',
  conglomerado: 'Tesouro Nacional', liquidez: 'DIARIA', vencimento: '2035-05-15',
};
const poupanca: OfertaCadastrada = {
  id: 'c', produto: 'POUPANCA', indexacao: { tipo: 'POUPANCA' }, emissor: 'Banco Y', conglomerado: 'Y', liquidez: 'DIARIA',
};
const posicao: Posicao = { ...cdb, id: 'p-a', valorAplicado: 10_000, dataAplicacao: '2025-01-02', eventos: [] };
const posicaoComExtrato: Posicao = {
  ...posicao, id: 'p-b', custoExtraAA: 0.005, valorExtrato: 11_234.56, dataExtrato: '2026-09-01', baseExtrato: 'BRUTO',
};

const semId = <T extends { id: string }>(o: T) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'id'));

let contador = 0;
const opcoes = { hoje: HOJE, gerarIdOferta: () => `novo-${++contador}`, gerarIdPosicao: () => `p-novo-${++contador}` };
const EXPORTADO_EM = '2026-09-27T15:00:00.000Z';
const v1 = (ofertas: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ versao: 1, exportadoEm: EXPORTADO_EM, ofertas, ...extra });
const v2 = (ofertas: unknown[], posicoes: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ versao: 2, exportadoEm: EXPORTADO_EM, ofertas, posicoes, ...extra });

describe('exportarDados', () => {
  it('v2: versão, instante da exportação, ofertas e posições', () => {
    const texto = exportarDados([cdb], [posicao], Date.parse(EXPORTADO_EM));
    expect(JSON.parse(texto)).toEqual({ versao: 2, exportadoEm: EXPORTADO_EM, ofertas: [cdb], posicoes: [posicao] });
  });
  it(`${LIMITE_OFERTAS} ofertas e ${LIMITE_POSICOES} posições, com os textos no máximo, cabem no limite da importação`, () => {
    const longo = { emissor: 'E'.repeat(80), conglomerado: 'C'.repeat(80) };
    const ofertas = Array.from({ length: LIMITE_OFERTAS }, (_, i) => ({ ...cdb, ...longo, id: `o-${i}-${'x'.repeat(36)}`, custoExtraAA: 0.005 }));
    const posicoes = Array.from({ length: LIMITE_POSICOES }, (_, i) => ({ ...posicaoComExtrato, ...longo, id: `p-${i}-${'x'.repeat(36)}` }));
    const texto = exportarDados(ofertas, posicoes, Date.now());
    expect(texto.length).toBeLessThanOrEqual(LIMITE_CARACTERES_IMPORTACAO);
    const r = importarDados(texto, opcoes);
    expect(r.ok && r.ofertas.length === LIMITE_OFERTAS && r.posicoes.length === LIMITE_POSICOES).toBe(true);
  });
});

describe('importarDados', () => {
  it('v2: ida e volta, com ids novos nas ofertas e nas posições', () => {
    const r = importarDados(exportarDados([cdb, tesouro, poupanca], [posicao, posicaoComExtrato], Date.now()), opcoes);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ofertas.map(semId)).toEqual([cdb, tesouro, poupanca].map(semId));
    expect(r.ofertas.every((o) => o.id.startsWith('novo-'))).toBe(true);
    expect(r.posicoes.map(semId)).toEqual([posicao, posicaoComExtrato].map(semId));
    expect(r.posicoes.every((p) => p.id.startsWith('p-novo-'))).toBe(true);
    expect(new Set([...r.ofertas, ...r.posicoes].map((x) => x.id)).size).toBe(5);
  });
  it('v1 (só ofertas, o formato antigo) continua aceito, sem posições', () => {
    const r = importarDados(v1([cdb, poupanca]), opcoes);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ofertas.map(semId)).toEqual([cdb, poupanca].map(semId));
    expect(r.posicoes).toEqual([]);
  });
  it('v1 com posições no envelope é rejeitado (campo extra)', () => {
    expect(importarDados(v1([cdb], { posicoes: [] }), opcoes).ok).toBe(false);
  });
  it('v2 sem a lista de posições, ou com campo extra no envelope, é rejeitado', () => {
    expect(importarDados(JSON.stringify({ versao: 2, exportadoEm: EXPORTADO_EM, ofertas: [] }), opcoes).ok).toBe(false);
    expect(importarDados(v2([], [], { link: 'x' }), opcoes).ok).toBe(false);
  });
  it('aceita ofertas e posições sem id (os ids são sempre novos)', () => {
    const r = importarDados(v2([semId(cdb)], [semId(posicao)]), opcoes);
    expect(r.ok && r.ofertas[0]?.id.startsWith('novo-') && r.posicoes[0]?.id.startsWith('p-novo-')).toBe(true);
  });
  it('custo extra sobrevive à exportação e à importação; acima de 5% rejeita', () => {
    const comCusto: OfertaCadastrada = { ...cdb, custoExtraAA: 0.005 };
    const r = importarDados(exportarDados([comCusto], [posicaoComExtrato], Date.now()), opcoes);
    expect(r.ok && r.ofertas[0]?.custoExtraAA === 0.005 && r.posicoes[0]?.custoExtraAA === 0.005).toBe(true);
    expect(importarDados(v1([{ ...cdb, custoExtraAA: 0.06 }]), opcoes)).toEqual({ ok: false, erro: expect.stringMatching(/oferta 1.*custo extra/i) });
    expect(importarDados(v1([{ ...cdb, custoExtraAA: '0.5' }]), opcoes).ok).toBe(false);
  });
  it('<script> no emissor é aceito como texto, sem interpretação', () => {
    const emissor = '<script>alert(1)</script>';
    const r = importarDados(v2([{ ...cdb, emissor }], [{ ...posicao, emissor }]), opcoes);
    expect(r.ok && r.ofertas[0]?.emissor === emissor && r.posicoes[0]?.emissor === emissor).toBe(true);
  });
  it('texto acima de 80 caracteres é rejeitado', () => {
    expect(importarDados(v1([{ ...cdb, emissor: 'x'.repeat(81) }]), opcoes)).toEqual({ ok: false, erro: expect.stringMatching(/oferta 1/i) });
    expect(importarDados(v2([], [{ ...posicao, emissor: 'x'.repeat(81) }]), opcoes)).toEqual({ ok: false, erro: expect.stringMatching(/posição 1/i) });
  });
  it('campo extra na oferta ou na posição é rejeitado, com o nome do campo', () => {
    expect(importarDados(v1([{ ...cdb, cor: 'azul' }]), opcoes)).toEqual({ ok: false, erro: 'Oferta 1: campo não reconhecido ("cor").' });
    expect(importarDados(v2([cdb], [posicao, { ...posicao, cor: 'azul' }]), opcoes)).toEqual({ ok: false, erro: 'Posição 2: campo não reconhecido ("cor").' });
  });
  it('posição que falha em validarPosicao rejeita o arquivo inteiro, com o motivo', () => {
    const futura = { ...posicao, dataAplicacao: '2026-09-29' };
    expect(importarDados(v2([cdb], [futura]), opcoes)).toEqual({ ok: false, erro: expect.stringMatching(/posição 1.*depois de hoje/i) });
    const comEvento = { ...posicao, eventos: [{ tipo: 'APORTE', data: '2025-06-01', valor: 100 }] };
    expect(importarDados(v2([], [comEvento]), opcoes)).toEqual({ ok: false, erro: expect.stringMatching(/posição 1.*aportes/i) });
    expect(importarDados(v2([], [{ ...posicao, valorAplicado: '10000' }]), opcoes)).toEqual({ ok: false, erro: 'Posição 1: o campo "valorAplicado" está inválido.' });
  });
  it(`${LIMITE_OFERTAS + 1} ofertas ou ${LIMITE_POSICOES + 1} posições são rejeitadas`, () => {
    expect(LIMITE_OFERTAS).toBe(30);
    expect(LIMITE_POSICOES).toBe(50);
    const muitas = Array.from({ length: 31 }, (_, i) => ({ ...cdb, id: String(i) }));
    expect(importarDados(v1(muitas), opcoes)).toEqual({ ok: false, erro: expect.stringMatching(/30 ofertas/) });
    expect(importarDados(v1(muitas.slice(0, 30)), opcoes).ok).toBe(true);
    const posicoes = Array.from({ length: 51 }, (_, i) => ({ ...posicao, id: String(i) }));
    expect(importarDados(v2([], posicoes), opcoes)).toEqual({ ok: false, erro: expect.stringMatching(/51 posições; o limite é 50 posições/) });
    expect(importarDados(v2([], posicoes.slice(0, 50)), opcoes).ok).toBe(true);
  });
  it('texto com 100 001 caracteres é rejeitado antes de interpretar', () => {
    expect(LIMITE_CARACTERES_IMPORTACAO).toBe(100_000);
    const base = v1([cdb]);
    const grande = base + ' '.repeat(100_001 - base.length);
    expect(grande).toHaveLength(100_001);
    expect(importarDados(grande, opcoes)).toEqual({ ok: false, erro: expect.stringMatching(/100 mil caracteres/) });
    expect(importarDados(grande.slice(0, 100_000), opcoes).ok).toBe(true);
  });
  it('JSON inválido', () => {
    expect(importarDados('{"versao": 1,', opcoes)).toEqual({ ok: false, erro: expect.stringMatching(/JSON/) });
  });
  it('versão desconhecida ou outro formato', () => {
    expect(importarDados(JSON.stringify({ versao: 3, exportadoEm: 'x', ofertas: [], posicoes: [] }), opcoes).ok).toBe(false);
    expect(importarDados(JSON.stringify([cdb]), opcoes).ok).toBe(false);
  });
  it('oferta que falha em validarOfertaCadastrada rejeita o arquivo inteiro, com o motivo', () => {
    const r = importarDados(v1([cdb, { ...poupanca, liquidez: 'NO_VENCIMENTO', vencimento: '2030-01-01' }]), opcoes);
    expect(r).toEqual({ ok: false, erro: expect.stringMatching(/oferta 2.*Poupança/i) });
  });
  it('taxa não numérica é rejeitada', () => {
    expect(importarDados(v1([{ ...cdb, indexacao: { tipo: 'POS_CDI', percentualCDI: '103' } }]), opcoes).ok).toBe(false);
  });
});

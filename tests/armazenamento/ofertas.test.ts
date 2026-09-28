import { describe, expect, it } from 'vitest';
import {
  CHAVE_OFERTAS, LIMITE_CARACTERES_IMPORTACAO, LIMITE_OFERTAS, exportarOfertas, importarOfertas, lerOfertas, salvarOfertas,
} from '../../src/armazenamento/ofertas';
import type { Armazenamento } from '../../src/dados/cache';
import type { OfertaCadastrada } from '../../src/engine/ofertas';

const memoria = (): Armazenamento & { dados: Map<string, string> } => {
  const dados = new Map<string, string>();
  return { dados, getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => void dados.set(k, v) };
};
const quebrado: Armazenamento = {
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
};

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

const semId = (o: OfertaCadastrada) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'id'));

let contador = 0;
const gerarId = () => `novo-${++contador}`;
const arquivo = (ofertas: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ versao: 1, exportadoEm: '2026-09-27T15:00:00.000Z', ofertas, ...extra });

describe('lerOfertas / salvarOfertas', () => {
  it('ida e volta na chave rende:ofertas:v1', () => {
    const arm = memoria();
    expect(salvarOfertas(arm, [cdb, tesouro, poupanca])).toBe(true);
    expect(CHAVE_OFERTAS).toBe('rende:ofertas:v1');
    expect(arm.dados.has('rende:ofertas:v1')).toBe(true);
    expect(lerOfertas(arm)).toEqual([cdb, tesouro, poupanca]);
  });
  it('sem nada salvo: lista vazia', () => {
    expect(lerOfertas(memoria())).toEqual([]);
  });
  it('storage que lança: lista vazia na leitura e false na gravação', () => {
    expect(lerOfertas(quebrado)).toEqual([]);
    expect(salvarOfertas(quebrado, [cdb])).toBe(false);
  });
  it('JSON corrompido ou fora do formato: lista vazia', () => {
    const arm = memoria();
    arm.setItem(CHAVE_OFERTAS, '{nao é json');
    expect(lerOfertas(arm)).toEqual([]);
    arm.setItem(CHAVE_OFERTAS, JSON.stringify({ ofertas: 'x' }));
    expect(lerOfertas(arm)).toEqual([]);
  });
  it('descarta só as ofertas inválidas (esquema ou validarOfertaCadastrada)', () => {
    const arm = memoria();
    const semVencimento = { ...cdb, id: 'd', vencimento: undefined }; // NO_VENCIMENTO sem vencimento
    const extra = { ...cdb, id: 'e', cor: 'azul' };
    const indexacaoErrada = { ...cdb, id: 'f', indexacao: { tipo: 'POS_CDI', taxaAA: 0.1 } };
    const dataImpossivel = { ...cdb, id: 'g', vencimento: '2027-02-30' };
    arm.setItem(CHAVE_OFERTAS, JSON.stringify([cdb, semVencimento, extra, indexacaoErrada, dataImpossivel, poupanca]));
    expect(lerOfertas(arm)).toEqual([cdb, poupanca]);
  });
});

describe('exportarOfertas', () => {
  it('JSON com versão, instante da exportação e as ofertas', () => {
    const texto = exportarOfertas([cdb], Date.parse('2026-09-27T15:00:00.000Z'));
    expect(JSON.parse(texto)).toEqual({ versao: 1, exportadoEm: '2026-09-27T15:00:00.000Z', ofertas: [cdb] });
  });
});

describe('importarOfertas', () => {
  it('ida e volta, com ids novos', () => {
    const r = importarOfertas(exportarOfertas([cdb, tesouro, poupanca], Date.now()), gerarId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ofertas).toHaveLength(3);
    expect(r.ofertas.map(semId)).toEqual([cdb, tesouro, poupanca].map(semId));
    expect(r.ofertas.map((o) => o.id).every((id) => id.startsWith('novo-'))).toBe(true);
    expect(new Set(r.ofertas.map((o) => o.id)).size).toBe(3);
  });
  it('aceita ofertas sem id (os ids são sempre novos)', () => {
    const r = importarOfertas(arquivo([semId(cdb)]), gerarId);
    expect(r.ok && r.ofertas[0]?.id.startsWith('novo-')).toBe(true);
  });
  it('<script> no emissor é aceito como texto, sem interpretação', () => {
    const emissor = '<script>alert(1)</script>';
    const r = importarOfertas(arquivo([{ ...cdb, emissor }]), gerarId);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ofertas[0]?.emissor).toBe(emissor);
  });
  it('texto acima de 80 caracteres é rejeitado', () => {
    const r = importarOfertas(arquivo([{ ...cdb, emissor: 'x'.repeat(81) }]), gerarId);
    expect(r).toEqual({ ok: false, erro: expect.stringMatching(/oferta 1/i) });
  });
  it('campo extra é rejeitado', () => {
    const r = importarOfertas(arquivo([{ ...cdb, cor: 'azul' }]), gerarId);
    expect(r).toEqual({ ok: false, erro: expect.stringMatching(/cor/) });
  });
  it('campo extra no envelope é rejeitado', () => {
    const r = importarOfertas(arquivo([cdb], { posicoes: [] }), gerarId);
    expect(r.ok).toBe(false);
  });
  it(`${LIMITE_OFERTAS + 1} ofertas são rejeitadas`, () => {
    expect(LIMITE_OFERTAS).toBe(30);
    const muitas = Array.from({ length: 31 }, (_, i) => ({ ...cdb, id: String(i) }));
    const r = importarOfertas(arquivo(muitas), gerarId);
    expect(r).toEqual({ ok: false, erro: expect.stringMatching(/30 ofertas/) });
    expect(importarOfertas(arquivo(muitas.slice(0, 30)), gerarId).ok).toBe(true);
  });
  it('texto com 100 001 caracteres é rejeitado antes de interpretar', () => {
    expect(LIMITE_CARACTERES_IMPORTACAO).toBe(100_000);
    const base = arquivo([cdb]);
    const grande = base + ' '.repeat(100_001 - base.length);
    expect(grande).toHaveLength(100_001);
    expect(importarOfertas(grande, gerarId)).toEqual({ ok: false, erro: expect.stringMatching(/100 mil caracteres/) });
    expect(importarOfertas(grande.slice(0, 100_000), gerarId).ok).toBe(true);
  });
  it('JSON inválido', () => {
    expect(importarOfertas('{"versao": 1,', gerarId)).toEqual({ ok: false, erro: expect.stringMatching(/JSON/) });
  });
  it('versão desconhecida ou outro formato', () => {
    expect(importarOfertas(JSON.stringify({ versao: 2, exportadoEm: 'x', ofertas: [] }), gerarId).ok).toBe(false);
    expect(importarOfertas(JSON.stringify([cdb]), gerarId).ok).toBe(false);
  });
  it('oferta que falha em validarOfertaCadastrada rejeita o arquivo inteiro, com o motivo', () => {
    const r = importarOfertas(arquivo([cdb, { ...poupanca, liquidez: 'NO_VENCIMENTO', vencimento: '2030-01-01' }]), gerarId);
    expect(r).toEqual({ ok: false, erro: expect.stringMatching(/oferta 2.*Poupança/i) });
  });
  it('taxa não numérica é rejeitada', () => {
    const r = importarOfertas(arquivo([{ ...cdb, indexacao: { tipo: 'POS_CDI', percentualCDI: '103' } }]), gerarId);
    expect(r.ok).toBe(false);
  });
});

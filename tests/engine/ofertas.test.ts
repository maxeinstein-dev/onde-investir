import { describe, expect, it } from 'vitest';
import { conferirPrazoMinimo, projetar, validarOfertaCadastrada, validarRegraReinvestimento, type OfertaCadastrada } from '../../src/engine/ofertas';
import { simular } from '../../src/engine/produtos';
import { OfertaInvalidaError } from '../../src/engine/erros';
import { CEN, INI } from './cenarioPadrao';

const base = { emissor: 'Banco X', conglomerado: 'X' };
const cdbDiario: OfertaCadastrada = { ...base, id: 'a', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, liquidez: 'DIARIA' };
const cdbVence2027: OfertaCadastrada = { ...cdbDiario, id: 'b', vencimento: '2027-09-28', liquidez: 'NO_VENCIMENTO' };
const lciVence2027: OfertaCadastrada = { ...base, id: 'c', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 }, vencimento: '2027-09-28', liquidez: 'NO_VENCIMENTO' };
const preTesouro: OfertaCadastrada = { ...base, id: 'd', produto: 'TESOURO_PREFIXADO', indexacao: { tipo: 'PRE', taxaAA: 0.13 }, vencimento: '2029-01-01', liquidez: 'DIARIA' };
const V = 10000;

describe('validarOfertaCadastrada', () => {
  it('exige emissor e conglomerado', () => {
    expect(() => validarOfertaCadastrada({ ...cdbDiario, emissor: '  ' })).toThrow(OfertaInvalidaError);
    expect(() => validarOfertaCadastrada({ ...cdbDiario, conglomerado: '' })).toThrow(OfertaInvalidaError);
  });
  it('Tesouro e "no vencimento" exigem vencimento', () => {
    expect(() => validarOfertaCadastrada({ ...preTesouro, vencimento: undefined })).toThrow(OfertaInvalidaError);
    expect(() => validarOfertaCadastrada({ ...cdbVence2027, vencimento: undefined })).toThrow(OfertaInvalidaError);
  });
  it('poupança não tem vencimento e tem liquidez diária', () => {
    expect(() => validarOfertaCadastrada({ ...base, id: 'p', produto: 'POUPANCA', indexacao: { tipo: 'POUPANCA' }, liquidez: 'NO_VENCIMENTO', vencimento: '2030-01-01' })).toThrow(OfertaInvalidaError);
  });
  it('Tesouro exige liquidez diária', () => {
    expect(() => validarOfertaCadastrada({ ...preTesouro, liquidez: 'NO_VENCIMENTO' })).toThrow(
      new OfertaInvalidaError('Títulos do Tesouro têm liquidez diária (com marcação a mercado nos prefixados e IPCA+)'),
    );
    expect(() => validarOfertaCadastrada(preTesouro)).not.toThrow();
  });
  it('oferta válida passa', () => {
    expect(() => validarOfertaCadastrada(cdbVence2027)).not.toThrow();
  });
});

describe('projetar', () => {
  it('liquidez diária sem vencimento = simular direto', () => {
    const p = projetar(cdbDiario, V, INI, '2028-09-28', CEN);
    expect(p.estado).toBe('DISPONIVEL');
    if (p.estado === 'DISPONIVEL') expect(p.liquido).toBeCloseTo(12551.897435, 4);
  });
  it('sem liquidez antes do vencimento → indisponível até o vencimento', () => {
    expect(projetar(lciVence2027, V, INI, '2027-03-29', CEN)).toEqual({ estado: 'INDISPONIVEL', motivo: 'Só pode ser resgatado no vencimento', disponivelEm: '2027-09-28' });
  });
  it('no vencimento = simular até o vencimento', () => {
    const p = projetar(lciVence2027, V, INI, '2027-09-28', CEN);
    if (p.estado !== 'DISPONIVEL') throw new Error('esperado disponível');
    expect(p.liquido).toBeCloseTo(11068.912881, 4);
    expect(p.reinvestimento).toBeUndefined();
  });
  it('depois do vencimento: reinveste o líquido (padrão pós → mesmo produto e % do CDI)', () => {
    const p = projetar(lciVence2027, V, INI, '2028-09-28', CEN);
    if (p.estado !== 'DISPONIVEL') throw new Error('esperado disponível');
    const etapa1 = simular({ ...lciVence2027, valor: V, dataAplicacao: INI }, '2027-09-28', CEN);
    const etapa2 = simular({ produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 }, valor: etapa1.valorLiquido, dataAplicacao: '2027-09-28' }, '2028-09-28', CEN);
    expect(p.liquido).toBeCloseTo(etapa2.valorLiquido, 8);
    expect(p.etapas).toHaveLength(2);
    expect(p.reinvestimento).toEqual({ data: '2027-09-28', oferta: { produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 } }, fallback: false });
  });
  it('o IR recomeça na reaplicação', () => {
    const reaplicado = projetar(cdbVence2027, V, INI, '2028-09-28', CEN);
    const direto = projetar(cdbDiario, V, INI, '2028-09-28', CEN);
    if (reaplicado.estado !== 'DISPONIVEL' || direto.estado !== 'DISPONIVEL') throw new Error('esperado disponível');
    expect(reaplicado.etapas[1]?.aliquotaIR).toBe(0.175);
    expect(direto.etapas[0]?.aliquotaIR).toBe(0.15);
    expect(reaplicado.liquido).toBeLessThan(direto.liquido);
  });
  it('reaplicação impossível no mesmo produto (prazo mínimo) → CDB 100% do CDI, marcado como fallback', () => {
    const p = projetar(lciVence2027, V, INI, '2027-12-28', CEN, { tipo: 'MESMA_TAXA' });
    if (p.estado !== 'DISPONIVEL') throw new Error('esperado disponível');
    expect(p.reinvestimento).toEqual({ data: '2027-09-28', oferta: { produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 } }, fallback: true });
  });
  it('regras de reinvestimento: 100% CDI e taxa fixa', () => {
    const cdi = projetar(lciVence2027, V, INI, '2028-09-28', CEN, { tipo: 'CDI_100' });
    const fixa = projetar(lciVence2027, V, INI, '2028-09-28', CEN, { tipo: 'TAXA_FIXA', taxaAA: 0.12 });
    if (cdi.estado !== 'DISPONIVEL' || fixa.estado !== 'DISPONIVEL') throw new Error('esperado disponível');
    expect(cdi.reinvestimento?.oferta).toEqual({ produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 } });
    expect(fixa.reinvestimento?.oferta).toEqual({ produto: 'CDB', indexacao: { tipo: 'PRE', taxaAA: 0.12 } });
  });
  it('padrão para prefixado: 100% do CDI na reaplicação', () => {
    const pre: OfertaCadastrada = { ...cdbVence2027, indexacao: { tipo: 'PRE', taxaAA: 0.13 } };
    const p = projetar(pre, V, INI, '2028-09-28', CEN);
    if (p.estado !== 'DISPONIVEL') throw new Error('esperado disponível');
    expect(p.reinvestimento?.oferta).toEqual({ produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 } });
  });
  it('Tesouro Prefixado antes do vencimento → marcação a mercado', () => {
    expect(projetar(preTesouro, V, INI, '2028-09-28', CEN)).toEqual({ estado: 'MARCACAO_A_MERCADO', vencimento: '2029-01-01' });
  });
  it('LCI com liquidez diária antes do prazo mínimo → indisponível até a data mínima', () => {
    const lciDiaria: OfertaCadastrada = { ...lciVence2027, vencimento: undefined, liquidez: 'DIARIA' };
    const p = projetar(lciDiaria, V, INI, '2026-12-28', CEN);
    expect(p.estado).toBe('INDISPONIVEL');
    if (p.estado === 'INDISPONIVEL') expect(p.disponivelEm).toBe('2027-03-28');
  });
  it('oferta que vence antes da aplicação → indisponível com motivo, sem lançar', () => {
    expect(projetar({ ...cdbVence2027, vencimento: '2026-01-01' }, V, INI, '2027-01-01', CEN).estado).toBe('INDISPONIVEL');
  });
});

describe('LCI/LCA com vencimento antes do prazo mínimo legal', () => {
  const lciCurta: OfertaCadastrada = { ...lciVence2027, vencimento: '2027-01-28' }; // mínimo: 28/03/2027 (6 meses)
  const lcaIpcaCurta: OfertaCadastrada = {
    ...base, id: 'e', produto: 'LCA', indexacao: { tipo: 'IPCA_MAIS', taxaRealAA: 0.06 }, vencimento: '2027-06-28', liquidez: 'NO_VENCIMENTO',
  }; // mínimo: 28/09/2027 (12 meses com IPCA)
  it('indisponível em qualquer horizonte, sem disponivelEm', () => {
    const motivo = 'O vencimento (28/01/2027) é anterior ao prazo mínimo legal (28/03/2027)';
    for (const alvo of ['2026-12-28', '2027-01-28', '2027-03-29', '2028-09-28']) {
      expect(projetar(lciCurta, V, INI, alvo, CEN)).toEqual({ estado: 'INDISPONIVEL', motivo });
    }
    expect(projetar(lcaIpcaCurta, V, INI, '2028-09-28', CEN)).toEqual({
      estado: 'INDISPONIVEL', motivo: 'O vencimento (28/06/2027) é anterior ao prazo mínimo legal (28/09/2027)',
    });
  });
  it('conferirPrazoMinimo: aviso para o cadastro, null quando está tudo certo', () => {
    expect(conferirPrazoMinimo(lciCurta, INI)).toBe('O vencimento (28/01/2027) é anterior ao prazo mínimo legal (28/03/2027)');
    expect(conferirPrazoMinimo({ ...lciCurta, vencimento: '2027-03-28' }, INI)).toBeNull(); // no limite
    expect(conferirPrazoMinimo(lciVence2027, INI)).toBeNull();
    expect(conferirPrazoMinimo({ ...lciVence2027, vencimento: undefined, liquidez: 'DIARIA' }, INI)).toBeNull();
    expect(conferirPrazoMinimo(cdbVence2027, INI)).toBeNull();
  });
});

describe('regra de reinvestimento', () => {
  const erro = new OfertaInvalidaError('Taxa de reinvestimento inválida');
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, -2, 1.01])('TAXA_FIXA com taxa %s → erro', (taxaAA) => {
    expect(() => validarRegraReinvestimento({ tipo: 'TAXA_FIXA', taxaAA })).toThrow(erro);
  });
  it('taxas válidas e demais regras passam', () => {
    for (const taxaAA of [-0.5, 0, 0.12, 1]) expect(() => validarRegraReinvestimento({ tipo: 'TAXA_FIXA', taxaAA })).not.toThrow();
    for (const tipo of ['PADRAO', 'MESMA_TAXA', 'CDI_100'] as const) expect(() => validarRegraReinvestimento({ tipo })).not.toThrow();
  });
  it('projetar não transforma a regra inválida em fallback: lança', () => {
    expect(() => projetar(lciVence2027, V, INI, '2028-09-28', CEN, { tipo: 'TAXA_FIXA', taxaAA: Number.NaN })).toThrow(erro);
  });
});

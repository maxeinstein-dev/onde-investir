import { describe, expect, it } from 'vitest';
import { motivoSemResgate, resumirDiferenca, rotuloDaTroca, rotuloDaTrocaDeSinal } from '../../src/conteudo/serie';
import type { OfertaCadastrada } from '../../src/engine/ofertas';

const base = { emissor: 'Banco B', conglomerado: 'B' };
const cdb: OfertaCadastrada = { ...base, id: '1', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, vencimento: '2031-09-28', liquidez: 'NO_VENCIMENTO' };
const lciDiaria: OfertaCadastrada = { ...base, id: '2', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.9 }, vencimento: '2029-09-28', liquidez: 'DIARIA' };
const prefixado: OfertaCadastrada = { ...base, id: '3', produto: 'TESOURO_PREFIXADO', indexacao: { tipo: 'PRE', taxaAA: 0.13 }, vencimento: '2030-01-01', liquidez: 'DIARIA' };

describe('rótulos do gráfico do valor líquido', () => {
  it('a troca de líder, pelas letras', () => {
    expect(rotuloDaTroca(['B'])).toBe('B passa a liderar');
    expect(rotuloDaTroca(['A', 'C'])).toBe('A e C empatam');
    expect(rotuloDaTroca([])).toBe('Ninguém pode resgatar');
  });
  it('por que o trecho é só referência', () => {
    expect(motivoSemResgate(cdb)).toBe('(só no vencimento)');
    expect(motivoSemResgate(lciDiaria)).toBe('(prazo mínimo)');
    expect(motivoSemResgate(prefixado)).toBe('(marcação a mercado)');
  });
});

describe('gráfico da diferença', () => {
  it('rótulo da troca de sinal', () => {
    expect(rotuloDaTrocaDeSinal('A', 'A', 'B')).toBe('A à frente');
    expect(rotuloDaTrocaDeSinal('B', 'A', 'B')).toBe('B à frente');
    expect(rotuloDaTrocaDeSinal('EMPATE', 'A', 'B')).toBe('Empate');
  });

  it('resumo: sem troca, com uma troca, com várias e com empate', () => {
    expect(resumirDiferenca([], 'X', 'Y')).toBe('Não há datas em que as duas ofertas tenham valor para comparar.');
    expect(resumirDiferenca([{ data: '2026-10-05', frente: 'A' }], 'X', 'Y')).toBe('X fica à frente o tempo todo.');
    expect(resumirDiferenca([{ data: '2026-10-05', frente: 'EMPATE' }], 'X', 'Y')).toBe('X e Y empatam o tempo todo.');
    expect(resumirDiferenca([{ data: '2026-10-05', frente: 'A' }, { data: '2027-03-01', frente: 'B' }], 'X', 'Y'))
      .toBe('X fica à frente até 28/02/2027; depois Y.');
    expect(resumirDiferenca([
      { data: '2026-10-05', frente: 'B' }, { data: '2027-03-01', frente: 'EMPATE' }, { data: '2027-03-08', frente: 'A' },
    ], 'X', 'Y')).toBe('Y fica à frente até 28/02/2027; depois as duas empatam, até 07/03/2027; depois X.');
    expect(resumirDiferenca([{ data: '2026-10-05', frente: 'EMPATE' }, { data: '2027-03-01', frente: 'B' }], 'X', 'Y'))
      .toBe('X e Y empatam até 28/02/2027; depois Y.');
  });
});

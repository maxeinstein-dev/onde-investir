import { describe, expect, it } from 'vitest';
import { motivoSemResgate, rotuloDaTroca } from '../../src/conteudo/serie';
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

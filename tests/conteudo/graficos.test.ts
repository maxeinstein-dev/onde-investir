import { describe, expect, it } from 'vitest';
import { GRAFICO_VALOR, motivoSemResgate, resumirDiferenca, rotuloDaTroca, rotuloDaTrocaDeSinal } from '../../src/conteudo/serie';


describe('rótulos do gráfico do valor líquido', () => {
  it('a troca de líder, pelas letras', () => {
    expect(rotuloDaTroca(['B'])).toBe('B passa a liderar');
    expect(rotuloDaTroca(['A', 'C'])).toBe('A e C empatam');
    expect(rotuloDaTroca([])).toBe('Ninguém pode resgatar');
  });
  it('por que o trecho é só referência, pelo motivo do ponto', () => {
    expect(motivoSemResgate('NO_VENCIMENTO')).toBe('(só no vencimento)');
    expect(motivoSemResgate('PRAZO_MINIMO')).toBe('(prazo mínimo)');
    expect(motivoSemResgate('MARCACAO_A_MERCADO')).toBe('(valor na curva contratada)');
  });
  it('a dica do tracejado explica também o Tesouro Prefixado e o IPCA+', () => {
    expect(GRAFICO_VALOR.tracejado).toMatch(/Tesouro Prefixado/);
    expect(GRAFICO_VALOR.tracejado).toMatch(/curva contratada/);
    expect(GRAFICO_VALOR.tracejado).toMatch(/preço de mercado/);
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

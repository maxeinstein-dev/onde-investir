// tests/engine/fgc.test.ts
import { describe, expect, it } from 'vitest';
import { deDia, paraDia, type DataISO } from '../../src/engine/datas';
import { coberto, exposicao, type ItemFGC, normalizarConglomerado, primeiraDataAcimaDoLimite, tetoGlobalExcedido } from '../../src/engine/fgc';
import { simular, type TipoProduto } from '../../src/engine/produtos';
import { CEN, INI } from './cenarioPadrao';

const cdb = (conglomerado: string, valor: number, produto: TipoProduto = 'CDB'): ItemFGC => ({
  conglomerado, produto,
  brutoEm: (data) => (data <= INI ? valor : simular({ produto, indexacao: { tipo: 'POS_CDI', percentualCDI: 1 }, valor, dataAplicacao: INI }, data, CEN, { ignorarPrazoMinimo: true }).valorBruto),
});
const fixo = (conglomerado: string, valor: number, produto: TipoProduto = 'CDB'): ItemFGC => ({ conglomerado, produto, brutoEm: () => valor });

describe('coberto', () => {
  it.each<[TipoProduto, boolean]>([
    ['CDB', true], ['RDB', true], ['LC', true], ['LCI', true], ['LCA', true], ['POUPANCA', true],
    ['TESOURO_SELIC', false], ['TESOURO_PREFIXADO', false], ['TESOURO_IPCA', false],
  ])('%s → %s', (produto, esperado) => {
    expect(coberto(produto)).toBe(esperado);
  });
});

describe('normalizarConglomerado', () => {
  it('ignora caixa, acento e espaços extras', () => {
    expect(normalizarConglomerado('Banco X')).toBe(normalizarConglomerado('banco  x'));
    expect(normalizarConglomerado('  Itaú   Unibanco ')).toBe(normalizarConglomerado('ITAU UNIBANCO'));
    expect(normalizarConglomerado('Banco X')).not.toBe(normalizarConglomerado('Banco Y'));
  });
});

describe('exposicao', () => {
  it('soma o mesmo conglomerado (grafias diferentes), separa os outros e deixa o Tesouro de fora', () => {
    const e = exposicao([fixo('Banco X', 100_000), fixo('banco  x', 50_000, 'LCI'), fixo('Banco Y', 30_000), fixo('Tesouro Nacional', 500_000, 'TESOURO_SELIC')], INI);
    expect([...e.porConglomerado]).toEqual([['Banco X', 150_000], ['Banco Y', 30_000]]);
    expect(e.totalCoberto).toBe(180_000);
  });
  it('usa o bruto na data', () => {
    const e = exposicao([cdb('Banco X', 100_000)], '2027-09-28');
    expect(e.porConglomerado.get('Banco X')).toBeCloseTo(100_000 * simular({ produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 }, valor: 1, dataAplicacao: INI }, '2027-09-28', CEN).valorBruto, 6);
  });
});

/** O primeiro dia em que a soma passa de 250 mil, dia a dia (a conta de referência). */
function primeiroDiaAcima(itens: readonly ItemFGC[], de: DataISO, ate: DataISO): DataISO | null {
  for (let d = paraDia(de); d <= paraDia(ate); d++) {
    const data = deDia(d);
    if (itens.reduce((s, i) => s + i.brutoEm(data), 0) > 250_000) return data;
  }
  return null;
}

describe('primeiraDataAcimaDoLimite', () => {
  it('dois CDBs do mesmo conglomerado passam do limite só com os rendimentos, no dia exato', () => {
    const itens = [cdb('Banco X', 120_000), cdb('banco x', 125_000)];
    const datas = [INI, '2027-09-28', '2028-09-28'];
    const alertas = primeiraDataAcimaDoLimite(itens, datas);
    const esperado = primeiroDiaAcima(itens, INI, '2027-09-28') as DataISO;
    expect(esperado > INI && esperado < '2027-09-28').toBe(true);
    const total = itens.reduce((s, i) => s + i.brutoEm(esperado), 0);
    expect(alertas).toEqual([{ conglomerado: 'Banco X', data: esperado, total, limite: 250_000, excedente: total - 250_000 }]);
  });
  it('acima já na primeira data: é ela', () => {
    const alertas = primeiraDataAcimaDoLimite([fixo('Banco X', 260_000)], ['2027-01-04', INI]);
    expect(alertas).toEqual([{ conglomerado: 'Banco X', data: INI, total: 260_000, limite: 250_000, excedente: 10_000 }]);
  });
  it('exatamente no limite não passa', () => {
    expect(primeiraDataAcimaDoLimite([fixo('Banco X', 250_000)], [INI])).toEqual([]);
  });
  it('conglomerados diferentes não somam', () => {
    expect(primeiraDataAcimaDoLimite([cdb('Banco X', 110_000), cdb('Banco Y', 110_000)], [INI, '2028-09-28'])).toEqual([]);
  });
  it('o Tesouro fica de fora', () => {
    expect(primeiraDataAcimaDoLimite([fixo('Tesouro Nacional', 300_000, 'TESOURO_SELIC'), cdb('Tesouro Nacional', 100_000)], [INI, '2028-09-28'])).toEqual([]);
  });
  it('um alerta por conglomerado, em ordem de data', () => {
    const alertas = primeiraDataAcimaDoLimite([cdb('Banco Y', 245_000), fixo('Banco X', 251_000)], [INI, '2028-09-28']);
    expect(alertas.map((a) => [a.conglomerado, a.data < '2028-09-28'])).toEqual([['Banco X', true], ['Banco Y', true]]);
    expect(alertas[0]?.data).toBe(INI);
  });
  it('sem datas, sem alerta', () => {
    expect(primeiraDataAcimaDoLimite([fixo('Banco X', 300_000)], [])).toEqual([]);
  });
});

describe('tetoGlobalExcedido', () => {
  it('soma os conglomerados cobertos e compara com R$ 1 milhão', () => {
    const cinco = ['A', 'B', 'C', 'D', 'E'].map((c) => fixo(`Banco ${c}`, 220_000));
    expect(tetoGlobalExcedido(cinco, INI)).toEqual({ total: 1_100_000, teto: 1_000_000 });
    expect(tetoGlobalExcedido(cinco.slice(0, 4), INI)).toBeNull();
  });
  it('o Tesouro não conta para o teto', () => {
    expect(tetoGlobalExcedido([fixo('Banco A', 900_000), fixo('Tesouro Nacional', 900_000, 'TESOURO_IPCA')], INI)).toBeNull();
  });
});

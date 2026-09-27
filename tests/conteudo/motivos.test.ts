import { describe, expect, it } from 'vitest';
import { descreverOferta, explicarVencedor } from '../../src/conteudo/motivos';
import { simular, type Oferta, type ResultadoSimulacao } from '../../src/engine/produtos';
import { CEN, INI } from '../engine/cenarioPadrao';

const cdb = (p: number): Oferta => ({ produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: p } });
const lci = (p: number): Oferta => ({ produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: p } });
/** As duas ofertas com R$ 10.000 aplicados em INI e resgatados em 2 anos. */
const dois = (a: Oferta, b: Oferta) => [a, b].map((o) => simular({ ...o, valor: 10000, dataAplicacao: INI }, '2028-09-28', CEN)) as [ResultadoSimulacao, ResultadoSimulacao];

describe('descreverOferta', () => {
  it.each<[Oferta, string]>([
    [cdb(1.03), 'CDB 103% do CDI'],
    [lci(0.8), 'LCI 80% do CDI'],
    [{ produto: 'CDB', indexacao: { tipo: 'PRE', taxaAA: 0.13 } }, 'CDB prefixado 13% a.a.'],
    [{ produto: 'CDB', indexacao: { tipo: 'IPCA_MAIS', taxaRealAA: 0.07 } }, 'CDB IPCA + 7% a.a.'],
    [{ produto: 'TESOURO_IPCA', indexacao: { tipo: 'IPCA_MAIS', taxaRealAA: 0.075 } }, 'Tesouro IPCA+ 7,5% a.a.'],
    [{ produto: 'TESOURO_SELIC', indexacao: { tipo: 'SELIC' } }, 'Tesouro Selic'],
    [{ produto: 'POUPANCA', indexacao: { tipo: 'POUPANCA' } }, 'Poupança'],
  ])('%o → %s', (oferta, texto) => expect(descreverOferta(oferta)).toBe(texto));
});

describe('explicarVencedor', () => {
  it('tributado vence apesar do IR', () => {
    const linhas = explicarVencedor(...dois(cdb(1.03), lci(0.8)));
    expect(linhas[0]).toMatch(/^CDB 103% do CDI termina com R\$\s12\.551,90 líquidos: R\$\s289,86 \(2,36%\) a mais que LCI 80% do CDI\.$/);
    expect(linhas.join(' ')).toMatch(/LCI 80% do CDI é isenta de IR/);
    expect(linhas.join(' ')).toMatch(/Mesmo pagando IR/);
  });
  it('isenção compensa rendimento bruto menor', () => {
    const linhas = explicarVencedor(...dois(cdb(1.03), lci(0.95)));
    expect(linhas.join(' ')).toMatch(/rende menos antes do imposto, mas como não paga IR fica na frente/);
  });
  it('isenta que rende mais até no bruto', () => {
    const linhas = explicarVencedor(...dois(cdb(0.9), lci(0.95)));
    expect(linhas.join(' ')).toMatch(/rende mais antes dos descontos e ainda é isenta/);
  });
  it('os nomes podem vir de fora (ofertas iguais de emissores diferentes)', () => {
    const linhas = explicarVencedor(...dois(cdb(1.03), lci(0.8)), 'CDB 103% do CDI (Banco X)', 'LCI 80% do CDI (Banco Y)');
    expect(linhas[0]).toMatch(/^CDB 103% do CDI \(Banco X\) termina com .* a mais que LCI 80% do CDI \(Banco Y\)\.$/);
    expect(linhas.join(' ')).toMatch(/Mesmo pagando IR, CDB 103% do CDI \(Banco X\) vence/);
  });
  it('empate', () => {
    expect(explicarVencedor(...dois(cdb(1), cdb(1)))[0]).toMatch(/empatad/);
  });
});

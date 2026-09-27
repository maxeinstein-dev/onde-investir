import { describe, expect, it } from 'vitest';
import { descreverOferta, explicarVencedor } from '../../src/conteudo/motivos';
import { duelar } from '../../src/engine/comparador';
import type { Oferta } from '../../src/engine/produtos';
import { CEN, INI } from '../engine/cenarioPadrao';

const cdb = (p: number): Oferta => ({ produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: p } });
const lci = (p: number): Oferta => ({ produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: p } });

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
    const linhas = explicarVencedor(duelar(10000, INI, '2028-09-28', cdb(1.03), lci(0.8), CEN));
    expect(linhas[0]).toMatch(/^CDB 103% do CDI termina com R\$\s12\.551,90 líquidos: R\$\s289,86 \(2,36%\) a mais que LCI 80% do CDI\.$/);
    expect(linhas.join(' ')).toMatch(/LCI 80% do CDI é isenta de IR/);
    expect(linhas.join(' ')).toMatch(/Mesmo pagando IR/);
  });
  it('isenção compensa rendimento bruto menor', () => {
    const linhas = explicarVencedor(duelar(10000, INI, '2028-09-28', cdb(1.03), lci(0.95), CEN));
    expect(linhas.join(' ')).toMatch(/A isenção compensou/);
  });
  it('isenta que rende mais até no bruto', () => {
    const linhas = explicarVencedor(duelar(10000, INI, '2028-09-28', cdb(0.9), lci(0.95), CEN));
    expect(linhas.join(' ')).toMatch(/rende mais antes dos descontos e ainda é isenta/);
  });
  it('empate', () => {
    expect(explicarVencedor(duelar(10000, INI, '2028-09-28', cdb(1), cdb(1), CEN))[0]).toMatch(/empatad/);
  });
});

import { describe, expect, it } from 'vitest';
import { horizontesPadrao, tabelaPorHorizonte, type ColunaHorizonte } from '../../../src/engine/comparacao';
import type { OfertaCadastrada } from '../../../src/engine/ofertas';
import { frasesDoLider } from '../../../src/ui/comparacao/lider';
import { CEN, INI } from '../../engine/cenarioPadrao';

const base = { conglomerado: 'G', liquidez: 'NO_VENCIMENTO' as const };
const cdb: OfertaCadastrada = { ...base, id: 'cdb', emissor: 'Banco X', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, vencimento: '2027-09-28' };
const lci: OfertaCadastrada = { ...base, id: 'lci', emissor: 'Banco Y', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 }, vencimento: '2027-09-28' };

const colunasDe = (ofertas: readonly OfertaCadastrada[]) =>
  tabelaPorHorizonte(ofertas, 10000, INI, horizontesPadrao(INI, null), CEN, { tipo: 'PADRAO' });

describe('frasesDoLider', () => {
  it('sem colunas devolve null', () => {
    expect(frasesDoLider([cdb, lci], [])).toBeNull();
  });

  it('com um líder: nome, valor líquido e diferença para a segunda colocada', () => {
    const colunas = colunasDe([cdb, lci]);
    const r = frasesDoLider([cdb, lci], colunas);
    const ultima = colunas.at(-1) as ColunaHorizonte;
    expect(ultima.lideres).toHaveLength(1);
    expect(r).not.toBeNull();
    expect(r?.rotulo).toBe('Valor líquido do líder');
    expect(r?.valor).toMatch(/^R\$\s/);
    expect(r?.frase).toMatch(/^A liderança é de .+, R\$\s[\d.,]+ a mais que a segunda colocada\.$/);
    expect(r?.frase).toContain('CDB 103% do CDI (Banco X)');
  });

  it('empate: Empate técnico entre A e B', () => {
    const colunas = colunasDe([cdb, cdb]);
    const r = frasesDoLider([cdb, { ...cdb, id: 'cdb2', emissor: 'Banco Z' }], colunas.map((c) => ({ ...c, lideres: [0, 1] })));
    expect(r?.frase).toMatch(/^Empate técnico entre .+ e .+\.$/);
  });

  it('usa o último horizonte que tem líder', () => {
    const colunas = colunasDe([cdb, lci]);
    const ultima = colunas.at(-1) as ColunaHorizonte;
    const semLider = [...colunas.slice(0, -1), { ...ultima, lideres: [] }];
    expect(frasesDoLider([cdb, lci], semLider)).not.toBeNull();
  });
});

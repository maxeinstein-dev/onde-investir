import { describe, expect, it } from 'vitest';
import { horizontesPadrao, tabelaPorHorizonte, type ColunaHorizonte } from '../../../src/engine/comparacao';
import type { OfertaCadastrada } from '../../../src/engine/ofertas';
import { nomeDoHorizonte } from '../../../src/conteudo/comparacao';
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
    expect(r?.rotulo).toBe(`Valor líquido do líder em ${nomeDoHorizonte(ultima)}`);
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

  it('empate de três ofertas lista as três', () => {
    const tres = [cdb, { ...cdb, id: 'cdb2', emissor: 'Banco Z' }, { ...cdb, id: 'cdb3', emissor: 'Banco W' }];
    const colunas = colunasDe(tres).map((c) => ({ ...c, lideres: [0, 1, 2] }));
    const r = frasesDoLider(tres, colunas);
    expect(r?.frase).toMatch(/^Empate técnico entre .+, .+ e .+\.$/);
    expect(r?.frase).toContain('Banco W');
  });

  it('disponibilidade parcial: só uma oferta disponível', () => {
    const colunas = colunasDe([cdb, lci]);
    const ultima = colunas.at(-1) as ColunaHorizonte;
    const parcial = [{ ...ultima, lideres: [0], projecoes: [ultima.projecoes[0], { ...ultima.projecoes[1], estado: 'INDISPONIVEL' }] }] as unknown as ColunaHorizonte[];
    const r = frasesDoLider([cdb, lci], parcial);
    expect(r?.frase).toMatch(/^Só .+ pode ser resgatada nesse prazo\.$/);
  });
});

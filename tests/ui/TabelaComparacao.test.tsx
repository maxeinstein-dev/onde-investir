// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { horizontesPadrao, tabelaPorHorizonte } from '../../src/engine/comparacao';
import type { OfertaCadastrada } from '../../src/engine/ofertas';
import { idColuna, TabelaComparacao } from '../../src/ui/comparacao/TabelaComparacao';
import { CEN, INI } from '../engine/cenarioPadrao';

afterEach(cleanup);

const base = { conglomerado: 'G', liquidez: 'NO_VENCIMENTO' as const };
const cdb: OfertaCadastrada = { ...base, id: 'cdb', emissor: 'Banco X', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, vencimento: '2027-09-28' };
const lci: OfertaCadastrada = { ...base, id: 'lci', emissor: 'Banco Y', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 }, vencimento: '2028-09-28' };
const tesouro: OfertaCadastrada = {
  id: 'tp', emissor: 'Tesouro Nacional', conglomerado: 'Tesouro Nacional', liquidez: 'DIARIA', produto: 'TESOURO_PREFIXADO',
  indexacao: { tipo: 'PRE', taxaAA: 0.13 }, vencimento: '2030-01-01',
};
const selic: OfertaCadastrada = {
  id: 'ts', emissor: 'Tesouro Nacional', conglomerado: 'Tesouro Nacional', liquidez: 'DIARIA', produto: 'TESOURO_SELIC',
  indexacao: { tipo: 'SELIC' }, vencimento: '2031-03-01',
};
const OFERTAS = [cdb, lci, tesouro];

const colunasDe = (ofertas: readonly OfertaCadastrada[], suaData: string | null = null) =>
  tabelaPorHorizonte(ofertas, 10000, INI, horizontesPadrao(INI, suaData), CEN, { tipo: 'PADRAO' });

function montar(ofertas: readonly OfertaCadastrada[] = OFERTAS, colunas = colunasDe(ofertas), onRemover = vi.fn()) {
  render(<TabelaComparacao ofertas={ofertas} colunas={colunas} dataAplicacao={INI} onRemover={onRemover} />);
  return onRemover;
}
const tabela = () => screen.getByRole('table');
const linha = (nome: RegExp) => within(tabela()).getByRole('rowheader', { name: nome }).closest('tr') as HTMLElement;
const celula = (nome: RegExp, oferta: number) => within(linha(nome)).getAllByRole('cell')[oferta] as HTMLElement;
const bloco = (nome: string) => within(tabela()).getByRole('rowgroup', { name: nome });
/** Os rótulos das linhas de um bloco (sem o título do bloco). */
const rotulos = (nome: string) => within(bloco(nome)).getAllByRole('rowheader').filter((l) => l.getAttribute('scope') === 'row');
/** Abre o details como o navegador faz: muda `open` e dispara `toggle`. */
function abrir(d: HTMLDetailsElement) {
  d.open = true;
  fireEvent(d, new Event('toggle'));
}

describe('TabelaComparacao', () => {
  it('caption com o número de ofertas e uma coluna por oferta, com letra, nome e botão de tirar', () => {
    montar();
    expect(tabela().querySelector('caption')).toHaveTextContent('Comparação de 3 ofertas');
    const cabecalhos = within(tabela()).getAllByRole('columnheader').filter((c) => c.getAttribute('scope') === 'col');
    expect(cabecalhos).toHaveLength(3);
    expect(cabecalhos[0]).toHaveTextContent('A');
    expect(cabecalhos[0]).toHaveTextContent('CDB 103% do CDI (Banco X)');
    expect(cabecalhos[2]).toHaveTextContent(/^C/);
    expect(within(cabecalhos[1] as HTMLElement).getByRole('button', { name: 'Tirar LCI 80% do CDI (Banco Y) da comparação' }))
      .toHaveTextContent('✕ Tirar da comparação');
    // O cabeçalho recebe o foco quando a coluna entra.
    expect(cabecalhos[1]).toHaveAttribute('id', idColuna(1));
    expect(cabecalhos[1]).toHaveAttribute('tabindex', '-1');
  });

  it('uma oferta: caption no singular', () => {
    montar([cdb], []);
    expect(tabela().querySelector('caption')).toHaveTextContent('Comparação de 1 oferta');
  });

  it('✕ chama onRemover com o id da oferta', () => {
    const onRemover = montar();
    fireEvent.click(screen.getByRole('button', { name: 'Tirar LCI 80% do CDI (Banco Y) da comparação' }));
    expect(onRemover).toHaveBeenCalledWith('lci');
  });

  it('7 linhas de características, com os valores de cada oferta', () => {
    montar();
    const linhas = rotulos('Características');
    expect(linhas.map((l) => l.textContent)).toEqual([
      'Rentabilidade', 'Emissor', 'Liquidez', 'Vencimento', 'Prazo mínimo', 'Garantia', 'Imposto de Renda',
    ]);
    const valores = (nome: RegExp) => within(linha(nome)).getAllByRole('cell').map((c) => c.textContent);
    expect(valores(/^Rentabilidade$/)).toEqual(['CDB 103% do CDI', 'LCI 80% do CDI', 'Tesouro Prefixado 13% a.a.']);
    expect(valores(/^Emissor$/)).toEqual(['Banco X', 'Banco Y', 'Tesouro Nacional']);
    expect(valores(/^Liquidez$/)).toEqual(['Só no vencimento', 'Só no vencimento', 'Diária']);
    expect(valores(/^Vencimento$/)).toEqual(['28/09/2027', '28/09/2028', '01/01/2030']);
    expect(valores(/^Prazo mínimo$/)).toEqual(['—', '6 meses', '—']);
    // A garantia é um termo explicado: o botão tem o nome, e o painel da dica fica dentro da célula.
    const garantias = within(linha(/^Garantia$/)).getAllByRole('cell').map((c) => within(c).getByRole('button').textContent);
    expect(garantias).toEqual(['FGC', 'FGC', 'Tesouro Nacional']);
    expect(valores(/^Imposto de Renda$/)).toEqual(['Tabela regressiva', 'Isento', 'Tabela regressiva']);
  });

  it('oferta sem vencimento diz "Sem vencimento"', () => {
    const diaria: OfertaCadastrada = { id: 'd', emissor: 'Banco Z', conglomerado: 'Z', liquidez: 'DIARIA', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 } };
    montar([diaria, selic], []);
    expect(celula(/^Vencimento$/, 0)).toHaveTextContent('Sem vencimento');
    expect(celula(/^Liquidez$/, 0)).toHaveTextContent('Diária');
  });

  it('sem colunas (antes de comparar), só as características', () => {
    montar(OFERTAS, []);
    expect(within(tabela()).queryByRole('rowgroup', { name: 'Valor líquido' })).toBeNull();
    expect(bloco('Características')).toBeInTheDocument();
  });

  it('uma linha por horizonte, com a "sua data" pelo nome', () => {
    montar(OFERTAS, colunasDe(OFERTAS, '2032-01-15'));
    const linhas = rotulos('Valor líquido');
    expect(linhas.map((l) => l.textContent)).toEqual([
      '6 meses28/03/2027', '1 ano28/09/2027', '2 anos28/09/2028', '3 anos28/09/2029', '5 anos28/09/2031', '15/01/2032 (sua data)',
    ]);
  });

  it('o líder é marcado na linha certa, com o selo visível e o texto para leitor de tela', () => {
    montar();
    // Em 1 ano o CDB vence; a LCI ainda não pode ser resgatada e o Tesouro está sujeito a marcação.
    const lider = celula(/^1 ano/, 0);
    expect(lider).toHaveClass('celula--lider');
    expect(within(lider).getByText('maior')).toHaveAttribute('aria-hidden', 'true');
    expect(within(lider).getByText('(maior valor líquido)')).toHaveClass('visualmente-oculto');
    expect(celula(/^1 ano/, 1)).not.toHaveClass('celula--lider');
    expect(celula(/^1 ano/, 2)).toHaveTextContent(/preço de mercado/);
  });

  it('LCI em 6 meses: "Indisponível até"', () => {
    montar();
    expect(celula(/^6 meses/, 1)).toHaveTextContent('Indisponível até 28/09/2028: só pode ser resgatado no vencimento.');
  });

  it('abrir o "Por que?" mostra os passos, que só são renderizados sob demanda', () => {
    montar();
    const porque = celula(/^1 ano/, 0).querySelector('details') as HTMLDetailsElement;
    expect(within(porque).getByText('Por que?')).toBeInTheDocument();
    expect(within(porque).queryByText('Valor aplicado')).toBeNull();
    abrir(porque);
    expect(within(porque).getByText('Por que esse resultado?')).toBeInTheDocument();
    expect(within(porque).getByText('Valor aplicado')).toBeInTheDocument();
  });

  it('a célula reaplicada explica o reinvestimento entre as etapas', () => {
    montar();
    const celulaReaplicada = celula(/^2 anos/, 0);
    const frase = 'Venceu em 28/09/2027 e foi reaplicado em CDB 103% do CDI.';
    expect(celulaReaplicada).toHaveTextContent(frase);
    const porque = celulaReaplicada.querySelector('details') as HTMLDetailsElement;
    abrir(porque);
    expect(within(porque).getAllByText('Por que esse resultado?')).toHaveLength(2);
    expect(within(porque).getByText(frase)).toBeInTheDocument();
  });

  it('rola dentro de um contêiner rotulado e focável', () => {
    montar();
    const rolagem = screen.getByRole('region', { name: /Comparação de 3 ofertas/ });
    expect(rolagem).toHaveAttribute('tabindex', '0');
    expect(rolagem).toHaveClass('tabela-rolavel');
    expect(rolagem).toContainElement(tabela());
  });
});

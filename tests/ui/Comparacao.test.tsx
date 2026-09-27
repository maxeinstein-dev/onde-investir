// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { concluirLinhaDoTempo } from '../../src/conteudo/comparacao';
import { linhaDoTempo } from '../../src/engine/comparacao';
import { cenarioConstante } from '../../src/engine/indexadores';
import type { OfertaCadastrada } from '../../src/engine/ofertas';
import { Comparacao } from '../../src/ui/comparacao/Comparacao';
import { CEN, INI } from '../engine/cenarioPadrao';

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const base = { conglomerado: 'G', liquidez: 'NO_VENCIMENTO' as const };
const cdb: OfertaCadastrada = { ...base, id: '1', emissor: 'Banco X', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, vencimento: '2027-09-28' };
const lci: OfertaCadastrada = { ...base, id: '2', emissor: 'Banco Y', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 }, vencimento: '2028-09-28' };
const OFERTAS = [cdb, lci];

/** Renderiza e fixa a data da aplicação no dia útil do cenário padrão. */
function montar(ofertas: readonly OfertaCadastrada[] = OFERTAS) {
  const r = render(<Comparacao ofertas={ofertas} cenario={CEN} descricaoCenario="Cenário de teste." />);
  fireEvent.input(screen.getByLabelText('Data da aplicação'), { target: { value: INI } });
  return r;
}
const comparar = () => fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
/** Compara e pula o palpite (desligando os palpites). */
function compararDireto() {
  comparar();
  fireEvent.click(screen.getByRole('button', { name: /pular/i }));
}
const tabela = () => screen.getByRole('table');
const linhaDa = (nome: RegExp) => within(tabela()).getByRole('rowheader', { name: nome }).closest('tr') as HTMLElement;
const celula = (nome: RegExp, coluna: number) => within(linhaDa(nome)).getAllByRole('cell')[coluna] as HTMLElement;

describe('Comparacao', () => {
  it('com menos de duas ofertas, avisa e desabilita o botão', () => {
    render(<Comparacao ofertas={[cdb]} cenario={CEN} descricaoCenario="x" />);
    expect(screen.getByText('Cadastre pelo menos duas ofertas para comparar.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comparar' })).toBeDisabled();
  });

  it('o palpite pergunta pelo maior horizonte e esconde o resultado', () => {
    montar();
    comparar();
    const titulo = screen.getByRole('heading', { name: 'Qual lidera em 5 anos?' });
    expect(document.activeElement).toBe(titulo);
    expect(titulo.id).toBe('comparacao-palpite-titulo');
    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'B: LCI 80% do CDI (Banco Y)' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Resultado da comparação' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText(/^Não foi dessa vez/)).toBeInTheDocument();
  });

  it('com a "sua data", o palpite pergunta por ela quando é o maior horizonte', () => {
    montar();
    fireEvent.input(screen.getByLabelText('Sua data (opcional)'), { target: { value: '2032-01-15' } });
    comparar();
    expect(screen.getByRole('heading', { name: 'Qual lidera em 15/01/2032 (sua data)?' })).toBeInTheDocument();
  });

  it('a tabela tem caption, 5 colunas de horizonte com scope e rola dentro de um contêiner rotulado', () => {
    montar();
    compararDireto();
    const t = tabela();
    expect(t.querySelector('caption')).toHaveTextContent(/Valor líquido por horizonte/);
    const colunas = within(t).getAllByRole('columnheader');
    expect(colunas.map((c) => c.getAttribute('scope'))).toEqual(Array(6).fill('col'));
    expect(colunas.slice(1).map((c) => c.textContent)).toEqual([
      '6 meses28/03/2027', '1 ano28/09/2027', '2 anos28/09/2028', '3 anos28/09/2029', '5 anos28/09/2031',
    ]);
    expect(within(t).getAllByRole('rowheader').map((c) => c.getAttribute('scope'))).toEqual(['row', 'row']);
    const rolagem = screen.getByRole('region', { name: /Valor líquido por horizonte/ });
    expect(rolagem).toHaveAttribute('tabindex', '0');
    expect(rolagem).toHaveClass('tabela-rolavel');
    expect(rolagem).toContainElement(t);
  });

  it('a célula da LCI em 6 meses diz "Indisponível até"', () => {
    montar();
    compararDireto();
    expect(celula(/LCI/, 0)).toHaveTextContent('Indisponível até 28/09/2028: só pode ser resgatado no vencimento.');
  });

  it('o líder tem a classe e o texto visualmente oculto; cada célula disponível explica o porquê', () => {
    montar();
    compararDireto();
    // Em 1 ano o CDB vence e a LCI ainda não pode ser resgatada.
    const lider = celula(/CDB/, 1);
    expect(lider).toHaveClass('celula--lider');
    expect(within(lider).getByText('(maior valor líquido)')).toHaveClass('visualmente-oculto');
    expect(within(lider).getByText('Por que?')).toBeInTheDocument();
    expect(celula(/LCI/, 1)).not.toHaveClass('celula--lider');
    expect(within(celula(/LCI/, 1)).queryByText('Por que?')).toBeNull();
  });

  it('a célula reaplicada explica o reinvestimento entre as etapas', () => {
    montar();
    compararDireto();
    const doisAnos = celula(/CDB/, 2);
    const frase = 'Venceu em 28/09/2027 e foi reaplicado em CDB 103% do CDI.';
    const porque = doisAnos.querySelector('details') as HTMLElement;
    expect(within(porque).getAllByText('Por que esse resultado?')).toHaveLength(2);
    expect(within(porque).getByText(frase)).toBeInTheDocument();
  });

  it('a linha do tempo mostra os marcos e a conclusão', () => {
    montar();
    compararDireto();
    const secao = screen.getByRole('region', { name: 'Linha do tempo dos vencimentos' });
    const marcos = within(secao).getAllByRole('heading', { level: 4 });
    expect(marcos.map((m) => m.textContent)).toEqual(['28/09/2027', '28/09/2028']);
    const conclusao = concluirLinhaDoTempo(OFERTAS, linhaDoTempo(OFERTAS, 10000, INI, CEN, { tipo: 'PADRAO' }));
    expect(conclusao.length).toBeGreaterThan(0);
    // NBSP do R$ vira espaço na normalização do Testing Library.
    for (const frase of conclusao) expect(within(secao).getByText(frase.replace(/\s+/g, ' '))).toBeInTheDocument();
  });

  it('trocar o reinvestimento para 100% do CDI esconde o resultado e muda o texto do reinvestimento', () => {
    montar();
    compararDireto();
    expect(celula(/CDB/, 2)).toHaveTextContent('reaplicado em CDB 103% do CDI');
    fireEvent.change(screen.getByLabelText('Reinvestimento'), { target: { value: 'CDI_100' } });
    expect(screen.queryByRole('table')).toBeNull();
    comparar();
    expect(celula(/CDB/, 2)).toHaveTextContent('Venceu em 28/09/2027 e foi reaplicado em CDB 100% do CDI.');
    expect(screen.getByText(/reaplicado em CDB 100% do CDI\. O IR recomeça na reaplicação/)).toBeInTheDocument();
  });

  it('taxa fixa pede a taxa e valida', () => {
    montar();
    fireEvent.change(screen.getByLabelText('Reinvestimento'), { target: { value: 'TAXA_FIXA' } });
    fireEvent.input(screen.getByLabelText('Taxa do reinvestimento (% a.a.)'), { target: { value: '' } });
    comparar();
    expect(screen.getByRole('alert')).toHaveTextContent('Preencha a taxa do reinvestimento.');
    fireEvent.input(screen.getByLabelText('Taxa do reinvestimento (% a.a.)'), { target: { value: '12' } });
    compararDireto();
    expect(celula(/CDB/, 2)).toHaveTextContent('reaplicado em CDB prefixado 12% a.a.');
  });

  it.each([
    ['Valor (R$)', '', 'Preencha o valor da aplicação.'],
    ['Valor (R$)', '0', 'Preencha o valor da aplicação.'],
    ['Data da aplicação', '', 'Informe a data da aplicação.'],
    ['Sua data (opcional)', '2026-01-01', 'A sua data precisa ser depois da data da aplicação.'],
  ])('%s = "%s" gera alerta humano', (rotulo, valor, mensagem) => {
    montar();
    fireEvent.input(screen.getByLabelText(rotulo), { target: { value: valor } });
    comparar();
    expect(screen.getByRole('alert')).toHaveTextContent(mensagem);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('a oferta editada esconde o resultado', () => {
    const { rerender } = montar();
    compararDireto();
    expect(tabela()).toBeInTheDocument();
    rerender(<Comparacao ofertas={[{ ...cdb, indexacao: { tipo: 'POS_CDI', percentualCDI: 1.1 } }, lci]} cenario={CEN} descricaoCenario="Cenário de teste." />);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('trocar o cenário esconde o resultado', () => {
    const { rerender } = montar();
    compararDireto();
    const outro = cenarioConstante({ cdiAA: 0.1, selicMetaAA: 0.101, ipcaAA: 0.04, trAM: 0 });
    rerender(<Comparacao ofertas={OFERTAS} cenario={outro} descricaoCenario="Outro." />);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('com os palpites desligados, Comparar leva direto ao resultado', () => {
    montar();
    compararDireto();
    comparar();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Resultado da comparação' }));
  });
});

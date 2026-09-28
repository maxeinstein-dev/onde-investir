// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { render as renderizarDireto } from 'preact';
import { useState } from 'preact/hooks';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { adicionar } from '../../src/armazenamento/comparacao';
import { concluirLinhaDoTempo } from '../../src/conteudo/comparacao';
import { ehDiaUtil } from '../../src/engine/calendario';
import { linhaDoTempo } from '../../src/engine/comparacao';
import { calcularEquivalencias } from '../../src/engine/equivalencia';
import { cenarioConstante, type Cenario } from '../../src/engine/indexadores';
import type { OfertaCadastrada } from '../../src/engine/ofertas';
import { formatarMoeda } from '../../src/formato';
import { Comparador } from '../../src/ui/comparacao/Comparador';
import { idColuna } from '../../src/ui/comparacao/TabelaComparacao';
import { CEN, INI } from '../engine/cenarioPadrao';
import { seriesDeValorLiquido } from '../../src/engine/serie';
import { paraDia, somarMeses } from '../../src/engine/datas';
import { graficos } from './graficos/mockChart';

// Sem canvas no jsdom: o Chart.js falso guarda a configuração de cada gráfico.
vi.mock('chart.js', () => import('./graficos/mockChart'));
vi.mock('chartjs-plugin-annotation', () => ({ default: { id: 'annotation' } }));

afterEach(() => {
  cleanup();
  graficos.length = 0;
});
beforeEach(() => localStorage.clear());

const base = { conglomerado: 'G', liquidez: 'NO_VENCIMENTO' as const };
const cdb: OfertaCadastrada = { ...base, id: 'x', emissor: 'Banco X', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, vencimento: '2027-09-28' };
const lci: OfertaCadastrada = { ...base, id: 'y', emissor: 'Banco Y', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 }, vencimento: '2028-09-28' };
const diario: OfertaCadastrada = { id: 'z', emissor: 'Banco Z', conglomerado: 'Z', liquidez: 'DIARIA', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.1 } };
const tesouro: OfertaCadastrada = {
  id: 't', emissor: 'Tesouro Nacional', conglomerado: 'Tesouro Nacional', liquidez: 'DIARIA', produto: 'TESOURO_PREFIXADO',
  indexacao: { tipo: 'PRE', taxaAA: 0.13 }, vencimento: '2030-01-01',
};
const CATALOGO = [cdb, lci, diario, tesouro];

interface PropsTela { catalogo?: OfertaCadastrada[]; selecao?: string[]; cenario?: Cenario; cenarioInvalido?: string | null }
/** O comparador com o catálogo e a seleção em estado, como o App faz. */
function Tela({ catalogo: cat = CATALOGO, selecao: sel = [], cenario = CEN, cenarioInvalido = null }: PropsTela) {
  const [catalogo, setCatalogo] = useState(cat);
  const [selecao, setSelecao] = useState(sel);
  return (
    <Comparador catalogo={catalogo} selecao={selecao} onMudarSelecao={setSelecao} gerarId={() => 'nova'}
      onCriarOferta={(o) => { setCatalogo([...catalogo, o]); setSelecao(adicionar(selecao, o.id).ids); }}
      cenario={cenario} descricaoCenario="Cenário de teste." cenarioInvalido={cenarioInvalido} />
  );
}

/** Renderiza e fixa a data da aplicação no dia útil do cenário padrão. */
function montar(props: PropsTela = {}) {
  const r = render(<Tela {...props} />);
  fireEvent.input(screen.getByLabelText('Data da aplicação'), { target: { value: INI } });
  return r;
}
const botaoComparar = () => screen.getByRole('button', { name: 'Comparar' });
const comparar = () => fireEvent.click(botaoComparar());
/** Compara e pula o palpite (desligando os palpites). */
function compararDireto() {
  comparar();
  fireEvent.click(screen.getByRole('button', { name: /pular/i }));
}
const tituloResultado = () => screen.queryByRole('heading', { name: 'Resultado da comparação' });
const tabela = () => screen.getByRole('table');
const colunas = () => within(tabela()).getAllByRole('columnheader').filter((c) => c.getAttribute('scope') === 'col');
const valores = () => within(tabela()).queryByRole('rowgroup', { name: 'Valor líquido' });
const celula = (horizonte: RegExp, oferta: number) =>
  within(within(tabela()).getByRole('rowheader', { name: horizonte }).closest('tr') as HTMLElement).getAllByRole('cell')[oferta] as HTMLElement;
/** Há dois "no prazo de": o das equivalências e o do "Por que … lidera". */
const prazoEquivalencias = () => within(document.querySelector('.comparacao__equivalencias') as HTMLElement).getByLabelText('no prazo de');
const secaoLider = () => screen.queryByRole('heading', { name: /^Por que .* (lidera|empatam) em / })?.closest('section') ?? null;
const prazoLider = () => within(secaoLider() as HTMLElement).getByLabelText('no prazo de');
const secaoEquivalencias = () => screen.getByRole('heading', { name: /^Equivalências de/ }).closest('section') as HTMLElement;

describe('Comparador', () => {
  describe('estado vazio', () => {
    it('sem ofertas: explica, destaca o "+ Adicionar" e desabilita Comparar', () => {
      render(<Tela />);
      const vazio = screen.getByText('Adicione pelo menos duas ofertas para comparar (até 5).');
      expect(vazio).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^\+ Adicionar oferta/ })).toHaveClass('primario');
      expect(botaoComparar()).toBeDisabled();
      expect(screen.queryByRole('table')).toBeNull();
    });
    it('com uma oferta: a coluna aparece, mas o estado vazio continua', () => {
      render(<Tela selecao={['x']} />);
      expect(colunas()).toHaveLength(1);
      expect(screen.getByText('Adicione pelo menos duas ofertas para comparar (até 5).')).toBeInTheDocument();
      expect(botaoComparar()).toBeDisabled();
    });
    it('com duas, o "+ Adicionar" sai do destaque e Comparar habilita', () => {
      render(<Tela selecao={['x', 'y']} />);
      expect(screen.queryByText(/Adicione pelo menos duas ofertas/)).toBeNull();
      expect(screen.getByRole('button', { name: /^\+ Adicionar oferta/ })).not.toHaveClass('primario');
      expect(botaoComparar()).toBeEnabled();
    });
  });

  it('adicionar duas pelo seletor e comparar: palpite, depois a tabela com os valores', () => {
    montar();
    const abrirSeletor = () => fireEvent.click(screen.getByRole('button', { name: /^\+ Adicionar oferta/ }));
    abrirSeletor();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar CDB 103% do CDI (Banco X)' }));
    abrirSeletor();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar LCI 80% do CDI (Banco Y)' }));
    expect(colunas()).toHaveLength(2);
    expect(valores()).toBeNull();
    comparar();
    const pergunta = screen.getByRole('heading', { name: 'Qual lidera em 5 anos?' });
    expect(pergunta).toHaveFocus();
    expect(pergunta.id).toBe('comparador-palpite-titulo');
    // As características ficam à vista durante o palpite; os valores, não.
    expect(colunas()).toHaveLength(2);
    expect(valores()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'B: LCI 80% do CDI (Banco Y)' }));
    expect(tituloResultado()).toHaveFocus();
    expect(valores()).toBeInTheDocument();
    expect(screen.getByText(/^Não foi dessa vez/)).toBeInTheDocument();
  });

  it('palpite com 3 ofertas: um botão por oferta, com as letras', () => {
    montar({ selecao: ['x', 'y', 'z'] });
    comparar();
    const palpite = screen.getByRole('heading', { name: 'Qual lidera em 5 anos?' }).closest('section') as HTMLElement;
    expect(within(palpite).getAllByRole('button', { name: /^[ABC]: / }).map((b) => b.textContent)).toEqual([
      'A: CDB 103% do CDI (Banco X)', 'B: LCI 80% do CDI (Banco Y)', 'C: CDB 110% do CDI (Banco Z)',
    ]);
    fireEvent.click(within(palpite).getByRole('button', { name: 'C: CDB 110% do CDI (Banco Z)' }));
    expect(screen.getByText('Você acertou.')).toBeInTheDocument();
  });

  it('com a "sua data" mais distante, o palpite pergunta por ela', () => {
    montar({ selecao: ['x', 'y'] });
    fireEvent.input(screen.getByLabelText('Sua data (opcional)'), { target: { value: '2032-01-15' } });
    comparar();
    expect(screen.getByRole('heading', { name: 'Qual lidera em 15/01/2032 (sua data)?' })).toBeInTheDocument();
  });

  it('sem ninguém disponível no horizonte perguntado, pula o palpite e mantém os palpites ligados', () => {
    const longe = { ...base, vencimento: '2035-09-28' };
    const a: OfertaCadastrada = { ...longe, id: 'l1', emissor: 'Banco X', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.1 } };
    const b: OfertaCadastrada = { ...longe, id: 'l2', emissor: 'Banco Y', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.2 } };
    montar({ catalogo: [a, b], selecao: ['l1', 'l2'] });
    comparar();
    expect(screen.queryByRole('heading', { name: /Qual lidera/ })).toBeNull();
    expect(tituloResultado()).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Religar os palpites' })).toBeNull();
  });

  it('pular desliga os palpites; "Religar os palpites" volta a perguntar', () => {
    montar({ selecao: ['x', 'y'] });
    compararDireto();
    comparar();
    expect(tituloResultado()).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Religar os palpites' }));
    comparar();
    expect(screen.getByRole('heading', { name: 'Qual lidera em 5 anos?' })).toBeInTheDocument();
  });

  it('o resultado diz o valor aplicado e a premissa do reinvestimento; a linha do tempo conclui', () => {
    montar({ selecao: ['x', 'y'] });
    compararDireto();
    expect(screen.getByText(/R\$\s10\.000,00 aplicados em 28\/09\/2026 em cada oferta\./)).toBeInTheDocument();
    expect(screen.getByText(/no mesmo % do CDI .* O IR recomeça na reaplicação/)).toBeInTheDocument();
    const secao = screen.getByRole('region', { name: 'Linha do tempo dos vencimentos' });
    expect(within(secao).getAllByRole('heading', { level: 4 }).map((m) => m.textContent)).toEqual(['28/09/2027', '28/09/2028']);
    const conclusao = concluirLinhaDoTempo([cdb, lci], linhaDoTempo([cdb, lci], 10000, INI, CEN, { tipo: 'PADRAO' }));
    for (const frase of conclusao) expect(within(secao).getByText(frase.replace(/\s+/g, ' '))).toBeInTheDocument();
  });

  it('quando a ordem muda depois do último vencimento, a conclusão concorda com a tabela', () => {
    const lciPre: OfertaCadastrada = { ...lci, id: 'p', indexacao: { tipo: 'PRE', taxaAA: 0.13 } };
    const cdbDiario: OfertaCadastrada = { ...diario, id: 'd', emissor: 'Banco X', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.08 } };
    montar({ catalogo: [lciPre, cdbDiario], selecao: ['p', 'd'] });
    compararDireto();
    expect(celula(/^5 anos/, 1)).toHaveClass('celula--lider');
    const secao = screen.getByRole('region', { name: 'Linha do tempo dos vencimentos' });
    expect(within(secao).getByText('Depois disso a ordem muda: em 5 anos quem lidera é CDB 108% do CDI (Banco X).')).toBeInTheDocument();
  });

  it('trocar o reinvestimento esconde o resultado; comparar de novo usa a regra nova', () => {
    montar({ selecao: ['x', 'y'] });
    compararDireto();
    expect(celula(/^2 anos/, 0)).toHaveTextContent('reaplicado em CDB 103% do CDI');
    fireEvent.change(screen.getByLabelText('Reinvestimento'), { target: { value: 'CDI_100' } });
    expect(valores()).toBeNull();
    comparar();
    expect(celula(/^2 anos/, 0)).toHaveTextContent('Venceu em 28/09/2027 e foi reaplicado em CDB 100% do CDI.');
  });

  it('taxa fixa pede a taxa e valida', () => {
    montar({ selecao: ['x', 'y'] });
    fireEvent.change(screen.getByLabelText('Reinvestimento'), { target: { value: 'TAXA_FIXA' } });
    fireEvent.input(screen.getByLabelText('Taxa do reinvestimento (% a.a.)'), { target: { value: '' } });
    comparar();
    expect(screen.getByRole('alert')).toHaveTextContent('Preencha a taxa do reinvestimento.');
    fireEvent.input(screen.getByLabelText('Taxa do reinvestimento (% a.a.)'), { target: { value: '12' } });
    compararDireto();
    expect(celula(/^2 anos/, 0)).toHaveTextContent('reaplicado em CDB prefixado 12% a.a.');
  });

  describe('equivalências', () => {
    it('padrão: a oferta A no horizonte mais distante disponível, com o aviso da reaplicação', () => {
      montar({ selecao: ['x', 'z'] });
      compararDireto();
      expect(screen.getByLabelText('Calcular equivalências para')).toHaveValue('x');
      expect(prazoEquivalencias()).toHaveValue('2031-09-28');
      expect(screen.getByRole('heading', { name: 'Equivalências de CDB 103% do CDI (Banco X)' })).toBeInTheDocument();
      expect(secaoEquivalencias()).toHaveTextContent('As equivalências consideram CDB 103% do CDI aplicado de uma vez até 28/09/2031, sem reaplicar no vencimento.');
    });

    it('para a oferta B em 2 anos', () => {
      montar({ selecao: ['x', 'z'] });
      compararDireto();
      const oferta = screen.getByLabelText('Calcular equivalências para');
      expect(within(oferta).getAllByRole('option').map((o) => o.textContent)).toEqual(['A: CDB 103% do CDI (Banco X)', 'B: CDB 110% do CDI (Banco Z)']);
      fireEvent.change(oferta, { target: { value: 'z' } });
      const prazo = prazoEquivalencias();
      expect(within(prazo).getAllByRole('option').map((o) => o.textContent)).toEqual(['6 meses', '1 ano', '2 anos', '3 anos', '5 anos']);
      fireEvent.change(prazo, { target: { value: '2028-09-28' } });
      expect(screen.getByRole('heading', { name: 'Equivalências de CDB 110% do CDI (Banco Z)' })).toBeInTheDocument();
      const eq = calcularEquivalencias({ produto: 'CDB', indexacao: diario.indexacao, valor: 10000, dataAplicacao: INI }, '2028-09-28', CEN);
      expect(secaoEquivalencias()).toHaveTextContent(formatarMoeda(eq.liquidoAlvo).replace(/\s/g, ' '));
      expect(secaoEquivalencias()).toHaveTextContent(/você precisaria de/);
      // O valor líquido é o mesmo da célula da tabela.
      expect(celula(/^2 anos/, 1)).toHaveTextContent(formatarMoeda(eq.liquidoAlvo).replace(/\s/g, ' '));
    });

    it('oferta indisponível na data escolhida: explica o motivo e não calcula', () => {
      montar({ selecao: ['t', 'z'] });
      compararDireto();
      fireEvent.change(prazoEquivalencias(), { target: { value: '2028-09-28' } });
      const secao = secaoEquivalencias();
      expect(secao).toHaveTextContent('Não dá para calcular as equivalências nessa data.');
      expect(secao).toHaveTextContent('Vence em 01/01/2030. Se vender antes, recebe o preço de mercado do dia');
      expect(within(secao).queryByText(/você precisaria de/)).toBeNull();
    });

    it('sem nenhum horizonte disponível para a oferta, o padrão é o mais distante, com o motivo', () => {
      const longe: OfertaCadastrada = { ...cdb, id: 'l', vencimento: '2035-09-28' };
      montar({ catalogo: [longe, diario], selecao: ['l', 'z'] });
      compararDireto();
      expect(prazoEquivalencias()).toHaveValue('2031-09-28');
      expect(secaoEquivalencias()).toHaveTextContent('Indisponível até 28/09/2035: só pode ser resgatado no vencimento.');
    });
  });

  describe('por que o líder lidera', () => {
    // Vencem em 2 anos: nesse prazo, sem reaplicação; em 3 e 5 anos, reaplicadas.
    const cdb2: OfertaCadastrada = { ...cdb, id: 'c2', vencimento: '2028-09-28' };
    const lci95: OfertaCadastrada = { ...lci, id: 'l95', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.95 } };
    const cat = [...CATALOGO, cdb2, lci95];

    it('fica abaixo da tabela e, por padrão, no horizonte mais distante com líder', () => {
      montar({ catalogo: cat, selecao: ['c2', 'y'] });
      compararDireto();
      const secao = secaoLider() as HTMLElement;
      expect(secao).not.toBeNull();
      expect(within(secao).getByRole('heading', { level: 3 })).toHaveTextContent('Por que CDB 103% do CDI (Banco X) lidera em 5 anos?');
      expect(prazoLider()).toHaveValue('2031-09-28');
      // Abaixo da tabela, antes da linha do tempo.
      expect(tabela().compareDocumentPosition(secao) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      const linha = screen.getByRole('heading', { name: 'Linha do tempo dos vencimentos' });
      expect(secao.compareDocumentPosition(linha) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('com reaplicação: só o placar e a frase da reaplicação', () => {
      montar({ catalogo: cat, selecao: ['c2', 'y'] });
      compararDireto();
      const itens = within(secaoLider() as HTMLElement).getAllByRole('listitem').map((li) => li.textContent);
      expect(itens).toHaveLength(3);
      expect(itens[0]).toMatch(/^CDB 103% do CDI \(Banco X\) termina com .* a mais que LCI 80% do CDI \(Banco Y\)\.$/);
      expect(itens).toContain('CDB 103% do CDI (Banco X) venceu em 28/09/2028 e foi reaplicado em CDB 103% do CDI.');
      expect(itens.join(' ')).not.toMatch(/Mesmo pagando IR/);
    });

    it('CDB 103% × LCI 80% em 2 anos: "Mesmo pagando IR" (trocando o prazo no select)', () => {
      montar({ catalogo: cat, selecao: ['c2', 'y'] });
      compararDireto();
      expect(within(prazoLider()).getAllByRole('option').map((o) => o.textContent)).toEqual(['2 anos', '3 anos', '5 anos']);
      fireEvent.change(prazoLider(), { target: { value: '2028-09-28' } });
      const secao = secaoLider() as HTMLElement;
      expect(within(secao).getByRole('heading', { level: 3 })).toHaveTextContent('Por que CDB 103% do CDI (Banco X) lidera em 2 anos?');
      expect(secao).toHaveTextContent(/CDB 103% do CDI \(Banco X\) termina com R\$\s12\.551,90 líquidos: R\$\s289,86 \(2,36%\) a mais que LCI 80% do CDI \(Banco Y\)\./);
      expect(secao).toHaveTextContent('LCI 80% do CDI (Banco Y) é isenta de IR.');
      expect(secao).toHaveTextContent(/Mesmo pagando IR, CDB 103% do CDI \(Banco X\) vence/);
      // Independente das equivalências.
      expect(prazoEquivalencias()).toHaveValue('2031-09-28');
    });

    it('LCI 95% × CDB 103% em 2 anos: a isenta vence', () => {
      montar({ catalogo: cat, selecao: ['l95', 'c2'] });
      compararDireto();
      fireEvent.change(prazoLider(), { target: { value: '2028-09-28' } });
      const secao = secaoLider() as HTMLElement;
      expect(within(secao).getByRole('heading', { level: 3 })).toHaveTextContent('Por que LCI 95% do CDI (Banco Y) lidera em 2 anos?');
      expect(secao).toHaveTextContent('LCI 95% do CDI (Banco Y) rende menos antes do imposto, mas como não paga IR fica na frente.');
    });

    it('trocar o prazo das equivalências não mexe no "Por que … lidera"', () => {
      montar({ catalogo: cat, selecao: ['c2', 'y'] });
      compararDireto();
      fireEvent.change(prazoEquivalencias(), { target: { value: '2028-09-28' } });
      expect(prazoLider()).toHaveValue('2031-09-28');
    });

    it('empate no 1º lugar: a frase de empate', () => {
      const gemeo: OfertaCadastrada = { ...cdb2, id: 'g', emissor: 'Banco W' };
      montar({ catalogo: [...cat, gemeo], selecao: ['c2', 'g'] });
      compararDireto();
      const secao = secaoLider() as HTMLElement;
      expect(within(secao).getByRole('heading', { level: 3 })).toHaveTextContent('Por que CDB 103% do CDI (Banco X) e CDB 103% do CDI (Banco W) empatam em 5 anos?');
      expect(within(secao).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
        expect.stringMatching(/^CDB 103% do CDI \(Banco X\) e CDB 103% do CDI \(Banco W\) terminam empatados, com R\$\s[\d.,]+ líquidos\.$/),
      ]);
    });

    it('só uma disponível no prazo', () => {
      const longe: OfertaCadastrada = { ...cdb, id: 'l', vencimento: '2035-09-28' };
      montar({ catalogo: [longe, diario], selecao: ['l', 'z'] });
      compararDireto();
      expect(secaoLider()).toHaveTextContent('Só CDB 110% do CDI (Banco Z) pode ser resgatada nesse prazo.');
    });

    it('nenhuma disponível em nenhum prazo: a seção não aparece', () => {
      const longe: OfertaCadastrada = { ...cdb, id: 'l', vencimento: '2035-09-28' };
      const longe2: OfertaCadastrada = { ...lci, id: 'l2', vencimento: '2035-09-28' };
      montar({ catalogo: [longe, longe2], selecao: ['l', 'l2'] });
      comparar();
      expect(tituloResultado()).toBeInTheDocument();
      expect(secaoLider()).toBeNull();
    });
  });

  describe('remover uma coluna', () => {
    it('com o resultado aberto, recalcula na hora sem repetir o palpite, e o foco vai para a coluna vizinha', () => {
      montar({ selecao: ['x', 'y', 'z'] });
      comparar();
      fireEvent.click(screen.getByRole('button', { name: 'A: CDB 103% do CDI (Banco X)' }));
      fireEvent.click(screen.getByRole('button', { name: 'Tirar da comparação: CDB 110% do CDI (Banco Z)' }));
      expect(tituloResultado()).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: /Qual lidera/ })).toBeNull();
      expect(colunas()).toHaveLength(2);
      expect(valores()).toBeInTheDocument();
      expect(within(valores() as HTMLElement).getAllByRole('row')[1]?.querySelectorAll('td')).toHaveLength(2);
      expect(document.getElementById(idColuna(1))).toHaveFocus();
      expect(screen.getByRole('status')).toHaveTextContent('CDB 110% do CDI (Banco Z) saiu da comparação.');
    });

    it('ficando uma só, o resultado some e volta o estado vazio', () => {
      montar({ selecao: ['x', 'y'] });
      compararDireto();
      fireEvent.click(screen.getByRole('button', { name: 'Tirar da comparação: CDB 103% do CDI (Banco X)' }));
      expect(tituloResultado()).toBeNull();
      expect(screen.getByText('Adicione pelo menos duas ofertas para comparar (até 5).')).toBeInTheDocument();
      expect(document.getElementById(idColuna(0))).toHaveFocus();
    });

    it('o anúncio de saída se repete: a mesma mensagem é limpa e reescrita', () => {
      vi.useFakeTimers();
      onTestFinished(() => { vi.useRealTimers(); });
      render(<Tela selecao={['x', 'y']} />);
      const status = screen.getByRole('status');
      const tirarX = () => fireEvent.click(screen.getByRole('button', { name: 'Tirar da comparação: CDB 103% do CDI (Banco X)' }));
      tirarX();
      expect(status).toHaveTextContent('CDB 103% do CDI (Banco X) saiu da comparação.');
      fireEvent.click(screen.getByRole('button', { name: /^\+ Adicionar oferta/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Adicionar CDB 103% do CDI (Banco X)' }));
      tirarX();
      expect(status).toHaveTextContent('');
      act(() => { vi.advanceTimersByTime(200); });
      expect(screen.getByRole('status')).toBe(status);
      expect(status).toHaveTextContent('CDB 103% do CDI (Banco X) saiu da comparação.');
    });

    it('[A, B] com resultado, tira B e adiciona B de novo: sem resultado até clicar "Comparar"', () => {
      montar({ selecao: ['x', 'y'] });
      compararDireto();
      expect(tituloResultado()).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Tirar da comparação: LCI 80% do CDI (Banco Y)' }));
      expect(tituloResultado()).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /^\+ Adicionar oferta/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Adicionar LCI 80% do CDI (Banco Y)' }));
      expect(colunas()).toHaveLength(2);
      expect(tituloResultado()).toBeNull();
      expect(valores()).toBeNull();
      comparar();
      expect(tituloResultado()).toBeInTheDocument();
    });

    it('tirar a última deixa o foco no "+ Adicionar"', () => {
      render(<Tela selecao={['x']} />);
      fireEvent.click(screen.getByRole('button', { name: 'Tirar da comparação: CDB 103% do CDI (Banco X)' }));
      expect(screen.queryByRole('table')).toBeNull();
      expect(screen.getByRole('button', { name: /^\+ Adicionar oferta/ })).toHaveFocus();
    });
  });

  describe('invalidação', () => {
    it('editar o valor esconde o resultado', () => {
      montar({ selecao: ['x', 'y'] });
      compararDireto();
      expect(valores()).toBeInTheDocument();
      fireEvent.input(screen.getByLabelText('Valor (R$)'), { target: { value: '5000' } });
      expect(tituloResultado()).toBeNull();
      expect(valores()).toBeNull();
      // As colunas continuam.
      expect(colunas()).toHaveLength(2);
    });

    it('adicionar uma oferta esconde o resultado', () => {
      montar({ selecao: ['x', 'y'] });
      compararDireto();
      fireEvent.click(screen.getByRole('button', { name: /^\+ Adicionar oferta/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Adicionar CDB 110% do CDI (Banco Z)' }));
      expect(tituloResultado()).toBeNull();
      expect(colunas()).toHaveLength(3);
    });

    it('a oferta editada no catálogo esconde o resultado', () => {
      const Externa = ({ catalogo }: { catalogo: OfertaCadastrada[] }) => (
        <Comparador catalogo={catalogo} selecao={['x', 'y']} onMudarSelecao={() => {}} onCriarOferta={() => {}}
          cenario={CEN} descricaoCenario="x" />
      );
      const { rerender } = render(<Externa catalogo={CATALOGO} />);
      fireEvent.input(screen.getByLabelText('Data da aplicação'), { target: { value: INI } });
      compararDireto();
      expect(valores()).toBeInTheDocument();
      const editada = { ...cdb, indexacao: { tipo: 'POS_CDI' as const, percentualCDI: 1.2 } };
      rerender(<Externa catalogo={[editada, lci, diario, tesouro]} />);
      expect(valores()).toBeNull();
    });

    it('trocar o cenário esconde o resultado na própria renderização, sem esperar um efeito', () => {
      const { container } = montar({ selecao: ['x', 'y'] });
      compararDireto();
      expect(tituloResultado()).toBeInTheDocument();
      const outro = cenarioConstante({ cdiAA: 0.1, selicMetaAA: 0.101, ipcaAA: 0.04, trAM: 0 });
      renderizarDireto(<Tela selecao={['x', 'y']} cenario={outro} />, container);
      expect(tituloResultado()).toBeNull();
    });

    it('com o cenário do painel inválido, Comparar fica desabilitado e avisa', () => {
      render(<Tela selecao={['x', 'y']} cenarioInvalido="Preencha o CDI do cenário." />);
      expect(botaoComparar()).toBeDisabled();
      expect(botaoComparar()).toHaveAccessibleDescription('Corrija o cenário no painel antes de comparar.');
    });
  });

  describe('alertas e gráficos', () => {
    // CDB 102,8% com liquidez diária contra o CDB 103% só no vencimento: diferença pequena, liquidez maior.
    const quase: OfertaCadastrada = { id: 'w', emissor: 'Banco W', conglomerado: 'W', liquidez: 'DIARIA', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.028 } };
    const secaoAlertas = () => screen.queryByRole('region', { name: 'Alertas' });
    const detalhesGraficos = () => [...document.querySelectorAll('details')].find((d) => d.querySelector('summary')?.textContent === 'Gráficos') ?? null;

    it('com um quase empate e liquidez, o alerta aparece logo abaixo da tabela, antes do "Por que lidera"', () => {
      montar({ catalogo: [...CATALOGO, quase], selecao: ['x', 'w'] });
      compararDireto();
      const alertas = secaoAlertas() as HTMLElement;
      expect(within(alertas).getByRole('heading', { name: 'Diferença pequena, liquidez maior' })).toBeInTheDocument();
      expect(within(alertas).getByRole('list')).toBeInTheDocument();
      const depois = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      expect(depois(tabela(), alertas)).toBe(true);
      expect(depois(alertas, secaoLider() as HTMLElement)).toBe(true);
      // O alerta não rouba o foco: ele continua no título do resultado.
      expect(tituloResultado()).toHaveFocus();
    });

    it('os gráficos só aparecem depois de "Comparar", num <details open> entre a tabela e a linha do tempo', () => {
      montar({ selecao: ['x', 'y'] });
      expect(detalhesGraficos()).toBeNull();
      comparar();
      // No palpite, ainda não.
      expect(detalhesGraficos()).toBeNull();
      expect(graficos).toHaveLength(0);
      fireEvent.click(screen.getByRole('button', { name: 'A: CDB 103% do CDI (Banco X)' }));
      const detalhes = detalhesGraficos() as HTMLDetailsElement;
      expect(detalhes.open).toBe(true);
      const linha = screen.getByRole('heading', { name: 'Linha do tempo dos vencimentos' });
      expect(tabela().compareDocumentPosition(detalhes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(detalhes.compareDocumentPosition(linha) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(within(detalhes).getAllByRole('img')).toHaveLength(2);
      expect(graficos).toHaveLength(2);
    });

    it('o gráfico do valor líquido recebe as séries do engine, até o horizonte mais distante', () => {
      montar({ selecao: ['x', 'y'] });
      compararDireto();
      const esperado = seriesDeValorLiquido([cdb, lci], 10000, INI, somarMeses(INI, 60), CEN, { tipo: 'PADRAO' });
      const valor = graficos[0]?.config.data.datasets ?? [];
      expect(valor).toHaveLength(2);
      esperado.forEach((s, i) => {
        expect(valor[i]?.data).toEqual(s.pontos.map((p) => ({ x: paraDia(p.data), y: p.liquido })));
      });
      // O da diferença começa com A − B.
      expect(graficos[1]?.config.data.datasets[0]?.label).toBe('A − B');
      expect(within(detalhesGraficos() as HTMLElement).getByLabelText('Comparar').id).toMatch(/^comparador-/);
    });

    it('editar invalida: os alertas e os gráficos somem, e os gráficos são destruídos', () => {
      montar({ catalogo: [...CATALOGO, quase], selecao: ['x', 'w'] });
      compararDireto();
      expect(secaoAlertas()).toBeInTheDocument();
      expect(graficos).toHaveLength(2);
      fireEvent.input(screen.getByLabelText('Valor (R$)'), { target: { value: '5000' } });
      expect(secaoAlertas()).toBeNull();
      expect(detalhesGraficos()).toBeNull();
      for (const g of graficos) expect(g.destroy).toHaveBeenCalledTimes(1);
    });

    it('tirar uma coluna com o resultado aberto refaz os gráficos com as ofertas que ficaram', () => {
      montar({ selecao: ['x', 'y', 'z'] });
      compararDireto();
      expect(graficos[0]?.config.data.datasets).toHaveLength(3);
      fireEvent.click(screen.getByRole('button', { name: 'Tirar da comparação: LCI 80% do CDI (Banco Y)' }));
      const vivos = graficos.filter((g) => g.destroy.mock.calls.length === 0);
      expect(vivos).toHaveLength(2);
      expect(vivos[0]?.config.data.datasets).toHaveLength(2);
    });
  });

  describe('validação das entradas', () => {
    it.each([
      ['Valor (R$)', '', 'Preencha o valor da aplicação.'],
      ['Valor (R$)', '0', 'Preencha o valor da aplicação.'],
      ['Data da aplicação', '', 'Informe a data da aplicação.'],
      ['Sua data (opcional)', '2026-01-01', 'A sua data precisa ser depois da data da aplicação.'],
    ])('%s = "%s" gera alerta humano', (rotulo, valor, mensagem) => {
      montar({ selecao: ['x', 'y'] });
      fireEvent.input(screen.getByLabelText(rotulo), { target: { value: valor } });
      comparar();
      expect(screen.getByRole('alert')).toHaveTextContent(mensagem);
      expect(screen.queryByRole('heading', { name: /Qual lidera/ })).toBeNull();
      expect(valores()).toBeNull();
    });

    it.each([
      ['Data da aplicação', 'A data da aplicação é inválida.'],
      ['Sua data (opcional)', 'A sua data é inválida.'],
    ])('%s com ano de 5 dígitos gera alerta humano', (rotulo, mensagem) => {
      montar({ selecao: ['x', 'y'] });
      fireEvent.input(screen.getByLabelText(rotulo), { target: { value: '20277-01-01' } });
      comparar();
      expect(screen.getByRole('alert')).toHaveTextContent(mensagem);
      expect(screen.queryByRole('heading', { name: /Qual lidera/ })).toBeNull();
    });

    it('com a data da aplicação inválida, a tabela de características não quebra', () => {
      montar({ selecao: ['x', 'y'] });
      fireEvent.input(screen.getByLabelText('Data da aplicação'), { target: { value: '20277-01-01' } });
      expect(colunas()).toHaveLength(2);
    });

    it('os campos de data da comparação limitam o ano a 4 dígitos', () => {
      montar({ selecao: ['x', 'y'] });
      for (const rotulo of ['Data da aplicação', 'Sua data (opcional)']) {
        expect(screen.getByLabelText(rotulo)).toHaveAttribute('max', '9999-12-31');
        expect(screen.getByLabelText(rotulo)).toHaveAttribute('min', '1990-01-01');
      }
    });

    it('avisa, sem bloquear, quando a aplicação ou a sua data não caem em dia útil', () => {
      montar({ selecao: ['x', 'y'] });
      const sabado = '2026-10-03';
      const domingo = '2028-10-01';
      expect(ehDiaUtil(sabado)).toBe(false);
      expect(ehDiaUtil(domingo)).toBe(false);
      fireEvent.input(screen.getByLabelText('Data da aplicação'), { target: { value: sabado } });
      fireEvent.input(screen.getByLabelText('Sua data (opcional)'), { target: { value: domingo } });
      expect(screen.getByLabelText('Data da aplicação')).toHaveAccessibleDescription('Não é dia útil: na prática a aplicação acontece no próximo dia útil.');
      expect(screen.getByText('Não é dia útil: na prática o resgate acontece no próximo dia útil.')).toBeInTheDocument();
      comparar();
      expect(screen.queryByRole('alert')).toBeNull();
      fireEvent.input(screen.getByLabelText('Data da aplicação'), { target: { value: INI } });
      expect(screen.queryByText(/Não é dia útil: na prática a aplicação/)).toBeNull();
    });
  });

  it('os ids têm o prefixo do comparador', () => {
    montar({ selecao: ['x', 'y'] });
    for (const rotulo of ['Valor (R$)', 'Data da aplicação', 'Sua data (opcional)', 'Reinvestimento']) {
      expect(screen.getByLabelText(rotulo).id).toMatch(/^comparador-/);
    }
    compararDireto();
    expect(screen.getByLabelText('Calcular equivalências para').id).toMatch(/^comparador-/);
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it('o cenário recebido entra no cálculo', () => {
    const baixo = cenarioConstante({ cdiAA: 0.05, selicMetaAA: 0.051, ipcaAA: 0.04, trAM: 0 });
    montar({ selecao: ['z', 'x'], cenario: baixo });
    compararDireto();
    // 10 mil a 110% de um CDI de 5% por 2 anos, depois do IR, fica abaixo de R$ 11 mil (no cenário padrão passa de R$ 12 mil).
    expect(celula(/^2 anos/, 0)).toHaveTextContent(/^R\$\s10\./);
  });

  it('mostra o cenário usado', () => {
    render(<Tela />);
    expect(screen.getByText('Cenário: Cenário de teste.')).toBeInTheDocument();
  });
});

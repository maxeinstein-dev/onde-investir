// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it } from 'vitest';
import { adicionar } from '../../src/armazenamento/comparacao';
import { LIMITE_OFERTAS } from '../../src/armazenamento/ofertas';
import type { OfertaCadastrada } from '../../src/engine/ofertas';
import { AdicionarOferta } from '../../src/ui/comparacao/AdicionarOferta';
import { idColuna, TabelaComparacao } from '../../src/ui/comparacao/TabelaComparacao';
import { INI } from '../engine/cenarioPadrao';

afterEach(cleanup);

const oferta = (id: string, emissor: string, pct: number): OfertaCadastrada => ({
  id, emissor, conglomerado: 'G', liquidez: 'DIARIA', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: pct },
});
const x = oferta('x', 'Banco X', 1.03);
const y = oferta('y', 'Banco Y', 1.1);
const CINCO = [1, 2, 3, 4, 5].map((n) => oferta(`o${n}`, `Banco ${n}`, 1 + n / 100));

let ultimoCatalogo: OfertaCadastrada[] = [];
/** O catálogo e a seleção em estado, com a tabela (só características) para receber o foco. */
function Tela({ catalogo: inicial = [x, y], selecao: selInicial = [] }: { catalogo?: OfertaCadastrada[]; selecao?: string[] }) {
  const [catalogo, setCatalogo] = useState(inicial);
  const [selecao, setSelecao] = useState(selInicial);
  ultimoCatalogo = catalogo;
  const ofertas = selecao.flatMap((id) => catalogo.filter((o) => o.id === id));
  return (
    <>
      <AdicionarOferta catalogo={catalogo} selecao={selecao} gerarId={() => 'nova-1'}
        onAdicionar={(id) => setSelecao(adicionar(selecao, id).ids)}
        onCriar={(o) => { setCatalogo([...catalogo, o]); setSelecao(adicionar(selecao, o.id).ids); }} />
      {ofertas.length > 0 && <TabelaComparacao ofertas={ofertas} colunas={[]} dataAplicacao={INI} onRemover={() => {}} />}
    </>
  );
}

const botao = () => screen.getByRole('button', { name: /^\+ Adicionar oferta/ });
const painel = () => document.getElementById(botao().getAttribute('aria-controls') ?? '') as HTMLElement;
const colunas = () => screen.queryAllByRole('columnheader').filter((c) => c.getAttribute('scope') === 'col');

describe('AdicionarOferta', () => {
  it('o botão mostra a contagem e controla o painel, que abre e fecha', () => {
    render(<Tela selecao={['x']} />);
    expect(botao()).toHaveTextContent('+ Adicionar oferta (1 de 5)');
    expect(botao()).toHaveAttribute('aria-expanded', 'false');
    expect(painel()).not.toBeVisible();
    fireEvent.click(botao());
    expect(botao()).toHaveAttribute('aria-expanded', 'true');
    expect(painel()).toBeVisible();
    expect(within(painel()).getByRole('heading', { name: 'Do catálogo' })).toBeInTheDocument();
    expect(within(painel()).getByRole('heading', { name: 'Criar uma nova' })).toBeInTheDocument();
    fireEvent.click(botao());
    expect(painel()).not.toBeVisible();
  });

  it('lista só as ofertas do catálogo que ainda não estão na comparação', () => {
    render(<Tela selecao={['x']} />);
    fireEvent.click(botao());
    expect(within(painel()).queryByRole('button', { name: 'Adicionar CDB 103% do CDI (Banco X)' })).toBeNull();
    expect(within(painel()).getByRole('button', { name: 'Adicionar CDB 110% do CDI (Banco Y)' })).toBeInTheDocument();
  });

  it('adicionar do catálogo: entra como coluna nova, o painel fecha e o foco vai para o cabeçalho dela', () => {
    render(<Tela selecao={['x']} />);
    fireEvent.click(botao());
    fireEvent.click(within(painel()).getByRole('button', { name: 'Adicionar CDB 110% do CDI (Banco Y)' }));
    expect(colunas()).toHaveLength(2);
    expect(colunas()[1]).toHaveTextContent('CDB 110% do CDI (Banco Y)');
    expect(botao()).toHaveAttribute('aria-expanded', 'false');
    expect(painel()).not.toBeVisible();
    expect(document.getElementById(idColuna(1))).toHaveFocus();
    expect(botao()).toHaveTextContent('(2 de 5)');
  });

  it('catálogo vazio: explica e oferece criar', () => {
    render(<Tela catalogo={[]} />);
    fireEvent.click(botao());
    expect(within(painel()).getByText('O catálogo ainda está vazio. Crie uma oferta aqui embaixo.')).toBeInTheDocument();
  });

  it('todas as ofertas do catálogo já na comparação: explica', () => {
    render(<Tela selecao={['x', 'y']} />);
    fireEvent.click(botao());
    expect(within(painel()).getByText('Todas as ofertas do catálogo já estão na comparação.')).toBeInTheDocument();
  });

  it('criar uma nova: grava no catálogo, entra na comparação e o foco vai para a coluna', () => {
    render(<Tela selecao={['x']} />);
    fireEvent.click(botao());
    const p = painel();
    // Ids com prefixo próprio: o formulário do catálogo fica montado ao mesmo tempo, na outra aba.
    expect(within(p).getByLabelText('Emissor').id).toMatch(/^comparador-nova-/);
    expect(within(p).getByLabelText('Produto').id).toMatch(/^comparador-nova-/);
    fireEvent.input(within(p).getByLabelText('Emissor'), { target: { value: 'Banco Novo' } });
    fireEvent.input(within(p).getByLabelText('Conglomerado'), { target: { value: 'Grupo Novo' } });
    fireEvent.input(within(p).getByLabelText('Taxa (%)'), { target: { value: '105' } });
    fireEvent.click(within(p).getByRole('button', { name: 'Salvar no catálogo e comparar' }));
    expect(ultimoCatalogo.map((o) => o.id)).toEqual(['x', 'y', 'nova-1']);
    expect(ultimoCatalogo[2]).toMatchObject({ emissor: 'Banco Novo', conglomerado: 'Grupo Novo', indexacao: { percentualCDI: 1.05 } });
    expect(colunas()).toHaveLength(2);
    expect(colunas()[1]).toHaveTextContent('CDB 105% do CDI (Banco Novo)');
    expect(painel()).not.toBeVisible();
    expect(document.getElementById(idColuna(1))).toHaveFocus();
  });

  it('erro na criação fica no painel e não adiciona nada', () => {
    render(<Tela />);
    fireEvent.click(botao());
    fireEvent.click(within(painel()).getByRole('button', { name: 'Salvar no catálogo e comparar' }));
    expect(within(painel()).getByRole('alert')).toHaveTextContent('Preencha o emissor (até 80 caracteres).');
    expect(painel()).toBeVisible();
    expect(ultimoCatalogo).toHaveLength(2);
  });

  it('com 5 ofertas o botão fica desabilitado e diz o limite', () => {
    render(<Tela catalogo={CINCO} selecao={CINCO.map((o) => o.id)} />);
    expect(botao()).toBeDisabled();
    expect(botao()).toHaveTextContent('(5 de 5)');
    expect(botao()).toHaveAccessibleDescription('Limite de 5 ofertas');
  });

  it(`com o catálogo no limite de ${LIMITE_OFERTAS}, não dá para criar, mas dá para escolher`, () => {
    const cheio = Array.from({ length: LIMITE_OFERTAS }, (_, i) => oferta(`c${i}`, `Banco ${i}`, 1));
    render(<Tela catalogo={cheio} />);
    fireEvent.click(botao());
    expect(within(painel()).queryByLabelText('Emissor')).toBeNull();
    expect(within(painel()).getByText(/O catálogo chegou ao limite de 30 ofertas/)).toBeInTheDocument();
    expect(within(painel()).getAllByRole('button', { name: /^Adicionar / })).toHaveLength(LIMITE_OFERTAS);
  });

  it('Esc fecha o painel e devolve o foco ao botão', () => {
    render(<Tela />);
    fireEvent.click(botao());
    const escolher = within(painel()).getByRole('button', { name: 'Adicionar CDB 103% do CDI (Banco X)' });
    escolher.focus();
    fireEvent.keyDown(escolher, { key: 'Escape' });
    expect(painel()).not.toBeVisible();
    expect(botao()).toHaveAttribute('aria-expanded', 'false');
    expect(botao()).toHaveFocus();
  });

  it('em destaque, o botão usa o estilo principal', () => {
    render(<AdicionarOferta catalogo={[]} selecao={[]} destaque onAdicionar={() => {}} onCriar={() => {}} />);
    expect(botao()).toHaveClass('primario');
  });
});

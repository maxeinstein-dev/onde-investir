// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { marcarConcluida, PROGRESSO_VAZIO, type Progresso } from '../../src/armazenamento/progresso';
import { CASOS_CLASSICOS } from '../../src/conteudo/casos';
import { GLOSSARIO } from '../../src/conteudo/glossario';
import { LICOES } from '../../src/conteudo/licoes';
import type { CasoClassico, IdLicao, Licao } from '../../src/conteudo/licoes/tipos';
import { Aprender } from '../../src/ui/aprender/Aprender';

afterEach(cleanup);

interface PropsTela {
  progresso?: Progresso;
  licao?: IdLicao | null;
  onExperimente?: (l: Licao) => void;
  onCaso?: (c: CasoClassico) => void;
}
/** A trilha com a lição aberta e o progresso em estado, como o App faz. */
function Tela({ progresso: inicial = PROGRESSO_VAZIO, licao: licaoInicial = null, onExperimente = vi.fn(), onCaso = vi.fn() }: PropsTela) {
  const [progresso, setProgresso] = useState(inicial);
  const [licao, setLicao] = useState<IdLicao | null>(licaoInicial);
  return (
    <Aprender licao={licao} onAbrir={setLicao} progresso={progresso}
      onConcluir={(id, c) => setProgresso(marcarConcluida(progresso, id, c))} onExperimente={onExperimente} onCaso={onCaso} />
  );
}

const primeira = LICOES[0] as Licao;
const segunda = LICOES[1] as Licao;
const ultima = LICOES.at(-1) as Licao;
const indice = () => screen.getByRole('list', { name: 'Lições' });
const itens = () => within(indice()).getAllByRole('listitem');
const abrirLicao = (l: Licao) => fireEvent.click(within(indice()).getByRole('link', { name: new RegExp(`^${l.ordem}\\. ${l.titulo}`) }));

/** O conteúdo das lições vem por import dinâmico (useConteudoAprender): espera o índice (ou a lição) chegar. */
function montar(props: PropsTela = {}) {
  const utils = render(<Tela {...props} />);
  return utils;
}
const esperaIndice = () => screen.findByRole('list', { name: 'Lições' });
const esperaLicao = (l: Licao) => screen.findByRole('heading', { level: 2, name: l.titulo });

describe('Aprender: carregamento', () => {
  it('mostra "Carregando…" enquanto o chunk das lições não chega, e o índice depois', async () => {
    montar();
    expect(screen.getByText('Carregando conteúdo…')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Lições' })).toBeNull();
    await esperaIndice();
    expect(itens()).toHaveLength(10);
  });
});

describe('Aprender: índice', () => {
  it('as 10 lições em ordem, com título, resumo e tempo de leitura', async () => {
    montar();
    await esperaIndice();
    expect(screen.getByRole('heading', { level: 2, name: 'Aprender' })).toBeInTheDocument();
    expect(itens()).toHaveLength(10);
    LICOES.forEach((l, i) => {
      const item = itens()[i] as HTMLElement;
      expect(item).toHaveTextContent(l.titulo);
      expect(item).toHaveTextContent(l.resumo);
      expect(item).toHaveTextContent(`${l.tempoLeituraMin} min de leitura`);
    });
  });
  it('marca as concluídas com ✓ e mostra a barra "N de 10 lições"', async () => {
    const progresso = { ...PROGRESSO_VAZIO, concluidas: [segunda.id, ultima.id] };
    montar({ progresso });
    await esperaIndice();
    const barra = screen.getByRole('progressbar', { name: '2 de 10 lições' });
    expect(barra).toHaveAttribute('value', '2');
    expect(barra).toHaveAttribute('max', '10');
    expect(itens()[1]).toHaveTextContent('✓');
    expect(within(itens()[1] as HTMLElement).getByText('concluída', { exact: false })).toBeInTheDocument();
    expect(itens()[0]).not.toHaveTextContent('✓');
  });
  it('destaca só a primeira lição não concluída como a próxima a estudar, com texto para leitor', async () => {
    montar({ progresso: { ...PROGRESSO_VAZIO, concluidas: [primeira.id] } });
    await esperaIndice();
    expect(within(itens()[1] as HTMLElement).getByText('próxima a estudar', { exact: false })).toBeInTheDocument();
    expect(within(itens()[0] as HTMLElement).queryByText('próxima a estudar', { exact: false })).toBeNull();
    expect(within(itens()[2] as HTMLElement).queryByText('próxima a estudar', { exact: false })).toBeNull();
  });
  it('sem palpites, não mostra a taxa de acerto; com palpites, "Você acertou X de Y palpites"', async () => {
    montar();
    await esperaIndice();
    expect(screen.queryByText(/Você acertou/)).toBeNull();
    cleanup();
    montar({ progresso: { ...PROGRESSO_VAZIO, palpites: { acertos: 2, total: 3 } } });
    await esperaIndice();
    expect(screen.getByText('Você acertou 2 de 3 palpites.')).toBeInTheDocument();
    cleanup();
    montar({ progresso: { ...PROGRESSO_VAZIO, palpites: { acertos: 0, total: 1 } } });
    await esperaIndice();
    expect(screen.getByText('Você acertou 0 de 1 palpite.')).toBeInTheDocument();
  });
  it('os 4 casos clássicos, cada um com a pergunta, a explicação e o "Experimente"', async () => {
    const onCaso = vi.fn();
    montar({ onCaso });
    await esperaIndice();
    const secao = screen.getByRole('heading', { name: 'Casos clássicos' }).closest('section') as HTMLElement;
    const casos = within(within(secao).getByRole('list')).getAllByRole('listitem');
    expect(casos).toHaveLength(4);
    CASOS_CLASSICOS.forEach((c, i) => {
      expect(casos[i]).toHaveTextContent(c.titulo);
      expect(casos[i]).toHaveTextContent(c.pergunta);
    });
    const caso = CASOS_CLASSICOS[2] as CasoClassico;
    fireEvent.click(within(secao).getByRole('button', { name: `Experimente: ${caso.titulo}` }));
    expect(onCaso).toHaveBeenCalledWith(caso);
  });
  it('o rodapé avisa que o conteúdo é educativo', async () => {
    montar();
    await esperaIndice();
    expect(screen.getByText(/Conteúdo educativo/)).toBeInTheDocument();
  });
});

describe('Aprender: lição', () => {
  it('abre a lição com o foco no título, as seções, os termos e as fontes', async () => {
    montar();
    await esperaIndice();
    abrirLicao(primeira);
    const titulo = await esperaLicao(primeira);
    await waitFor(() => expect(document.activeElement).toBe(titulo));
    expect(screen.queryByRole('list', { name: 'Lições' })).toBeNull();
    for (const s of primeira.secoes) expect(screen.getByRole('heading', { level: 3, name: s.titulo })).toBeInTheDocument();
    const termos = screen.getByRole('heading', { name: 'Termos desta lição' }).closest('section') as HTMLElement;
    for (const t of primeira.termos) expect(within(termos).getByRole('button', { name: GLOSSARIO[t].termo })).toBeInTheDocument();
    const fontes = screen.getByRole('heading', { name: 'Fontes' }).closest('section') as HTMLElement;
    const hrefs = within(fontes).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([...primeira.fontes]);
    for (const a of within(fontes).getAllByRole('link')) expect(a).toHaveAttribute('rel', 'noopener noreferrer');
  });
  it('"Experimente" entrega a lição para quem abre a comparação', async () => {
    const onExperimente = vi.fn();
    montar({ onExperimente });
    await esperaIndice();
    abrirLicao(primeira);
    await esperaLicao(primeira);
    fireEvent.click(screen.getByRole('button', { name: /^Experimente/ }));
    expect(onExperimente).toHaveBeenCalledWith(primeira);
  });
  it('as lições conceituais não têm "Experimente"', async () => {
    for (const l of LICOES.filter((x) => x.experimente === undefined)) {
      montar({ licao: l.id });
      await esperaLicao(l);
      expect(screen.queryByRole('button', { name: /^Experimente/ })).toBeNull();
      cleanup();
    }
  });
  it('marcar como concluída e desmarcar, com o anúncio e o ✓ no índice', async () => {
    montar();
    await esperaIndice();
    abrirLicao(primeira);
    await esperaLicao(primeira);
    const status = screen.getByRole('status');
    const marcar = screen.getByRole('button', { name: 'Marcar como concluída' });
    fireEvent.click(marcar);
    expect(status).toHaveTextContent('Lição marcada como concluída.');
    // O mesmo botão, com o texto trocado: quem estava nele não perde o foco.
    expect(screen.getByRole('button', { name: 'Desmarcar como concluída' })).toBe(marcar);
    fireEvent.click(screen.getByRole('link', { name: 'Voltar ao índice' }));
    await esperaIndice();
    expect(screen.getByRole('progressbar', { name: '1 de 10 lições' })).toBeInTheDocument();
    expect(itens()[0]).toHaveTextContent('✓');
    abrirLicao(primeira);
    await esperaLicao(primeira);
    fireEvent.click(screen.getByRole('button', { name: 'Desmarcar como concluída' }));
    expect(screen.getByRole('status')).toHaveTextContent('Lição desmarcada.');
    expect(screen.getByRole('button', { name: 'Marcar como concluída' })).toBeInTheDocument();
  });
  it('"Próxima lição" abre a seguinte com o foco no título; a última não tem', async () => {
    montar();
    await esperaIndice();
    abrirLicao(primeira);
    await esperaLicao(primeira);
    fireEvent.click(screen.getByRole('link', { name: `Próxima lição: ${segunda.titulo}` }));
    const titulo = await esperaLicao(segunda);
    await waitFor(() => expect(document.activeElement).toBe(titulo));
    cleanup();
    montar({ licao: ultima.id });
    await esperaLicao(ultima);
    expect(screen.queryByRole('link', { name: /^Próxima lição/ })).toBeNull();
  });
  it('"Voltar ao índice" devolve o foco ao link da lição', async () => {
    montar();
    await esperaIndice();
    abrirLicao(segunda);
    await esperaLicao(segunda);
    fireEvent.click(screen.getByRole('link', { name: 'Voltar ao índice' }));
    await esperaIndice();
    await waitFor(() => expect(document.activeElement).toBe(within(indice()).getByRole('link', { name: new RegExp(`^2\\. ${segunda.titulo}`) })));
  });
  it('os links têm o hash da lição (abrir em outra aba funciona)', async () => {
    montar();
    await esperaIndice();
    expect(within(indice()).getByRole('link', { name: new RegExp(`^1\\. ${primeira.titulo}`) })).toHaveAttribute('href', `#aprender/${primeira.id}`);
    abrirLicao(primeira);
    await esperaLicao(primeira);
    expect(screen.getByRole('link', { name: 'Voltar ao índice' })).toHaveAttribute('href', '#aprender');
  });
});

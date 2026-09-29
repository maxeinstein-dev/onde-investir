// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, fireEvent, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ObjetivoSalvo } from '../../../src/armazenamento/objetivos';
import { CEN } from '../../engine/cenarioPadrao';
import type { ItemFGC } from '../../../src/engine/fgc';
import type { OfertaCadastrada } from '../../../src/engine/ofertas';
import { Sugestao } from '../../../src/ui/objetivos/Sugestao';
import { graficos } from '../graficos/mockChartPizza';

vi.mock('chart.js', () => import('../graficos/mockChartPizza'));

afterEach(() => {
  cleanup();
  graficos.length = 0;
});

const HOJE = '2026-09-29';

const objetivoReserva: ObjetivoSalvo = {
  id: 'o1', nome: 'Minha reserva', criadoEm: HOJE, entradas: { tipo: 'RESERVA', gastoMensal: 2000, rendaEstavel: true },
};

const cdbDiario: OfertaCadastrada = {
  id: 'c1', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 }, emissor: 'Banco X', conglomerado: 'Banco X', liquidez: 'DIARIA',
};

const carregou = () => waitFor(() => expect(graficos.length).toBeGreaterThanOrEqual(1));

describe('Sugestao', () => {
  it('mostra o aviso educativo, o gráfico e as fatias com percentual e valor', async () => {
    render(<Sugestao objetivo={objetivoReserva} catalogo={[]} carteira={[]} hoje={HOJE} cenario={CEN} onIrParaComparar={() => {}} />);
    await carregou();
    expect(screen.getByText(/Conteúdo educativo/)).toBeInTheDocument();
    expect(screen.getAllByText(/R\$\s?6\.000,00/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Ver lição/ }).length).toBe(2);
  });

  it('o valor por fatia é um Destaque menor dentro do cartão da fatia (li filho direto da lista)', async () => {
    render(<Sugestao objetivo={objetivoReserva} catalogo={[]} carteira={[]} hoje={HOJE} cenario={CEN} onIrParaComparar={() => {}} />);
    await carregou();
    const lista = screen.getByRole('list', { name: 'Fatias sugeridas' });
    expect(lista.children).toHaveLength(2);
    const grupo = within(lista).getAllByRole('group', { name: /Aportar/i })[0] as HTMLElement;
    expect(grupo.closest('li')?.parentElement).toBe(lista);
    expect(grupo.parentElement?.className).toContain('obj-fatia-valor');
  });

  it('mostra "Já disponível" e o botão Comparar quando há oferta casada', async () => {
    const onIrParaComparar = vi.fn();
    render(<Sugestao objetivo={objetivoReserva} catalogo={[cdbDiario]} carteira={[]} hoje={HOJE} cenario={CEN} onIrParaComparar={onIrParaComparar} />);
    await carregou();
    expect(screen.getByText(/Já disponível/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    expect(onIrParaComparar).toHaveBeenCalledWith(cdbDiario);
  });

  it('mostra o aviso de FGC quando a carteira empurra a soma acima do limite', async () => {
    const carteira: ItemFGC[] = [{ conglomerado: 'Banco X', produto: 'CDB', brutoEm: () => 245000 }];
    render(<Sugestao objetivo={objetivoReserva} catalogo={[cdbDiario]} carteira={carteira} hoje={HOJE} cenario={CEN} onIrParaComparar={() => {}} />);
    await carregou();
    expect(screen.getByText(/passa do limite do FGC/)).toBeInTheDocument();
  });

  it('não recria o gráfico quando o componente pai rerenderiza sem mudar objetivo/catálogo/carteira/hoje', async () => {
    const catalogo = [cdbDiario];
    const carteira: ItemFGC[] = [];
    const { rerender } = render(
      <Sugestao objetivo={objetivoReserva} catalogo={catalogo} carteira={carteira} hoje={HOJE} cenario={CEN} onIrParaComparar={() => {}} />,
    );
    await carregou();
    expect(graficos).toHaveLength(1);
    const primeiro = graficos[0];

    // Rerenderização "não relacionada": mesmas referências de objetivo/catálogo/carteira/hoje, só
    // `onIrParaComparar` muda (como aconteceria se algo em App.tsx desse setState sem afetar a sugestão).
    rerender(
      <Sugestao objetivo={objetivoReserva} catalogo={catalogo} carteira={carteira} hoje={HOJE} cenario={CEN} onIrParaComparar={() => {}} />,
    );

    expect(primeiro?.destroy).not.toHaveBeenCalled();
    expect(graficos).toHaveLength(1);
  });

  it('mostra a nota de renda variável para longo prazo acima de 5 anos, com link para a lição', async () => {
    const objetivo: ObjetivoSalvo = { id: 'o3', criadoEm: HOJE, entradas: { tipo: 'LONGO_PRAZO', horizonteAnos: 10 } };
    render(<Sugestao objetivo={objetivo} catalogo={[]} carteira={[]} hoje={HOJE} cenario={CEN} onIrParaComparar={() => {}} />);
    await carregou();
    expect(await screen.findByText(/Para prazos acima de 5 anos/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /renda variável/i })).toHaveAttribute('href', '#aprender/renda-variavel');
  });

  it('não mostra a nota para reserva de emergência', async () => {
    render(<Sugestao objetivo={objetivoReserva} catalogo={[]} carteira={[]} hoje={HOJE} cenario={CEN} onIrParaComparar={() => {}} />);
    await carregou();
    expect(screen.queryByText(/renda variável/i)).not.toBeInTheDocument();
  });
});

describe('Sugestao — RENDA_MENSAL', () => {
  const objetivoRendaMensal: ObjetivoSalvo = {
    id: 'orm1', nome: 'Renda extra', criadoEm: HOJE,
    entradas: { tipo: 'RENDA_MENSAL', principal: 100000, rendaMensalDesejada: 1000 },
  };

  const lciSuficiente: OfertaCadastrada = {
    id: 'lci1', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.95 },
    emissor: 'Banco Y', conglomerado: 'Banco Y', liquidez: 'DIARIA',
  };

  const cdbInsuficiente: OfertaCadastrada = {
    id: 'cdb1', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.5 },
    emissor: 'Banco Z', conglomerado: 'Banco Z', liquidez: 'DIARIA',
  };

  it('catálogo com oferta isenta suficiente: 1 fatia, os dois %CDI necessários e a nota da carência da LCI', async () => {
    render(
      <Sugestao objetivo={objetivoRendaMensal} catalogo={[lciSuficiente]} carteira={[]} hoje={HOJE} cenario={CEN}
        onIrParaComparar={() => {}} />,
    );
    await carregou();
    expect(screen.getAllByText(/LCI/).length).toBeGreaterThan(0);
    expect(screen.getByText(/CDB\/RDB/)).toBeInTheDocument();
    expect(screen.getAllByText(/LCI\/LCA/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/%/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/carência/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/6 meses/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Falta/)).not.toBeInTheDocument();
  });

  it('mostra o %CDI necessário em destaque (grupo nomeado) mantendo os dois valores', async () => {
    render(
      <Sugestao objetivo={objetivoRendaMensal} catalogo={[lciSuficiente]} carteira={[]} hoje={HOJE} cenario={CEN}
        onIrParaComparar={() => {}} />,
    );
    await carregou();
    const grupo = screen.getByRole('group', { name: /CDI necessário/i });
    expect(grupo.className).toContain('destaque');
    expect(grupo.textContent).toMatch(/%/);
    expect(grupo.closest('.cartao--taxa-necessaria')).not.toBeNull();
    expect(screen.getByText(/LCI\/LCA \(isento\)/)).toBeInTheDocument();
  });

  it('catálogo insuficiente: mostra a fatia possível, o aviso com o quanto falta e o link para renda variável', async () => {
    render(
      <Sugestao objetivo={objetivoRendaMensal} catalogo={[cdbInsuficiente]} carteira={[]} hoje={HOJE} cenario={CEN}
        onIrParaComparar={() => {}} />,
    );
    await carregou();
    expect(screen.getAllByText(/CDB/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Falta/)).toBeInTheDocument();
    expect(screen.getAllByText(/R\$/).length).toBeGreaterThan(0);
    const linksLicao = screen.getAllByRole('link', { name: /renda variável/i });
    expect(linksLicao.length).toBeGreaterThan(0);
    expect(linksLicao[0]).toHaveAttribute('href', '#aprender/renda-variavel');
  });
});

describe('Sugestao — CARTEIRA_COMBINADA', () => {
  const objetivoCarteiraCombinada: ObjetivoSalvo = {
    id: 'o4', nome: 'Minha carteira', criadoEm: HOJE,
    entradas: { tipo: 'CARTEIRA_COMBINADA', principal: 100000, gastoMensal: 3000, rendaEstavel: true, horizonteAnos: 20 },
  };

  it('renderiza as 4 fatias sem nenhum bloco especial (não precisa de Cenario nem de modo)', async () => {
    render(
      <Sugestao objetivo={objetivoCarteiraCombinada} catalogo={[]} carteira={[]} hoje={HOJE} cenario={CEN}
        onIrParaComparar={() => {}} />,
    );
    await carregou();
    expect(screen.getByRole('list', { name: 'Fatias sugeridas' }).children.length).toBe(4);
  });
});

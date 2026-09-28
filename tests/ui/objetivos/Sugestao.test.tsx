// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ObjetivoSalvo } from '../../../src/armazenamento/objetivos';
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
    render(<Sugestao objetivo={objetivoReserva} catalogo={[]} carteira={[]} hoje={HOJE} onIrParaComparar={() => {}} />);
    await carregou();
    expect(screen.getByText(/Conteúdo educativo/)).toBeInTheDocument();
    expect(screen.getAllByText(/R\$\s?6\.000,00/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Ver lição/ }).length).toBe(2);
  });

  it('mostra "Já disponível" e o botão Comparar quando há oferta casada', async () => {
    const onIrParaComparar = vi.fn();
    render(<Sugestao objetivo={objetivoReserva} catalogo={[cdbDiario]} carteira={[]} hoje={HOJE} onIrParaComparar={onIrParaComparar} />);
    await carregou();
    expect(screen.getByText(/Já disponível/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    expect(onIrParaComparar).toHaveBeenCalledWith(cdbDiario);
  });

  it('mostra o aviso de FGC quando a carteira empurra a soma acima do limite', async () => {
    const carteira: ItemFGC[] = [{ conglomerado: 'Banco X', produto: 'CDB', brutoEm: () => 245000 }];
    render(<Sugestao objetivo={objetivoReserva} catalogo={[cdbDiario]} carteira={carteira} hoje={HOJE} onIrParaComparar={() => {}} />);
    await carregou();
    expect(screen.getByText(/passa do limite do FGC/)).toBeInTheDocument();
  });

  it('não recria o gráfico quando o componente pai rerenderiza sem mudar objetivo/catálogo/carteira/hoje', async () => {
    const catalogo = [cdbDiario];
    const carteira: ItemFGC[] = [];
    const { rerender } = render(
      <Sugestao objetivo={objetivoReserva} catalogo={catalogo} carteira={carteira} hoje={HOJE} onIrParaComparar={() => {}} />,
    );
    await carregou();
    expect(graficos).toHaveLength(1);
    const primeiro = graficos[0];

    // Rerenderização "não relacionada": mesmas referências de objetivo/catálogo/carteira/hoje, só
    // `onIrParaComparar` muda (como aconteceria se algo em App.tsx desse setState sem afetar a sugestão).
    rerender(
      <Sugestao objetivo={objetivoReserva} catalogo={catalogo} carteira={carteira} hoje={HOJE} onIrParaComparar={() => {}} />,
    );

    expect(primeiro?.destroy).not.toHaveBeenCalled();
    expect(graficos).toHaveLength(1);
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Destaque } from '../../../src/ui/base/Destaque';
import { Detalhes } from '../../../src/ui/base/Detalhes';
import { Selo } from '../../../src/ui/base/Selo';

afterEach(cleanup);

describe('Destaque', () => {
  it('mostra o rótulo, o número grande e a frase que o explica', () => {
    render(<Destaque rotulo="Rentabilidade" valor="28,6%" frase="Acima do CDI no período." />);
    expect(screen.getByText('Rentabilidade')).toBeInTheDocument();
    expect(screen.getByText('28,6%')).toHaveClass('destaque__valor');
    expect(screen.getByText('Acima do CDI no período.')).toBeInTheDocument();
  });
  it('agrupa rótulo e valor para leitor de tela (o número não fica solto)', () => {
    render(<Destaque rotulo="Total líquido" valor="R$ 1.000,00" />);
    expect(screen.getByRole('group', { name: 'Total líquido' })).toHaveTextContent('R$ 1.000,00');
  });
});

describe('Selo', () => {
  it('mostra o texto visual escondido do leitor e o texto real só para o leitor', () => {
    render(<Selo visual="maior" leitor="(maior valor líquido)" />);
    expect(screen.getByText('maior')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('(maior valor líquido)')).toHaveClass('visualmente-oculto');
  });
});

describe('Detalhes', () => {
  it('é um details fechado por padrão, com o resumo como título', () => {
    render(<Detalhes resumo="Por que esse resultado?"><p>Porque sim.</p></Detalhes>);
    expect(screen.getByText('Por que esse resultado?').closest('details')).not.toHaveAttribute('open');
  });
  it('abre por padrão quando pedido', () => {
    render(<Detalhes resumo="Gráficos" aberto><p>x</p></Detalhes>);
    expect(screen.getByText('Gráficos').closest('details')).toHaveAttribute('open');
  });
});

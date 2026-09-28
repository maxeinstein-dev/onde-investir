// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VOCE_SABIA, vocePassaSaber } from '../../src/conteudo/dicas';
import { licaoPorId } from '../../src/conteudo/licoes';
import { VoceSabia } from '../../src/ui/aprender/VoceSabia';

afterEach(cleanup);

const cartao = () => screen.getByRole('complementary', { name: 'Você sabia?' });

describe('"Você sabia?"', () => {
  it('um cartão com o item da visita, a fonte e "Ver lição"', () => {
    const onVerLicao = vi.fn();
    render(<VoceSabia indiceVisita={3} onVerLicao={onVerLicao} />);
    const item = vocePassaSaber(3);
    expect(cartao()).toHaveTextContent(item.texto);
    expect(within(cartao()).getByRole('link', { name: 'Fonte' })).toHaveAttribute('href', item.fonte);
    const link = within(cartao()).getByRole('link', { name: `Ver lição: ${licaoPorId(item.licao)?.titulo ?? ''}` });
    fireEvent.click(link);
    expect(onVerLicao).toHaveBeenCalledWith(item.licao);
  });
  it('muda com a visita, em rodízio', () => {
    const { rerender } = render(<VoceSabia indiceVisita={0} onVerLicao={() => {}} />);
    const primeiro = cartao().textContent;
    rerender(<VoceSabia indiceVisita={1} onVerLicao={() => {}} />);
    expect(cartao().textContent).not.toBe(primeiro);
    rerender(<VoceSabia indiceVisita={VOCE_SABIA.length} onVerLicao={() => {}} />);
    expect(cartao().textContent).toBe(primeiro);
  });
});

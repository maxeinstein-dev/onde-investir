// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Oferta } from '../../src/engine/produtos';
import { FormOferta } from '../../src/ui/FormOferta';

afterEach(cleanup);

function ComEstado({ inicial, aoMudar }: { inicial: Oferta; aoMudar: (o: Oferta) => void }) {
  const [oferta, setOferta] = useState(inicial);
  return <FormOferta id="a" titulo="Opção A" oferta={oferta} onChange={(o) => { setOferta(o); aoMudar(o); }} />;
}

const cdb: Oferta = { produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 } };
const campoTaxa = () => screen.getByLabelText('Taxa (%)') as HTMLInputElement;

describe('FormOferta', () => {
  it.each([['110', 1.1], ['103.5', 1.035]])('taxa digitada %s aparece sem ruído e vira %d', (texto, fracao) => {
    const aoMudar = vi.fn();
    render(<ComEstado inicial={cdb} aoMudar={aoMudar} />);
    fireEvent.input(campoTaxa(), { target: { value: texto } });
    expect(campoTaxa().value).toBe(texto);
    expect(aoMudar).toHaveBeenLastCalledWith({ produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: fracao } });
  });
  it('taxa vazia continua vazia (não volta para 0)', () => {
    render(<ComEstado inicial={cdb} aoMudar={() => {}} />);
    fireEvent.input(campoTaxa(), { target: { value: '' } });
    expect(campoTaxa().value).toBe('');
  });
  it('ressincroniza o texto quando a oferta muda por fora', () => {
    const { rerender } = render(<FormOferta id="a" titulo="Opção A" oferta={cdb} onChange={() => {}} />);
    expect(campoTaxa().value).toBe('103');
    rerender(<FormOferta id="a" titulo="Opção A" oferta={{ produto: 'CDB', indexacao: { tipo: 'PRE', taxaAA: 0.125 } }} onChange={() => {}} />);
    expect(campoTaxa().value).toBe('12.5');
  });
  it('trocar a indexação mostra a taxa padrão da nova indexação', () => {
    render(<ComEstado inicial={cdb} aoMudar={() => {}} />);
    fireEvent.input(campoTaxa(), { target: { value: '110' } });
    fireEvent.change(screen.getByLabelText('Rentabilidade'), { target: { value: 'PRE' } });
    expect(campoTaxa().value).toBe('12');
  });
});

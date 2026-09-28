// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RegraNaoEncontradaError } from '../../src/engine/erros';
import type { ItemFGC } from '../../src/engine/fgc';
import type { OfertaCadastrada } from '../../src/engine/ofertas';
import { Comparador } from '../../src/ui/comparacao/Comparador';
import { CEN, INI } from '../engine/cenarioPadrao';
import { graficos } from './graficos/mockChart';

vi.mock('chart.js', () => import('./graficos/mockChart'));
vi.mock('chartjs-plugin-annotation', () => ({ default: { id: 'annotation' } }));

afterEach(() => {
  cleanup();
  graficos.length = 0;
});
beforeEach(() => localStorage.clear());

const base = { liquidez: 'NO_VENCIMENTO' as const, produto: 'CDB' as const, vencimento: '2028-09-28' };
const x: OfertaCadastrada = { ...base, id: 'x', emissor: 'Banco X', conglomerado: 'Grupo X', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.1 } };
const z: OfertaCadastrada = { ...base, id: 'z', emissor: 'Banco Z', conglomerado: 'Grupo Z', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 } };

function Tela({ carteira }: { carteira: ItemFGC[] }) {
  const [selecao, setSelecao] = useState(['x', 'z']);
  return (
    <Comparador catalogo={[x, z]} selecao={selecao} onMudarSelecao={setSelecao} onCriarOferta={() => {}} cenario={CEN}
      descricaoCenario="Cenário de teste." carteira={carteira} />
  );
}

function alertasDoResultado(carteira: ItemFGC[], valor = '10000') {
  render(<Tela carteira={carteira} />);
  fireEvent.input(screen.getByLabelText('Data da aplicação'), { target: { value: INI } });
  fireEvent.input(screen.getByLabelText('Valor (R$)'), { target: { value: valor } });
  fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
  fireEvent.click(screen.getByRole('button', { name: /pular/i }));
  return within(screen.getByRole('region', { name: 'Alertas' }));
}
const alerta = (a: ReturnType<typeof alertasDoResultado>, titulo: string) =>
  a.getByRole('heading', { level: 4, name: titulo }).closest('li') as HTMLElement;

describe('alertas do FGC no bloco de alertas', () => {
  it('FGC_LIMITE: a carteira abaixo do limite, e a carteira mais a oferta acima, com o termo "fgc"', () => {
    const a = alertasDoResultado([{ conglomerado: 'grupo x', produto: 'CDB', brutoEm: () => 200_000 }], '60000');
    const li = alerta(a, 'Acima do limite do FGC');
    expect(li).toHaveTextContent(/Aplicando o valor da comparação em CDB 110% do CDI \(Banco X\), o total no conglomerado Grupo X passa de R\$ 250 mil/);
    expect(within(li).getByRole('button', { name: /Saiba mais sobre FGC/ })).toBeInTheDocument();
    expect(a.getAllByRole('heading', { level: 4, name: 'Acima do limite do FGC' })).toHaveLength(1);
  });

  it('FGC_LIMITE com a carteira já acima do limite: a variante jaAcima', () => {
    const a = alertasDoResultado([{ conglomerado: 'Grupo X', produto: 'CDB', brutoEm: () => 300_000 }]);
    expect(alerta(a, 'Acima do limite do FGC')).toHaveTextContent(/Você já tem R\$\s300\.000,00 no conglomerado Grupo X, acima dos R\$ 250 mil/);
  });

  it('FGC_NAO_CALCULADO: a posição que não pôde ser calculada, sem derrubar a comparação', () => {
    const quebra: ItemFGC = { conglomerado: 'Grupo X', produto: 'CDB', brutoEm: (d) => { throw new RegraNaoEncontradaError('IR', d); } };
    const a = alertasDoResultado([quebra]);
    expect(alerta(a, 'Conta do FGC incompleta')).toHaveTextContent('Não deu para calcular 1 aplicação da sua carteira no conglomerado Grupo X');
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('mudar a carteira invalida o resultado (derivado na renderização)', () => {
    const item: ItemFGC = { conglomerado: 'Grupo X', produto: 'CDB', brutoEm: () => 300_000 };
    const { rerender } = render(<Tela carteira={[item]} />);
    fireEvent.input(screen.getByLabelText('Data da aplicação'), { target: { value: INI } });
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    fireEvent.click(screen.getByRole('button', { name: /pular/i }));
    expect(screen.getByRole('heading', { name: 'Resultado da comparação' })).toBeInTheDocument();
    rerender(<Tela carteira={[{ ...item }]} />);
    expect(screen.queryByRole('heading', { name: 'Resultado da comparação' })).toBeNull();
  });
});

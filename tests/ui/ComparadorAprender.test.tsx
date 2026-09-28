// @vitest-environment jsdom
// O Comparador na trilha "Aprender" (plano M3c, C1): entradas iniciais da comparação temporária, a pergunta da
// lição no palpite e o registro dos palpites para a taxa de acerto.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OfertaCadastrada } from '../../src/engine/ofertas';
import { Comparador, type PropsComparador } from '../../src/ui/comparacao/Comparador';
import { CEN, INI } from '../engine/cenarioPadrao';
import { graficos } from './graficos/mockChart';

vi.mock('chart.js', () => import('./graficos/mockChart'));
vi.mock('chartjs-plugin-annotation', () => ({ default: { id: 'annotation' } }));

afterEach(() => {
  cleanup();
  graficos.length = 0;
});
beforeEach(() => localStorage.clear());

const base = { conglomerado: 'G', liquidez: 'DIARIA' as const, produto: 'CDB' as const };
const menor: OfertaCadastrada = { ...base, id: 'a', emissor: 'Banco A', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.0 } };
const maior: OfertaCadastrada = { ...base, id: 'b', emissor: 'Banco B', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.1 } };
const gemea: OfertaCadastrada = { ...maior, id: 'c', emissor: 'Banco C' };

function montar(props: Partial<PropsComparador> = {}) {
  const catalogo = props.catalogo ?? [menor, maior];
  return render(
    <Comparador catalogo={catalogo} selecao={catalogo.map((o) => o.id)} onMudarSelecao={() => {}} onCriarOferta={() => {}}
      cenario={CEN} descricaoCenario="Cenário de teste." {...props} />,
  );
}
const comparar = () => fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
const palpite = () => screen.getByRole('heading', { level: 2, name: /\?$/ }).closest('section') as HTMLElement;

describe('Comparador: entradas iniciais', () => {
  it('abre com o valor, as datas e a regra da comparação temporária', () => {
    montar({ inicial: { valor: 5000, dataAplicacao: INI, suaData: '2027-03-28', regra: { tipo: 'TAXA_FIXA', taxaAA: 0.105 } } });
    expect(screen.getByLabelText('Valor (R$)')).toHaveValue(5000);
    expect(screen.getByLabelText('Data da aplicação')).toHaveValue(INI);
    expect(screen.getByLabelText('Sua data (opcional)')).toHaveValue('2027-03-28');
    expect(screen.getByLabelText('Reinvestimento')).toHaveValue('TAXA_FIXA');
    expect(screen.getByLabelText('Taxa do reinvestimento (% a.a.)')).toHaveValue(10.5);
  });
  it('sem sua data, o campo fica vazio', () => {
    montar({ inicial: { valor: 1000, dataAplicacao: INI, regra: { tipo: 'MESMA_TAXA' } } });
    expect(screen.getByLabelText('Sua data (opcional)')).toHaveValue('');
    expect(screen.getByLabelText('Reinvestimento')).toHaveValue('MESMA_TAXA');
  });
});

describe('Comparador: palpite da lição e taxa de acerto', () => {
  it('a pergunta da lição aparece no palpite', () => {
    montar({ inicial: { valor: 1000, dataAplicacao: INI, regra: { tipo: 'PADRAO' } }, pergunta: 'Quem rende mais em 5 anos?' });
    comparar();
    expect(screen.getByRole('heading', { level: 2, name: 'Quem rende mais em 5 anos?' })).toBeInTheDocument();
  });
  it('registra o acerto e o erro de cada palpite respondido', () => {
    const onPalpite = vi.fn();
    montar({ inicial: { valor: 1000, dataAplicacao: INI, regra: { tipo: 'PADRAO' } }, onPalpite });
    comparar();
    fireEvent.click(within(palpite()).getByRole('button', { name: /^B: / }));
    expect(onPalpite).toHaveBeenLastCalledWith(true);
    fireEvent.input(screen.getByLabelText('Valor (R$)'), { target: { value: '2000' } });
    comparar();
    fireEvent.click(within(palpite()).getByRole('button', { name: /^A: / }));
    expect(onPalpite).toHaveBeenLastCalledWith(false);
    expect(onPalpite).toHaveBeenCalledTimes(2);
  });
  it('empate não conta', () => {
    const onPalpite = vi.fn();
    montar({ catalogo: [maior, gemea], inicial: { valor: 1000, dataAplicacao: INI, regra: { tipo: 'PADRAO' } }, onPalpite });
    comparar();
    fireEvent.click(within(palpite()).getByRole('button', { name: /^A: / }));
    expect(screen.getByText('Deu empate, e o seu palpite estava entre os líderes.')).toBeInTheDocument();
    expect(onPalpite).not.toHaveBeenCalled();
  });
  it('pular o palpite não conta', () => {
    const onPalpite = vi.fn();
    montar({ inicial: { valor: 1000, dataAplicacao: INI, regra: { tipo: 'PADRAO' } }, onPalpite });
    comparar();
    fireEvent.click(screen.getByRole('button', { name: /pular/i }));
    expect(onPalpite).not.toHaveBeenCalled();
  });
});

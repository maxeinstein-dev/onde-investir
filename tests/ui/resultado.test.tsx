// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { duelar } from '../../src/engine/comparador';
import { calcularEquivalencias } from '../../src/engine/equivalencia';
import { ResultadoDuelo } from '../../src/ui/ResultadoDuelo';
import { Equivalencias } from '../../src/ui/Equivalencias';
import { CEN, INI } from '../engine/cenarioPadrao';

afterEach(cleanup);
const cdb = { produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 } } as const;
const lci = { produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 } } as const;

describe('ResultadoDuelo', () => {
  it('mostra acerto/erro do palpite, motivos e o passo a passo', () => {
    render(<ResultadoDuelo duelo={duelar(10000, INI, '2028-09-28', cdb, lci, CEN)} palpite="B" />);
    expect(screen.getByText(/Não foi dessa vez/)).toBeInTheDocument();
    expect(screen.getByText(/CDB 103% do CDI termina com/)).toBeInTheDocument();
    expect(screen.getAllByText('Por que esse resultado?')).toHaveLength(2);
    expect(screen.getAllByText(/Imposto de Renda/).length).toBeGreaterThan(0);
  });
});

describe('Equivalencias', () => {
  it('mostra a taxa exata e a regra de bolso', () => {
    const eq = calcularEquivalencias({ ...lci, valor: 10000, dataAplicacao: INI }, '2028-09-28', CEN);
    render(<Equivalencias origem="LCI 80% do CDI" eq={eq} />);
    expect(screen.getByText(/92,57%/)).toBeInTheDocument();
    expect(screen.getByText(/94,12%/)).toBeInTheDocument();
    expect(screen.getByText(/regra de bolso/i).closest('p')).toHaveTextContent(/CDB/);
  });
  it('regra de bolso de origem tributada aponta para LCI/LCA', () => {
    const eq = calcularEquivalencias({ ...cdb, valor: 10000, dataAplicacao: INI }, '2028-09-28', CEN);
    render(<Equivalencias origem="CDB 103% do CDI" eq={eq} />);
    const dica = screen.getByText(/regra de bolso/i).closest('p');
    expect(dica).toHaveTextContent(/LCI\/LCA/);
    expect(dica).toHaveTextContent(/87,55%/);
  });
  it('regra de bolso mostra a diferença em pontos percentuais', () => {
    const eq = calcularEquivalencias({ ...cdb, valor: 10000, dataAplicacao: INI }, '2028-09-28', CEN);
    render(<Equivalencias origem="CDB 103% do CDI" eq={eq} />);
    const dica = screen.getByText(/regra de bolso/i).closest('p');
    expect(dica).toHaveTextContent(/fica 1,62 pontos percentuais abaixo da conta exata/);
  });
  it('o título não contém o Termo: ele fica ao lado, fora do h2', () => {
    const eq = calcularEquivalencias({ ...cdb, valor: 10000, dataAplicacao: INI }, '2028-09-28', CEN);
    render(<Equivalencias origem="CDB 103% do CDI" eq={eq} />);
    const titulo = screen.getByRole('heading', { name: 'Equivalências de CDB 103% do CDI' });
    expect(titulo.querySelector('button, [role="note"]')).toBeNull();
    expect(screen.getByRole('button', { name: /taxa equivalente/i })).toBeInTheDocument();
  });
  it('campo indisponível mostra "não se aplica" com o motivo', () => {
    const poupanca = { produto: 'POUPANCA', indexacao: { tipo: 'POUPANCA' } } as const;
    const eq = calcularEquivalencias({ ...poupanca, valor: 10000, dataAplicacao: INI }, '2026-10-20', CEN);
    render(<Equivalencias origem="Poupança" eq={eq} />);
    expect(screen.getAllByText(/não se aplica: a origem não rende nada nesse prazo/)).toHaveLength(3);
    expect(screen.getAllByText(/não se aplica: .*prazo mínimo/)).toHaveLength(1);
    expect(screen.queryByText(/regra de bolso/i)).toBeNull();
  });
});

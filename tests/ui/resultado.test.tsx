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
    expect(screen.getByText(/Você errou/)).toBeInTheDocument();
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
  });
});

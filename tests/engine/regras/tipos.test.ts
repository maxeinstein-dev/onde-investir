// tests/engine/regras/tipos.test.ts
import { describe, expect, it } from 'vitest';
import { resolverRegra, type VersaoRegra } from '../../../src/engine/regras/tipos';
import { RegraNaoEncontradaError } from '../../../src/engine/erros';

const VERSOES: VersaoRegra<number>[] = [
  { vigenciaInicio: '2020-01-01', vigenciaFim: '2025-01-01', fonte: 'fictícia v1', valor: 1 },
  { vigenciaInicio: '2025-01-01', fonte: 'fictícia v2', valor: 2 },
];

describe('resolverRegra', () => {
  it('aplica a versão vigente na data (início inclusive, fim exclusive)', () => {
    expect(resolverRegra('teste', VERSOES, '2024-12-31')).toBe(1);
    expect(resolverRegra('teste', VERSOES, '2025-01-01')).toBe(2);
    expect(resolverRegra('teste', VERSOES, '2040-06-01')).toBe(2);
  });
  it('data sem versão → erro explícito', () => {
    expect(() => resolverRegra('teste', VERSOES, '2019-12-31')).toThrow(RegraNaoEncontradaError);
    expect(() => resolverRegra('teste', VERSOES, '2019-12-31')).toThrow(/teste.*2019-12-31/);
  });
});

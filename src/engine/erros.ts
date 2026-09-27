// src/engine/erros.ts
export class DataInvalidaError extends Error {
  constructor(public readonly entrada: string) {
    super(`Data inválida: "${entrada}" (use AAAA-MM-DD)`);
    this.name = 'DataInvalidaError';
  }
}

export class RegraNaoEncontradaError extends Error {
  constructor(public readonly regra: string, public readonly data: string) {
    super(`A regra "${regra}" não está cadastrada para a data ${data}`);
    this.name = 'RegraNaoEncontradaError';
  }
}

export class OfertaInvalidaError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'OfertaInvalidaError';
  }
}

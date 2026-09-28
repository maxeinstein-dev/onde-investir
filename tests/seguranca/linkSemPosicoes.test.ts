import { describe, it } from 'vitest';

// As posições são da pessoa (quanto tem e onde): nunca vão para o link compartilhável (plano M3a, B2).
// O serializador do link chega no M3c. Quando existir, troque o todo por um teste que serializa um estado com
// posições e confere que o link gerado não traz `posicoes` nem nenhum campo delas (valorAplicado, valorExtrato...).
describe('link compartilhável', () => {
  it.todo('M3c: o serializador do link não inclui posicoes');
});

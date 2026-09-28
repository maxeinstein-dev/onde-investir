import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/ui/estilos.css', import.meta.url), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');

/** As declarações das regras cujo seletor inclui `seletor` (fora ou dentro de @media). */
function declaracoes(seletor: string): string[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, sel]) => (sel ?? '').split(',').some((s) => s.trim() === seletor))
    .map(([, , corpo]) => corpo ?? '');
}

describe('estilos: texto longo sem espaço quebra em vez de rolar a página no celular', () => {
  it.each(['.equivalencias h2', '.marco__lider', '.palpite__opcoes button', '.lideranca', '.linha-do-tempo', '.feedback', '.grafico__resumo p', '.alerta', '.grafico__legenda li', '.aprender', '.temporaria', '.voce-sabia', '.dica-contextual', '.compartilhar .dica', '.cartao--objetivo h3', '.sugestao h2'])('%s', (seletor) => {
    expect(declaracoes(seletor).some((d) => /overflow-wrap:\s*anywhere/.test(d))).toBe(true);
  });
});

describe('estilos: a dica do glossário flutua fixa na tela, fora do fluxo da tabela', () => {
  it('.termo__painel usa position: fixed (não alarga contêineres com overflow)', () => {
    expect(declaracoes('.termo__painel').some((d) => /position:\s*fixed/.test(d))).toBe(true);
    expect(declaracoes('.termo__painel').some((d) => /position:\s*absolute/.test(d))).toBe(false);
  });
  it('limita a largura à tela menos 8px de cada lado', () => {
    expect(declaracoes('.termo__painel').some((d) => /max-width:\s*min\(20rem,\s*calc\(100vw - 16px\)\)/.test(d))).toBe(true);
  });
});

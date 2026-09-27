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
  it.each(['.equivalencias h2', '.marco__lider', '.palpite__opcoes button', '.lideranca', '.linha-do-tempo', '.feedback'])('%s', (seletor) => {
    expect(declaracoes(seletor).some((d) => /overflow-wrap:\s*anywhere/.test(d))).toBe(true);
  });
});

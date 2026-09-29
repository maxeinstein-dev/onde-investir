import { existsSync, readFileSync } from 'node:fs';
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

// --- contraste AA nos dois temas ---
const cssBruto = readFileSync(new URL('../../src/ui/estilos.css', import.meta.url), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');

function tokens(corpo: string): Record<string, string> {
  return Object.fromEntries([...corpo.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map(([, k, v]) => [k as string, (v as string).trim()]));
}
// O primeiro :root do arquivo é o claro (chart.test.ts depende disso); o escuro está dentro do @media.
const claro = tokens(/:root\s*\{([^}]*)\}/.exec(cssBruto)?.[1] ?? '');
const escuro = tokens(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(cssBruto)?.[1] ?? '');

function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contraste = (a: string, b: string) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

const PARES_TEXTO: [string, string][] = [
  ['texto', 'fundo'], ['texto', 'superficie'], ['texto-suave', 'fundo'], ['texto-suave', 'superficie'],
  ['primaria', 'fundo'], ['primaria', 'superficie'], ['sucesso', 'sucesso-fundo'], ['erro', 'erro-fundo'],
  ['aviso-texto', 'aviso-fundo'], ['texto-sobre-primaria', 'primaria'], ['texto-sobre-primaria', 'sucesso'],
  ['erro', 'fundo'], ['erro', 'superficie'], ['primaria-escura', 'fundo'], ['grafico-texto', 'grafico-premissa'],
];

describe.each([['claro', claro], ['escuro', escuro]] as const)('estilos: contraste AA no tema %s', (_nome, t) => {
  it('define todos os tokens de cor', () => {
    for (const k of ['fundo', 'superficie', 'texto', 'texto-suave', 'borda', 'primaria', 'primaria-escura', 'sucesso', 'sucesso-fundo',
      'erro', 'erro-fundo', 'aviso-fundo', 'aviso-texto', 'aviso-borda', 'foco', 'texto-sobre-primaria', 'sombra', 'borda-controle',
      'grafico-1', 'grafico-2', 'grafico-3', 'grafico-4', 'grafico-5', 'grafico-texto', 'grafico-grade', 'grafico-marcador', 'grafico-premissa']) {
      expect(t[k], k).toBeDefined();
    }
  });
  it.each(PARES_TEXTO)('texto %s sobre %s: 4,5:1 ou mais', (a, b) => {
    expect(contraste(t[a] as string, t[b] as string)).toBeGreaterThanOrEqual(4.5);
  });
  it.each([1, 2, 3, 4, 5])('série %i do gráfico: 3:1 ou mais sobre o fundo e a superfície', (n) => {
    expect(contraste(t[`grafico-${n}`] as string, t['fundo'] as string)).toBeGreaterThanOrEqual(3);
    expect(contraste(t[`grafico-${n}`] as string, t['superficie'] as string)).toBeGreaterThanOrEqual(3);
  });
  it.each([['borda-controle', 'fundo'], ['borda-controle', 'superficie'], ['foco', 'fundo'], ['foco', 'superficie'], ['aviso-borda', 'fundo']])(
    'componente de UI %s sobre %s: 3:1 ou mais (WCAG 1.4.11)', (a, b) => {
      expect(contraste(t[a as string] as string, t[b as string] as string)).toBeGreaterThanOrEqual(3);
    });
});

describe('estilos: o :root claro vem antes do escuro', () => {
  it('o primeiro :root não está dentro de @media (chart.test.ts lê o primeiro)', () => {
    expect(cssBruto.indexOf(':root')).toBeLessThan(cssBruto.indexOf('prefers-color-scheme'));
    expect(claro['fundo']).toBe('#ffffff');
  });
});

describe('estilos: tokens de forma e tipografia', () => {
  it('define escala de espaço, raios, tamanhos de fonte e alvo de toque', () => {
    for (const k of ['espaco-1', 'espaco-2', 'espaco-3', 'espaco-4', 'espaco-6', 'espaco-8', 'raio-cartao', 'raio-controle',
      'fonte', 'texto-pequeno', 'texto-base', 'texto-titulo', 'texto-display', 'alvo-toque']) {
      expect(claro[k], k).toBeDefined();
    }
    expect(claro['alvo-toque']).toBe('3rem'); // 48px
  });
  it('controles usam os tokens, não valores soltos', () => {
    // declaracoes() divide o seletor por vírgula, então 'input, select' nunca casa: consulta-se cada um.
    for (const sel of ['input', 'select']) {
      expect(declaracoes(sel).some((d) => /border-radius:\s*var\(--raio-controle\)/.test(d)), sel).toBe(true);
      // Contorno do campo é componente de UI: 3:1 (WCAG 1.4.11), por isso o token próprio, e não --borda.
      expect(declaracoes(sel).some((d) => /border:\s*1px solid var\(--borda-controle\)/.test(d)), sel).toBe(true);
    }
    expect(declaracoes('button').some((d) => /min-height:\s*var\(--alvo-toque\)/.test(d))).toBe(true);
  });
});

describe('estilos: fonte hospedada', () => {
  it('@font-face aponta para um arquivo que existe em public/fonts', () => {
    const url = /@font-face\s*\{[^}]*url\(['"]?(\/fonts\/[^'")]+)['"]?\)/.exec(cssBruto)?.[1];
    expect(url).toBeDefined();
    expect(existsSync(new URL(`../../public${url}`, import.meta.url))).toBe(true);
  });
  it('usa font-display: swap e faixa de pesos variável', () => {
    expect(cssBruto).toMatch(/font-display:\s*swap/);
    expect(cssBruto).toMatch(/font-weight:\s*100 900/);
  });
});

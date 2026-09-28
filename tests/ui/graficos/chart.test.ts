// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Sem canvas no jsdom: o Chart.js é trocado por marcadores, e o teste confere só o que é registrado.
vi.mock('chart.js', () => {
  const componente = (id: string) => ({ id });
  return {
    Chart: { register: vi.fn() },
    LineController: componente('line'),
    LineElement: componente('lineElement'),
    PointElement: componente('pointElement'),
    LinearScale: componente('linear'),
    Tooltip: componente('tooltip'),
    Legend: componente('legend'),
    // Não usados: se aparecerem no registro, o tree-shaking deixa de funcionar.
    Filler: componente('filler'),
    TimeScale: componente('time'),
    CategoryScale: componente('category'),
  };
});
vi.mock('chartjs-plugin-annotation', () => ({ default: { id: 'annotation' } }));

describe('Chart.js empacotado', () => {
  it('registra só os componentes usados, mais o plugin de anotação', async () => {
    const { Chart } = await import('../../../src/ui/graficos/chart');
    const registrados = vi.mocked(Chart.register).mock.calls.flat().map((c) => (c as { id: string }).id);
    expect(registrados.sort()).toEqual(['annotation', 'legend', 'line', 'lineElement', 'linear', 'pointElement', 'tooltip']);
  });
});

describe('eixo de datas sem adaptador', () => {
  it('a data vira dias desde a época, e o rótulo volta para mês/ano', async () => {
    const { diaDoEixo, rotuloDoEixo } = await import('../../../src/ui/graficos/eixo');
    expect(diaDoEixo('1970-01-02')).toBe(1);
    expect(rotuloDoEixo(diaDoEixo('2027-09-28'))).toBe('09/2027');
    // O Chart.js pede rótulos em posições fracionárias da escala linear.
    expect(rotuloDoEixo(diaDoEixo('2027-09-28') + 0.4)).toBe('09/2027');
  });
  it('o eixo do dinheiro fica em reais inteiros', async () => {
    const { formatarEixoMoeda } = await import('../../../src/ui/graficos/eixo');
    expect(formatarEixoMoeda(12345.67)).toMatch(/^R\$\s12\.346$/);
    expect(formatarEixoMoeda(-250)).toMatch(/^-R\$\s250$/);
  });
});

describe('cores do gráfico', () => {
  afterEach(() => {
    for (let i = 1; i <= 5; i++) document.documentElement.style.removeProperty(`--grafico-${i}`);
  });

  it('lê os tokens de :root com getComputedStyle', async () => {
    const { lerPaleta } = await import('../../../src/ui/graficos/cores');
    document.documentElement.style.setProperty('--grafico-2', '#123456');
    expect(lerPaleta().series[1]).toBe('#123456');
  });

  it('sem a folha de estilo (como no jsdom), usa os mesmos valores de estilos.css', async () => {
    const { lerPaleta, TOKENS } = await import('../../../src/ui/graficos/cores');
    const css = readFileSync(resolve(process.cwd(), 'src/ui/estilos.css'), 'utf-8');
    const raiz = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    const paleta = lerPaleta();
    const lidos = [...paleta.series, paleta.texto, paleta.grade, paleta.marcador, paleta.premissa];
    const tokens = [...TOKENS.series, TOKENS.texto, TOKENS.grade, TOKENS.marcador, TOKENS.premissa];
    tokens.forEach((token, i) => {
      const valor = new RegExp(`${token}:\\s*([^;]+);`).exec(raiz)?.[1]?.trim();
      expect(valor, token).toBe(lidos[i]);
    });
  });

  it('5 cores distintas e 5 formas de ponto distintas, para não depender só da cor', async () => {
    const { lerPaleta, FORMAS_DO_PONTO } = await import('../../../src/ui/graficos/cores');
    expect(new Set(lerPaleta().series).size).toBe(5);
    expect(new Set(FORMAS_DO_PONTO).size).toBe(5);
  });

  it('cada cor da série tem contraste de pelo menos 3:1 com o fundo branco (WCAG 1.4.11)', async () => {
    const { lerPaleta } = await import('../../../src/ui/graficos/cores');
    const luminancia = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (const cor of lerPaleta().series) expect((1.05) / (luminancia(cor) + 0.05), cor).toBeGreaterThanOrEqual(3);
  });
});

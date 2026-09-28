// Conferências dos textos educativos (lições, casos, dicas e "Você sabia?"): fonte oficial, Markdown restrito sem
// sintaxe crua e números só das regras versionadas do engine. Usa o DOM: o teste que importa precisa do jsdom.
import { render } from '@testing-library/preact';
import { h } from 'preact';
import { expect } from 'vitest';
import { reaisRedondos } from '../../src/conteudo/alertas';
import { VERSOES_CUSTODIA } from '../../src/engine/regras/custodia';
import { VERSOES_FGC } from '../../src/engine/regras/fgc';
import { VERSOES_IOF } from '../../src/engine/regras/iof';
import { VERSOES_IR } from '../../src/engine/regras/ir';
import { VERSOES_POUPANCA } from '../../src/engine/regras/poupanca';
import { MarkdownRestrito } from '../../src/ui/MarkdownRestrito';

const DOMINIOS_OFICIAIS = [
  'gov.br', 'bcb.gov.br', 'planalto.gov.br', 'b3.com.br', 'fgc.org.br', 'tesourodireto.com.br', 'ibge.gov.br',
  'anbima.com.br', 'cvm.gov.br',
];

export function oficial(url: string): boolean {
  if (!url.startsWith('https://')) return false;
  const host = new URL(url).hostname;
  return DOMINIOS_OFICIAIS.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Renderiza e confere que não sobrou marcação crua (asterisco, colchete, lista no meio de parágrafo, título). */
export function semSintaxeCrua(texto: string, rotulo: string) {
  const { container } = render(h(MarkdownRestrito, { texto }));
  const visivel = container.textContent ?? '';
  expect(visivel, rotulo).not.toMatch(/[*[\]`#_<>]/);
  expect(visivel, rotulo).not.toMatch(/\]\(/);
  for (const p of container.querySelectorAll('p')) expect(p.textContent, rotulo).not.toMatch(/(^|\n)\s*- /);
  for (const a of container.querySelectorAll('a')) expect(oficial(a.getAttribute('href') ?? ''), `${rotulo}: ${a.getAttribute('href')}`).toBe(true);
  // Todo link do texto virou <a>: um link não-https viraria só o rótulo.
  expect(container.querySelectorAll('a').length, rotulo).toBe([...texto.matchAll(/\]\(/g)].length);
}

// Os únicos números que o texto pode trazer com "%" ou "R$": os das regras versionadas do engine.
const vigente = <T,>(versoes: readonly { valor: T; vigenciaFim?: string }[]) => versoes.filter((x) => x.vigenciaFim === undefined).map((x) => x.valor);
const PERCENTUAIS_DAS_REGRAS = new Set<number>([
  100,
  ...vigente(VERSOES_IR).flat().map((f) => f.aliquota * 100),
  ...vigente(VERSOES_IOF).flat(),
  ...vigente(VERSOES_CUSTODIA).map((c) => c.taxaAA * 100),
  ...VERSOES_POUPANCA.flatMap((p) => [p.valor.taxaFixaAM * 100, (p.valor.limiarSelicAA ?? 0) * 100, (p.valor.fracaoSelic ?? 0) * 100]),
].map((n) => Math.round(n * 1000) / 1000));
const REAIS_DAS_REGRAS = new Set<string>([
  ...vigente(VERSOES_FGC).flatMap((f) => [reaisRedondos(f.porConglomerado), reaisRedondos(f.tetoGlobal)]),
  ...vigente(VERSOES_CUSTODIA).map((c) => reaisRedondos(c.isencaoSelic)),
].map((s) => s.replace(/\s/g, ' ')));

export function soNumerosDasRegras(texto: string, rotulo: string) {
  for (const m of texto.matchAll(/(\d+(?:,\d+)?)\s?%/g)) {
    const n = Math.round(Number((m[1] ?? '').replace(',', '.')) * 1000) / 1000;
    expect(PERCENTUAIS_DAS_REGRAS.has(n), `${rotulo}: ${m[0]} não está nas regras`).toBe(true);
  }
  for (const m of texto.matchAll(/R\$\s?[\d.,]+(?:\s(?:milhões|milhão|mil))?/g)) {
    expect(REAIS_DAS_REGRAS.has(m[0].replace(/\s/g, ' ')), `${rotulo}: ${m[0]} não é limite de regra`).toBe(true);
  }
}

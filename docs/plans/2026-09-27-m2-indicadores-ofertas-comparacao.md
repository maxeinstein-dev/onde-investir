# M2 — Indicadores ao vivo, cenários, ofertas e comparação por horizonte: plano de implementação

> **Para o Claude:** use `subagent-driven-development` (ou `executing-plans`) para
> implementar este plano tarefa por tarefa. **TDD estrito**: nenhum código de produção sem
> um teste que falhou antes.

**Objetivo:** o app passa a buscar CDI, Selic, IPCA, TR, Focus e calendário do Copom
do Banco Central. Com esses dados, projeta três cenários (Juros sobem / Base / Juros caem)
e mais um manual. O usuário cadastra várias ofertas e compara todas por horizonte
(6m, 1a, 2a, 3a, 5a e a data dele) e numa linha do tempo de vencimentos, com
reinvestimento.

**Arquitetura:** o engine (`src/engine/`) ganha curvas degrau, o calendário do Copom, a
montagem do cenário projetado e a projeção de ofertas com reinvestimento. Tudo continua
puro e sem rede. Uma camada nova, `src/dados/`, busca as APIs com `fetch` injetado, valida
com **zod**, guarda em cache no localStorage com "válido até o próximo evento" e cai para
cache vencido → manual quando a rede falha. A UI ganha duas abas ("Comparar ofertas" e
"Duelo rápido") e um painel de indicadores compartilhado.

**Stack:** a mesma do M1 + `zod`.

**Referências:**
- Spec: `docs/superpowers/specs/2026-09-27-onde-investir-design.md`, §4 (indicadores,
  curva, cenários, calendário do Copom), §5.1, §5.2, §5.4, §5.8, §7.
- Plano do M1 (convenções): `docs/plans/2026-09-27-m1-motor-e-equivalencia.md`.

**Convenções (as do M1, mais estas):**
- A branch do marco é a `m2`, e o PR é aberto contra a `main`, que é protegida.
- Commits em português, **sem assinatura de IA**.
- **Uma requisição por verificação** às APIs reais. Os testes usam **fixtures** salvas em
  `tests/fixtures/bcb/` e `fetch` falso. Nenhum teste chama a rede.
- Focus e SGS trazem percentuais (13.25 = 13,25%). A conversão para fração acontece **uma
  vez**, na camada `dados/` ou na montagem do cenário, nunca espalhada.
- Os instantes do cache são epoch em ms. O fuso de negócio é BRT (−03:00, sem horário de
  verão desde 2019).
- Desempenho: tabela com 10 ofertas × 6 horizontes em < 1,5 s no teste (meta real: < 300 ms).

**Nota sobre o nível de detalhe:** as tarefas de engine e de dados trazem testes e código
completos. As de UI trazem os testes completos e o **contrato** de cada componente (props,
textos e comportamento). O JSX segue os padrões já existentes em `src/ui/`.

---

## Lote A — Engine

### Tarefa A0: Branch

```bash
git switch main && git pull --ff-only origin main && git switch -c m2
```

### Tarefa A1: Curva degrau (`src/engine/curva.ts`)

**Teste** `tests/engine/curva.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { criarCurva, valorEm } from '../../src/engine/curva';

describe('curva degrau', () => {
  const c = criarCurva([
    { inicio: '2026-11-05', valor: 0.1325 },
    { inicio: '2026-09-24', valor: 0.1375 },
    { inicio: '2026-12-10', valor: 0.13 },
  ]);
  it('ordena e vale a partir do início (inclusive)', () => {
    expect(valorEm(c, '2026-09-24')).toBe(0.1375);
    expect(valorEm(c, '2026-11-04')).toBe(0.1375);
    expect(valorEm(c, '2026-11-05')).toBe(0.1325);
    expect(valorEm(c, '2030-01-01')).toBe(0.13);
  });
  it('antes do primeiro ponto usa o primeiro valor', () => {
    expect(valorEm(c, '2020-01-01')).toBe(0.1375);
  });
  it('mesmo início: vale o último informado', () => {
    expect(valorEm(criarCurva([{ inicio: '2026-01-01', valor: 1 }, { inicio: '2026-01-01', valor: 2 }]), '2026-06-01')).toBe(2);
  });
  it('curva vazia ou valor não finito → erro', () => {
    expect(() => criarCurva([])).toThrow();
    expect(() => criarCurva([{ inicio: '2026-01-01', valor: Number.NaN }])).toThrow();
  });
});
```

**Implementação:**

```ts
// src/engine/curva.ts
import { type DataISO, paraDia } from './datas';

/** Ponto de uma função degrau: `valor` vale de `inicio` (inclusive) até o próximo ponto. */
export interface PontoCurva { inicio: DataISO; valor: number }
export type Curva = readonly PontoCurva[];

export function criarCurva(pontos: readonly PontoCurva[]): Curva {
  if (pontos.length === 0) throw new RangeError('Curva sem pontos');
  const porInicio = new Map<DataISO, number>();
  for (const p of pontos) {
    paraDia(p.inicio); // valida a data
    if (!Number.isFinite(p.valor)) throw new RangeError(`Valor inválido na curva em ${p.inicio}`);
    porInicio.set(p.inicio, p.valor);
  }
  return Object.freeze([...porInicio].map(([inicio, valor]) => ({ inicio, valor })).sort((a, b) => (a.inicio < b.inicio ? -1 : 1)));
}

/** Busca binária: último ponto com início ≤ data; antes do primeiro, o primeiro. */
export function valorEm(curva: Curva, data: DataISO): number {
  let lo = 0;
  let hi = curva.length - 1;
  let achado = 0;
  while (lo <= hi) {
    const meio = (lo + hi) >> 1;
    if ((curva[meio] as PontoCurva).inicio <= data) { achado = meio; lo = meio + 1; } else hi = meio - 1;
  }
  return (curva[achado] as PontoCurva).valor;
}
```

Commit: `feat(engine): curva degrau com busca binária`.

### Tarefa A2: Calendário do Copom (`src/engine/copom.ts`)

**Teste** `tests/engine/copom.test.ts`. As datas de anúncio de 2026 e 2027 vêm da spec
§4, verificadas no endpoint do BC:

```ts
import { describe, expect, it } from 'vitest';
import { anunciosDoCalendario, dataDaReuniao, numerarReunioes, vigenciaDaDecisao } from '../../src/engine/copom';
import { somarDias } from '../../src/engine/datas';

export const ANUNCIOS_2026_2027 = [
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-08-05', '2026-09-16', '2026-11-04', '2026-12-09',
  '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-16', '2027-08-04', '2027-09-22', '2027-10-27', '2027-12-08',
];

describe('Copom', () => {
  it('anúncio = último dia de cada bloco de dias consecutivos (itens fora de ordem)', () => {
    const itens = ANUNCIOS_2026_2027.flatMap((a) => [a, somarDias(a, -1)]).reverse();
    expect(anunciosDoCalendario(itens)).toEqual(ANUNCIOS_2026_2027);
  });
  it('numera Rn/AAAA pela ordem no ano', () => {
    const r = numerarReunioes(ANUNCIOS_2026_2027);
    expect(r.find((x) => x.id === 'R6/2026')).toEqual({ id: 'R6/2026', anuncio: '2026-09-16', estimada: false });
    expect(r.find((x) => x.id === 'R8/2027')?.anuncio).toBe('2027-12-08');
  });
  it('reunião sem data oficial: mesma reunião do último ano oficial + 52 semanas', () => {
    const oficiais = numerarReunioes(ANUNCIOS_2026_2027);
    expect(dataDaReuniao('R1/2028', oficiais)).toEqual({ id: 'R1/2028', anuncio: '2028-01-26', estimada: true });
    expect(dataDaReuniao('R6/2026', oficiais)?.estimada).toBe(false);
    expect(dataDaReuniao('R9/2026', oficiais)).toBeNull();
    expect(dataDaReuniao('R1/2025', oficiais)).toBeNull(); // antes do calendário conhecido
  });
  it('a decisão vale a partir do dia útil seguinte ao anúncio', () => {
    expect(vigenciaDaDecisao('2026-09-16')).toBe('2026-09-17');
    expect(vigenciaDaDecisao('2026-11-19')).toBe('2026-11-23'); // 20/11 feriado, depois fim de semana
  });
});
```

**Implementação:**

```ts
// src/engine/copom.ts
import { ehDiaUtil } from './calendario';
import { type DataISO, diasCorridos, somarDias } from './datas';

export interface ReuniaoCopom { id: string; anuncio: DataISO; estimada: boolean }

/** O calendário do BC traz um item por dia de reunião; o anúncio é o último dia de cada bloco consecutivo. */
export function anunciosDoCalendario(dias: readonly DataISO[]): DataISO[] {
  const ordenados = [...new Set(dias)].sort();
  return ordenados.filter((d, i) => {
    const proximo = ordenados[i + 1];
    return proximo === undefined || diasCorridos(d, proximo) > 1;
  });
}

export function numerarReunioes(anuncios: readonly DataISO[]): ReuniaoCopom[] {
  const contagem = new Map<string, number>();
  return [...anuncios].sort().map((anuncio) => {
    const ano = anuncio.slice(0, 4);
    const n = (contagem.get(ano) ?? 0) + 1;
    contagem.set(ano, n);
    return { id: `R${n}/${ano}`, anuncio, estimada: false };
  });
}

const ID_REUNIAO = /^R([1-8])\/(\d{4})$/;

/** Data oficial, ou estimada pela mesma reunião do último ano oficial + 364 dias por ano. */
export function dataDaReuniao(id: string, oficiais: readonly ReuniaoCopom[]): ReuniaoCopom | null {
  const oficial = oficiais.find((r) => r.id === id);
  if (oficial) return oficial;
  const m = ID_REUNIAO.exec(id);
  if (!m) return null;
  const ano = Number(m[2]);
  const referencia = oficiais.filter((r) => r.id.startsWith(`R${m[1]}/`)).sort((a, b) => (a.anuncio < b.anuncio ? -1 : 1)).at(-1);
  if (!referencia) return null;
  const anoReferencia = Number(referencia.id.slice(-4));
  if (ano <= anoReferencia) return null;
  return { id, anuncio: somarDias(referencia.anuncio, 364 * (ano - anoReferencia)), estimada: true };
}

export function vigenciaDaDecisao(anuncio: DataISO): DataISO {
  let d = somarDias(anuncio, 1);
  while (!ehDiaUtil(d)) d = somarDias(d, 1);
  return d;
}
```

Guarde `ANUNCIOS_2026_2027` em `tests/engine/copomFixture.ts` (exportado) e importe dele
nos testes; um arquivo `.test.ts` não deve exportar.

Commit: `feat(engine): calendário do Copom, numeração Rn/AAAA e datas estimadas`.

### Tarefa A3: Cenário projetado (`src/engine/projecao.ts`)

A regra está na spec §4.1 e §4.2: degraus da Selic no dia útil seguinte a cada reunião;
depois, interpolação linear mês a mês até o fim de cada ano do Focus anual; depois,
convergência linear em N anos até as premissas. O IPCA usa o Focus mensal, depois o anual
distribuído em meses, depois a convergência. "Juros sobem/caem" = mediana ± k·DP,
limitado ao mínimo/máximo, **para Selic e IPCA**.

**Fixture de teste** `tests/engine/focusSintetico.ts` (dados pequenos para conferir à mão):

```ts
import type { Atuais, DadosFocus, EstatisticaFocus } from '../../src/engine/projecao';
import { numerarReunioes } from '../../src/engine/copom';
import { ANUNCIOS_2026_2027 } from './copomFixture';

export const est = (mediana: number, desvioPadrao = 0, minimo = mediana, maximo = mediana): EstatisticaFocus =>
  ({ mediana, desvioPadrao, minimo, maximo });

export const FOCUS: DadosFocus = {
  dataColeta: '2026-09-18',
  selicPorReuniao: [
    { reuniao: 'R7/2026', est: est(13.25, 0.25, 12.75, 13.5) },
    { reuniao: 'R8/2026', est: est(13, 0.5, 12, 14) },
  ],
  ipcaMensal: [
    { anoMes: '2026-09', est: est(0.29) },
    { anoMes: '2026-10', est: est(0.4, 0.1, 0.2, 0.6) },
  ],
  selicAnual: [{ ano: 2026, est: est(13) }, { ano: 2027, est: est(12, 1, 10, 14) }],
  ipcaAnual: [{ ano: 2026, est: est(4.9) }, { ano: 2027, est: est(4.3, 0.4, 3.5, 5) }],
};
export const ATUAIS: Atuais = { dataReferencia: '2026-09-24', selicMetaAA: 0.1375, trAM: 0.001646 };
export const OFICIAIS = numerarReunioes(ANUNCIOS_2026_2027);
```

**Teste** `tests/engine/projecao.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { montarCenario, PREMISSAS_PADRAO } from '../../src/engine/projecao';
import { fatorIPCA } from '../../src/engine/indexadores';
import { diasCorridos } from '../../src/engine/datas';
import { ATUAIS, FOCUS, OFICIAIS, est } from './focusSintetico';

const base = () => montarCenario('BASE', FOCUS, ATUAIS, OFICIAIS, PREMISSAS_PADRAO);
const SELIC_LP = 1.03 * 1.05 - 1;

describe('cenário projetado — Selic', () => {
  it('degraus no dia útil seguinte ao anúncio', () => {
    const c = base();
    expect(c.selicMetaAA('2026-11-04')).toBe(0.1375);
    expect(c.selicMetaAA('2026-11-05')).toBeCloseTo(0.1325, 12);
    expect(c.selicMetaAA('2026-12-10')).toBeCloseTo(0.13, 12);
  });
  it('CDI = Selic − spread; Selic over = CDI', () => {
    const c = base();
    expect(c.cdiAA('2026-11-05')).toBeCloseTo(0.1315, 12);
    expect(c.selicOverAA('2026-11-05')).toBe(c.cdiAA('2026-11-05'));
  });
  it('interpolação linear mês a mês até o fim do ano do Focus anual', () => {
    // âncoras: fim de 2026 (13%) e fim de 2027 (12%), ambas do Focus anual
    const esperado = 0.13 + (0.12 - 0.13) * (diasCorridos('2026-12-31', '2027-07-01') / diasCorridos('2026-12-31', '2027-12-31'));
    expect(base().selicMetaAA('2027-07-01')).toBeCloseTo(esperado, 12);
    expect(base().selicMetaAA('2027-07-15')).toBeCloseTo(esperado, 12); // degrau mensal
  });
  it('convergência linear em 5 anos até a premissa, depois constante', () => {
    const c = base();
    expect(c.selicMetaAA('2033-01-01')).toBeCloseTo(SELIC_LP, 12);
    expect(c.selicMetaAA('2040-06-01')).toBeCloseTo(SELIC_LP, 12);
    const meses = ['2028-01-01', '2029-01-01', '2030-01-01', '2031-01-01', '2032-01-01', '2032-12-01'].map((d) => c.selicMetaAA(d));
    for (let i = 1; i < meses.length; i++) expect(meses[i]).toBeLessThan(meses[i - 1] as number);
    expect(c.inicioPremissa).toBe('2028-01-01');
    expect(c.ultimoAnoFocus).toBe(2027);
  });
  it('sem convergência (0 anos): salta para a premissa em 1º de janeiro', () => {
    const c = montarCenario('BASE', FOCUS, ATUAIS, OFICIAIS, { ...PREMISSAS_PADRAO, anosConvergencia: 0 });
    expect(c.selicMetaAA('2028-01-01')).toBeCloseTo(SELIC_LP, 12);
  });
  it('juros sobem/caem: mediana ± k·DP, limitado ao mínimo/máximo', () => {
    const sobem = montarCenario('SOBEM', FOCUS, ATUAIS, OFICIAIS, PREMISSAS_PADRAO);
    const caem = montarCenario('CAEM', FOCUS, ATUAIS, OFICIAIS, PREMISSAS_PADRAO);
    expect(sobem.selicMetaAA('2026-11-05')).toBeCloseTo(0.135, 12); // 13,25 + 0,25 = 13,5 (= máximo)
    expect(sobem.selicMetaAA('2026-12-10')).toBeCloseTo(0.135, 12); // 13 + 0,5
    expect(caem.selicMetaAA('2026-11-05')).toBeCloseTo(0.13, 12);
    expect(caem.selicMetaAA('2026-12-10')).toBeCloseTo(0.125, 12);
    const k2 = montarCenario('SOBEM', FOCUS, ATUAIS, OFICIAIS, { ...PREMISSAS_PADRAO, k: 2 });
    expect(k2.selicMetaAA('2026-11-05')).toBeCloseTo(0.135, 12); // 13,75 limitado a 13,5
  });
  it('reunião sem data oficial entra como estimada', () => {
    const focus = { ...FOCUS, selicPorReuniao: [...FOCUS.selicPorReuniao, { reuniao: 'R1/2028', est: est(11) }] };
    const c = montarCenario('BASE', focus, ATUAIS, OFICIAIS, PREMISSAS_PADRAO);
    expect(c.reunioesEstimadas).toEqual(['R1/2028']);
    expect(c.selicMetaAA('2028-01-27')).toBeCloseTo(0.11, 12); // anúncio estimado 26/01/2028
  });
  it('reuniões já decididas (antes da data de referência) são ignoradas', () => {
    const focus = { ...FOCUS, selicPorReuniao: [{ reuniao: 'R6/2026', est: est(20) }, ...FOCUS.selicPorReuniao] };
    expect(montarCenario('BASE', focus, ATUAIS, OFICIAIS, PREMISSAS_PADRAO).selicMetaAA('2026-09-24')).toBe(0.1375);
  });
});

describe('cenário projetado — IPCA', () => {
  const mes = (c: ReturnType<typeof base>, inicio: string, fim: string) => fatorIPCA(c, inicio, fim);
  it('mês com Focus mensal rende exatamente a mediana mensal', () => {
    expect(mes(base(), '2026-10-01', '2026-11-01')).toBeCloseTo(1.004, 12);
  });
  it('mês sem Focus mensal: (1 + anual)^(1/12)', () => {
    expect(mes(base(), '2026-11-01', '2026-12-01')).toBeCloseTo(Math.pow(1.049, 1 / 12), 12);
    expect(mes(base(), '2027-03-01', '2027-04-01')).toBeCloseTo(Math.pow(1.043, 1 / 12), 12);
  });
  it('juros sobem também sobe a inflação', () => {
    const sobem = montarCenario('SOBEM', FOCUS, ATUAIS, OFICIAIS, PREMISSAS_PADRAO);
    expect(mes(sobem, '2026-10-01', '2026-11-01')).toBeCloseTo(1.005, 12);
    expect(mes(sobem, '2027-03-01', '2027-04-01')).toBeCloseTo(Math.pow(1.047, 1 / 12), 12);
  });
  it('longo prazo: premissa de IPCA depois da convergência', () => {
    expect(mes(base(), '2033-01-01', '2033-02-01')).toBeCloseTo(Math.pow(1.03, 1 / 12), 12);
  });
  it('TR constante no último valor do SGS', () => {
    expect(base().trAM('2030-01-01')).toBe(0.001646);
  });
});

describe('validação', () => {
  it('Focus sem projeções anuais → erro', () => {
    expect(() => montarCenario('BASE', { ...FOCUS, selicAnual: [] }, ATUAIS, OFICIAIS, PREMISSAS_PADRAO)).toThrow();
  });
  it('premissas inválidas → erro', () => {
    expect(() => montarCenario('BASE', FOCUS, ATUAIS, OFICIAIS, { ...PREMISSAS_PADRAO, anosConvergencia: 1.5 })).toThrow();
    expect(() => montarCenario('BASE', FOCUS, ATUAIS, OFICIAIS, { ...PREMISSAS_PADRAO, k: -1 })).toThrow();
  });
});
```

**Implementação:**

```ts
// src/engine/projecao.ts
import { dataDaReuniao, vigenciaDaDecisao, type ReuniaoCopom } from './copom';
import { criarCurva, valorEm, type Curva, type PontoCurva } from './curva';
import { type DataISO, paraDia, somarMeses } from './datas';
import { OfertaInvalidaError } from './erros';
import type { Cenario } from './indexadores';

/** Estatísticas do Focus em PERCENTUAL, como vêm da API (13.25 = 13,25%). */
export interface EstatisticaFocus { mediana: number; desvioPadrao: number; minimo: number; maximo: number }

export interface DadosFocus {
  dataColeta: DataISO;
  selicPorReuniao: readonly { reuniao: string; est: EstatisticaFocus }[]; // % a.a.
  ipcaMensal: readonly { anoMes: string; est: EstatisticaFocus }[]; // AAAA-MM, % a.m.
  selicAnual: readonly { ano: number; est: EstatisticaFocus }[]; // % a.a., fim de ano
  ipcaAnual: readonly { ano: number; est: EstatisticaFocus }[]; // % a.a.
}

/** Valores atuais do SGS, já em fração. */
export interface Atuais { dataReferencia: DataISO; selicMetaAA: number; trAM: number }

export interface Premissas {
  /** Quantos desvios-padrão afastam os cenários "sobem/caem" da mediana. */
  k: number;
  ipcaLongoPrazoAA: number;
  juroRealLongoPrazoAA: number;
  /** Anos, depois do último ano do Focus, para convergir às premissas (inteiro ≥ 0). */
  anosConvergencia: number;
  /** CDI = Selic meta − spread. */
  spreadCDI: number;
}

export const PREMISSAS_PADRAO: Premissas = {
  k: 1, ipcaLongoPrazoAA: 0.03, juroRealLongoPrazoAA: 0.05, anosConvergencia: 5, spreadCDI: 0.001,
};

export type TipoCenario = 'SOBEM' | 'BASE' | 'CAEM';
const SINAL: Record<TipoCenario, number> = { SOBEM: 1, BASE: 0, CAEM: -1 };

export interface CenarioProjetado extends Cenario {
  tipo: TipoCenario;
  curvaSelic: Curva;
  /** Taxa mensal (fração) por mês civil. */
  curvaIpcaMensal: Curva;
  ultimoAnoFocus: number;
  /** A partir desta data a projeção é premissa, não expectativa de mercado. */
  inicioPremissa: DataISO;
  reunioesEstimadas: readonly string[];
}

interface Ancora { data: DataISO; valor: number }

function validarPremissas(p: Premissas): void {
  const ok = Number.isFinite(p.k) && p.k >= 0
    && Number.isFinite(p.ipcaLongoPrazoAA) && p.ipcaLongoPrazoAA > -1
    && Number.isFinite(p.juroRealLongoPrazoAA) && p.juroRealLongoPrazoAA > -1
    && Number.isInteger(p.anosConvergencia) && p.anosConvergencia >= 0 && p.anosConvergencia <= 30
    && Number.isFinite(p.spreadCDI) && p.spreadCDI >= 0 && p.spreadCDI < 0.05;
  if (!ok) throw new OfertaInvalidaError('Premissas do cenário inválidas');
}

const ajustar = (e: EstatisticaFocus, tipo: TipoCenario, k: number): number =>
  Math.min(e.maximo, Math.max(e.minimo, e.mediana + SINAL[tipo] * k * e.desvioPadrao)) / 100;

/** Primeiros dias de mês m com inicioExclusivo < m ≤ fimInclusivo. */
function primeirosDosMeses(inicioExclusivo: DataISO, fimInclusivo: DataISO): DataISO[] {
  const meses: DataISO[] = [];
  for (let m = somarMeses(`${inicioExclusivo.slice(0, 7)}-01`, 1); m <= fimInclusivo; m = somarMeses(m, 1)) meses.push(m);
  return meses;
}

/** Interpolação linear por dias corridos entre âncoras ordenadas; fora do intervalo, o extremo. */
function interpolar(ancoras: readonly Ancora[], data: DataISO): number {
  const d = paraDia(data);
  const primeira = ancoras[0] as Ancora;
  if (d <= paraDia(primeira.data)) return primeira.valor;
  for (let i = 1; i < ancoras.length; i++) {
    const a = ancoras[i - 1] as Ancora;
    const b = ancoras[i] as Ancora;
    const da = paraDia(a.data);
    const db = paraDia(b.data);
    if (d <= db) return db === da ? b.valor : a.valor + (b.valor - a.valor) * ((d - da) / (db - da));
  }
  return (ancoras.at(-1) as Ancora).valor;
}

export function montarCenario(
  tipo: TipoCenario, focus: DadosFocus, atuais: Atuais, reunioesOficiais: readonly ReuniaoCopom[], premissas: Premissas,
): CenarioProjetado {
  validarPremissas(premissas);
  if (focus.selicAnual.length === 0 || focus.ipcaAnual.length === 0) {
    throw new OfertaInvalidaError('O Focus não trouxe projeções anuais');
  }
  const { k, anosConvergencia: anos } = premissas;
  const selicLP = (1 + premissas.ipcaLongoPrazoAA) * (1 + premissas.juroRealLongoPrazoAA) - 1;

  // Selic: degraus por reunião
  const pontosSelic: PontoCurva[] = [{ inicio: atuais.dataReferencia, valor: atuais.selicMetaAA }];
  const estimadas: string[] = [];
  let ultima: Ancora = { data: atuais.dataReferencia, valor: atuais.selicMetaAA };
  const reunioes = focus.selicPorReuniao
    .map((r) => ({ r, reuniao: dataDaReuniao(r.reuniao, reunioesOficiais) }))
    .flatMap(({ r, reuniao }) => (reuniao ? [{ r, reuniao, vigencia: vigenciaDaDecisao(reuniao.anuncio) }] : []))
    .filter((x) => x.vigencia > atuais.dataReferencia)
    .sort((a, b) => (a.vigencia < b.vigencia ? -1 : 1));
  for (const { r, reuniao, vigencia } of reunioes) {
    const valor = ajustar(r.est, tipo, k);
    pontosSelic.push({ inicio: vigencia, valor });
    if (reuniao.estimada) estimadas.push(reuniao.id);
    ultima = { data: vigencia, valor };
  }

  // Selic: anual (fim de ano) e convergência, mês a mês
  const ultimoAno = Math.max(...focus.selicAnual.map((a) => a.ano));
  const ancorasSelic: Ancora[] = [
    ultima,
    ...[...focus.selicAnual]
      .filter((a) => `${a.ano}-12-31` > ultima.data)
      .sort((a, b) => a.ano - b.ano)
      .map((a) => ({ data: `${a.ano}-12-31`, valor: ajustar(a.est, tipo, k) })),
  ];
  if (anos > 0) ancorasSelic.push({ data: `${ultimoAno + anos}-12-31`, valor: selicLP });
  for (const m of primeirosDosMeses(ultima.data, (ancorasSelic.at(-1) as Ancora).data)) {
    pontosSelic.push({ inicio: m, valor: interpolar(ancorasSelic, m) });
  }
  pontosSelic.push({ inicio: `${ultimoAno + anos + 1}-01-01`, valor: selicLP });

  // IPCA: mensal do Focus, depois anual distribuído, depois convergência
  const pontosIpca: PontoCurva[] = [...focus.ipcaMensal]
    .sort((a, b) => (a.anoMes < b.anoMes ? -1 : 1))
    .map((m) => ({ inicio: `${m.anoMes}-01`, valor: ajustar(m.est, tipo, k) }));
  const ultimoAnoIpca = Math.max(...focus.ipcaAnual.map((a) => a.ano));
  const anual = new Map(focus.ipcaAnual.map((a) => [a.ano, ajustar(a.est, tipo, k)]));
  const anualFinal = anual.get(ultimoAnoIpca) as number;
  const convergenciaIpca: Ancora[] = [
    { data: `${ultimoAnoIpca}-12-31`, valor: anualFinal },
    { data: `${ultimoAnoIpca + anos}-12-31`, valor: premissas.ipcaLongoPrazoAA },
  ];
  const ultimoMesFocus = pontosIpca.at(-1)?.inicio ?? `${atuais.dataReferencia.slice(0, 7)}-01`;
  for (const m of primeirosDosMeses(ultimoMesFocus, `${ultimoAnoIpca + anos}-12-31`)) {
    const ano = Number(m.slice(0, 4));
    const taxaAnual = ano <= ultimoAnoIpca ? (anual.get(ano) ?? anualFinal) : interpolar(convergenciaIpca, m);
    pontosIpca.push({ inicio: m, valor: Math.pow(1 + taxaAnual, 1 / 12) - 1 });
  }
  pontosIpca.push({ inicio: `${ultimoAnoIpca + anos + 1}-01-01`, valor: Math.pow(1 + premissas.ipcaLongoPrazoAA, 1 / 12) - 1 });

  const curvaSelic = criarCurva(pontosSelic);
  const curvaIpcaMensal = criarCurva(pontosIpca);
  const cdi = (d: DataISO) => valorEm(curvaSelic, d) - premissas.spreadCDI;
  return {
    tipo, curvaSelic, curvaIpcaMensal, ultimoAnoFocus: ultimoAno, inicioPremissa: `${ultimoAno + 1}-01-01`,
    reunioesEstimadas: estimadas,
    selicMetaAA: (d) => valorEm(curvaSelic, d),
    cdiAA: cdi,
    selicOverAA: cdi,
    // fatorIPCA distribui (1 + ipcaAA)^(1/12) no mês; assim o mês rende exatamente 1 + taxa mensal.
    ipcaAA: (d) => Math.pow(1 + valorEm(curvaIpcaMensal, d), 12) - 1,
    trAM: () => atuais.trAM,
  };
}
```

Commit: `feat(engine): cenário projetado a partir do Focus (Copom, anual, convergência, sobem/caem)`.

### Tarefa A4: Ofertas cadastradas e projeção com reinvestimento (`src/engine/ofertas.ts`)

**Teste** `tests/engine/ofertas.test.ts`. Usa o cenário constante padrão, que é
determinístico. Os valores esperados vêm de composições de `simular`, já validado no M1;
o que se testa aqui é a lógica de estados e de reinvestimento.

```ts
import { describe, expect, it } from 'vitest';
import { projetar, validarOfertaCadastrada, type OfertaCadastrada } from '../../src/engine/ofertas';
import { simular } from '../../src/engine/produtos';
import { OfertaInvalidaError } from '../../src/engine/erros';
import { CEN, INI } from './cenarioPadrao';

const base = { emissor: 'Banco X', conglomerado: 'X' };
const cdbDiario: OfertaCadastrada = { ...base, id: 'a', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, liquidez: 'DIARIA' };
const cdbVence2027: OfertaCadastrada = { ...cdbDiario, id: 'b', vencimento: '2027-09-28', liquidez: 'NO_VENCIMENTO' };
const lciVence2027: OfertaCadastrada = { ...base, id: 'c', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 }, vencimento: '2027-09-28', liquidez: 'NO_VENCIMENTO' };
const preTesouro: OfertaCadastrada = { ...base, id: 'd', produto: 'TESOURO_PREFIXADO', indexacao: { tipo: 'PRE', taxaAA: 0.13 }, vencimento: '2029-01-01', liquidez: 'DIARIA' };
const V = 10000;

describe('validarOfertaCadastrada', () => {
  it('exige emissor e conglomerado', () => {
    expect(() => validarOfertaCadastrada({ ...cdbDiario, emissor: '  ' })).toThrow(OfertaInvalidaError);
    expect(() => validarOfertaCadastrada({ ...cdbDiario, conglomerado: '' })).toThrow(OfertaInvalidaError);
  });
  it('Tesouro e "no vencimento" exigem vencimento', () => {
    expect(() => validarOfertaCadastrada({ ...preTesouro, vencimento: undefined })).toThrow(OfertaInvalidaError);
    expect(() => validarOfertaCadastrada({ ...cdbVence2027, vencimento: undefined })).toThrow(OfertaInvalidaError);
  });
  it('poupança não tem vencimento e tem liquidez diária', () => {
    expect(() => validarOfertaCadastrada({ ...base, id: 'p', produto: 'POUPANCA', indexacao: { tipo: 'POUPANCA' }, liquidez: 'NO_VENCIMENTO', vencimento: '2030-01-01' })).toThrow(OfertaInvalidaError);
  });
  it('oferta válida passa', () => {
    expect(() => validarOfertaCadastrada(cdbVence2027)).not.toThrow();
  });
});

describe('projetar', () => {
  it('liquidez diária sem vencimento = simular direto', () => {
    const p = projetar(cdbDiario, V, INI, '2028-09-28', CEN);
    expect(p.estado).toBe('DISPONIVEL');
    if (p.estado === 'DISPONIVEL') expect(p.liquido).toBeCloseTo(12551.897435, 4);
  });
  it('sem liquidez antes do vencimento → indisponível até o vencimento', () => {
    expect(projetar(lciVence2027, V, INI, '2027-03-29', CEN)).toEqual({ estado: 'INDISPONIVEL', motivo: 'Só pode ser resgatado no vencimento', disponivelEm: '2027-09-28' });
  });
  it('no vencimento = simular até o vencimento', () => {
    const p = projetar(lciVence2027, V, INI, '2027-09-28', CEN);
    if (p.estado !== 'DISPONIVEL') throw new Error('esperado disponível');
    expect(p.liquido).toBeCloseTo(11068.912881, 4);
    expect(p.reinvestimento).toBeUndefined();
  });
  it('depois do vencimento: reinveste o líquido (padrão pós → mesmo produto e % do CDI)', () => {
    const p = projetar(lciVence2027, V, INI, '2028-09-28', CEN);
    if (p.estado !== 'DISPONIVEL') throw new Error('esperado disponível');
    const etapa1 = simular({ ...lciVence2027, valor: V, dataAplicacao: INI }, '2027-09-28', CEN);
    const etapa2 = simular({ produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 }, valor: etapa1.valorLiquido, dataAplicacao: '2027-09-28' }, '2028-09-28', CEN);
    expect(p.liquido).toBeCloseTo(etapa2.valorLiquido, 8);
    expect(p.etapas).toHaveLength(2);
    expect(p.reinvestimento).toEqual({ data: '2027-09-28', oferta: { produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 } }, fallback: false });
  });
  it('o IR recomeça na reaplicação', () => {
    const reaplicado = projetar(cdbVence2027, V, INI, '2028-09-28', CEN);
    const direto = projetar(cdbDiario, V, INI, '2028-09-28', CEN);
    if (reaplicado.estado !== 'DISPONIVEL' || direto.estado !== 'DISPONIVEL') throw new Error('esperado disponível');
    expect(reaplicado.etapas[1]?.aliquotaIR).toBe(0.175);
    expect(direto.etapas[0]?.aliquotaIR).toBe(0.15);
    expect(reaplicado.liquido).toBeLessThan(direto.liquido);
  });
  it('reaplicação impossível no mesmo produto (prazo mínimo) → CDB 100% do CDI, marcado como fallback', () => {
    const p = projetar(lciVence2027, V, INI, '2027-12-28', CEN, { tipo: 'MESMA_TAXA' });
    if (p.estado !== 'DISPONIVEL') throw new Error('esperado disponível');
    expect(p.reinvestimento).toEqual({ data: '2027-09-28', oferta: { produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 } }, fallback: true });
  });
  it('regras de reinvestimento: 100% CDI e taxa fixa', () => {
    const cdi = projetar(lciVence2027, V, INI, '2028-09-28', CEN, { tipo: 'CDI_100' });
    const fixa = projetar(lciVence2027, V, INI, '2028-09-28', CEN, { tipo: 'TAXA_FIXA', taxaAA: 0.12 });
    if (cdi.estado !== 'DISPONIVEL' || fixa.estado !== 'DISPONIVEL') throw new Error('esperado disponível');
    expect(cdi.reinvestimento?.oferta).toEqual({ produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 } });
    expect(fixa.reinvestimento?.oferta).toEqual({ produto: 'CDB', indexacao: { tipo: 'PRE', taxaAA: 0.12 } });
  });
  it('padrão para prefixado: 100% do CDI na reaplicação', () => {
    const pre: OfertaCadastrada = { ...cdbVence2027, indexacao: { tipo: 'PRE', taxaAA: 0.13 } };
    const p = projetar(pre, V, INI, '2028-09-28', CEN);
    if (p.estado !== 'DISPONIVEL') throw new Error('esperado disponível');
    expect(p.reinvestimento?.oferta).toEqual({ produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 } });
  });
  it('Tesouro Prefixado antes do vencimento → marcação a mercado', () => {
    expect(projetar(preTesouro, V, INI, '2028-09-28', CEN)).toEqual({ estado: 'MARCACAO_A_MERCADO', vencimento: '2029-01-01' });
  });
  it('LCI com liquidez diária antes do prazo mínimo → indisponível até a data mínima', () => {
    const lciDiaria: OfertaCadastrada = { ...lciVence2027, vencimento: undefined, liquidez: 'DIARIA' };
    const p = projetar(lciDiaria, V, INI, '2026-12-28', CEN);
    expect(p.estado).toBe('INDISPONIVEL');
    if (p.estado === 'INDISPONIVEL') expect(p.disponivelEm).toBe('2027-03-28');
  });
  it('oferta que vence antes da aplicação → indisponível com motivo, sem lançar', () => {
    expect(projetar({ ...cdbVence2027, vencimento: '2026-01-01' }, V, INI, '2027-01-01', CEN).estado).toBe('INDISPONIVEL');
  });
});
```

**Implementação:**

```ts
// src/engine/ofertas.ts
import type { DataISO } from './datas';
import { OfertaInvalidaError, RegraNaoEncontradaError } from './erros';
import type { Cenario } from './indexadores';
import { INDEXACOES_PERMITIDAS, simular, type Oferta, type ResultadoSimulacao } from './produtos';
import { dataMinimaResgate } from './regras/prazoMinimo';

export type Liquidez = 'DIARIA' | 'NO_VENCIMENTO';

export interface OfertaCadastrada extends Oferta {
  id: string;
  emissor: string;
  conglomerado: string;
  vencimento?: DataISO;
  liquidez: Liquidez;
}

export type RegraReinvestimento =
  | { tipo: 'PADRAO' } | { tipo: 'MESMA_TAXA' } | { tipo: 'CDI_100' } | { tipo: 'TAXA_FIXA'; taxaAA: number };

export type Projecao =
  | { estado: 'DISPONIVEL'; liquido: number; etapas: ResultadoSimulacao[]; reinvestimento?: { data: DataISO; oferta: Oferta; fallback: boolean } }
  | { estado: 'INDISPONIVEL'; motivo: string; disponivelEm?: DataISO }
  | { estado: 'MARCACAO_A_MERCADO'; vencimento: DataISO };

const LIMITE_TEXTO = 80;
const CDB_100: Oferta = { produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 } };
const ehTesouroComMarcacao = (o: Oferta) => o.produto === 'TESOURO_PREFIXADO' || o.produto === 'TESOURO_IPCA';

export function validarOfertaCadastrada(o: OfertaCadastrada): void {
  for (const [campo, valor] of [['emissor', o.emissor], ['conglomerado', o.conglomerado]] as const) {
    if (valor.trim() === '' || valor.length > LIMITE_TEXTO) throw new OfertaInvalidaError(`Preencha o ${campo} (até ${LIMITE_TEXTO} caracteres)`);
  }
  if (!INDEXACOES_PERMITIDAS[o.produto]?.includes(o.indexacao.tipo)) throw new OfertaInvalidaError('Indexação não aceita para esse produto');
  if (o.produto === 'POUPANCA' && (o.vencimento !== undefined || o.liquidez !== 'DIARIA')) {
    throw new OfertaInvalidaError('Poupança não tem vencimento e tem liquidez diária');
  }
  if (o.produto.startsWith('TESOURO_') && o.vencimento === undefined) throw new OfertaInvalidaError('Títulos do Tesouro têm vencimento: informe a data');
  if (o.liquidez === 'NO_VENCIMENTO' && o.vencimento === undefined) throw new OfertaInvalidaError('Informe o vencimento de uma oferta sem liquidez diária');
}

function ofertaDeReinvestimento(o: Oferta, regra: RegraReinvestimento): Oferta {
  const mesma: Oferta = { produto: o.produto, indexacao: o.indexacao };
  switch (regra.tipo) {
    case 'MESMA_TAXA': return mesma;
    case 'CDI_100': return CDB_100;
    case 'TAXA_FIXA': return { produto: 'CDB', indexacao: { tipo: 'PRE', taxaAA: regra.taxaAA } };
    case 'PADRAO': return o.indexacao.tipo === 'POS_CDI' ? mesma : CDB_100;
  }
}

function indisponivelPorRegra(o: OfertaCadastrada, dataAplicacao: DataISO, erro: OfertaInvalidaError): Projecao {
  if (o.produto === 'LCI' || o.produto === 'LCA') {
    try {
      return { estado: 'INDISPONIVEL', motivo: erro.message, disponivelEm: dataMinimaResgate(o.produto, o.indexacao.tipo === 'IPCA_MAIS', dataAplicacao) };
    } catch (e) {
      if (!(e instanceof RegraNaoEncontradaError)) throw e;
    }
  }
  return { estado: 'INDISPONIVEL', motivo: erro.message };
}

/** Valor líquido da oferta na data-alvo, com reinvestimento depois do vencimento. */
export function projetar(
  o: OfertaCadastrada, valor: number, dataAplicacao: DataISO, dataAlvo: DataISO, cen: Cenario,
  regra: RegraReinvestimento = { tipo: 'PADRAO' },
): Projecao {
  const aplicacao = { produto: o.produto, indexacao: o.indexacao, valor, dataAplicacao };
  const venc = o.vencimento;
  try {
    if (venc !== undefined && dataAlvo > venc) {
      const etapa1 = simular(aplicacao, venc, cen);
      const preferida = ofertaDeReinvestimento(o, regra);
      try {
        const etapa2 = simular({ ...preferida, valor: etapa1.valorLiquido, dataAplicacao: venc }, dataAlvo, cen);
        return { estado: 'DISPONIVEL', liquido: etapa2.valorLiquido, etapas: [etapa1, etapa2], reinvestimento: { data: venc, oferta: preferida, fallback: false } };
      } catch (e) {
        if (!(e instanceof OfertaInvalidaError)) throw e;
        const etapa2 = simular({ ...CDB_100, valor: etapa1.valorLiquido, dataAplicacao: venc }, dataAlvo, cen);
        return { estado: 'DISPONIVEL', liquido: etapa2.valorLiquido, etapas: [etapa1, etapa2], reinvestimento: { data: venc, oferta: CDB_100, fallback: true } };
      }
    }
    if (venc !== undefined && dataAlvo < venc) {
      if (ehTesouroComMarcacao(o)) return { estado: 'MARCACAO_A_MERCADO', vencimento: venc };
      if (o.liquidez === 'NO_VENCIMENTO') return { estado: 'INDISPONIVEL', motivo: 'Só pode ser resgatado no vencimento', disponivelEm: venc };
    }
    const r = simular(aplicacao, dataAlvo, cen);
    return { estado: 'DISPONIVEL', liquido: r.valorLiquido, etapas: [r] };
  } catch (e) {
    if (e instanceof OfertaInvalidaError) return indisponivelPorRegra(o, dataAplicacao, e);
    throw e;
  }
}
```

Commit: `feat(engine): ofertas cadastradas e projeção com reinvestimento`.

### Tarefa A5: Tabela por horizonte e linha do tempo (`src/engine/comparacao.ts`)

**Teste** `tests/engine/comparacao.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { horizontesPadrao, lideres, linhaDoTempo, tabelaPorHorizonte } from '../../src/engine/comparacao';
import type { OfertaCadastrada } from '../../src/engine/ofertas';
import { CEN, INI } from './cenarioPadrao';

const base = { emissor: 'B', conglomerado: 'B', liquidez: 'NO_VENCIMENTO' as const };
const cdb2027: OfertaCadastrada = { ...base, id: '1', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, vencimento: '2027-09-28' };
const lci2028: OfertaCadastrada = { ...base, id: '2', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 }, vencimento: '2028-09-28' };

describe('horizontes', () => {
  it('6m, 1a, 2a, 3a, 5a e a data do usuário, em ordem', () => {
    expect(horizontesPadrao(INI, '2027-12-15').map((h) => [h.rotulo, h.data])).toEqual([
      ['6 meses', '2027-03-28'], ['1 ano', '2027-09-28'], ['Sua data', '2027-12-15'],
      ['2 anos', '2028-09-28'], ['3 anos', '2029-09-28'], ['5 anos', '2031-09-28'],
    ]);
  });
  it('data do usuário igual a um horizonte padrão não duplica', () => {
    expect(horizontesPadrao(INI, '2028-09-28')).toHaveLength(5);
    expect(horizontesPadrao(INI, null)).toHaveLength(5);
  });
});

describe('líderes', () => {
  it('maior líquido em centavos; empate inclui todos; indisponíveis fora', () => {
    expect(lideres([
      { estado: 'DISPONIVEL', liquido: 100.004, etapas: [] },
      { estado: 'DISPONIVEL', liquido: 100.001, etapas: [] },
      { estado: 'INDISPONIVEL', motivo: 'x' },
    ])).toEqual([0, 1]);
    expect(lideres([{ estado: 'INDISPONIVEL', motivo: 'x' }])).toEqual([]);
  });
});

describe('tabelaPorHorizonte', () => {
  it('uma coluna por horizonte, uma projeção por oferta, líderes marcados', () => {
    const t = tabelaPorHorizonte([cdb2027, lci2028], 10000, INI, horizontesPadrao(INI, null), CEN, { tipo: 'PADRAO' });
    expect(t).toHaveLength(5);
    const umAno = t.find((c) => c.rotulo === '1 ano');
    expect(umAno?.projecoes.map((p) => p.estado)).toEqual(['DISPONIVEL', 'INDISPONIVEL']);
    expect(umAno?.lideres).toEqual([0]);
  });
  // Limite folgado para a CI; se passar de ~300 ms localmente, otimizar o acúmulo diário
  // (pré-calcular os dias úteis) antes do Lote C.
  it('desempenho: 10 ofertas × 6 horizontes < 1500 ms', () => {
    const ofertas = Array.from({ length: 10 }, (_, i) => ({ ...cdb2027, id: String(i), vencimento: `${2027 + (i % 5)}-09-28` }));
    const t0 = performance.now();
    tabelaPorHorizonte(ofertas, 10000, INI, horizontesPadrao(INI, '2030-01-15'), CEN, { tipo: 'PADRAO' });
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe('linhaDoTempo', () => {
  it('um marco por vencimento, em ordem, com ranking em cada um', () => {
    const l = linhaDoTempo([lci2028, cdb2027], 10000, INI, CEN, { tipo: 'PADRAO' });
    expect(l.marcos.map((m) => m.data)).toEqual(['2027-09-28', '2028-09-28']);
    expect(l.marcos[0]?.ofertasQueVencem).toEqual([1]);
    expect(l.marcos[0]?.lideres).toEqual([1]); // só o CDB está disponível em 2027
    expect(l.marcos[1]?.projecoes.every((p) => p.estado === 'DISPONIVEL')).toBe(true);
  });
  it('sem vencimentos → sem marcos', () => {
    expect(linhaDoTempo([{ ...cdb2027, vencimento: undefined, liquidez: 'DIARIA' }], 10000, INI, CEN, { tipo: 'PADRAO' }).marcos).toEqual([]);
  });
});
```

**Implementação:**

```ts
// src/engine/comparacao.ts
import { type DataISO, somarMeses } from './datas';
import type { Cenario } from './indexadores';
import { projetar, type OfertaCadastrada, type Projecao, type RegraReinvestimento } from './ofertas';

export interface Horizonte { rotulo: string; data: DataISO }
export interface ColunaHorizonte extends Horizonte { projecoes: Projecao[]; lideres: number[] }
export interface Marco { data: DataISO; ofertasQueVencem: number[]; projecoes: Projecao[]; lideres: number[] }

const PADRAO: readonly [string, number][] = [['6 meses', 6], ['1 ano', 12], ['2 anos', 24], ['3 anos', 36], ['5 anos', 60]];

export function horizontesPadrao(dataAplicacao: DataISO, dataUsuario: DataISO | null): Horizonte[] {
  const lista = PADRAO.map(([rotulo, meses]) => ({ rotulo, data: somarMeses(dataAplicacao, meses) }));
  if (dataUsuario !== null && dataUsuario > dataAplicacao && !lista.some((h) => h.data === dataUsuario)) {
    lista.push({ rotulo: 'Sua data', data: dataUsuario });
  }
  return lista.sort((a, b) => (a.data < b.data ? -1 : 1));
}

/** Índices das projeções disponíveis com o maior líquido, comparando em centavos. */
export function lideres(projecoes: readonly Projecao[]): number[] {
  const centavos = projecoes.map((p) => (p.estado === 'DISPONIVEL' ? Math.round(p.liquido * 100) : null));
  const validos = centavos.filter((c): c is number => c !== null);
  if (validos.length === 0) return [];
  const maximo = Math.max(...validos);
  return centavos.flatMap((c, i) => (c === maximo ? [i] : []));
}

function projetarTodas(ofertas: readonly OfertaCadastrada[], valor: number, dataAplicacao: DataISO, data: DataISO, cen: Cenario, regra: RegraReinvestimento) {
  const projecoes = ofertas.map((o) => projetar(o, valor, dataAplicacao, data, cen, regra));
  return { projecoes, lideres: lideres(projecoes) };
}

export function tabelaPorHorizonte(
  ofertas: readonly OfertaCadastrada[], valor: number, dataAplicacao: DataISO, horizontes: readonly Horizonte[],
  cen: Cenario, regra: RegraReinvestimento,
): ColunaHorizonte[] {
  return horizontes.map((h) => ({ ...h, ...projetarTodas(ofertas, valor, dataAplicacao, h.data, cen, regra) }));
}

export function linhaDoTempo(
  ofertas: readonly OfertaCadastrada[], valor: number, dataAplicacao: DataISO, cen: Cenario, regra: RegraReinvestimento,
): { marcos: Marco[] } {
  const datas = [...new Set(ofertas.flatMap((o) => (o.vencimento && o.vencimento > dataAplicacao ? [o.vencimento] : [])))].sort();
  return {
    marcos: datas.map((data) => ({
      data,
      ofertasQueVencem: ofertas.flatMap((o, i) => (o.vencimento === data ? [i] : [])),
      ...projetarTodas(ofertas, valor, dataAplicacao, data, cen, regra),
    })),
  };
}
```

Commit: `feat(engine): tabela por horizonte e linha do tempo de vencimentos`.

**Revisão do Lote A:** revisor de código com foco em corretude financeira e de datas,
antes do Lote B.

---

## Lote B — Dados (rede, validação, cache)

### Tarefa B1: zod e fixtures reais

**Passo 1:** `npm install zod`.

**Passo 2 (uma requisição por URL, sem repetir):** salve as respostas **cruas** em
`tests/fixtures/bcb/`:

| Arquivo | URL |
|---|---|
| `sgs-432.json` | `https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json` |
| `sgs-4389.json` | `https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/1?formato=json` |
| `sgs-433.json` | `https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/12?formato=json` |
| `sgs-226.json` | `https://api.bcb.gov.br/dados/serie/bcdata.sgs.226/dados/ultimos/1?formato=json` |
| `focus-selic.json` | `urlFocusSelic()` da Tarefa B2 (monte e imprima a URL antes) |
| `focus-ipca-mensal.json` | `urlFocusIpcaMensal()` |
| `focus-anuais.json` | `urlFocusAnuais()` |
| `copom.json` | `urlCalendarioCopom('2026-01-01', '2028-12-31')` |

Atenção: a série 432 (meta Selic) é **preenchida para a frente** até a próxima reunião, e o
último ponto pode ter data futura. Por isso a data de referência vem da 4389 (CDI).

Commit: `test(dados): fixtures reais do BCB (SGS, Focus, Copom) de 2026-09-27`.

### Tarefa B2: Interpretação das respostas (`src/dados/bcb.ts`)

Funções puras: montam URLs e convertem JSON cru → tipos do engine, validando com zod.
Se o JSON estiver fora do esquema, lançam `RespostaInvalidaError`, com o nome da fonte e
sem dados sensíveis.

**Teste** `tests/dados/bcb.test.ts`. Os valores esperados saem da **leitura das fixtures
salvas** (escreva as asserções depois de abrir cada arquivo). Casos obrigatórios:
- `urlFocusSelic()` contém `ExpectativasMercadoSelic`, `baseCalculo%20eq%200`,
  `%24orderby=Data%20desc` e `%24format=json`, sem espaço cru nem `+`;
- `interpretarSgs(sgs-433)` devolve 12 pontos `{ data: 'AAAA-MM-DD', valor: number }`,
  com a data convertida de `dd/mm/aaaa`;
- `interpretarFocusSelic(focus-selic)` usa só as linhas da coleta mais recente (`Data`
  máxima), tem `reuniao` no formato `Rn/AAAA` e `desvioPadrao` nulo vira 0;
- `interpretarFocusIpcaMensal` converte `'09/2028'` em `'2028-09'`;
- `interpretarFocusAnuais` separa Selic e IPCA, pega a coleta mais recente de cada um e
  devolve `ano` numérico;
- `interpretarCalendarioCopom(copom)` + `anunciosDoCalendario` + `numerarReunioes`
  reproduzem as datas de 2026 e 2027 da spec (`ANUNCIOS_2026_2027`);
- JSON inválido (`{}`, `null`, `{ value: [{ Data: 1 }] }`) → `RespostaInvalidaError`.

**Implementação** (esqueleto completo):

```ts
// src/dados/bcb.ts
import { z } from 'zod';
import type { DataISO } from '../engine/datas';
import type { DadosFocus, EstatisticaFocus } from '../engine/projecao';

export class RespostaInvalidaError extends Error {
  constructor(public readonly fonte: string) {
    super(`Resposta inesperada de ${fonte}`);
    this.name = 'RespostaInvalidaError';
  }
}

const OLINDA = 'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata';
const q = (parametros: Record<string, string>) =>
  Object.entries(parametros).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

export const urlSgsUltimos = (codigo: number, n: number) =>
  `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados/ultimos/${n}?formato=json`;
export const urlFocusSelic = () =>
  `${OLINDA}/ExpectativasMercadoSelic?${q({ $filter: 'baseCalculo eq 0', $orderby: 'Data desc', $top: '40', $format: 'json' })}`;
export const urlFocusIpcaMensal = () =>
  `${OLINDA}/ExpectativaMercadoMensais?${q({ $filter: "Indicador eq 'IPCA' and baseCalculo eq 0", $orderby: 'Data desc', $top: '60', $format: 'json' })}`;
export const urlFocusAnuais = () =>
  `${OLINDA}/ExpectativasMercadoAnuais?${q({ $filter: "(Indicador eq 'Selic' or Indicador eq 'IPCA') and baseCalculo eq 0", $orderby: 'Data desc', $top: '40', $format: 'json' })}`;
export const urlCalendarioCopom = (inicio: DataISO, fim: DataISO) =>
  `https://www.bcb.gov.br/api/servico/sitebcb/calendario/anual?${q({ inicioAgenda: `'${inicio}'`, fimAgenda: `'${fim}'`, lista: 'Reuniões do Copom' })}`;

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const estatisticas = { Mediana: z.number(), DesvioPadrao: z.number().nullable(), Minimo: z.number(), Maximo: z.number() };
const paraEst = (l: { Mediana: number; DesvioPadrao: number | null; Minimo: number; Maximo: number }): EstatisticaFocus =>
  ({ mediana: l.Mediana, desvioPadrao: l.DesvioPadrao ?? 0, minimo: l.Minimo, maximo: l.Maximo });

function validar<T>(fonte: string, esquema: z.ZodType<T>, json: unknown): T {
  const r = esquema.safeParse(json);
  if (!r.success) throw new RespostaInvalidaError(fonte);
  return r.data;
}

function daColetaMaisRecente<T extends { Data: string }>(linhas: readonly T[]): { data: DataISO; linhas: T[] } {
  const data = linhas.reduce((max, l) => (l.Data > max ? l.Data : max), '');
  return { data, linhas: linhas.filter((l) => l.Data === data) };
}

const Sgs = z.array(z.object({ data: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/), valor: z.string() }));
export function interpretarSgs(json: unknown): { data: DataISO; valor: number }[] {
  return validar('SGS', Sgs, json).map((p) => {
    const valor = Number(p.valor);
    if (!Number.isFinite(valor)) throw new RespostaInvalidaError('SGS');
    return { data: `${p.data.slice(6, 10)}-${p.data.slice(3, 5)}-${p.data.slice(0, 2)}`, valor };
  });
}

const FocusSelic = z.object({ value: z.array(z.object({
  Indicador: z.literal('Selic'), Data: z.string().regex(DATA_ISO), Reuniao: z.string().regex(/^R[1-8]\/\d{4}$/), ...estatisticas,
})).min(1) });
export function interpretarFocusSelic(json: unknown): Pick<DadosFocus, 'dataColeta' | 'selicPorReuniao'> {
  const { data, linhas } = daColetaMaisRecente(validar('Focus Selic', FocusSelic, json).value);
  return { dataColeta: data, selicPorReuniao: linhas.map((l) => ({ reuniao: l.Reuniao, est: paraEst(l) })) };
}

const FocusMensal = z.object({ value: z.array(z.object({
  Indicador: z.literal('IPCA'), Data: z.string().regex(DATA_ISO), DataReferencia: z.string().regex(/^\d{2}\/\d{4}$/), ...estatisticas,
})).min(1) });
export function interpretarFocusIpcaMensal(json: unknown): Pick<DadosFocus, 'dataColeta' | 'ipcaMensal'> {
  const { data, linhas } = daColetaMaisRecente(validar('Focus IPCA mensal', FocusMensal, json).value);
  return { dataColeta: data, ipcaMensal: linhas.map((l) => ({ anoMes: `${l.DataReferencia.slice(3)}-${l.DataReferencia.slice(0, 2)}`, est: paraEst(l) })) };
}

const FocusAnual = z.object({ value: z.array(z.object({
  Indicador: z.enum(['Selic', 'IPCA']), Data: z.string().regex(DATA_ISO), DataReferencia: z.string().regex(/^\d{4}$/), ...estatisticas,
})).min(1) });
export function interpretarFocusAnuais(json: unknown): Pick<DadosFocus, 'selicAnual' | 'ipcaAnual'> {
  const linhas = validar('Focus anual', FocusAnual, json).value;
  const de = (indicador: 'Selic' | 'IPCA') =>
    daColetaMaisRecente(linhas.filter((l) => l.Indicador === indicador)).linhas.map((l) => ({ ano: Number(l.DataReferencia), est: paraEst(l) }));
  const selicAnual = de('Selic');
  const ipcaAnual = de('IPCA');
  if (selicAnual.length === 0 || ipcaAnual.length === 0) throw new RespostaInvalidaError('Focus anual');
  return { selicAnual, ipcaAnual };
}

const Calendario = z.object({ conteudo: z.array(z.object({ dataEvento: z.string().regex(/^\d{4}-\d{2}-\d{2}T/) })).min(1) });
/** `dataEvento` vem em UTC às 03:00, que é meia-noite em BRT: a data é a parte AAAA-MM-DD. */
export function interpretarCalendarioCopom(json: unknown): DataISO[] {
  return validar('calendário do Copom', Calendario, json).conteudo.map((e) => e.dataEvento.slice(0, 10));
}
```

Se o zod instalado for da v4 e alguma API diferir (ex.: `z.ZodType<T>`), ajuste o mínimo
e registre.

Commit: `feat(dados): URLs e interpretação validada das respostas do BCB`.

### Tarefa B3: Validade do cache (`src/dados/validade.ts`)

**Teste** `tests/dados/validade.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validadeDiaria, validadeFocus, validadeHoras } from '../../src/dados/validade';

const t = (s: string) => Date.parse(s);

describe('validade até o próximo evento (BRT)', () => {
  it('diária: próximo dia útil às 10h; se hoje é útil e ainda não deu 10h, hoje às 10h', () => {
    expect(validadeDiaria(t('2026-09-28T08:00:00-03:00'))).toBe(t('2026-09-28T10:00:00-03:00')); // segunda cedo
    expect(validadeDiaria(t('2026-09-28T15:00:00-03:00'))).toBe(t('2026-09-29T10:00:00-03:00'));
    expect(validadeDiaria(t('2026-09-25T18:00:00-03:00'))).toBe(t('2026-09-28T10:00:00-03:00')); // sexta → segunda
    expect(validadeDiaria(t('2026-11-19T18:00:00-03:00'))).toBe(t('2026-11-23T10:00:00-03:00')); // 20/11 feriado
  });
  it('Focus: próxima segunda às 10h', () => {
    expect(validadeFocus(t('2026-09-27T12:00:00-03:00'))).toBe(t('2026-09-28T10:00:00-03:00')); // domingo
    expect(validadeFocus(t('2026-09-28T09:00:00-03:00'))).toBe(t('2026-09-28T10:00:00-03:00'));
    expect(validadeFocus(t('2026-09-28T11:00:00-03:00'))).toBe(t('2026-10-05T10:00:00-03:00'));
  });
  it('horas', () => {
    expect(validadeHoras(1000, 24)).toBe(1000 + 86_400_000);
  });
});
```

**Implementação:**

```ts
// src/dados/validade.ts
import { ehDiaUtil } from '../engine/calendario';
import { type DataISO, diaDaSemana, somarDias } from '../engine/datas';

const BRT_MS = -3 * 3_600_000; // Brasil sem horário de verão desde 2019
const HORA_PUBLICACAO = 10;

const dataBRT = (ms: number): DataISO => new Date(ms + BRT_MS).toISOString().slice(0, 10);
const instanteBRT = (data: DataISO, hora: number) => Date.parse(`${data}T${String(hora).padStart(2, '0')}:00:00-03:00`);

/** Dados diários do SGS: válidos até a próxima publicação (dia útil, 10h BRT). */
export function validadeDiaria(agoraMs: number): number {
  const hoje = dataBRT(agoraMs);
  if (ehDiaUtil(hoje) && agoraMs < instanteBRT(hoje, HORA_PUBLICACAO)) return instanteBRT(hoje, HORA_PUBLICACAO);
  let d = somarDias(hoje, 1);
  while (!ehDiaUtil(d)) d = somarDias(d, 1);
  return instanteBRT(d, HORA_PUBLICACAO);
}

/** Boletim Focus: publicado às segundas pela manhã. */
export function validadeFocus(agoraMs: number): number {
  let d = dataBRT(agoraMs);
  while (diaDaSemana(d) !== 1 || instanteBRT(d, HORA_PUBLICACAO) <= agoraMs) d = somarDias(d, 1);
  return instanteBRT(d, HORA_PUBLICACAO);
}

export const validadeHoras = (agoraMs: number, horas: number) => agoraMs + horas * 3_600_000;
```

Commit: `feat(dados): validade do cache até o próximo evento de publicação`.

### Tarefa B4: Cache no localStorage (`src/dados/cache.ts`)

**Teste** `tests/dados/cache.test.ts`, com armazenamento em memória:

```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { gravarCache, lerCache, type Armazenamento } from '../../src/dados/cache';

const memoria = (): Armazenamento & { dados: Map<string, string> } => {
  const dados = new Map<string, string>();
  return { dados, getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => void dados.set(k, v) };
};
const Esquema = z.object({ x: z.number() });

describe('cache', () => {
  it('grava e lê; marca vencido depois da validade', () => {
    const arm = memoria();
    gravarCache(arm, 'teste', { x: 1 }, 100, 200);
    expect(lerCache(arm, 'teste', Esquema, 150)).toEqual({ dados: { x: 1 }, obtidoEm: 100, vencido: false });
    expect(lerCache(arm, 'teste', Esquema, 200)?.vencido).toBe(true);
  });
  it('conteúdo corrompido, de outra versão ou fora do esquema → null', () => {
    const arm = memoria();
    arm.setItem('rende:cache:v1:a', '{nao-json');
    arm.setItem('rende:cache:v1:b', JSON.stringify({ versao: 99, obtidoEm: 1, validoAte: 2, dados: { x: 1 } }));
    arm.setItem('rende:cache:v1:c', JSON.stringify({ versao: 1, obtidoEm: 1, validoAte: 2, dados: { x: 'um' } }));
    for (const k of ['a', 'b', 'c', 'inexistente']) expect(lerCache(arm, k, Esquema, 0)).toBeNull();
  });
  it('storage que lança erro não derruba o app', () => {
    const quebrado: Armazenamento = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('cheio'); } };
    expect(() => gravarCache(quebrado, 'k', { x: 1 }, 0, 1)).not.toThrow();
    expect(lerCache(quebrado, 'k', Esquema, 0)).toBeNull();
  });
});
```

**Implementação:**

```ts
// src/dados/cache.ts
import { z } from 'zod';

export interface Armazenamento { getItem(chave: string): string | null; setItem(chave: string, valor: string): void }

const PREFIXO = 'rende:cache:v1:';
const Envelope = z.object({ versao: z.literal(1), obtidoEm: z.number(), validoAte: z.number(), dados: z.unknown() });

export function lerCache<T>(arm: Armazenamento, chave: string, esquema: z.ZodType<T>, agoraMs: number):
  { dados: T; obtidoEm: number; vencido: boolean } | null {
  try {
    const bruto = arm.getItem(PREFIXO + chave);
    if (bruto === null) return null;
    const envelope = Envelope.safeParse(JSON.parse(bruto));
    if (!envelope.success) return null;
    const dados = esquema.safeParse(envelope.data.dados);
    if (!dados.success) return null;
    return { dados: dados.data, obtidoEm: envelope.data.obtidoEm, vencido: agoraMs >= envelope.data.validoAte };
  } catch {
    return null;
  }
}

export function gravarCache(arm: Armazenamento, chave: string, dados: unknown, obtidoEm: number, validoAte: number): void {
  try {
    arm.setItem(PREFIXO + chave, JSON.stringify({ versao: 1, obtidoEm, validoAte, dados }));
  } catch {
    // Storage cheio ou bloqueado: o app segue sem cache.
  }
}
```

Commit: `feat(dados): cache versionado e validado no localStorage`.

### Tarefa B5: Carregamento resiliente (`src/dados/indicadores.ts`)

Contrato:

```ts
export type Buscar = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
export type StatusFonte = 'REDE' | 'CACHE' | 'CACHE_VENCIDO' | 'FALHOU';
export interface AtuaisSgs { dataReferencia: DataISO; selicMetaAA: number; cdiAA: number; ipca12mAA: number; trAM: number }
export interface IndicadoresCarregados {
  atuais: AtuaisSgs | null;
  focus: DadosFocus | null;
  reunioes: ReuniaoCopom[] | null;
  status: { sgs: StatusFonte; focus: StatusFonte; copom: StatusFonte };
  obtidoEm: { sgs?: number; focus?: number; copom?: number };
}
export async function carregarIndicadores(deps: {
  buscar: Buscar; armazenamento: Armazenamento; agoraMs: number; timeoutMs?: number; // padrão 10 s
}): Promise<IndicadoresCarregados>;
```

Regras:
- **Três grupos independentes, cada um com a sua entrada de cache:**
  - `sgs`: 432, 4389, 433 (12 meses) e 226, em paralelo. Validade: `validadeDiaria`.
  - `focus`: 3 consultas. Validade: `validadeFocus`.
  - `copom`: 1 consulta, de 1º de janeiro do ano corrente até 31 de dezembro de ano + 2. Validade: `validadeHoras(24 × 7)`.
- **Ordem em cada grupo:**
  1. cache válido → usa o cache, sem rede (`CACHE`);
  2. senão, rede → grava no cache (`REDE`);
  3. se a rede falhar (exceção, `!ok`, timeout ou `RespostaInvalidaError`), usa o cache vencido (`CACHE_VENCIDO`);
  4. se não houver cache, `FALHOU`, com dados `null`.
- Um grupo que falha não derruba os outros (`Promise.allSettled`).
- **Conversões:**
  - `selicMetaAA` = 432 ÷ 100;
  - `cdiAA` = 4389 ÷ 100;
  - `ipca12mAA` = ∏(1 + v/100) − 1 sobre os 12 meses da 433;
  - `trAM` = 226 ÷ 100;
  - `dataReferencia` = a data do último ponto da **4389**.
- Os esquemas zod do cache descrevem os tipos do domínio (`AtuaisSgs`, `DadosFocus`,
  `ReuniaoCopom[]`), não o JSON cru.
- **Timeout:** `AbortController` com `timeoutMs`.

**Teste** `tests/dados/indicadores.test.ts`: `buscar` falso que responde com as
fixtures da B1 conforme a URL, e armazenamento em memória. Casos:
1. primeira carga: tudo `REDE` e 8 chamadas; os dados batem com as fixtures (ex.: `selicMetaAA` = valor da 432 ÷ 100);
2. segunda carga com o relógio antes da validade: tudo `CACHE` e **0 chamadas**;
3. relógio depois da validade e rede fora (`buscar` rejeita): tudo `CACHE_VENCIDO`, com os mesmos dados;
4. sem cache e rede fora: tudo `FALHOU`, dados `null`, **sem lançar**;
5. Focus devolve JSON fora do esquema e os demais vêm ok: `focus` = `FALHOU` (ou `CACHE_VENCIDO`, se houver cache), e `sgs`/`copom` = `REDE`;
6. `ok: false` (HTTP 500) conta como falha;
7. timeout: `buscar` que nunca resolve e `timeoutMs: 20` resultam em `FALHOU`.

Commit: `feat(dados): carregamento resiliente de indicadores (rede → cache → cache vencido)`.

### Tarefa B6: Cenários a partir dos indicadores (`src/dados/cenarios.ts`)

```ts
export type EscolhaCenario = TipoCenario | 'MANUAL';
export interface ValoresManuais { cdi: number; selicMeta: number; ipca: number; tr: number } // em %, como na UI do M1
export function cenarioAtivo(
  escolha: EscolhaCenario, ind: IndicadoresCarregados, premissas: Premissas, manual: ValoresManuais,
): { cenario: Cenario; projetado: CenarioProjetado | null; motivoManual?: string };
```

- `MANUAL`: `cenarioConstante` com os valores manuais ÷ 100.
- Projetado: exige `atuais`, `focus` e `reunioes`. Se faltar algum, cai no manual com
  `motivoManual` explicando o que faltou (ex.: "Sem dados do Focus: usando o cenário manual.").
- `Atuais` do engine = `{ dataReferencia, selicMetaAA, trAM }` de `AtuaisSgs`.

**Teste** `tests/dados/cenarios.test.ts`: MANUAL; BASE com as fixtures (`selicMetaAA` na
data de referência = 432 ÷ 100); falta de Focus → manual com motivo; premissas inválidas
→ manual com motivo, sem lançar.

Commit: `feat(dados): cenário ativo (projetado ou manual) a partir dos indicadores`.

**Revisão do Lote B:** revisor com foco em resiliência, validação e zero chamadas
desnecessárias.

---

## Lote C — Conteúdo, persistência e interface

### Tarefa C1: Conteúdo da comparação (`src/conteudo/comparacao.ts`) e glossário

Funções (textos em rascunho; a revisão editorial é a Tarefa C8):

```ts
export function descreverProjecao(p: Projecao): string;
// DISPONIVEL sem reinvestimento: '' (o valor já aparece na célula)
// DISPONIVEL com reinvestimento: 'Venceu em 28/09/2027 e foi reaplicado em LCI 80% do CDI.'
//   (fallback: '… em CDB 100% do CDI, porque o mesmo produto não aceitava esse prazo.')
// INDISPONIVEL: 'Indisponível até 28/09/2027: só pode ser resgatado no vencimento.' (sem data: 'Indisponível: <motivo>.')
// MARCACAO_A_MERCADO: 'Vence em 01/01/2029. Vender antes sai pelo preço de mercado do dia, que pode ser maior ou menor.'
export function concluirLinhaDoTempo(ofertas: readonly OfertaCadastrada[], l: { marcos: Marco[] }): string[];
// No último marco: '<líder> termina na frente em dd/mm/aaaa, com R$ X líquidos, R$ Y a mais que <2º>.'
// Se o líder foi reaplicado: 'Mesmo vencendo antes, <líder> reaplicado termina em R$ X.' + 'O IR recomeçou na reaplicação, com alíquota de Z%.'
// Sem marcos: [] ; um único disponível: só a primeira frase, sem comparação.
export function explicarCenario(c: CenarioProjetado | null, motivoManual?: string): string[];
// 'Selic e IPCA seguem as medianas do Focus de dd/mm/aaaa.' / 'Juros sobem: Selic e IPCA 1 desvio-padrão acima da mediana.'
// 'A partir de 2031 a projeção é premissa, não expectativa de mercado.'
// Reuniões estimadas: 'As datas de R1/2028… foram estimadas: o BC ainda não publicou o calendário.'
```

Glossário novo: `focus`, `copom`, `cenario`, `reinvestimento`, com fontes oficiais
(Focus: https://www.bcb.gov.br/publicacoes/focus; Copom:
https://www.bcb.gov.br/controleinflacao/copom). Verifique cada URL uma vez, na Tarefa C8.

Testes em `tests/conteudo/comparacao.test.ts`, com uma linha do tempo real do engine
(ofertas da Tarefa A5) e asserções com regex tolerante a NBSP. Commit.

### Tarefa C2: Persistência das ofertas e preferências (`src/armazenamento/`)

- `ofertas.ts`:
  - `lerOfertas(arm)`, `salvarOfertas(arm, ofertas)`, na chave `rende:ofertas:v1`;
  - esquema zod estrito (`z.strictObject`) com a união discriminada de `indexacao`;
  - ofertas que falham em `validarOfertaCadastrada` são descartadas na leitura;
  - `exportarOfertas(ofertas, agoraMs)` → string JSON `{ versao: 1, exportadoEm, ofertas }`;
  - `importarOfertas(texto, gerarId)` → `{ ok: true; ofertas } | { ok: false; erro: string }`, com limites de **100 000 caracteres** e **30 ofertas**, JSON inválido, campos extras e HTML em textos rejeitados com mensagem. As ofertas recebem **ids novos**.
- `preferencias.ts` (junto com o `src/ui/preferencias.ts` do M1, que migra para cá):
  - escolha de cenário, premissas e valores manuais, validados por zod;
  - padrão: `BASE`, `PREMISSAS_PADRAO` e `CENARIO_INICIAL.valores`.

Testes: ida e volta; arquivo com `<script>` no emissor → aceito como **texto** (a
renderização já escapa; o teste garante que não há interpretação), com o limite de 80
caracteres; campo extra → rejeitado; 31 ofertas → rejeitado; texto de 100 001 caracteres
→ rejeitado; storage que lança → lista vazia. Commit.

### Tarefa C3: CSP para as APIs do BCB

`public/_headers`: `connect-src 'self' https://api.bcb.gov.br https://olinda.bcb.gov.br https://www.bcb.gov.br`.
Commit: `feat: CSP libera as APIs do Banco Central`.

### Tarefa C4: Casca do app, abas e Duelo rápido

- `src/ui/Abas.tsx`: abas com `role="tablist"`, `role="tab"`, `aria-selected` e
  `role="tabpanel"`, sincronizadas com o hash (`#ofertas`, que é o padrão, e `#duelo`).
  Setas esquerda e direita trocam de aba.
- `src/ui/DueloRapido.tsx`: a tela atual do `App` do M1 **sem o fieldset de cenário**,
  que vai para o painel (C5). Props: `{ cenario: Cenario; descricaoCenario: string }`.
- `src/ui/App.tsx`: cabeçalho, aviso, `PainelIndicadores`, `Abas` e conteúdo. O `useIndicadores`
  roda uma vez ao montar, com `fetch`, `localStorage` e `Date.now()`.
- **Testes:**
  - os testes atuais do `App` migram para `tests/ui/DueloRapido.test.tsx`, recebendo
    `cenarioConstante` do cenário padrão;
  - os testes de validação do cenário (CDI vazio etc.) migram para o painel (C5);
  - em `tests/ui/App.test.tsx` novo, com `fetch` falso via `vi.stubGlobal`:
    - abre em "Comparar ofertas";
    - clicar em "Duelo rápido" muda o hash e a aba;
    - com `fetch` rejeitando, o app mostra o aviso de cenário manual e o duelo funciona.

Commit.

### Tarefa C5: Painel de indicadores (`src/ui/PainelIndicadores.tsx`)

**Contrato:**
- **Enquanto carrega:** "Buscando indicadores no Banco Central…" (`aria-live="polite"`).
- **Mostra:**
  - CDI, Selic meta, IPCA 12 meses e TR, cada um com `Termo`;
  - a data de referência;
  - a origem por grupo: "atualizado agora", "do cache de dd/mm hh:mm" ou "cache vencido de dd/mm", e "indisponível" para o que falhou.
- **Seletor de cenário:** `radiogroup` com Juros sobem, Base (Focus), Juros caem e Manual.
  Os projetados ficam desabilitados quando faltam dados, com o motivo ao lado.
- **Texto:** `explicarCenario(...)` sob o seletor.
- **"Ajustar premissas" (`<details>`):**
  - k (desvios);
  - IPCA de longo prazo (%);
  - juro real de longo prazo (%);
  - anos de convergência;
  - spread CDI (p.p.);
  - usa `CampoNumerico`, validação humana e botão "Restaurar padrão".
- **Manual:** os 4 campos do M1, com as mesmas mensagens ("Preencha o CDI do cenário.").
- As escolhas persistem via `armazenamento/preferencias`.

**Testes** (`tests/ui/PainelIndicadores.test.tsx`), com `IndicadoresCarregados` montado a
partir das fixtures:
- os valores atuais formatados em pt-BR;
- com Focus `FALHOU`, os projetados ficam desabilitados e o Manual selecionado;
- trocar para "Juros sobem" chama `onChange`;
- premissa inválida mostra erro e não propaga;
- "Restaurar padrão".

Commit.

### Tarefa C6: Minhas ofertas (`src/ui/ofertas/`)

**Contrato:**
- **`ListaOfertas`:**
  - cartões com `descreverOferta`, emissor, conglomerado, vencimento ("Liquidez diária" ou "No vencimento: dd/mm/aaaa") e selo de garantia (`Termo` FGC ou Tesouro);
  - botões "Editar" e "Remover", este com confirmação inline (não usar `window.confirm`);
  - estado vazio: "Cadastre as ofertas que você está avaliando para comparar."
- **`FormOfertaCadastrada`:**
  - reaproveita o `FormOferta` do M1 (produto, indexação, taxa);
  - acrescenta emissor, conglomerado (com `datalist` dos já usados), liquidez (Diária / No vencimento) e vencimento;
  - quando o produto for LCI/LCA, mostra a carência mínima legal sugerida;
  - valida com `validarOfertaCadastrada` e mostra o erro em `role="alert"`.
- **Exportar:** baixa `rende-ofertas-AAAA-MM-DD.json` via `Blob` + `URL.createObjectURL`.
- **Importar:** `<input type=file accept="application/json">` + `FileReader`; o resultado de `importarOfertas` aparece em `role="status"` ou `role="alert"`.
- Limite de 30 ofertas.

**Testes:** cadastrar, editar e remover; erro de validação; importação válida e
inválida (com `File` falso); exportar chama `createObjectURL` (stub). Commit.

### Tarefa C7: Comparação (`src/ui/comparacao/`)

**Contrato:**
- **Formulário:** valor, data da aplicação (padrão hoje), "sua data" (opcional) e reinvestimento (Padrão / Mesma taxa / 100% do CDI / Taxa fixa + campo). Botão "Comparar".
- **Menos de 2 ofertas:** "Cadastre pelo menos duas ofertas para comparar." e o botão desabilitado.
- **Palpite** (se ligado): "Qual lidera em <maior horizonte escolhido>?", com um botão por oferta ("A: …", "B: …"; letras A, B, C…).
- **`TabelaHorizontes`:**
  - `<table>` com `<caption>`, cabeçalhos de linha (ofertas) e de coluna (horizontes);
  - cada célula mostra o líquido em moeda ou o estado (`descreverProjecao`);
  - líder com classe `celula--lider` e texto "maior valor líquido" (visualmente oculto);
  - cada célula disponível tem `<details>` "Por que?", com `PorQueEsseResultado` de cada etapa e, havendo reinvestimento, a frase de `descreverProjecao` entre as etapas;
  - no celular, a tabela rola na horizontal **dentro** de um contêiner (`overflow-x: auto`), sem rolar a página.
- **`LinhaDoTempo`:** lista ordenada de marcos (data, quem vence, ranking) + `concluirLinhaDoTempo`.
- Editar qualquer entrada, oferta ou cenário invalida o resultado (padrão do M1).
- O foco vai para o título do palpite ou do resultado (padrão do M1).

**Testes** (`tests/ui/Comparacao.test.tsx`), com cenário constante e duas ofertas:
- o palpite esconde o resultado;
- a tabela tem 5 colunas;
- a célula da LCI em 6 meses diz "Indisponível até";
- a linha do tempo mostra a conclusão;
- trocar o reinvestimento para 100% do CDI muda o texto do reinvestimento;
- a oferta editada esconde o resultado.

Commit.

### Tarefa C8: Revisão do conteúdo (portão humano)

Faça como na Tarefa 25 do M1:
1. verificar cada URL nova uma vez;
2. passar os textos novos pelo /vozmax;
3. mostrar o antes e depois ao usuário e **esperar a aprovação**;
4. aplicar e ajustar os testes.

### Tarefa C9: Verificação final

1. Rode `npm run lint`, `npm run typecheck`, `npm test` e `npm run build`, todos verdes.
2. No navegador (dev), com a **rede real, carregando uma vez**:
   - os indicadores aparecem com "atualizado agora";
   - no recarregamento aparece "do cache";
   - cadastrar 3 ofertas e comparar;
   - trocar o cenário e ver o resultado mudar;
   - duelo rápido;
   - largura de 375px sem rolagem horizontal da página;
   - console sem erros.
3. Revisão final da branch inteira (segurança: importação e CSP; acessibilidade: tabela e abas).

### Tarefa C10: PR e deploy

**Com ok do usuário:** fazer o push da `m2`, abrir o PR e conferir o preview (protegido
pelo Access; o usuário abre). Com o CI verde e a aprovação, o usuário faz o merge. Depois,
conferir em produção, com uma requisição, que a CSP nova está ativa e que o painel carrega.

---

## Fora do M2

Custo extra e valor por oferta, posições, FGC, gráficos, alertas, link compartilhável,
trilha de aprendizado, progresso, brapi, Turnstile e KV: ver M3 e M4 na spec.

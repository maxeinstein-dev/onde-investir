import { describe, expect, it } from 'vitest';
import { interpretarSgsAno } from '../../src/dados/bcb';
import { paraCadaDiaUtil } from '../../src/engine/calendario';
import { cenarioComHistorico, type SeriesRealizadas } from '../../src/engine/historico';
import { cenarioConstante } from '../../src/engine/indexadores';
import { type Posicao, valorAtual } from '../../src/engine/posicoes';
import sgs12de2025 from '../fixtures/bcb/historico/sgs-12-2025.json';
import sgs12de2026 from '../fixtures/bcb/historico/sgs-12-2026.json';

// Conferência manual do plano M3a (tarefa C4): R$ 10.000 corrigidos a 100% do CDI de 02/01/2025 a 01/09/2026 na
// Calculadora do Cidadão do BCB (https://www3.bcb.gov.br/CALCIDADAO/publico/exibirFormCorrecaoValores.do?method=exibirFormCorrecaoValores),
// contra o `valorAtual` bruto de um CDB 100% do CDI com as mesmas datas, pelo histórico das fixtures.
//
// Para conferir: simule na calculadora, escreva o valor corrigido em VALOR_CALCULADORA_CIDADAO e rode `npm test`.
// A meta é uma diferença abaixo de R$ 0,01. Se divergir, investigue a convenção (a calculadora conta o dia final?
// arredonda o fator diário como a B3, em 8 casas?) antes de ajustar o engine.
//
// Tentativa em 2026-09-28: pendente. A calculadora respondeu "Série histórica de dados não acessível no momento"
// e não devolveu o valor corrigido; o teste de referência continua skipped até uma nova tentativa.
const VALOR_CALCULADORA_CIDADAO: number | null = null;

const APLICADO = 10_000;
const INICIO = '2025-01-02';
const FIM = '2026-09-01';

const cdi = new Map(
  [...interpretarSgsAno(sgs12de2025, 2025), ...interpretarSgsAno(sgs12de2026, 2026)].map((p) => [p.data, p.valor / 100] as const),
);
const realizado: SeriesRealizadas = {
  cdiDiario: cdi, selicOverDiaria: new Map(), ipcaMensal: new Map(), trPorInicio: new Map(), selicMetaAA: new Map(),
  ultimaData: [...cdi.keys()].reduce((m, d) => (d > m ? d : m)),
};
// O cenário futuro só vale depois da última data do histórico, fora do período conferido.
const cen = cenarioComHistorico(realizado, cenarioConstante({ cdiAA: 0.14, selicMetaAA: 0.14, ipcaAA: 0.04, trAM: 0 }));
const posicao: Posicao = {
  id: 'p-conferencia', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 }, emissor: 'Banco', conglomerado: 'Banco',
  liquidez: 'DIARIA', valorAplicado: APLICADO, dataAplicacao: INICIO, eventos: [],
};
const brutoDoApp = valorAtual(posicao, FIM, cen).bruto;

describe('conferência com a Calculadora do Cidadão (C4)', () => {
  it('o valor do app é o produto dos fatores diários do CDI das fixtures, sem lacunas no período', () => {
    let fator = 1;
    let semDado = 0;
    paraCadaDiaUtil(INICIO, FIM, (d) => {
      const taxa = cdi.get(d);
      if (taxa === undefined) semDado += 1;
      else fator *= 1 + taxa;
    });
    expect(semDado).toBe(0);
    expect(brutoDoApp).toBeCloseTo(APLICADO * fator, 6);
  });

  it.skipIf(VALOR_CALCULADORA_CIDADAO === null)('bate com a Calculadora do Cidadão por menos de R$ 0,01', () => {
    expect(Math.abs(brutoDoApp - (VALOR_CALCULADORA_CIDADAO ?? NaN))).toBeLessThan(0.01);
  });
});

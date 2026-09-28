// Desempenho da carteira grande (M3a, item 8): 50 posições no mesmo conglomerado, aplicadas há 10 anos, com o
// histórico realizado de 10 anos (sintético), a aba Carteira e os alertas do FGC de uma comparação com 3 ofertas.
//
// Medição em 28/09/2026 (Windows 11, Node 24, `npx vitest run` deste arquivo com --silent=false, 3 execuções):
// 112, 120 e 113 ms. Abaixo dos 500 ms combinados, o cache de `brutoEm` por (posição, data) ficou de fora; a aba
// Carteira oculta já não recalcula o resumo quando nada dela muda (ver semRecalculo.test.tsx).
// O teto do teste é 1.500 ms, com folga para a CI.
import { describe, expect, it } from 'vitest';
import { gerarAlertas, LIMIAR_QUASE_EMPATE } from '../../../src/engine/alertas';
import { paraCadaDiaUtil } from '../../../src/engine/calendario';
import { horizontesPadrao, tabelaPorHorizonte } from '../../../src/engine/comparacao';
import { somarDias, type DataISO } from '../../../src/engine/datas';
import { cenarioComHistorico, type SeriesRealizadas } from '../../../src/engine/historico';
import { cenarioConstante } from '../../../src/engine/indexadores';
import type { OfertaCadastrada } from '../../../src/engine/ofertas';
import { itemFGCDaPosicao, type Posicao } from '../../../src/engine/posicoes';
import { resumirCarteira } from '../../../src/ui/carteira/resumo';

const HOJE = '2026-09-28';
const APLICADO_EM = '2016-09-28';
const FUTURO = cenarioConstante({ cdiAA: 0.1365, selicMetaAA: 0.1375, ipcaAA: 0.0422, trAM: 0.001646 });

/** 10 anos de histórico sintético: CDI e Selic over por dia útil, IPCA por mês, TR por dia e a meta. */
function historicoSintetico(inicio: DataISO, ultimaData: DataISO): SeriesRealizadas {
  const cdi = new Map<DataISO, number>();
  let k = 0;
  paraCadaDiaUtil(inicio, somarDias(ultimaData, 1), (d) => {
    cdi.set(d, Math.round((0.00035 + ((k * 37) % 23) * 3.1e-7) * 1e8) / 1e8);
    k++;
  });
  const ipca = new Map<string, number>();
  const tr = new Map<DataISO, number>();
  for (let d = inicio; d <= ultimaData; d = somarDias(d, 1)) {
    ipca.set(d.slice(0, 7), 0.004);
    tr.set(d, 0.0012);
  }
  return {
    cdiDiario: cdi,
    selicOverDiaria: new Map([...cdi].map(([d, v]) => [d, v + 1e-8])),
    ipcaMensal: ipca,
    trPorInicio: tr,
    selicMetaAA: new Map([[inicio, 0.1225]]),
    ultimaData,
  };
}

const INDEXACOES: Posicao['indexacao'][] = [
  { tipo: 'POS_CDI', percentualCDI: 1.02 },
  { tipo: 'PRE', taxaAA: 0.12 },
  { tipo: 'IPCA_MAIS', taxaRealAA: 0.06 },
];

const posicoes: Posicao[] = Array.from({ length: 50 }, (_, i) => ({
  id: `p-${i}`, produto: i % 5 === 0 ? 'LCI' : 'CDB', indexacao: INDEXACOES[i % 3] as Posicao['indexacao'],
  emissor: `Banco ${i}`, conglomerado: 'Grupo X', liquidez: 'NO_VENCIMENTO', valorAplicado: 5_000 + i * 100,
  dataAplicacao: APLICADO_EM, vencimento: `${2027 + (i % 5)}-0${1 + (i % 9)}-15`, eventos: [],
}));

const ofertas: OfertaCadastrada[] = [
  { id: 'a', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.1 }, emissor: 'Banco A', conglomerado: 'Grupo X', liquidez: 'NO_VENCIMENTO', vencimento: '2029-09-28' },
  { id: 'b', produto: 'LCA', indexacao: { tipo: 'PRE', taxaAA: 0.11 }, emissor: 'Banco B', conglomerado: 'grupo x', liquidez: 'NO_VENCIMENTO', vencimento: '2028-09-28' },
  { id: 'c', produto: 'CDB', indexacao: { tipo: 'IPCA_MAIS', taxaRealAA: 0.07 }, emissor: 'Banco C', conglomerado: 'Grupo X', liquidez: 'NO_VENCIMENTO', vencimento: '2031-09-29' },
];

describe('desempenho da carteira', () => {
  it('50 posições de 10 anos no mesmo conglomerado: a Carteira e os alertas do FGC com 3 ofertas em menos de 1,5 s', () => {
    const cen = cenarioComHistorico(historicoSintetico('2016-01-01', '2026-09-25'), FUTURO);
    const colunas = tabelaPorHorizonte(ofertas, 10_000, HOJE, horizontesPadrao(HOJE, null), cen, { tipo: 'PADRAO' });
    const inicio = performance.now();
    const resumo = resumirCarteira(posicoes, HOJE, cen);
    const itens = posicoes.map((p) => itemFGCDaPosicao(p, HOJE, cen));
    const alertas = gerarAlertas(ofertas, colunas, LIMIAR_QUASE_EMPATE, undefined, { carteira: itens, valor: 10_000, dataAplicacao: HOJE, cen });
    const ms = performance.now() - inicio;
    console.info(`desempenho da carteira: ${ms.toFixed(0)} ms`);
    expect(resumo.naoCalculadas).toEqual([]);
    expect(resumo.fgc.ok && resumo.fgc.conglomerados[0]?.alerta?.data).toBe(HOJE);
    expect(alertas.filter((a) => a.tipo === 'FGC_LIMITE')).toHaveLength(3);
    expect(ms).toBeLessThan(1_500);
  });
});

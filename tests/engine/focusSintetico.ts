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

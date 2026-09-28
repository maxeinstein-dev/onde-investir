// tests/engine/cenarioReal.ts
/** Cenário PROJETADO com as respostas reais do BCB gravadas em tests/fixtures/bcb (sem rede). */
import {
  interpretarCalendarioCopom, interpretarFocusAnuais, interpretarFocusIpcaMensal, interpretarFocusSelic, interpretarSgs,
} from '../../src/dados/bcb';
import { anunciosDoCalendario, numerarReunioes } from '../../src/engine/copom';
import { montarCenario, PREMISSAS_PADRAO, type Atuais, type DadosFocus, type Premissas, type TipoCenario } from '../../src/engine/projecao';
import copom from '../fixtures/bcb/copom.json';
import focusAnuais from '../fixtures/bcb/focus-anuais.json';
import focusIpcaMensal from '../fixtures/bcb/focus-ipca-mensal.json';
import focusSelic from '../fixtures/bcb/focus-selic.json';
import sgs226 from '../fixtures/bcb/sgs-226.json';
import sgs432 from '../fixtures/bcb/sgs-432.json';
import sgs4389 from '../fixtures/bcb/sgs-4389.json';

const ultimo = <T>(xs: readonly T[]): T => xs.at(-1) as T;

const selic = interpretarFocusSelic(focusSelic);
const mensal = interpretarFocusIpcaMensal(focusIpcaMensal);
const anuais = interpretarFocusAnuais(focusAnuais);
export const FOCUS_REAL: DadosFocus = {
  dataColeta: [selic.dataColeta, mensal.dataColeta, anuais.dataColeta].reduce((min, d) => (d < min ? d : min)),
  selicPorReuniao: selic.selicPorReuniao,
  ipcaMensal: mensal.ipcaMensal,
  selicAnual: anuais.selicAnual,
  ipcaAnual: anuais.ipcaAnual,
};
export const ATUAIS_REAL: Atuais = {
  dataReferencia: ultimo(interpretarSgs(sgs4389)).data,
  selicMetaAA: ultimo(interpretarSgs(sgs432)).valor / 100,
  trAM: ultimo(interpretarSgs(sgs226)).valor / 100,
};
export const REUNIOES_REAL = numerarReunioes(anunciosDoCalendario(interpretarCalendarioCopom(copom)));

export const cenarioReal = (tipo: TipoCenario, premissas: Premissas = PREMISSAS_PADRAO) =>
  montarCenario(tipo, FOCUS_REAL, ATUAIS_REAL, REUNIOES_REAL, premissas);

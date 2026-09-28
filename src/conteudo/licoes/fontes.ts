// src/conteudo/licoes/fontes.ts
// As fontes oficiais da trilha. As do glossário e das regras do engine foram verificadas no M1 e no M2; as marcadas
// "M3c" foram verificadas em 28/09/2026, uma requisição cada.
import { GLOSSARIO } from '../glossario';
import { REGRAS } from './regras';

export const FONTES = {
  lei11033: REGRAS.ir.fonte,
  decretoIOF: REGRAS.iof.fonte,
  custodiaB3: REGRAS.custodia.fonte,
  regulamentoFGC: REGRAS.fgc.fonte,
  poupancaLei: REGRAS.poupanca.fonte,
  poupancaLeiAnterior: REGRAS.poupanca.fonteAnterior,
  prazoMinimoB3: REGRAS.prazoMinimo.fonte,
  poupancaBCB: GLOSSARIO.poupanca.fonte,
  cdiB3: GLOSSARIO.cdi.fonte,
  selicBCB: GLOSSARIO.selic.fonte,
  copomBCB: GLOSSARIO.copom.fonte,
  ipcaIBGE: GLOSSARIO.ipca.fonte,
  titulosPublicos: GLOSSARIO.tesouro.fonte,
  lciLca: GLOSSARIO['lci-lca'].fonte,
  liquidez: GLOSSARIO.liquidez.fonte,
  /** M3c: retorno, risco e liquidez; "os títulos de renda fixa, apesar do nome, possuem riscos". */
  caracteristicas: 'https://www.gov.br/investidor/pt-br/investir/antes-de-investir/entenda-as-caracteristicas-dos-investimentos',
  /** M3c: renda variável sem taxa nem indexador definidos; pode ter retorno negativo e perder todo o capital. */
  rendaFixaXVariavel: 'https://www.gov.br/investidor/pt-br/investir/antes-de-investir/entenda-as-caracteristicas-dos-investimentos/renda-fixa-x-renda-variavel/',
  /** M3c: a ação é renda variável; o ganho não é garantido e depende do lucro da companhia. */
  riscosAcoes: 'https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/acoes/riscos-relacionados-aos-investimentos-em-acoes',
  /** M3c: o risco não pode ser eliminado, mas pode ser reduzido com diversificação. */
  diversificacao: 'https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/etfs/como-reduzir-o-risco',
  fonteFII: REGRAS.rendaVariavel.fonteFII,
  fonteVendaAcoes: REGRAS.rendaVariavel.fonteVendaAcoes,
} as const;

/** Um link do Markdown restrito para a fonte. */
export const link = (rotulo: string, url: string): string => `[${rotulo}](${url})`;

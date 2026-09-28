// `fetch` falsos para os testes do App: as fixtures do BCB ou a rede fora do ar. Nenhum teste chama a rede.
import { vi } from 'vitest';
import {
  urlCalendarioCopom, urlFocusAnuais, urlFocusIpcaMensal, urlFocusSelic, urlSgsUltimos,
} from '../../src/dados/bcb';
import copom from '../fixtures/bcb/copom.json';
import focusAnuais from '../fixtures/bcb/focus-anuais.json';
import focusIpcaMensal from '../fixtures/bcb/focus-ipca-mensal.json';
import focusSelic from '../fixtures/bcb/focus-selic.json';
import sgs226 from '../fixtures/bcb/sgs-226.json';
import sgs432 from '../fixtures/bcb/sgs-432.json';
import sgs433 from '../fixtures/bcb/sgs-433.json';
import sgs4389 from '../fixtures/bcb/sgs-4389.json';

export const RESPOSTAS = new Map<string, unknown>([
  [urlSgsUltimos(432, 1), sgs432],
  [urlSgsUltimos(4389, 1), sgs4389],
  [urlSgsUltimos(433, 12), sgs433],
  [urlSgsUltimos(226, 1), sgs226],
  [urlFocusSelic(), focusSelic],
  [urlFocusIpcaMensal(), focusIpcaMensal],
  [urlFocusAnuais(), focusAnuais],
  [urlCalendarioCopom('2026-01-01', '2028-12-31'), copom],
]);

export const fetchFixtures = vi.fn(async (url: string) => {
  const corpo = RESPOSTAS.get(url);
  return corpo === undefined
    ? { ok: false, status: 404, json: async () => null }
    : { ok: true, status: 200, json: async () => structuredClone(corpo) };
});

export const fetchForaDoAr = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));

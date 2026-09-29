import { beforeAll, describe, expect, it } from 'vitest';
import { PREFERENCIAS_PADRAO } from '../../src/armazenamento/preferencias';
import {
  urlCalendarioCopom, urlFocusAnuais, urlFocusIpcaMensal, urlFocusSelic, urlSgsUltimos,
} from '../../src/dados/bcb';
import { cenarioAtivo } from '../../src/dados/cenarios';
import { carregarIndicadores, type Buscar, type IndicadoresCarregados } from '../../src/dados/indicadores';
import { textoResumoCenario } from '../../src/ui/ResumoCenario';
import { SEM_INDICADORES } from '../../src/ui/useIndicadores';
import copom from '../fixtures/bcb/copom.json';
import focusAnuais from '../fixtures/bcb/focus-anuais.json';
import focusIpcaMensal from '../fixtures/bcb/focus-ipca-mensal.json';
import focusSelic from '../fixtures/bcb/focus-selic.json';
import sgs226 from '../fixtures/bcb/sgs-226.json';
import sgs432 from '../fixtures/bcb/sgs-432.json';
import sgs433 from '../fixtures/bcb/sgs-433.json';
import sgs4389 from '../fixtures/bcb/sgs-4389.json';

const RESPOSTAS = new Map<string, unknown>([
  [urlSgsUltimos(432, 1), sgs432],
  [urlSgsUltimos(4389, 1), sgs4389],
  [urlSgsUltimos(433, 12), sgs433],
  [urlSgsUltimos(226, 1), sgs226],
  [urlFocusSelic(), focusSelic],
  [urlFocusIpcaMensal(), focusIpcaMensal],
  [urlFocusAnuais(), focusAnuais],
  [urlCalendarioCopom('2026-01-01', '2028-12-31'), copom],
]);
const buscar: Buscar = async (url) =>
  (RESPOSTAS.has(url) ? { ok: true, status: 200, json: async () => structuredClone(RESPOSTAS.get(url)) } : { ok: false, status: 404, json: async () => null });

let ind: IndicadoresCarregados;
beforeAll(async () => {
  const dados = new Map<string, string>();
  ind = await carregarIndicadores({
    buscar, armazenamento: { getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => void dados.set(k, v) },
    agoraMs: Date.parse('2026-09-27T12:00:00-03:00'),
  });
});

const ativoDe = (i: IndicadoresCarregados | null, p = PREFERENCIAS_PADRAO) =>
  cenarioAtivo(i === null ? 'MANUAL' : p.escolha, i ?? SEM_INDICADORES, p.premissas, p.manual);

describe('textoResumoCenario', () => {
  it('carregando', () => {
    const p = { ...PREFERENCIAS_PADRAO, escolha: 'MANUAL' as const };
    expect(textoResumoCenario(null, p, ativoDe(null, p))).toBe('Cenário: carregando indicadores…');
  });
  it('sem valores atuais', () => {
    const sem: IndicadoresCarregados = { ...ind, atuais: null };
    const p = { ...PREFERENCIAS_PADRAO, escolha: 'MANUAL' as const };
    expect(textoResumoCenario(sem, p, ativoDe(sem, p))).toBe('Cenário: Manual · valores atuais indisponíveis');
  });
  it('completo', () => {
    const t = textoResumoCenario(ind, PREFERENCIAS_PADRAO, ativoDe(ind));
    expect(t).toMatch(/^Cenário: Base \(Focus\) · CDI \d+(,\d+)?% · IPCA \d+(,\d+)?% · \d{2}\/\d{2}\/\d{4}$/);
  });
});

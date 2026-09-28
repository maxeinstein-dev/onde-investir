import { describe, expect, it } from 'vitest';
import {
  CHAVE_PROGRESSO, contarVisita, dispensarDica, IDS_LICAO, lerProgresso, marcarConcluida, PROGRESSO_VAZIO, registrarPalpite,
  salvarProgresso,
} from '../../src/armazenamento/progresso';
import { LICOES } from '../../src/conteudo/licoes';
import type { Armazenamento } from '../../src/dados/cache';

const memoria = (): Armazenamento & { dados: Map<string, string> } => {
  const dados = new Map<string, string>();
  return { dados, getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => void dados.set(k, v) };
};
const quebrado: Armazenamento = {
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
};
const gravar = (bruto: unknown) => {
  const arm = memoria();
  arm.setItem(CHAVE_PROGRESSO, typeof bruto === 'string' ? bruto : JSON.stringify(bruto));
  return arm;
};

describe('progresso da trilha', () => {
  it('chave versionada e progresso vazio por padrão', () => {
    expect(CHAVE_PROGRESSO).toBe('rende:progresso:v1');
    expect(PROGRESSO_VAZIO).toEqual({ concluidas: [], palpites: { acertos: 0, total: 0 }, dicasDispensadas: [], visitas: 0 });
    expect(lerProgresso(memoria())).toEqual(PROGRESSO_VAZIO);
  });
  it('os ids aceitos são os das 10 lições', () => {
    expect([...IDS_LICAO].sort()).toEqual(LICOES.map((l) => l.id).sort());
  });
  it('ida e volta', () => {
    const arm = memoria();
    const p = { concluidas: ['fgc', 'impostos'], palpites: { acertos: 2, total: 3 }, dicasDispensadas: ['dica-marcacao'], visitas: 4 } as const;
    expect(salvarProgresso(arm, p)).toBe(true);
    expect(lerProgresso(arm)).toEqual(p);
  });
  it('storage quebrado: lê o vazio e a gravação devolve false, sem lançar', () => {
    expect(lerProgresso(quebrado)).toEqual(PROGRESSO_VAZIO);
    expect(salvarProgresso(quebrado, PROGRESSO_VAZIO)).toBe(false);
  });
  it.each(['{', 'null', '[]', '"texto"', '42'])('JSON corrompido ou fora do formato (%s) vira o vazio', (bruto) => {
    expect(lerProgresso(gravar(bruto))).toEqual(PROGRESSO_VAZIO);
  });
  it('cada parte é validada sozinha: uma parte inválida volta ao padrão sem apagar as outras', () => {
    const p = lerProgresso(gravar({ concluidas: ['fgc'], palpites: { acertos: -1, total: 2 }, dicasDispensadas: 'x', visitas: 3 }));
    expect(p).toEqual({ concluidas: ['fgc'], palpites: { acertos: 0, total: 0 }, dicasDispensadas: [], visitas: 3 });
  });
  it('lição desconhecida e repetida saem da lista; o resto fica', () => {
    const p = lerProgresso(gravar({ concluidas: ['fgc', 'inventada', 'fgc', 42, 'reserva'], palpites: { acertos: 0, total: 0 }, dicasDispensadas: [], visitas: 0 }));
    expect(p.concluidas).toEqual(['fgc', 'reserva']);
  });
  it('acertos acima do total, fracionários ou negativos são recusados', () => {
    for (const palpites of [{ acertos: 3, total: 2 }, { acertos: 0.5, total: 2 }, { acertos: 0, total: -1 }, { acertos: 1 }]) {
      expect(lerProgresso(gravar({ ...PROGRESSO_VAZIO, palpites })).palpites).toEqual({ acertos: 0, total: 0 });
    }
  });
  it('visitas negativas ou fracionárias voltam a zero', () => {
    expect(lerProgresso(gravar({ ...PROGRESSO_VAZIO, visitas: -2 })).visitas).toBe(0);
    expect(lerProgresso(gravar({ ...PROGRESSO_VAZIO, visitas: 1.5 })).visitas).toBe(0);
  });
  it('dicas dispensadas: sem repetidas, só textos curtos e com teto', () => {
    const p = lerProgresso(gravar({ ...PROGRESSO_VAZIO, dicasDispensadas: ['a', 'a', 'b', 'x'.repeat(81), 7] }));
    expect(p.dicasDispensadas).toEqual(['a', 'b']);
    const muitas = Array.from({ length: 200 }, (_, i) => `d-${i}`);
    expect(lerProgresso(gravar({ ...PROGRESSO_VAZIO, dicasDispensadas: muitas })).dicasDispensadas.length).toBeLessThanOrEqual(50);
  });
});

describe('mudanças do progresso (funções puras)', () => {
  it('marcar e desmarcar como concluída, sem repetir', () => {
    const a = marcarConcluida(PROGRESSO_VAZIO, 'fgc', true);
    expect(a.concluidas).toEqual(['fgc']);
    expect(marcarConcluida(a, 'fgc', true).concluidas).toEqual(['fgc']);
    expect(marcarConcluida(a, 'fgc', false).concluidas).toEqual([]);
    expect(PROGRESSO_VAZIO.concluidas).toEqual([]);
  });
  it('registrar palpite soma no total e, se acertou, nos acertos', () => {
    const a = registrarPalpite(PROGRESSO_VAZIO, true);
    const b = registrarPalpite(a, false);
    expect(b.palpites).toEqual({ acertos: 1, total: 2 });
  });
  it('dispensar dica não repete', () => {
    const a = dispensarDica(dispensarDica(PROGRESSO_VAZIO, 'dica-x'), 'dica-x');
    expect(a.dicasDispensadas).toEqual(['dica-x']);
  });
  it('contar visita soma 1', () => {
    expect(contarVisita(contarVisita(PROGRESSO_VAZIO)).visitas).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import { LIMITE_OFERTAS } from '../../src/armazenamento/ofertas';
import { CASOS_CLASSICOS } from '../../src/conteudo/casos';
import { LICOES } from '../../src/conteudo/licoes';
import { montarExperimente, type Experimente } from '../../src/conteudo/licoes/tipos';
import type { OfertaCadastrada } from '../../src/engine/ofertas';
import {
  avisoDoCenario, salvarNoCatalogo, temporariaDoExperimente, textoDoBanner,
} from '../../src/ui/comparacao/temporaria';
import { INI } from '../engine/cenarioPadrao';

const sequencia = () => {
  let n = 0;
  return () => `id-${++n}`;
};
const licao = LICOES.find((l) => l.experimente !== undefined);
if (!licao?.experimente) throw new Error('sem lição com "Experimente"');
const exp: Experimente = licao.experimente;
const caso = CASOS_CLASSICOS.find((c) => c.experimente.cenario !== undefined);
if (!caso) throw new Error('sem caso com cenário');

/** A oferta sem o id, para comparar o conteúdo. */
function semId(o: OfertaCadastrada): Omit<OfertaCadastrada, 'id'> {
  const copia: Partial<OfertaCadastrada> = { ...o };
  delete copia.id;
  return copia as Omit<OfertaCadastrada, 'id'>;
}

const oferta = (id: string): OfertaCadastrada => ({
  id, emissor: 'X', conglomerado: 'X', produto: 'CDB', liquidez: 'DIARIA', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 },
});

describe('comparação temporária do "Experimente"', () => {
  it('ofertas com ids próprios, todas na seleção, e as entradas da lição', () => {
    const m = montarExperimente(exp, INI);
    const t = temporariaDoExperimente(m, { tipo: 'licao', titulo: licao.titulo }, sequencia());
    expect(t.ofertas.map((o) => o.id)).toEqual(m.ofertas.map((_, i) => `id-${i + 1}`));
    expect(t.ofertas.map(semId)).toEqual(m.ofertas);
    expect(t.selecao).toEqual(t.ofertas.map((o) => o.id));
    expect(t.inicial).toEqual({ valor: m.valor, dataAplicacao: INI, regra: m.regra, ...(m.suaData ? { suaData: m.suaData } : {}) });
    expect(t.salvas).toBe(false);
  });
  it('o cenário da lição vai só com a escolha (as premissas e os valores manuais são os da pessoa)', () => {
    const m = montarExperimente(caso.experimente, INI);
    const t = temporariaDoExperimente(m, { tipo: 'caso', titulo: caso.titulo }, sequencia());
    expect(t.cenario).toEqual({ escolha: caso.experimente.cenario });
    const semCenario = temporariaDoExperimente(montarExperimente(exp, INI), { tipo: 'licao', titulo: 'x' }, sequencia());
    expect(exp.cenario === undefined ? semCenario.cenario : { escolha: exp.cenario }).toEqual(semCenario.cenario);
  });
  it('a pergunta da lição vai junto; cada abertura tem uma chave nova (o formulário recomeça)', () => {
    const m = { ...montarExperimente(exp, INI), pergunta: 'Qual?' };
    const a = temporariaDoExperimente(m, { tipo: 'licao', titulo: 'x' }, sequencia());
    const b = temporariaDoExperimente(m, { tipo: 'licao', titulo: 'x' }, sequencia());
    expect(a.pergunta).toBe('Qual?');
    expect(a.chave).not.toBe(b.chave);
  });
});

describe('textos da comparação temporária', () => {
  it('banner da lição, do caso e do link', () => {
    expect(textoDoBanner({ tipo: 'licao', titulo: 'FGC e garantias' }, 3)).toBe('Comparação da lição “FGC e garantias”.');
    expect(textoDoBanner({ tipo: 'caso', titulo: 'Poupança × Tesouro Selic' }, 2)).toBe('Comparação do caso clássico “Poupança × Tesouro Selic”.');
    expect(textoDoBanner({ tipo: 'link' }, 3)).toBe('Comparação compartilhada com 3 ofertas.');
  });
  it('aviso do cenário: só quando o pedido precisa do Focus e caiu no manual', () => {
    expect(avisoDoCenario('SOBEM', false)).toBe('O cenário “Juros sobem” desta comparação precisa das projeções do Focus, que não estão disponíveis agora. Por isso ela usa o cenário manual.');
    expect(avisoDoCenario('BASE', false)).toMatch(/^O cenário “Base \(Focus\)”/);
    expect(avisoDoCenario('SOBEM', true)).toBeNull();
    expect(avisoDoCenario('MANUAL', false)).toBeNull();
  });
});

describe('salvar as ofertas da comparação temporária no catálogo', () => {
  const t = temporariaDoExperimente(montarExperimente(exp, INI), { tipo: 'licao', titulo: 'x' }, sequencia());
  it('acrescenta cópias com ids novos, sem mexer nas que já estavam', () => {
    const catalogo = [oferta('meu')];
    const r = salvarNoCatalogo(catalogo, t, () => `novo-${Math.random()}`);
    if (!r.ok) throw new Error(r.erro);
    expect(r.catalogo[0]).toBe(catalogo[0]);
    const novas = r.catalogo.slice(1);
    expect(novas).toHaveLength(t.ofertas.length);
    for (const [i, o] of novas.entries()) {
      expect(o.id).toMatch(/^novo-/);
      expect(t.ofertas.map((x) => x.id)).not.toContain(o.id);
      expect(semId(o)).toEqual(semId(t.ofertas[i] as OfertaCadastrada));
    }
    expect(r.salvas).toBe(t.ofertas.length);
  });
  it('só as que ainda estão na comparação temporária', () => {
    const tirouUma = { ...t, selecao: t.selecao.slice(1) };
    const r = salvarNoCatalogo([], tirouUma, sequencia());
    expect(r.ok && r.salvas).toBe(t.ofertas.length - 1);
  });
  it('respeita o limite do catálogo: não salva nenhuma se não couberem todas', () => {
    const quase = Array.from({ length: LIMITE_OFERTAS - 1 }, (_, i) => oferta(`o${i}`));
    const r = salvarNoCatalogo(quase, t, sequencia());
    expect(r).toEqual({ ok: false, erro: `Só cabe mais 1 oferta no catálogo (o máximo é ${LIMITE_OFERTAS}). Tire alguma de lá para salvar estas.` });
    const cheio = Array.from({ length: LIMITE_OFERTAS }, (_, i) => oferta(`o${i}`));
    expect(salvarNoCatalogo(cheio, t, sequencia())).toEqual({ ok: false, erro: `O catálogo já tem ${LIMITE_OFERTAS} ofertas, o máximo. Tire alguma de lá para salvar estas.` });
    const cabe = Array.from({ length: LIMITE_OFERTAS - t.ofertas.length }, (_, i) => oferta(`o${i}`));
    const ok = salvarNoCatalogo(cabe, t, sequencia());
    expect(ok.ok && ok.catalogo.length).toBe(LIMITE_OFERTAS);
  });
});

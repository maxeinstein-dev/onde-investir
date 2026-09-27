import { describe, expect, it } from 'vitest';
import { concluirLinhaDoTempo, descreverProjecao, explicarCenario, nomeOferta } from '../../src/conteudo/comparacao';
import { GLOSSARIO } from '../../src/conteudo/glossario';
import { linhaDoTempo } from '../../src/engine/comparacao';
import type { OfertaCadastrada, Projecao } from '../../src/engine/ofertas';
import { CEN, INI } from '../engine/cenarioPadrao';
import { cenarioReal } from '../engine/cenarioReal';

// Ofertas da Tarefa A5.
const base = { emissor: 'Banco B', conglomerado: 'B', liquidez: 'NO_VENCIMENTO' as const };
const cdb2027: OfertaCadastrada = { ...base, id: '1', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, vencimento: '2027-09-28' };
const lci2028: OfertaCadastrada = { ...base, id: '2', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 }, vencimento: '2028-09-28' };

/** R$ com espaço comum ou NBSP. */
const R = String.raw`R\$\s?`;

describe('nomeOferta', () => {
  it('descrição da oferta e o emissor', () => {
    expect(nomeOferta(cdb2027)).toBe('CDB 103% do CDI (Banco B)');
  });
});

describe('descreverProjecao', () => {
  it('disponível sem reinvestimento: vazio (o valor já aparece na célula)', () => {
    expect(descreverProjecao({ estado: 'DISPONIVEL', liquido: 100, etapas: [] })).toBe('');
  });
  it('disponível com reinvestimento', () => {
    const p: Projecao = {
      estado: 'DISPONIVEL', liquido: 100, etapas: [],
      reinvestimento: { data: '2027-09-28', oferta: { produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 } }, fallback: false },
    };
    expect(descreverProjecao(p)).toBe('Venceu em 28/09/2027 e foi reaplicado em LCI 80% do CDI.');
  });
  it('reinvestimento com fallback explica o porquê', () => {
    const p: Projecao = {
      estado: 'DISPONIVEL', liquido: 100, etapas: [],
      reinvestimento: { data: '2027-09-28', oferta: { produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 } }, fallback: true },
    };
    expect(descreverProjecao(p)).toBe('Venceu em 28/09/2027 e foi reaplicado em CDB 100% do CDI, porque o mesmo produto não aceitava um prazo tão curto.');
  });
  it('indisponível com data', () => {
    expect(descreverProjecao({ estado: 'INDISPONIVEL', motivo: 'Só pode ser resgatado no vencimento', disponivelEm: '2027-09-28' }))
      .toBe('Indisponível até 28/09/2027: só pode ser resgatado no vencimento.');
  });
  it('indisponível sem data', () => {
    expect(descreverProjecao({ estado: 'INDISPONIVEL', motivo: 'Escolha uma data depois da aplicação' }))
      .toBe('Indisponível: escolha uma data depois da aplicação.');
  });
  it('motivo que começa com sigla não perde as maiúsculas nem duplica o ponto', () => {
    expect(descreverProjecao({ estado: 'INDISPONIVEL', motivo: 'LCI tem prazo mínimo legal.' }))
      .toBe('Indisponível: LCI tem prazo mínimo legal.');
  });
  it('marcação a mercado', () => {
    expect(descreverProjecao({ estado: 'MARCACAO_A_MERCADO', vencimento: '2029-01-01' }))
      .toBe('Vence em 01/01/2029. Se vender antes, recebe o preço de mercado do dia, que pode ficar acima ou abaixo do previsto.');
  });
  it('projeção real do engine: a LCI em 2027 está indisponível até o vencimento', () => {
    const l = linhaDoTempo([cdb2027, lci2028], 10000, INI, CEN, { tipo: 'PADRAO' });
    expect(descreverProjecao(l.marcos[0]!.projecoes[1]!)).toBe('Indisponível até 28/09/2028: só pode ser resgatado no vencimento.');
    expect(descreverProjecao(l.marcos[1]!.projecoes[0]!)).toBe('Venceu em 28/09/2027 e foi reaplicado em CDB 103% do CDI.');
  });
});

describe('concluirLinhaDoTempo', () => {
  it('sem marcos: nada', () => {
    expect(concluirLinhaDoTempo([cdb2027], { marcos: [] })).toEqual([]);
  });
  it('líder reaplicado: quem termina na frente, a diferença e o IR que recomeçou', () => {
    const ofertas = [cdb2027, lci2028];
    const linhas = concluirLinhaDoTempo(ofertas, linhaDoTempo(ofertas, 10000, INI, CEN, { tipo: 'PADRAO' }));
    expect(linhas).toHaveLength(3);
    // 12.448,43 (CDB reaplicado) − 12.262,04 (LCI) = 186,39
    expect(linhas[0]).toMatch(new RegExp(
      String.raw`^No último vencimento, em 28/09/2028, CDB 103% do CDI \(Banco B\) termina na frente com ${R}12\.448,43 líquidos, ${R}186,39 a mais que LCI 80% do CDI \(Banco B\)\. Para outras datas, veja a tabela acima\.$`,
    ));
    expect(linhas[1]).toBe('CDB 103% do CDI (Banco B) vence antes, é reaplicado e mesmo assim termina na frente.');
    expect(linhas[2]).toBe('Na reaplicação o IR recomeçou do zero, com alíquota de 17,5% nesse prazo.');
  });
  it('um único disponível: só a primeira frase, sem comparação', () => {
    const ofertas = [cdb2027];
    const linhas = concluirLinhaDoTempo(ofertas, linhaDoTempo(ofertas, 10000, INI, CEN, { tipo: 'PADRAO' }));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatch(new RegExp(String.raw`^No último vencimento, em 28/09/2027, CDB 103% do CDI \(Banco B\) termina na frente com ${R}11\.152,34 líquidos\. Para outras datas, veja a tabela acima\.$`));
  });
  it('líder sem reaplicação não fala de IR recomeçando', () => {
    const lciCurta: OfertaCadastrada = { ...lci2028, id: '3', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.99 } };
    const ofertas = [cdb2027, lciCurta];
    const linhas = concluirLinhaDoTempo(ofertas, linhaDoTempo(ofertas, 10000, INI, CEN, { tipo: 'PADRAO' }));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatch(/^No último vencimento, em 28\/09\/2028, LCI 99% do CDI \(Banco B\) termina na frente/);
  });
  it('empate no último marco', () => {
    const outro: OfertaCadastrada = { ...cdb2027, id: '9', emissor: 'Banco C' };
    const ofertas = [cdb2027, outro];
    const linhas = concluirLinhaDoTempo(ofertas, linhaDoTempo(ofertas, 10000, INI, CEN, { tipo: 'PADRAO' }));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatch(new RegExp(String.raw`^CDB 103% do CDI \(Banco B\) e CDB 103% do CDI \(Banco C\) terminam empatados em 28/09/2027, com ${R}11\.152,34 líquidos\.$`));
  });
  it('ninguém disponível no último marco: nada', () => {
    expect(concluirLinhaDoTempo([cdb2027], {
      marcos: [{ data: '2027-09-28', ofertasQueVencem: [0], projecoes: [{ estado: 'INDISPONIVEL', motivo: 'x' }], lideres: [] }],
    })).toEqual([]);
  });
});

describe('explicarCenario', () => {
  it('manual sem motivo', () => {
    expect(explicarCenario(null)).toEqual(['Cenário manual: os valores digitados ficam constantes até o resgate.']);
  });
  it('manual por falta de dados: o motivo vem primeiro', () => {
    expect(explicarCenario(null, 'Sem dados do Focus: usando o cenário manual.')).toEqual([
      'Sem dados do Focus: usando o cenário manual.',
      'Cenário manual: os valores digitados ficam constantes até o resgate.',
    ]);
  });
  it('base: medianas do Focus com a data da coleta, premissa e reuniões estimadas', () => {
    const linhas = explicarCenario(cenarioReal('BASE'), undefined, { dataColetaFocus: '2026-09-18' });
    expect(linhas[0]).toBe('Selic e IPCA seguem as medianas do Focus de 18/09/2026.');
    expect(linhas).toContain('A partir de 2031 os números são premissas do app, e o mercado não projeta tão longe.');
    expect(linhas).toContain('As datas de R1/2028, R2/2028, R3/2028, R4/2028, R5/2028 e R6/2028 foram estimadas, porque o BC ainda não publicou o calendário desse ano.');
    expect(linhas.join(' ')).not.toMatch(/desatualizad/);
  });
  it('base sem a data da coleta', () => {
    expect(explicarCenario(cenarioReal('BASE'))[0]).toBe('Selic e IPCA seguem as medianas do Focus.');
  });
  it.each([
    ['SOBEM', 1, 'Juros sobem: Selic e IPCA 1 desvio-padrão acima da mediana do Focus de 18/09/2026.'],
    ['CAEM', 1, 'Juros caem: Selic e IPCA 1 desvio-padrão abaixo da mediana do Focus de 18/09/2026.'],
    ['SOBEM', 1.5, 'Juros sobem: Selic e IPCA 1,5 desvios-padrão acima da mediana do Focus de 18/09/2026.'],
    ['CAEM', 0, 'Juros caem: com 0 desvio-padrão, Selic e IPCA ficam na mediana do Focus de 18/09/2026.'],
  ] as const)('%s com k = %s', (tipo, k, texto) => {
    expect(explicarCenario(cenarioReal(tipo), undefined, { dataColetaFocus: '2026-09-18', k })[0]).toBe(texto);
  });
  it('uma reunião estimada: singular', () => {
    const c = { ...cenarioReal('BASE'), reunioesEstimadas: ['R6/2028'] };
    expect(explicarCenario(c)).toContain('A data de R6/2028 foi estimada, porque o BC ainda não publicou o calendário desse ano.');
  });
  it('reuniões sem data ficam de fora e o texto diz isso', () => {
    const um = { ...cenarioReal('BASE'), reunioesSemData: ['R7/2028'] };
    expect(explicarCenario(um)).toContain('A reunião R7/2028 ficou de fora da projeção, porque não deu para estimar a data.');
    const dois = { ...cenarioReal('BASE'), reunioesSemData: ['R7/2028', 'R8/2028'] };
    expect(explicarCenario(dois)).toContain('As reuniões R7/2028 e R8/2028 ficaram de fora da projeção, porque não deu para estimar as datas.');
  });
  it('Focus defasado', () => {
    expect(explicarCenario(cenarioReal('BASE'), undefined, { focusDefasado: true }))
      .toContain('As consultas do Focus vieram de semanas diferentes, então parte dos números pode estar desatualizada.');
  });
  it('Focus defasado não aparece no manual', () => {
    expect(explicarCenario(null, undefined, { focusDefasado: true }).join(' ')).not.toMatch(/desatualizad/);
  });
});

describe('glossário do M2', () => {
  it('focus, copom, cenário e reinvestimento, com fontes oficiais', () => {
    expect(GLOSSARIO.focus.fonte).toBe('https://www.bcb.gov.br/publicacoes/focus');
    expect(GLOSSARIO.copom.fonte).toBe('https://www.bcb.gov.br/controleinflacao/copom');
    expect(GLOSSARIO.cenario.curto).toMatch(/Focus/);
    expect(GLOSSARIO.reinvestimento.curto).toMatch(/IR/);
    expect(GLOSSARIO.cenario.curto).toBe('O caminho suposto para Selic, CDI e IPCA até o resgate. O cenário base segue as medianas do **Focus**, "juros sobem" e "juros caem" se afastam delas, e o manual usa os valores constantes que você digita.');
    expect(GLOSSARIO.reinvestimento.curto).toBe('Quando uma aplicação vence antes da data comparada, o valor líquido é aplicado de novo, e a contagem do **IR** regressivo recomeça na faixa de 22,5%.');
    for (const id of ['focus', 'copom', 'cenario', 'reinvestimento'] as const) expect(GLOSSARIO[id].fonte).toMatch(/^https:\/\//);
  });
});

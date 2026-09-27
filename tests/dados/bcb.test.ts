import { describe, expect, it } from 'vitest';
import {
  RespostaInvalidaError, interpretarCalendarioCopom, interpretarFocusAnuais, interpretarFocusIpcaMensal, interpretarFocusSelic,
  interpretarSgs, urlCalendarioCopom, urlFocusAnuais, urlFocusIpcaMensal, urlFocusSelic, urlSgsUltimos,
} from '../../src/dados/bcb';
import { anunciosDoCalendario, numerarReunioes } from '../../src/engine/copom';
import { ANUNCIOS_2026_2027 } from '../engine/copomFixture';
import copom from '../fixtures/bcb/copom.json';
import focusAnuais from '../fixtures/bcb/focus-anuais.json';
import focusIpcaMensal from '../fixtures/bcb/focus-ipca-mensal.json';
import focusSelic from '../fixtures/bcb/focus-selic.json';
import sgs226 from '../fixtures/bcb/sgs-226.json';
import sgs432 from '../fixtures/bcb/sgs-432.json';
import sgs433 from '../fixtures/bcb/sgs-433.json';
import sgs4389 from '../fixtures/bcb/sgs-4389.json';

describe('URLs do BCB', () => {
  it('Focus Selic: filtro, ordenação e formato codificados, sem espaço cru nem +', () => {
    const url = urlFocusSelic();
    expect(url).toContain('ExpectativasMercadoSelic');
    expect(url).toContain('baseCalculo%20eq%200');
    expect(url).toContain('%24orderby=Data%20desc');
    expect(url).toContain('%24format=json');
    expect(url).not.toMatch(/[ +]/);
  });
  it('demais URLs sem espaço cru nem +', () => {
    for (const url of [urlFocusIpcaMensal(), urlFocusAnuais(), urlCalendarioCopom('2026-01-01', '2028-12-31'), urlSgsUltimos(433, 12)]) {
      expect(url).not.toMatch(/[ +]/);
    }
    expect(urlSgsUltimos(433, 12)).toBe('https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/12?formato=json');
    expect(urlCalendarioCopom('2026-01-01', '2028-12-31')).toContain("inicioAgenda='2026-01-01'");
  });
});

describe('interpretarSgs', () => {
  it('433: 12 pontos com a data convertida de dd/mm/aaaa', () => {
    const pontos = interpretarSgs(sgs433);
    expect(pontos).toHaveLength(12);
    expect(pontos[0]).toEqual({ data: '2025-09-01', valor: 0.48 });
    expect(pontos[11]).toEqual({ data: '2026-08-01', valor: -0.32 });
  });
  it('432 (preenchida para a frente), 4389 e 226 (com dataFim)', () => {
    expect(interpretarSgs(sgs432)).toEqual([{ data: '2026-11-04', valor: 13.75 }]);
    expect(interpretarSgs(sgs4389)).toEqual([{ data: '2026-09-24', valor: 13.65 }]);
    expect(interpretarSgs(sgs226)).toEqual([{ data: '2026-09-24', valor: 0.1646 }]);
  });
  it('valor não numérico ou vazio → RespostaInvalidaError', () => {
    for (const valor of ['abc', '', ' ']) expect(() => interpretarSgs([{ data: '01/01/2026', valor }])).toThrow(RespostaInvalidaError);
  });
});

describe('interpretarFocusSelic', () => {
  it('só a coleta mais recente (16 reuniões de 2026-09-18, entre 40 linhas)', () => {
    const r = interpretarFocusSelic(focusSelic);
    expect(r.dataColeta).toBe('2026-09-18');
    expect(r.selicPorReuniao).toHaveLength(16);
    for (const l of r.selicPorReuniao) expect(l.reuniao).toMatch(/^R[1-8]\/\d{4}$/);
    expect(r.selicPorReuniao.find((l) => l.reuniao === 'R7/2026')?.est)
      .toEqual({ mediana: 13.625, desvioPadrao: 0.1508, minimo: 13.25, maximo: 14 });
    expect(r.selicPorReuniao.find((l) => l.reuniao === 'R6/2028')?.est)
      .toEqual({ mediana: 10.5, desvioPadrao: 0.8584, minimo: 9, maximo: 12.5 });
  });
  it('desvioPadrao nulo vira 0', () => {
    const json = structuredClone(focusSelic) as { value: { Reuniao: string; Data: string; DesvioPadrao: number | null }[] };
    const linha = json.value.find((l) => l.Data === '2026-09-18' && l.Reuniao === 'R8/2026');
    if (!linha) throw new Error('fixture sem R8/2026');
    linha.DesvioPadrao = null;
    expect(interpretarFocusSelic(json).selicPorReuniao.find((l) => l.reuniao === 'R8/2026')?.est.desvioPadrao).toBe(0);
  });
});

describe('interpretarFocusIpcaMensal', () => {
  it("25 meses da coleta mais recente; '09/2028' vira '2028-09'", () => {
    const r = interpretarFocusIpcaMensal(focusIpcaMensal);
    expect(r.dataColeta).toBe('2026-09-18');
    expect(r.ipcaMensal).toHaveLength(25);
    expect(r.ipcaMensal.find((m) => m.anoMes === '2028-09')?.est)
      .toEqual({ mediana: 0.29, desvioPadrao: 0.1271, minimo: 0.03, maximo: 0.7807 });
    expect(r.ipcaMensal.find((m) => m.anoMes === '2026-09')?.est.mediana).toBe(0.52);
    for (const m of r.ipcaMensal) expect(m.anoMes).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('interpretarFocusAnuais', () => {
  it('separa Selic e IPCA, da coleta mais recente, com ano numérico', () => {
    const r = interpretarFocusAnuais(focusAnuais);
    expect(r.selicAnual.map((a) => a.ano).sort()).toEqual([2026, 2027, 2028, 2029, 2030]);
    expect(r.ipcaAnual.map((a) => a.ano).sort()).toEqual([2026, 2027, 2028, 2029, 2030]);
    expect(r.selicAnual.find((a) => a.ano === 2026)?.est).toEqual({ mediana: 13.5, desvioPadrao: 0.2515, minimo: 13, maximo: 14 });
    expect(r.selicAnual.find((a) => a.ano === 2030)?.est.mediana).toBe(10);
    expect(r.ipcaAnual.find((a) => a.ano === 2026)?.est).toEqual({ mediana: 4.9205, desvioPadrao: 0.2347, minimo: 4.047, maximo: 5.8963 });
    expect(r.ipcaAnual.find((a) => a.ano === 2027)?.est.mediana).toBe(4.3);
  });
  it('sem linhas de um dos indicadores → RespostaInvalidaError', () => {
    const soIpca = { value: focusAnuais.value.filter((l) => l.Indicador === 'IPCA') };
    expect(() => interpretarFocusAnuais(soIpca)).toThrow(RespostaInvalidaError);
  });
});

describe('interpretarCalendarioCopom', () => {
  it('reproduz as datas de anúncio de 2026 e 2027 da spec', () => {
    const dias = interpretarCalendarioCopom(copom);
    expect(dias).toHaveLength(32);
    const reunioes = numerarReunioes(anunciosDoCalendario(dias));
    expect(reunioes.map((r) => r.anuncio)).toEqual(ANUNCIOS_2026_2027);
    expect(reunioes[0]).toEqual({ id: 'R1/2026', anuncio: '2026-01-28', estimada: false });
    expect(reunioes.at(-1)?.id).toBe('R8/2027');
  });
});

describe('JSON fora do esquema', () => {
  const invalidos: unknown[] = [{}, null, { value: [{ Data: 1 }] }];
  it.each(invalidos)('%j → RespostaInvalidaError em todas as fontes', (json) => {
    for (const f of [interpretarSgs, interpretarFocusSelic, interpretarFocusIpcaMensal, interpretarFocusAnuais, interpretarCalendarioCopom]) {
      expect(() => f(json)).toThrow(RespostaInvalidaError);
    }
  });
  it('lista vazia do Focus → RespostaInvalidaError; a mensagem nomeia a fonte', () => {
    expect(() => interpretarFocusSelic({ value: [] })).toThrow('Resposta inesperada de Focus Selic');
  });
});

describe('datas e números estritos', () => {
  type Linha = Record<string, unknown>;
  const comLinha = (json: { value: Linha[] }, muda: (l: Linha) => void) => {
    const copia = structuredClone(json);
    const linha = copia.value[0];
    if (!linha) throw new Error('fixture vazia');
    muda(linha);
    return copia;
  };

  it('SGS: data impossível → RespostaInvalidaError', () => {
    for (const data of ['99/99/2026', '31/02/2026', '00/01/2026']) {
      expect(() => interpretarSgs([{ data, valor: '1.0' }])).toThrow(RespostaInvalidaError);
    }
  });
  it('SGS: valor só decimal', () => {
    for (const valor of ['1e3', '0x10', 'Infinity', '1.', '.5', '+1', '1,5', ' 1']) {
      expect(() => interpretarSgs([{ data: '01/01/2026', valor }]), valor).toThrow(RespostaInvalidaError);
    }
    expect(interpretarSgs([{ data: '01/01/2026', valor: '-0.32' }])).toEqual([{ data: '2026-01-01', valor: -0.32 }]);
    expect(interpretarSgs([{ data: '01/01/2026', valor: '15' }])).toEqual([{ data: '2026-01-01', valor: 15 }]);
  });
  it('Focus: Data impossível → RespostaInvalidaError', () => {
    expect(() => interpretarFocusSelic(comLinha(focusSelic, (l) => { l.Data = '2026-99-99'; }))).toThrow(RespostaInvalidaError);
    expect(() => interpretarFocusIpcaMensal(comLinha(focusIpcaMensal, (l) => { l.Data = '2026-02-30'; }))).toThrow(RespostaInvalidaError);
    expect(() => interpretarFocusAnuais(comLinha(focusAnuais, (l) => { l.Data = '2026-13-01'; }))).toThrow(RespostaInvalidaError);
  });
  it('Focus mensal: DataReferencia com mês entre 01 e 12', () => {
    for (const ref of ['13/2026', '00/2026', '99/2026']) {
      expect(() => interpretarFocusIpcaMensal(comLinha(focusIpcaMensal, (l) => { l.DataReferencia = ref; })), ref).toThrow(RespostaInvalidaError);
    }
    expect(() => interpretarFocusIpcaMensal(comLinha(focusIpcaMensal, (l) => { l.DataReferencia = '12/2026'; }))).not.toThrow();
  });
  it('Focus: Minimo ≤ Mediana ≤ Maximo e DesvioPadrao ≥ 0', () => {
    const casos: ((l: Linha) => void)[] = [
      (l) => { l.Minimo = Number(l.Mediana) + 1; },
      (l) => { l.Maximo = Number(l.Mediana) - 1; },
      (l) => { l.DesvioPadrao = -0.1; },
    ];
    for (const muda of casos) {
      expect(() => interpretarFocusSelic(comLinha(focusSelic, muda))).toThrow(RespostaInvalidaError);
      expect(() => interpretarFocusIpcaMensal(comLinha(focusIpcaMensal, muda))).toThrow(RespostaInvalidaError);
      expect(() => interpretarFocusAnuais(comLinha(focusAnuais, muda))).toThrow(RespostaInvalidaError);
    }
    const iguais = comLinha(focusSelic, (l) => { l.Minimo = l.Mediana; l.Maximo = l.Mediana; l.DesvioPadrao = 0; });
    expect(() => interpretarFocusSelic(iguais)).not.toThrow();
  });
  it('calendário: dataEvento impossível → RespostaInvalidaError', () => {
    expect(() => interpretarCalendarioCopom({ conteudo: [{ dataEvento: '2026-02-30T03:00:00' }] })).toThrow(RespostaInvalidaError);
    expect(interpretarCalendarioCopom({ conteudo: [{ dataEvento: '2026-01-28T03:00:00' }] })).toEqual(['2026-01-28']);
  });
});

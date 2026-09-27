import { describe, expect, it } from 'vitest';
import { anunciosDoCalendario, dataDaReuniao, numerarReunioes, vigenciaDaDecisao } from '../../src/engine/copom';
import { somarDias } from '../../src/engine/datas';
import { ANUNCIOS_2026_2027 } from './copomFixture';

describe('Copom', () => {
  it('anúncio = último dia de cada bloco de dias consecutivos (itens fora de ordem)', () => {
    const itens = ANUNCIOS_2026_2027.flatMap((a) => [a, somarDias(a, -1)]).reverse();
    expect(anunciosDoCalendario(itens)).toEqual(ANUNCIOS_2026_2027);
  });
  it('numera Rn/AAAA pela ordem no ano', () => {
    const r = numerarReunioes(ANUNCIOS_2026_2027);
    expect(r.find((x) => x.id === 'R6/2026')).toEqual({ id: 'R6/2026', anuncio: '2026-09-16', estimada: false });
    expect(r.find((x) => x.id === 'R8/2027')?.anuncio).toBe('2027-12-08');
  });
  it('reunião sem data oficial: mesma reunião do último ano oficial + 52 semanas', () => {
    const oficiais = numerarReunioes(ANUNCIOS_2026_2027);
    expect(dataDaReuniao('R1/2028', oficiais)).toEqual({ id: 'R1/2028', anuncio: '2028-01-26', estimada: true });
    expect(dataDaReuniao('R6/2026', oficiais)?.estimada).toBe(false);
    expect(dataDaReuniao('R9/2026', oficiais)).toBeNull();
    expect(dataDaReuniao('R1/2025', oficiais)).toBeNull(); // antes do calendário conhecido
  });
  it('a decisão vale a partir do dia útil seguinte ao anúncio', () => {
    expect(vigenciaDaDecisao('2026-09-16')).toBe('2026-09-17');
    expect(vigenciaDaDecisao('2026-11-19')).toBe('2026-11-23'); // 20/11 feriado, depois fim de semana
  });
});

import { describe, expect, it } from 'vitest';
import type { Fatia, MotivoFatia } from '../../src/engine/sugestao';
import { AVISO_EDUCATIVO, descreverFatia, licaoDaFatia, textoDaFatia, textoDoFgc } from '../../src/conteudo/sugestao';

const TODOS_OS_MOTIVOS: MotivoFatia[] = [
  'RESERVA_TESOURO_SELIC', 'RESERVA_CDB_LIQUIDEZ', 'DATA_VENCIMENTO_CASADO', 'DATA_SEM_CASAMENTO',
  'LONGO_PRAZO_IPCA', 'LONGO_PRAZO_POS', 'SEM_OBJETIVO_POS', 'SEM_OBJETIVO_PRE', 'SEM_OBJETIVO_IPCA',
];

const fatia = (over: Partial<Fatia>): Fatia => ({
  produto: 'CDB', indexacaoTipo: 'POS_CDI', percentual: 0.5, motivo: 'SEM_OBJETIVO_POS', garantia: 'FGC', valor: 5000, ...over,
});

describe('sugestão — conteúdo', () => {
  it('todo motivo tem texto e lição', () => {
    for (const motivo of TODOS_OS_MOTIVOS) {
      expect(textoDaFatia(fatia({ motivo })).length).toBeGreaterThan(10);
      expect(licaoDaFatia(fatia({ motivo }))).toBeTruthy();
    }
  });
  it('DATA_VENCIMENTO_CASADO liga à lição de marcação a mercado (o motivo de casar o vencimento)', () => {
    expect(licaoDaFatia(fatia({ motivo: 'DATA_VENCIMENTO_CASADO' }))).toBe('marcacao-mercado');
  });
  it('RESERVA_* liga à lição de reserva; LONGO_PRAZO_*/SEM_OBJETIVO_IPCA à de indexadores ou diversificação', () => {
    expect(licaoDaFatia(fatia({ motivo: 'RESERVA_TESOURO_SELIC' }))).toBe('reserva');
    expect(licaoDaFatia(fatia({ motivo: 'RESERVA_CDB_LIQUIDEZ' }))).toBe('reserva');
  });
  it('descreverFatia nomeia o produto genérico, sem inventar taxa', () => {
    expect(descreverFatia(fatia({ produto: 'CDB', indexacaoTipo: 'POS_CDI' }))).toBe('CDB pós-fixado (CDI)');
    expect(descreverFatia(fatia({ produto: 'TESOURO_SELIC', indexacaoTipo: 'SELIC' }))).toBe('Tesouro Selic');
    expect(descreverFatia(fatia({ produto: 'TESOURO_IPCA', indexacaoTipo: 'IPCA_MAIS' }))).toBe('Tesouro IPCA+');
    expect(descreverFatia(fatia({ produto: 'CDB', indexacaoTipo: 'PRE' }))).toBe('CDB prefixado');
  });
  it('textoDoFgc explica o excedente quando presente', () => {
    const f = fatia({ fgc: { conglomerado: 'Banco X', excedente: 12345.6 } });
    expect(textoDoFgc(f)).toMatch(/Banco X/);
    expect(textoDoFgc(f)).toMatch(/R\$\s?12\.345,60/);
  });
  it('sem fgc, textoDoFgc devolve null', () => {
    expect(textoDoFgc(fatia({ fgc: undefined }))).toBeNull();
  });
  it('aviso educativo fixo', () => {
    expect(AVISO_EDUCATIVO.length).toBeGreaterThan(10);
    expect(AVISO_EDUCATIVO).toMatch(/educativo/i);
  });
});

import { describe, expect, it } from 'vitest';
import { DICA_EXPORTAR, DICA_EXTRATO, textoDoExtrato, textoDoHistorico } from '../../src/conteudo/carteira';
import type { HistoricoCarregado } from '../../src/dados/historico';
import type { EstadoHistorico } from '../../src/ui/useHistorico';

const series = { ultimaData: '2026-09-25' } as HistoricoCarregado['series'];
const pronto = (c: Partial<HistoricoCarregado>): EstadoHistorico => ({
  fase: 'pronto',
  carregado: { series, status: 'REDE', faltando: [], limitado: false, inicio: '2025-01-01', ...c } as HistoricoCarregado,
});
const semLacunas = { lacunas: 0, invalido: false };

describe('textos da Carteira', () => {
  it('as dicas do extrato e do exportar', () => {
    expect(DICA_EXTRATO).toBe('O extrato serve para conferir o valor calculado. Se for de até 30 dias atrás, a exposição ao FGC parte dele.');
    expect(DICA_EXPORTAR).toBe('Para guardar uma cópia das posições, use "Exportar ofertas" no Catálogo, que salva as ofertas e as posições no mesmo arquivo.');
  });

  it('extrato: o calculado e a diferença com o sinal', () => {
    const t = textoDoExtrato({ valor: 10_020, data: '2026-09-01', base: 'BRUTO', calculado: 10_000, diferencaPercentual: 0.002, suspeita: false });
    expect(t.replace(/\s/g, ' ')).toBe('Extrato de 01/09/2026 (bruto): R$ 10.020,00. O app calcula R$ 10.000,00 nessa data, uma diferença de +0,2%.');
  });

  it('séries faltando: "CDI de 2025, IPCA de 2025 e 2026"', () => {
    const faltando = [{ serie: 433, ano: 2026 }, { serie: 12, ano: 2025 }, { serie: 433, ano: 2025 }] as HistoricoCarregado['faltando'];
    expect(textoDoHistorico(pronto({ faltando }), semLacunas))
      .toBe('Faltou parte do histórico (CDI de 2025, IPCA de 2025 e 2026), e nesses períodos o valor sai pelo cenário.');
    const tres = [{ serie: 433, ano: 2024 }, { serie: 433, ano: 2025 }, { serie: 433, ano: 2026 }] as HistoricoCarregado['faltando'];
    expect(textoDoHistorico(pronto({ faltando: tres }), semLacunas))
      .toBe('Faltou parte do histórico (IPCA de 2024, 2025 e 2026), e nesses períodos o valor sai pelo cenário.');
  });

  it('lacunas de CDI, no plural e no singular', () => {
    expect(textoDoHistorico(pronto({}), { lacunas: 3, invalido: false }))
      .toBe('Faltaram 3 dias úteis do CDI no histórico, e neles o valor sai pelo cenário.');
    expect(textoDoHistorico(pronto({}), { lacunas: 1, invalido: false }))
      .toBe('Faltou 1 dia útil do CDI no histórico, e nele o valor sai pelo cenário.');
  });
});

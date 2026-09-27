import { describe, expect, it } from 'vitest';
import { GLOSSARIO, type IdTermo } from '../../src/conteudo/glossario';

const TITULOS_PUBLICOS = 'https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/titulos-publicos';
const REGULAMENTO_FGC = 'https://fgc.org.br/documents/d/asset-library-52554/regulamento-fgc';

describe('glossário', () => {
  it('todo termo tem texto curto e fonte https', () => {
    for (const [id, t] of Object.entries(GLOSSARIO)) {
      expect(t.curto.length, id).toBeGreaterThan(20);
      expect(t.fonte, id).toMatch(/^https:\/\//);
    }
  });
  it('marcação a mercado, com fonte oficial de títulos públicos', () => {
    const t = GLOSSARIO['marcacao-mercado'];
    expect(t.termo).toBe('Marcação a mercado');
    expect(t.curto).toMatch(/vencimento/);
    expect(t.fonte).toBe(TITULOS_PUBLICOS);
  });
  it('usa as fontes verificadas', () => {
    const esperadas: Partial<Record<IdTermo, string>> = {
      cdi: 'https://www.b3.com.br/pt_br/market-data-e-indices/indices/indices-de-segmentos-e-setoriais/di/metodologia-de-apuracao-da-taxa/',
      'dias-uteis': 'https://www.b3.com.br/pt_br/market-data-e-indices/indices/indices-de-segmentos-e-setoriais/di/metodologia-de-calculo-do-indice-di/',
      liquidez: 'https://www.gov.br/investidor/pt-br/investir/antes-de-investir/entenda-as-caracteristicas-dos-investimentos/liquidez',
      tesouro: TITULOS_PUBLICOS, prefixado: TITULOS_PUBLICOS, 'pos-fixado': TITULOS_PUBLICOS,
      'ipca-mais': TITULOS_PUBLICOS, 'marcacao-mercado': TITULOS_PUBLICOS,
      cdb: REGULAMENTO_FGC, fgc: REGULAMENTO_FGC,
      'lci-lca': 'https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/titulos-bancarios/letra-de-credito-imobiliario-lci-e-letra-de-credito-do-agronegocio-lca',
      'prazo-minimo': 'https://normativos.bcb.gov.br/Lists/Normativos/Attachments/48547/Res_4410_v6_P.pdf',
    };
    for (const [id, url] of Object.entries(esperadas)) expect(GLOSSARIO[id as IdTermo].fonte, id).toBe(url);
  });
  it('selic sem periodicidade não confirmada', () => {
    expect(GLOSSARIO.selic.curto).toMatch(/nas reuniões do Copom/);
    expect(GLOSSARIO.selic.curto).not.toMatch(/45 dias/);
  });
  it('custódia descontada em resgate, vencimento ou juros', () => {
    expect(GLOSSARIO.custodia.curto).toMatch(/descontados quando há resgate, vencimento ou pagamento de juros/);
  });
  it('prazo mínimo detalha a LCI atualizada mensalmente pela inflação', () => {
    expect(GLOSSARIO['prazo-minimo'].curto).toMatch(/6 meses nas pós e prefixadas; LCI atualizada mensalmente pela inflação, 36 meses/);
  });
});

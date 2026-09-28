import { describe, expect, it } from 'vitest';
import { codificar, decodificar, type EstadoCompartilhado } from '../../src/armazenamento/link';
import { PREMISSAS_PADRAO } from '../../src/engine/projecao';

// As posições são da pessoa (quanto tem e onde): nunca vão para o link compartilhável (plano M3a, B2; M3c, B1).
const OFERTA = {
  produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.1 }, emissor: 'Banco Alfa', conglomerado: 'Alfa',
  vencimento: '2028-09-28', liquidez: 'NO_VENCIMENTO',
} as const;
const POSICAO = {
  ...OFERTA, id: 'p-1', valorAplicado: 54321, dataAplicacao: '2025-01-10', valorExtrato: 60000,
  dataExtrato: '2026-09-01', baseExtrato: 'BRUTO', eventos: [],
};

async function jsonDoLink(fragmento: string): Promise<string> {
  const base64 = fragmento.slice(3).replaceAll('-', '+').replaceAll('_', '/');
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  if (fragmento.startsWith('j1.')) return new TextDecoder().decode(bytes);
  const saida = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(saida).text();
}

describe('link compartilhável', () => {
  it('o serializador do link não inclui posicoes, nem por engano no objeto de entrada', async () => {
    const comPosicoes = {
      versao: 1,
      // Por engano: uma posição no lugar de uma oferta, e a lista de posições na raiz e no cenário.
      ofertas: [OFERTA, POSICAO],
      valor: 10000, dataAplicacao: '2026-09-28',
      regra: { tipo: 'PADRAO' },
      cenario: { escolha: 'BASE', premissas: PREMISSAS_PADRAO, manual: { cdi: 14.15, selicMeta: 15, ipca: 5, tr: 0.2 }, posicoes: [POSICAO] },
      posicoes: [POSICAO],
    } as unknown as EstadoCompartilhado;

    const fragmento = await codificar(comPosicoes);
    const json = await jsonDoLink(fragmento);
    expect(json).not.toMatch(/posic/i);
    for (const campo of ['valorAplicado', 'valorExtrato', 'dataExtrato', 'baseExtrato', 'eventos', '54321', '"id"', 'p-1']) {
      expect(json).not.toContain(campo);
    }

    const r = await decodificar(fragmento);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.estado).not.toHaveProperty('posicoes');
    expect(r.estado.cenario).not.toHaveProperty('posicoes');
    for (const o of r.estado.ofertas) {
      expect(Object.keys(o).sort()).toEqual(['conglomerado', 'emissor', 'indexacao', 'liquidez', 'produto', 'vencimento']);
    }
  });

  it('um link com posicoes (feito à mão) é recusado', async () => {
    const json = JSON.stringify({
      versao: 1, ofertas: [OFERTA, OFERTA], valor: 10000, dataAplicacao: '2026-09-28', regra: { tipo: 'PADRAO' },
      cenario: { escolha: 'BASE', premissas: PREMISSAS_PADRAO, manual: { cdi: 14.15, selicMeta: 15, ipca: 5, tr: 0.2 } },
      posicoes: [POSICAO],
    });
    const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(json))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    expect((await decodificar(`j1.${base64}`)).ok).toBe(false);
  });
});

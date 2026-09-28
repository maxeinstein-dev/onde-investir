import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LIMITE_DESCOMPRIMIDO, LIMITE_FRAGMENTO, codificar, decodificar, lerLimitado, type EstadoCompartilhado,
} from '../../src/armazenamento/link';
import { PREMISSAS_PADRAO } from '../../src/engine/projecao';

afterEach(() => vi.unstubAllGlobals());

const CDB = {
  produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.1 }, emissor: 'Banco Alfa', conglomerado: 'Alfa',
  vencimento: '2028-09-28', liquidez: 'NO_VENCIMENTO',
} as const;
const LCI = {
  produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.92 }, emissor: 'Banco Beta', conglomerado: 'Beta',
  vencimento: '2028-09-28', liquidez: 'NO_VENCIMENTO',
} as const;
const TESOURO = {
  produto: 'TESOURO_IPCA', indexacao: { tipo: 'IPCA_MAIS', taxaRealAA: 0.0712 }, emissor: 'Tesouro Nacional',
  conglomerado: 'Tesouro Nacional', vencimento: '2035-05-15', liquidez: 'DIARIA',
} as const;
const PRE = {
  produto: 'CDB', indexacao: { tipo: 'PRE', taxaAA: 0.1315 }, emissor: 'Banco Gama Investimentos', conglomerado: 'Gama',
  vencimento: '2029-03-15', liquidez: 'NO_VENCIMENTO', custoExtraAA: 0.002,
} as const;
const POUPANCA = {
  produto: 'POUPANCA', indexacao: { tipo: 'POUPANCA' }, emissor: 'Caixa Econômica Federal', conglomerado: 'Caixa',
  liquidez: 'DIARIA',
} as const;

const ESTADO: EstadoCompartilhado = {
  versao: 1,
  ofertas: [CDB, LCI, TESOURO],
  valor: 10000,
  dataAplicacao: '2026-09-28',
  suaData: '2028-09-28',
  regra: { tipo: 'TAXA_FIXA', taxaAA: 0.12 },
  cenario: {
    escolha: 'MANUAL', premissas: PREMISSAS_PADRAO, manual: { cdi: 14.15, selicMeta: 15, ipca: 5, tr: 0.2 },
  },
};

// --- ajudantes do teste (independentes do código de produção) ---
const paraBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const deBase64Url = (s: string): Uint8Array =>
  Uint8Array.from(atob(s.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));
async function comprimir(bytes: Uint8Array): Promise<Uint8Array> {
  const saida = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(saida).arrayBuffer());
}
async function descomprimir(bytes: Uint8Array): Promise<string> {
  const saida = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(saida).text();
}
const j1 = (obj: unknown) => `j1.${paraBase64Url(new TextEncoder().encode(JSON.stringify(obj)))}`;
const c1 = async (obj: unknown) => `c1.${paraBase64Url(await comprimir(new TextEncoder().encode(JSON.stringify(obj))))}`;

/** `n` bytes de zeros comprimidos em deflate-raw, sem montar os `n` bytes de uma vez. */
async function zerosComprimidos(n: number): Promise<Uint8Array> {
  const bloco = new Uint8Array(1 << 20);
  let faltam = n;
  const fonte = new ReadableStream<BufferSource>({
    pull(ctl) {
      if (faltam <= 0) { ctl.close(); return; }
      const t = Math.min(faltam, bloco.length);
      ctl.enqueue(bloco.subarray(0, t));
      faltam -= t;
    },
  });
  return new Uint8Array(await new Response(fonte.pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
}

describe('link compartilhável: codificar e decodificar', () => {
  it('ida e volta: c1. + base64url, e o estado volta igual', async () => {
    const f = await codificar(ESTADO);
    expect(f).toMatch(/^c1\.[A-Za-z0-9_-]+$/);
    expect(await decodificar(f)).toEqual({ ok: true, estado: ESTADO });
  });

  it('ida e volta sem suaData, com regra PADRAO e custo extra', async () => {
    const e: EstadoCompartilhado = { ...ESTADO, ofertas: [PRE, POUPANCA], regra: { tipo: 'PADRAO' }, suaData: undefined };
    delete (e as { suaData?: string }).suaData;
    expect(await decodificar(await codificar(e))).toEqual({ ok: true, estado: e });
  });

  it('o c1. é o JSON em deflate-raw (compatível com qualquer DecompressionStream)', async () => {
    const f = await codificar(ESTADO);
    expect(JSON.parse(await descomprimir(deBase64Url(f.slice(3))))).toEqual(ESTADO);
  });

  it('sem CompressionStream, codifica em j1. (JSON em base64url), e o j1. é aceito', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    const f = await codificar(ESTADO);
    expect(f).toMatch(/^j1\.[A-Za-z0-9_-]+$/);
    vi.unstubAllGlobals();
    expect(await decodificar(f)).toEqual({ ok: true, estado: ESTADO });
    expect(await decodificar(j1(ESTADO))).toEqual({ ok: true, estado: ESTADO });
  });

  it('sem DecompressionStream, um c1. é recusado com mensagem (sem lançar)', async () => {
    const f = await codificar(ESTADO);
    vi.stubGlobal('DecompressionStream', undefined);
    const r = await decodificar(f);
    expect(r.ok).toBe(false);
  });

  it('tamanho típico do link: 3 e 5 ofertas cabem com folga no limite', async () => {
    const tres = await codificar(ESTADO);
    const cinco = await codificar({ ...ESTADO, ofertas: [CDB, LCI, TESOURO, PRE, POUPANCA] });
    console.info(`link com 3 ofertas: ${tres.length} caracteres; com 5 ofertas: ${cinco.length} caracteres`);
    expect(tres.length).toBeLessThan(1000);
    expect(cinco.length).toBeLessThan(1500);
  });

  it('codificar recusa estado inválido (a UI nunca gera link que não abre)', async () => {
    await expect(codificar({ ...ESTADO, ofertas: [CDB] })).rejects.toThrow();
  });
});

describe('link compartilhável: entradas hostis (spec §7.2)', () => {
  const recusa = async (f: string) => {
    const r = await decodificar(f);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).not.toBe('');
  };

  it('prefixo desconhecido, vazio ou sem payload', async () => {
    await recusa('');
    await recusa('x1.abc');
    await recusa('c1.');
    await recusa('j1.');
    await recusa('c2.abc');
  });

  it('base64 inválido', async () => {
    await recusa('j1.@@@@');
    await recusa('c1.a+b/c=');
    await recusa('j1.a');
  });

  it('fragmento adulterado ou truncado', async () => {
    const f = await codificar(ESTADO);
    const meio = Math.floor(f.length / 2);
    const trocado = f[meio] === 'A' ? 'B' : 'A';
    await recusa(f.slice(0, meio) + trocado + f.slice(meio + 1));
    await recusa(f.slice(0, meio));
    await recusa(`c1.${paraBase64Url(new TextEncoder().encode('isto não é deflate'))}`);
  });

  it('JSON inválido e UTF-8 inválido', async () => {
    await recusa(`j1.${paraBase64Url(new TextEncoder().encode('{"versao":1,'))}`);
    await recusa(`j1.${paraBase64Url(new Uint8Array([0xff, 0xfe, 0xfd]))}`);
  });

  it(`fragmento acima de ${LIMITE_FRAGMENTO} caracteres, recusado antes de decodificar`, async () => {
    await recusa(`j1.${'A'.repeat(LIMITE_FRAGMENTO)}`);
  });

  it('campo extra recusado, na raiz, na oferta, na indexação, na regra e no cenário', async () => {
    await recusa(j1({ ...ESTADO, extra: 1 }));
    await recusa(j1({ ...ESTADO, ofertas: [{ ...CDB, id: 'o-1' }, LCI] }));
    await recusa(j1({ ...ESTADO, ofertas: [{ ...CDB, indexacao: { ...CDB.indexacao, x: 1 } }, LCI] }));
    await recusa(j1({ ...ESTADO, regra: { tipo: 'PADRAO', taxaAA: 0.1 } }));
    await recusa(j1({ ...ESTADO, cenario: { ...ESTADO.cenario, focus: true } }));
    await recusa(j1({ ...ESTADO, cenario: { ...ESTADO.cenario, premissas: { ...PREMISSAS_PADRAO, y: 2 } } }));
  });

  it('6 ofertas e 1 oferta recusadas (2 a 5)', async () => {
    await recusa(j1({ ...ESTADO, ofertas: [CDB, LCI, TESOURO, PRE, POUPANCA, CDB] }));
    await recusa(j1({ ...ESTADO, ofertas: [CDB] }));
  });

  it('versão desconhecida recusada', async () => {
    await recusa(j1({ ...ESTADO, versao: 2 }));
    const { versao: _versao, ...semVersao } = ESTADO;
    void _versao;
    await recusa(j1(semVersao));
  });

  it('oferta que o engine recusa (indexação do produto, poupança com vencimento, emissor vazio)', async () => {
    await recusa(j1({ ...ESTADO, ofertas: [{ ...CDB, indexacao: { tipo: 'SELIC' } }, LCI] }));
    await recusa(j1({ ...ESTADO, ofertas: [{ ...POUPANCA, vencimento: '2030-01-01' }, LCI] }));
    await recusa(j1({ ...ESTADO, ofertas: [{ ...CDB, emissor: '   ' }, LCI] }));
  });

  it('textos com mais de 80 caracteres recusados', async () => {
    await recusa(j1({ ...ESTADO, ofertas: [{ ...CDB, emissor: 'x'.repeat(81) }, LCI] }));
    await recusa(j1({ ...ESTADO, ofertas: [{ ...CDB, conglomerado: 'x'.repeat(81) }, LCI] }));
  });

  it('valores fora da faixa: valor, datas, regra, premissas e cenário manual', async () => {
    await recusa(j1({ ...ESTADO, valor: 0 }));
    await recusa(j1({ ...ESTADO, valor: -10 }));
    await recusa(j1({ ...ESTADO, valor: '10000' }));
    await recusa(j1({ ...ESTADO, dataAplicacao: '2026-02-30' }));
    await recusa(j1({ ...ESTADO, suaData: 'amanhã' }));
    await recusa(j1({ ...ESTADO, regra: { tipo: 'TAXA_FIXA', taxaAA: 5 } }));
    await recusa(j1({ ...ESTADO, regra: { tipo: 'OUTRA' } }));
    await recusa(j1({ ...ESTADO, cenario: { ...ESTADO.cenario, escolha: 'OTIMISTA' } }));
    await recusa(j1({ ...ESTADO, cenario: { ...ESTADO.cenario, premissas: { ...PREMISSAS_PADRAO, anosConvergencia: 99 } } }));
    await recusa(j1({ ...ESTADO, cenario: { ...ESTADO.cenario, manual: { cdi: -150, selicMeta: 15, ipca: 5, tr: 0.2 } } }));
  });

  it('HTML nos textos passa como texto (a renderização escapa), sem mudar nada', async () => {
    const comHtml = { ...ESTADO, ofertas: [{ ...CDB, emissor: '<img src=x onerror=alert(1)>' }, LCI] };
    expect(await decodificar(await codificar(comHtml))).toEqual({ ok: true, estado: comHtml });
  });

  it('zip bomb dentro do limite de caracteres: recusado pela descompressão limitada', async () => {
    // O maior bloco de zeros que ainda cabe em 8.000 caracteres: passa do tamanho e chega à descompressão.
    const bomba = await zerosComprimidos(5 * 1024 * 1024);
    const f = `c1.${paraBase64Url(bomba)}`;
    expect(f.length).toBeLessThanOrEqual(LIMITE_FRAGMENTO);
    const r = await decodificar(f);
    expect(r).toEqual({ ok: false, erro: expect.stringContaining('64 KB') });
  });

  it('zip bomb de 16 MB de zeros: recusada em menos de 1 s, sem descomprimir tudo', async () => {
    const bomba = await zerosComprimidos(16 * 1024 * 1024);
    // Pelo decodificar, a bomba inteira nem chega à descompressão: passa do limite de caracteres.
    const f = `c1.${paraBase64Url(bomba)}`;
    expect(f.length).toBeGreaterThan(LIMITE_FRAGMENTO);
    expect(await decodificar(f)).toEqual({ ok: false, erro: expect.stringContaining('8000') });

    // Direto na leitura limitada: conta quantos bytes descomprimidos saíram do descompressor.
    let produzidos = 0;
    const contador = new TransformStream<Uint8Array, Uint8Array>({
      transform(pedaco, ctl) { produzidos += pedaco.byteLength; ctl.enqueue(pedaco); },
    });
    const inicio = performance.now();
    const saida = new Blob([bomba as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).pipeThrough(contador);
    const r = await lerLimitado(saida, LIMITE_DESCOMPRIMIDO);
    const ms = performance.now() - inicio;
    console.info(`zip bomb de 16 MB (${bomba.length} bytes comprimidos): recusada em ${ms.toFixed(1)} ms, com ${produzidos} bytes descomprimidos`);
    expect(r).toBeNull();
    expect(ms).toBeLessThan(1000);
    // Parou cedo: bem menos de 1 MB descomprimido dos 16 MB.
    expect(produzidos).toBeLessThan(1024 * 1024);
  });

  it('lerLimitado devolve os bytes quando cabem no limite', async () => {
    const r = await lerLimitado(new Blob([new Uint8Array(1000)]).stream(), LIMITE_DESCOMPRIMIDO);
    expect(r?.byteLength).toBe(1000);
  });

  it('decodificar nunca lança, nem com lixo de todo tipo', async () => {
    for (const f of ['c1.' + 'A'.repeat(100), 'j1.bnVsbA', 'j1.W10', 'j1.MQ', 'j1.Il8i', await c1(null), await c1([ESTADO])]) {
      await recusa(f);
    }
  });
});

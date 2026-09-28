// @vitest-environment jsdom
// O Comparador no M3c, C2: dicas contextuais acima do resultado, "Ver lição" nos alertas e o botão de compartilhar.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { decodificar, lerEstadoDoHash } from '../../src/armazenamento/link';
import { PREFERENCIAS_PADRAO } from '../../src/armazenamento/preferencias';
import { DICAS } from '../../src/conteudo/dicas';
import type { OfertaCadastrada } from '../../src/engine/ofertas';
import { Comparador, type PropsComparador } from '../../src/ui/comparacao/Comparador';
import { CEN, INI } from '../engine/cenarioPadrao';
import { graficos } from './graficos/mockChart';

vi.mock('chart.js', () => import('./graficos/mockChart'));
vi.mock('chartjs-plugin-annotation', () => ({ default: { id: 'annotation' } }));

afterEach(() => {
  cleanup();
  graficos.length = 0;
  vi.unstubAllGlobals();
});
beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, '', '/app/');
});

const lci: OfertaCadastrada = {
  id: 'l', emissor: 'Banco L', conglomerado: 'L', produto: 'LCI', liquidez: 'DIARIA', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.9 },
  vencimento: '2031-09-29',
};
const prefixado: OfertaCadastrada = {
  id: 't', emissor: 'Tesouro Nacional', conglomerado: 'Tesouro Nacional', produto: 'TESOURO_PREFIXADO', liquidez: 'DIARIA',
  indexacao: { tipo: 'PRE', taxaAA: 0.13 }, vencimento: '2032-01-01',
};
const poupanca: OfertaCadastrada = { id: 'p', emissor: 'Banco P', conglomerado: 'P', produto: 'POUPANCA', liquidez: 'DIARIA', indexacao: { tipo: 'POUPANCA' } };
const cdb: OfertaCadastrada = { id: 'c', emissor: 'Banco C', conglomerado: 'C', produto: 'CDB', liquidez: 'DIARIA', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.1 } };

function montar(catalogo: OfertaCadastrada[], props: Partial<PropsComparador> = {}) {
  return render(
    <Comparador catalogo={catalogo} selecao={catalogo.map((o) => o.id)} onMudarSelecao={() => {}} onCriarOferta={() => {}}
      cenario={CEN} descricaoCenario="Cenário de teste." inicial={{ valor: 10_000, dataAplicacao: INI, regra: { tipo: 'PADRAO' } }} {...props} />,
  );
}
function compararDireto() {
  fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
  fireEvent.click(screen.getByRole('button', { name: /pular/i }));
}
const dica = (id: string) => DICAS.find((d) => d.id === id)?.texto ?? '';
const secaoDicas = () => screen.queryByRole('complementary', { name: 'Dicas' });
const resultado = () => screen.getByRole('heading', { name: 'Resultado da comparação' }).closest('section') as HTMLElement;

describe('Comparador: dicas contextuais', () => {
  it('só com o resultado: no máximo 2, pela prioridade, acima do resultado', () => {
    montar([lci, prefixado, poupanca]);
    expect(secaoDicas()).toBeNull();
    compararDireto();
    const secao = secaoDicas() as HTMLElement;
    const itens = within(secao).getAllByRole('listitem');
    expect(itens).toHaveLength(2);
    expect(itens[0]).toHaveTextContent(dica('dica-prazo-minimo'));
    expect(itens[1]).toHaveTextContent(dica('dica-marcacao'));
    expect(secao.compareDocumentPosition(resultado()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('"Ver lição" leva à lição da dica', () => {
    const onVerLicao = vi.fn();
    montar([lci, cdb], { onVerLicao });
    compararDireto();
    const link = within(secaoDicas() as HTMLElement).getAllByRole('link', { name: /^Ver lição: / })[0] as HTMLElement;
    expect(link).toHaveAttribute('href', '#aprender/liquidez');
    fireEvent.click(link);
    expect(onVerLicao).toHaveBeenCalledWith('liquidez');
  });
  it('"Dispensar" avisa quem grava; a dispensada some e a próxima entra no lugar', () => {
    const onDispensarDica = vi.fn();
    const { rerender } = montar([lci, prefixado, poupanca], { onDispensarDica });
    compararDireto();
    fireEvent.click(within(secaoDicas() as HTMLElement).getByRole('button', { name: 'Dispensar a dica 1' }));
    expect(onDispensarDica).toHaveBeenCalledWith('dica-prazo-minimo');
    rerender(
      <Comparador catalogo={[lci, prefixado, poupanca]} selecao={['l', 't', 'p']} onMudarSelecao={() => {}} onCriarOferta={() => {}}
        cenario={CEN} descricaoCenario="Cenário de teste." inicial={{ valor: 10_000, dataAplicacao: INI, regra: { tipo: 'PADRAO' } }}
        onDispensarDica={onDispensarDica} dicasDispensadas={['dica-prazo-minimo']} />,
    );
    const itens = within(secaoDicas() as HTMLElement).getAllByRole('listitem');
    expect(itens.map((i) => i.textContent)).toEqual([
      expect.stringContaining(dica('dica-marcacao')), expect.stringContaining(dica('dica-aniversario')),
    ]);
  });
  it('dispensar a última leva o foco ao título do resultado', async () => {
    const { rerender } = montar([poupanca, cdb], { onDispensarDica: () => {} });
    compararDireto();
    fireEvent.click(within(secaoDicas() as HTMLElement).getByRole('button', { name: 'Dispensar a dica 1' }));
    rerender(
      <Comparador catalogo={[poupanca, cdb]} selecao={['p', 'c']} onMudarSelecao={() => {}} onCriarOferta={() => {}}
        cenario={CEN} descricaoCenario="Cenário de teste." inicial={{ valor: 10_000, dataAplicacao: INI, regra: { tipo: 'PADRAO' } }}
        onDispensarDica={() => {}} dicasDispensadas={['dica-aniversario', 'dica-um-indexador']} />,
    );
    expect(secaoDicas()).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Resultado da comparação' })));
  });
});

describe('Comparador: "Ver lição" nos alertas', () => {
  it('o alerta da comparação ganha o link da lição', () => {
    const onVerLicao = vi.fn();
    montar([lci, cdb], { onVerLicao, inicial: { valor: 10_000, dataAplicacao: INI, suaData: '2026-12-28', regra: { tipo: 'PADRAO' } } });
    compararDireto();
    const alertas = screen.getByRole('region', { name: 'Alertas' });
    const link = within(alertas).getAllByRole('link', { name: /^Ver lição: / })[0] as HTMLElement;
    fireEvent.click(link);
    expect(onVerLicao).toHaveBeenCalled();
  });
});

/** O `navigator.clipboard` do teste (o jsdom não tem); undefined = navegador sem a API. */
function comClipboard(valor: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value: valor, configurable: true });
  onTestFinished(() => { Reflect.deleteProperty(navigator, 'clipboard'); });
}
function semId(o: OfertaCadastrada): Omit<OfertaCadastrada, 'id'> {
  const copia: Partial<OfertaCadastrada> = { ...o };
  delete copia.id;
  return copia as Omit<OfertaCadastrada, 'id'>;
}

describe('Comparador: compartilhar', () => {
  const cenarioDoLink = { escolha: 'MANUAL' as const, premissas: PREFERENCIAS_PADRAO.premissas, manual: PREFERENCIAS_PADRAO.manual };
  const URL_BASE = `${location.origin}/app/#comparar/`;

  it('sem o cenário do link, não há botão', () => {
    montar([lci, cdb]);
    compararDireto();
    expect(screen.queryByRole('button', { name: 'Compartilhar esta comparação' })).toBeNull();
  });
  it('copia o link com a comparação completa e avisa que a carteira não vai', async () => {
    const writeText = vi.fn(async () => {});
    comClipboard({ writeText });
    montar([lci, cdb], { cenarioDoLink, inicial: { valor: 7_500, dataAplicacao: INI, suaData: '2027-09-28', regra: { tipo: 'CDI_100' } } });
    compararDireto();
    const status = within(resultado()).getByRole('status');
    fireEvent.click(screen.getByRole('button', { name: 'Compartilhar esta comparação' }));
    await waitFor(() => expect(status).toHaveTextContent('Link copiado. Ele leva as ofertas, o valor, as datas e o cenário, sem a sua carteira.'));
    expect(writeText).toHaveBeenCalledTimes(1);
    const url = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(url.startsWith(URL_BASE)).toBe(true);
    const r = await decodificar(lerEstadoDoHash(url.slice(url.indexOf('#'))) ?? '');
    if (!r.ok) throw new Error(r.erro);
    expect(r.estado).toEqual({
      versao: 1,
      ofertas: [lci, cdb].map(semId),
      valor: 7_500, dataAplicacao: INI, suaData: '2027-09-28', regra: { tipo: 'CDI_100' }, cenario: cenarioDoLink,
    });
  });
  it('sem clipboard, mostra o link num campo somente leitura, selecionado', async () => {
    comClipboard(undefined);
    montar([lci, cdb], { cenarioDoLink });
    compararDireto();
    fireEvent.click(screen.getByRole('button', { name: 'Compartilhar esta comparação' }));
    const campo = await screen.findByRole('textbox', { name: 'Link da comparação' }) as HTMLInputElement;
    expect(campo).toHaveAttribute('readonly');
    expect(campo.value.startsWith(URL_BASE)).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(campo));
    expect(campo.selectionStart).toBe(0);
    expect(campo.selectionEnd).toBe(campo.value.length);
    expect(within(resultado()).getByRole('status')).toHaveTextContent('Copie o link abaixo. Ele leva as ofertas, o valor, as datas e o cenário, sem a sua carteira.');
  });
  it('se a cópia falhar (permissão negada), também cai no campo', async () => {
    comClipboard({ writeText: vi.fn(async () => { throw new DOMException('negado', 'NotAllowedError'); }) });
    montar([lci, cdb], { cenarioDoLink });
    compararDireto();
    fireEvent.click(screen.getByRole('button', { name: 'Compartilhar esta comparação' }));
    expect(await screen.findByRole('textbox', { name: 'Link da comparação' })).toBeInTheDocument();
  });
});

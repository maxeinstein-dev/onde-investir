// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { textoDoAlerta } from '../../src/conteudo/alertas';
import type { Alerta } from '../../src/engine/alertas';
import { horizontesPadrao } from '../../src/engine/comparacao';
import type { OfertaCadastrada } from '../../src/engine/ofertas';
import { Alertas } from '../../src/ui/comparacao/Alertas';
import { INI } from '../engine/cenarioPadrao';

afterEach(cleanup);

const base = { emissor: 'Banco B', conglomerado: 'B' };
const cdb: OfertaCadastrada = { ...base, id: '1', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, vencimento: '2031-09-28', liquidez: 'NO_VENCIMENTO' };
const diario: OfertaCadastrada = { ...base, id: '2', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.028 }, liquidez: 'DIARIA' };
const OFERTAS = [cdb, diario];
const HORIZONTES = horizontesPadrao(INI, null);
const ALERTAS: Alerta[] = [
  { tipo: 'QUASE_EMPATE', horizonte: '2031-09-28', lider: 0, lideres: [0], alternativa: 1, diferenca: 35.5, diferencaPercentual: 0.0023, vantagem: 'LIQUIDEZ' },
  { tipo: 'IOF', oferta: 1, horizonte: '2031-09-28', iof: 1.2 },
];

describe('Alertas', () => {
  it('uma lista (role="list") com um cartão por alerta: título, o que acontece, por quê e "Saiba mais"', () => {
    render(<Alertas alertas={ALERTAS} ofertas={OFERTAS} horizontes={HORIZONTES} />);
    const secao = screen.getByRole('region', { name: 'Alertas' });
    const itens = within(within(secao).getByRole('list')).getAllByRole('listitem');
    expect(itens).toHaveLength(2);
    const t = textoDoAlerta(ALERTAS[0] as Alerta, OFERTAS, HORIZONTES);
    const primeiro = itens[0] as HTMLElement;
    expect(within(primeiro).getByRole('heading', { name: t.titulo })).toBeInTheDocument();
    // O R$ vem com NBSP, e o toHaveTextContent só normaliza os espaços do texto na tela.
    const espacos = (x: string) => x.replace(/\s+/g, ' ');
    const [oQue, porQue] = [...primeiro.querySelectorAll('p')];
    expect(oQue).toHaveTextContent(espacos(t.oQue));
    expect(porQue).toHaveTextContent(espacos(t.porQue));
    expect(within(primeiro).getByRole('button', { name: 'Saiba mais sobre Liquidez' })).toBeInTheDocument();
    expect(within(itens[1] as HTMLElement).getByRole('button', { name: 'Saiba mais sobre IOF' })).toBeInTheDocument();
  });

  it('não interrompe: nada de role="alert", de foco automático nem de tabindex', () => {
    const { container } = render(<Alertas alertas={ALERTAS} ofertas={OFERTAS} horizontes={HORIZONTES} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(container.querySelector('[tabindex], [autofocus], [aria-live]')).toBeNull();
    expect(container.contains(document.activeElement)).toBe(false);
  });

  it('sem alertas, nada aparece', () => {
    const { container } = render(<Alertas alertas={[]} ofertas={OFERTAS} horizontes={HORIZONTES} />);
    expect(container).toBeEmptyDOMElement();
  });
});

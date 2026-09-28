// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it } from 'vitest';
import type { OfertaCadastrada } from '../../src/engine/ofertas';
import { TabelaComparacao } from '../../src/ui/comparacao/TabelaComparacao';
import { MinhasOfertas } from '../../src/ui/ofertas/MinhasOfertas';

afterEach(cleanup);

const cdb: OfertaCadastrada = {
  id: 'cdb', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, emissor: 'Banco X', conglomerado: 'Grupo X',
  vencimento: '2027-09-28', liquidez: 'NO_VENCIMENTO',
};
const comCusto: OfertaCadastrada = { ...cdb, id: 'custo', emissor: 'Corretora Y', custoExtraAA: 0.005 };

function ComEstado({ inicial = [], aoMudar }: { inicial?: OfertaCadastrada[]; aoMudar: (o: OfertaCadastrada[]) => void }) {
  const [ofertas, setOfertas] = useState(inicial);
  return <MinhasOfertas ofertas={ofertas} gerarId={() => 'novo'} onChange={(o) => { setOfertas(o); aoMudar(o); }} />;
}

const preencher = (rotulo: string | RegExp, valor: string) => fireEvent.input(screen.getByLabelText(rotulo), { target: { value: valor } });

describe('custo extra no formulário de oferta', () => {
  it('tem o campo opcional, com a explicação curta', () => {
    render(<ComEstado aoMudar={() => {}} />);
    const campo = screen.getByLabelText('Custo extra (% ao ano, opcional)');
    expect(campo).toHaveAccessibleDescription(/Tarifa cobrada pela corretora, se houver\. Na renda fixa bancária costuma ser zero\./);
  });
  it('grava o custo em fração ao ano', () => {
    let salvas: OfertaCadastrada[] = [];
    render(<ComEstado aoMudar={(o) => { salvas = o; }} />);
    preencher('Emissor', 'Banco Z');
    preencher('Conglomerado', 'Grupo Z');
    preencher('Custo extra (% ao ano, opcional)', '0.3');
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar oferta' }));
    expect(salvas[0]?.custoExtraAA).toBeCloseTo(0.003, 12);
  });
  it('vazio não grava o campo', () => {
    let salvas: OfertaCadastrada[] = [];
    render(<ComEstado aoMudar={(o) => { salvas = o; }} />);
    preencher('Emissor', 'Banco Z');
    preencher('Conglomerado', 'Grupo Z');
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar oferta' }));
    expect(salvas[0]).not.toHaveProperty('custoExtraAA');
  });
  it('acima de 5% ao ano: a mensagem do engine, e nada é salvo', () => {
    let salvas: OfertaCadastrada[] = [];
    render(<ComEstado aoMudar={(o) => { salvas = o; }} />);
    preencher('Emissor', 'Banco Z');
    preencher('Conglomerado', 'Grupo Z');
    preencher('Custo extra (% ao ano, opcional)', '6');
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar oferta' }));
    expect(screen.getByRole('alert')).toHaveTextContent('O custo extra precisa ficar entre 0 e 5% ao ano.');
    expect(salvas).toEqual([]);
  });
  it('editar uma oferta com custo não perde o custo (nem trocando o produto)', () => {
    let salvas: OfertaCadastrada[] = [];
    render(<ComEstado inicial={[comCusto]} aoMudar={(o) => { salvas = o; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(screen.getByLabelText('Custo extra (% ao ano, opcional)')).toHaveValue(0.5);
    fireEvent.change(screen.getByLabelText('Produto'), { target: { value: 'LC' } });
    preencher('Emissor', 'Corretora W');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(salvas[0]).toMatchObject({ produto: 'LC', emissor: 'Corretora W', custoExtraAA: 0.005 });
  });
});

describe('linha "Custo extra" na tabela da comparação', () => {
  const linhas = () => screen.getAllByRole('rowheader').map((c) => c.textContent);
  it('não aparece se nenhuma oferta tem custo', () => {
    render(<TabelaComparacao ofertas={[cdb, { ...cdb, id: 'b' }]} colunas={[]} dataAplicacao="2026-09-28" onRemover={() => {}} />);
    expect(linhas()).not.toContain('Custo extra');
  });
  it('aparece se alguma tem, com o custo de cada uma', () => {
    render(<TabelaComparacao ofertas={[cdb, comCusto]} colunas={[]} dataAplicacao="2026-09-28" onRemover={() => {}} />);
    const linha = screen.getByRole('rowheader', { name: 'Custo extra' }).closest('tr') as HTMLElement;
    const celulas = within(linha).getAllByRole('cell').map((c) => c.textContent);
    expect(celulas).toEqual(['Sem custo', '0,5% ao ano']);
  });
});

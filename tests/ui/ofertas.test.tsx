// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { exportarOfertas, LIMITE_OFERTAS } from '../../src/armazenamento/ofertas';
import { somarDias } from '../../src/engine/datas';
import type { OfertaCadastrada } from '../../src/engine/ofertas';
import { hoje } from '../../src/ui/hoje';
import { MinhasOfertas } from '../../src/ui/ofertas/MinhasOfertas';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const cdb: OfertaCadastrada = {
  id: 'cdb', produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 }, emissor: 'Banco X', conglomerado: 'Grupo X',
  vencimento: '2027-09-28', liquidez: 'NO_VENCIMENTO',
};
const lci: OfertaCadastrada = {
  id: 'lci', produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 }, emissor: 'Banco Y', conglomerado: 'Grupo Y',
  vencimento: '2028-09-28', liquidez: 'NO_VENCIMENTO',
};

function ComEstado({ inicial = [], aoMudar = () => {} }: { inicial?: OfertaCadastrada[]; aoMudar?: (o: OfertaCadastrada[]) => void }) {
  const [ofertas, setOfertas] = useState(inicial);
  let n = 0;
  return <MinhasOfertas ofertas={ofertas} gerarId={() => `novo-${++n}`} onChange={(o) => { setOfertas(o); aoMudar(o); }} />;
}

const cartao = (nome: RegExp) => screen.getByRole('article', { name: nome });
const salvarNova = () => fireEvent.click(screen.getByRole('button', { name: 'Adicionar oferta' }));
const preencher = (rotulo: string, valor: string) => fireEvent.input(screen.getByLabelText(rotulo), { target: { value: valor } });
const escolher = (rotulo: string, valor: string) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });

describe('Minhas ofertas', () => {
  it('estado vazio', () => {
    render(<ComEstado />);
    expect(screen.getByText('Cadastre as ofertas que você está avaliando para comparar.')).toBeInTheDocument();
  });

  it('cadastrar uma oferta', () => {
    const aoMudar = vi.fn();
    render(<ComEstado aoMudar={aoMudar} />);
    preencher('Emissor', 'Banco X');
    preencher('Conglomerado', 'Grupo X');
    preencher('Taxa (%)', '103');
    escolher('Liquidez', 'NO_VENCIMENTO');
    preencher('Vencimento', '2027-09-28');
    salvarNova();
    expect(aoMudar).toHaveBeenLastCalledWith([{ ...cdb, id: 'novo-1' }]);
    const c = cartao(/A: CDB 103% do CDI/);
    expect(within(c).getByText(/Banco X/)).toBeInTheDocument();
    expect(within(c).getByText(/Grupo X/)).toBeInTheDocument();
    expect(within(c).getByText('No vencimento: 28/09/2027')).toBeInTheDocument();
    expect(within(c).getByRole('button', { name: 'FGC' })).toBeInTheDocument();
    // O formulário volta vazio para a próxima oferta.
    expect(screen.getByLabelText('Emissor')).toHaveValue('');
  });

  it('erro de validação aparece em role="alert" e não salva', () => {
    const aoMudar = vi.fn();
    render(<ComEstado aoMudar={aoMudar} />);
    preencher('Conglomerado', 'Grupo X');
    salvarNova();
    expect(screen.getByRole('alert')).toHaveTextContent('Preencha o emissor (até 80 caracteres).');
    expect(aoMudar).not.toHaveBeenCalled();
  });

  it('sem liquidez diária, exige o vencimento', () => {
    render(<ComEstado />);
    preencher('Emissor', 'Banco X');
    preencher('Conglomerado', 'Grupo X');
    escolher('Liquidez', 'NO_VENCIMENTO');
    salvarNova();
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o vencimento de uma oferta sem liquidez diária.');
  });

  it('taxa vazia gera alerta', () => {
    render(<ComEstado />);
    preencher('Emissor', 'Banco X');
    preencher('Conglomerado', 'Grupo X');
    preencher('Taxa (%)', '');
    salvarNova();
    expect(screen.getByRole('alert')).toHaveTextContent('Preencha a taxa da oferta.');
  });

  it('editar mantém o id e troca os dados', () => {
    const aoMudar = vi.fn();
    render(<ComEstado inicial={[cdb, lci]} aoMudar={aoMudar} />);
    fireEvent.click(within(cartao(/A: CDB/)).getByRole('button', { name: 'Editar' }));
    expect(screen.getByRole('heading', { name: 'Editar oferta' })).toHaveFocus();
    expect(screen.getByLabelText('Emissor')).toHaveValue('Banco X');
    preencher('Taxa (%)', '110');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(aoMudar).toHaveBeenLastCalledWith([{ ...cdb, indexacao: { tipo: 'POS_CDI', percentualCDI: 1.1 } }, lci]);
    expect(cartao(/A: CDB 110% do CDI/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nova oferta' })).toBeInTheDocument();
  });

  it('cancelar a edição não muda nada', () => {
    const aoMudar = vi.fn();
    render(<ComEstado inicial={[cdb]} aoMudar={aoMudar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar edição' }));
    expect(aoMudar).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Nova oferta' })).toBeInTheDocument();
  });

  it('remover pede confirmação inline', () => {
    const aoMudar = vi.fn();
    const confirmar = vi.spyOn(window, 'confirm');
    render(<ComEstado inicial={[cdb, lci]} aoMudar={aoMudar} />);
    fireEvent.click(within(cartao(/B: LCI/)).getByRole('button', { name: 'Remover' }));
    expect(within(cartao(/B: LCI/)).getByText(/Remover esta oferta\?/)).toBeInTheDocument();
    fireEvent.click(within(cartao(/B: LCI/)).getByRole('button', { name: 'Cancelar' }));
    expect(aoMudar).not.toHaveBeenCalled();
    fireEvent.click(within(cartao(/B: LCI/)).getByRole('button', { name: 'Remover' }));
    fireEvent.click(within(cartao(/B: LCI/)).getByRole('button', { name: 'Sim, remover' }));
    expect(aoMudar).toHaveBeenLastCalledWith([cdb]);
    expect(screen.queryByRole('article', { name: /LCI/ })).toBeNull();
    expect(confirmar).not.toHaveBeenCalled();
  });

  describe('foco depois de remover e de salvar', () => {
    const titulo = (nome: RegExp) => screen.getByRole('heading', { name: nome });
    it('remover a última oferta leva o foco ao título "Minhas ofertas"', () => {
      render(<ComEstado inicial={[cdb, lci]} />);
      fireEvent.click(within(cartao(/B: LCI/)).getByRole('button', { name: 'Remover' }));
      fireEvent.click(within(cartao(/B: LCI/)).getByRole('button', { name: 'Sim, remover' }));
      expect(titulo(/^Minhas ofertas$/)).toHaveFocus();
    });
    it('remover uma oferta do meio leva o foco à próxima', () => {
      render(<ComEstado inicial={[cdb, lci]} />);
      fireEvent.click(within(cartao(/A: CDB/)).getByRole('button', { name: 'Remover' }));
      fireEvent.click(within(cartao(/A: CDB/)).getByRole('button', { name: 'Sim, remover' }));
      expect(titulo(/^A: LCI 80% do CDI$/)).toHaveFocus();
    });
    it('"Salvar alterações" leva o foco ao cartão salvo', () => {
      render(<ComEstado inicial={[cdb, lci]} />);
      fireEvent.click(within(cartao(/B: LCI/)).getByRole('button', { name: 'Editar' }));
      preencher('Taxa (%)', '90');
      fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
      expect(titulo(/^B: LCI 90% do CDI$/)).toHaveFocus();
    });
  });

  it('Tesouro esconde a liquidez (sempre diária)', () => {
    const aoMudar = vi.fn();
    render(<ComEstado aoMudar={aoMudar} />);
    escolher('Produto', 'TESOURO_PREFIXADO');
    expect(screen.queryByLabelText('Liquidez')).toBeNull();
    preencher('Emissor', 'Tesouro Nacional');
    preencher('Conglomerado', 'Tesouro Nacional');
    preencher('Vencimento', '2029-01-01');
    salvarNova();
    expect(aoMudar.mock.calls.at(-1)?.[0][0]).toMatchObject({ produto: 'TESOURO_PREFIXADO', liquidez: 'DIARIA', vencimento: '2029-01-01' });
    const c = cartao(/Tesouro Prefixado/);
    expect(within(c).getByText('Liquidez diária · vence em 01/01/2029')).toBeInTheDocument();
    expect(within(c).getByRole('button', { name: 'Tesouro Nacional' })).toBeInTheDocument();
  });

  it('poupança esconde liquidez e vencimento', () => {
    render(<ComEstado />);
    escolher('Produto', 'POUPANCA');
    expect(screen.queryByLabelText('Liquidez')).toBeNull();
    expect(screen.queryByLabelText('Vencimento')).toBeNull();
  });

  it('LCI/LCA mostra o prazo mínimo legal e avisa quando o vencimento cai antes dele', () => {
    render(<ComEstado />);
    const prazo = () => document.querySelector('.cadastro__prazo');
    expect(prazo()).toBeNull();
    escolher('Produto', 'LCI');
    // O Termo quebra o texto em mais de um elemento.
    expect(within(prazo() as HTMLElement).getByRole('button', { name: 'Prazo mínimo legal' })).toBeInTheDocument();
    expect(prazo()).toHaveTextContent(/: 6 meses\. Aplicando hoje, o resgate só é possível a partir de \d{2}\/\d{2}\/\d{4}\./);
    escolher('Liquidez', 'NO_VENCIMENTO');
    preencher('Vencimento', somarDias(hoje(), 30));
    expect(screen.getByText(/é anterior ao prazo mínimo legal/)).toBeInTheDocument();
    preencher('Vencimento', somarDias(hoje(), 400));
    expect(screen.queryByText(/é anterior ao prazo mínimo legal/)).toBeNull();
  });

  describe('data com ano de 5 dígitos', () => {
    it('o cadastro mostra "Data inválida", não quebra e não salva', () => {
      const aoMudar = vi.fn();
      render(<ComEstado aoMudar={aoMudar} />);
      preencher('Emissor', 'Banco X');
      preencher('Conglomerado', 'Grupo X');
      escolher('Liquidez', 'NO_VENCIMENTO');
      preencher('Vencimento', '20277-01-01');
      expect(screen.getByLabelText('Vencimento')).toHaveValue('20277-01-01');
      expect(screen.getByText('Data inválida')).toBeInTheDocument();
      salvarNova();
      expect(screen.getByRole('alert')).toHaveTextContent('Data de vencimento inválida.');
      expect(aoMudar).not.toHaveBeenCalled();
    });
    it('LCI com a data inválida não quebra o aviso do prazo mínimo', () => {
      render(<ComEstado />);
      escolher('Produto', 'LCI');
      escolher('Liquidez', 'NO_VENCIMENTO');
      preencher('Vencimento', '20261-01-01');
      expect(screen.getByText('Data inválida')).toBeInTheDocument();
      expect(screen.queryByText(/é anterior ao prazo mínimo legal/)).toBeNull();
    });
    it('a lista mostra "Data inválida" em vez de quebrar', () => {
      render(<ComEstado inicial={[{ ...cdb, vencimento: '20277-01-01' }]} />);
      expect(within(cartao(/A: CDB/)).getByText('No vencimento · Data inválida')).toBeInTheDocument();
    });
    it('o campo de vencimento limita o ano a 4 dígitos', () => {
      render(<ComEstado />);
      expect(screen.getByLabelText('Vencimento')).toHaveAttribute('max', '9999-12-31');
      expect(screen.getByLabelText('Vencimento')).toHaveAttribute('min', '1990-01-01');
    });
  });

  it('sugere os conglomerados já usados', () => {
    render(<ComEstado inicial={[cdb, lci, { ...cdb, id: 'outro' }]} />);
    const campo = screen.getByLabelText('Conglomerado');
    const lista = document.getElementById(campo.getAttribute('list') ?? '');
    expect([...(lista?.querySelectorAll('option') ?? [])].map((o) => o.value)).toEqual(['Grupo X', 'Grupo Y']);
  });

  it('os ids do formulário têm prefixo próprio (não colidem com o duelo)', () => {
    render(<ComEstado />);
    expect(screen.getByLabelText('Produto').id).toMatch(/^cadastro-/);
    expect(screen.getByLabelText('Taxa (%)').id).toMatch(/^cadastro-/);
  });

  it(`no limite de ${LIMITE_OFERTAS} ofertas, o cadastro fica bloqueado`, () => {
    const cheias = Array.from({ length: LIMITE_OFERTAS }, (_, i) => ({ ...cdb, id: `o${i}` }));
    render(<ComEstado inicial={cheias} />);
    expect(screen.queryByRole('button', { name: 'Adicionar oferta' })).toBeNull();
    expect(screen.getByText(/Limite de 30 ofertas/)).toBeInTheDocument();
  });

  describe('exportar e importar', () => {
    const arquivo = (texto: string) => new File([texto], 'ofertas.json', { type: 'application/json' });
    const importar = (f: File) => fireEvent.change(screen.getByLabelText('Importar ofertas (.json)'), { target: { files: [f] } });

    /** jsdom não implementa createObjectURL: stub só no teste que chama. */
    function stubUrl() {
      const criar = vi.fn<(b: Blob) => string>(() => 'blob:teste');
      const revogar = vi.fn();
      const originais = { criar: URL.createObjectURL, revogar: URL.revokeObjectURL };
      URL.createObjectURL = criar;
      URL.revokeObjectURL = revogar;
      onTestFinished(() => {
        URL.createObjectURL = originais.criar;
        URL.revokeObjectURL = originais.revogar;
      });
      const clicar = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      return { criar, revogar, clicar };
    }

    it('exportar baixa o JSON pelo createObjectURL e só revoga a URL depois de 1 s', async () => {
      vi.useFakeTimers();
      onTestFinished(() => { vi.useRealTimers(); });
      const { criar, revogar, clicar } = stubUrl();
      render(<ComEstado inicial={[cdb]} />);
      fireEvent.click(screen.getByRole('button', { name: 'Exportar ofertas' }));
      expect(criar).toHaveBeenCalledTimes(1);
      const blob = criar.mock.calls[0]![0];
      expect(blob.type).toBe('application/json');
      const baixado = clicar.mock.contexts[0] as HTMLAnchorElement;
      expect(baixado.download).toBe(`rende-ofertas-${hoje()}.json`);
      expect(baixado.href).toBe('blob:teste');
      // Revogar logo depois do clique pode cancelar o download em alguns navegadores.
      expect(revogar).not.toHaveBeenCalled();
      vi.advanceTimersByTime(999);
      expect(revogar).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(revogar).toHaveBeenCalledWith('blob:teste');
      vi.useRealTimers();
      expect(JSON.parse(await blob.text()).ofertas).toEqual([cdb]);
    });

    it('o status é um contêiner vivo permanente; a mesma mensagem é limpa e reescrita', () => {
      vi.useFakeTimers();
      onTestFinished(() => { vi.useRealTimers(); });
      stubUrl();
      render(<ComEstado inicial={[cdb]} />);
      const status = screen.getByRole('status');
      expect(status).toHaveTextContent('');
      fireEvent.click(screen.getByRole('button', { name: 'Exportar ofertas' }));
      expect(screen.getByRole('status')).toBe(status);
      expect(status).toHaveTextContent('1 oferta exportada.');
      fireEvent.click(screen.getByRole('button', { name: 'Exportar ofertas' }));
      expect(status).toHaveTextContent('');
      act(() => { vi.advanceTimersByTime(200); });
      expect(screen.getByRole('status')).toBe(status);
      expect(status).toHaveTextContent('1 oferta exportada.');
    });

    it('sem ofertas, exportar fica desabilitado', () => {
      render(<ComEstado />);
      expect(screen.getByRole('button', { name: 'Exportar ofertas' })).toBeDisabled();
    });

    it('importação válida acrescenta as ofertas com ids novos', async () => {
      const aoMudar = vi.fn();
      render(<ComEstado inicial={[cdb]} aoMudar={aoMudar} />);
      importar(arquivo(exportarOfertas([cdb, lci], Date.now())));
      expect(await screen.findByText('2 ofertas importadas.')).toBe(screen.getByRole('status'));
      expect(aoMudar).toHaveBeenLastCalledWith([cdb, { ...cdb, id: 'novo-1' }, { ...lci, id: 'novo-2' }]);
      expect(screen.getAllByRole('article')).toHaveLength(3);
    });

    it('arquivo inválido mostra o erro e não muda nada', async () => {
      const aoMudar = vi.fn();
      render(<ComEstado inicial={[cdb]} aoMudar={aoMudar} />);
      importar(arquivo('{ isto não é json'));
      expect(await screen.findByRole('alert')).toHaveTextContent('O arquivo não é um JSON válido.');
      expect(aoMudar).not.toHaveBeenCalled();
    });

    it('campo extra no arquivo é rejeitado com a mensagem de importarOfertas', async () => {
      render(<ComEstado />);
      const comExtra = JSON.stringify({ versao: 1, exportadoEm: 'x', ofertas: [{ ...lci, extra: 1 }] });
      importar(arquivo(comExtra));
      expect(await screen.findByRole('alert')).toHaveTextContent('Oferta 1: campo não reconhecido ("extra").');
    });

    it('importar além do limite de 30 é rejeitado', async () => {
      const aoMudar = vi.fn();
      const muitas = Array.from({ length: 29 }, (_, i) => ({ ...cdb, id: `o${i}` }));
      render(<ComEstado inicial={muitas} aoMudar={aoMudar} />);
      importar(arquivo(exportarOfertas([cdb, lci], Date.now())));
      expect(await screen.findByRole('alert')).toHaveTextContent('Com as importadas seriam 31 ofertas; o limite é 30.');
      expect(aoMudar).not.toHaveBeenCalled();
    });
  });
});

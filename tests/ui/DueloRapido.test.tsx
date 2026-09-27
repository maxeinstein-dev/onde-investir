// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DueloRapido } from '../../src/ui/DueloRapido';
import { cenarioConstante } from '../../src/engine/indexadores';
import { CENARIO_INICIAL } from '../../src/dados/cenarioInicial';
import { ehDiaUtil } from '../../src/engine/calendario';
import { somarDias, somarMeses } from '../../src/engine/datas';
import { hoje } from '../../src/ui/hoje';

afterEach(cleanup);
beforeEach(() => localStorage.clear());

// O cenário padrão (valores de referência do M1), constante.
const v = CENARIO_INICIAL.valores;
const CEN = cenarioConstante({ cdiAA: v.cdi / 100, selicMetaAA: v.selicMeta / 100, ipcaAA: v.ipca / 100, trAM: v.tr / 100 });
const Duelo = () => <DueloRapido cenario={CEN} descricaoCenario="Cenário manual de teste." />;

describe('DueloRapido', () => {
  it('esconde o resultado até o palpite e depois explica', () => {
    render(<Duelo />);
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    expect(screen.getByRole('heading', { name: /qual você acha que rende mais/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Resultado' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'B: LCI 80% do CDI' }));
    expect(screen.getByRole('heading', { name: 'Resultado' })).toBeInTheDocument();
    expect(screen.getByText(/Não foi dessa vez/)).toBeInTheDocument();
    expect(screen.getByText(/CDB 103% do CDI termina com/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Equivalências de CDB 103% do CDI/ })).toBeInTheDocument();
  });
  it('pular desliga os palpites e vale para a próxima comparação', () => {
    render(<Duelo />);
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    fireEvent.click(screen.getByRole('button', { name: /pular/i }));
    expect(screen.getByRole('heading', { name: 'Resultado' })).toBeInTheDocument();
    cleanup();
    render(<Duelo />);
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    expect(screen.getByRole('heading', { name: 'Resultado' })).toBeInTheDocument();
  });
  // O fieldset do cenário foi para o painel de indicadores.
  it.todo('C5: labels do cenário manual são texto simples, com o Termo ao lado (migrado do App do M1)');
  it('mostra o cenário usado, sem campos de cenário', () => {
    render(<Duelo />);
    expect(screen.getByText(/Cenário manual de teste\./)).toBeInTheDocument();
    expect(screen.queryByLabelText('CDI (% a.a.)')).toBeNull();
  });
  it('trocar o cenário depois do resultado esconde o resultado', () => {
    const { rerender } = render(<Duelo />);
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    fireEvent.click(screen.getByRole('button', { name: 'A: CDB 103% do CDI' }));
    expect(screen.getByRole('heading', { name: 'Resultado' })).toBeInTheDocument();
    const outro = cenarioConstante({ cdiAA: 0.1, selicMetaAA: 0.101, ipcaAA: 0.04, trAM: 0 });
    rerender(<DueloRapido cenario={outro} descricaoCenario="Outro." />);
    expect(screen.queryByRole('heading', { name: 'Resultado' })).toBeNull();
  });
  it('o cenário recebido entra no cálculo', () => {
    const baixo = cenarioConstante({ cdiAA: 0.05, selicMetaAA: 0.051, ipcaAA: 0.04, trAM: 0 });
    render(<DueloRapido cenario={baixo} descricaoCenario="Baixo." />);
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    fireEvent.click(screen.getByRole('button', { name: /pular/i }));
    // 10 mil a 103% de um CDI de 5% por 2 anos fica bem abaixo dos R$ 12.551,90 do cenário padrão.
    expect(screen.getByText(/CDB 103% do CDI termina com R\$\s10\./)).toBeInTheDocument();
  });
  it('explica o erro de prazo mínimo da LCI', () => {
    render(<Duelo />);
    fireEvent.input(screen.getByLabelText('Data do resgate'), { target: { value: somarDias(hoje(), 30) } });
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/prazo mínimo legal/);
  });

  describe('validação antes de comparar', () => {
    const semResultado = () => {
      expect(screen.queryByRole('heading', { name: /qual você acha que rende mais/i })).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Resultado' })).toBeNull();
    };
    // Validação dos campos do cenário manual: agora no painel de indicadores (Tarefa C5).
    it.todo('C5: CDI vazio continua vazio e gera alerta, sem resultado (migrado do App do M1)');
    it.todo('C5: Selic meta, IPCA e TR vazios geram alerta (migrado do App do M1)');
    it('Valor (R$) vazio gera alerta', () => {
      render(<Duelo />);
      const campo = screen.getByLabelText('Valor (R$)') as HTMLInputElement;
      fireEvent.input(campo, { target: { value: '' } });
      expect(campo.value).toBe('');
      fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
      expect(screen.getByRole('alert')).toHaveTextContent('Preencha o valor da aplicação.');
      semResultado();
    });
    it('taxa vazia gera alerta com a opção', () => {
      render(<Duelo />);
      const taxaB = screen.getAllByLabelText('Taxa (%)')[1]!;
      fireEvent.input(taxaB, { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
      expect(screen.getByRole('alert')).toHaveTextContent('Preencha a taxa da Opção B.');
      semResultado();
    });
    it('data da aplicação vazia desliga os prazos e gera alerta humano', () => {
      render(<Duelo />);
      fireEvent.input(screen.getByLabelText('Data da aplicação'), { target: { value: '' } });
      const prazos = within(screen.getByRole('group', { name: 'Prazos rápidos' })).getAllByRole('button');
      expect(prazos).toHaveLength(5);
      for (const b of prazos) expect(b).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
      expect(screen.getByRole('alert')).toHaveTextContent('Informe a data da aplicação.');
      expect(screen.getByRole('alert')).not.toHaveTextContent(/AAAA-MM-DD/);
      semResultado();
    });
    it('data do resgate vazia gera alerta humano', () => {
      render(<Duelo />);
      fireEvent.input(screen.getByLabelText('Data do resgate'), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
      expect(screen.getByRole('alert')).toHaveTextContent('Informe a data do resgate.');
      expect(screen.getByRole('alert')).not.toHaveTextContent(/AAAA-MM-DD/);
      semResultado();
    });
  });

  describe('foco entre as fases', () => {
    it('Comparar leva ao título do palpite; o palpite leva ao título do resultado', () => {
      render(<Duelo />);
      fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: /qual você acha que rende mais/i }));
      fireEvent.click(screen.getByRole('button', { name: 'A: CDB 103% do CDI' }));
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Resultado' }));
    });
    it('com palpites desligados, Comparar leva direto ao título do resultado', () => {
      render(<Duelo />);
      fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
      fireEvent.click(screen.getByRole('button', { name: /pular/i }));
      fireEvent.input(screen.getByLabelText('Valor (R$)'), { target: { value: '20000' } });
      screen.getByRole('button', { name: 'Comparar' }).focus();
      fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Resultado' }));
    });
  });

  it('avisa, sem bloquear, quando a aplicação ou o resgate não caem em dia útil', () => {
    render(<Duelo />);
    const sabado = '2026-10-03';
    const domingo = '2028-10-01';
    expect(ehDiaUtil(sabado)).toBe(false);
    expect(ehDiaUtil(domingo)).toBe(false);
    fireEvent.input(screen.getByLabelText('Data da aplicação'), { target: { value: sabado } });
    fireEvent.input(screen.getByLabelText('Data do resgate'), { target: { value: domingo } });
    expect(screen.getByText('Não é dia útil: na prática a aplicação acontece no próximo dia útil.')).toBeInTheDocument();
    expect(screen.getByText('Não é dia útil: na prática o resgate acontece no próximo dia útil.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('heading', { name: /qual você acha que rende mais/i })).toBeInTheDocument();
  });
  it('não mostra o aviso de dia não útil em dia útil', () => {
    render(<Duelo />);
    fireEvent.input(screen.getByLabelText('Data da aplicação'), { target: { value: '2026-10-01' } });
    fireEvent.input(screen.getByLabelText('Data do resgate'), { target: { value: '2028-10-02' } });
    expect(screen.queryByText(/Não é dia útil/)).toBeNull();
  });

  it('editar um campo depois do resultado esconde o resultado', () => {
    render(<Duelo />);
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    fireEvent.click(screen.getByRole('button', { name: 'A: CDB 103% do CDI' }));
    expect(screen.getByRole('heading', { name: 'Resultado' })).toBeInTheDocument();
    fireEvent.input(screen.getByLabelText('Valor (R$)'), { target: { value: '5000' } });
    expect(screen.queryByRole('heading', { name: 'Resultado' })).toBeNull();
  });
  it('o botão "1 ano" define o resgate como aplicação + 12 meses', () => {
    render(<Duelo />);
    fireEvent.input(screen.getByLabelText('Data da aplicação'), { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByRole('button', { name: '1 ano' }));
    expect(somarMeses('2026-10-01', 12)).toBe('2027-10-01');
    expect(screen.getByLabelText('Data do resgate')).toHaveValue('2027-10-01');
  });
  it('"Religar os palpites" volta a mostrar o palpite', () => {
    render(<Duelo />);
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    fireEvent.click(screen.getByRole('button', { name: /pular/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Religar os palpites' }));
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    expect(screen.getByRole('heading', { name: /qual você acha que rende mais/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Resultado' })).toBeNull();
  });
});

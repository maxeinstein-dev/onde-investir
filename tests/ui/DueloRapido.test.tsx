// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { render as renderizarDireto } from 'preact';
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
/** O cartão do resultado da opção, pelo título "A: ..." ou "B: ...". */
const cartao = (l: 'A' | 'B') => screen.getByRole('heading', { name: new RegExp(`^${l}: `) }).closest('article')!;

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
  it('trocar o cenário esconde o resultado na própria renderização, sem esperar um efeito', () => {
    const { container } = render(<DueloRapido cenario={CEN} descricaoCenario="Cenário manual de teste." />);
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    fireEvent.click(screen.getByRole('button', { name: 'A: CDB 103% do CDI' }));
    expect(screen.getByRole('heading', { name: 'Resultado' })).toBeInTheDocument();
    const outro = cenarioConstante({ cdiAA: 0.1, selicMetaAA: 0.101, ipcaAA: 0.04, trAM: 0 });
    // Sem act: os efeitos ficam para depois da pintura. O resultado velho não pode aparecer com o cenário novo.
    renderizarDireto(<DueloRapido cenario={outro} descricaoCenario="Outro." />, container);
    expect(screen.queryByRole('heading', { name: 'Resultado' })).toBeNull();
  });
  it('com o cenário do painel inválido, Comparar fica desabilitado e avisa', () => {
    render(<DueloRapido cenario={CEN} descricaoCenario="x" cenarioInvalido="Preencha o CDI do cenário." />);
    const botao = screen.getByRole('button', { name: 'Comparar' });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAccessibleDescription('Corrija o cenário no painel antes de comparar.');
  });
  it('o cenário recebido entra no cálculo', () => {
    const baixo = cenarioConstante({ cdiAA: 0.05, selicMetaAA: 0.051, ipcaAA: 0.04, trAM: 0 });
    render(<DueloRapido cenario={baixo} descricaoCenario="Baixo." />);
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    fireEvent.click(screen.getByRole('button', { name: /pular/i }));
    // 10 mil a 103% de um CDI de 5% por 2 anos fica bem abaixo dos R$ 12.551,90 do cenário padrão.
    expect(screen.getByText(/CDB 103% do CDI termina com R\$\s10\./)).toBeInTheDocument();
  });
  it('explica o prazo mínimo da LCI no cartão dela, e o CDB mostra o valor', () => {
    render(<Duelo />);
    fireEvent.input(screen.getByLabelText('Data do resgate'), { target: { value: somarDias(hoje(), 30) } });
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(cartao('B')).toHaveTextContent(/Indisponível até .*prazo mínimo legal/);
    expect(screen.getByText('Só CDB 103% do CDI pode ser resgatada nessa data.')).toBeInTheDocument();
  });

  describe('liquidez e vencimento', () => {
    const opcao = (l: 'A' | 'B') => screen.getByRole('group', { name: `Opção ${l}` });
    const campo = (l: 'A' | 'B', rotulo: string) => within(opcao(l)).getByLabelText(rotulo);
    const datas = (aplicacao: string, resgate: string) => {
      fireEvent.input(screen.getByLabelText('Data da aplicação'), { target: { value: aplicacao } });
      fireEvent.input(screen.getByLabelText('Data do resgate'), { target: { value: resgate } });
    };
    const comparar = () => fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));

    it('cada opção tem liquidez (diária por padrão) e vencimento opcional; a frase fixa fica abaixo do resgate', () => {
      render(<Duelo />);
      expect(campo('A', 'Liquidez')).toHaveValue('DIARIA');
      expect(within(opcao('B')).getByRole('option', { name: 'Só no vencimento' })).toBeInTheDocument();
      expect(campo('A', 'Vencimento')).toHaveValue('');
      expect(campo('A', 'Liquidez').id).toMatch(/^duelo-/);
      expect(campo('A', 'Vencimento').id).toMatch(/^duelo-/);
      expect(screen.getByText('Com liquidez diária, o resgate pode ser em qualquer data. Sem liquidez, só no vencimento.')).toBeInTheDocument();
    });
    it('"só no vencimento" sem vencimento gera alerta', () => {
      render(<Duelo />);
      fireEvent.change(campo('B', 'Liquidez'), { target: { value: 'NO_VENCIMENTO' } });
      comparar();
      expect(screen.getByRole('alert')).toHaveTextContent('Informe o vencimento da Opção B.');
    });
    it('Tesouro: sem campo de liquidez e com vencimento obrigatório', () => {
      render(<Duelo />);
      fireEvent.change(campo('A', 'Produto'), { target: { value: 'TESOURO_SELIC' } });
      expect(within(opcao('A')).queryByLabelText('Liquidez')).toBeNull();
      comparar();
      expect(screen.getByRole('alert')).toHaveTextContent('Informe o vencimento da Opção A.');
    });
    it('Poupança: sem vencimento e sem liquidez', () => {
      render(<Duelo />);
      fireEvent.change(campo('B', 'Produto'), { target: { value: 'POUPANCA' } });
      expect(within(opcao('B')).queryByLabelText('Liquidez')).toBeNull();
      expect(within(opcao('B')).queryByLabelText('Vencimento')).toBeNull();
    });

    it('LCI só no vencimento, vencendo depois do resgate: indisponível, e o CDB mostra o valor', () => {
      render(<Duelo />);
      datas('2026-10-01', '2028-10-02');
      fireEvent.change(campo('B', 'Liquidez'), { target: { value: 'NO_VENCIMENTO' } });
      fireEvent.input(campo('B', 'Vencimento'), { target: { value: '2029-10-01' } });
      comparar();
      // Só uma disponível: sem palpite e sem vencedor.
      expect(screen.queryByRole('heading', { name: /qual você acha que rende mais/i })).toBeNull();
      expect(screen.getByRole('heading', { name: 'Resultado' })).toBeInTheDocument();
      expect(screen.getByText('Só CDB 103% do CDI pode ser resgatada nessa data.')).toBeInTheDocument();
      expect(cartao('B')).toHaveTextContent('Indisponível até 01/10/2029: só pode ser resgatado no vencimento.');
      expect(cartao('B').querySelector('.cartao__liquido')).toBeNull();
      expect(cartao('A').querySelector('.cartao__liquido')).toHaveTextContent(/R\$\s?12\./);
      expect(screen.queryByText('maior valor líquido')).toBeNull();
      expect(screen.getByRole('heading', { name: /Equivalências de CDB 103% do CDI/ })).toBeInTheDocument();
    });
    it('CDB diário vencendo antes do resgate: reaplicado, com a frase e os passos das duas etapas', () => {
      render(<Duelo />);
      datas('2026-10-01', '2028-10-02');
      fireEvent.input(campo('A', 'Vencimento'), { target: { value: '2027-10-01' } });
      comparar();
      fireEvent.click(screen.getByRole('button', { name: 'A: CDB 103% do CDI' }));
      const a = cartao('A');
      expect(a).toHaveTextContent('Venceu em 01/10/2027 e foi reaplicado em CDB 103% do CDI.');
      const porque = within(a).getByText('Por que esse resultado?').closest('details')!;
      expect(within(porque).getAllByText('Valor aplicado')).toHaveLength(2);
      expect(porque).toHaveTextContent('Venceu em 01/10/2027 e foi reaplicado em CDB 103% do CDI.');
      expect(screen.getByText(/aplicado direto até o resgate, sem a reaplicação/)).toBeInTheDocument();
    });
    it('Tesouro Prefixado antes do vencimento: marcação a mercado, e as equivalências explicam o motivo', () => {
      render(<Duelo />);
      datas('2026-10-01', '2028-10-02');
      fireEvent.change(campo('A', 'Produto'), { target: { value: 'TESOURO_PREFIXADO' } });
      fireEvent.input(campo('A', 'Vencimento'), { target: { value: '2030-01-01' } });
      comparar();
      const texto = 'Vence em 01/01/2030. Se vender antes, recebe o preço de mercado do dia, que pode ficar acima ou abaixo do previsto.';
      expect(cartao('A')).toHaveTextContent(texto);
      expect(screen.getByText('Só LCI 80% do CDI pode ser resgatada nessa data.')).toBeInTheDocument();
      const eq = screen.getByRole('heading', { name: /Equivalências de Tesouro Prefixado/ }).closest('section')!;
      expect(eq).toHaveTextContent(/Não dá para calcular as equivalências nessa data/);
      expect(eq).toHaveTextContent(texto);
      expect(within(eq).queryByText(/você precisaria de/)).toBeNull();
    });
    it('nenhuma disponível: explica as duas', () => {
      render(<Duelo />);
      datas('2026-10-01', '2028-10-02');
      fireEvent.change(campo('A', 'Produto'), { target: { value: 'TESOURO_PREFIXADO' } });
      fireEvent.input(campo('A', 'Vencimento'), { target: { value: '2030-01-01' } });
      fireEvent.change(campo('B', 'Liquidez'), { target: { value: 'NO_VENCIMENTO' } });
      fireEvent.input(campo('B', 'Vencimento'), { target: { value: '2029-10-01' } });
      comparar();
      expect(screen.getByText('Nenhuma das duas pode ser resgatada nessa data.')).toBeInTheDocument();
      expect(cartao('A')).toHaveTextContent(/preço de mercado/);
      expect(cartao('B')).toHaveTextContent(/só pode ser resgatado no vencimento/);
    });
    it('as duas diárias: palpite, vencedor e equivalência, como antes', () => {
      render(<Duelo />);
      datas('2026-10-01', '2028-10-02');
      comparar();
      expect(screen.getByRole('heading', { name: /qual você acha que rende mais/i })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'A: CDB 103% do CDI' }));
      expect(screen.getByText('Você acertou.')).toBeInTheDocument();
      expect(within(cartao('A')).getByText('maior valor líquido')).toBeInTheDocument();
      expect(screen.getByText(/CDB 103% do CDI termina com .* a mais que LCI 80% do CDI/)).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /Equivalências de CDB 103% do CDI/ })).toBeInTheDocument();
      expect(screen.getByText(/você precisaria de/)).toBeInTheDocument();
    });
  });

  describe('validação antes de comparar', () => {
    const semResultado = () => {
      expect(screen.queryByRole('heading', { name: /qual você acha que rende mais/i })).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Resultado' })).toBeNull();
    };
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

  describe('data com ano de 5 dígitos', () => {
    const semResultado = () => {
      expect(screen.queryByRole('heading', { name: /qual você acha que rende mais/i })).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Resultado' })).toBeNull();
    };
    it('na aplicação: desliga os prazos e gera alerta humano', () => {
      render(<Duelo />);
      fireEvent.input(screen.getByLabelText('Data da aplicação'), { target: { value: '20277-01-01' } });
      for (const b of within(screen.getByRole('group', { name: 'Prazos rápidos' })).getAllByRole('button')) expect(b).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
      expect(screen.getByRole('alert')).toHaveTextContent('A data da aplicação é inválida.');
      semResultado();
    });
    it('no resgate: alerta humano', () => {
      render(<Duelo />);
      fireEvent.input(screen.getByLabelText('Data do resgate'), { target: { value: '20277-01-01' } });
      fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
      expect(screen.getByRole('alert')).toHaveTextContent('A data do resgate é inválida.');
      semResultado();
    });
    it('no vencimento da opção: alerta humano', () => {
      render(<Duelo />);
      fireEvent.input(within(screen.getByRole('group', { name: 'Opção A' })).getByLabelText('Vencimento'), { target: { value: '20277-01-01' } });
      fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
      expect(screen.getByRole('alert')).toHaveTextContent('O vencimento da Opção A é inválido.');
      semResultado();
    });
    it('todos os campos de data limitam o ano a 4 dígitos', () => {
      const { container } = render(<Duelo />);
      const datas = [...container.querySelectorAll('input[type="date"]')];
      expect(datas).toHaveLength(4);
      for (const d of datas) {
        expect(d).toHaveAttribute('max', '9999-12-31');
        expect(d).toHaveAttribute('min', '1990-01-01');
      }
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

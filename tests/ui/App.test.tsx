// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/ui/App';
import { ehDiaUtil } from '../../src/engine/calendario';
import { somarDias, somarMeses } from '../../src/engine/datas';
import { hoje } from '../../src/ui/hoje';

afterEach(cleanup);
beforeEach(() => localStorage.clear());

describe('App', () => {
  it('esconde o resultado até o palpite e depois explica', () => {
    render(<App />);
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
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    fireEvent.click(screen.getByRole('button', { name: /pular/i }));
    expect(screen.getByRole('heading', { name: 'Resultado' })).toBeInTheDocument();
    cleanup();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    expect(screen.getByRole('heading', { name: 'Resultado' })).toBeInTheDocument();
  });
  it('labels do cenário são texto simples, com o Termo ao lado', () => {
    render(<App />);
    const label = document.querySelector('label[for="cen-cdi"]');
    expect(label).toHaveTextContent(/^CDI \(% a\.a\.\)$/);
    expect(label?.querySelector('button, [role="note"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /o que é cdi/i }));
    expect(screen.getByLabelText('CDI (% a.a.)')).toHaveAttribute('id', 'cen-cdi');
  });
  it('explica o erro de prazo mínimo da LCI', () => {
    render(<App />);
    fireEvent.input(screen.getByLabelText('Data do resgate'), { target: { value: somarDias(hoje(), 30) } });
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/prazo mínimo legal/);
  });

  describe('validação antes de comparar', () => {
    const semResultado = () => {
      expect(screen.queryByRole('heading', { name: /qual você acha que rende mais/i })).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Resultado' })).toBeNull();
    };
    it('CDI vazio continua vazio e gera alerta, sem resultado', () => {
      render(<App />);
      const cdi = screen.getByLabelText('CDI (% a.a.)') as HTMLInputElement;
      fireEvent.input(cdi, { target: { value: '' } });
      expect(cdi.value).toBe('');
      fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
      expect(screen.getByRole('alert')).toHaveTextContent('Preencha o CDI do cenário.');
      semResultado();
    });
    it.each([
      ['Selic meta (% a.a.)', 'Preencha a Selic meta do cenário.'],
      ['IPCA (% a.a.)', 'Preencha o IPCA do cenário.'],
      ['TR (% a.m.)', 'Preencha a TR do cenário.'],
      ['Valor (R$)', 'Preencha o valor da aplicação.'],
    ])('%s vazio gera alerta', (rotulo, mensagem) => {
      render(<App />);
      const campo = screen.getByLabelText(rotulo) as HTMLInputElement;
      fireEvent.input(campo, { target: { value: '' } });
      expect(campo.value).toBe('');
      fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
      expect(screen.getByRole('alert')).toHaveTextContent(mensagem);
      semResultado();
    });
    it('taxa vazia gera alerta com a opção', () => {
      render(<App />);
      const taxaB = screen.getAllByLabelText('Taxa (%)')[1]!;
      fireEvent.input(taxaB, { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
      expect(screen.getByRole('alert')).toHaveTextContent('Preencha a taxa da Opção B.');
      semResultado();
    });
    it('data da aplicação vazia desliga os prazos e gera alerta humano', () => {
      render(<App />);
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
      render(<App />);
      fireEvent.input(screen.getByLabelText('Data do resgate'), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
      expect(screen.getByRole('alert')).toHaveTextContent('Informe a data do resgate.');
      expect(screen.getByRole('alert')).not.toHaveTextContent(/AAAA-MM-DD/);
      semResultado();
    });
  });

  describe('foco entre as fases', () => {
    it('Comparar leva ao título do palpite; o palpite leva ao título do resultado', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: /qual você acha que rende mais/i }));
      fireEvent.click(screen.getByRole('button', { name: 'A: CDB 103% do CDI' }));
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Resultado' }));
    });
    it('com palpites desligados, Comparar leva direto ao título do resultado', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
      fireEvent.click(screen.getByRole('button', { name: /pular/i }));
      fireEvent.input(screen.getByLabelText('Valor (R$)'), { target: { value: '20000' } });
      screen.getByRole('button', { name: 'Comparar' }).focus();
      fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Resultado' }));
    });
  });

  it('avisa, sem bloquear, quando a aplicação ou o resgate não caem em dia útil', () => {
    render(<App />);
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
    render(<App />);
    fireEvent.input(screen.getByLabelText('Data da aplicação'), { target: { value: '2026-10-01' } });
    fireEvent.input(screen.getByLabelText('Data do resgate'), { target: { value: '2028-10-02' } });
    expect(screen.queryByText(/Não é dia útil/)).toBeNull();
  });

  it('editar um campo depois do resultado esconde o resultado', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    fireEvent.click(screen.getByRole('button', { name: 'A: CDB 103% do CDI' }));
    expect(screen.getByRole('heading', { name: 'Resultado' })).toBeInTheDocument();
    fireEvent.input(screen.getByLabelText('Valor (R$)'), { target: { value: '5000' } });
    expect(screen.queryByRole('heading', { name: 'Resultado' })).toBeNull();
  });
  it('o botão "1 ano" define o resgate como aplicação + 12 meses', () => {
    render(<App />);
    fireEvent.input(screen.getByLabelText('Data da aplicação'), { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByRole('button', { name: '1 ano' }));
    expect(somarMeses('2026-10-01', 12)).toBe('2027-10-01');
    expect(screen.getByLabelText('Data do resgate')).toHaveValue('2027-10-01');
  });
  it('"Religar os palpites" volta a mostrar o palpite', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    fireEvent.click(screen.getByRole('button', { name: /pular/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Religar os palpites' }));
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    expect(screen.getByRole('heading', { name: /qual você acha que rende mais/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Resultado' })).toBeNull();
  });
});

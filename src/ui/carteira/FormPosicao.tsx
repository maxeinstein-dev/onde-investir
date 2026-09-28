import { useState } from 'preact/hooks';
import { DICA_EXTRATO } from '../../conteudo/carteira';
import { ehDataValida, type DataISO } from '../../engine/datas';
import { OfertaInvalidaError } from '../../engine/erros';
import type { OfertaCadastrada } from '../../engine/ofertas';
import { type BaseExtrato, type Posicao, validarPosicao } from '../../engine/posicoes';
import { CampoNumerico } from '../CampoNumerico';
import { DATA_MINIMA, hoje } from '../hoje';
import { FormOfertaCadastrada } from '../ofertas/FormOfertaCadastrada';

export interface PropsFormPosicao {
  /** A posição em edição; null para cadastrar uma nova. */
  inicial: Posicao | null;
  conglomerados: readonly string[];
  gerarId: () => string;
  onSalvar: (p: Posicao) => void;
  onCancelar: () => void;
}

export const ID_FORM_POSICAO = 'posicao';
const ID = ID_FORM_POSICAO;

/** O cadastro de oferta (produto, taxa, emissor, prazo, custo) com o valor aplicado, a data e o extrato opcional. */
export function FormPosicao({ inicial, conglomerados, gerarId, onSalvar, onCancelar }: PropsFormPosicao) {
  const [valorAplicado, setValorAplicado] = useState(inicial?.valorAplicado ?? NaN);
  const [dataAplicacao, setDataAplicacao] = useState<DataISO>(inicial?.dataAplicacao ?? '');
  const [valorExtrato, setValorExtrato] = useState(inicial?.valorExtrato ?? NaN);
  const [dataExtrato, setDataExtrato] = useState<DataISO>(inicial?.dataExtrato ?? '');
  const [baseExtrato, setBaseExtrato] = useState<BaseExtrato>(inicial?.baseExtrato ?? 'BRUTO');
  const dataHoje = hoje();

  const temExtrato = Number.isFinite(valorExtrato) || dataExtrato.trim() !== '';

  /** A posição como vai ser salva. Sem extrato, nem a base vai (o padrão é bruto). */
  function montar(o: OfertaCadastrada): Posicao {
    return {
      ...o, valorAplicado, dataAplicacao,
      ...(temExtrato ? { valorExtrato, dataExtrato, ...(baseExtrato === 'BRUTO' ? {} : { baseExtrato }) } : {}),
      eventos: [],
    };
  }

  /** Mensagem humana para o primeiro campo da posição com problema; depois, as regras do engine. */
  function validar(o: OfertaCadastrada): string | null {
    if (!Number.isFinite(valorAplicado) || valorAplicado <= 0) return 'Preencha o valor aplicado.';
    if (dataAplicacao.trim() === '') return 'Informe a data da aplicação.';
    if (!ehDataValida(dataAplicacao)) return 'A data da aplicação é inválida.';
    if (temExtrato) {
      if (!Number.isFinite(valorExtrato)) return 'Preencha o valor do extrato.';
      if (dataExtrato.trim() === '') return 'Informe a data do extrato.';
      if (!ehDataValida(dataExtrato)) return 'A data do extrato é inválida.';
    }
    try {
      validarPosicao(montar(o), dataHoje);
      return null;
    } catch (e) {
      if (!(e instanceof OfertaInvalidaError)) throw e;
      return `${e.message}.`;
    }
  }

  function limpar() {
    setValorAplicado(NaN);
    setDataAplicacao('');
    setValorExtrato(NaN);
    setDataExtrato('');
    setBaseExtrato('BRUTO');
  }

  function salvar(o: OfertaCadastrada) {
    onSalvar(montar(o));
    if (!inicial) limpar();
  }

  const minimoExtrato = ehDataValida(dataAplicacao) ? dataAplicacao : DATA_MINIMA;
  const extras = (
    <>
      <fieldset class="cadastro__detalhes">
        <legend>Aplicação</legend>
        <div class="campo">
          <label for={`${ID}-valor`}>Valor aplicado (R$)</label>
          <CampoNumerico id={`${ID}-valor`} min="0" step="100" valor={valorAplicado} onChange={setValorAplicado} />
        </div>
        <div class="campo">
          <label for={`${ID}-data`}>Data da aplicação</label>
          <input id={`${ID}-data`} type="date" min={DATA_MINIMA} max={dataHoje} value={dataAplicacao}
            onInput={(e) => setDataAplicacao(e.currentTarget.value)} />
        </div>
      </fieldset>
      <fieldset class="cadastro__detalhes">
        <legend>Extrato (opcional)</legend>
        <p id={`${ID}-extrato-dica`} class="dica">{DICA_EXTRATO}</p>
        <div class="campo">
          <label for={`${ID}-extrato-valor`}>Valor do extrato (R$, opcional)</label>
          <CampoNumerico id={`${ID}-extrato-valor`} min="0" step="0.01" valor={valorExtrato} onChange={setValorExtrato}
            describedBy={`${ID}-extrato-dica`} />
        </div>
        <div class="campo">
          <label for={`${ID}-extrato-data`}>Data do extrato</label>
          <input id={`${ID}-extrato-data`} type="date" min={minimoExtrato} max={dataHoje} value={dataExtrato}
            onInput={(e) => setDataExtrato(e.currentTarget.value)} />
        </div>
        <div class="campo">
          <label for={`${ID}-extrato-base`}>O extrato mostra o valor</label>
          <select id={`${ID}-extrato-base`} value={baseExtrato} onChange={(e) => setBaseExtrato(e.currentTarget.value as BaseExtrato)}>
            <option value="BRUTO">Bruto (antes do IR), o mais comum</option>
            <option value="LIQUIDO">Líquido (depois do IR)</option>
          </select>
        </div>
      </fieldset>
    </>
  );

  return (
    <FormOfertaCadastrada inicial={inicial} conglomerados={conglomerados} gerarId={gerarId} onSalvar={salvar} onCancelar={onCancelar}
      id={ID} titulo="Nova posição" rotuloSalvar="Adicionar posição" tituloEdicao="Editar posição" semPrazoMinimo
      extras={extras} validarExtra={validar}
      estadoExtra={JSON.stringify([valorAplicado, dataAplicacao, valorExtrato, dataExtrato, baseExtrato])} />
  );
}

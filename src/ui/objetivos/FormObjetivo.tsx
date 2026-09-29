// Formulário de um objetivo, com os campos certos para cada tipo (spec §9.1, plano M4a C3). A
// validação humana usa validarObjetivo do engine antes de onSalvar, no mesmo padrão de
// FormOfertaCadastrada: mensagem em role="alert", nada é salvo com erro.
import { useRef, useState } from 'preact/hooks';
import type { ObjetivoSalvo } from '../../armazenamento/objetivos';
import { somarDias } from '../../engine/datas';
import { OfertaInvalidaError } from '../../engine/erros';
import { validarObjetivo, type Objetivo } from '../../engine/sugestao';
import { CampoNumerico } from '../CampoNumerico';
import { DATA_MAXIMA, hoje } from '../hoje';
import './objetivos.css';

export interface PropsFormObjetivo {
  tipo: Objetivo['tipo'];
  onSalvar: (nome: string | undefined, entradas: Objetivo) => void;
  onCancelar: () => void;
  /** A edição de um objetivo já salvo; o tipo precisa bater com `tipo`. */
  inicial?: ObjetivoSalvo;
  /** Prefixo dos ids, para o formulário e a lista ficarem montados ao mesmo tempo. Padrão: "objetivo-form". */
  id?: string;
}

/** Rótulo por extenso de cada tipo de objetivo; reaproveitado pelo seletor de tipo em Objetivos.tsx. */
export const ROTULO_TIPO_OBJETIVO: Record<Objetivo['tipo'], string> = {
  RESERVA: 'Reserva de emergência',
  COM_DATA: 'Meta com data',
  LONGO_PRAZO: 'Longo prazo',
  SEM_OBJETIVO: 'Sem objetivo definido',
  RENDA_MENSAL: 'Renda mensal',
  CARTEIRA_COMBINADA: 'Carteira combinada',
};

const entradasIniciais = (tipo: Objetivo['tipo'], inicial?: ObjetivoSalvo): Objetivo | undefined => (
  inicial && inicial.entradas.tipo === tipo ? inicial.entradas : undefined
);

export function FormObjetivo({ tipo, onSalvar, onCancelar, inicial, id: ID = 'objetivo-form' }: PropsFormObjetivo) {
  const base = entradasIniciais(tipo, inicial);
  const [nome, setNome] = useState(inicial?.nome ?? '');
  const [gastoMensal, setGastoMensal] = useState(
    base?.tipo === 'RESERVA' || base?.tipo === 'CARTEIRA_COMBINADA' ? base.gastoMensal : NaN,
  );
  const [rendaEstavel, setRendaEstavel] = useState(
    base?.tipo === 'RESERVA' || base?.tipo === 'CARTEIRA_COMBINADA' ? base.rendaEstavel : true,
  );
  const [valorAlvo, setValorAlvo] = useState(base?.tipo === 'COM_DATA' ? base.valorAlvo : NaN);
  const [data, setData] = useState(base?.tipo === 'COM_DATA' ? base.data : '');
  const [horizonteAnos, setHorizonteAnos] = useState(
    base?.tipo === 'LONGO_PRAZO' || base?.tipo === 'SEM_OBJETIVO' || base?.tipo === 'CARTEIRA_COMBINADA'
      ? base.horizonteAnos : NaN,
  );
  const [principal, setPrincipal] = useState(
    base?.tipo === 'RENDA_MENSAL' || base?.tipo === 'CARTEIRA_COMBINADA' ? base.principal : NaN,
  );
  const [rendaMensalDesejada, setRendaMensalDesejada] = useState(
    base?.tipo === 'RENDA_MENSAL' ? base.rendaMensalDesejada : NaN,
  );
  const [erro, setErro] = useState<string | null>(null);
  const refTitulo = useRef<HTMLHeadingElement>(null);

  function montar(): Objetivo {
    switch (tipo) {
      case 'RESERVA': return { tipo, gastoMensal, rendaEstavel };
      case 'COM_DATA': return { tipo, valorAlvo, data };
      case 'LONGO_PRAZO':
      case 'SEM_OBJETIVO':
        return { tipo, horizonteAnos };
      case 'RENDA_MENSAL': return { tipo, principal, rendaMensalDesejada };
      case 'CARTEIRA_COMBINADA': return { tipo, principal, gastoMensal, rendaEstavel, horizonteAnos };
    }
  }

  function salvar(e: Event) {
    e.preventDefault();
    const entradas = montar();
    try {
      validarObjetivo(entradas, hoje());
    } catch (err) {
      if (!(err instanceof OfertaInvalidaError)) throw err;
      setErro(err.message);
      return;
    }
    setErro(null);
    onSalvar(nome.trim() === '' ? undefined : nome.trim(), entradas);
  }

  return (
    <form class="formulario cadastro obj-form" onSubmit={salvar} noValidate aria-labelledby={`${ID}-titulo`}>
      <h3 id={`${ID}-titulo`} ref={refTitulo} tabIndex={-1}>
        {inicial ? `Editar objetivo: ${ROTULO_TIPO_OBJETIVO[tipo]}` : `Novo objetivo: ${ROTULO_TIPO_OBJETIVO[tipo]}`}
      </h3>
      <div class="campo">
        <label for={`${ID}-nome`}>Nome do objetivo (opcional)</label>
        <input id={`${ID}-nome`} type="text" maxLength={80} autoComplete="off" value={nome}
          onInput={(e) => setNome(e.currentTarget.value)} />
      </div>

      {tipo === 'RESERVA' && (
        <>
          <div class="campo">
            <label for={`${ID}-gasto-mensal`}>Gasto mensal (R$)</label>
            <CampoNumerico id={`${ID}-gasto-mensal`} min="0" step="0.01" valor={gastoMensal} onChange={setGastoMensal} />
          </div>
          <div role="radiogroup" aria-labelledby={`${ID}-renda-titulo`} class="campo">
            <span id={`${ID}-renda-titulo`}>Renda</span>
            <label class="campo__opcao">
              <input type="radio" name={`${ID}-renda`} checked={rendaEstavel} onChange={() => setRendaEstavel(true)} />
              Estável
            </label>
            <label class="campo__opcao">
              <input type="radio" name={`${ID}-renda`} checked={!rendaEstavel} onChange={() => setRendaEstavel(false)} />
              Variável
            </label>
          </div>
        </>
      )}

      {tipo === 'COM_DATA' && (
        <>
          <div class="campo">
            <label for={`${ID}-valor-alvo`}>Valor-alvo (R$)</label>
            <CampoNumerico id={`${ID}-valor-alvo`} min="0" step="0.01" valor={valorAlvo} onChange={setValorAlvo} />
          </div>
          <div class="campo">
            <label for={`${ID}-data`}>Data</label>
            {/* A data precisa ser no futuro (validarObjetivo rejeita "hoje"): o seletor já começa em amanhã. */}
            <input id={`${ID}-data`} type="date" min={somarDias(hoje(), 1)} max={DATA_MAXIMA} value={data}
              onInput={(e) => setData(e.currentTarget.value)} />
          </div>
        </>
      )}

      {(tipo === 'LONGO_PRAZO' || tipo === 'SEM_OBJETIVO') && (
        <div class="campo">
          <label for={`${ID}-horizonte`}>Horizonte (anos)</label>
          <CampoNumerico id={`${ID}-horizonte`} min="1" step="1" valor={horizonteAnos} onChange={setHorizonteAnos} />
        </div>
      )}

      {tipo === 'RENDA_MENSAL' && (
        <>
          <div class="campo">
            <label for={`${ID}-principal`}>Principal (R$)</label>
            <CampoNumerico id={`${ID}-principal`} min="0" step="0.01" valor={principal} onChange={setPrincipal} />
          </div>
          <div class="campo">
            <label for={`${ID}-renda-mensal-desejada`}>Renda mensal desejada (R$)</label>
            <CampoNumerico id={`${ID}-renda-mensal-desejada`} min="0" step="0.01" valor={rendaMensalDesejada} onChange={setRendaMensalDesejada} />
          </div>
        </>
      )}

      {tipo === 'CARTEIRA_COMBINADA' && (
        <>
          <div class="campo">
            <label for={`${ID}-principal`}>Principal (R$)</label>
            <CampoNumerico id={`${ID}-principal`} min="0" step="0.01" valor={principal} onChange={setPrincipal} />
          </div>
          <div class="campo">
            <label for={`${ID}-gasto-mensal`}>Gasto mensal (R$)</label>
            <CampoNumerico id={`${ID}-gasto-mensal`} min="0" step="0.01" valor={gastoMensal} onChange={setGastoMensal} />
          </div>
          <div role="radiogroup" aria-labelledby={`${ID}-renda-titulo`} class="campo">
            <span id={`${ID}-renda-titulo`}>Renda</span>
            <label class="campo__opcao">
              <input type="radio" name={`${ID}-renda`} checked={rendaEstavel} onChange={() => setRendaEstavel(true)} />
              Estável
            </label>
            <label class="campo__opcao">
              <input type="radio" name={`${ID}-renda`} checked={!rendaEstavel} onChange={() => setRendaEstavel(false)} />
              Variável
            </label>
          </div>
          <div class="campo">
            <label for={`${ID}-horizonte`}>Horizonte (anos)</label>
            <CampoNumerico id={`${ID}-horizonte`} min="1" step="1" valor={horizonteAnos} onChange={setHorizonteAnos} />
          </div>
        </>
      )}

      {erro && <p role="alert" class="erro">{erro}</p>}
      <div class="cadastro__acoes">
        <button type="submit" class="primario">{inicial ? 'Salvar alterações' : 'Salvar objetivo'}</button>
        <button type="button" onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  );
}

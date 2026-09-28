import { useEffect, useRef, useState } from 'preact/hooks';
import { dataBR, ehDataValida } from '../../engine/datas';
import { OfertaInvalidaError, RegraNaoEncontradaError } from '../../engine/erros';
import { conferirPrazoMinimo, validarOfertaCadastrada, type Liquidez, type OfertaCadastrada } from '../../engine/ofertas';
import { ehTesouro, type Oferta } from '../../engine/produtos';
import { dataMinimaResgate, prazoMinimoMeses } from '../../engine/regras/prazoMinimo';
import { CampoNumerico } from '../CampoNumerico';
import { FormOferta, taxaPreenchida } from '../FormOferta';
import { DATA_MAXIMA, DATA_MINIMA, hoje } from '../hoje';
import { Termo } from '../Termo';

export interface PropsFormOfertaCadastrada {
  /** A oferta em edição; null para cadastrar uma nova. */
  inicial: OfertaCadastrada | null;
  /** Conglomerados já usados, sugeridos no campo. */
  conglomerados: readonly string[];
  gerarId: () => string;
  onSalvar: (o: OfertaCadastrada) => void;
  onCancelar: () => void;
  /** Prefixo dos ids: o catálogo e o seletor do comparador ficam montados ao mesmo tempo. */
  id?: string;
  /** Título do formulário de cadastro (na edição, sempre "Editar oferta"). */
  titulo?: string;
  /** Texto do botão de cadastrar. */
  rotuloSalvar?: string;
}

// Rascunho do M3a: a revisão editorial é da tarefa C3.
const DICA_CUSTO = 'Tarifa cobrada pela corretora, se houver. Na renda fixa bancária costuma ser zero.';

const NOVA: Oferta = { produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1 } };

/** Prazo mínimo legal de LCI/LCA para quem aplica hoje; null para os outros produtos (ou sem regra cadastrada). */
function prazoMinimoDeHoje(o: Oferta): { meses: number; data: string } | null {
  if (o.produto !== 'LCI' && o.produto !== 'LCA') return null;
  const comIPCA = o.indexacao.tipo === 'IPCA_MAIS';
  try {
    return { meses: prazoMinimoMeses(o.produto, comIPCA, hoje()), data: dataMinimaResgate(o.produto, comIPCA, hoje()) };
  } catch (e) {
    if (e instanceof RegraNaoEncontradaError) return null;
    throw e;
  }
}

export function FormOfertaCadastrada({
  inicial, conglomerados, gerarId, onSalvar, onCancelar, id: ID = 'cadastro', titulo = 'Nova oferta', rotuloSalvar = 'Adicionar oferta',
}: PropsFormOfertaCadastrada) {
  const [oferta, setOferta] = useState<Oferta>(inicial ? { produto: inicial.produto, indexacao: inicial.indexacao } : NOVA);
  const [emissor, setEmissor] = useState(inicial?.emissor ?? '');
  const [conglomerado, setConglomerado] = useState(inicial?.conglomerado ?? '');
  const [liquidez, setLiquidez] = useState<Liquidez>(inicial?.liquidez ?? 'DIARIA');
  const [vencimento, setVencimento] = useState(inicial?.vencimento ?? '');
  /** Custo extra em % ao ano; NaN com o campo vazio (sem custo). Fica fora de `oferta`: trocar o produto não o apaga. */
  const [custo, setCusto] = useState(inicial?.custoExtraAA === undefined ? NaN : inicial.custoExtraAA * 100);
  const [erro, setErro] = useState<string | null>(null);
  const refTitulo = useRef<HTMLHeadingElement>(null);

  // Ao abrir uma oferta para edição, o foco vai para o título do formulário.
  useEffect(() => {
    if (inicial) refTitulo.current?.focus();
  }, []);

  const tesouro = ehTesouro(oferta.produto);
  const poupanca = oferta.produto === 'POUPANCA';

  /** A oferta como vai ser salva: Tesouro e poupança têm liquidez diária; poupança não tem vencimento. */
  function montar(): OfertaCadastrada {
    const venc = poupanca || vencimento.trim() === '' ? undefined : vencimento;
    const base = {
      id: inicial?.id ?? '', produto: oferta.produto, indexacao: oferta.indexacao,
      emissor: emissor.trim(), conglomerado: conglomerado.trim(), liquidez: tesouro || poupanca ? 'DIARIA' as const : liquidez,
      ...(Number.isFinite(custo) ? { custoExtraAA: custo / 100 } : {}),
    };
    return venc === undefined ? base : { ...base, vencimento: venc };
  }

  const prazoMinimo = prazoMinimoDeHoje(oferta);
  // Data digitada que o engine não aceita (ex.: ano com 5 dígitos): nada de dataBR nem de prazo mínimo com ela.
  const vencimentoInvalido = !poupanca && vencimento.trim() !== '' && !ehDataValida(vencimento);
  const avisoPrazo = vencimentoInvalido ? null : conferirPrazoMinimo(montar(), hoje());

  function editar<T>(set: (v: T) => void) {
    return (v: T) => { set(v); setErro(null); };
  }

  function limpar() {
    setOferta(NOVA);
    setEmissor('');
    setConglomerado('');
    setLiquidez('DIARIA');
    setVencimento('');
    setCusto(NaN);
  }

  function salvar(e: Event) {
    e.preventDefault();
    if (!taxaPreenchida(oferta.indexacao)) {
      setErro('Preencha a taxa da oferta.');
      return;
    }
    const o = montar();
    try {
      validarOfertaCadastrada(o);
    } catch (err) {
      if (!(err instanceof OfertaInvalidaError)) throw err;
      setErro(`${err.message}.`);
      return;
    }
    setErro(null);
    onSalvar(inicial ? o : { ...o, id: gerarId() });
    if (!inicial) limpar();
  }

  return (
    <form class="formulario cadastro" onSubmit={salvar} noValidate aria-labelledby={`${ID}-titulo`}>
      <h3 id={`${ID}-titulo`} ref={refTitulo} tabIndex={-1}>{inicial ? 'Editar oferta' : titulo}</h3>
      <FormOferta id={ID} titulo="Produto e taxa" oferta={oferta} onChange={editar(setOferta)}>
        <label for={`${ID}-custo`}>Custo extra (% ao ano, opcional)</label>
        <CampoNumerico id={`${ID}-custo`} min="0" step="0.01" valor={custo} onChange={editar(setCusto)} describedBy={`${ID}-custo-dica`} />
        <p id={`${ID}-custo-dica`} class="dica">{DICA_CUSTO}</p>
      </FormOferta>
      <fieldset class="cadastro__detalhes">
        <legend>Emissor e prazo</legend>
        <div class="campo">
          <label for={`${ID}-emissor`}>Emissor</label>
          <input id={`${ID}-emissor`} type="text" maxLength={80} autoComplete="off" value={emissor}
            onInput={(e) => editar(setEmissor)(e.currentTarget.value)} />
        </div>
        <div class="campo">
          <label for={`${ID}-conglomerado`}>Conglomerado</label>
          <input id={`${ID}-conglomerado`} type="text" maxLength={80} autoComplete="off" list={`${ID}-conglomerados`}
            value={conglomerado} aria-describedby={`${ID}-conglomerado-dica`}
            onInput={(e) => editar(setConglomerado)(e.currentTarget.value)} />
          <datalist id={`${ID}-conglomerados`}>
            {conglomerados.map((c) => <option key={c} value={c} />)}
          </datalist>
          <p id={`${ID}-conglomerado-dica`} class="dica">
            O grupo financeiro do emissor. A garantia do <Termo id="fgc">FGC</Termo> é contada por conglomerado.
          </p>
        </div>
        {!tesouro && !poupanca && (
          <div class="campo">
            <label for={`${ID}-liquidez`}>Liquidez</label>
            <select id={`${ID}-liquidez`} value={liquidez} onChange={(e) => editar(setLiquidez)(e.currentTarget.value as Liquidez)}>
              <option value="DIARIA">Diária</option>
              <option value="NO_VENCIMENTO">No vencimento</option>
            </select>
            <Termo id="liquidez">O que é liquidez?</Termo>
          </div>
        )}
        {!poupanca && (
          <div class="campo">
            <label for={`${ID}-vencimento`}>Vencimento</label>
            <input id={`${ID}-vencimento`} type="date" min={DATA_MINIMA} max={DATA_MAXIMA} value={vencimento}
              aria-describedby={vencimentoInvalido ? `${ID}-vencimento-dica ${ID}-vencimento-invalido` : `${ID}-vencimento-dica`}
              onInput={(e) => editar(setVencimento)(e.currentTarget.value)} />
            <p id={`${ID}-vencimento-dica`} class="dica">
              {tesouro ? 'Títulos do Tesouro têm liquidez diária e vencimento.' : 'Opcional quando a liquidez é diária.'}
            </p>
            {vencimentoInvalido && <p id={`${ID}-vencimento-invalido`} class="erro">Data inválida</p>}
          </div>
        )}
        {prazoMinimo && (
          <p class="dica cadastro__prazo">
            <Termo id="prazo-minimo">Prazo mínimo legal</Termo>: {prazoMinimo.meses} meses. Aplicando hoje, o resgate só é
            possível a partir de {dataBR(prazoMinimo.data)}.
          </p>
        )}
        {avisoPrazo && <p class="aviso cadastro__aviso">{avisoPrazo}. Nesse caso, a comparação mostra a oferta como indisponível.</p>}
      </fieldset>
      {erro && <p role="alert" class="erro">{erro}</p>}
      <div class="cadastro__acoes">
        <button type="submit" class="primario">{inicial ? 'Salvar alterações' : rotuloSalvar}</button>
        {inicial && <button type="button" onClick={onCancelar}>Cancelar edição</button>}
      </div>
    </form>
  );
}

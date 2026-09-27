import type { ComponentChildren } from 'preact';
import { CampoNumerico } from './CampoNumerico';
import { INDEXACOES_PERMITIDAS, type Indexacao, type Oferta, type TipoIndexacao, type TipoProduto } from '../engine/produtos';

const PRODUTOS: { valor: TipoProduto; rotulo: string }[] = [
  { valor: 'CDB', rotulo: 'CDB' }, { valor: 'RDB', rotulo: 'RDB' }, { valor: 'LC', rotulo: 'LC' },
  { valor: 'LCI', rotulo: 'LCI' }, { valor: 'LCA', rotulo: 'LCA' },
  { valor: 'TESOURO_SELIC', rotulo: 'Tesouro Selic' }, { valor: 'TESOURO_PREFIXADO', rotulo: 'Tesouro Prefixado' },
  { valor: 'TESOURO_IPCA', rotulo: 'Tesouro IPCA+' }, { valor: 'POUPANCA', rotulo: 'Poupança' },
];

const ROTULO_INDEXACAO: Record<TipoIndexacao, string> = {
  POS_CDI: 'Pós-fixado (% do CDI)', PRE: 'Prefixado (% ao ano)', IPCA_MAIS: 'IPCA + (% ao ano)', SELIC: 'Selic', POUPANCA: 'Regra da poupança',
};

function indexacaoPadrao(tipo: TipoIndexacao): Indexacao {
  switch (tipo) {
    case 'POS_CDI': return { tipo, percentualCDI: 1 };
    case 'PRE': return { tipo, taxaAA: 0.12 };
    case 'IPCA_MAIS': return { tipo, taxaRealAA: 0.06 };
    case 'SELIC': return { tipo };
    case 'POUPANCA': return { tipo };
  }
}

/** A taxa da oferta foi preenchida? (vazia ou inválida fica NaN até a validação.) */
export function taxaPreenchida(ix: Indexacao): boolean {
  const t = taxaEmPercentual(ix);
  return t === null || Number.isFinite(t);
}

/** Taxa em % para o campo; null quando a indexação não tem taxa. */
function taxaEmPercentual(ix: Indexacao): number | null {
  switch (ix.tipo) {
    case 'POS_CDI': return ix.percentualCDI * 100;
    case 'PRE': return ix.taxaAA * 100;
    case 'IPCA_MAIS': return ix.taxaRealAA * 100;
    default: return null;
  }
}

function comTaxa(ix: Indexacao, percentual: number): Indexacao {
  const f = percentual / 100;
  switch (ix.tipo) {
    case 'POS_CDI': return { ...ix, percentualCDI: f };
    case 'PRE': return { ...ix, taxaAA: f };
    case 'IPCA_MAIS': return { ...ix, taxaRealAA: f };
    default: return ix;
  }
}

export interface PropsFormOferta {
  id: string;
  titulo: string;
  oferta: Oferta;
  onChange: (o: Oferta) => void;
  /** Campos extras dentro do mesmo grupo, depois da taxa. */
  children?: ComponentChildren;
}

export function FormOferta({ id, titulo, oferta, onChange, children }: PropsFormOferta) {
  const permitidas = INDEXACOES_PERMITIDAS[oferta.produto];
  const taxa = taxaEmPercentual(oferta.indexacao);
  function trocarProduto(produto: TipoProduto) {
    const tipos = INDEXACOES_PERMITIDAS[produto];
    const indexacao = tipos.includes(oferta.indexacao.tipo) ? oferta.indexacao : indexacaoPadrao(tipos[0]);
    onChange({ produto, indexacao });
  }
  return (
    <fieldset class="oferta">
      <legend>{titulo}</legend>
      <label for={`${id}-produto`}>Produto</label>
      <select id={`${id}-produto`} value={oferta.produto} onChange={(e) => trocarProduto(e.currentTarget.value as TipoProduto)}>
        {PRODUTOS.map((p) => <option value={p.valor}>{p.rotulo}</option>)}
      </select>
      {permitidas.length > 1 && (
        <>
          <label for={`${id}-indexacao`}>Rentabilidade</label>
          <select id={`${id}-indexacao`} value={oferta.indexacao.tipo}
            onChange={(e) => onChange({ ...oferta, indexacao: indexacaoPadrao(e.currentTarget.value as TipoIndexacao) })}>
            {permitidas.map((t) => <option value={t}>{ROTULO_INDEXACAO[t]}</option>)}
          </select>
        </>
      )}
      {taxa !== null && (
        <>
          <label for={`${id}-taxa`}>Taxa (%)</label>
          <CampoNumerico id={`${id}-taxa`} step="0.01" valor={taxa}
            onChange={(percentual) => onChange({ ...oferta, indexacao: comTaxa(oferta.indexacao, percentual) })} />
        </>
      )}
      {children}
    </fieldset>
  );
}

import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { descreverProjecao, nomeDoHorizonte, nomesDistintos } from '../../conteudo/comparacao';
import { descreverOferta } from '../../conteudo/motivos';
import type { ColunaHorizonte } from '../../engine/comparacao';
import { dataBR, ehDataValida, type DataISO } from '../../engine/datas';
import { RegraNaoEncontradaError } from '../../engine/erros';
import type { OfertaCadastrada, Projecao } from '../../engine/ofertas';
import { ehIsentoIR, garantiaDe } from '../../engine/produtos';
import { prazoMinimoMeses } from '../../engine/regras/prazoMinimo';
import { formatarMoeda, formatarPercentual } from '../../formato';
import { hoje } from '../hoje';
import { letraDaOferta } from '../letras';
import { PorQueEsseResultado } from '../PorQueEsseResultado';
import { Termo } from '../Termo';

export interface PropsTabelaComparacao {
  /** As ofertas da comparação, uma por coluna. */
  ofertas: readonly OfertaCadastrada[];
  /** Saída de `tabelaPorHorizonte`: cada horizonte vira uma linha. Vazia antes de comparar (só as características). */
  colunas: readonly ColunaHorizonte[];
  /** Data da aplicação, para o prazo mínimo de LCI/LCA; inválida ou vazia, vale hoje. */
  dataAplicacao: DataISO;
  onRemover: (id: string) => void;
}

const PREFIXO = 'comparador';
const ID_LEGENDA = `${PREFIXO}-tabela-legenda`;

/** Id do cabeçalho da coluna da oferta: recebe o foco quando ela entra na comparação. */
export const idColuna = (indice: number): string => `${PREFIXO}-coluna-${indice}`;

function vencimento(o: OfertaCadastrada): string {
  if (o.vencimento === undefined) return 'Sem vencimento';
  return ehDataValida(o.vencimento) ? dataBR(o.vencimento) : 'Data inválida';
}

/** Prazo mínimo legal de LCI/LCA para quem aplica na data; "—" nos outros produtos (ou sem regra cadastrada). */
function prazoMinimo(o: OfertaCadastrada, dataAplicacao: DataISO): string {
  if (o.produto !== 'LCI' && o.produto !== 'LCA') return '—';
  const data = ehDataValida(dataAplicacao) ? dataAplicacao : hoje();
  try {
    return `${prazoMinimoMeses(o.produto, o.indexacao.tipo === 'IPCA_MAIS', data)} meses`;
  } catch (e) {
    if (e instanceof RegraNaoEncontradaError) return '—';
    throw e;
  }
}

const garantia = (o: OfertaCadastrada) =>
  garantiaDe(o.produto) === 'FGC' ? <Termo id="fgc">FGC</Termo> : <Termo id="tesouro">Tesouro Nacional</Termo>;

const CARACTERISTICAS: { rotulo: string; valor: (o: OfertaCadastrada, dataAplicacao: DataISO) => ComponentChildren }[] = [
  { rotulo: 'Rentabilidade', valor: (o) => descreverOferta(o) },
  { rotulo: 'Emissor', valor: (o) => o.emissor },
  { rotulo: 'Liquidez', valor: (o) => (o.liquidez === 'DIARIA' ? 'Diária' : 'Só no vencimento') },
  { rotulo: 'Vencimento', valor: (o) => vencimento(o) },
  { rotulo: 'Prazo mínimo', valor: (o, d) => prazoMinimo(o, d) },
  { rotulo: 'Garantia', valor: (o) => garantia(o) },
  { rotulo: 'Imposto de Renda', valor: (o) => (ehIsentoIR(o.produto) ? 'Isento' : 'Tabela regressiva (de 22,5% a 15%)') },
];

/** A linha do custo extra: só entra na tabela quando alguma oferta tem custo. */
const CUSTO_EXTRA = {
  rotulo: 'Custo extra',
  valor: (o: OfertaCadastrada) => ((o.custoExtraAA ?? 0) > 0 ? `${formatarPercentual(o.custoExtraAA as number)} ao ano` : 'Sem custo'),
};

function Celula({ p, lider, rotulo }: { p: Projecao; lider: boolean; rotulo: string }) {
  // Os passos só são renderizados quando o "Por que?" abre (e ficam depois): a tabela tem até 5 × 6 células.
  const [aberto, setAberto] = useState(false);
  const texto = descreverProjecao(p);
  if (p.estado !== 'DISPONIVEL') return <td role="cell" class="celula celula--estado" data-label={rotulo}>{texto}</td>;
  return (
    <td role="cell" class={lider ? 'celula celula--lider' : 'celula'} data-label={rotulo}>
      <span class="celula__valor">{formatarMoeda(p.liquido)}</span>
      {lider && (
        <>
          <span class="celula__selo" aria-hidden="true">maior</span>
          <span class="visualmente-oculto">(maior valor líquido)</span>
        </>
      )}
      {texto && <span class="celula__nota">{texto}</span>}
      <details class="celula__porque" onToggle={(e) => { if (e.currentTarget.open) setAberto(true); }}>
        <summary>Por que?</summary>
        {aberto && p.etapas.map((etapa, i) => (
          <div key={i}>
            {/* Entre a primeira etapa e a reaplicação, a frase do reinvestimento. */}
            {i > 0 && texto && <p class="celula__reinvestimento">{texto}</p>}
            <PorQueEsseResultado resultado={etapa} />
          </div>
        ))}
      </details>
    </td>
  );
}

/** Título de um bloco de linhas, que ocupa a largura toda; o texto fica fixo à esquerda quando a tabela rola. */
function TituloDoBloco({ id, colunas, children }: { id: string; colunas: number; children: string }) {
  return (
    <tr role="row" class="tabela-comparacao__bloco">
      <th role="rowheader" id={id} scope="rowgroup" colSpan={colunas}><span>{children}</span></th>
    </tr>
  );
}

/** As ofertas lado a lado (colunas), com as características e o valor líquido em cada horizonte (linhas). */
export function TabelaComparacao({ ofertas, colunas, dataAplicacao, onRemover }: PropsTabelaComparacao) {
  const n = ofertas.length;
  const nomes = nomesDistintos(ofertas);
  const idCaracteristicas = `${PREFIXO}-bloco-caracteristicas`;
  const idValores = `${PREFIXO}-bloco-valores`;
  const caracteristicas = ofertas.some((o) => (o.custoExtraAA ?? 0) > 0) ? [...CARACTERISTICAS, CUSTO_EXTRA] : CARACTERISTICAS;
  return (
    // No celular a tabela rola dentro deste contêiner, sem rolar a página; tabindex para rolar pelo teclado.
    <div class="tabela-rolavel" role="region" aria-labelledby={ID_LEGENDA} tabIndex={0}>
      <table role="table" class="tabela-comparacao">
        <caption id={ID_LEGENDA}><span>Comparação de {n} {n === 1 ? 'oferta' : 'ofertas'}</span></caption>
        <thead role="rowgroup">
          <tr role="row">
            <td />
            {ofertas.map((o, i) => (
              <th key={o.id} role="columnheader" scope="col" id={idColuna(i)} tabIndex={-1} class="tabela-comparacao__oferta">
                <span class="tabela-comparacao__letra">{letraDaOferta(i)}</span>
                <span class="tabela-comparacao__nome">{nomes[i]}</span>
              </th>
            ))}
          </tr>
          {/* Os botões ficam numa linha própria, fora do th: o nome da coluna é só a letra e o nome da oferta. */}
          <tr role="row" class="tabela-comparacao__acoes">
            <td />
            {ofertas.map((o, i) => (
              <td key={o.id} role="cell">
                <button type="button" class="tabela-comparacao__tirar" aria-label={`Tirar da comparação: ${nomes[i] ?? ''}`}
                  onClick={() => onRemover(o.id)}>
                  ✕ Tirar da comparação
                </button>
              </td>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup" aria-labelledby={idCaracteristicas}>
          <TituloDoBloco id={idCaracteristicas} colunas={n + 1}>Características</TituloDoBloco>
          {caracteristicas.map((c) => (
            <tr key={c.rotulo} role="row">
              <th role="rowheader" scope="row">{c.rotulo}</th>
              {ofertas.map((o, i) => <td key={o.id} role="cell" data-label={nomes[i]}>{c.valor(o, dataAplicacao)}</td>)}
            </tr>
          ))}
        </tbody>
        {colunas.length > 0 && (
          <tbody role="rowgroup" aria-labelledby={idValores}>
            <TituloDoBloco id={idValores} colunas={n + 1}>Valor líquido</TituloDoBloco>
            {colunas.map((c) => (
              <tr key={c.data} role="row">
                <th role="rowheader" scope="row">
                  {nomeDoHorizonte(c)}
                  {c.rotulo !== 'Sua data' && <span class="tabela__data">{dataBR(c.data)}</span>}
                </th>
                {ofertas.map((o, i) => {
                  const p = c.projecoes[i];
                  return p ? <Celula key={o.id} p={p} lider={c.lideres.includes(i)} rotulo={nomes[i] ?? ''} /> : <td key={o.id} role="cell" />;
                })}
              </tr>
            ))}
          </tbody>
        )}
      </table>
    </div>
  );
}

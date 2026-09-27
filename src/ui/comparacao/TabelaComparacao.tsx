import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { descreverProjecao, nomeDoHorizonte, nomeOferta } from '../../conteudo/comparacao';
import { descreverOferta } from '../../conteudo/motivos';
import type { ColunaHorizonte } from '../../engine/comparacao';
import { dataBR, ehDataValida, type DataISO } from '../../engine/datas';
import { RegraNaoEncontradaError } from '../../engine/erros';
import type { OfertaCadastrada, Projecao } from '../../engine/ofertas';
import { ehIsentoIR, garantiaDe } from '../../engine/produtos';
import { prazoMinimoMeses } from '../../engine/regras/prazoMinimo';
import { formatarMoeda } from '../../formato';
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
  { rotulo: 'Imposto de Renda', valor: (o) => (ehIsentoIR(o.produto) ? 'Isento' : 'Tabela regressiva') },
];

function Celula({ p, lider }: { p: Projecao; lider: boolean }) {
  // Os passos só são renderizados quando o "Por que?" abre (e ficam depois): a tabela tem até 5 × 6 células.
  const [aberto, setAberto] = useState(false);
  const texto = descreverProjecao(p);
  if (p.estado !== 'DISPONIVEL') return <td class="celula celula--estado">{texto}</td>;
  return (
    <td class={lider ? 'celula celula--lider' : 'celula'}>
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
    <tr class="tabela-comparacao__bloco">
      <th id={id} scope="rowgroup" colSpan={colunas}><span>{children}</span></th>
    </tr>
  );
}

/** As ofertas lado a lado (colunas), com as características e o valor líquido em cada horizonte (linhas). */
export function TabelaComparacao({ ofertas, colunas, dataAplicacao, onRemover }: PropsTabelaComparacao) {
  const n = ofertas.length;
  const idCaracteristicas = `${PREFIXO}-bloco-caracteristicas`;
  const idValores = `${PREFIXO}-bloco-valores`;
  return (
    // No celular a tabela rola dentro deste contêiner, sem rolar a página; tabindex para rolar pelo teclado.
    <div class="tabela-rolavel" role="region" aria-labelledby={ID_LEGENDA} tabIndex={0}>
      <table class="tabela-comparacao">
        <caption id={ID_LEGENDA}>Comparação de {n} {n === 1 ? 'oferta' : 'ofertas'}</caption>
        <thead>
          <tr>
            <td />
            {ofertas.map((o, i) => (
              <th key={o.id} scope="col" id={idColuna(i)} tabIndex={-1} class="tabela-comparacao__oferta">
                <span class="tabela-comparacao__letra">{letraDaOferta(i)}</span>
                <span class="tabela-comparacao__nome">{nomeOferta(o)}</span>
                <button type="button" class="tabela-comparacao__tirar" aria-label={`Tirar ${nomeOferta(o)} da comparação`}
                  onClick={() => onRemover(o.id)}>
                  ✕ Tirar da comparação
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody aria-labelledby={idCaracteristicas}>
          <TituloDoBloco id={idCaracteristicas} colunas={n + 1}>Características</TituloDoBloco>
          {CARACTERISTICAS.map((c) => (
            <tr key={c.rotulo}>
              <th scope="row">{c.rotulo}</th>
              {ofertas.map((o) => <td key={o.id}>{c.valor(o, dataAplicacao)}</td>)}
            </tr>
          ))}
        </tbody>
        {colunas.length > 0 && (
          <tbody aria-labelledby={idValores}>
            <TituloDoBloco id={idValores} colunas={n + 1}>Valor líquido</TituloDoBloco>
            {colunas.map((c) => (
              <tr key={c.data}>
                <th scope="row">
                  {nomeDoHorizonte(c)}
                  {c.rotulo !== 'Sua data' && <span class="tabela__data">{dataBR(c.data)}</span>}
                </th>
                {ofertas.map((o, i) => {
                  const p = c.projecoes[i];
                  return p ? <Celula key={o.id} p={p} lider={c.lideres.includes(i)} /> : <td key={o.id} />;
                })}
              </tr>
            ))}
          </tbody>
        )}
      </table>
    </div>
  );
}

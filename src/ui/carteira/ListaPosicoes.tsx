import { useEffect, useRef, useState } from 'preact/hooks';
import { CURVA_CONTRATADA, EXTRATO_SUSPEITO, textoDaVencida, textoDoExtrato } from '../../conteudo/carteira';
import { nomeOferta } from '../../conteudo/comparacao';
import { textoDaConferencia } from '../../conteudo/motivos';
import { dataBR } from '../../engine/datas';
import { formatarMoeda } from '../../formato';
import type { LinhaPosicao } from './resumo';

export interface PropsListaPosicoes {
  linhas: readonly LinhaPosicao[];
  onEditar: (id: string) => void;
  onRemover: (id: string) => void;
}

/** Id do título do cartão da posição de índice `i`: recebe o foco depois de salvar ou de remover. */
export const idTituloPosicao = (i: number) => `posicao-${i}-titulo`;

function Valor({ linha }: { linha: LinhaPosicao }) {
  if ('erro' in linha) return <p class="aviso">Não deu para calcular: {linha.erro} Esta posição fica fora do total e do FGC.</p>;
  const { valor } = linha;
  const quando = valor.vencida ? 'No vencimento' : 'Hoje';
  const extrato = valor.extrato;
  const motivo = extrato ? textoDaConferencia(extrato) : null;
  return (
    <>
      {valor.vencida && <p class="cartao__detalhe">{textoDaVencida(valor.data)}</p>}
      <p class="posicao__valor">{quando}: {formatarMoeda(valor.bruto)} bruto, {formatarMoeda(valor.liquido)} líquido</p>
      {valor.marcacaoAMercado && <p class="dica">{CURVA_CONTRATADA}</p>}
      {extrato && <p class="cartao__detalhe">{textoDoExtrato(extrato)}</p>}
      {extrato?.suspeita && <p class="aviso">{EXTRATO_SUSPEITO}</p>}
      {motivo && <p class="dica">{motivo}</p>}
    </>
  );
}

interface PropsCartao { linha: LinhaPosicao; indice: number; nivel: 3 | 4; onEditar: () => void; onRemover: () => void }

function Cartao({ linha, indice, nivel, onEditar, onRemover }: PropsCartao) {
  const Titulo = nivel === 3 ? 'h3' : 'h4';
  const [confirmando, setConfirmando] = useState(false);
  const botaoConfirmar = useRef<HTMLButtonElement>(null);
  const idTitulo = idTituloPosicao(indice);
  const p = linha.posicao;

  useEffect(() => {
    if (confirmando) botaoConfirmar.current?.focus();
  }, [confirmando]);

  return (
    <li>
      <article class="cartao cartao--posicao" aria-labelledby={idTitulo}>
        <Titulo id={idTitulo} tabIndex={-1}>{nomeOferta(p)}</Titulo>
        <p class="cartao__detalhe">Conglomerado: {p.conglomerado}</p>
        <p class="cartao__detalhe">Aplicado em {dataBR(p.dataAplicacao)}: {formatarMoeda(p.valorAplicado)}</p>
        <Valor linha={linha} />
        {confirmando ? (
          <div class="cartao__confirmacao">
            <p>Remover esta posição?</p>
            <button type="button" ref={botaoConfirmar} onClick={onRemover}>Sim, remover</button>
            <button type="button" onClick={() => setConfirmando(false)}>Cancelar</button>
          </div>
        ) : (
          <div class="cartao__acoes">
            <button type="button" onClick={onEditar}>Editar</button>
            <button type="button" onClick={() => setConfirmando(true)}>Remover</button>
          </div>
        )}
      </article>
    </li>
  );
}

const ehVencida = (l: LinhaPosicao) => 'valor' in l && l.valor.vencida;
const ID_VENCIDAS = 'posicoes-vencidas-titulo';

/**
 * As posições em cartões: as que ainda valem na lista principal e as vencidas num grupo à parte. O índice do cartão
 * (e o id do título) é o da posição na lista completa, para o foco depois de salvar ou remover.
 */
export function ListaPosicoes({ linhas, onEditar, onRemover }: PropsListaPosicoes) {
  const comIndice = linhas.map((linha, indice) => ({ linha, indice }));
  const ativas = comIndice.filter((x) => !ehVencida(x.linha));
  const vencidas = comIndice.filter((x) => ehVencida(x.linha));
  const cartao = ({ linha, indice }: { linha: LinhaPosicao; indice: number }, nivel: 3 | 4) => (
    <Cartao key={linha.posicao.id} linha={linha} indice={indice} nivel={nivel}
      onEditar={() => onEditar(linha.posicao.id)} onRemover={() => onRemover(linha.posicao.id)} />
  );
  return (
    <>
      {ativas.length > 0 && <ul class="lista-ofertas" aria-label="Posições cadastradas">{ativas.map((x) => cartao(x, 3))}</ul>}
      {vencidas.length > 0 && (
        <section class="carteira__vencidas" aria-labelledby={ID_VENCIDAS}>
          <h3 id={ID_VENCIDAS}>Vencidas</h3>
          <ul class="lista-ofertas" aria-label="Posições vencidas">{vencidas.map((x) => cartao(x, 4))}</ul>
        </section>
      )}
    </>
  );
}

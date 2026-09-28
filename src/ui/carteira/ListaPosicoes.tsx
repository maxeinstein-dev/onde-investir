import { useEffect, useRef, useState } from 'preact/hooks';
import { CURVA_CONTRATADA, EXTRATO_SUSPEITO, textoDoExtrato } from '../../conteudo/carteira';
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
      {valor.vencida && <p class="cartao__detalhe">Venceu em {dataBR(valor.data)}</p>}
      <p class="posicao__valor">{quando}: {formatarMoeda(valor.bruto)} bruto, {formatarMoeda(valor.liquido)} líquido</p>
      {valor.marcacaoAMercado && <p class="dica">{CURVA_CONTRATADA}</p>}
      {extrato && <p class="cartao__detalhe">{textoDoExtrato(extrato)}</p>}
      {extrato?.suspeita && <p class="aviso">{EXTRATO_SUSPEITO}</p>}
      {motivo && <p class="dica">{motivo}</p>}
    </>
  );
}

function Cartao({ linha, indice, onEditar, onRemover }: { linha: LinhaPosicao; indice: number; onEditar: () => void; onRemover: () => void }) {
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
        <h3 id={idTitulo} tabIndex={-1}>{nomeOferta(p)}</h3>
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

export function ListaPosicoes({ linhas, onEditar, onRemover }: PropsListaPosicoes) {
  return (
    <ul class="lista-ofertas" aria-label="Posições cadastradas">
      {linhas.map((l, i) => (
        <Cartao key={l.posicao.id} linha={l} indice={i} onEditar={() => onEditar(l.posicao.id)} onRemover={() => onRemover(l.posicao.id)} />
      ))}
    </ul>
  );
}

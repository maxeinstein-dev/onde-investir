import { useEffect, useRef, useState } from 'preact/hooks';
import { descreverOferta } from '../../conteudo/motivos';
import { dataBR, ehDataValida } from '../../engine/datas';
import type { OfertaCadastrada } from '../../engine/ofertas';
import { garantiaDe } from '../../engine/produtos';
import { letraDaOferta } from '../letras';
import { Termo } from '../Termo';

export interface PropsListaOfertas {
  ofertas: readonly OfertaCadastrada[];
  onEditar: (id: string) => void;
  onRemover: (id: string) => void;
}

/** "Liquidez diária", "Liquidez diária · vence em dd/mm/aaaa" ou "No vencimento: dd/mm/aaaa". */
export function descreverPrazo(o: OfertaCadastrada): string {
  // Vencimento que o engine não aceita (ex.: ano com 5 dígitos): o cartão avisa em vez de quebrar em dataBR.
  if (o.vencimento !== undefined && !ehDataValida(o.vencimento)) {
    return `${o.liquidez === 'NO_VENCIMENTO' ? 'No vencimento' : 'Liquidez diária'} · Data inválida`;
  }
  if (o.liquidez === 'NO_VENCIMENTO') return o.vencimento ? `No vencimento: ${dataBR(o.vencimento)}` : 'No vencimento';
  return o.vencimento ? `Liquidez diária · vence em ${dataBR(o.vencimento)}` : 'Liquidez diária';
}

function Cartao({ o, indice, onEditar, onRemover }: { o: OfertaCadastrada; indice: number; onEditar: () => void; onRemover: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const botaoConfirmar = useRef<HTMLButtonElement>(null);
  const idTitulo = `oferta-${indice}-titulo`;

  useEffect(() => {
    if (confirmando) botaoConfirmar.current?.focus();
  }, [confirmando]);

  return (
    <li>
      <article class="cartao cartao--oferta" aria-labelledby={idTitulo}>
        <h3 id={idTitulo} tabIndex={-1}>{letraDaOferta(indice)}: {descreverOferta(o)}</h3>
        <p class="cartao__detalhe">Emissor: {o.emissor} · Conglomerado: {o.conglomerado}</p>
        <p class="cartao__detalhe">{descreverPrazo(o)}</p>
        <p class="cartao__garantia">
          Garantia: {garantiaDe(o.produto) === 'FGC' ? <Termo id="fgc">FGC</Termo> : <Termo id="tesouro">Tesouro Nacional</Termo>}
        </p>
        {confirmando ? (
          <div class="cartao__confirmacao">
            <p>Remover esta oferta?</p>
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

export function ListaOfertas({ ofertas, onEditar, onRemover }: PropsListaOfertas) {
  if (ofertas.length === 0) return <p class="dica">Cadastre as ofertas que você está avaliando para comparar.</p>;
  return (
    <ul class="lista-ofertas" aria-label="Ofertas cadastradas">
      {ofertas.map((o, i) => (
        <Cartao key={o.id} o={o} indice={i} onEditar={() => onEditar(o.id)} onRemover={() => onRemover(o.id)} />
      ))}
    </ul>
  );
}

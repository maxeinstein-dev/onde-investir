import { useEffect, useRef, useState } from 'preact/hooks';
import { LIMITE_COMPARACAO } from '../../armazenamento/comparacao';
import { LIMITE_OFERTAS } from '../../armazenamento/ofertas';
import { nomeOferta } from '../../conteudo/comparacao';
import type { OfertaCadastrada } from '../../engine/ofertas';
import { FormOfertaCadastrada } from '../ofertas/FormOfertaCadastrada';
import { novoIdOferta } from '../ofertas/MinhasOfertas';
import { idColuna } from './TabelaComparacao';

export interface PropsAdicionarOferta {
  catalogo: readonly OfertaCadastrada[];
  /** Os ids na comparação, na ordem das colunas. */
  selecao: readonly string[];
  /** Uma oferta do catálogo entra na comparação. */
  onAdicionar: (id: string) => void;
  /** Uma oferta nova, já validada e com id: quem chama grava no catálogo e põe na comparação. */
  onCriar: (o: OfertaCadastrada) => void;
  gerarId?: () => string;
  /** Com menos de duas ofertas, o botão é a ação principal da tela. */
  destaque?: boolean;
}

const PREFIXO = 'comparador-adicionar';
export const ID_BOTAO_ADICIONAR = PREFIXO;
const ID_PAINEL = `${PREFIXO}-painel`;
const ID_LIMITE = `${PREFIXO}-limite`;

/**
 * "+ Adicionar oferta": um painel de revelação (não um `<dialog>`) com as ofertas do catálogo que ainda não estão
 * na comparação e o cadastro rápido de uma nova. Ao adicionar, o painel fecha e o foco vai para a coluna nova.
 */
export function AdicionarOferta({ catalogo, selecao, onAdicionar, onCriar, gerarId = novoIdOferta, destaque = false }: PropsAdicionarOferta) {
  const [aberto, setAberto] = useState(false);
  /** Id do elemento que recebe o foco depois da próxima renderização (a coluna nova já está na tabela). */
  const [foco, setFoco] = useState<string | null>(null);
  const botao = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (foco === null) return;
    document.getElementById(foco)?.focus();
    setFoco(null);
  }, [foco]);

  const cheia = selecao.length >= LIMITE_COMPARACAO;
  const disponiveis = catalogo.filter((o) => !selecao.includes(o.id));
  const catalogoCheio = catalogo.length >= LIMITE_OFERTAS;
  const conglomerados = [...new Set(catalogo.map((o) => o.conglomerado))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  // Aberto com a comparação cheia não acontece pelo botão; se a seleção encher por fora, o painel some.
  const visivel = aberto && !cheia;

  function entrou() {
    setAberto(false);
    setFoco(idColuna(selecao.length));
  }

  function escolher(id: string) {
    onAdicionar(id);
    entrou();
  }

  function criar(o: OfertaCadastrada) {
    onCriar(o);
    entrou();
  }

  function aoTeclar(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    setAberto(false);
    botao.current?.focus();
  }

  return (
    <div class="adicionar">
      <button type="button" id={ID_BOTAO_ADICIONAR} ref={botao} class={destaque ? 'primario' : undefined}
        aria-expanded={visivel} aria-controls={ID_PAINEL} disabled={cheia} aria-describedby={cheia ? ID_LIMITE : undefined}
        onClick={() => setAberto(!aberto)}>
        + Adicionar oferta ({selecao.length} de {LIMITE_COMPARACAO})
      </button>
      {cheia && <p id={ID_LIMITE} class="dica">Limite de {LIMITE_COMPARACAO} ofertas</p>}
      <div id={ID_PAINEL} class="adicionar__painel" hidden={!visivel} onKeyDown={aoTeclar}>
        <section class="adicionar__catalogo" aria-labelledby={`${PREFIXO}-catalogo-titulo`}>
          <h3 id={`${PREFIXO}-catalogo-titulo`}>Do catálogo</h3>
          {catalogo.length === 0 ? (
            <p class="dica">O catálogo ainda está vazio. Crie uma oferta aqui embaixo.</p>
          ) : disponiveis.length === 0 ? (
            <p class="dica">Todas as ofertas do catálogo já estão na comparação.</p>
          ) : (
            <ul class="adicionar__lista">
              {disponiveis.map((o) => (
                <li key={o.id}>
                  <span class="adicionar__nome">{nomeOferta(o)}</span>
                  <button type="button" aria-label={`Adicionar ${nomeOferta(o)}`} onClick={() => escolher(o.id)}>Adicionar</button>
                </li>
              ))}
            </ul>
          )}
        </section>
        {catalogoCheio ? (
          <p class="dica">
            O catálogo chegou ao limite de {LIMITE_OFERTAS} ofertas. Para criar outra, remova uma na aba Catálogo.
          </p>
        ) : (
          <FormOfertaCadastrada id="comparador-nova" titulo="Criar uma nova" rotuloSalvar="Salvar no catálogo e comparar"
            inicial={null} conglomerados={conglomerados} gerarId={gerarId} onSalvar={criar} onCancelar={() => {}} />
        )}
      </div>
    </div>
  );
}

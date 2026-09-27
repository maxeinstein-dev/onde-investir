import { useEffect, useRef, useState } from 'preact/hooks';
import { LIMITE_OFERTAS } from '../../armazenamento/ofertas';
import type { OfertaCadastrada } from '../../engine/ofertas';
import { ExportarImportar } from './ExportarImportar';
import { FormOfertaCadastrada } from './FormOfertaCadastrada';
import { ListaOfertas } from './ListaOfertas';

let sequencia = 0;
/** Id local da oferta: não sai do navegador, só precisa ser único na lista. */
export function novoIdOferta(): string {
  sequencia += 1;
  const aleatorio = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `o-${sequencia}-${aleatorio}`;
}

export interface PropsMinhasOfertas {
  ofertas: readonly OfertaCadastrada[];
  /** A lista nova (cadastro, edição, remoção ou importação). Quem chama persiste. */
  onChange: (ofertas: OfertaCadastrada[]) => void;
  gerarId?: () => string;
  /** Os ids na comparação; com `onComparar`, cada cartão ganha o botão "Comparar". */
  selecao?: readonly string[];
  onComparar?: (id: string) => void;
}

export function MinhasOfertas({ ofertas, onChange, gerarId = novoIdOferta, selecao = [], onComparar }: PropsMinhasOfertas) {
  const [editando, setEditando] = useState<string | null>(null);
  const emEdicao = ofertas.find((o) => o.id === editando) ?? null;
  const conglomerados = [...new Set(ofertas.map((o) => o.conglomerado))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const cheio = ofertas.length >= LIMITE_OFERTAS;

  const secao = useRef<HTMLElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  /** Para onde o foco vai depois de remover ou salvar; o efeito aplica depois que a lista nova aparece. */
  const [foco, setFoco] = useState<{ cartao: number; reserva: 'lista' | 'formulario' } | null>(null);

  useEffect(() => {
    if (!foco) return;
    const cartao = secao.current?.querySelector<HTMLElement>(`#oferta-${foco.cartao}-titulo`);
    const reserva = foco.reserva === 'lista' ? titulo.current : secao.current?.querySelector<HTMLElement>('#cadastro-titulo');
    (cartao ?? reserva)?.focus();
  }, [foco]);

  function salvar(o: OfertaCadastrada) {
    const indice = ofertas.findIndex((x) => x.id === o.id);
    onChange(indice >= 0 ? ofertas.map((x) => (x.id === o.id ? o : x)) : [...ofertas, o]);
    // Depois de "Salvar alterações", o foco vai para o cartão salvo (ou, sem ele, para o título do formulário).
    if (indice >= 0) setFoco({ cartao: indice, reserva: 'formulario' });
    setEditando(null);
  }

  function remover(id: string) {
    const indice = ofertas.findIndex((o) => o.id === id);
    const restantes = ofertas.filter((o) => o.id !== id);
    onChange(restantes);
    // O botão removido some: o foco vai para a oferta que ocupa o lugar dela, ou para o título da seção.
    setFoco({ cartao: indice < restantes.length ? indice : -1, reserva: 'lista' });
    if (editando === id) setEditando(null);
  }

  return (
    <section class="minhas-ofertas" aria-labelledby="ofertas-titulo" ref={secao}>
      <h2 id="ofertas-titulo" ref={titulo} tabIndex={-1}>Catálogo de ofertas</h2>
      <ListaOfertas ofertas={ofertas} onEditar={setEditando} onRemover={remover}
        comparacao={onComparar && { selecao, onComparar }} />
      {cheio && !emEdicao ? (
        <p class="dica">Limite de {LIMITE_OFERTAS} ofertas: remova uma para cadastrar outra.</p>
      ) : (
        <FormOfertaCadastrada key={emEdicao?.id ?? 'nova'} inicial={emEdicao} conglomerados={conglomerados} gerarId={gerarId}
          onSalvar={salvar} onCancelar={() => setEditando(null)} />
      )}
      <ExportarImportar ofertas={ofertas} gerarId={gerarId} onImportar={(novas) => onChange([...ofertas, ...novas])} />
    </section>
  );
}

import { useState } from 'preact/hooks';
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
}

export function MinhasOfertas({ ofertas, onChange, gerarId = novoIdOferta }: PropsMinhasOfertas) {
  const [editando, setEditando] = useState<string | null>(null);
  const emEdicao = ofertas.find((o) => o.id === editando) ?? null;
  const conglomerados = [...new Set(ofertas.map((o) => o.conglomerado))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const cheio = ofertas.length >= LIMITE_OFERTAS;

  function salvar(o: OfertaCadastrada) {
    const existe = ofertas.some((x) => x.id === o.id);
    onChange(existe ? ofertas.map((x) => (x.id === o.id ? o : x)) : [...ofertas, o]);
    setEditando(null);
  }

  function remover(id: string) {
    onChange(ofertas.filter((o) => o.id !== id));
    if (editando === id) setEditando(null);
  }

  return (
    <section class="minhas-ofertas" aria-labelledby="ofertas-titulo">
      <h2 id="ofertas-titulo">Minhas ofertas</h2>
      <ListaOfertas ofertas={ofertas} onEditar={setEditando} onRemover={remover} />
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

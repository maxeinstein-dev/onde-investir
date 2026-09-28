import type { DicaContextual } from '../../conteudo/dicas';
import type { IdLicao } from '../../conteudo/licoes/tipos';
import { LinkLicao } from '../aprender/LinkLicao';
import { MarkdownRestrito } from '../MarkdownRestrito';

export interface PropsDicas {
  /** No máximo 2, já sem as dispensadas (ver `dicasPara`). */
  dicas: readonly DicaContextual[];
  /** Prefixo dos ids. */
  prefixo: string;
  onVerLicao?: ((id: IdLicao) => void) | undefined;
  /** "Dispensar": quem chama grava; sem ele, o botão não aparece. */
  onDispensar?: ((id: string) => void) | undefined;
}

/** As dicas contextuais acima do resultado: o texto, a fonte, "Ver lição" e "Dispensar". */
export function Dicas({ dicas, prefixo, onVerLicao, onDispensar }: PropsDicas) {
  if (dicas.length === 0) return null;
  const idTitulo = `${prefixo}-titulo`;
  return (
    <aside class="dicas" aria-labelledby={idTitulo}>
      <h3 id={idTitulo} tabIndex={-1}>Dicas</h3>
      {/* role="list" explícito: com list-style: none, o Safari tira a semântica de lista. */}
      <ul class="dicas__lista" role="list">
        {dicas.map((d, i) => (
          <li key={d.id} class="dica-contextual">
            <p><MarkdownRestrito texto={d.texto} inline /></p>
            <p class="dica-contextual__acoes">
              <a href={d.fonte} target="_blank" rel="noopener noreferrer">Fonte</a>
              <LinkLicao licao={d.licao} onVerLicao={onVerLicao} />
              {onDispensar && (
                <button type="button" class="link" onClick={() => onDispensar(d.id)}>
                  Dispensar{' '}<span class="visualmente-oculto">a dica {i + 1}</span>
                </button>
              )}
            </p>
          </li>
        ))}
      </ul>
    </aside>
  );
}

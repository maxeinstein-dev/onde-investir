import { vocePassaSaber } from '../../conteudo/dicas';
import type { IdLicao } from '../../conteudo/licoes/tipos';
import { LinkLicao } from './LinkLicao';

const ID_TITULO = 'voce-sabia-titulo';

/** O cartão "Você sabia?" do topo da página: um item por visita, em rodízio, com a fonte e a lição. */
export function VoceSabia({ indiceVisita, onVerLicao }: { indiceVisita: number; onVerLicao?: (id: IdLicao) => void }) {
  const item = vocePassaSaber(indiceVisita);
  return (
    <aside class="voce-sabia" aria-labelledby={ID_TITULO}>
      <h2 id={ID_TITULO} class="voce-sabia__titulo">Você sabia?</h2>
      <p>{item.texto}</p>
      <p class="voce-sabia__links">
        <a href={item.fonte} target="_blank" rel="noopener noreferrer">Fonte</a>
        <LinkLicao licao={item.licao} onVerLicao={onVerLicao} />
      </p>
    </aside>
  );
}

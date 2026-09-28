import { licaoPorId } from '../../conteudo/licoes';
import type { IdLicao } from '../../conteudo/licoes/tipos';

/** O hash de uma lição (`#aprender/fgc`) e do índice (`#aprender`): a aba é o prefixo antes da `/` (ver Abas). */
export const ABA_APRENDER = 'aprender';
export const hashDaLicao = (id: IdLicao | null) => (id === null ? `#${ABA_APRENDER}` : `#${ABA_APRENDER}/${id}`);

/**
 * "Ver lição", dos alertas, das dicas e do "Você sabia?". É um link de verdade (abre em outra aba); no clique,
 * `onVerLicao` troca de aba sem recarregar. Sem `onVerLicao`, fica o hash, que o App também entende.
 */
export function LinkLicao({ licao, onVerLicao }: { licao: IdLicao; onVerLicao?: ((id: IdLicao) => void) | undefined }) {
  const titulo = licaoPorId(licao)?.titulo ?? '';
  return (
    <a href={hashDaLicao(licao)} class="link-licao" onClick={(e) => {
      if (!onVerLicao) return;
      e.preventDefault();
      onVerLicao(licao);
    }}>
      Ver lição<span class="visualmente-oculto">: {titulo}</span>
    </a>
  );
}

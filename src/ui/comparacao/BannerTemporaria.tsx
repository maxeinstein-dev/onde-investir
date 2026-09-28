export const ID_BANNER_TEMPORARIA = 'temporaria-titulo';

export interface PropsBannerTemporaria {
  /** "Comparação da lição …", "Comparação compartilhada com N ofertas". */
  texto: string;
  /** O cenário pedido caiu no manual (sem o Focus). */
  aviso?: string | null;
  /** Já salvas no catálogo: o botão de salvar some. */
  salvas: boolean;
  /** O resultado de salvar: a confirmação (no contêiner vivo) ou o erro. */
  mensagem?: { texto: string; erro: boolean } | null;
  onSalvar: () => void;
  onVoltar: () => void;
}

/** O aviso da comparação temporária, acima do comparador, com salvar no catálogo e voltar para a comparação salva. */
export function BannerTemporaria({ texto, aviso, salvas, mensagem, onSalvar, onVoltar }: PropsBannerTemporaria) {
  return (
    <section class="temporaria" aria-labelledby={ID_BANNER_TEMPORARIA}>
      <p id={ID_BANNER_TEMPORARIA} class="temporaria__titulo" tabIndex={-1}>{texto}</p>
      <p class="dica">Ela vale só nesta tela: a sua comparação e o seu catálogo continuam como estavam.</p>
      {aviso && <p class="aviso">{aviso}</p>}
      <div class="temporaria__acoes">
        {!salvas && <button type="button" onClick={onSalvar}>Salvar estas ofertas no catálogo</button>}
        <button type="button" onClick={onVoltar}>Voltar para a minha comparação</button>
      </div>
      <p role="status" class="dica">{mensagem && !mensagem.erro ? mensagem.texto : ''}</p>
      {mensagem?.erro && <p role="alert" class="erro">{mensagem.texto}</p>}
    </section>
  );
}

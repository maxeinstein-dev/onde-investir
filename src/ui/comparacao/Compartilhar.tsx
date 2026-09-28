import { useEffect, useRef, useState } from 'preact/hooks';
import { codificar, type EstadoCompartilhado, urlCompartilhavel } from '../../armazenamento/link';

const LEVA = 'Ele leva as ofertas, o valor, as datas e o cenário, sem a sua carteira.';
export const LINK_COPIADO = `Link copiado. ${LEVA}`;
export const COPIE_O_LINK = `Copie o link abaixo. ${LEVA}`;

interface Saida { chave: string; status: string; url?: string }

/**
 * "Compartilhar esta comparação": o link (`#comparar/c1.…`) vai para a área de transferência; sem ela (ou com a
 * permissão negada), aparece num campo somente leitura, já selecionado. O status fica num contêiner vivo permanente
 * e vale para a comparação em que apareceu.
 */
export function Compartilhar({ estado, prefixo }: { estado: EstadoCompartilhado; prefixo: string }) {
  // Pelo conteúdo, não pela referência: quem monta o estado pode recriar o objeto a cada renderização.
  const chave = JSON.stringify(estado);
  const [saidaSalva, setSaida] = useState<Saida | null>(null);
  const saida = saidaSalva?.chave === chave ? saidaSalva : null;
  const campo = useRef<HTMLInputElement>(null);
  const montado = useRef(true);
  useEffect(() => () => { montado.current = false; }, []);

  useEffect(() => {
    if (saida?.url === undefined) return;
    campo.current?.focus();
    campo.current?.select();
  }, [saida?.url]);

  async function compartilhar() {
    let url: string;
    try {
      url = urlCompartilhavel(await codificar(estado));
    } catch (e) {
      const motivo = e instanceof Error ? ` ${e.message.replace(/\.$/, '')}.` : '';
      if (montado.current) setSaida({ chave, status: `Não deu para criar o link desta comparação.${motivo}` });
      return;
    }
    try {
      if (!navigator.clipboard) throw new Error('sem clipboard');
      await navigator.clipboard.writeText(url);
      if (montado.current) setSaida({ chave, status: LINK_COPIADO });
    } catch {
      if (montado.current) setSaida({ chave, status: COPIE_O_LINK, url });
    }
  }

  const idCampo = `${prefixo}-link`;
  return (
    <div class="compartilhar">
      <button type="button" onClick={() => void compartilhar()}>Compartilhar esta comparação</button>
      {saida?.url !== undefined && (
        <div class="campo compartilhar__campo">
          <label for={idCampo}>Link da comparação</label>
          <input id={idCampo} type="text" readOnly value={saida.url} ref={campo} onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
      <p role="status" class="dica">{saida?.status ?? ''}</p>
    </div>
  );
}

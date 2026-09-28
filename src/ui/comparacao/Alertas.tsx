import { textoDoAlerta } from '../../conteudo/alertas';
import { GLOSSARIO } from '../../conteudo/glossario';
import { chaveDoAlerta, type Alerta } from '../../engine/alertas';
import type { Horizonte } from '../../engine/comparacao';
import type { OfertaCadastrada } from '../../engine/ofertas';
import { Termo } from '../Termo';

export interface PropsAlertas {
  alertas: readonly Alerta[];
  ofertas: readonly OfertaCadastrada[];
  /** Os horizontes da tabela, para o nome do prazo nos textos. */
  horizontes: readonly Horizonte[];
  /** Prefixo dos ids. */
  prefixo?: string;
}

/**
 * Os alertas que ensinam, em cartões: o que acontece, por quê e o termo do glossário. Não interrompem: sem
 * role="alert" e sem foco automático, porque aparecem junto com o resultado, que já recebe o foco.
 */
export function Alertas({ alertas, ofertas, horizontes, prefixo = 'alertas' }: PropsAlertas) {
  if (alertas.length === 0) return null;
  const idTitulo = `${prefixo}-titulo`;
  return (
    <section class="alertas" aria-labelledby={idTitulo}>
      <h3 id={idTitulo}>Alertas</h3>
      {/* role="list" explícito: com list-style: none, o Safari tira a semântica de lista. */}
      <ul class="alertas__lista" role="list">
        {alertas.map((a) => {
          const t = textoDoAlerta(a, ofertas, horizontes);
          // Key pela chave do alerta (com o id da oferta), não pelo índice: tirar uma oferta não passa o estado
          // de um cartão (a dica fixada) para o alerta de outra.
          return (
            <li key={chaveDoAlerta(a, ofertas)} class="alerta">
              <h4 class="alerta__titulo">{t.titulo}</h4>
              <p>{t.oQue}</p>
              <p class="alerta__porque">{t.porQue}</p>
              <Termo id={t.termo}>Saiba mais{' '}<span class="visualmente-oculto">sobre {GLOSSARIO[t.termo].termo}</span></Termo>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

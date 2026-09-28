import { textoDoAlerta } from '../../conteudo/alertas';
import { GLOSSARIO } from '../../conteudo/glossario';
import type { Alerta } from '../../engine/alertas';
import type { Horizonte } from '../../engine/comparacao';
import type { OfertaCadastrada } from '../../engine/ofertas';
import { Termo } from '../Termo';

export interface PropsAlertas {
  alertas: readonly Alerta[];
  ofertas: readonly OfertaCadastrada[];
  /** Os horizontes da tabela, para o nome do prazo nos textos. */
  horizontes: readonly Horizonte[];
}

/**
 * Os alertas que ensinam, em cartões: o que acontece, por quê e o termo do glossário. Não interrompem: sem
 * role="alert" e sem foco automático, porque aparecem junto com o resultado, que já recebe o foco.
 */
export function Alertas({ alertas, ofertas, horizontes }: PropsAlertas) {
  if (alertas.length === 0) return null;
  return (
    <section class="alertas" aria-labelledby="comparador-alertas-titulo">
      <h3 id="comparador-alertas-titulo">Alertas</h3>
      {/* role="list" explícito: com list-style: none, o Safari tira a semântica de lista. */}
      <ul class="alertas__lista" role="list">
        {alertas.map((a, i) => {
          const t = textoDoAlerta(a, ofertas, horizontes);
          return (
            <li key={`${a.tipo}-${i}`} class="alerta">
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

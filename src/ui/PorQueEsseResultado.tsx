import { explicarSimulacao } from '../conteudo/explicacoes';
import type { ResultadoSimulacao } from '../engine/produtos';
import { formatarMoeda } from '../formato';
import { Termo } from './Termo';

function Passos({ resultado }: { resultado: ResultadoSimulacao }) {
  return (
    <ol class="passos">
      {explicarSimulacao(resultado).map((p) => (
        <li class={`passo passo--${p.id}`}>
          <div class="passo__linha">
            <span>{p.sinal} {p.termo ? <Termo id={p.termo}>{p.titulo}</Termo> : p.titulo}</span>
            <span class="passo__valor">{formatarMoeda(p.valor)}</span>
          </div>
          <p class="passo__curto">{p.curto}</p>
          {p.matematica && (
            <details class="passo__matematica">
              <summary>Ver a matemática</summary>
              <p>{p.matematica}</p>
              {p.fonte && <a href={p.fonte} target="_blank" rel="noopener noreferrer">Fonte oficial</a>}
            </details>
          )}
        </li>
      ))}
    </ol>
  );
}

export interface PropsPorQueEsseResultado {
  resultado: ResultadoSimulacao;
  /** Quando a aplicação venceu e foi reaplicada: a frase do reinvestimento e os passos da segunda etapa. */
  reaplicacao?: { frase: string; resultado: ResultadoSimulacao };
}

export function PorQueEsseResultado({ resultado, reaplicacao }: PropsPorQueEsseResultado) {
  return (
    <details class="porque" open>
      <summary>Por que esse resultado?</summary>
      <Passos resultado={resultado} />
      {reaplicacao && (
        <>
          <p class="porque__reaplicacao">{reaplicacao.frase}</p>
          <Passos resultado={reaplicacao.resultado} />
        </>
      )}
    </details>
  );
}

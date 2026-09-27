// PROVISÓRIO (Tarefa C4): só o estado da carga e um seletor mínimo de cenário.
// A Tarefa C5 substitui o conteúdo (valores atuais, origem por grupo, premissas, campos manuais),
// mantendo as props abaixo.
import type { PreferenciasCenario } from '../armazenamento/preferencias';
import type { CenarioAtivo, EscolhaCenario } from '../dados/cenarios';
import type { IndicadoresCarregados, StatusFonte } from '../dados/indicadores';

export interface PropsPainelIndicadores {
  /** null enquanto carrega. */
  indicadores: IndicadoresCarregados | null;
  preferencias: PreferenciasCenario;
  /** O cenário em uso, calculado pelo App a partir das preferências e dos indicadores. */
  ativo: CenarioAtivo;
  /** Frases de `explicarCenario` para o cenário em uso. */
  explicacao: readonly string[];
  /** Nova escolha, premissas ou valores manuais. O App persiste. */
  onChange: (p: PreferenciasCenario) => void;
}

const OPCOES: { valor: EscolhaCenario; rotulo: string }[] = [
  { valor: 'SOBEM', rotulo: 'Juros sobem' },
  { valor: 'BASE', rotulo: 'Base (Focus)' },
  { valor: 'CAEM', rotulo: 'Juros caem' },
  { valor: 'MANUAL', rotulo: 'Manual' },
];

const ORIGEM: Record<StatusFonte, string> = {
  REDE: 'atualizado agora', CACHE: 'do cache', CACHE_VENCIDO: 'cache vencido', FALHOU: 'indisponível',
};

export function PainelIndicadores({ indicadores, preferencias, ativo, explicacao, onChange }: PropsPainelIndicadores) {
  const projetaveis = indicadores !== null && indicadores.atuais !== null && indicadores.focus !== null && indicadores.reunioes !== null;
  // Sem dados para projetar, o cenário em uso é o manual, mesmo que a escolha salva seja outra.
  const selecionada: EscolhaCenario = ativo.projetado ? preferencias.escolha : 'MANUAL';
  return (
    <section class="painel" aria-labelledby="painel-titulo">
      <h2 id="painel-titulo">Indicadores e cenário</h2>
      {indicadores === null ? (
        <p aria-live="polite">Buscando indicadores no Banco Central…</p>
      ) : (
        <>
          <p aria-live="polite" class="dica">
            Banco Central: SGS {ORIGEM[indicadores.status.sgs]}; Focus {ORIGEM[indicadores.status.focus]}; Copom {ORIGEM[indicadores.status.copom]}.
          </p>
          <div role="radiogroup" aria-labelledby="painel-cenario" class="painel__cenarios">
            <span id="painel-cenario" class="painel__rotulo">Cenário</span>
            {OPCOES.map((o) => {
              const desabilitada = o.valor !== 'MANUAL' && !projetaveis;
              return (
                <label key={o.valor} class="painel__opcao">
                  <input type="radio" name="cenario" value={o.valor} checked={selecionada === o.valor} disabled={desabilitada}
                    onChange={() => onChange({ ...preferencias, escolha: o.valor })} />
                  {o.rotulo}{desabilitada && ' (faltam dados)'}
                </label>
              );
            })}
          </div>
          {explicacao.map((frase) => <p key={frase} class="dica">{frase}</p>)}
        </>
      )}
    </section>
  );
}

import { useMemo, useState } from 'preact/hooks';
import { armazenamentoLocal } from '../armazenamento/navegador';
import { lerOfertas, salvarOfertas } from '../armazenamento/ofertas';
import { lerPreferencias, salvarPreferencias, type PreferenciasCenario } from '../armazenamento/preferencias';
import { explicarCenario } from '../conteudo/comparacao';
import { cenarioAtivo, type CenarioAtivo } from '../dados/cenarios';
import type { IndicadoresCarregados } from '../dados/indicadores';
import type { OfertaCadastrada } from '../engine/ofertas';
import { Abas } from './Abas';
import { Comparacao } from './comparacao/Comparacao';
import { DueloRapido } from './DueloRapido';
import { MinhasOfertas } from './ofertas/MinhasOfertas';
import { PainelIndicadores } from './PainelIndicadores';
import { SEM_INDICADORES, useIndicadores } from './useIndicadores';

const CARREGANDO = 'Enquanto os indicadores carregam, vale o cenário manual.';

/** O cenário em uso: enquanto carrega, o manual; depois, o escolhido (ou o manual, se faltar dado). */
function calcularAtivo(ind: IndicadoresCarregados | null, p: PreferenciasCenario): CenarioAtivo {
  return ind === null
    ? cenarioAtivo('MANUAL', SEM_INDICADORES, p.premissas, p.manual)
    : cenarioAtivo(p.escolha, ind, p.premissas, p.manual);
}

export interface PropsApp {
  /** Para testes e para trocar a fonte; por padrão, `fetch` + localStorage + `Date.now()`. */
  carregar?: () => Promise<IndicadoresCarregados>;
}

export function App({ carregar }: PropsApp = {}) {
  const armazenamento = useMemo(armazenamentoLocal, []);
  const indicadores = useIndicadores(carregar);
  const [preferencias, setPreferencias] = useState(() => lerPreferencias(armazenamento));
  const [ofertas, setOfertas] = useState(() => lerOfertas(armazenamento));

  // Memorizado: o objeto do cenário só muda quando muda a entrada, e trocar o cenário invalida resultados.
  const ativo = useMemo(() => calcularAtivo(indicadores, preferencias), [indicadores, preferencias]);
  const explicacao = useMemo(() => explicarCenario(ativo.projetado, ativo.motivoManual, {
    dataColetaFocus: indicadores?.focus?.dataColeta,
    focusDefasado: indicadores?.focusDefasado,
    k: preferencias.premissas.k,
  }), [ativo, indicadores, preferencias.premissas.k]);
  const descricaoCenario = indicadores === null ? CARREGANDO : explicacao.join(' ');

  function mudarPreferencias(p: PreferenciasCenario) {
    setPreferencias(p);
    salvarPreferencias(armazenamento, p);
  }

  function mudarOfertas(o: OfertaCadastrada[]) {
    setOfertas(o);
    salvarOfertas(armazenamento, o);
  }

  return (
    <main class="pagina">
      <header>
        <h1>Rende</h1>
        <p>Compare investimentos pelo que sobra no bolso e entenda o porquê de cada resultado.</p>
        <p class="aviso">Conteúdo educativo: não é recomendação de investimento.</p>
      </header>

      <PainelIndicadores indicadores={indicadores} preferencias={preferencias} ativo={ativo} explicacao={explicacao}
        onChange={mudarPreferencias} />

      <Abas rotulo="O que você quer fazer" abas={[
        {
          id: 'ofertas', rotulo: 'Comparar ofertas', conteudo: (
            <>
              <MinhasOfertas ofertas={ofertas} onChange={mudarOfertas} />
              <Comparacao ofertas={ofertas} cenario={ativo.cenario} descricaoCenario={descricaoCenario} />
            </>
          ),
        },
        { id: 'duelo', rotulo: 'Duelo rápido', conteudo: <DueloRapido cenario={ativo.cenario} descricaoCenario={descricaoCenario} /> },
      ]} />
    </main>
  );
}

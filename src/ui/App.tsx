import { useEffect, useMemo, useState } from 'preact/hooks';
import { adicionar, lerSelecao, salvarSelecao, sincronizarSelecao } from '../armazenamento/comparacao';
import { armazenamentoLocal } from '../armazenamento/navegador';
import { lerOfertas, salvarOfertas } from '../armazenamento/ofertas';
import { lerPosicoes, salvarPosicoes } from '../armazenamento/posicoes';
import { lerPreferencias, salvarPreferencias, type PreferenciasCenario } from '../armazenamento/preferencias';
import { explicarCenario } from '../conteudo/comparacao';
import { cenarioAtivo, usaSoManual, type CenarioAtivo } from '../dados/cenarios';
import type { IndicadoresCarregados } from '../dados/indicadores';
import { cenarioComHistorico } from '../engine/historico';
import type { OfertaCadastrada } from '../engine/ofertas';
import { itemFGCDaPosicao, type Posicao } from '../engine/posicoes';
import { Abas, useAbaDaUrl } from './Abas';
import { Carteira } from './carteira/Carteira';
import { Comparador } from './comparacao/Comparador';
import { idColuna } from './comparacao/TabelaComparacao';
import { MinhasOfertas } from './ofertas/MinhasOfertas';
import { hoje } from './hoje';
import { PainelIndicadores } from './PainelIndicadores';
import { type CarregarHistorico, useHistorico } from './useHistorico';
import { SEM_INDICADORES, useIndicadores } from './useIndicadores';

const CARREGANDO = 'Enquanto os indicadores carregam, vale o cenário manual.';
const FALHA_AO_GRAVAR = 'Não deu para salvar neste navegador. Exporte suas ofertas para não perdê-las.';

const ABAS = ['comparar', 'catalogo', 'carteira'] as const;
/** As abas do M2 ("Comparar ofertas" e "Duelo rápido") viraram a tela única de comparação. */
const APELIDOS = { duelo: 'comparar', ofertas: 'comparar' };

/** O cenário em uso: enquanto carrega, o manual; depois, o escolhido (ou o manual, se faltar dado). */
function calcularAtivo(ind: IndicadoresCarregados | null, p: PreferenciasCenario): CenarioAtivo {
  return ind === null
    ? cenarioAtivo('MANUAL', SEM_INDICADORES, p.premissas, p.manual)
    : cenarioAtivo(p.escolha, ind, p.premissas, p.manual);
}

export interface PropsApp {
  /** Para testes e para trocar a fonte; por padrão, `fetch` + localStorage + `Date.now()`. */
  carregar?: () => Promise<IndicadoresCarregados>;
  /** O histórico do Banco Central para as posições; por padrão, `fetch` + localStorage + `Date.now()`. */
  carregarHistorico?: CarregarHistorico;
}

export function App({ carregar, carregarHistorico }: PropsApp = {}) {
  const armazenamento = useMemo(armazenamentoLocal, []);
  const indicadores = useIndicadores(carregar);
  const [preferencias, setPreferencias] = useState(() => lerPreferencias(armazenamento));
  const [ofertas, setOfertas] = useState(() => lerOfertas(armazenamento));
  const [posicoes, setPosicoes] = useState(() => lerPosicoes(armazenamento, hoje()));
  // Sem seleção salva (primeira visita ao M2.1), a comparação começa vazia, mesmo com ofertas no catálogo.
  const [selecaoSalva, setSelecaoSalva] = useState(() => lerSelecao(armazenamento));
  const [aba, irPara] = useAbaDaUrl(ABAS, APELIDOS);
  /** Id do elemento que recebe o foco depois da próxima renderização (a coluna nova, na aba Comparar). */
  const [foco, setFoco] = useState<string | null>(null);

  /** O primeiro erro de um rascunho do painel; enquanto houver, o botão Comparar fica desabilitado. */
  const [cenarioInvalido, setCenarioInvalido] = useState<string | null>(null);
  /** O navegador recusou uma gravação (cheio ou bloqueado): o aviso fica até a página recarregar. */
  const [falhouAoGravar, setFalhouAoGravar] = useState(false);

  // Derivada na renderização: ids de ofertas que saíram do catálogo (ou repetidos) nunca chegam ao comparador.
  const selecao = useMemo(() => sincronizarSelecao(selecaoSalva, ofertas), [selecaoSalva, ofertas]);

  // Memorizado pelas entradas que o cenário usa de fato, porque trocar o objeto do cenário invalida os resultados.
  // Só manual (escolhido, carregando ou sem dados): os valores manuais. Projetado: também escolha e premissas.
  const soManual = usaSoManual(preferencias.escolha, indicadores);
  const ativo = useMemo(
    () => calcularAtivo(indicadores, preferencias),
    [indicadores, soManual ? null : preferencias.escolha, soManual ? null : preferencias.premissas, preferencias.manual],
  );
  const explicacao = useMemo(() => explicarCenario(ativo.projetado, ativo.motivoManual, {
    dataColetaFocus: indicadores?.focus?.dataColeta,
    focusDefasado: indicadores?.focusDefasado,
    k: preferencias.premissas.k,
  }), [ativo, indicadores, preferencias.premissas.k]);
  const descricaoCenario = indicadores === null ? CARREGANDO : explicacao.join(' ');

  // O histórico do Banco Central, uma vez quando há posições, desde a aplicação mais antiga.
  const desde = posicoes.reduce<string | null>((min, p) => (min === null || p.dataAplicacao < min ? p.dataAplicacao : min), null);
  const historico = useHistorico(desde, carregarHistorico);
  const series = historico.fase === 'pronto' ? historico.carregado.series : null;
  /** O cenário da carteira: o realizado onde há histórico e o cenário ativo no resto. */
  const daCarteira = useMemo(() => {
    if (series === null) return { cenario: ativo.cenario, lacunas: 0, invalido: false };
    try {
      const cenario = cenarioComHistorico(series, ativo.cenario);
      return { cenario, lacunas: cenario.lacunas.length, invalido: false };
    } catch (e) {
      // Dado fora da faixa de sanidade: o histórico inteiro fica de lado, e a Carteira avisa.
      if (!(e instanceof RangeError)) throw e;
      return { cenario: ativo.cenario, lacunas: 0, invalido: true };
    }
  }, [series, ativo.cenario]);
  const dataHoje = hoje();
  /** As posições como itens do FGC, para o alerta da comparação (o valor é o da comparação). */
  const carteiraFGC = useMemo(
    () => posicoes.map((p) => itemFGCDaPosicao(p, dataHoje, daCarteira.cenario)),
    [posicoes, dataHoje, daCarteira.cenario],
  );
  const conglomerados = useMemo(
    () => [...new Set([...ofertas, ...posicoes].map((o) => o.conglomerado))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [ofertas, posicoes],
  );

  useEffect(() => {
    if (foco === null) return;
    document.getElementById(foco)?.focus();
    setFoco(null);
  }, [foco]);

  function mudarPreferencias(p: PreferenciasCenario) {
    setPreferencias(p);
    if (!salvarPreferencias(armazenamento, p)) setFalhouAoGravar(true);
  }

  function mudarSelecao(ids: readonly string[], catalogo: readonly OfertaCadastrada[] = ofertas) {
    const nova = sincronizarSelecao(ids, catalogo);
    setSelecaoSalva(nova);
    if (!salvarSelecao(armazenamento, nova)) setFalhouAoGravar(true);
  }

  function mudarOfertas(o: OfertaCadastrada[]) {
    setOfertas(o);
    if (!salvarOfertas(armazenamento, o)) setFalhouAoGravar(true);
    // Oferta removida do catálogo sai da comparação (e da seleção salva).
    const sincronizada = sincronizarSelecao(selecao, o);
    if (sincronizada.length !== selecao.length) mudarSelecao(sincronizada, o);
  }

  function mudarPosicoes(p: Posicao[]) {
    setPosicoes(p);
    if (!salvarPosicoes(armazenamento, p)) setFalhouAoGravar(true);
  }

  function criarOferta(o: OfertaCadastrada) {
    const catalogo = [...ofertas, o];
    setOfertas(catalogo);
    if (!salvarOfertas(armazenamento, catalogo)) setFalhouAoGravar(true);
    mudarSelecao(adicionar(selecao, o.id).ids, catalogo);
  }

  /** "Comparar" num cartão do catálogo: entra na comparação, a aba troca e o foco vai para a coluna nova. */
  function compararDoCatalogo(id: string) {
    const r = adicionar(selecao, id);
    if (r.erro) return;
    mudarSelecao(r.ids);
    irPara('comparar');
    setFoco(idColuna(r.ids.indexOf(id)));
  }

  return (
    <main class="pagina">
      <header>
        <h1>Rende</h1>
        <p>Compare investimentos pelo que sobra no bolso e entenda o porquê de cada resultado.</p>
        <p class="aviso">Conteúdo educativo: não é recomendação de investimento.</p>
      </header>

      {falhouAoGravar && <p role="alert" class="erro">{FALHA_AO_GRAVAR}</p>}

      <PainelIndicadores indicadores={indicadores} preferencias={preferencias} ativo={ativo} explicacao={explicacao}
        onChange={mudarPreferencias} onCenarioInvalido={setCenarioInvalido} />

      <Abas rotulo="O que você quer fazer" ativa={aba} onAtivar={irPara} abas={[
        {
          id: 'comparar', rotulo: 'Comparar', conteudo: (
            <Comparador catalogo={ofertas} selecao={selecao} onMudarSelecao={mudarSelecao} onCriarOferta={criarOferta}
              cenario={ativo.cenario} descricaoCenario={descricaoCenario} cenarioInvalido={cenarioInvalido} carteira={carteiraFGC} />
          ),
        },
        {
          id: 'catalogo', rotulo: 'Catálogo',
          conteudo: (
            <MinhasOfertas ofertas={ofertas} onChange={mudarOfertas} selecao={selecao} onComparar={compararDoCatalogo}
              posicoes={posicoes} onImportarPosicoes={(novas) => mudarPosicoes([...posicoes, ...novas])} />
          ),
        },
        {
          id: 'carteira', rotulo: 'Carteira', conteudo: (
            <Carteira posicoes={posicoes} onChange={mudarPosicoes} cenario={daCarteira.cenario} historico={historico}
              lacunas={daCarteira.lacunas} historicoInvalido={daCarteira.invalido} conglomerados={conglomerados} />
          ),
        },
      ]} />
    </main>
  );
}

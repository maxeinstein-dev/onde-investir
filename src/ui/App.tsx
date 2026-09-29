import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { adicionar, lerSelecao, salvarSelecao, sincronizarSelecao } from '../armazenamento/comparacao';
import { decodificar, type EstadoCompartilhado, lerEstadoDoHash, limparEstadoDoHash } from '../armazenamento/link';
import { armazenamentoLocal } from '../armazenamento/navegador';
import { lerOfertas, salvarOfertas } from '../armazenamento/ofertas';
import { lerPosicoes, salvarPosicoes } from '../armazenamento/posicoes';
import { lerObjetivos, salvarObjetivos, type ObjetivoSalvo } from '../armazenamento/objetivos';
import { lerPreferencias, salvarPreferencias, type PreferenciasCenario } from '../armazenamento/preferencias';
import {
  contarVisita, dispensarDica, lerProgresso, marcarConcluida, type Progresso, registrarPalpite, salvarProgresso,
} from '../armazenamento/progresso';
import { AVISO_TURNSTILE } from '../conteudo/rendaVariavel';
import { explicarCenario } from '../conteudo/comparacao';
import { type CasoClassico, type IdLicao, type Licao, montarExperimente } from '../conteudo/licoes/tipos';
import { idLicaoValido } from '../conteudo/licoes/titulos';
import { cenarioAtivo, usaSoManual, type CenarioAtivo } from '../dados/cenarios';
import type { IndicadoresCarregados } from '../dados/indicadores';
import type { DataISO } from '../engine/datas';
import { cenarioComHistorico } from '../engine/historico';
import type { OfertaCadastrada } from '../engine/ofertas';
import { itemFGCDaPosicao, type Posicao } from '../engine/posicoes';
import { Abas, useAbaDaUrl } from './Abas';
import { ABA_APRENDER, Aprender } from './aprender/Aprender';
import { VoceSabia } from './aprender/VoceSabia';
import { Carteira } from './carteira/Carteira';
import { BannerTemporaria, ID_BANNER_TEMPORARIA } from './comparacao/BannerTemporaria';
import { Comparador, ID_TITULO_COMPARADOR } from './comparacao/Comparador';
import { idColuna } from './comparacao/TabelaComparacao';
import {
  avisoDoCenario, type ComparacaoTemporaria, type OrigemTemporaria, salvarNoCatalogo, temporariaDoExperimente, temporariaDoLink,
  textoDoBanner,
} from './comparacao/temporaria';
import { MinhasOfertas, novoIdOferta } from './ofertas/MinhasOfertas';
import { Objetivos } from './objetivos/Objetivos';
import { RendaVariavel } from './rendaVariavel/RendaVariavel';
import { hoje } from './hoje';
import { PainelIndicadores } from './PainelIndicadores';
import { PainelRecolhivel } from './PainelRecolhivel';
import { textoResumoCenario } from './ResumoCenario';
import { type CarregarHistorico, useHistorico } from './useHistorico';
import { SEM_INDICADORES, useIndicadores } from './useIndicadores';

const CARREGANDO = 'Enquanto os indicadores carregam, vale o cenário manual.';
const FALHA_AO_GRAVAR = 'Não deu para salvar neste navegador. Exporte suas ofertas para não perdê-las.';
const LINK_INVALIDO = 'Este link de comparação não pôde ser aberto.';

const ABAS = ['comparar', 'catalogo', 'carteira', 'objetivos', 'renda-variavel', ABA_APRENDER] as const;
/** As abas do M2 ("Comparar ofertas" e "Duelo rápido") viraram a tela única de comparação. */
const APELIDOS = { duelo: 'comparar', ofertas: 'comparar' };

/** O cenário em uso: enquanto carrega, o manual; depois, o escolhido (ou o manual, se faltar dado). */
function calcularAtivo(ind: IndicadoresCarregados | null, p: PreferenciasCenario): CenarioAtivo {
  return ind === null
    ? cenarioAtivo('MANUAL', SEM_INDICADORES, p.premissas, p.manual)
    : cenarioAtivo(p.escolha, ind, p.premissas, p.manual);
}

/**
 * O cenário ativo, memorizado pelas entradas que ele usa de fato, porque trocar o objeto do cenário invalida os
 * resultados. Só manual (escolhido, carregando ou sem dados): os valores manuais. Projetado: também escolha e premissas.
 */
function useCenarioAtivo(ind: IndicadoresCarregados | null, p: PreferenciasCenario): CenarioAtivo {
  const soManual = usaSoManual(p.escolha, ind);
  return useMemo(() => calcularAtivo(ind, p), [ind, soManual ? null : p.escolha, soManual ? null : p.premissas, p.manual]);
}

/** A lição do hash (`#aprender/fgc`); null no índice ou se o id não for de nenhuma lição. */
function licaoDoHash(): IdLicao | null {
  const prefixo = `#${ABA_APRENDER}/`;
  if (!location.hash.startsWith(prefixo)) return null;
  const id = location.hash.slice(prefixo.length);
  return idLicaoValido(id) ? id : null;
}

/** O cenário que vai no link: o em uso de fato (o manual, se o pedido caiu nele por falta de dados). */
function useCenarioDoLink(p: PreferenciasCenario, a: CenarioAtivo): EstadoCompartilhado['cenario'] {
  const escolha = a.projetado === null ? 'MANUAL' : p.escolha;
  return useMemo(() => ({ escolha, premissas: p.premissas, manual: p.manual }), [escolha, p.premissas, p.manual]);
}

/** A mensagem de salvar no catálogo vale para a comparação temporária em que apareceu. */
interface MensagemTemporaria { texto: string; erro: boolean; chave: string }

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
  const [objetivos, setObjetivos] = useState(() => lerObjetivos(armazenamento));
  // Sem seleção salva (primeira visita ao M2.1), a comparação começa vazia, mesmo com ofertas no catálogo.
  const [selecaoSalva, setSelecaoSalva] = useState(() => lerSelecao(armazenamento));
  const [aba, irPara] = useAbaDaUrl(ABAS, APELIDOS);
  /** Id do elemento que recebe o foco depois da próxima renderização (a coluna nova, na aba Comparar). */
  const [foco, setFoco] = useState<string | null>(null);
  /** A lição aberta na trilha; null = o índice. Fica no hash (`#aprender/fgc`) e sobrevive à troca de aba. */
  const [licao, setLicao] = useState<IdLicao | null>(licaoDoHash);
  /** Cada carregamento do app conta uma visita (o "Você sabia?" muda com elas). */
  const [progresso, setProgresso] = useState<Progresso>(() => contarVisita(lerProgresso(armazenamento)));
  /** A comparação do "Experimente", de um caso clássico ou de um link: só em memória. */
  const [temporaria, setTemporaria] = useState<ComparacaoTemporaria | null>(null);
  const [mensagemSalva, setMensagem] = useState<MensagemTemporaria | null>(null);
  /** O motivo de um link que não abriu; null sem erro. */
  const [erroLink, setErroLink] = useState<string | null>(null);

  /** O primeiro erro de um rascunho do painel; enquanto houver, o botão Comparar fica desabilitado. */
  const [cenarioInvalido, setCenarioInvalido] = useState<string | null>(null);
  /** O navegador recusou uma gravação (cheio ou bloqueado): o aviso fica até a página recarregar. */
  const [falhouAoGravar, setFalhouAoGravar] = useState(false);

  // Derivada na renderização: ids de ofertas que saíram do catálogo (ou repetidos) nunca chegam ao comparador.
  const selecao = useMemo(() => sincronizarSelecao(selecaoSalva, ofertas), [selecaoSalva, ofertas]);

  const ativo = useCenarioAtivo(indicadores, preferencias);
  const explicacao = useMemo(() => explicarCenario(ativo.projetado, ativo.motivoManual, {
    dataColetaFocus: indicadores?.focus?.dataColeta,
    focusDefasado: indicadores?.focusDefasado,
    k: preferencias.premissas.k,
  }), [ativo, indicadores, preferencias.premissas.k]);
  const descricaoCenario = indicadores === null ? CARREGANDO : explicacao.join(' ');

  // O cenário da comparação temporária: o pedido (a escolha da lição, ou tudo do link), com as premissas e os
  // valores manuais da pessoa no que faltar. Não muda as preferências. Sem pedido, o mesmo do painel.
  const pedido = temporaria?.cenario;
  const prefsTemporaria: PreferenciasCenario = {
    escolha: pedido?.escolha ?? preferencias.escolha,
    premissas: pedido?.premissas ?? preferencias.premissas,
    manual: pedido?.manual ?? preferencias.manual,
  };
  const ativoTemporaria = useCenarioAtivo(indicadores, prefsTemporaria);
  const descricaoTemporaria = useMemo(() => (indicadores === null ? CARREGANDO : explicarCenario(
    ativoTemporaria.projetado, ativoTemporaria.motivoManual,
    { dataColetaFocus: indicadores.focus?.dataColeta, focusDefasado: indicadores.focusDefasado, k: prefsTemporaria.premissas.k },
  ).join(' ')), [ativoTemporaria, indicadores, prefsTemporaria.premissas.k]);
  const avisoTemporaria = pedido && indicadores !== null ? avisoDoCenario(pedido.escolha, ativoTemporaria.projetado !== null) : null;
  const ofertasTemporarias = temporaria?.ofertas;
  const catalogoTemporaria = useMemo(
    () => (ofertasTemporarias === undefined ? ofertas : [...ofertasTemporarias, ...ofertas]),
    [ofertasTemporarias, ofertas],
  );
  const mensagemTemporaria = mensagemSalva !== null && mensagemSalva.chave === temporaria?.chave ? mensagemSalva : null;
  const cenarioDoLink = useCenarioDoLink(preferencias, ativo);
  const cenarioDoLinkTemporaria = useCenarioDoLink(prefsTemporaria, ativoTemporaria);

  // O histórico do Banco Central, uma vez quando há posições (ou uma consulta de renda variável), desde a data mais antiga.
  const [periodoRV, setPeriodoRV] = useState<DataISO | null>(null);
  const desde = posicoes.reduce<string | null>((min, p) => (min === null || p.dataAplicacao < min ? p.dataAplicacao : min), periodoRV);
  const { estado: historico, tentarDeNovo: tentarHistoricoDeNovo } = useHistorico(desde, carregarHistorico);
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
  /** As posições da última carteira do FGC: diz se a próxima mudou pelas posições ou pelo histórico. */
  const posicoesDoFGC = useRef(posicoes);
  /**
   * As posições como itens do FGC, para o alerta da comparação (o valor é o da comparação), e o motivo da mudança,
   * para o aviso do resultado recalculado: com as mesmas posições, foi o histórico que chegou.
   */
  const carteiraFGC = useMemo(() => {
    const motivo = posicoesDoFGC.current === posicoes ? 'HISTORICO' as const : 'CARTEIRA' as const;
    posicoesDoFGC.current = posicoes;
    return { itens: posicoes.map((p) => itemFGCDaPosicao(p, dataHoje, daCarteira.cenario)), motivo };
  }, [posicoes, dataHoje, daCarteira.cenario]);
  const conglomerados = useMemo(
    () => [...new Set([...ofertas, ...posicoes].map((o) => o.conglomerado))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [ofertas, posicoes],
  );

  useEffect(() => {
    if (foco === null) return;
    document.getElementById(foco)?.focus();
    setFoco(null);
  }, [foco]);

  // A visita contada ao carregar vai para o storage uma vez. Sem storage, o progresso vale só nesta visita.
  useEffect(() => { salvarProgresso(armazenamento, progresso); }, []);

  // O link compartilhável (#comparar/c1.…): ao carregar e quando só o hash muda (o link colado na mesma aba). O
  // estado sai da barra na hora (replaceState) e fica só em memória; link inválido não carrega nada.
  useEffect(() => {
    let ativo = true;
    const abrirDoHash = () => {
      const fragmento = lerEstadoDoHash();
      if (fragmento === null) return;
      limparEstadoDoHash();
      void decodificar(fragmento).then((r) => {
        if (!ativo) return;
        if (!r.ok) {
          setTemporaria(null);
          setErroLink(r.erro);
          irPara('comparar');
          return;
        }
        abrirTemporaria(temporariaDoLink(r.estado, novoIdOferta));
      });
    };
    abrirDoHash();
    window.addEventListener('hashchange', abrirDoHash);
    return () => {
      ativo = false;
      window.removeEventListener('hashchange', abrirDoHash);
    };
  }, []);

  // O voltar do navegador (ou um link #aprender/…) troca a lição; hash de outra aba não fecha a lição aberta.
  useEffect(() => {
    const aoMudarHash = () => {
      if (location.hash === `#${ABA_APRENDER}` || location.hash.startsWith(`#${ABA_APRENDER}/`)) setLicao(licaoDoHash());
    };
    window.addEventListener('hashchange', aoMudarHash);
    return () => window.removeEventListener('hashchange', aoMudarHash);
  }, []);

  function mudarProgresso(p: Progresso) {
    setProgresso(p);
    // O progresso é conveniência: sem storage, vale só nesta visita, sem o aviso de falha das ofertas.
    salvarProgresso(armazenamento, p);
  }

  /** Palpite respondido (empate não chega aqui): entra na taxa de acerto. */
  function registrar(acertou: boolean) {
    mudarProgresso(registrarPalpite(progresso, acertou));
  }

  /** Troca de aba; voltar ao Aprender reabre a lição que estava aberta. */
  function trocarAba(id: string) {
    if (id === ABA_APRENDER && licao !== null) irPara(ABA_APRENDER, licao);
    else irPara(id);
  }

  function abrirLicao(id: IdLicao | null) {
    setLicao(id);
    irPara(ABA_APRENDER, id ?? undefined);
  }

  /** Abre a comparação temporária na aba Comparar, com o foco no aviso dela. */
  function abrirTemporaria(t: ComparacaoTemporaria) {
    setErroLink(null);
    setTemporaria(t);
    irPara('comparar');
    setFoco(ID_BANNER_TEMPORARIA);
  }

  function experimentar(origem: OrigemTemporaria, e: NonNullable<Licao['experimente']>) {
    abrirTemporaria(temporariaDoExperimente(montarExperimente(e, hoje()), origem, novoIdOferta));
  }

  function voltarParaMinha() {
    setErroLink(null);
    setTemporaria(null);
    setFoco(ID_TITULO_COMPARADOR);
  }

  function salvarTemporaria() {
    if (temporaria === null) return;
    const r = salvarNoCatalogo(ofertas, temporaria, novoIdOferta);
    if (!r.ok) {
      setMensagem({ texto: r.erro, erro: true, chave: temporaria.chave });
      return;
    }
    setOfertas(r.catalogo);
    if (!salvarOfertas(armazenamento, r.catalogo)) setFalhouAoGravar(true);
    setTemporaria({ ...temporaria, salvas: true });
    const texto = r.salvas === 1 ? '1 oferta salva no catálogo.' : `${r.salvas} ofertas salvas no catálogo.`;
    setMensagem({ texto, erro: false, chave: temporaria.chave });
    // O botão de salvar some: o foco vai para o aviso da temporária.
    setFoco(ID_BANNER_TEMPORARIA);
  }

  function dispensar(id: string) {
    mudarProgresso(dispensarDica(progresso, id));
  }

  function mudarSelecaoTemporaria(ids: readonly string[]) {
    if (temporaria !== null) setTemporaria({ ...temporaria, selecao: sincronizarSelecao(ids, catalogoTemporaria) });
  }

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

  function mudarObjetivos(o: ObjetivoSalvo[]) {
    setObjetivos(o);
    if (!salvarObjetivos(armazenamento, o)) setFalhouAoGravar(true);
  }

  /** "Comparar" numa fatia da sugestão: mesmo destino de "Comparar" no catálogo. */
  function irParaComparar(o: OfertaCadastrada) {
    compararDoCatalogo(o.id);
  }

  function criarOferta(o: OfertaCadastrada) {
    const catalogo = [...ofertas, o];
    setOfertas(catalogo);
    if (!salvarOfertas(armazenamento, catalogo)) setFalhouAoGravar(true);
    // Na temporária, a oferta criada entra nela; a seleção salva fica como estava.
    if (temporaria !== null) setTemporaria({ ...temporaria, selecao: adicionar(temporaria.selecao, o.id).ids });
    else mudarSelecao(adicionar(selecao, o.id).ids, catalogo);
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
        <p>Compare investimentos pelo que sobra no bolso.</p>
      </header>

      {falhouAoGravar && <p role="alert" class="erro">{FALHA_AO_GRAVAR}</p>}

      <VoceSabia indiceVisita={progresso.visitas - 1} onVerLicao={abrirLicao} />

      <PainelRecolhivel resumo={textoResumoCenario(indicadores, preferencias, ativo)}>
        <PainelIndicadores indicadores={indicadores} preferencias={preferencias} ativo={ativo} explicacao={explicacao}
          onChange={mudarPreferencias} onCenarioInvalido={setCenarioInvalido} />
      </PainelRecolhivel>

      <Abas rotulo="O que você quer fazer" ativa={aba} onAtivar={trocarAba} secundarias={['catalogo', ABA_APRENDER]} abas={[
        {
          id: 'comparar', rotulo: 'Comparar', conteudo: (
            <>
              {erroLink !== null && (
                <div class="link-invalido">
                  <p role="alert" class="erro">{LINK_INVALIDO}</p>
                  <p class="dica">{erroLink}</p>
                </div>
              )}
              {temporaria && (
                <BannerTemporaria texto={textoDoBanner(temporaria.origem, temporaria.selecao.length)} aviso={avisoTemporaria}
                  salvas={temporaria.salvas} mensagem={mensagemTemporaria} onSalvar={salvarTemporaria} onVoltar={voltarParaMinha} />
              )}
              {temporaria ? (
                // A chave remonta o formulário com as entradas da temporária (e, na volta, com as padrão).
                // Com o cenário inteiro (o do link), o rascunho do painel não pesa; nos outros, bloqueia como sempre.
                <Comparador key={temporaria.chave} catalogo={catalogoTemporaria} selecao={temporaria.selecao}
                  onMudarSelecao={mudarSelecaoTemporaria} onCriarOferta={criarOferta} inicial={temporaria.inicial}
                  pergunta={temporaria.pergunta} cenario={ativoTemporaria.cenario} descricaoCenario={descricaoTemporaria}
                  cenarioInvalido={pedido?.premissas ? null : cenarioInvalido}
                  carteira={carteiraFGC.itens} motivoCarteira={carteiraFGC.motivo} onPalpite={registrar} onVerLicao={abrirLicao}
                  dicasDispensadas={progresso.dicasDispensadas} onDispensarDica={dispensar} cenarioDoLink={cenarioDoLinkTemporaria} />
              ) : (
                <Comparador key="minha" catalogo={ofertas} selecao={selecao} onMudarSelecao={mudarSelecao} onCriarOferta={criarOferta}
                  cenario={ativo.cenario} descricaoCenario={descricaoCenario} cenarioInvalido={cenarioInvalido} carteira={carteiraFGC.itens}
                  motivoCarteira={carteiraFGC.motivo} onPalpite={registrar} onVerLicao={abrirLicao}
                  dicasDispensadas={progresso.dicasDispensadas} onDispensarDica={dispensar} cenarioDoLink={cenarioDoLink} />
              )}
            </>
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
              onTentarDeNovo={tentarHistoricoDeNovo}
              lacunas={daCarteira.lacunas} historicoInvalido={daCarteira.invalido} conglomerados={conglomerados} />
          ),
        },
        {
          id: 'objetivos', rotulo: 'Objetivos', conteudo: (
            <Objetivos objetivos={objetivos} onChange={mudarObjetivos} catalogo={ofertas} carteira={carteiraFGC.itens}
              hoje={dataHoje} cenario={ativo.cenario} onIrParaComparar={irParaComparar} />
          ),
        },
        {
          id: 'renda-variavel', rotulo: 'Renda variável', conteudo: (
            <RendaVariavel ativa={aba === 'renda-variavel'} cenario={daCarteira.cenario}
              cenarioRealizado={series !== null && !daCarteira.invalido} onPeriodo={setPeriodoRV} />
          ),
        },
        {
          id: ABA_APRENDER, rotulo: 'Aprender', conteudo: (
            <Aprender licao={licao} onAbrir={abrirLicao} progresso={progresso}
              onConcluir={(id, c) => mudarProgresso(marcarConcluida(progresso, id, c))}
              onExperimente={(l) => { if (l.experimente) experimentar({ tipo: 'licao', titulo: l.titulo }, l.experimente); }}
              onCaso={(c: CasoClassico) => experimentar({ tipo: 'caso', titulo: c.titulo }, { ...c.experimente, pergunta: c.experimente.pergunta ?? c.pergunta })} />
          ),
        },
      ]} />
      <footer class="rodape">
        <p class="aviso">Conteúdo educativo: não é recomendação de investimento.</p>
        <p class="aviso">{AVISO_TURNSTILE}</p>
      </footer>
    </main>
  );
}

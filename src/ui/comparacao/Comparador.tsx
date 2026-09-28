import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { adicionar, remover } from '../../armazenamento/comparacao';
import { armazenamentoLocal } from '../../armazenamento/navegador';
import { lerPalpitesLigados, salvarPalpitesLigados } from '../../armazenamento/preferencias';
import { AVISO_CENARIO_INVALIDO, descreverProjecao, nomeDoHorizonte, nomeOferta } from '../../conteudo/comparacao';
import { descreverOferta } from '../../conteudo/motivos';
import { gerarAlertas, LIMIAR_QUASE_EMPATE, type Alerta } from '../../engine/alertas';
import { ehDiaUtil } from '../../engine/calendario';
import { horizontesPadrao, linhaDoTempo, tabelaPorHorizonte, type ColunaHorizonte, type Marco } from '../../engine/comparacao';
import { dataBR, ehDataValida, type DataISO } from '../../engine/datas';
import { calcularEquivalencias } from '../../engine/equivalencia';
import type { ItemFGC } from '../../engine/fgc';
import type { Cenario } from '../../engine/indexadores';
import type { CenarioProjetado } from '../../engine/projecao';
import { aplicacaoDe, validarRegraReinvestimento, type OfertaCadastrada, type RegraReinvestimento } from '../../engine/ofertas';
import { seriesDeValorLiquido, trocasDeLider, trocasRelevantes, type Serie, type TrocasRelevantes } from '../../engine/serie';
import { formatarMoeda, formatarPercentual } from '../../formato';
import { CampoNumerico } from '../CampoNumerico';
import { Equivalencias, EquivalenciasIndisponiveis } from '../Equivalencias';
import { GraficoDiferenca } from '../graficos/GraficoDiferenca';
import { GraficoValorLiquido } from '../graficos/GraficoValorLiquido';
import { DATA_MAXIMA, DATA_MINIMA, hoje } from '../hoje';
import { letraDaOferta } from '../letras';
import { novoIdOferta } from '../ofertas/MinhasOfertas';
import { PalpiteAntesDeVer } from '../PalpiteAntesDeVer';
import { Termo } from '../Termo';
import { AdicionarOferta, ID_BOTAO_ADICIONAR } from './AdicionarOferta';
import { Alertas } from './Alertas';
import { LinhaDoTempo } from './LinhaDoTempo';
import { PorQueLidera } from './PorQueLidera';
import { idColuna, TabelaComparacao } from './TabelaComparacao';

type TipoRegra = RegraReinvestimento['tipo'];

/** O que a pessoa digitou no formulário. */
interface Entrada { valor: number; dataAplicacao: DataISO; suaData: DataISO; tipoRegra: TipoRegra; taxaFixa: number }

interface Calculo {
  /** As ofertas, o cenário e as entradas usados: se qualquer um mudar, o resultado deixa de valer. */
  ofertas: readonly OfertaCadastrada[];
  cenario: Cenario;
  entrada: Entrada;
  /** As posições como itens do FGC: se a carteira mudar, o alerta do FGC deixa de valer. */
  carteira: readonly ItemFGC[];
  colunas: ColunaHorizonte[];
  linha: { marcos: Marco[] };
  regra: RegraReinvestimento;
  alertas: Alerta[];
  /** O valor líquido de cada oferta até o horizonte mais distante, para os gráficos. */
  series: Serie[];
  /** As trocas de líder para exibir: lideranças de menos de {@link DURACAO_MINIMA_LIDERANCA} dias fundidas. */
  trocas: TrocasRelevantes;
  /** A partir desta data o cenário projetado é premissa do app; ausente no cenário manual. */
  inicioPremissa?: DataISO;
}
type Fase =
  | { tipo: 'editando' }
  | ({ tipo: 'palpite' } & Calculo)
  | ({ tipo: 'resultado'; palpite: number | null } & Calculo);

const EDITANDO: Fase = { tipo: 'editando' };
/** Liderança mais curta que isto, em dias, é transitória: o gráfico e o resumo a fundem no trecho vizinho. */
const DURACAO_MINIMA_LIDERANCA = 30;
const PREFIXO = 'comparador';
const VAZIO = 'Adicione pelo menos duas ofertas para comparar (até 5).';
/** Tempo com o anúncio vazio antes de reescrever a mesma mensagem, para o leitor de tela anunciar de novo. */
const ESPERA_REPETIR_MS = 100;

const REGRAS: { valor: TipoRegra; rotulo: string }[] = [
  { valor: 'PADRAO', rotulo: 'Padrão' },
  { valor: 'MESMA_TAXA', rotulo: 'Mesma taxa' },
  { valor: 'CDI_100', rotulo: '100% do CDI' },
  { valor: 'TAXA_FIXA', rotulo: 'Taxa fixa' },
];

/** A premissa de reinvestimento, escrita no resultado. */
function descreverRegra(r: RegraReinvestimento): string {
  const inicio = 'No vencimento, o valor líquido é reaplicado';
  switch (r.tipo) {
    case 'PADRAO': return `${inicio} no mesmo % do CDI (pós-fixados) ou em CDB 100% do CDI (os demais).`;
    case 'MESMA_TAXA': return `${inicio} no mesmo produto e na mesma taxa; se o produto não aceitar o prazo, em CDB 100% do CDI.`;
    case 'CDI_100': return `${inicio} em CDB 100% do CDI.`;
    case 'TAXA_FIXA': return `${inicio} em CDB prefixado a ${formatarPercentual(r.taxaAA)} a.a.`;
  }
}

/** Mensagem humana para o primeiro campo inválido; null se dá para comparar. */
function validar({ valor, dataAplicacao, suaData, tipoRegra, taxaFixa }: Entrada): string | null {
  if (!Number.isFinite(valor) || valor <= 0) return 'Preencha o valor da aplicação.';
  if (dataAplicacao.trim() === '') return 'Informe a data da aplicação.';
  if (!ehDataValida(dataAplicacao)) return 'A data da aplicação é inválida.';
  if (suaData.trim() !== '' && !ehDataValida(suaData)) return 'A sua data é inválida.';
  if (suaData.trim() !== '' && suaData <= dataAplicacao) return 'A sua data precisa ser depois da data da aplicação.';
  if (tipoRegra === 'TAXA_FIXA' && !Number.isFinite(taxaFixa)) return 'Preencha a taxa do reinvestimento.';
  return null;
}

const mesmaEntrada = (x: Entrada, y: Entrada): boolean =>
  Object.is(x.valor, y.valor) && x.dataAplicacao === y.dataAplicacao && x.suaData === y.suaData
  && x.tipoRegra === y.tipoRegra && Object.is(x.taxaFixa, y.taxaFixa);

/** As mesmas ofertas, na mesma ordem? Editar uma oferta no catálogo troca o objeto dela. */
const mesmasOfertas = (x: readonly OfertaCadastrada[], y: readonly OfertaCadastrada[]): boolean =>
  x.length === y.length && x.every((o, i) => o === y[i]);

/** Lança com a mensagem do engine (ex.: taxa de reinvestimento fora dos limites). */
function calcular(ofertas: readonly OfertaCadastrada[], entrada: Entrada, cenario: Cenario, carteira: readonly ItemFGC[]): Calculo {
  const { valor, dataAplicacao, suaData, tipoRegra, taxaFixa } = entrada;
  const regra: RegraReinvestimento = tipoRegra === 'TAXA_FIXA' ? { tipo: 'TAXA_FIXA', taxaAA: taxaFixa / 100 } : { tipo: tipoRegra };
  validarRegraReinvestimento(regra);
  const horizontes = horizontesPadrao(dataAplicacao, suaData.trim() === '' ? null : suaData);
  const colunas = tabelaPorHorizonte(ofertas, valor, dataAplicacao, horizontes, cenario, regra);
  // Os horizontes vêm ordenados: o gráfico vai até o mais distante.
  const fim = horizontes.at(-1)?.data ?? dataAplicacao;
  const series = seriesDeValorLiquido(ofertas, valor, dataAplicacao, fim, cenario, regra);
  const inicioPremissa = 'inicioPremissa' in cenario ? (cenario as CenarioProjetado).inicioPremissa : undefined;
  return {
    ofertas, cenario, entrada, carteira, regra, colunas, series,
    linha: linhaDoTempo(ofertas, valor, dataAplicacao, cenario, regra),
    // O alerta do FGC: a carteira do conglomerado mais a oferta aplicada pelo valor da comparação (spec §5.6).
    alertas: gerarAlertas(ofertas, colunas, LIMIAR_QUASE_EMPATE, suaData.trim() === '' ? undefined : suaData,
      { carteira, valor, dataAplicacao, cen: cenario }),
    trocas: trocasRelevantes(trocasDeLider(series, { ofertas, valor, dataAplicacao, cen: cenario, regra }), { duracaoMinimaDias: DURACAO_MINIMA_LIDERANCA, fim }),
    ...(inicioPremissa === undefined ? {} : { inicioPremissa }),
  };
}

/** Data preenchida e válida que não é dia útil. Data vazia ou inválida não gera aviso. */
function naoEhDiaUtil(data: DataISO): boolean {
  try {
    return !ehDiaUtil(data);
  } catch {
    return false;
  }
}

function AvisoDiaUtil({ id, data, oQue }: { id: string; data: DataISO; oQue: 'a aplicação' | 'o resgate' }) {
  return naoEhDiaUtil(data)
    ? <p id={id} class="dica">Não é dia útil: na prática {oQue} acontece no próximo dia útil.</p>
    : null;
}

export interface PropsComparador {
  /** Todas as ofertas cadastradas. */
  catalogo: readonly OfertaCadastrada[];
  /** Os ids na comparação, na ordem das colunas (já sincronizados com o catálogo). */
  selecao: readonly string[];
  /** A seleção nova (adicionar ou tirar). Quem chama persiste. */
  onMudarSelecao: (ids: string[]) => void;
  /** Oferta criada no seletor: quem chama grava no catálogo e põe na comparação. */
  onCriarOferta: (o: OfertaCadastrada) => void;
  /** O cenário ativo do painel de indicadores. */
  cenario: Cenario;
  /** Uma frase sobre o cenário usado. */
  descricaoCenario: string;
  /** Rascunho inválido no painel (premissas ou valores manuais): enquanto houver, não dá para comparar. */
  cenarioInvalido?: string | null;
  gerarId?: () => string;
  /** As posições da carteira como itens do FGC, para o alerta do limite. Padrão: nenhuma. */
  carteira?: readonly ItemFGC[];
}

const SEM_CARTEIRA: readonly ItemFGC[] = [];

/** A tela de comparação: de 2 a 5 ofertas lado a lado, com palpite, linha do tempo e equivalências. */
export function Comparador({
  catalogo, selecao, onMudarSelecao, onCriarOferta, cenario, descricaoCenario, cenarioInvalido = null, gerarId = novoIdOferta,
  carteira = SEM_CARTEIRA,
}: PropsComparador) {
  const [valor, setValor] = useState(10000);
  const [dataAplicacao, setDataAplicacao] = useState<DataISO>(hoje());
  const [suaData, setSuaData] = useState<DataISO>('');
  const [tipoRegra, setTipoRegra] = useState<TipoRegra>('PADRAO');
  const [taxaFixa, setTaxaFixa] = useState(12);
  const [faseSalva, setFase] = useState<Fase>(EDITANDO);
  /** O erro vale para as entradas e o cenário em que apareceu. */
  const [erroSalvo, setErroSalvo] = useState<{ texto: string; entrada: Entrada; cenario: Cenario } | null>(null);
  const [palpitesLigados, setPalpitesLigados] = useState(() => lerPalpitesLigados(armazenamentoLocal()));
  /** Equivalências: a oferta (id) e o horizonte (data) escolhidos; null = o padrão. */
  const [eqId, setEqId] = useState<string | null>(null);
  const [eqData, setEqData] = useState<DataISO | null>(null);
  /** "Por que … lidera": o horizonte escolhido; null = o mais distante com líder. Independente das equivalências. */
  const [liderData, setLiderData] = useState<DataISO | null>(null);
  /** Anúncio para leitor de tela (contêiner vivo permanente). */
  const [anuncio, setAnuncio] = useState('');
  const anuncioAtual = useRef('');
  const repetir = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Id do elemento que recebe o foco depois da próxima renderização. */
  const [foco, setFoco] = useState<string | null>(null);
  const tituloPalpite = useRef<HTMLHeadingElement>(null);
  const tituloResultado = useRef<HTMLHeadingElement>(null);
  /** O recálculo depois de tirar uma coluna não leva o foco ao título do resultado. */
  const focarFase = useRef(true);

  const ofertas = useMemo(
    () => selecao.flatMap((id) => catalogo.filter((o) => o.id === id).slice(0, 1)),
    [selecao, catalogo],
  );
  const entrada: Entrada = { valor, dataAplicacao, suaData, tipoRegra, taxaFixa };

  // Mudar entradas, ofertas, seleção ou cenário invalida o resultado. Derivado na renderização, e não num efeito:
  // um efeito atrasado mostraria o resultado velho com o dado novo, ou apagaria uma comparação feita logo depois.
  const fase: Fase = faseSalva.tipo !== 'editando'
    && (faseSalva.cenario !== cenario || faseSalva.carteira !== carteira || !mesmaEntrada(faseSalva.entrada, entrada)
      || !mesmasOfertas(faseSalva.ofertas, ofertas))
    ? EDITANDO
    : faseSalva;
  const erro = erroSalvo !== null && erroSalvo.cenario === cenario && mesmaEntrada(erroSalvo.entrada, entrada) ? erroSalvo.texto : null;

  useEffect(() => {
    if (!focarFase.current) {
      focarFase.current = true;
      return;
    }
    if (fase.tipo === 'palpite') tituloPalpite.current?.focus();
    else if (fase.tipo === 'resultado') tituloResultado.current?.focus();
  }, [faseSalva]);

  useEffect(() => () => clearTimeout(repetir.current), []);

  function escreverAnuncio(texto: string) {
    anuncioAtual.current = texto;
    setAnuncio(texto);
  }

  function anunciar(texto: string) {
    clearTimeout(repetir.current);
    if (texto !== anuncioAtual.current) {
      escreverAnuncio(texto);
      return;
    }
    // A mesma mensagem de novo: limpa e reescreve, senão o contêiner vivo não muda e nada é anunciado.
    escreverAnuncio('');
    repetir.current = setTimeout(() => escreverAnuncio(texto), ESPERA_REPETIR_MS);
  }

  useEffect(() => {
    if (foco === null) return;
    document.getElementById(foco)?.focus();
    setFoco(null);
  }, [foco]);

  const poucas = ofertas.length < 2;
  const bloqueado = cenarioInvalido != null;

  function comparar(e: Event) {
    e.preventDefault();
    if (poucas || bloqueado) return;
    const invalido = validar(entrada);
    if (invalido !== null) {
      setErroSalvo({ texto: invalido, entrada, cenario });
      setFase(EDITANDO);
      return;
    }
    try {
      const c = calcular(ofertas, entrada, cenario, carteira);
      setErroSalvo(null);
      setEqId(null);
      setEqData(null);
      setLiderData(null);
      // Sem ninguém disponível no horizonte perguntado, não há o que adivinhar: o resultado vem direto.
      const perguntar = palpitesLigados && (c.colunas.at(-1)?.lideres.length ?? 0) > 0;
      setFase(perguntar ? { tipo: 'palpite', ...c } : { tipo: 'resultado', palpite: null, ...c });
    } catch (err) {
      setErroSalvo({ texto: err instanceof Error ? `${err.message.replace(/\.$/, '')}.` : String(err), entrada, cenario });
      setFase(EDITANDO);
    }
  }

  function pularPalpites() {
    salvarPalpitesLigados(armazenamentoLocal(), false);
    setPalpitesLigados(false);
    if (fase.tipo === 'palpite') setFase({ ...fase, tipo: 'resultado', palpite: null });
  }

  function tirar(id: string) {
    const indice = ofertas.findIndex((o) => o.id === id);
    const saiu = ofertas[indice];
    const restantes = ofertas.filter((o) => o.id !== id);
    onMudarSelecao(remover(selecao, id));
    if (saiu) anunciar(`${nomeOferta(saiu)} saiu da comparação.`);
    // Com o resultado aberto e ainda duas ou mais, recalcula na hora, sem repetir o palpite. Nos outros casos a
    // fase volta a EDITANDO: se a mesma oferta voltasse, o resultado antigo reapareceria sem recalcular.
    if (fase.tipo === 'resultado' && restantes.length >= 2) {
      try {
        focarFase.current = false;
        setFase({ tipo: 'resultado', palpite: null, ...calcular(restantes, fase.entrada, fase.cenario, fase.carteira) });
      } catch {
        setFase(EDITANDO);
      }
    } else {
      setFase(EDITANDO);
    }
    // O botão ✕ some com a coluna: o foco vai para a coluna que ocupa o lugar dela (ou a anterior), ou para o "+ Adicionar".
    setFoco(restantes.length === 0 ? ID_BOTAO_ADICIONAR : idColuna(Math.min(Math.max(indice, 0), restantes.length - 1)));
  }

  const nomes = (fase.tipo === 'editando' ? ofertas : fase.ofertas).map(nomeOferta);
  const resultado = fase.tipo === 'resultado' ? fase : null;

  const tabela = ofertas.length > 0 && (
    <TabelaComparacao ofertas={ofertas} colunas={resultado?.colunas ?? []} dataAplicacao={dataAplicacao} onRemover={tirar} />
  );

  return (
    <section class="comparacao" aria-labelledby={`${PREFIXO}-titulo`}>
      <h2 id={`${PREFIXO}-titulo`}>Comparar</h2>
      <p class="dica">Cenário: {descricaoCenario}</p>
      <form onSubmit={comparar} class="formulario" noValidate>
        <fieldset class="aplicacao">
          <legend>Aplicação (o mesmo valor em todas as ofertas)</legend>
          <div class="campo">
            <label for={`${PREFIXO}-valor`}>Valor (R$)</label>
            <CampoNumerico id={`${PREFIXO}-valor`} min="0" step="100" valor={valor} onChange={setValor} />
          </div>
          <div class="campo">
            <label for={`${PREFIXO}-data-aplicacao`}>Data da aplicação</label>
            <input id={`${PREFIXO}-data-aplicacao`} type="date" min={DATA_MINIMA} max={DATA_MAXIMA} value={dataAplicacao}
              aria-describedby={naoEhDiaUtil(dataAplicacao) ? `${PREFIXO}-data-aplicacao-dica` : undefined}
              onInput={(e) => setDataAplicacao(e.currentTarget.value)} />
            <AvisoDiaUtil id={`${PREFIXO}-data-aplicacao-dica`} data={dataAplicacao} oQue="a aplicação" />
          </div>
          <div class="campo">
            <label for={`${PREFIXO}-sua-data`}>Sua data (opcional)</label>
            <input id={`${PREFIXO}-sua-data`} type="date" min={DATA_MINIMA} max={DATA_MAXIMA} value={suaData}
              aria-describedby={naoEhDiaUtil(suaData) ? `${PREFIXO}-sua-data-dica ${PREFIXO}-sua-data-dia-util` : `${PREFIXO}-sua-data-dica`}
              onInput={(e) => setSuaData(e.currentTarget.value)} />
            <p id={`${PREFIXO}-sua-data-dica`} class="dica">Entra como mais uma linha, além de 6 meses, 1, 2, 3 e 5 anos.</p>
            <AvisoDiaUtil id={`${PREFIXO}-sua-data-dia-util`} data={suaData} oQue="o resgate" />
          </div>
          <div class="campo">
            <label for={`${PREFIXO}-reinvestimento`}>Reinvestimento</label>
            <select id={`${PREFIXO}-reinvestimento`} value={tipoRegra} onChange={(e) => setTipoRegra(e.currentTarget.value as TipoRegra)}>
              {REGRAS.map((r) => <option key={r.valor} value={r.valor}>{r.rotulo}</option>)}
            </select>
            <Termo id="reinvestimento">O que é reinvestimento?</Termo>
          </div>
          {tipoRegra === 'TAXA_FIXA' && (
            <div class="campo">
              <label for={`${PREFIXO}-taxa-reinvestimento`}>Taxa do reinvestimento (% a.a.)</label>
              <CampoNumerico id={`${PREFIXO}-taxa-reinvestimento`} step="0.01" valor={taxaFixa} onChange={setTaxaFixa} />
            </div>
          )}
        </fieldset>
        <button type="submit" class="primario" disabled={poucas || bloqueado}
          aria-describedby={bloqueado ? `${PREFIXO}-cenario-invalido` : poucas ? `${PREFIXO}-vazio` : undefined}>
          Comparar
        </button>
        {bloqueado && <p id={`${PREFIXO}-cenario-invalido`} class="erro">{AVISO_CENARIO_INVALIDO}</p>}
        {!palpitesLigados && (
          <button type="button" class="link" onClick={() => { salvarPalpitesLigados(armazenamentoLocal(), true); setPalpitesLigados(true); }}>
            Religar os palpites
          </button>
        )}
      </form>

      {erro && <p role="alert" class="erro">{erro}</p>}
      <p role="status" class="visualmente-oculto">{anuncio}</p>

      <AdicionarOferta catalogo={catalogo} selecao={selecao} gerarId={gerarId} destaque={poucas}
        // Uma oferta que entra (do catálogo ou criada) invalida o resultado até comparar de novo.
        onAdicionar={(id) => { onMudarSelecao(adicionar(selecao, id).ids); setFase(EDITANDO); }}
        onCriar={(o) => { onCriarOferta(o); setFase(EDITANDO); }} />
      {poucas && <p id={`${PREFIXO}-vazio`} class="dica comparacao__vazio">{VAZIO}</p>}

      {fase.tipo === 'palpite' && (
        <PalpiteAntesDeVer id={`${PREFIXO}-palpite`} refTitulo={tituloPalpite} opcoes={nomes}
          pergunta={`Qual lidera em ${fase.colunas.at(-1) ? nomeDoHorizonte(fase.colunas.at(-1) as ColunaHorizonte) : 'seu horizonte'}?`}
          onEscolher={(i) => setFase({ ...fase, tipo: 'resultado', palpite: i })} onPular={pularPalpites} />
      )}

      {resultado ? (
        <section class="resultado" aria-labelledby={`${PREFIXO}-resultado-titulo`}>
          <h2 id={`${PREFIXO}-resultado-titulo`} ref={tituloResultado} tabIndex={-1}>Resultado da comparação</h2>
          {resultado.palpite !== null && <Feedback palpite={resultado.palpite} colunas={resultado.colunas} nomes={nomes} />}
          <p class="dica">
            {formatarMoeda(resultado.entrada.valor)} aplicados em {dataBR(resultado.entrada.dataAplicacao)} em cada oferta.
          </p>
          <p class="dica">
            <Termo id="reinvestimento">Reinvestimento</Termo>: {descreverRegra(resultado.regra)} O IR recomeça na reaplicação.
          </p>
          {tabela}
          <Alertas alertas={resultado.alertas} ofertas={resultado.ofertas} horizontes={resultado.colunas} prefixo={`${PREFIXO}-alertas`} />
          <PorQueLidera ofertas={resultado.ofertas} colunas={resultado.colunas} data={liderData} onData={setLiderData} />
          <details open class="graficos">
            <summary>Gráficos</summary>
            <GraficoValorLiquido series={resultado.series} trocas={resultado.trocas.trocas} ofertas={resultado.ofertas}
              inicioPremissa={resultado.inicioPremissa} {...(resultado.trocas.inicial ? { oscilacaoInicial: resultado.trocas.inicial } : {})} />
            <GraficoDiferenca series={resultado.series} ofertas={resultado.ofertas} prefixo={`${PREFIXO}-diferenca`} />
          </details>
          <LinhaDoTempo ofertas={resultado.ofertas} linha={resultado.linha} ultimaColuna={resultado.colunas.at(-1)} />
          <EquivalenciasDaComparacao calculo={resultado} eqId={eqId} eqData={eqData}
            onOferta={(id) => { setEqId(id); setEqData(null); }} onData={setEqData} />
        </section>
      ) : tabela}
    </section>
  );
}

function Feedback({ palpite, colunas, nomes }: { palpite: number; colunas: readonly ColunaHorizonte[]; nomes: readonly string[] }) {
  const ultima = colunas.at(-1);
  if (!ultima) return null;
  const quando = nomeDoHorizonte(ultima);
  let texto: string;
  if (ultima.lideres.length === 0) texto = `Nenhuma oferta está disponível em ${quando}.`;
  else if (ultima.lideres.includes(palpite)) texto = ultima.lideres.length > 1 ? 'Deu empate, e o seu palpite estava entre os líderes.' : 'Você acertou.';
  else {
    const lideres = ultima.lideres.map((i) => `${letraDaOferta(i)}: ${nomes[i] ?? ''}`).join(' e ');
    texto = `Não foi dessa vez: em ${quando}, quem lidera é ${lideres}.`;
  }
  return <p class="feedback">{texto}</p>;
}

interface PropsEquivalenciasDaComparacao {
  calculo: Calculo;
  eqId: string | null;
  eqData: DataISO | null;
  onOferta: (id: string) => void;
  onData: (data: DataISO) => void;
}

/** A escolha da oferta e do prazo, e as equivalências dela: aplicada de uma vez até a data, sem reaplicar. */
function EquivalenciasDaComparacao({ calculo, eqId, eqData, onOferta, onData }: PropsEquivalenciasDaComparacao) {
  const { ofertas, colunas, entrada, cenario } = calculo;
  const indice = Math.max(0, ofertas.findIndex((o) => o.id === eqId));
  const oferta = ofertas[indice];
  // Padrão: o horizonte mais distante em que a oferta está disponível; sem nenhum, o mais distante.
  const padrao = colunas.filter((c) => c.projecoes[indice]?.estado === 'DISPONIVEL').at(-1) ?? colunas.at(-1);
  const coluna = colunas.find((c) => c.data === eqData) ?? padrao;
  const projecao = coluna?.projecoes[indice];

  const conteudo = useMemo(() => {
    if (!oferta || !coluna || !projecao) return null;
    const origem = nomeOferta(oferta);
    if (projecao.estado !== 'DISPONIVEL') return <EquivalenciasIndisponiveis origem={origem} motivo={descreverProjecao(projecao)} />;
    try {
      const eq = calcularEquivalencias(aplicacaoDe(oferta, entrada.valor, entrada.dataAplicacao), coluna.data, cenario);
      const aviso = projecao.reinvestimento
        ? `As equivalências consideram ${descreverOferta(oferta)} aplicado de uma vez até ${dataBR(coluna.data)}, sem reaplicar no vencimento.`
        : undefined;
      return <Equivalencias origem={origem} eq={eq} aviso={aviso} />;
    } catch (err) {
      return <EquivalenciasIndisponiveis origem={origem} motivo={err instanceof Error ? `${err.message.replace(/\.$/, '')}.` : String(err)} />;
    }
  }, [oferta, coluna, projecao, entrada, cenario]);

  if (!oferta || !coluna) return null;
  return (
    <div class="comparacao__equivalencias">
      <div class="comparacao__escolha">
        <div class="campo">
          <label for={`${PREFIXO}-eq-oferta`}>Calcular equivalências para</label>
          <select id={`${PREFIXO}-eq-oferta`} value={oferta.id} onChange={(e) => onOferta(e.currentTarget.value)}>
            {ofertas.map((o, i) => <option key={o.id} value={o.id}>{letraDaOferta(i)}: {nomeOferta(o)}</option>)}
          </select>
        </div>
        <div class="campo">
          <label for={`${PREFIXO}-eq-prazo`}>no prazo de</label>
          <select id={`${PREFIXO}-eq-prazo`} value={coluna.data} onChange={(e) => onData(e.currentTarget.value)}>
            {colunas.map((c) => <option key={c.data} value={c.data}>{nomeDoHorizonte(c)}</option>)}
          </select>
        </div>
      </div>
      {conteudo}
    </div>
  );
}

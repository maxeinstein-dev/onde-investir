import { useEffect, useRef, useState } from 'preact/hooks';
import { armazenamentoLocal } from '../../armazenamento/navegador';
import { lerPalpitesLigados, salvarPalpitesLigados } from '../../armazenamento/preferencias';
import { AVISO_CENARIO_INVALIDO, nomeDoHorizonte, nomeOferta } from '../../conteudo/comparacao';
import { horizontesPadrao, linhaDoTempo, tabelaPorHorizonte, type ColunaHorizonte, type Marco } from '../../engine/comparacao';
import { dataBR, ehDataValida, type DataISO } from '../../engine/datas';
import type { Cenario } from '../../engine/indexadores';
import { validarRegraReinvestimento, type OfertaCadastrada, type RegraReinvestimento } from '../../engine/ofertas';
import { formatarMoeda, formatarPercentual } from '../../formato';
import { CampoNumerico } from '../CampoNumerico';
import { DATA_MAXIMA, DATA_MINIMA, hoje } from '../hoje';
import { letraDaOferta } from '../letras';
import { PalpiteAntesDeVer } from '../PalpiteAntesDeVer';
import { Termo } from '../Termo';
import { LinhaDoTempo } from './LinhaDoTempo';
import { TabelaHorizontes } from './TabelaHorizontes';

type TipoRegra = RegraReinvestimento['tipo'];

interface Calculo {
  /** As ofertas e o cenário usados: se mudarem, o resultado deixa de valer. */
  ofertas: readonly OfertaCadastrada[];
  cenario: Cenario;
  colunas: ColunaHorizonte[];
  linha: { marcos: Marco[] };
  regra: RegraReinvestimento;
  valor: number;
  dataAplicacao: DataISO;
}
type Fase =
  | { tipo: 'editando' }
  | ({ tipo: 'palpite' } & Calculo)
  | ({ tipo: 'resultado'; palpite: number | null } & Calculo);

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

export interface PropsComparacao {
  ofertas: readonly OfertaCadastrada[];
  /** O cenário ativo do painel de indicadores. */
  cenario: Cenario;
  /** Uma frase sobre o cenário usado. */
  descricaoCenario: string;
  /** Rascunho inválido no painel (premissas ou valores manuais): enquanto houver, não dá para comparar. */
  cenarioInvalido?: string | null;
}

export function Comparacao({ ofertas, cenario, descricaoCenario, cenarioInvalido = null }: PropsComparacao) {
  const [valor, setValor] = useState(10000);
  const [dataAplicacao, setDataAplicacao] = useState<DataISO>(hoje());
  const [suaData, setSuaData] = useState<DataISO>('');
  const [tipoRegra, setTipoRegra] = useState<TipoRegra>('PADRAO');
  const [taxaFixa, setTaxaFixa] = useState(12);
  const [faseSalva, setFase] = useState<Fase>({ tipo: 'editando' });
  const [erro, setErro] = useState<string | null>(null);
  const [palpitesLigados, setPalpitesLigados] = useState(() => lerPalpitesLigados(armazenamentoLocal()));
  const tituloPalpite = useRef<HTMLHeadingElement>(null);
  const tituloResultado = useRef<HTMLHeadingElement>(null);

  // Editar ofertas ou trocar o cenário invalida o resultado, como qualquer edição. Derivado na renderização,
  // e não num efeito: um efeito atrasado poderia apagar uma comparação feita logo depois da troca.
  const fase: Fase = faseSalva.tipo !== 'editando' && (faseSalva.ofertas !== ofertas || faseSalva.cenario !== cenario)
    ? { tipo: 'editando' }
    : faseSalva;

  useEffect(() => {
    if (fase.tipo === 'palpite') tituloPalpite.current?.focus();
    else if (fase.tipo === 'resultado') tituloResultado.current?.focus();
  }, [faseSalva]);

  function editar<T>(set: (v: T) => void) {
    return (v: T) => { set(v); setFase({ tipo: 'editando' }); setErro(null); };
  }

  const poucas = ofertas.length < 2;
  const bloqueado = cenarioInvalido != null;

  /** Mensagem humana para o primeiro campo inválido; null se dá para comparar. */
  function validar(): string | null {
    if (!Number.isFinite(valor) || valor <= 0) return 'Preencha o valor da aplicação.';
    if (dataAplicacao.trim() === '') return 'Informe a data da aplicação.';
    if (!ehDataValida(dataAplicacao)) return 'A data da aplicação é inválida.';
    if (suaData.trim() !== '' && !ehDataValida(suaData)) return 'A sua data é inválida.';
    if (suaData.trim() !== '' && suaData <= dataAplicacao) return 'A sua data precisa ser depois da data da aplicação.';
    if (tipoRegra === 'TAXA_FIXA' && !Number.isFinite(taxaFixa)) return 'Preencha a taxa do reinvestimento.';
    return null;
  }

  function comparar(e: Event) {
    e.preventDefault();
    if (poucas || bloqueado) return;
    const invalido = validar();
    if (invalido !== null) {
      setErro(invalido);
      setFase({ tipo: 'editando' });
      return;
    }
    const regra: RegraReinvestimento = tipoRegra === 'TAXA_FIXA' ? { tipo: 'TAXA_FIXA', taxaAA: taxaFixa / 100 } : { tipo: tipoRegra };
    try {
      validarRegraReinvestimento(regra);
      const horizontes = horizontesPadrao(dataAplicacao, suaData.trim() === '' ? null : suaData);
      const calculo: Calculo = {
        colunas: tabelaPorHorizonte(ofertas, valor, dataAplicacao, horizontes, cenario, regra),
        linha: linhaDoTempo(ofertas, valor, dataAplicacao, cenario, regra),
        regra, valor, dataAplicacao, ofertas, cenario,
      };
      setErro(null);
      setFase(palpitesLigados ? { tipo: 'palpite', ...calculo } : { tipo: 'resultado', palpite: null, ...calculo });
    } catch (err) {
      setErro(err instanceof Error ? `${err.message.replace(/\.$/, '')}.` : String(err));
      setFase({ tipo: 'editando' });
    }
  }

  function pularPalpites() {
    salvarPalpitesLigados(armazenamentoLocal(), false);
    setPalpitesLigados(false);
    if (fase.tipo === 'palpite') setFase({ ...fase, tipo: 'resultado', palpite: null });
  }

  const nomes = ofertas.map(nomeOferta);

  return (
    <section class="comparacao" aria-labelledby="comparacao-titulo">
      <h2 id="comparacao-titulo">Comparar</h2>
      <p class="dica">Cenário: {descricaoCenario}</p>
      <form onSubmit={comparar} class="formulario" noValidate>
        <fieldset class="aplicacao">
          <legend>Aplicação (o mesmo valor em todas as ofertas)</legend>
          <div class="campo">
            <label for="comparacao-valor">Valor (R$)</label>
            <CampoNumerico id="comparacao-valor" min="0" step="100" valor={valor} onChange={editar(setValor)} />
          </div>
          <div class="campo">
            <label for="comparacao-data-aplicacao">Data da aplicação</label>
            <input id="comparacao-data-aplicacao" type="date" min={DATA_MINIMA} max={DATA_MAXIMA} value={dataAplicacao}
              onInput={(e) => editar(setDataAplicacao)(e.currentTarget.value)} />
          </div>
          <div class="campo">
            <label for="comparacao-sua-data">Sua data (opcional)</label>
            <input id="comparacao-sua-data" type="date" min={DATA_MINIMA} max={DATA_MAXIMA} value={suaData} aria-describedby="comparacao-sua-data-dica"
              onInput={(e) => editar(setSuaData)(e.currentTarget.value)} />
            <p id="comparacao-sua-data-dica" class="dica">Entra como mais uma coluna, além de 6 meses, 1, 2, 3 e 5 anos.</p>
          </div>
          <div class="campo">
            <label for="comparacao-reinvestimento">Reinvestimento</label>
            <select id="comparacao-reinvestimento" value={tipoRegra} onChange={(e) => editar(setTipoRegra)(e.currentTarget.value as TipoRegra)}>
              {REGRAS.map((r) => <option key={r.valor} value={r.valor}>{r.rotulo}</option>)}
            </select>
            <Termo id="reinvestimento">O que é reinvestimento?</Termo>
          </div>
          {tipoRegra === 'TAXA_FIXA' && (
            <div class="campo">
              <label for="comparacao-taxa-reinvestimento">Taxa do reinvestimento (% a.a.)</label>
              <CampoNumerico id="comparacao-taxa-reinvestimento" step="0.01" valor={taxaFixa} onChange={editar(setTaxaFixa)} />
            </div>
          )}
        </fieldset>
        {poucas && <p class="dica">Cadastre pelo menos duas ofertas para comparar.</p>}
        <button type="submit" class="primario" disabled={poucas || bloqueado}
          aria-describedby={bloqueado ? "comparacao-cenario-invalido" : undefined}>
          Comparar
        </button>
        {bloqueado && <p id="comparacao-cenario-invalido" class="erro">{AVISO_CENARIO_INVALIDO}</p>}
        {!palpitesLigados && (
          <button type="button" class="link" onClick={() => { salvarPalpitesLigados(armazenamentoLocal(), true); setPalpitesLigados(true); }}>
            Religar os palpites
          </button>
        )}
      </form>

      {erro && <p role="alert" class="erro">{erro}</p>}

      {fase.tipo === 'palpite' && (
        <PalpiteAntesDeVer id="comparacao-palpite" refTitulo={tituloPalpite} opcoes={nomes}
          pergunta={`Qual lidera em ${fase.colunas.at(-1) ? nomeDoHorizonte(fase.colunas.at(-1) as ColunaHorizonte) : 'seu horizonte'}?`}
          onEscolher={(i) => setFase({ ...fase, tipo: 'resultado', palpite: i })} onPular={pularPalpites} />
      )}

      {fase.tipo === 'resultado' && (
        <section class="resultado" aria-labelledby="comparacao-resultado-titulo">
          <h2 id="comparacao-resultado-titulo" ref={tituloResultado} tabIndex={-1}>Resultado da comparação</h2>
          {fase.palpite !== null && <Feedback palpite={fase.palpite} colunas={fase.colunas} nomes={nomes} />}
          <p class="dica">
            <Termo id="reinvestimento">Reinvestimento</Termo>: {descreverRegra(fase.regra)} O IR recomeça na reaplicação.
          </p>
          <TabelaHorizontes ofertas={ofertas} colunas={fase.colunas}
            descricao={`${formatarMoeda(fase.valor)} aplicados em ${dataBR(fase.dataAplicacao)}`} />
          <LinhaDoTempo ofertas={ofertas} linha={fase.linha} ultimaColuna={fase.colunas.at(-1)} />
        </section>
      )}
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

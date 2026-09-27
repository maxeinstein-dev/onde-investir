import { useEffect, useRef, useState } from 'preact/hooks';
import { descreverOferta } from '../conteudo/motivos';
import { ehDiaUtil } from '../engine/calendario';
import { duelar, type Duelo } from '../engine/comparador';
import { somarMeses, type DataISO } from '../engine/datas';
import { calcularEquivalencias, type ResultadoEquivalencia } from '../engine/equivalencia';
import { cenarioConstante } from '../engine/indexadores';
import type { Oferta } from '../engine/produtos';
import { CampoNumerico } from './CampoNumerico';
import { CENARIO_INICIAL, type ValoresCenario } from './cenarioInicial';
import { Equivalencias } from './Equivalencias';
import { FormOferta, taxaPreenchida } from './FormOferta';
import { hoje } from './hoje';
import { PalpiteAntesDeVer } from './PalpiteAntesDeVer';
import { lerPalpitesLigados, salvarPalpitesLigados } from './preferencias';
import { ResultadoDuelo } from './ResultadoDuelo';
import { Termo } from './Termo';

type Calculo = { duelo: Duelo; equivalencia: ResultadoEquivalencia };
type Fase =
  | { tipo: 'editando' }
  | ({ tipo: 'palpite' } & Calculo)
  | ({ tipo: 'resultado'; palpite: 'A' | 'B' | null } & Calculo);

const PRAZOS = [
  { rotulo: '6 meses', meses: 6 }, { rotulo: '1 ano', meses: 12 }, { rotulo: '2 anos', meses: 24 },
  { rotulo: '3 anos', meses: 36 }, { rotulo: '5 anos', meses: 60 },
];

const CAMPOS_CENARIO: { chave: keyof ValoresCenario; rotulo: string; artigo: 'o' | 'a'; termo: 'cdi' | 'selic' | 'ipca' | 'tr'; sufixo: string }[] = [
  { chave: 'cdi', rotulo: 'CDI', artigo: 'o', termo: 'cdi', sufixo: '% a.a.' },
  { chave: 'selicMeta', rotulo: 'Selic meta', artigo: 'a', termo: 'selic', sufixo: '% a.a.' },
  { chave: 'ipca', rotulo: 'IPCA', artigo: 'o', termo: 'ipca', sufixo: '% a.a.' },
  { chave: 'tr', rotulo: 'TR', artigo: 'a', termo: 'tr', sufixo: '% a.m.' },
];

interface Entrada {
  cenario: ValoresCenario; valor: number; dataAplicacao: DataISO; dataResgate: DataISO; a: Oferta; b: Oferta;
}

/** Mensagem humana para o primeiro campo vazio ou inválido; null se dá para comparar. */
function validarEntrada({ cenario, valor, dataAplicacao, dataResgate, a, b }: Entrada): string | null {
  for (const c of CAMPOS_CENARIO) {
    if (!Number.isFinite(cenario[c.chave])) return `Preencha ${c.artigo} ${c.rotulo} do cenário.`;
  }
  if (!Number.isFinite(valor)) return 'Preencha o valor da aplicação.';
  if (dataAplicacao.trim() === '') return 'Informe a data da aplicação.';
  if (dataResgate.trim() === '') return 'Informe a data do resgate.';
  if (!taxaPreenchida(a.indexacao)) return 'Preencha a taxa da Opção A.';
  if (!taxaPreenchida(b.indexacao)) return 'Preencha a taxa da Opção B.';
  return null;
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

export function App() {
  const [cenario, setCenario] = useState<ValoresCenario>(CENARIO_INICIAL.valores);
  const [valor, setValor] = useState(10000);
  const [dataAplicacao, setDataAplicacao] = useState<DataISO>(hoje());
  const [dataResgate, setDataResgate] = useState<DataISO>(somarMeses(hoje(), 24));
  const [a, setA] = useState<Oferta>({ produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 } });
  const [b, setB] = useState<Oferta>({ produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 } });
  const [fase, setFase] = useState<Fase>({ tipo: 'editando' });
  const [erro, setErro] = useState<string | null>(null);
  const [palpitesLigados, setPalpitesLigados] = useState(lerPalpitesLigados());
  const tituloPalpite = useRef<HTMLHeadingElement>(null);
  const tituloResultado = useRef<HTMLHeadingElement>(null);

  // Leva o foco para o título de cada fase nova (palpite ou resultado).
  useEffect(() => {
    if (fase.tipo === 'palpite') tituloPalpite.current?.focus();
    else if (fase.tipo === 'resultado') tituloResultado.current?.focus();
  }, [fase]);

  /** Qualquer edição invalida o resultado anterior. */
  function editar<T>(set: (v: T) => void) {
    return (v: T) => { set(v); setFase({ tipo: 'editando' }); setErro(null); };
  }

  function comparar(e: Event) {
    e.preventDefault();
    const invalido = validarEntrada({ cenario, valor, dataAplicacao, dataResgate, a, b });
    if (invalido !== null) {
      setErro(invalido);
      setFase({ tipo: 'editando' });
      return;
    }
    try {
      const cen = cenarioConstante({
        cdiAA: cenario.cdi / 100, selicMetaAA: cenario.selicMeta / 100, ipcaAA: cenario.ipca / 100, trAM: cenario.tr / 100,
      });
      const duelo = duelar(valor, dataAplicacao, dataResgate, a, b, cen);
      const equivalencia = calcularEquivalencias({ ...a, valor, dataAplicacao }, dataResgate, cen);
      setErro(null);
      setFase(palpitesLigados ? { tipo: 'palpite', duelo, equivalencia } : { tipo: 'resultado', palpite: null, duelo, equivalencia });
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
      setFase({ tipo: 'editando' });
    }
  }

  function pularPalpites() {
    salvarPalpitesLigados(false);
    setPalpitesLigados(false);
    if (fase.tipo === 'palpite') setFase({ ...fase, tipo: 'resultado', palpite: null });
  }

  return (
    <main class="pagina">
      <header>
        <h1>Rende</h1>
        <p>Compare investimentos pelo que sobra no bolso e entenda o porquê de cada resultado.</p>
        <p class="aviso">Conteúdo educativo: não é recomendação de investimento.</p>
      </header>

      <form onSubmit={comparar} class="formulario" noValidate>
        <fieldset class="cenario">
          <legend>Cenário (valores de {CENARIO_INICIAL.dataReferencia}, Banco Central; edite à vontade)</legend>
          {CAMPOS_CENARIO.map((c) => (
            <div class="campo">
              <label for={`cen-${c.chave}`}>{c.rotulo} ({c.sufixo})</label>
              <Termo id={c.termo}>O que é {c.rotulo}?</Termo>
              <CampoNumerico id={`cen-${c.chave}`} step="0.01" valor={cenario[c.chave]}
                onChange={(v) => editar(setCenario)({ ...cenario, [c.chave]: v })} />
            </div>
          ))}
          <p class="dica">No M1 o cenário fica constante até o resgate. Projeções do mercado (Focus) chegam na próxima versão.</p>
        </fieldset>

        <fieldset class="aplicacao">
          <legend>Aplicação</legend>
          <div class="campo">
            <label for="valor">Valor (R$)</label>
            <CampoNumerico id="valor" min="0" step="100" valor={valor} onChange={editar(setValor)} />
          </div>
          <div class="campo">
            <label for="data-aplicacao">Data da aplicação</label>
            <input id="data-aplicacao" type="date" value={dataAplicacao} onInput={(e) => editar(setDataAplicacao)(e.currentTarget.value)}
              aria-describedby={naoEhDiaUtil(dataAplicacao) ? 'data-aplicacao-dica' : undefined} />
            <AvisoDiaUtil id="data-aplicacao-dica" data={dataAplicacao} oQue="a aplicação" />
          </div>
          <div class="campo">
            <label for="data-resgate">Data do resgate</label>
            <input id="data-resgate" type="date" value={dataResgate} onInput={(e) => editar(setDataResgate)(e.currentTarget.value)}
              aria-describedby={naoEhDiaUtil(dataResgate) ? 'data-resgate-dica' : undefined} />
            <AvisoDiaUtil id="data-resgate-dica" data={dataResgate} oQue="o resgate" />
          </div>
          <div class="prazos" role="group" aria-label="Prazos rápidos">
            {PRAZOS.map((p) => (
              <button type="button" disabled={dataAplicacao.trim() === ''}
                onClick={() => editar(setDataResgate)(somarMeses(dataAplicacao, p.meses))}>{p.rotulo}</button>
            ))}
          </div>
        </fieldset>

        <div class="ofertas">
          <FormOferta id="a" titulo="Opção A" oferta={a} onChange={editar(setA)} />
          <FormOferta id="b" titulo="Opção B" oferta={b} onChange={editar(setB)} />
        </div>

        <button type="submit" class="primario">Comparar</button>
        {!palpitesLigados && (
          <button type="button" class="link" onClick={() => { salvarPalpitesLigados(true); setPalpitesLigados(true); }}>
            Religar os palpites
          </button>
        )}
      </form>

      {erro && <p role="alert" class="erro">{erro}</p>}

      {fase.tipo === 'palpite' && (
        <PalpiteAntesDeVer refTitulo={tituloPalpite} nomeA={descreverOferta(a)} nomeB={descreverOferta(b)}
          onEscolher={(palpite) => setFase({ ...fase, tipo: 'resultado', palpite })} onPular={pularPalpites} />
      )}

      {fase.tipo === 'resultado' && (
        <>
          <ResultadoDuelo refTitulo={tituloResultado} duelo={fase.duelo} palpite={fase.palpite} />
          <Equivalencias origem={descreverOferta(a)} eq={fase.equivalencia} />
        </>
      )}
    </main>
  );
}

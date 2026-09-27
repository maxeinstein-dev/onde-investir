import { useEffect, useRef, useState } from 'preact/hooks';
import { armazenamentoLocal } from '../armazenamento/navegador';
import { lerPalpitesLigados, salvarPalpitesLigados } from '../armazenamento/preferencias';
import { descreverOferta } from '../conteudo/motivos';
import { ehDiaUtil } from '../engine/calendario';
import { duelar, type Duelo } from '../engine/comparador';
import { somarMeses, type DataISO } from '../engine/datas';
import { calcularEquivalencias, type ResultadoEquivalencia } from '../engine/equivalencia';
import type { Cenario } from '../engine/indexadores';
import type { Oferta } from '../engine/produtos';
import { CampoNumerico } from './CampoNumerico';
import { Equivalencias } from './Equivalencias';
import { FormOferta, taxaPreenchida } from './FormOferta';
import { hoje } from './hoje';
import { PalpiteAntesDeVer } from './PalpiteAntesDeVer';
import { ResultadoDuelo } from './ResultadoDuelo';

type Calculo = { duelo: Duelo; equivalencia: ResultadoEquivalencia };
type Fase =
  | { tipo: 'editando' }
  | ({ tipo: 'palpite' } & Calculo)
  | ({ tipo: 'resultado'; palpite: 'A' | 'B' | null } & Calculo);

const PRAZOS = [
  { rotulo: '6 meses', meses: 6 }, { rotulo: '1 ano', meses: 12 }, { rotulo: '2 anos', meses: 24 },
  { rotulo: '3 anos', meses: 36 }, { rotulo: '5 anos', meses: 60 },
];

interface Entrada {
  valor: number; dataAplicacao: DataISO; dataResgate: DataISO; a: Oferta; b: Oferta;
}

/** Mensagem humana para o primeiro campo vazio ou inválido; null se dá para comparar. */
function validarEntrada({ valor, dataAplicacao, dataResgate, a, b }: Entrada): string | null {
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

export interface PropsDueloRapido {
  /** O cenário ativo do painel de indicadores (projetado ou manual). */
  cenario: Cenario;
  /** Uma frase sobre o cenário usado, mostrada acima do formulário. */
  descricaoCenario: string;
}

/** A tela do M1: duas ofertas, um prazo, o palpite e as equivalências, no cenário ativo. */
export function DueloRapido({ cenario, descricaoCenario }: PropsDueloRapido) {
  const [valor, setValor] = useState(10000);
  const [dataAplicacao, setDataAplicacao] = useState<DataISO>(hoje());
  const [dataResgate, setDataResgate] = useState<DataISO>(somarMeses(hoje(), 24));
  const [a, setA] = useState<Oferta>({ produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 } });
  const [b, setB] = useState<Oferta>({ produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 } });
  const [fase, setFase] = useState<Fase>({ tipo: 'editando' });
  const [erro, setErro] = useState<string | null>(null);
  const [palpitesLigados, setPalpitesLigados] = useState(() => lerPalpitesLigados(armazenamentoLocal()));
  const tituloPalpite = useRef<HTMLHeadingElement>(null);
  const tituloResultado = useRef<HTMLHeadingElement>(null);
  const cenarioAnterior = useRef(cenario);

  // Trocar o cenário no painel invalida o resultado, como qualquer edição.
  useEffect(() => {
    if (cenarioAnterior.current === cenario) return;
    cenarioAnterior.current = cenario;
    setFase({ tipo: 'editando' });
    setErro(null);
  }, [cenario]);

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
    const invalido = validarEntrada({ valor, dataAplicacao, dataResgate, a, b });
    if (invalido !== null) {
      setErro(invalido);
      setFase({ tipo: 'editando' });
      return;
    }
    try {
      const duelo = duelar(valor, dataAplicacao, dataResgate, a, b, cenario);
      const equivalencia = calcularEquivalencias({ ...a, valor, dataAplicacao }, dataResgate, cenario);
      setErro(null);
      setFase(palpitesLigados ? { tipo: 'palpite', duelo, equivalencia } : { tipo: 'resultado', palpite: null, duelo, equivalencia });
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
      setFase({ tipo: 'editando' });
    }
  }

  function pularPalpites() {
    salvarPalpitesLigados(armazenamentoLocal(), false);
    setPalpitesLigados(false);
    if (fase.tipo === 'palpite') setFase({ ...fase, tipo: 'resultado', palpite: null });
  }

  return (
    <section class="duelo" aria-labelledby="duelo-titulo">
      <h2 id="duelo-titulo">Duelo rápido</h2>
      <p class="dica">Cenário: {descricaoCenario}</p>
      <form onSubmit={comparar} class="formulario" noValidate>
        <fieldset class="aplicacao">
          <legend>Aplicação</legend>
          <div class="campo">
            <label for="duelo-valor">Valor (R$)</label>
            <CampoNumerico id="duelo-valor" min="0" step="100" valor={valor} onChange={editar(setValor)} />
          </div>
          <div class="campo">
            <label for="duelo-data-aplicacao">Data da aplicação</label>
            <input id="duelo-data-aplicacao" type="date" value={dataAplicacao} onInput={(e) => editar(setDataAplicacao)(e.currentTarget.value)}
              aria-describedby={naoEhDiaUtil(dataAplicacao) ? 'duelo-data-aplicacao-dica' : undefined} />
            <AvisoDiaUtil id="duelo-data-aplicacao-dica" data={dataAplicacao} oQue="a aplicação" />
          </div>
          <div class="campo">
            <label for="duelo-data-resgate">Data do resgate</label>
            <input id="duelo-data-resgate" type="date" value={dataResgate} onInput={(e) => editar(setDataResgate)(e.currentTarget.value)}
              aria-describedby={naoEhDiaUtil(dataResgate) ? 'duelo-data-resgate-dica' : undefined} />
            <AvisoDiaUtil id="duelo-data-resgate-dica" data={dataResgate} oQue="o resgate" />
          </div>
          <div class="prazos" role="group" aria-label="Prazos rápidos">
            {PRAZOS.map((p) => (
              <button type="button" disabled={dataAplicacao.trim() === ''}
                onClick={() => editar(setDataResgate)(somarMeses(dataAplicacao, p.meses))}>{p.rotulo}</button>
            ))}
          </div>
        </fieldset>

        <div class="ofertas">
          <FormOferta id="duelo-a" titulo="Opção A" oferta={a} onChange={editar(setA)} />
          <FormOferta id="duelo-b" titulo="Opção B" oferta={b} onChange={editar(setB)} />
        </div>

        <button type="submit" class="primario">Comparar</button>
        {!palpitesLigados && (
          <button type="button" class="link" onClick={() => { salvarPalpitesLigados(armazenamentoLocal(), true); setPalpitesLigados(true); }}>
            Religar os palpites
          </button>
        )}
      </form>

      {erro && <p role="alert" class="erro">{erro}</p>}

      {fase.tipo === 'palpite' && (
        <PalpiteAntesDeVer id="duelo-palpite" refTitulo={tituloPalpite} opcoes={[descreverOferta(a), descreverOferta(b)]}
          onEscolher={(i) => setFase({ ...fase, tipo: 'resultado', palpite: i === 0 ? 'A' : 'B' })} onPular={pularPalpites} />
      )}

      {fase.tipo === 'resultado' && (
        <>
          <ResultadoDuelo refTitulo={tituloResultado} duelo={fase.duelo} palpite={fase.palpite} />
          <Equivalencias origem={descreverOferta(a)} eq={fase.equivalencia} />
        </>
      )}
    </section>
  );
}

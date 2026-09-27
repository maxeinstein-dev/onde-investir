import { useEffect, useRef, useState } from 'preact/hooks';
import { armazenamentoLocal } from '../armazenamento/navegador';
import { lerPalpitesLigados, salvarPalpitesLigados } from '../armazenamento/preferencias';
import { descreverProjecao } from '../conteudo/comparacao';
import { descreverOferta } from '../conteudo/motivos';
import { ehDiaUtil } from '../engine/calendario';
import { ehDataValida, somarMeses, type DataISO } from '../engine/datas';
import { calcularEquivalencias, type ResultadoEquivalencia } from '../engine/equivalencia';
import type { Cenario } from '../engine/indexadores';
import { projetar, validarOfertaCadastrada, type Liquidez, type OfertaCadastrada } from '../engine/ofertas';
import { ehTesouro, type Oferta } from '../engine/produtos';
import { CampoNumerico } from './CampoNumerico';
import { Equivalencias, EquivalenciasIndisponiveis } from './Equivalencias';
import { FormOferta, taxaPreenchida } from './FormOferta';
import { DATA_MAXIMA, DATA_MINIMA, hoje } from './hoje';
import { PalpiteAntesDeVer } from './PalpiteAntesDeVer';
import { ResultadoDuelo, type LadoDuelo } from './ResultadoDuelo';

/** equivalencia null: a opção A não pode ser resgatada na data, e as equivalências não são calculadas. */
type Calculo = { a: LadoDuelo; b: LadoDuelo; equivalencia: ResultadoEquivalencia | null };
type Fase =
  | { tipo: 'editando' }
  | ({ tipo: 'palpite' } & Calculo)
  | ({ tipo: 'resultado'; palpite: 'A' | 'B' | null } & Calculo);

const PRAZOS = [
  { rotulo: '6 meses', meses: 6 }, { rotulo: '1 ano', meses: 12 }, { rotulo: '2 anos', meses: 24 },
  { rotulo: '3 anos', meses: 36 }, { rotulo: '5 anos', meses: 60 },
];

/** Uma opção do duelo como a pessoa digitou: a oferta, a liquidez e o vencimento ('' = sem vencimento). */
interface Opcao { oferta: Oferta; liquidez: Liquidez; vencimento: DataISO }

/** Tesouro tem sempre liquidez diária; poupança não tem liquidez nem vencimento a escolher. */
const escolheLiquidez = (o: Oferta) => !ehTesouro(o.produto) && o.produto !== 'POUPANCA';
const temVencimento = (o: Oferta) => o.produto !== 'POUPANCA';
const exigeVencimento = (op: Opcao) =>
  ehTesouro(op.oferta.produto) || (escolheLiquidez(op.oferta) && op.liquidez === 'NO_VENCIMENTO');

/** A opção no formato do engine. O duelo não pede emissor nem conglomerado: ficam fixos no rótulo. */
function paraCadastrada(op: Opcao, rotulo: 'Opção A' | 'Opção B'): OfertaCadastrada {
  const vencimento = temVencimento(op.oferta) && op.vencimento.trim() !== '' ? { vencimento: op.vencimento } : {};
  return {
    ...op.oferta, id: rotulo, emissor: rotulo, conglomerado: rotulo,
    liquidez: escolheLiquidez(op.oferta) ? op.liquidez : 'DIARIA', ...vencimento,
  };
}

interface Entrada {
  valor: number; dataAplicacao: DataISO; dataResgate: DataISO; a: Opcao; b: Opcao;
}

/** Mensagem humana para o primeiro campo vazio ou inválido; null se dá para comparar. */
function validarEntrada({ valor, dataAplicacao, dataResgate, a, b }: Entrada): string | null {
  if (!Number.isFinite(valor)) return 'Preencha o valor da aplicação.';
  if (dataAplicacao.trim() === '') return 'Informe a data da aplicação.';
  if (!ehDataValida(dataAplicacao)) return 'A data da aplicação é inválida.';
  if (dataResgate.trim() === '') return 'Informe a data do resgate.';
  if (!ehDataValida(dataResgate)) return 'A data do resgate é inválida.';
  if (!taxaPreenchida(a.oferta.indexacao)) return 'Preencha a taxa da Opção A.';
  if (!taxaPreenchida(b.oferta.indexacao)) return 'Preencha a taxa da Opção B.';
  for (const [op, nome] of [[a, 'Opção A'], [b, 'Opção B']] as const) {
    const vazio = op.vencimento.trim() === '';
    if (exigeVencimento(op) && vazio) return `Informe o vencimento da ${nome}.`;
    if (temVencimento(op.oferta) && !vazio && !ehDataValida(op.vencimento)) return `O vencimento da ${nome} é inválido.`;
  }
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

/** Liquidez e vencimento da opção, no mesmo grupo do produto e da taxa. */
function CamposPrazo({ id, opcao, onChange }: { id: string; opcao: Opcao; onChange: (o: Opcao) => void }) {
  const { oferta } = opcao;
  if (!temVencimento(oferta)) return null;
  const obrigatorio = exigeVencimento(opcao);
  const dica = ehTesouro(oferta.produto) ? 'Títulos do Tesouro têm liquidez diária e vencimento.'
    : obrigatorio ? 'Obrigatório sem liquidez diária.' : 'Opcional com liquidez diária.';
  return (
    <>
      {escolheLiquidez(oferta) && (
        <>
          <label for={`${id}-liquidez`}>Liquidez</label>
          <select id={`${id}-liquidez`} value={opcao.liquidez}
            onChange={(e) => onChange({ ...opcao, liquidez: e.currentTarget.value as Liquidez })}>
            <option value="DIARIA">Diária</option>
            <option value="NO_VENCIMENTO">Só no vencimento</option>
          </select>
        </>
      )}
      <label for={`${id}-vencimento`}>Vencimento</label>
      <input id={`${id}-vencimento`} type="date" min={DATA_MINIMA} max={DATA_MAXIMA} value={opcao.vencimento} required={obrigatorio}
        aria-describedby={`${id}-vencimento-dica`} onInput={(e) => onChange({ ...opcao, vencimento: e.currentTarget.value })} />
      <p id={`${id}-vencimento-dica`} class="dica">{dica}</p>
    </>
  );
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
  const [a, setA] = useState<Opcao>({
    oferta: { produto: 'CDB', indexacao: { tipo: 'POS_CDI', percentualCDI: 1.03 } }, liquidez: 'DIARIA', vencimento: '',
  });
  const [b, setB] = useState<Opcao>({
    oferta: { produto: 'LCI', indexacao: { tipo: 'POS_CDI', percentualCDI: 0.8 } }, liquidez: 'DIARIA', vencimento: '',
  });
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
      const ofertaA = paraCadastrada(a, 'Opção A');
      const ofertaB = paraCadastrada(b, 'Opção B');
      validarOfertaCadastrada(ofertaA);
      validarOfertaCadastrada(ofertaB);
      const ladoA: LadoDuelo = { oferta: a.oferta, projecao: projetar(ofertaA, valor, dataAplicacao, dataResgate, cenario, { tipo: 'PADRAO' }) };
      const ladoB: LadoDuelo = { oferta: b.oferta, projecao: projetar(ofertaB, valor, dataAplicacao, dataResgate, cenario, { tipo: 'PADRAO' }) };
      for (const { projecao: p } of [ladoA, ladoB]) {
        if (p.estado === 'DISPONIVEL' && !Number.isFinite(p.liquido)) {
          throw new Error('O valor líquido de uma das ofertas não é finito: confira o cenário e as taxas');
        }
      }
      // A equivalência continua sobre a opção A aplicada direto até o resgate, e só se A puder ser resgatada nessa data.
      const equivalencia = ladoA.projecao.estado === 'DISPONIVEL'
        ? calcularEquivalencias({ ...a.oferta, valor, dataAplicacao }, dataResgate, cenario)
        : null;
      const calculo: Calculo = { a: ladoA, b: ladoB, equivalencia };
      // O palpite só faz sentido quando as duas podem ser resgatadas.
      const ambas = ladoA.projecao.estado === 'DISPONIVEL' && ladoB.projecao.estado === 'DISPONIVEL';
      setErro(null);
      setFase(palpitesLigados && ambas ? { tipo: 'palpite', ...calculo } : { tipo: 'resultado', palpite: null, ...calculo });
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

  const avisoEquivalencia = (c: Calculo): string | undefined =>
    c.a.projecao.estado === 'DISPONIVEL' && c.a.projecao.reinvestimento
      ? `As equivalências consideram ${descreverOferta(c.a.oferta)} aplicado direto até o resgate, sem a reaplicação no vencimento.`
      : undefined;

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
            <input id="duelo-data-aplicacao" type="date" min={DATA_MINIMA} max={DATA_MAXIMA} value={dataAplicacao} onInput={(e) => editar(setDataAplicacao)(e.currentTarget.value)}
              aria-describedby={naoEhDiaUtil(dataAplicacao) ? 'duelo-data-aplicacao-dica' : undefined} />
            <AvisoDiaUtil id="duelo-data-aplicacao-dica" data={dataAplicacao} oQue="a aplicação" />
          </div>
          <div class="campo">
            <label for="duelo-data-resgate">Data do resgate</label>
            <input id="duelo-data-resgate" type="date" min={DATA_MINIMA} max={DATA_MAXIMA} value={dataResgate} onInput={(e) => editar(setDataResgate)(e.currentTarget.value)}
              aria-describedby={naoEhDiaUtil(dataResgate) ? 'duelo-data-resgate-liquidez duelo-data-resgate-dica' : 'duelo-data-resgate-liquidez'} />
            <p id="duelo-data-resgate-liquidez" class="dica">
              Com liquidez diária, o resgate pode ser em qualquer data. Sem liquidez, só no vencimento.
            </p>
            <AvisoDiaUtil id="duelo-data-resgate-dica" data={dataResgate} oQue="o resgate" />
          </div>
          <div class="prazos" role="group" aria-label="Prazos rápidos">
            {PRAZOS.map((p) => (
              <button type="button" disabled={!ehDataValida(dataAplicacao)}
                onClick={() => editar(setDataResgate)(somarMeses(dataAplicacao, p.meses))}>{p.rotulo}</button>
            ))}
          </div>
        </fieldset>

        <div class="ofertas">
          <FormOferta id="duelo-a" titulo="Opção A" oferta={a.oferta} onChange={(oferta) => editar(setA)({ ...a, oferta })}>
            <CamposPrazo id="duelo-a" opcao={a} onChange={editar(setA)} />
          </FormOferta>
          <FormOferta id="duelo-b" titulo="Opção B" oferta={b.oferta} onChange={(oferta) => editar(setB)({ ...b, oferta })}>
            <CamposPrazo id="duelo-b" opcao={b} onChange={editar(setB)} />
          </FormOferta>
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
        <PalpiteAntesDeVer id="duelo-palpite" refTitulo={tituloPalpite} opcoes={[descreverOferta(a.oferta), descreverOferta(b.oferta)]}
          onEscolher={(i) => setFase({ ...fase, tipo: 'resultado', palpite: i === 0 ? 'A' : 'B' })} onPular={pularPalpites} />
      )}

      {fase.tipo === 'resultado' && (
        <>
          <ResultadoDuelo refTitulo={tituloResultado} a={fase.a} b={fase.b} palpite={fase.palpite} />
          {fase.equivalencia
            ? <Equivalencias origem={descreverOferta(fase.a.oferta)} eq={fase.equivalencia} aviso={avisoEquivalencia(fase)} />
            : <EquivalenciasIndisponiveis origem={descreverOferta(fase.a.oferta)} motivo={descreverProjecao(fase.a.projecao)} />}
        </>
      )}
    </section>
  );
}

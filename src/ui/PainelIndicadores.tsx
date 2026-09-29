import { useEffect, useRef, useState } from 'preact/hooks';
import type { PreferenciasCenario } from '../armazenamento/preferencias';
import type { IdTermo } from '../conteudo/glossario';
import type { CenarioAtivo, EscolhaCenario, ValoresManuais } from '../dados/cenarios';
import type { IndicadoresCarregados, StatusFonte } from '../dados/indicadores';
import { dataBR } from '../engine/datas';
import { PREMISSAS_PADRAO, type Premissas } from '../engine/projecao';
import { formatarPercentual } from '../formato';
import { CampoNumerico } from './CampoNumerico';
import { Termo } from './Termo';

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
  /** O primeiro erro de um rascunho do painel (premissas ou valores manuais), ou null quando não há. */
  onCenarioInvalido?: (erro: string | null) => void;
}

export const OPCOES: { valor: EscolhaCenario; rotulo: string }[] = [
  { valor: 'SOBEM', rotulo: 'Juros sobem' },
  { valor: 'BASE', rotulo: 'Base (Focus)' },
  { valor: 'CAEM', rotulo: 'Juros caem' },
  { valor: 'MANUAL', rotulo: 'Manual' },
];

// ---------- Valores atuais e origem ----------

/** Até 4 casas: a TR mensal tem ordem de grandeza de 0,1%. */
const PERCENTUAL_PRECISO = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: 4 });
const BRT_MS = -3 * 3_600_000;

/** Instante em BRT como "dd/mm" e "hh:mm" (o fuso de negócio é fixo em −03:00). */
export function diaEHora(ms: number): { dia: string; hora: string } {
  const iso = new Date(ms + BRT_MS).toISOString();
  return { dia: `${iso.slice(8, 10)}/${iso.slice(5, 7)}`, hora: iso.slice(11, 16) };
}

export function descreverOrigem(status: StatusFonte, obtidoEm: number | undefined): string {
  switch (status) {
    case 'REDE': return 'atualizado agora';
    case 'FALHOU': return 'indisponível';
    case 'CACHE': {
      if (obtidoEm === undefined) return 'do cache';
      const { dia, hora } = diaEHora(obtidoEm);
      return `do cache de ${dia} ${hora}`;
    }
    case 'CACHE_VENCIDO':
      return obtidoEm === undefined ? 'cache vencido' : `cache vencido de ${diaEHora(obtidoEm).dia}`;
  }
}

function ValoresAtuais({ indicadores }: { indicadores: IndicadoresCarregados }) {
  const a = indicadores.atuais;
  return a === null ? (
    <p class="dica">Os valores atuais estão indisponíveis agora. O cenário manual continua valendo.</p>
  ) : (
    <>
      <ul class="painel__valores" aria-label="Indicadores atuais">
        <li><Termo id="cdi">CDI</Termo> <span class="painel__valor">{formatarPercentual(a.cdiAA)} a.a.</span></li>
        <li><Termo id="selic">Selic meta</Termo> <span class="painel__valor">{formatarPercentual(a.selicMetaAA)} a.a.</span></li>
        <li><Termo id="ipca">IPCA 12 meses</Termo> <span class="painel__valor">{formatarPercentual(a.ipca12mAA)}</span></li>
        <li><Termo id="tr">TR</Termo> <span class="painel__valor">{PERCENTUAL_PRECISO.format(a.trAM)} a.m.</span></li>
      </ul>
      <p class="dica">Valores de {dataBR(a.dataReferencia)}, do Banco Central.</p>
    </>
  );
}

function Origem({ indicadores }: { indicadores: IndicadoresCarregados }) {
  const grupos: { nome: string; status: StatusFonte; obtidoEm?: number }[] = [
    { nome: 'Valores atuais (SGS)', status: indicadores.status.sgs, obtidoEm: indicadores.obtidoEm.sgs },
    { nome: 'Focus', status: indicadores.status.focus, obtidoEm: indicadores.obtidoEm.focus },
    { nome: 'Calendário do Copom', status: indicadores.status.copom, obtidoEm: indicadores.obtidoEm.copom },
  ];
  return (
    <ul class="painel__origem dica" aria-label="Origem dos dados">
      {grupos.map((g) => <li key={g.nome}>{g.nome}: {descreverOrigem(g.status, g.obtidoEm)}</li>)}
    </ul>
  );
}

/** Por que os cenários projetados não estão disponíveis; null se estão. */
function motivoSemProjecao(ind: IndicadoresCarregados | null): string | null {
  if (ind === null) return 'aguardando os indicadores';
  if (ind.atuais === null) return 'sem dados do SGS';
  if (ind.focus === null) return 'sem dados do Focus';
  if (ind.reunioes === null) return 'sem o calendário do Copom';
  return null;
}

// ---------- Premissas ----------

/** Premissas em unidades da tela: % e p.p. em vez de fração. */
interface PremissasNaTela { k: number; ipca: number; juroReal: number; anos: number; spread: number }

const naTela = (p: Premissas): PremissasNaTela => ({
  k: p.k, ipca: p.ipcaLongoPrazoAA * 100, juroReal: p.juroRealLongoPrazoAA * 100, anos: p.anosConvergencia, spread: p.spreadCDI * 100,
});

const CAMPOS_PREMISSAS: { chave: keyof PremissasNaTela; id: string; rotulo: string; step: string }[] = [
  { chave: 'k', id: 'premissa-k', rotulo: 'Desvios-padrão (k)', step: '0.1' },
  { chave: 'ipca', id: 'premissa-ipca', rotulo: 'IPCA de longo prazo (% a.a.)', step: '0.1' },
  { chave: 'juroReal', id: 'premissa-juro-real', rotulo: 'Juro real de longo prazo (% a.a.)', step: '0.1' },
  { chave: 'anos', id: 'premissa-anos', rotulo: 'Anos de convergência', step: '1' },
  { chave: 'spread', id: 'premissa-spread', rotulo: 'Spread do CDI (p.p.)', step: '0.01' },
];

/** Os mesmos limites de `validarPremissas` no engine, com mensagem humana. */
function validarPremissasNaTela(p: PremissasNaTela): string | null {
  if (!Number.isFinite(p.k)) return 'Preencha os desvios-padrão (k).';
  if (p.k < 0) return 'Os desvios-padrão (k) precisam ser um número maior ou igual a zero.';
  if (!Number.isFinite(p.ipca)) return 'Preencha o IPCA de longo prazo.';
  if (p.ipca <= -100) return 'O IPCA de longo prazo precisa ser maior que −100%.';
  if (!Number.isFinite(p.juroReal)) return 'Preencha o juro real de longo prazo.';
  if (p.juroReal <= -100) return 'O juro real de longo prazo precisa ser maior que −100%.';
  if (!Number.isInteger(p.anos) || p.anos < 0 || p.anos > 30) return 'Os anos de convergência precisam ser um número inteiro de 0 a 30.';
  if (!Number.isFinite(p.spread)) return 'Preencha o spread do CDI.';
  if (p.spread < 0 || p.spread >= 5) return 'O spread do CDI precisa ficar entre 0 e 5 p.p. (sem chegar a 5).';
  return null;
}

const daTela = (p: PremissasNaTela): Premissas => ({
  k: p.k, ipcaLongoPrazoAA: p.ipca / 100, juroRealLongoPrazoAA: p.juroReal / 100, anosConvergencia: p.anos, spreadCDI: p.spread / 100,
});

function AjustarPremissas({ premissas, onChange, onErro }: {
  premissas: Premissas; onChange: (p: Premissas) => void; onErro: (erro: string | null) => void;
}) {
  const [rascunho, setRascunho] = useState(() => naTela(premissas));
  const [erro, setErroLocal] = useState<string | null>(null);
  const setErro = (e: string | null) => { setErroLocal(e); onErro(e); };

  function mudar(chave: keyof PremissasNaTela, valor: number) {
    const novo = { ...rascunho, [chave]: valor };
    setRascunho(novo);
    const invalido = validarPremissasNaTela(novo);
    setErro(invalido);
    if (invalido === null) onChange(daTela(novo));
  }

  function restaurar() {
    setRascunho(naTela(PREMISSAS_PADRAO));
    setErro(null);
    onChange(PREMISSAS_PADRAO);
  }

  return (
    <details class="painel__premissas">
      <summary>Ajustar premissas</summary>
      <p class="dica">
        Valem para os cenários projetados. Depois do último ano do <Termo id="focus">Focus</Termo>, a Selic converge
        para o IPCA de longo prazo somado ao juro real, no prazo de convergência. O CDI fica abaixo da Selic meta pelo spread.
      </p>
      <div class="painel__campos">
        {CAMPOS_PREMISSAS.map((c) => (
          <div class="campo" key={c.id}>
            <label for={c.id}>{c.rotulo}</label>
            <CampoNumerico id={c.id} step={c.step} valor={rascunho[c.chave]} onChange={(v) => mudar(c.chave, v)} />
          </div>
        ))}
      </div>
      {erro && <p role="alert" class="erro">{erro}</p>}
      <button type="button" onClick={restaurar}>Restaurar padrão</button>
    </details>
  );
}

// ---------- Cenário manual ----------

const CAMPOS_MANUAIS: { chave: keyof ValoresManuais; rotulo: string; artigo: 'o' | 'a'; termo: IdTermo; sufixo: string }[] = [
  { chave: 'cdi', rotulo: 'CDI', artigo: 'o', termo: 'cdi', sufixo: '% a.a.' },
  { chave: 'selicMeta', rotulo: 'Selic meta', artigo: 'a', termo: 'selic', sufixo: '% a.a.' },
  { chave: 'ipca', rotulo: 'IPCA', artigo: 'o', termo: 'ipca', sufixo: '% a.a.' },
  { chave: 'tr', rotulo: 'TR', artigo: 'a', termo: 'tr', sufixo: '% a.m.' },
];

/** Mensagem humana para o primeiro valor vazio ou inválido; null se todos valem (a regra de `valoresManuaisValidos`). */
function validarManual(m: ValoresManuais): string | null {
  for (const c of CAMPOS_MANUAIS) {
    const v = m[c.chave];
    if (!Number.isFinite(v)) return `Preencha ${c.artigo} ${c.rotulo} do cenário.`;
    if (v <= -100) return `${c.artigo === 'o' ? 'O' : 'A'} ${c.rotulo} do cenário precisa ser maior que −100%.`;
  }
  return null;
}

function CenarioManual({ manual, onChange, onErro }: {
  manual: ValoresManuais; onChange: (m: ValoresManuais) => void; onErro: (erro: string | null) => void;
}) {
  const [rascunho, setRascunho] = useState(manual);
  const [erro, setErroLocal] = useState<string | null>(null);
  const setErro = (e: string | null) => { setErroLocal(e); onErro(e); };
  // Ao sair do Manual, o rascunho some junto com o campo, e o erro dele deixa de valer.
  const onErroAtual = useRef(onErro);
  onErroAtual.current = onErro;
  useEffect(() => () => onErroAtual.current(null), []);

  function mudar(chave: keyof ValoresManuais, valor: number) {
    const novo = { ...rascunho, [chave]: valor };
    setRascunho(novo);
    const invalido = validarManual(novo);
    setErro(invalido);
    if (invalido === null) onChange(novo);
  }

  return (
    <fieldset class="painel__manual">
      <legend>Valores do cenário manual</legend>
      <div class="painel__campos">
        {CAMPOS_MANUAIS.map((c) => (
          <div class="campo" key={c.chave}>
            <label for={`manual-${c.chave}`}>{c.rotulo} ({c.sufixo})</label>
            <Termo id={c.termo}>O que é {c.rotulo}?</Termo>
            <CampoNumerico id={`manual-${c.chave}`} step="0.01" valor={rascunho[c.chave]} onChange={(v) => mudar(c.chave, v)} />
          </div>
        ))}
      </div>
      <p class="dica">No cenário manual, os valores ficam constantes até o resgate.</p>
      {erro && <p role="alert" class="erro">{erro}</p>}
    </fieldset>
  );
}

// ---------- Painel ----------

export function PainelIndicadores({ indicadores, preferencias, ativo, explicacao, onChange, onCenarioInvalido }: PropsPainelIndicadores) {
  // Os dois rascunhos que podem estar inválidos; o App recebe o primeiro erro.
  const erros = useRef<{ manual: string | null; premissas: string | null }>({ manual: null, premissas: null });
  function relatar(parte: 'manual' | 'premissas', erro: string | null) {
    if (erros.current[parte] === erro) return;
    erros.current = { ...erros.current, [parte]: erro };
    onCenarioInvalido?.(erros.current.manual ?? erros.current.premissas);
  }
  const semProjecao = motivoSemProjecao(indicadores);
  // Sem dados para projetar, o cenário em uso é o manual, mesmo que a escolha salva seja outra.
  const selecionada: EscolhaCenario = ativo.projetado ? preferencias.escolha : 'MANUAL';
  return (
    <section class="painel" aria-labelledby="painel-titulo">
      <h2 id="painel-titulo">Indicadores e cenário</h2>
      {indicadores !== null && <ValoresAtuais indicadores={indicadores} />}
      {/* Contêiner vivo permanente: um aria-live criado junto com o conteúdo não é anunciado. Só o texto muda. */}
      <div class="painel__status" aria-live="polite">
        {indicadores === null ? <p>Buscando indicadores no Banco Central…</p> : <Origem indicadores={indicadores} />}
      </div>

      <div role="radiogroup" aria-labelledby="painel-cenario" class="painel__cenarios">
        <span id="painel-cenario" class="painel__rotulo"><Termo id="cenario">Cenário</Termo></span>
        {OPCOES.map((o) => {
          const desabilitada = o.valor !== 'MANUAL' && semProjecao !== null;
          return (
            <label key={o.valor} class="painel__opcao">
              <input type="radio" name="cenario" value={o.valor} checked={selecionada === o.valor} disabled={desabilitada}
                onChange={() => onChange({ ...preferencias, escolha: o.valor })} />
              {o.rotulo}
              {desabilitada && <span class="painel__motivo">({semProjecao})</span>}
            </label>
          );
        })}
      </div>
      <div class="painel__explicacao">
        {explicacao.map((frase) => <p key={frase} class="dica">{frase}</p>)}
      </div>

      {selecionada === 'MANUAL' && (
        <CenarioManual manual={preferencias.manual} onChange={(manual) => onChange({ ...preferencias, manual })}
          onErro={(e) => relatar('manual', e)} />
      )}
      <AjustarPremissas premissas={preferencias.premissas} onChange={(premissas) => onChange({ ...preferencias, premissas })}
        onErro={(e) => relatar('premissas', e)} />
    </section>
  );
}

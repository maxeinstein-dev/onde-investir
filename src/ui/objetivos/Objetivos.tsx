// Lista de objetivos: cartões com "Ver sugestão"/"Editar"/"Remover" (confirmação inline), e
// "+ Novo objetivo" com um seletor de tipo (spec §9.1, plano M4a C4).
import { useEffect, useRef, useState } from 'preact/hooks';
import { LIMITE_OBJETIVOS, novoIdObjetivo, type ObjetivoSalvo } from '../../armazenamento/objetivos';
import { dataBR, type DataISO } from '../../engine/datas';
import type { ItemFGC } from '../../engine/fgc';
import type { Cenario } from '../../engine/indexadores';
import type { OfertaCadastrada } from '../../engine/ofertas';
import { valorAlvo, type Objetivo } from '../../engine/sugestao';
import { formatarMoeda } from '../../formato';
import { FormObjetivo, ROTULO_TIPO_OBJETIVO } from './FormObjetivo';
import { Sugestao } from './Sugestao';

export interface PropsObjetivos {
  objetivos: readonly ObjetivoSalvo[];
  /** A lista nova (criar, editar ou remover). Quem chama persiste. */
  onChange: (objetivos: ObjetivoSalvo[]) => void;
  catalogo: readonly OfertaCadastrada[];
  carteira: readonly ItemFGC[];
  hoje: DataISO;
  cenario: Cenario;
  onIrParaComparar: (oferta: OfertaCadastrada) => void;
  gerarId?: () => string;
}

const TIPOS: readonly Objetivo['tipo'][] = ['RESERVA', 'COM_DATA', 'LONGO_PRAZO', 'SEM_OBJETIVO', 'RENDA_MENSAL'];

/** Um resumo de uma linha: o valor-alvo (reserva, com data), o horizonte (longo prazo, sem objetivo) ou o principal/renda desejada (renda mensal). */
function resumoObjetivo(o: ObjetivoSalvo): string {
  if (o.entradas.tipo === 'RENDA_MENSAL') {
    return `Principal: ${formatarMoeda(o.entradas.principal)} · Renda desejada: ${formatarMoeda(o.entradas.rendaMensalDesejada)}/mês`;
  }
  const alvo = valorAlvo(o.entradas);
  if (alvo !== null) return `Valor-alvo: ${formatarMoeda(alvo)}`;
  const h = o.entradas as Extract<Objetivo, { tipo: 'LONGO_PRAZO' | 'SEM_OBJETIVO' }>;
  return `Horizonte: ${h.horizonteAnos} ${h.horizonteAnos === 1 ? 'ano' : 'anos'}`;
}

function detalheObjetivo(o: ObjetivoSalvo): string | null {
  return o.entradas.tipo === 'COM_DATA' ? `Data: ${dataBR(o.entradas.data)}` : null;
}

type Foco = { cartao: number; reserva: 'lista' | 'formulario' };

interface PropsCartao {
  objetivo: ObjetivoSalvo;
  indice: number;
  onVerSugestao: () => void;
  onEditar: () => void;
  onRemover: () => void;
}

function Cartao({ objetivo, indice, onVerSugestao, onEditar, onRemover }: PropsCartao) {
  const [confirmando, setConfirmando] = useState(false);
  const botaoConfirmar = useRef<HTMLButtonElement>(null);
  const idTitulo = `objetivo-${indice}-titulo`;

  useEffect(() => {
    if (confirmando) botaoConfirmar.current?.focus();
  }, [confirmando]);

  const detalhe = detalheObjetivo(objetivo);

  return (
    <li>
      <article class="cartao cartao--objetivo" aria-labelledby={idTitulo}>
        <h3 id={idTitulo} tabIndex={-1}>{objetivo.nome ?? 'Objetivo sem nome'}</h3>
        <p class="cartao__detalhe">{ROTULO_TIPO_OBJETIVO[objetivo.entradas.tipo]}</p>
        <p class="cartao__detalhe">{resumoObjetivo(objetivo)}</p>
        {detalhe && <p class="cartao__detalhe">{detalhe}</p>}
        {confirmando ? (
          <div class="cartao__confirmacao">
            <p>Remover este objetivo?</p>
            <button type="button" ref={botaoConfirmar} onClick={onRemover}>Sim, remover</button>
            <button type="button" onClick={() => setConfirmando(false)}>Cancelar</button>
          </div>
        ) : (
          <div class="cartao__acoes">
            <button type="button" onClick={onVerSugestao}>Ver sugestão</button>
            <button type="button" onClick={onEditar}>Editar</button>
            <button type="button" onClick={() => setConfirmando(true)}>Remover</button>
          </div>
        )}
      </article>
    </li>
  );
}

export function Objetivos({ objetivos, onChange, catalogo, carteira, hoje, cenario, onIrParaComparar, gerarId = novoIdObjetivo }: PropsObjetivos) {
  const [verSugestao, setVerSugestao] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [escolhendoTipo, setEscolhendoTipo] = useState(false);
  const [novoTipo, setNovoTipo] = useState<Objetivo['tipo'] | null>(null);
  const [foco, setFoco] = useState<Foco | null>(null);

  const secao = useRef<HTMLElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const emEdicao = objetivos.find((o) => o.id === editando) ?? null;
  const emSugestao = objetivos.find((o) => o.id === verSugestao) ?? null;
  const cheio = objetivos.length >= LIMITE_OBJETIVOS;

  useEffect(() => {
    if (!foco) return;
    const cartao = secao.current?.querySelector<HTMLElement>(`#objetivo-${foco.cartao}-titulo`);
    const reserva = foco.reserva === 'lista' ? titulo.current : secao.current?.querySelector<HTMLElement>('#objetivos-titulo');
    (cartao ?? reserva)?.focus();
    setFoco(null);
  }, [foco]);

  if (emSugestao) {
    return (
      <section class="objetivos" aria-labelledby="objetivos-titulo" ref={secao}>
        <button type="button" onClick={() => setVerSugestao(null)}>Voltar para Objetivos</button>
        <Sugestao objetivo={emSugestao} catalogo={catalogo} carteira={carteira} hoje={hoje} cenario={cenario} onIrParaComparar={onIrParaComparar} />
      </section>
    );
  }

  function salvar(nome: string | undefined, entradas: Objetivo) {
    if (emEdicao) {
      const novo: ObjetivoSalvo = { ...emEdicao, nome, entradas };
      const indice = objetivos.findIndex((o) => o.id === emEdicao.id);
      onChange(objetivos.map((o) => (o.id === emEdicao.id ? novo : o)));
      setEditando(null);
      setFoco({ cartao: indice, reserva: 'formulario' });
      return;
    }
    const novo: ObjetivoSalvo = { id: gerarId(), nome, criadoEm: hoje, entradas };
    onChange([...objetivos, novo]);
    setEscolhendoTipo(false);
    setNovoTipo(null);
    setFoco({ cartao: objetivos.length, reserva: 'formulario' });
  }

  function remover(id: string) {
    const indice = objetivos.findIndex((o) => o.id === id);
    const restantes = objetivos.filter((o) => o.id !== id);
    onChange(restantes);
    setFoco({ cartao: indice < restantes.length ? indice : -1, reserva: 'lista' });
    if (editando === id) setEditando(null);
  }

  function cancelarFormulario() {
    setEditando(null);
    setEscolhendoTipo(false);
    setNovoTipo(null);
  }

  return (
    <section class="objetivos" aria-labelledby="objetivos-titulo" ref={secao}>
      <h2 id="objetivos-titulo" ref={titulo} tabIndex={-1}>Objetivos</h2>
      {objetivos.length === 0 ? (
        <p class="dica">Cadastre um objetivo para receber uma sugestão de carteira.</p>
      ) : (
        <ul class="lista-ofertas" aria-label="Objetivos cadastrados">
          {objetivos.map((o, i) => (
            <Cartao key={o.id} objetivo={o} indice={i} onVerSugestao={() => setVerSugestao(o.id)}
              onEditar={() => setEditando(o.id)} onRemover={() => remover(o.id)} />
          ))}
        </ul>
      )}

      {emEdicao && (
        <FormObjetivo tipo={emEdicao.entradas.tipo} inicial={emEdicao} onSalvar={salvar} onCancelar={cancelarFormulario} />
      )}

      {!emEdicao && novoTipo && (
        <FormObjetivo tipo={novoTipo} onSalvar={salvar} onCancelar={cancelarFormulario} />
      )}

      {!emEdicao && !novoTipo && (
        cheio ? (
          <p class="dica">Limite de {LIMITE_OBJETIVOS} objetivos: remova um para cadastrar outro.</p>
        ) : escolhendoTipo ? (
          <fieldset class="cadastro__detalhes">
            <legend>Que tipo de objetivo?</legend>
            {TIPOS.map((tipo) => (
              <button key={tipo} type="button" onClick={() => setNovoTipo(tipo)}>{ROTULO_TIPO_OBJETIVO[tipo]}</button>
            ))}
            <button type="button" onClick={() => setEscolhendoTipo(false)}>Cancelar</button>
          </fieldset>
        ) : (
          <button type="button" onClick={() => setEscolhendoTipo(true)}>+ Novo objetivo</button>
        )
      )}
    </section>
  );
}

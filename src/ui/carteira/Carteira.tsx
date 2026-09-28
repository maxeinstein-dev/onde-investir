import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { LIMITE_POSICOES, novoIdPosicao } from '../../armazenamento/posicoes';
import { DICA_EXPORTAR, SEM_POSICOES, textoDoHistorico } from '../../conteudo/carteira';
import type { Cenario } from '../../engine/indexadores';
import type { Posicao } from '../../engine/posicoes';
import { formatarMoeda } from '../../formato';
import { hoje } from '../hoje';
import type { EstadoHistorico } from '../useHistorico';
import { ExposicaoFGC } from './ExposicaoFGC';
import { FormPosicao, ID_FORM_POSICAO } from './FormPosicao';
import { idTituloPosicao, ListaPosicoes } from './ListaPosicoes';
import { resumirCarteira } from './resumo';

export interface PropsCarteira {
  posicoes: readonly Posicao[];
  /** A lista nova (cadastro, edição ou remoção). Quem chama persiste. */
  onChange: (posicoes: Posicao[]) => void;
  /** O cenário ativo com o histórico realizado (`cenarioComHistorico`), ou só o cenário enquanto ele não chega. */
  cenario: Cenario;
  historico: EstadoHistorico;
  /** Dias úteis sem CDI no histórico (a UI avisa "histórico incompleto"). */
  lacunas: number;
  /** O histórico veio com dado fora da faixa e foi deixado de lado. */
  historicoInvalido: boolean;
  /** Conglomerados já usados (ofertas e posições), sugeridos no campo. */
  conglomerados: readonly string[];
  gerarId?: () => string;
}

const PREFIXO = 'carteira';

/** A aba Carteira: as posições que a pessoa já tem, quanto valem hoje e quanto está coberto pelo FGC (spec §5.3). */
export function Carteira({
  posicoes, onChange, cenario, historico, lacunas, historicoInvalido, conglomerados, gerarId = novoIdPosicao,
}: PropsCarteira) {
  const [editando, setEditando] = useState<string | null>(null);
  const emEdicao = posicoes.find((p) => p.id === editando) ?? null;
  const cheia = posicoes.length >= LIMITE_POSICOES;
  const dataHoje = hoje();
  // Derivado na renderização: posições, cenário (com o histórico) e o dia; nada de efeito que atrase o resultado.
  const resumo = useMemo(() => resumirCarteira(posicoes, dataHoje, cenario), [posicoes, dataHoje, cenario]);

  const secao = useRef<HTMLElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  /** Para onde o foco vai depois de remover ou salvar; o efeito aplica depois que a lista nova aparece. */
  const [foco, setFoco] = useState<{ cartao: number; reserva: 'lista' | 'formulario' } | null>(null);

  useEffect(() => {
    if (!foco) return;
    const cartao = secao.current?.querySelector<HTMLElement>(`#${idTituloPosicao(foco.cartao)}`);
    const reserva = foco.reserva === 'lista' ? titulo.current : secao.current?.querySelector<HTMLElement>(`#${ID_FORM_POSICAO}-titulo`);
    (cartao ?? reserva)?.focus();
  }, [foco]);

  function salvar(p: Posicao) {
    const indice = posicoes.findIndex((x) => x.id === p.id);
    onChange(indice >= 0 ? posicoes.map((x) => (x.id === p.id ? p : x)) : [...posicoes, p]);
    if (indice >= 0) setFoco({ cartao: indice, reserva: 'formulario' });
    setEditando(null);
  }

  function remover(id: string) {
    const indice = posicoes.findIndex((p) => p.id === id);
    const restantes = posicoes.filter((p) => p.id !== id);
    onChange(restantes);
    setFoco({ cartao: indice < restantes.length ? indice : -1, reserva: 'lista' });
    if (editando === id) setEditando(null);
  }

  const idTotal = `${PREFIXO}-total-titulo`;
  const fora = resumo.naoCalculadas.length;
  return (
    <section class="carteira" aria-labelledby={`${PREFIXO}-titulo`} ref={secao}>
      <h2 id={`${PREFIXO}-titulo`} ref={titulo} tabIndex={-1}>Carteira</h2>
      {/* Contêiner vivo permanente: só o texto muda, e o leitor de tela anuncia. */}
      <p role="status" class="dica">{posicoes.length === 0 ? '' : textoDoHistorico(historico, { lacunas, invalido: historicoInvalido })}</p>
      {posicoes.length === 0 ? (
        <p class="dica">{SEM_POSICOES}</p>
      ) : (
        <>
          <ListaPosicoes linhas={resumo.linhas} onEditar={setEditando} onRemover={remover} />
          <section class="carteira__total" aria-labelledby={idTotal}>
            <h3 id={idTotal}>Total da carteira</h3>
            <p class="posicao__valor">{formatarMoeda(resumo.total.bruto)} bruto, {formatarMoeda(resumo.total.liquido)} líquido</p>
            {fora > 0 && (
              <p class="aviso">{fora === 1 ? '1 posição ficou de fora' : `${fora} posições ficaram de fora`}, porque não deu para calcular.</p>
            )}
          </section>
          <ExposicaoFGC fgc={resumo.fgc} naoCalculadas={resumo.naoCalculadas} hoje={dataHoje} />
        </>
      )}
      {cheia && !emEdicao ? (
        <p class="dica">Limite de {LIMITE_POSICOES} posições: remova uma para cadastrar outra.</p>
      ) : (
        <FormPosicao key={emEdicao?.id ?? 'nova'} inicial={emEdicao} conglomerados={conglomerados} gerarId={gerarId}
          onSalvar={salvar} onCancelar={() => setEditando(null)} />
      )}
      {posicoes.length > 0 && <p class="dica">{DICA_EXPORTAR}</p>}
    </section>
  );
}

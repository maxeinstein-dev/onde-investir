import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { LIMITE_POSICOES, novoIdPosicao } from '../../armazenamento/posicoes';
import { DICA_EXPORTAR, POSICAO_ADICIONADA, SEM_POSICOES, textoDoHistorico } from '../../conteudo/carteira';
import type { Cenario } from '../../engine/indexadores';
import type { Posicao } from '../../engine/posicoes';
import { formatarMoeda } from '../../formato';
import { Destaque } from '../base/Destaque';
import { hoje } from '../hoje';
import type { EstadoHistorico } from '../useHistorico';
import { ExposicaoFGC } from './ExposicaoFGC';
import { FormPosicao, ID_FORM_POSICAO } from './FormPosicao';
import { idTituloPosicao, ListaPosicoes } from './ListaPosicoes';
import { resumirCarteira } from './resumo';
import './carteira.css';

export interface PropsCarteira {
  posicoes: readonly Posicao[];
  /** A lista nova (cadastro, edição ou remoção). Quem chama persiste. */
  onChange: (posicoes: Posicao[]) => void;
  /** O cenário ativo com o histórico realizado (`cenarioComHistorico`), ou só o cenário enquanto ele não chega. */
  cenario: Cenario;
  historico: EstadoHistorico;
  /** Busca o histórico de novo; o botão aparece quando a busca falhou. */
  onTentarDeNovo?: () => void;
  /** Dias úteis sem CDI no histórico (a UI avisa "histórico incompleto"). */
  lacunas: number;
  /** O histórico veio com dado fora da faixa e foi deixado de lado. */
  historicoInvalido: boolean;
  /** Conglomerados já usados (ofertas e posições), sugeridos no campo. */
  conglomerados: readonly string[];
  gerarId?: () => string;
}

const PREFIXO = 'carteira';
/** Tempo com a confirmação vazia antes de reescrever a mesma mensagem, para o leitor de tela anunciar de novo. */
const ESPERA_REPETIR_MS = 100;

/** A aba Carteira: as posições que a pessoa já tem, quanto valem hoje e quanto está coberto pelo FGC (spec §5.3). */
export function Carteira({
  posicoes, onChange, cenario, historico, onTentarDeNovo, lacunas, historicoInvalido, conglomerados, gerarId = novoIdPosicao,
}: PropsCarteira) {
  const falhou = historico.fase === 'pronto' && historico.carregado.status === 'FALHOU';
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

  /** A confirmação do cadastro, num contêiner vivo permanente: só o texto muda, e o leitor de tela anuncia. */
  const [confirmacao, setConfirmacao] = useState('');
  const repetir = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(repetir.current), []);

  function confirmar(texto: string) {
    clearTimeout(repetir.current);
    if (texto === '' || texto !== confirmacao) {
      setConfirmacao(texto);
      return;
    }
    // A mesma mensagem de novo (outro cadastro): limpa e reescreve, senão o contêiner vivo não muda.
    setConfirmacao('');
    repetir.current = setTimeout(() => setConfirmacao(texto), ESPERA_REPETIR_MS);
  }

  function salvar(p: Posicao) {
    const indice = posicoes.findIndex((x) => x.id === p.id);
    onChange(indice >= 0 ? posicoes.map((x) => (x.id === p.id ? p : x)) : [...posicoes, p]);
    if (indice >= 0) {
      setFoco({ cartao: indice, reserva: 'formulario' });
      confirmar('');
    } else {
      // A posição nova entra no fim da lista: o foco vai para o cartão dela.
      setFoco({ cartao: posicoes.length, reserva: 'formulario' });
      confirmar(POSICAO_ADICIONADA);
    }
    setEditando(null);
  }

  function remover(id: string) {
    const indice = posicoes.findIndex((p) => p.id === id);
    const restantes = posicoes.filter((p) => p.id !== id);
    onChange(restantes);
    setFoco({ cartao: indice < restantes.length ? indice : -1, reserva: 'lista' });
    // A confirmação do último cadastro deixa de valer.
    confirmar('');
    if (editando === id) setEditando(null);
  }

  const idTotal = `${PREFIXO}-total-titulo`;
  const fora = resumo.naoCalculadas.length;
  return (
    <section class="carteira" aria-labelledby={`${PREFIXO}-titulo`} ref={secao}>
      <h2 id={`${PREFIXO}-titulo`} ref={titulo} tabIndex={-1}>Carteira</h2>
      {/* Contêiner vivo permanente: só o texto muda, e o leitor de tela anuncia. */}
      <p role="status" class="dica">{posicoes.length === 0 ? '' : textoDoHistorico(historico, { lacunas, invalido: historicoInvalido })}</p>
      {posicoes.length > 0 && falhou && onTentarDeNovo && <button type="button" onClick={onTentarDeNovo}>Tentar de novo</button>}
      {posicoes.length === 0 ? (
        <p class="dica">{SEM_POSICOES}</p>
      ) : (
        <>
          <ListaPosicoes linhas={resumo.linhas} onEditar={setEditando} onRemover={remover} />
          <section class="carteira__total" aria-labelledby={idTotal}>
            <h3 id={idTotal}>Total da carteira</h3>
            <Destaque rotulo="Total líquido" valor={formatarMoeda(resumo.total.liquido)} frase={`Bruto: ${formatarMoeda(resumo.total.bruto)}`} />
            {/* A frase completa para o leitor de tela e para quem procura o texto; o destaque mostra os mesmos números. */}
            <p class="visualmente-oculto">{formatarMoeda(resumo.total.bruto)} bruto, {formatarMoeda(resumo.total.liquido)} líquido</p>
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
      <p role="status" class="dica carteira__confirmacao">{confirmacao}</p>
      {posicoes.length > 0 && <p class="dica">{DICA_EXPORTAR}</p>}
    </section>
  );
}

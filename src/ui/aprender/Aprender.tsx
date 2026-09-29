import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Progresso } from '../../armazenamento/progresso';
import { CASOS_CLASSICOS } from '../../conteudo/casos';
import { GLOSSARIO } from '../../conteudo/glossario';
import type { CasoClassico, IdLicao, Licao } from '../../conteudo/licoes/tipos';
import './aprender.css';
import { MarkdownRestrito } from '../MarkdownRestrito';
import { Termo } from '../Termo';
import { hashDaLicao } from './LinkLicao';
import { type EstadoConteudoAprender, useConteudoAprender } from './useConteudoAprender';

export { ABA_APRENDER } from './LinkLicao';

const PREFIXO = 'aprender';
export const ID_TITULO_APRENDER = `${PREFIXO}-titulo`;
const ID_TITULO_LICAO = `${PREFIXO}-licao-titulo`;
const idLinkDaLicao = (id: IdLicao) => `${PREFIXO}-link-${id}`;

const LINK_MD = /\[([^\]]+)\]\(([^)\s]+)\)/g;

const TEXTO_CARREGANDO = 'Carregando conteúdo…';
const TEXTO_ERRO = 'Não deu para carregar o conteúdo da trilha Aprender.';
const TEXTO_TENTAR_DE_NOVO = 'Tentar de novo';

/** O nome de cada fonte: o rótulo do primeiro link para ela no texto da lição; sem link, o domínio. */
function rotulosDasFontes(l: Licao): Map<string, string> {
  const rotulos = new Map<string, string>();
  for (const s of l.secoes) {
    for (const [, rotulo, url] of s.texto.matchAll(LINK_MD)) {
      if (rotulo !== undefined && url !== undefined && !rotulos.has(url)) rotulos.set(url, rotulo);
    }
  }
  for (const f of l.fontes) if (!rotulos.has(f)) rotulos.set(f, new URL(f).hostname.replace(/^www\./, ''));
  return rotulos;
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

export interface PropsAprender {
  /** A lição aberta; null = o índice. */
  licao: IdLicao | null;
  /** Abrir uma lição (ou voltar ao índice, com null). Quem chama guarda e põe no hash. */
  onAbrir: (id: IdLicao | null) => void;
  progresso: Progresso;
  onConcluir: (id: IdLicao, concluida: boolean) => void;
  /** "Experimente": abre a comparação temporária montada para a lição. */
  onExperimente: (licao: Licao) => void;
  onCaso: (caso: CasoClassico) => void;
}

/** O título e o aviso de carregando/erro enquanto o chunk das lições não chega (ver useConteudoAprender). */
function AvisoConteudo(
  { estado, idTitulo, tituloCarregando, onTentarDeNovo }:
  { estado: EstadoConteudoAprender; idTitulo: string; tituloCarregando: string; onTentarDeNovo: () => void },
) {
  if (estado === 'pronto') return null; // não deveria acontecer: quem chama já filtra por `estado !== 'pronto'`
  return (
    <>
      <h2 id={idTitulo} tabIndex={-1}>{tituloCarregando}</h2>
      {estado === 'carregando'
        ? <p role="status">{TEXTO_CARREGANDO}</p>
        : (
          <div class="aprender__erro">
            <p role="alert" class="erro">{TEXTO_ERRO}</p>
            <button type="button" onClick={onTentarDeNovo}>{TEXTO_TENTAR_DE_NOVO}</button>
          </div>
        )}
    </>
  );
}

/** A trilha "Aprender" (spec §6): o índice das lições e dos casos clássicos, ou a lição aberta. As 10 lições
 * (seções e fontes completas) chegam sob demanda, num chunk à parte (useConteudoAprender). */
export function Aprender({ licao: idLicao, onAbrir, progresso, onConcluir, onExperimente, onCaso }: PropsAprender) {
  const { estado, conteudo, tentarDeNovo } = useConteudoAprender();
  const licao = idLicao === null || conteudo === null ? undefined : conteudo.licaoPorId(idLicao);
  /** O anúncio vale para a lição em que apareceu (invalidação derivada). */
  const [anuncio, setAnuncio] = useState<{ texto: string; licao: IdLicao } | null>(null);
  const anterior = useRef(idLicao);

  // Trocou de lição: o foco vai para o título da nova; de volta ao índice, para o link da lição de onde veio. Só
  // depois do conteúdo pronto (senão o título/link ainda não estão no DOM).
  useEffect(() => {
    if (estado !== 'pronto') return;
    const veio = anterior.current;
    anterior.current = idLicao;
    if (veio === idLicao) return;
    if (idLicao !== null) document.getElementById(ID_TITULO_LICAO)?.focus();
    else if (veio !== null) document.getElementById(idLinkDaLicao(veio))?.focus();
  }, [idLicao, estado]);

  function concluir(l: Licao, concluida: boolean) {
    onConcluir(l.id, concluida);
    setAnuncio({ texto: concluida ? 'Lição marcada como concluída.' : 'Lição desmarcada.', licao: l.id });
  }

  const status = anuncio !== null && anuncio.licao === idLicao ? anuncio.texto : '';

  return (
    <section class="aprender" aria-labelledby={idLicao !== null ? ID_TITULO_LICAO : ID_TITULO_APRENDER}>
      {estado !== 'pronto' || conteudo === null
        ? (
          <AvisoConteudo estado={estado} idTitulo={idLicao !== null ? ID_TITULO_LICAO : ID_TITULO_APRENDER}
            tituloCarregando={idLicao !== null ? 'Carregando lição…' : 'Aprender'} onTentarDeNovo={tentarDeNovo} />
        )
        : licao
          ? <PaginaLicao licao={licao} licoes={conteudo.LICOES} concluida={progresso.concluidas.includes(licao.id)} onAbrir={onAbrir}
            onConcluir={(c) => concluir(licao, c)} onExperimente={() => onExperimente(licao)} />
          : <Indice licoes={conteudo.LICOES} progresso={progresso} onAbrir={onAbrir} onCaso={onCaso} />}
      <p role="status" class="visualmente-oculto">{status}</p>
      <p class="aviso">Conteúdo educativo: não é recomendação de investimento.</p>
    </section>
  );
}

interface PropsLink {
  /** A lição; null = o índice. */
  para: IdLicao | null;
  onAbrir: (id: IdLicao | null) => void;
  children: ComponentChildren;
  class?: string;
  id?: string;
}

/** Um link para uma lição: com o hash de verdade (abre em outra aba) e, no clique, a troca sem recarregar. */
function LinkParaLicao({ para, onAbrir, children, class: classe, id }: PropsLink) {
  return (
    <a href={hashDaLicao(para)} class={classe} id={id} onClick={(e) => { e.preventDefault(); onAbrir(para); }}>
      {children}
    </a>
  );
}

interface PropsIndice extends Pick<PropsAprender, 'progresso' | 'onAbrir' | 'onCaso'> {
  licoes: readonly Licao[];
}

function Indice({ licoes, progresso, onAbrir, onCaso }: PropsIndice) {
  const n = progresso.concluidas.length;
  const { acertos, total } = progresso.palpites;
  const atualId = licoes.find((l) => !progresso.concluidas.includes(l.id))?.id;
  return (
    <>
      <h2 id={ID_TITULO_APRENDER} tabIndex={-1}>Aprender</h2>
      <p>Lições curtas sobre renda fixa. Cada uma termina com uma comparação pronta para você ver a regra em ação.</p>
      <div class="aprender__progresso">
        <label for={`${PREFIXO}-progresso`}>{n} de {licoes.length} lições</label>
        <progress id={`${PREFIXO}-progresso`} value={n} max={licoes.length} />
        {total > 0 && <p>Você acertou {acertos} de {total} {plural(total, 'palpite', 'palpites')}.</p>}
      </div>
      <ol class="trilha" aria-label="Lições">
        {licoes.map((l) => {
          const feita = progresso.concluidas.includes(l.id);
          const atual = !feita && l.id === atualId;
          return (
            <li key={l.id} class={`trilha__item apr-cartao${feita ? ' apr-cartao--feita' : ''}${atual ? ' apr-cartao--atual' : ''}`}>
              <LinkParaLicao para={l.id} id={idLinkDaLicao(l.id)} onAbrir={onAbrir} class="trilha__link">
                {l.ordem}. {l.titulo}
                {feita && <><span aria-hidden="true"> ✓</span><span class="visualmente-oculto"> (concluída)</span></>}
                {atual && <><span aria-hidden="true"> ▸</span><span class="visualmente-oculto"> (próxima a estudar)</span></>}
              </LinkParaLicao>
              <p>{l.resumo}</p>
              <p class="dica">{l.tempoLeituraMin} min de leitura</p>
            </li>
          );
        })}
      </ol>
      <section class="casos" aria-labelledby={`${PREFIXO}-casos-titulo`}>
        <h3 id={`${PREFIXO}-casos-titulo`}>Casos clássicos</h3>
        <p class="dica">Comparações prontas para perguntas que todo mundo faz.</p>
        <ul class="casos__lista" role="list">
          {CASOS_CLASSICOS.map((c) => (
            <li key={c.id} class="caso">
              <h4>{c.titulo}</h4>
              <p>{c.pergunta}</p>
              <details>
                <summary>Entenda o caso</summary>
                <MarkdownRestrito texto={c.explicacao} />
              </details>
              <button type="button" onClick={() => onCaso(c)}>
                Experimente<span class="visualmente-oculto">: {c.titulo}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

interface PropsPagina {
  licao: Licao;
  licoes: readonly Licao[];
  concluida: boolean;
  onAbrir: (id: IdLicao | null) => void;
  onConcluir: (concluida: boolean) => void;
  onExperimente: () => void;
}

function PaginaLicao({ licao, licoes, concluida, onAbrir, onConcluir, onExperimente }: PropsPagina) {
  const proxima = licoes.find((l) => l.ordem === licao.ordem + 1);
  const rotulos = rotulosDasFontes(licao);
  return (
    <article class="licao">
      <LinkParaLicao para={null} onAbrir={onAbrir} class="link">Voltar ao índice</LinkParaLicao>
      <p class="dica">
        Lição {licao.ordem} de {licoes.length} · {licao.tempoLeituraMin} min de leitura{concluida ? ' · ✓ concluída' : ''}
      </p>
      <h2 id={ID_TITULO_LICAO} tabIndex={-1}>{licao.titulo}</h2>
      <p class="licao__resumo">{licao.resumo}</p>
      {licao.secoes.map((s) => (
        <section key={s.titulo} class="licao__secao">
          <h3>{s.titulo}</h3>
          <MarkdownRestrito texto={s.texto} />
        </section>
      ))}
      {licao.experimente && (
        <div class="licao__experimente">
          <p>Veja na prática: a comparação desta lição abre na aba Comparar, sem mexer na sua.</p>
          <button type="button" class="primario" onClick={onExperimente}>Experimente</button>
        </div>
      )}
      <div class="licao__acoes">
        <button type="button" onClick={() => onConcluir(!concluida)}>
          {concluida ? 'Desmarcar como concluída' : 'Marcar como concluída'}
        </button>
        {proxima && (
          <LinkParaLicao para={proxima.id} onAbrir={onAbrir} class="licao__proxima">Próxima lição: {proxima.titulo}</LinkParaLicao>
        )}
      </div>
      <section class="licao__termos" aria-labelledby={`${PREFIXO}-termos-titulo`}>
        <h3 id={`${PREFIXO}-termos-titulo`}>Termos desta lição</h3>
        <ul role="list">
          {licao.termos.map((t) => <li key={t}><Termo id={t}>{GLOSSARIO[t].termo}</Termo></li>)}
        </ul>
      </section>
      <section class="licao__fontes" aria-labelledby={`${PREFIXO}-fontes-titulo`}>
        <h3 id={`${PREFIXO}-fontes-titulo`}>Fontes</h3>
        <ul>
          {licao.fontes.map((f) => (
            <li key={f}><a href={f} target="_blank" rel="noopener noreferrer">{rotulos.get(f)}</a></li>
          ))}
        </ul>
      </section>
    </article>
  );
}

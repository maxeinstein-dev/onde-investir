import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Progresso } from '../../armazenamento/progresso';
import { CASOS_CLASSICOS } from '../../conteudo/casos';
import { GLOSSARIO } from '../../conteudo/glossario';
import { LICOES, licaoPorId } from '../../conteudo/licoes';
import type { CasoClassico, IdLicao, Licao } from '../../conteudo/licoes/tipos';
import { MarkdownRestrito } from '../MarkdownRestrito';
import { Termo } from '../Termo';
import { hashDaLicao } from './LinkLicao';

export { ABA_APRENDER } from './LinkLicao';

const PREFIXO = 'aprender';
export const ID_TITULO_APRENDER = `${PREFIXO}-titulo`;
const ID_TITULO_LICAO = `${PREFIXO}-licao-titulo`;
const idLinkDaLicao = (id: IdLicao) => `${PREFIXO}-link-${id}`;

const LINK_MD = /\[([^\]]+)\]\(([^)\s]+)\)/g;

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

/** A trilha "Aprender" (spec §6): o índice das lições e dos casos clássicos, ou a lição aberta. */
export function Aprender({ licao: idLicao, onAbrir, progresso, onConcluir, onExperimente, onCaso }: PropsAprender) {
  const licao = idLicao === null ? undefined : licaoPorId(idLicao);
  /** O anúncio vale para a lição em que apareceu (invalidação derivada). */
  const [anuncio, setAnuncio] = useState<{ texto: string; licao: IdLicao } | null>(null);
  const anterior = useRef(idLicao);

  // Trocou de lição: o foco vai para o título da nova; de volta ao índice, para o link da lição de onde veio.
  useEffect(() => {
    const veio = anterior.current;
    anterior.current = idLicao;
    if (veio === idLicao) return;
    if (idLicao !== null) document.getElementById(ID_TITULO_LICAO)?.focus();
    else if (veio !== null) document.getElementById(idLinkDaLicao(veio))?.focus();
  }, [idLicao]);

  function concluir(l: Licao, concluida: boolean) {
    onConcluir(l.id, concluida);
    setAnuncio({ texto: concluida ? 'Lição marcada como concluída.' : 'Lição desmarcada.', licao: l.id });
  }

  const status = anuncio !== null && anuncio.licao === idLicao ? anuncio.texto : '';

  return (
    <section class="aprender" aria-labelledby={licao ? ID_TITULO_LICAO : ID_TITULO_APRENDER}>
      {licao
        ? <PaginaLicao licao={licao} concluida={progresso.concluidas.includes(licao.id)} onAbrir={onAbrir}
          onConcluir={(c) => concluir(licao, c)} onExperimente={() => onExperimente(licao)} />
        : <Indice progresso={progresso} onAbrir={onAbrir} onCaso={onCaso} />}
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

function Indice({ progresso, onAbrir, onCaso }: Pick<PropsAprender, 'progresso' | 'onAbrir' | 'onCaso'>) {
  const n = progresso.concluidas.length;
  const { acertos, total } = progresso.palpites;
  return (
    <>
      <h2 id={ID_TITULO_APRENDER} tabIndex={-1}>Aprender</h2>
      <p>Lições curtas sobre renda fixa. Cada uma termina com uma comparação pronta para você ver a regra em ação.</p>
      <div class="aprender__progresso">
        <label for={`${PREFIXO}-progresso`}>{n} de {LICOES.length} lições</label>
        <progress id={`${PREFIXO}-progresso`} value={n} max={LICOES.length} />
        {total > 0 && <p>Você acertou {acertos} de {total} {plural(total, 'palpite', 'palpites')}.</p>}
      </div>
      <ol class="trilha" aria-label="Lições">
        {LICOES.map((l) => {
          const feita = progresso.concluidas.includes(l.id);
          return (
            <li key={l.id} class="trilha__item">
              <LinkParaLicao para={l.id} id={idLinkDaLicao(l.id)} onAbrir={onAbrir} class="trilha__link">
                {l.ordem}. {l.titulo}
                {feita && <><span aria-hidden="true"> ✓</span><span class="visualmente-oculto"> (concluída)</span></>}
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
  concluida: boolean;
  onAbrir: (id: IdLicao | null) => void;
  onConcluir: (concluida: boolean) => void;
  onExperimente: () => void;
}

function PaginaLicao({ licao, concluida, onAbrir, onConcluir, onExperimente }: PropsPagina) {
  const proxima = LICOES.find((l) => l.ordem === licao.ordem + 1);
  const rotulos = rotulosDasFontes(licao);
  return (
    <article class="licao">
      <LinkParaLicao para={null} onAbrir={onAbrir} class="link">Voltar ao índice</LinkParaLicao>
      <p class="dica">
        Lição {licao.ordem} de {LICOES.length} · {licao.tempoLeituraMin} min de leitura{concluida ? ' · ✓ concluída' : ''}
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
      <div class="licao__acoes">
        <button type="button" onClick={() => onConcluir(!concluida)}>
          {concluida ? 'Desmarcar como concluída' : 'Marcar como concluída'}
        </button>
        {proxima && (
          <LinkParaLicao para={proxima.id} onAbrir={onAbrir} class="licao__proxima">Próxima lição: {proxima.titulo}</LinkParaLicao>
        )}
      </div>
    </article>
  );
}

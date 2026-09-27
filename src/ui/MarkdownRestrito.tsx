import type { ComponentChildren } from 'preact';

// Só **negrito**, *itálico*, [texto](https://…) e listas "- ". Todo o resto é texto:
// o Preact escapa strings, então HTML nunca é interpretado.
const TOKEN = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function renderizarInline(texto: string): ComponentChildren[] {
  const saida: ComponentChildren[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(TOKEN)) {
    const inicio = m.index ?? 0;
    if (inicio > ultimo) saida.push(texto.slice(ultimo, inicio));
    const [, negrito, italico, rotulo, url] = m;
    if (negrito !== undefined) saida.push(<strong>{negrito}</strong>);
    else if (italico !== undefined) saida.push(<em>{italico}</em>);
    else if (rotulo !== undefined && url !== undefined) {
      saida.push(url.startsWith('https://') ? <a href={url} target="_blank" rel="noopener noreferrer">{rotulo}</a> : rotulo);
    }
    ultimo = inicio + m[0].length;
  }
  if (ultimo < texto.length) saida.push(texto.slice(ultimo));
  return saida;
}

export function MarkdownRestrito({ texto, inline = false }: { texto: string; inline?: boolean }) {
  if (inline) return <>{renderizarInline(texto)}</>;
  const blocos = texto.split(/\n\s*\n/);
  return (
    <>
      {blocos.map((bloco) => {
        const linhas = bloco.split('\n');
        if (linhas.every((l) => l.startsWith('- '))) {
          return <ul>{linhas.map((l) => <li>{renderizarInline(l.slice(2))}</li>)}</ul>;
        }
        return <p>{renderizarInline(bloco)}</p>;
      })}
    </>
  );
}

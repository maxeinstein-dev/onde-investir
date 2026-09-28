// Serve dist/ com os cabeçalhos de public/_headers (a CSP de produção), para conferir a CSP no navegador.
// Uso: npm run build && node scripts/servir-dist.mjs [porta]   (padrão: 4173)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * O arquivo de `raiz` pedido na URL (`/` é o index.html), ou o status de erro: 400 para URL malformada e 403
 * para o que sai de `raiz`. A checagem é pelo caminho relativo, e não por prefixo: `dist-secreto` começa com
 * `dist`, mas fica fora dele.
 */
export function resolverArquivo(raiz, url) {
  let caminho;
  try {
    caminho = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  } catch {
    return { status: 400 };
  }
  const arquivo = join(raiz, caminho === '/' ? 'index.html' : caminho);
  const rel = relative(raiz, arquivo);
  if (rel.startsWith('..') || isAbsolute(rel)) return { status: 403 };
  return { arquivo };
}

/** Os cabeçalhos do bloco "/*" do _headers (formato do Cloudflare Pages). */
async function lerCabecalhos() {
  const texto = await readFile(resolve('public/_headers'), 'utf-8');
  const cabecalhos = {};
  let noBloco = false;
  for (const linha of texto.split(/\r?\n/)) {
    if (linha.trim() === '') continue;
    if (!/^\s/.test(linha)) { noBloco = linha.trim() === '/*'; continue; }
    const [nome, ...valor] = linha.trim().split(':');
    if (noBloco && nome) cabecalhos[nome.trim()] = valor.join(':').trim();
  }
  return cabecalhos;
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

async function servir(porta) {
  const raiz = resolve('dist');
  const cabecalhos = await lerCabecalhos();
  createServer(async (req, res) => {
    // Nada aqui derruba o processo: URL malformada é 400 e qualquer falha de leitura é 500.
    try {
      const resolvido = resolverArquivo(raiz, req.url ?? '/');
      if (!('arquivo' in resolvido)) { res.writeHead(resolvido.status).end(); return; }
      let arquivo = resolvido.arquivo;
      let corpo;
      try {
        corpo = await readFile(arquivo);
      } catch {
        arquivo = join(raiz, 'index.html');
        corpo = await readFile(arquivo);
      }
      res.writeHead(200, { ...cabecalhos, 'Content-Type': TIPOS[extname(arquivo)] ?? 'application/octet-stream' });
      res.end(corpo);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  }).listen(porta, '127.0.0.1', () => console.log(`dist/ em http://127.0.0.1:${porta} com os cabeçalhos de public/_headers`));
}

// Importado (pelos testes), só exporta; rodado com node, sobe o servidor.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await servir(Number(process.argv[2] ?? 4173));
}

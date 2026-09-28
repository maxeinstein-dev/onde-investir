// Serve dist/ com os cabeçalhos de public/_headers (a CSP de produção), para conferir a CSP no navegador.
// Uso: npm run build && node scripts/servir-dist.mjs [porta]   (padrão: 4173)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const raiz = resolve('dist');
const porta = Number(process.argv[2] ?? 4173);

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

const cabecalhos = await lerCabecalhos();

createServer(async (req, res) => {
  const caminho = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  let arquivo = normalize(join(raiz, caminho === '/' ? 'index.html' : caminho));
  if (!arquivo.startsWith(raiz)) { res.writeHead(403).end(); return; }
  let corpo;
  try {
    corpo = await readFile(arquivo);
  } catch {
    arquivo = join(raiz, 'index.html');
    corpo = await readFile(arquivo);
  }
  res.writeHead(200, { ...cabecalhos, 'Content-Type': TIPOS[extname(arquivo)] ?? 'application/octet-stream' });
  res.end(corpo);
}).listen(porta, '127.0.0.1', () => console.log(`dist/ em http://127.0.0.1:${porta} com os cabeçalhos de public/_headers`));

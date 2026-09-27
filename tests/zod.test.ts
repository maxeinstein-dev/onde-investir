// O zod testa `new Function("")` ao criar esquemas de objeto; com a CSP sem 'unsafe-eval', o navegador
// registra a violação mesmo com o erro engolido. O `jitless` desliga esse teste e o JIT.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from '../src/zod';

const SRC = join(__dirname, '..', 'src');

function arquivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const caminho = join(dir, e.name);
    if (e.isDirectory()) return arquivos(caminho);
    return /\.(ts|tsx)$/.test(e.name) ? [caminho] : [];
  });
}

describe('zod sem JIT', () => {
  it('src/zod.ts liga o jitless', () => {
    expect(z.config().jitless).toBe(true);
  });

  it("nenhum arquivo de src/ (fora src/zod.ts) importa 'zod' direto", () => {
    const diretos = arquivos(SRC)
      .filter((f) => relative(SRC, f) !== 'zod.ts')
      .filter((f) => /from\s+['"]zod(\/[^'"]*)?['"]|import\s*\(\s*['"]zod|require\(\s*['"]zod/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f).split(sep).join('/'));
    expect(diretos).toEqual([]);
  });

  it('src/main.tsx importa ./zod antes de tudo', () => {
    const primeiro = readFileSync(join(SRC, 'main.tsx'), 'utf8').split('\n').find((l) => l.startsWith('import'));
    expect(primeiro).toBe("import './zod';");
  });
});

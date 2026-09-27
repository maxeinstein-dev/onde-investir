import { describe, expect, it } from 'vitest';
import { GLOSSARIO } from '../../src/conteudo/glossario';

describe('glossário', () => {
  it('todo termo tem texto curto e fonte https', () => {
    for (const [id, t] of Object.entries(GLOSSARIO)) {
      expect(t.curto.length, id).toBeGreaterThan(20);
      expect(t.fonte, id).toMatch(/^https:\/\//);
    }
  });
  it('marcação a mercado, com fonte do Tesouro Direto', () => {
    const t = GLOSSARIO['marcacao-mercado'];
    expect(t.termo).toBe('Marcação a mercado');
    expect(t.curto).toMatch(/vencimento/);
    expect(t.fonte).toBe('https://www.tesourodireto.com.br/');
  });
});

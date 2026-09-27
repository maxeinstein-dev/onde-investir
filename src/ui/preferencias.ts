const CHAVE_PALPITES = 'rende:palpites';

export function lerPalpitesLigados(): boolean {
  try {
    return localStorage.getItem(CHAVE_PALPITES) !== 'desligados';
  } catch {
    return true;
  }
}

export function salvarPalpitesLigados(ligados: boolean): void {
  try {
    localStorage.setItem(CHAVE_PALPITES, ligados ? 'ligados' : 'desligados');
  } catch {
    // Sem storage (aba anônima, bloqueio): a preferência vale só nesta visita.
  }
}

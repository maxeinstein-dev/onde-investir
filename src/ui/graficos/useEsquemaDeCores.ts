// O canvas do Chart.js não herda CSS: as cores são lidas na criação (lerPaleta). Quando o tema do sistema muda,
// este valor muda, entra nas deps do efeito de desenho, e o gráfico é recriado com a paleta nova.
import { useEffect, useState } from 'preact/hooks';

export type EsquemaDeCores = 'claro' | 'escuro';
const CONSULTA = '(prefers-color-scheme: dark)';

function atual(): EsquemaDeCores {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(CONSULTA).matches ? 'escuro' : 'claro';
}

export function useEsquemaDeCores(): EsquemaDeCores {
  const [esquema, setEsquema] = useState<EsquemaDeCores>(atual);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(CONSULTA);
    const aoMudar = () => setEsquema(atual());
    // Safari anterior ao 14 só tem addListener/removeListener.
    if (typeof mql.addEventListener !== 'function') {
      mql.addListener(aoMudar);
      return () => mql.removeListener(aoMudar);
    }
    mql.addEventListener('change', aoMudar);
    return () => mql.removeEventListener('change', aoMudar);
  }, []);
  return esquema;
}

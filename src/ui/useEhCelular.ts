// O mesmo corte do @media do CSS (max-width: 639px). Sem matchMedia (jsdom, SSR): layout de desktop.
import { useEffect, useState } from 'preact/hooks';

const CONSULTA = '(max-width: 639px)';
const atual = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(CONSULTA).matches;

export function useEhCelular(): boolean {
  const [celular, setCelular] = useState(atual);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(CONSULTA);
    const aoMudar = () => setCelular(atual());
    mql.addEventListener('change', aoMudar);
    return () => mql.removeEventListener('change', aoMudar);
  }, []);
  return celular;
}

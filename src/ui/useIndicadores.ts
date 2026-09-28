import { useEffect, useState } from 'preact/hooks';
import { armazenamentoLocal } from '../armazenamento/navegador';
import { carregarIndicadores, type IndicadoresCarregados } from '../dados/indicadores';

/** Resultado de uma carga que falhou por inteiro (não deveria acontecer: `carregarIndicadores` nunca lança). */
export const SEM_INDICADORES: IndicadoresCarregados = {
  atuais: null, focus: null, reunioes: null,
  status: { sgs: 'FALHOU', focus: 'FALHOU', copom: 'FALHOU' },
  obtidoEm: {}, focusDefasado: false,
};

const carregarDoNavegador = (): Promise<IndicadoresCarregados> => carregarIndicadores({
  // Busca `fetch` na hora da chamada: os testes trocam por um falso com vi.stubGlobal.
  buscar: (url, init) => fetch(url, init),
  armazenamento: armazenamentoLocal(),
  agoraMs: Date.now(),
});

/** Carrega os indicadores uma vez, ao montar. null enquanto carrega. */
export function useIndicadores(carregar: () => Promise<IndicadoresCarregados> = carregarDoNavegador): IndicadoresCarregados | null {
  const [indicadores, setIndicadores] = useState<IndicadoresCarregados | null>(null);
  useEffect(() => {
    let montado = true;
    carregar()
      .catch(() => SEM_INDICADORES)
      .then((r) => { if (montado) setIndicadores(r); });
    return () => { montado = false; };
    // Uma vez só, ao montar.
  }, []);
  return indicadores;
}

import { useEffect, useState } from 'preact/hooks';

type ModuloLicoes = typeof import('../../conteudo/licoes');
export type EstadoConteudoAprender = 'carregando' | 'pronto' | 'erro';

// As 10 lições (seções e fontes completas, a maior parte do bundle) ficam num chunk à parte, carregado só quando a
// trilha "Aprender" é aberta pela primeira vez (mesmo padrão do Chart.js em useGrafico.ts). Dicas, "Você sabia?" e
// os títulos das lições (titulos.ts) continuam no bundle principal: são pequenos e usados fora da trilha.
let modulo: ModuloLicoes | null = null;
let carregando: Promise<ModuloLicoes> | null = null;

/** O import do chunk, num objeto para os testes simularem a rede caindo e voltando. */
export const importador = { licoes: (): Promise<ModuloLicoes> => import('../../conteudo/licoes') };

function carregarConteudo(): Promise<ModuloLicoes> {
  carregando ??= importador.licoes().then(
    (m) => { modulo = m; return m; },
    (e: unknown) => { carregando = null; throw e; }, // uma falha não fica guardada: a próxima tentativa tenta de novo
  );
  return carregando;
}

export interface ConteudoAprender { estado: EstadoConteudoAprender; conteudo: ModuloLicoes | null; tentarDeNovo: () => void }

/**
 * Carrega o módulo das lições sob demanda. Devolve o estado do carregamento, para a trilha mostrar o aviso certo,
 * e `tentarDeNovo`, para o botão do aviso de falha.
 */
export function useConteudoAprender(): ConteudoAprender {
  const [conteudo, setConteudo] = useState<ModuloLicoes | null>(modulo);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    if (conteudo) return;
    let vivo = true;
    setErro(false);
    carregarConteudo().then((m) => { if (vivo) setConteudo(m); }, () => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [conteudo, tentativa]);
  const estado: EstadoConteudoAprender = erro ? 'erro' : conteudo ? 'pronto' : 'carregando';
  return { estado, conteudo, tentarDeNovo: () => setTentativa((t) => t + 1) };
}

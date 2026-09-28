import { useEffect, useRef, useState } from 'preact/hooks';
import { exportarDados, importarDados, LIMITE_CARACTERES_IMPORTACAO } from '../../armazenamento/arquivo';
import { LIMITE_OFERTAS } from '../../armazenamento/ofertas';
import { LIMITE_POSICOES, novoIdPosicao } from '../../armazenamento/posicoes';
import type { OfertaCadastrada } from '../../engine/ofertas';
import type { Posicao } from '../../engine/posicoes';
import { hoje } from '../hoje';

export interface PropsExportarImportar {
  ofertas: readonly OfertaCadastrada[];
  /** Vão no arquivo junto com as ofertas (v2). Padrão: nenhuma (a aba Carteira passa as dela). */
  posicoes?: readonly Posicao[];
  gerarId: () => string;
  gerarIdPosicao?: () => string;
  /** As ofertas e as posições importadas, já validadas e com ids novos; quem chama acrescenta às listas. */
  onImportar: (novas: OfertaCadastrada[], posicoes: Posicao[]) => void;
}

/** Cada caractere ocupa até 4 bytes em UTF-8: acima disso nem vale ler o arquivo. */
const LIMITE_BYTES = LIMITE_CARACTERES_IMPORTACAO * 4;
/** Revogar a URL logo depois do clique pode cancelar o download em alguns navegadores. */
const ESPERA_REVOGAR_MS = 1000;
/** Tempo com o status vazio antes de reescrever a mesma mensagem, para o leitor de tela anunciar de novo. */
const ESPERA_REPETIR_MS = 100;

const contarOfertas = (n: number) => (n === 1 ? '1 oferta' : `${n} ofertas`);
const contarPosicoes = (n: number) => (n === 1 ? '1 posição' : `${n} posições`);

/** "1 oferta exportada.", "2 ofertas importadas." ou, com posições, "1 oferta e 2 posições importadas.". */
function resumo(ofertas: number, posicoes: number, verbo: 'exportad' | 'importad'): string {
  if (posicoes === 0) return `${contarOfertas(ofertas)} ${verbo}${ofertas === 1 ? 'a' : 'as'}.`;
  // Com as duas, o particípio concorda no feminino plural (ofertas e posições).
  return `${contarOfertas(ofertas)} e ${contarPosicoes(posicoes)} ${verbo}as.`;
}

function baixar(texto: string, nome: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), ESPERA_REVOGAR_MS);
  }
}

export function ExportarImportar({ ofertas, posicoes = [], gerarId, gerarIdPosicao = novoIdPosicao, onImportar }: PropsExportarImportar) {
  // O status fica num contêiner vivo permanente (role="status"): só o texto muda, e o leitor de tela anuncia.
  const [status, setStatus] = useState('');
  const [alerta, setAlerta] = useState<string | null>(null);
  const statusAtual = useRef('');
  const repetir = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(repetir.current), []);

  function escreverStatus(texto: string) {
    statusAtual.current = texto;
    setStatus(texto);
  }

  function informar(texto: string) {
    clearTimeout(repetir.current);
    setAlerta(null);
    if (texto !== statusAtual.current) {
      escreverStatus(texto);
      return;
    }
    // A mesma mensagem de novo: limpa e reescreve, senão o contêiner vivo não muda e nada é anunciado.
    escreverStatus('');
    repetir.current = setTimeout(() => escreverStatus(texto), ESPERA_REPETIR_MS);
  }

  function avisar(texto: string) {
    clearTimeout(repetir.current);
    escreverStatus('');
    setAlerta(texto);
  }

  function exportar() {
    baixar(exportarDados(ofertas, posicoes, Date.now()), `rende-ofertas-${hoje()}.json`);
    informar(resumo(ofertas.length, posicoes.length, 'exportad'));
  }

  function processar(texto: string) {
    const r = importarDados(texto, { hoje: hoje(), gerarIdOferta: gerarId, gerarIdPosicao });
    if (!r.ok) {
      avisar(r.erro);
      return;
    }
    const total = ofertas.length + r.ofertas.length;
    if (total > LIMITE_OFERTAS) {
      avisar(`Com as importadas seriam ${total} ofertas; o limite é ${LIMITE_OFERTAS}.`);
      return;
    }
    const totalPosicoes = posicoes.length + r.posicoes.length;
    if (totalPosicoes > LIMITE_POSICOES) {
      avisar(`Com as importadas seriam ${totalPosicoes} posições; o limite é ${LIMITE_POSICOES}.`);
      return;
    }
    onImportar(r.ofertas, r.posicoes);
    informar(resumo(r.ofertas.length, r.posicoes.length, 'importad'));
  }

  function aoEscolher(e: Event) {
    const campo = e.currentTarget as HTMLInputElement;
    const arquivo = campo.files?.[0];
    // Limpa o campo para que escolher o mesmo arquivo de novo dispare outra leitura.
    campo.value = '';
    if (!arquivo) return;
    if (arquivo.size > LIMITE_BYTES) {
      avisar('O arquivo passa do limite de 100 mil caracteres.');
      return;
    }
    const leitor = new FileReader();
    leitor.onload = () => processar(typeof leitor.result === 'string' ? leitor.result : '');
    leitor.onerror = () => avisar('Não foi possível ler o arquivo.');
    leitor.readAsText(arquivo);
  }

  return (
    <div class="exportar-importar">
      <button type="button" onClick={exportar} disabled={ofertas.length === 0 && posicoes.length === 0}>Exportar ofertas</button>
      <div class="campo">
        <label for="importar-ofertas">Importar ofertas (.json)</label>
        <input id="importar-ofertas" type="file" accept="application/json,.json" onChange={aoEscolher} />
      </div>
      <p role="status" class="dica">{status}</p>
      {alerta && <p role="alert" class="erro">{alerta}</p>}
    </div>
  );
}

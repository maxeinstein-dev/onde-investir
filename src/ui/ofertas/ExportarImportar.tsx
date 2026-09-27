import { useState } from 'preact/hooks';
import { exportarOfertas, importarOfertas, LIMITE_CARACTERES_IMPORTACAO, LIMITE_OFERTAS } from '../../armazenamento/ofertas';
import type { OfertaCadastrada } from '../../engine/ofertas';
import { hoje } from '../hoje';

export interface PropsExportarImportar {
  ofertas: readonly OfertaCadastrada[];
  gerarId: () => string;
  /** As ofertas importadas, já validadas e com ids novos; quem chama acrescenta à lista. */
  onImportar: (novas: OfertaCadastrada[]) => void;
}

type Mensagem = { tipo: 'status' | 'alert'; texto: string } | null;

/** Cada caractere ocupa até 4 bytes em UTF-8: acima disso nem vale ler o arquivo. */
const LIMITE_BYTES = LIMITE_CARACTERES_IMPORTACAO * 4;

function baixar(texto: string, nome: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ExportarImportar({ ofertas, gerarId, onImportar }: PropsExportarImportar) {
  const [mensagem, setMensagem] = useState<Mensagem>(null);

  function exportar() {
    baixar(exportarOfertas(ofertas, Date.now()), `rende-ofertas-${hoje()}.json`);
    setMensagem({ tipo: 'status', texto: `${ofertas.length === 1 ? '1 oferta exportada' : `${ofertas.length} ofertas exportadas`}.` });
  }

  function processar(texto: string) {
    const r = importarOfertas(texto, gerarId);
    if (!r.ok) {
      setMensagem({ tipo: 'alert', texto: r.erro });
      return;
    }
    const total = ofertas.length + r.ofertas.length;
    if (total > LIMITE_OFERTAS) {
      setMensagem({ tipo: 'alert', texto: `Com as importadas seriam ${total} ofertas; o limite é ${LIMITE_OFERTAS}.` });
      return;
    }
    onImportar(r.ofertas);
    const n = r.ofertas.length;
    setMensagem({ tipo: 'status', texto: n === 1 ? '1 oferta importada.' : `${n} ofertas importadas.` });
  }

  function aoEscolher(e: Event) {
    const campo = e.currentTarget as HTMLInputElement;
    const arquivo = campo.files?.[0];
    // Limpa o campo para que escolher o mesmo arquivo de novo dispare outra leitura.
    campo.value = '';
    if (!arquivo) return;
    if (arquivo.size > LIMITE_BYTES) {
      setMensagem({ tipo: 'alert', texto: 'O arquivo passa do limite de 100 mil caracteres.' });
      return;
    }
    const leitor = new FileReader();
    leitor.onload = () => processar(typeof leitor.result === 'string' ? leitor.result : '');
    leitor.onerror = () => setMensagem({ tipo: 'alert', texto: 'Não foi possível ler o arquivo.' });
    leitor.readAsText(arquivo);
  }

  return (
    <div class="exportar-importar">
      <button type="button" onClick={exportar} disabled={ofertas.length === 0}>Exportar ofertas</button>
      <div class="campo">
        <label for="importar-ofertas">Importar ofertas (.json)</label>
        <input id="importar-ofertas" type="file" accept="application/json,.json" onChange={aoEscolher} />
      </div>
      {mensagem && <p role={mensagem.tipo} class={mensagem.tipo === 'alert' ? 'erro' : 'dica'}>{mensagem.texto}</p>}
    </div>
  );
}

import { explicarLideranca, nomeDoHorizonte } from '../../conteudo/comparacao';
import type { ColunaHorizonte } from '../../engine/comparacao';
import type { DataISO } from '../../engine/datas';
import type { OfertaCadastrada } from '../../engine/ofertas';

export interface PropsPorQueLidera {
  ofertas: readonly OfertaCadastrada[];
  colunas: readonly ColunaHorizonte[];
  /** O horizonte escolhido; null = o mais distante que tem líder. */
  data: DataISO | null;
  onData: (data: DataISO) => void;
}

const PREFIXO = 'comparador-lider';

/**
 * "Por que X lidera em 5 anos?": o 1º contra o 2º colocado no horizonte escolhido. Só os horizontes em que alguém
 * pode ser resgatado entram no seletor; sem nenhum, a seção não aparece. O prazo é independente do das equivalências.
 */
export function PorQueLidera({ ofertas, colunas, data, onData }: PropsPorQueLidera) {
  const comLider = colunas.filter((c) => c.lideres.length > 0);
  const coluna = comLider.find((c) => c.data === data) ?? comLider.at(-1);
  const lideranca = coluna ? explicarLideranca(ofertas, coluna) : null;
  if (!coluna || !lideranca) return null;
  return (
    <section class="lideranca" aria-labelledby={`${PREFIXO}-titulo`}>
      <h3 id={`${PREFIXO}-titulo`}>{lideranca.titulo}</h3>
      <div class="campo">
        <label for={`${PREFIXO}-prazo`}>no prazo de</label>
        <select id={`${PREFIXO}-prazo`} value={coluna.data} onChange={(e) => onData(e.currentTarget.value)}>
          {comLider.map((c) => <option key={c.data} value={c.data}>{nomeDoHorizonte(c)}</option>)}
        </select>
      </div>
      <ul class="motivos">{lideranca.motivos.map((frase) => <li key={frase}>{frase}</li>)}</ul>
    </section>
  );
}

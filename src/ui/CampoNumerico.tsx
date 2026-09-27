import { useEffect, useState } from 'preact/hooks';

/** Texto do campo → número; vazio ou inválido vira NaN (a UI valida antes de comparar). */
export function lerNumero(texto: string): number {
  const limpo = texto.trim().replace(',', '.');
  if (limpo === '') return NaN;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : NaN;
}

/** Número → texto, sem o ruído de ponto flutuante (110.00000000000001 → "110"). */
export function escreverNumero(valor: number): string {
  return Number.isFinite(valor) ? String(Number(valor.toFixed(10))) : '';
}

function mesmoNumero(a: number, b: number): boolean {
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) && Number.isNaN(b);
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

export interface PropsCampoNumerico {
  id: string;
  /** Valor atual; NaN quando o campo está vazio ou inválido. */
  valor: number;
  onChange: (valor: number) => void;
  step?: string;
  min?: string;
  describedBy?: string;
}

/**
 * Campo numérico que guarda o texto digitado. Pode ficar vazio sem voltar para "0" e não mostra
 * ruído de ponto flutuante. Só ressincroniza o texto quando o valor muda por fora.
 */
export function CampoNumerico({ id, valor, onChange, step, min, describedBy }: PropsCampoNumerico) {
  const [texto, setTexto] = useState(() => escreverNumero(valor));
  useEffect(() => {
    if (!mesmoNumero(lerNumero(texto), valor)) setTexto(escreverNumero(valor));
    // Só reage a mudanças de fora; o texto digitado já foi convertido no onInput.
  }, [valor]);
  return (
    <input id={id} type="number" inputMode="decimal" step={step} min={min} value={texto} aria-describedby={describedBy}
      onInput={(e) => { const t = e.currentTarget.value; setTexto(t); onChange(lerNumero(t)); }} />
  );
}

import type { ComponentChildren } from 'preact';

export function Detalhes({ resumo, aberto = false, children }: { resumo: string; aberto?: boolean; children: ComponentChildren }) {
  return (
    <details class="detalhes" open={aberto}>
      <summary>{resumo}</summary>
      {children}
    </details>
  );
}

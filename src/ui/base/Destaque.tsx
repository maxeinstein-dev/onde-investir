// O número que importa numa tela de resultado: rótulo, valor grande, e uma frase que o explica.
import { useId } from 'preact/hooks';

export function Destaque({ rotulo, valor, frase }: { rotulo: string; valor: string; frase?: string }) {
  const idRotulo = useId();
  return (
    <div class="destaque" role="group" aria-labelledby={idRotulo}>
      <p class="destaque__rotulo" id={idRotulo}>{rotulo}</p>
      <p class="destaque__valor">{valor}</p>
      {frase && <p class="destaque__frase">{frase}</p>}
    </div>
  );
}

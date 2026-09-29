// O número que importa numa tela de resultado: rótulo, valor grande, e uma frase que o explica.
export function Destaque({ rotulo, valor, frase }: { rotulo: string; valor: string; frase?: string }) {
  return (
    <div class="destaque" role="group" aria-label={rotulo}>
      <p class="destaque__rotulo">{rotulo}</p>
      <p class="destaque__valor">{valor}</p>
      {frase && <p class="destaque__frase">{frase}</p>}
    </div>
  );
}

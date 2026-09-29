// Selo visual (aria-hidden) com o texto real só para o leitor de tela, como o "maior" da tabela.
export function Selo({ visual, leitor }: { visual: string; leitor: string }) {
  return (
    <>
      <span class="selo" aria-hidden="true">{visual}</span>
      <span class="visualmente-oculto">{leitor}</span>
    </>
  );
}

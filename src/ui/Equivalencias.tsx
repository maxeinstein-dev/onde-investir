import type { ComponentChildren } from 'preact';
import type { Equivalente, ResultadoEquivalencia } from '../engine/equivalencia';
import { formatarMoeda, formatarPercentual } from '../formato';
import { Termo } from './Termo';

function Valor({ eq, formatar }: { eq: Equivalente; formatar: (taxa: number) => string }) {
  return eq.disponivel ? <strong>{formatar(eq.taxa)}</strong> : <span class="indisponivel">não se aplica: {eq.motivo}</span>;
}

function Linha({ rotulo, eq, formatar }: { rotulo: ComponentChildren; eq: Equivalente; formatar: (taxa: number) => string }) {
  return <li>{rotulo}: <Valor eq={eq} formatar={formatar} /></li>;
}

const doCDI = (t: number) => `${formatarPercentual(t)} do CDI`;
const aoAno = (t: number) => `${formatarPercentual(t)} ao ano`;
const ipcaMais = (t: number) => `IPCA + ${formatarPercentual(t)} ao ano`;

export function Equivalencias({ origem, eq }: { origem: string; eq: ResultadoEquivalencia }) {
  const bolso = eq.regraDeBolso;
  const exata = bolso === null ? null : bolso.destino === 'TRIBUTADO' ? eq.tributadoPosCDI : eq.isentoPosCDI;
  return (
    <section class="equivalencias" aria-labelledby="eq-titulo">
      <h2 id="eq-titulo"><Termo id="equivalencia">Equivalências</Termo> de {origem}</h2>
      <p>Para terminar com o mesmo <Termo id="valor-liquido">valor líquido</Termo> ({formatarMoeda(eq.liquidoAlvo)}), você precisaria de:</p>
      <ul>
        <Linha rotulo={<><Termo id="cdb">CDB</Termo> pós-fixado</>} eq={eq.tributadoPosCDI} formatar={doCDI} />
        <Linha rotulo={<><Termo id="lci-lca">LCI/LCA</Termo> pós-fixada</>} eq={eq.isentoPosCDI} formatar={doCDI} />
        <Linha rotulo={<>CDB <Termo id="prefixado">prefixado</Termo></>} eq={eq.tributadoPre} formatar={aoAno} />
        <Linha rotulo={<>CDB <Termo id="ipca-mais">IPCA+</Termo></>} eq={eq.tributadoIpcaMais} formatar={ipcaMais} />
      </ul>
      {bolso !== null && exata?.disponivel && eq.aliquotaIR !== null && (
        <p class="dica">
          A regra de bolso do mercado daria {bolso.destino === 'TRIBUTADO' ? 'um CDB' : 'uma LCI/LCA'} de{' '}
          {formatarPercentual(bolso.taxa)} do CDI: ela {bolso.destino === 'TRIBUTADO' ? 'divide' : 'multiplica'} a taxa por
          (1 − {formatarPercentual(eq.aliquotaIR)} de IR). Isso fica {formatarPercentual(Math.abs(bolso.taxa - exata.taxa))} do CDI{' '}
          {bolso.taxa > exata.taxa ? 'acima' : 'abaixo'} da conta exata, porque o imposto incide uma vez sobre os juros
          compostos no resgate, e não sobre a taxa de cada dia.
        </p>
      )}
    </section>
  );
}

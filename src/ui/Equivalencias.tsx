import type { ResultadoEquivalencia } from '../engine/equivalencia';
import { formatarMoeda, formatarPercentual } from '../formato';
import { Termo } from './Termo';

export function Equivalencias({ origem, eq }: { origem: string; eq: ResultadoEquivalencia }) {
  return (
    <section class="equivalencias" aria-labelledby="eq-titulo">
      <h2 id="eq-titulo"><Termo id="equivalencia">Equivalências</Termo> de {origem}</h2>
      <p>Para terminar com o mesmo <Termo id="valor-liquido">valor líquido</Termo> ({formatarMoeda(eq.liquidoAlvo)}), você precisaria de:</p>
      <ul>
        <li><Termo id="cdb">CDB</Termo> pós-fixado: <strong>{formatarPercentual(eq.tributadoPosCDI)} do CDI</strong></li>
        {eq.isentoPosCDI !== null && <li><Termo id="lci-lca">LCI/LCA</Termo> pós-fixada: <strong>{formatarPercentual(eq.isentoPosCDI)} do CDI</strong></li>}
        <li>CDB <Termo id="prefixado">prefixado</Termo>: <strong>{formatarPercentual(eq.tributadoPre)} ao ano</strong></li>
        <li>CDB <Termo id="ipca-mais">IPCA+</Termo>: <strong>IPCA + {formatarPercentual(eq.tributadoIpcaMais)} ao ano</strong></li>
      </ul>
      {eq.regraDeBolso !== null && (
        <p class="dica">
          A regra de bolso do mercado daria {formatarPercentual(eq.regraDeBolso)}. Ela divide (ou multiplica) pela
          alíquota do IR ({formatarPercentual(eq.aliquotaIR)}) e ignora que o imposto incide sobre juros compostos.
          Por isso a conta exata acima é diferente.
        </p>
      )}
      {eq.isentoPosCDI === null && (
        <p class="dica">LCI/LCA não aparecem porque esse prazo é menor que o <Termo id="prazo-minimo">prazo mínimo</Termo> legal.</p>
      )}
    </section>
  );
}

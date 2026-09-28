import type { ComponentChildren } from 'preact';
import type { Equivalente, ResultadoEquivalencia } from '../engine/equivalencia';
import { formatarMoeda, formatarNumero, formatarPercentual } from '../formato';
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

/** A seção de equivalências quando a origem não pode ser resgatada na data: explica o motivo e não calcula nada. */
export function EquivalenciasIndisponiveis({ origem, motivo }: { origem: string; motivo: string }) {
  return (
    <section class="equivalencias" aria-labelledby="eq-titulo">
      <h2 id="eq-titulo">Equivalências de {origem}</h2>
      <p>Não dá para calcular as equivalências nessa data. {motivo}</p>
    </section>
  );
}

export interface PropsEquivalencias {
  origem: string;
  eq: ResultadoEquivalencia;
  /** Observação sobre a conta, logo abaixo do título. */
  aviso?: string;
}

export function Equivalencias({ origem, eq, aviso }: PropsEquivalencias) {
  const bolso = eq.regraDeBolso;
  const exata = bolso === null ? null : bolso.destino === 'TRIBUTADO' ? eq.tributadoPosCDI : eq.isentoPosCDI;
  const pontos = bolso !== null && exata?.disponivel ? formatarNumero(Math.abs(bolso.taxa - exata.taxa) * 100) : '';
  return (
    <section class="equivalencias" aria-labelledby="eq-titulo">
      <h2 id="eq-titulo">Equivalências de {origem}</h2>
      <p class="dica"><Termo id="equivalencia">O que é taxa equivalente?</Termo></p>
      {aviso && <p class="dica">{aviso}</p>}
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
          {formatarPercentual(bolso.taxa)} do CDI, {bolso.destino === 'TRIBUTADO' ? 'dividindo' : 'multiplicando'} a taxa por
          (1 − {formatarPercentual(eq.aliquotaIR)} de IR). Ela fica {pontos} {pontos === '1' ? 'ponto percentual' : 'pontos percentuais'}{' '}
          {bolso.taxa > exata.taxa ? 'acima' : 'abaixo'} da conta exata, porque o IR incide uma vez sobre os juros
          compostos no resgate e a regra trata como se ele saísse da taxa de cada dia.
        </p>
      )}
    </section>
  );
}

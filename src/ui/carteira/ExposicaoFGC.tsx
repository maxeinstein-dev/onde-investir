import { textoDoLimiteNaCarteira } from '../../conteudo/carteira';
import { nomeOferta } from '../../conteudo/comparacao';
import { reaisRedondos as redondo, textoDoTetoGlobal } from '../../conteudo/alertas';
import { dataBR, type DataISO } from '../../engine/datas';
import type { Posicao } from '../../engine/posicoes';
import { formatarMoeda } from '../../formato';
import { Termo } from '../Termo';
import type { ExposicaoCarteira } from './resumo';

const PREFIXO = 'carteira-fgc';

export interface PropsExposicaoFGC {
  fgc: ExposicaoCarteira;
  naoCalculadas: readonly Posicao[];
  hoje: DataISO;
}

/** A exposição ao FGC por conglomerado (barra até o limite), o teto global e o Tesouro à parte (spec §3.4). */
export function ExposicaoFGC({ fgc, naoCalculadas, hoje }: PropsExposicaoFGC) {
  const idTitulo = `${PREFIXO}-titulo`;
  return (
    <section class="exposicao-fgc" aria-labelledby={idTitulo}>
      <h3 id={idTitulo}>Exposição ao <Termo id="fgc">FGC</Termo></h3>
      {!fgc.ok ? (
        <p class="aviso">Não deu para calcular a exposição ao FGC: {fgc.erro}</p>
      ) : (
        <>
          {fgc.conglomerados.length === 0 && <p class="dica">Nenhuma posição com a garantia do FGC.</p>}
          {fgc.conglomerados.length > 0 && (
            <ul class="exposicao-fgc__lista" role="list">
              {fgc.conglomerados.map((g, i) => {
                const idBarra = `${PREFIXO}-${i}`;
                const rotulo = `${g.nome}: ${formatarMoeda(g.hoje)} hoje, de ${redondo(g.limite)}`;
                // O <meter> para no máximo: acima do limite, o texto visível e a classe dizem o que a barra não mostra.
                const acima = g.hoje > g.limite;
                return (
                  <li key={g.nome} class={acima ? 'exposicao-fgc__item exposicao-fgc__item--acima' : 'exposicao-fgc__item'}>
                    <label for={idBarra}>{rotulo}</label>
                    <meter id={idBarra} class="exposicao-fgc__barra" min={0} max={g.limite} low={g.limite * 0.8} high={g.limite}
                      optimum={0} value={g.hoje}>
                      {rotulo}
                    </meter>
                    {acima && <p class="exposicao-fgc__acima">acima do limite</p>}
                    {g.fim && <p class="cartao__detalhe">No vencimento mais distante ({dataBR(g.fim.data)}): {formatarMoeda(g.fim.valor)}</p>}
                    {g.alerta && <p class="aviso">{textoDoLimiteNaCarteira(g.alerta, hoje)}</p>}
                  </li>
                );
              })}
            </ul>
          )}
          {fgc.tetoGlobal ? (
            <TetoExcedido teto={fgc.tetoGlobal} />
          ) : (
            <p class="dica">
              Garantia somada: {formatarMoeda(fgc.garantiaSomada)} de {redondo(fgc.teto)}, o teto global do FGC (cada conglomerado
              conta até {redondo(fgc.limitePorConglomerado)}).
            </p>
          )}
          {fgc.tesouro && (
            <p class="cartao__detalhe">
              Tesouro Nacional (sem limite do FGC): {formatarMoeda(fgc.tesouro.bruto)}
            </p>
          )}
        </>
      )}
      {naoCalculadas.length > 0 && (
        <p class="aviso">
          Fora da conta, porque não deu para calcular: {naoCalculadas.map(nomeOferta).join('; ')}.
        </p>
      )}
    </section>
  );
}

function TetoExcedido({ teto }: { teto: NonNullable<Extract<ExposicaoCarteira, { ok: true }>['tetoGlobal']> }) {
  const t = textoDoTetoGlobal(teto);
  return (
    <div class="alerta">
      <h4 class="alerta__titulo">{t.titulo}</h4>
      <p>{t.oQue}</p>
      <p class="alerta__porque">{t.porQue}</p>
    </div>
  );
}

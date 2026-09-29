// Tela de sugestão de um objetivo: recalcula a cada visualização contra o catálogo e a carteira
// atuais (spec §9.1, plano M4a C4). O engine nunca produz texto; aqui cada fatia vira frases,
// com src/conteudo/sugestao.ts, e o link para a lição de cada motivo.
import { useMemo } from 'preact/hooks';
import type { ObjetivoSalvo } from '../../armazenamento/objetivos';
import { nomeOferta } from '../../conteudo/comparacao';
import {
  AVISO_EDUCATIVO, descreverFatia, fraseFalta, fraseMelhorOferta, fraseReferenciaPrincipal, fraseRendaEstimada,
  fraseRendaMelhorOferta, licaoDaFatia, NOTA_CARENCIA_REFERENCIA, notaRendaVariavel, ROTULO_PRINCIPAL_NECESSARIO,
  ROTULO_RENDA_ESTIMADA, textoDaFatia, textoDoFgc,
} from '../../conteudo/sugestao';
import type { DataISO } from '../../engine/datas';
import type { Equivalente } from '../../engine/equivalencia';
import type { ItemFGC } from '../../engine/fgc';
import type { Cenario } from '../../engine/indexadores';
import type { OfertaCadastrada } from '../../engine/ofertas';
import { calcularTaxaNecessaria, sugerir, sugerirRendaMensal, type Fatia, type ResultadoRendaMensal } from '../../engine/sugestao';
import { LinkLicao } from '../aprender/LinkLicao';
import { formatarMoeda, formatarPercentual } from '../../formato';
import { GraficoObjetivo } from '../graficos/GraficoObjetivo';
import { Destaque } from '../base/Destaque';
import './objetivos.css';

export interface PropsSugestao {
  objetivo: ObjetivoSalvo;
  catalogo: readonly OfertaCadastrada[];
  carteira: readonly ItemFGC[];
  hoje: DataISO;
  cenario: Cenario;
  /** "Comparar esta oferta", quando a fatia tem uma oferta do catálogo casada. */
  onIrParaComparar: (oferta: OfertaCadastrada) => void;
}

/** O %CDI necessário formatado, ou o motivo da indisponibilidade quando não foi possível resolver. */
function formatarTaxaNecessaria(e: Equivalente): string {
  return e.disponivel ? formatarPercentual(e.taxa) : e.motivo;
}

function ItemFatia({ f, onIrParaComparar }: { f: Fatia; onIrParaComparar: (oferta: OfertaCadastrada) => void }) {
  const avisoFgc = textoDoFgc(f);
  return (
    <li class="cartao cartao--fatia">
      <h3>{descreverFatia(f)} — {formatarPercentual(f.percentual)}</h3>
      {f.valor !== null && (
        <div class="obj-fatia-valor">
          <Destaque rotulo="Aportar" valor={formatarMoeda(f.valor)} />
        </div>
      )}
      <p>{textoDaFatia(f)} <LinkLicao licao={licaoDaFatia(f)} /></p>
      {avisoFgc && <p class="aviso">{avisoFgc}</p>}
      {f.ofertaCatalogo && (
        <p class="cartao__detalhe">
          Já disponível: {nomeOferta(f.ofertaCatalogo)}{' '}
          <button type="button" onClick={() => onIrParaComparar(f.ofertaCatalogo as OfertaCadastrada)}>Comparar</button>
        </p>
      )}
    </li>
  );
}

const percentualDaOferta = (o: OfertaCadastrada): number => (o.indexacao as { percentualCDI: number }).percentualCDI;
const ehLciLca = (o: OfertaCadastrada): boolean => o.produto === 'LCI' || o.produto === 'LCA';

/**
 * Renda inviável com o principal informado: quanto o principal já rende por mês e quanto seria preciso aplicar para
 * chegar na renda desejada, num CDB a 100% do CDI (referência de cálculo) e na melhor oferta do catálogo.
 */
function RendaInviavel({ resultado, principal, rendaDesejada }: {
  resultado: Extract<ResultadoRendaMensal, { modo: 'INSUFICIENTE' }>; principal: number; rendaDesejada: number;
}) {
  const { principalNecessario, rendaComPrincipal } = resultado;
  const { referencia, catalogo } = principalNecessario;
  if (referencia === null && catalogo === null && rendaComPrincipal.referencia === null) return null;
  return (
    <div class="cartao obj-principal-necessario">
      {rendaComPrincipal.referencia !== null && (
        <Destaque
          rotulo={ROTULO_RENDA_ESTIMADA} valor={`${formatarMoeda(rendaComPrincipal.referencia)}/mês`}
          frase={fraseRendaEstimada(principal)}
        />
      )}
      {catalogo !== null && rendaComPrincipal.catalogo !== null && (
        <p class="cartao__detalhe">
          {fraseRendaMelhorOferta(nomeOferta(catalogo.oferta), percentualDaOferta(catalogo.oferta), rendaComPrincipal.catalogo)}
        </p>
      )}
      {referencia !== null && (
        <Destaque rotulo={ROTULO_PRINCIPAL_NECESSARIO} valor={formatarMoeda(referencia)} frase={fraseReferenciaPrincipal(rendaDesejada, principal)} />
      )}
      {catalogo !== null && (
        <p class="cartao__detalhe">{fraseMelhorOferta(nomeOferta(catalogo.oferta), percentualDaOferta(catalogo.oferta), catalogo.valor)}</p>
      )}
      {catalogo !== null && ehLciLca(catalogo.oferta) && <p class="cartao__detalhe">{NOTA_CARENCIA_REFERENCIA}</p>}
    </div>
  );
}

export function Sugestao({ objetivo, catalogo, carteira, hoje, cenario, onIrParaComparar }: PropsSugestao) {
  // useMemo (não useState/congelar): a sugestão nunca pode ficar parada no tempo, tem que recalcular sempre
  // que entradas/catálogo/carteira/hoje mudarem de verdade. Só evita recriar o array (e, com isso, o gráfico
  // de pizza em GraficoObjetivo) em renders que não afetam a sugestão.
  const ehRendaMensal = objetivo.entradas.tipo === 'RENDA_MENSAL';

  const fatiasPadrao = useMemo(
    () => (ehRendaMensal ? null : sugerir(objetivo.entradas, { catalogo, carteira, hoje })),
    [objetivo.entradas, catalogo, carteira, hoje, ehRendaMensal],
  );

  // Renda mensal precisa do Cenario (CDI diário) para calcular a taxa necessária, e do `modo`/`faltaMensal`
  // que `sugerir()` não expõe — então usa `sugerirRendaMensal` direto. `calcularTaxaNecessaria` é chamado
  // no mesmo useMemo, para os dois %CDI do cartão, sem recalcular a bisseção fora daqui.
  const rendaMensal = useMemo<{
    necessaria: ReturnType<typeof calcularTaxaNecessaria>; resultado: ResultadoRendaMensal; principal: number; rendaDesejada: number;
  } | null>(() => {
    if (objetivo.entradas.tipo !== 'RENDA_MENSAL') return null;
    const entradas = objetivo.entradas;
    const necessaria = calcularTaxaNecessaria(entradas.principal, entradas.rendaMensalDesejada, hoje, cenario);
    const resultado = sugerirRendaMensal(entradas, { catalogo, carteira, hoje }, cenario);
    return { necessaria, resultado, principal: entradas.principal, rendaDesejada: entradas.rendaMensalDesejada };
  }, [objetivo.entradas, catalogo, carteira, hoje, cenario]);

  const fatias = rendaMensal
    ? (rendaMensal.resultado.modo === 'UNICA' ? [rendaMensal.resultado.fatia] : rendaMensal.resultado.fatias)
    : (fatiasPadrao ?? []);
  const nota = notaRendaVariavel(objetivo.entradas);
  return (
    <section class="sugestao" aria-labelledby="sugestao-titulo">
      <h2 id="sugestao-titulo">{objetivo.nome ?? 'Sugestão'}</h2>
      <p class="aviso">{AVISO_EDUCATIVO}</p>
      {rendaMensal && (
        <div class="cartao cartao--taxa-necessaria">
          <h3>Renda mensal desejada</h3>
          <Destaque
            rotulo="%CDI necessário para a renda mensal desejada"
            valor={formatarTaxaNecessaria(rendaMensal.necessaria.tributadoPosCDI)}
            frase="CDB/RDB (tributado)"
          />
          <p>LCI/LCA (isento): {formatarTaxaNecessaria(rendaMensal.necessaria.isentoPosCDI)}</p>
          <p class="cartao__detalhe">
            A LCI/LCA tem carência mínima de 6 meses antes do primeiro resgate, então o %CDI isento
            acima é uma taxa de referência: não dá pra contar com essa renda antes da carência.
          </p>
        </div>
      )}
      {rendaMensal && rendaMensal.resultado.modo === 'INSUFICIENTE' && (
        <RendaInviavel resultado={rendaMensal.resultado} principal={rendaMensal.principal} rendaDesejada={rendaMensal.rendaDesejada} />
      )}
      {/* Sem fatias (catálogo vazio), não há o que distribuir: um gráfico vazio só deixaria um bloco em branco. */}
      {fatias.length > 0 && <GraficoObjetivo fatias={fatias} />}
      {fatias.length > 0 && (
        <ul class="lista-ofertas" aria-label="Fatias sugeridas">
          {fatias.map((f, i) => <ItemFatia key={`${f.motivo}-${i}`} f={f} onIrParaComparar={onIrParaComparar} />)}
        </ul>
      )}
      {rendaMensal && rendaMensal.resultado.modo === 'INSUFICIENTE' && (
        <p class="aviso">
          {fraseFalta(rendaMensal.resultado.faltaMensal, rendaMensal.rendaDesejada)} <LinkLicao licao="renda-variavel" />
        </p>
      )}
      {nota && (
        <p class="dica">
          {nota} <LinkLicao licao="renda-variavel" />
        </p>
      )}
    </section>
  );
}

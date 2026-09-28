import { useId, useMemo, useRef } from 'preact/hooks';
import { nomeOferta } from '../../conteudo/comparacao';
import { GRAFICO_VALOR, motivoSemResgate, resumirTrocas, rotuloDaTroca } from '../../conteudo/serie';
import type { DataISO } from '../../engine/datas';
import type { OfertaCadastrada } from '../../engine/ofertas';
import { lideresNoPonto, type Oscilacao, type Serie, type TrocaRelevante } from '../../engine/serie';
import { formatarMoeda } from '../../formato';
import { letraDaOferta } from '../letras';
import type { PaletaGrafico } from './cores';
import { type Anotacoes, type ConfigLinha, configLinhas, limites, linha, linhaVertical } from './config';
import { diaDoEixo } from './eixo';
import { AvisoCarregamento } from './AvisoCarregamento';
import { useGrafico } from './useGrafico';

export interface PropsGraficoValorLiquido {
  /** As de `seriesDeValorLiquido`, todas com as mesmas datas. */
  series: readonly Serie[];
  /** As trocas relevantes (`trocasRelevantes`): as lideranças curtas já fundidas. */
  trocas: readonly TrocaRelevante[];
  /** A oscilação do trecho do começo, quando houver (`trocasRelevantes(...).inicial`). */
  oscilacaoInicial?: Oscilacao;
  ofertas: readonly OfertaCadastrada[];
  /** A partir desta data a projeção é premissa do app (cenário projetado); a faixa fica sombreada. */
  inicioPremissa?: DataISO;
}

function montarConfig(p: PaletaGrafico, { series, trocas, ofertas, inicioPremissa }: PropsGraficoValorLiquido): ConfigLinha {
  const datas = series[0]?.pontos.map((pt) => pt.data) ?? [];
  const [primeira, ultima] = limites(datas) ?? ['1970-01-01', '1970-01-01'];
  const anotacoes: Anotacoes = {};
  trocas.forEach((t, k) => {
    anotacoes[`troca-${k}`] = linhaVertical(p, diaDoEixo(t.data), rotuloDaTroca(t.para.map(letraDaOferta)), k);
  });
  if (inicioPremissa !== undefined && inicioPremissa < ultima) {
    anotacoes.premissa = {
      type: 'box', xMin: diaDoEixo(inicioPremissa < primeira ? primeira : inicioPremissa), xMax: diaDoEixo(ultima),
      backgroundColor: p.premissa, borderWidth: 0, drawTime: 'beforeDatasetsDraw',
      label: { display: true, content: GRAFICO_VALOR.premissa, color: p.texto, font: { size: 11 }, position: { x: 'start', y: 'start' } },
    };
  }
  return configLinhas(p, {
    datasets: series.map((s) => {
      const o = ofertas[s.ofertaIndice];
      const rotulo = o ? `${letraDaOferta(s.ofertaIndice)}: ${nomeOferta(o)}` : letraDaOferta(s.ofertaIndice);
      const data = s.pontos.map((pt) => ({ x: diaDoEixo(pt.data), y: pt.liquido }));
      return linha(p, s.ofertaIndice, rotulo, data, (k) => s.pontos[k]?.resgatavel ?? true);
    }),
    xMin: diaDoEixo(primeira),
    xMax: diaDoEixo(ultima),
    anotacoes,
    rotuloTooltip: (item) => {
      const s = series[item.datasetIndex];
      const ponto = s?.pontos[item.dataIndex];
      const letra = letraDaOferta(s?.ofertaIndice ?? item.datasetIndex);
      const motivo = ponto && !ponto.resgatavel && ponto.motivo ? ` ${motivoSemResgate(ponto.motivo)}` : '';
      return `${letra}: ${formatarMoeda(item.parsed.y ?? 0)}${motivo}`;
    },
  });
}

/** Valor líquido de cada oferta ao longo do tempo, com as trocas de líder, o tracejado sem resgate e a premissa. */
export function GraficoValorLiquido(props: PropsGraficoValorLiquido) {
  const { series, trocas, ofertas, inicioPremissa, oscilacaoInicial } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const idResumo = useId();
  const resumo = useMemo(
    () => resumirTrocas(trocas, ofertas, lideresNoPonto(series, 0), oscilacaoInicial), [series, trocas, ofertas, oscilacaoInicial]);
  const { estado, tentarDeNovo } = useGrafico(canvas, (p) => montarConfig(p, props), [series, trocas, ofertas, inicioPremissa]);
  return (
    <figure class="grafico" aria-busy={estado === 'carregando' ? 'true' : 'false'}>
      <figcaption class="grafico__titulo">{GRAFICO_VALOR.titulo}</figcaption>
      <p class="dica">{GRAFICO_VALOR.tracejado}</p>
      <div class="grafico__area">
        <canvas ref={canvas} role="img" aria-labelledby={idResumo} hidden={estado === 'erro'} />
        <AvisoCarregamento estado={estado} onTentarDeNovo={tentarDeNovo} />
      </div>
      <div class="grafico__resumo" id={idResumo}>
        {resumo.map((frase) => <p key={frase}>{frase}</p>)}
      </div>
    </figure>
  );
}

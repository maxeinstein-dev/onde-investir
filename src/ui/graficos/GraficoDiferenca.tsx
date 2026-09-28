import { useId, useMemo, useRef, useState } from 'preact/hooks';
import { nomesDistintos } from '../../conteudo/comparacao';
import { GRAFICO_DIFERENCA, resumirDiferenca, rotuloDaTrocaDeSinal, type TrechoDiferenca } from '../../conteudo/serie';
import type { OfertaCadastrada } from '../../engine/ofertas';
import type { Serie } from '../../engine/serie';
import { formatarMoeda } from '../../formato';
import { letraDaOferta } from '../letras';
import type { PaletaGrafico } from './cores';
import { type Anotacoes, type ConfigLinha, configLinhas, limites, linha, linhaVertical } from './config';
import { diferencaEntre, type PontoDiferenca, trechosDaDiferenca } from './diferenca';
import { diaDoEixo } from './eixo';
import { AvisoCarregamento } from './AvisoCarregamento';
import { Legenda } from './Legenda';
import { useGrafico } from './useGrafico';

export interface PropsGraficoDiferenca {
  /** As de `seriesDeValorLiquido`, uma por oferta, na ordem das ofertas. */
  series: readonly Serie[];
  ofertas: readonly OfertaCadastrada[];
  /** Prefixo dos ids dos seletores. */
  prefixo?: string;
}

interface Escolha { a: number; b: number }

/** "A − B": o rótulo da linha, no tooltip e na legenda. */
const rotuloDaDiferenca = ({ a, b }: Escolha) => `${letraDaOferta(a)} − ${letraDaOferta(b)}`;

function montarConfig(p: PaletaGrafico, { a, b }: Escolha, pontos: readonly PontoDiferenca[], trechos: readonly TrechoDiferenca[]): ConfigLinha {
  const [primeira, ultima] = limites(pontos.map((pt) => pt.data)) ?? ['1970-01-01', '1970-01-01'];
  const [letraA, letraB] = [letraDaOferta(a), letraDaOferta(b)];
  const rotulo = rotuloDaDiferenca({ a, b });
  const anotacoes: Anotacoes = {
    zero: { type: 'line', yMin: 0, yMax: 0, borderColor: p.marcador, borderWidth: 2 },
  };
  trechos.slice(1).forEach((t, k) => {
    anotacoes[`sinal-${k}`] = linhaVertical(p, diaDoEixo(t.data), rotuloDaTrocaDeSinal(t.frente, letraA, letraB), k);
  });
  return configLinhas(p, {
    datasets: [linha(p, a, rotulo, pontos.map((pt) => ({ x: diaDoEixo(pt.data), y: pt.diferenca })), (k) => pontos[k]?.resgatavel ?? true)],
    xMin: diaDoEixo(primeira),
    xMax: diaDoEixo(ultima),
    anotacoes,
    incluirZero: true,
    rotuloTooltip: (item) => {
      const referencia = pontos[item.dataIndex]?.resgatavel === false ? ` ${GRAFICO_DIFERENCA.referencia}` : '';
      return `${rotulo}: ${formatarMoeda(item.parsed.y ?? 0)}${referencia}`;
    },
  });
}

/** A diferença A − B entre duas ofertas escolhidas, com o zero destacado e as trocas de sinal. */
export function GraficoDiferenca({ series, ofertas, prefixo = 'grafico-diferenca' }: PropsGraficoDiferenca) {
  const [escolhaSalva, setEscolha] = useState<Escolha>({ a: 0, b: 1 });
  const n = Math.min(series.length, ofertas.length);
  // Derivada na renderização: com menos ofertas, uma escolha que deixou de existir volta ao padrão.
  const escolha = escolhaSalva.a < n && escolhaSalva.b < n && escolhaSalva.a !== escolhaSalva.b ? escolhaSalva : { a: 0, b: 1 };
  const { a, b } = escolha;
  const serieA = series[a];
  const serieB = series[b];
  const pontos = useMemo(() => (serieA && serieB ? diferencaEntre(serieA, serieB) : []), [serieA, serieB]);
  const trechos = useMemo(() => trechosDaDiferenca(pontos), [pontos]);
  const nomes = nomesDistintos(ofertas);
  const nome = (i: number) => nomes[i] ?? letraDaOferta(i);
  const resumo = resumirDiferenca(trechos, nome(a), nome(b));
  const canvas = useRef<HTMLCanvasElement>(null);
  const idResumo = useId();
  const { estado, tentarDeNovo } = useGrafico(canvas, (p) => montarConfig(p, escolha, pontos, trechos), [pontos, trechos, a, b]);

  if (n < 2) return null;

  /** Escolher de um lado a oferta que está do outro troca as duas de lugar. */
  function escolher(lado: 'a' | 'b', i: number) {
    if (lado === 'a') setEscolha(i === b ? { a: i, b: a } : { a: i, b });
    else setEscolha(i === a ? { a: b, b: i } : { a, b: i });
  }

  const opcoes = ofertas.slice(0, n).map((o, i) => <option key={o.id} value={String(i)}>{letraDaOferta(i)}: {nome(i)}</option>);
  return (
    <figure class="grafico" aria-busy={estado === 'carregando' ? 'true' : 'false'}>
      <figcaption class="grafico__titulo">{GRAFICO_DIFERENCA.titulo}</figcaption>
      <div class="grafico__escolha">
        <div class="campo">
          <label for={`${prefixo}-a`}>{GRAFICO_DIFERENCA.comparar}</label>
          <select id={`${prefixo}-a`} value={String(a)} onChange={(e) => escolher('a', Number(e.currentTarget.value))}>{opcoes}</select>
        </div>
        <div class="campo">
          <label for={`${prefixo}-b`}>{GRAFICO_DIFERENCA.com}</label>
          {/* O rótulo visível "com" sozinho não diz nada a quem navega pelos campos do formulário. */}
          <select id={`${prefixo}-b`} aria-label={GRAFICO_DIFERENCA.compararCom} value={String(b)} onChange={(e) => escolher('b', Number(e.currentTarget.value))}>{opcoes}</select>
        </div>
      </div>
      <p class="dica">{GRAFICO_DIFERENCA.explicacao}</p>
      <div class="grafico__area">
        <canvas ref={canvas} role="img" aria-labelledby={idResumo} hidden={estado === 'erro'} />
        <AvisoCarregamento estado={estado} onTentarDeNovo={tentarDeNovo} />
      </div>
      {/* A linha tem a cor e a forma da oferta A. */}
      <Legenda itens={[{ serie: a, texto: rotuloDaDiferenca(escolha) }]} hidden={estado === 'erro'} />
      <div class="grafico__resumo" id={idResumo}>
        <p>{resumo}</p>
      </div>
    </figure>
  );
}

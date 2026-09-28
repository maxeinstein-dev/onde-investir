// Textos da aba Carteira (spec §3.4, §4.3 e §5.3).
import type { HistoricoCarregado, SerieHistorico } from '../dados/historico';
import { dataBR } from '../engine/datas';
import type { AlertaFGC } from '../engine/fgc';
import type { ConferenciaExtrato } from '../engine/posicoes';
import { formatarMoeda, formatarPercentual } from '../formato';
import type { EstadoHistorico } from '../ui/useHistorico';

export const SEM_POSICOES = 'Cadastre as aplicações que você já tem para ver quanto valem hoje e quanto está coberto pelo FGC.';
export const BUSCANDO_HISTORICO = 'Buscando o histórico do Banco Central…';
export const DICA_EXTRATO = 'O extrato serve para conferir o valor calculado. Se for de até 30 dias atrás, a exposição ao FGC parte dele.';
export const EXTRATO_SUSPEITO = 'A diferença passa de 1%. Confira a taxa e a data digitadas.';
export const CURVA_CONTRATADA = 'Valor pela taxa contratada. Vendido antes do vencimento, sai pelo preço de mercado.';
export const DICA_EXPORTAR = 'Para guardar uma cópia das posições, use "Exportar ofertas" no Catálogo, que salva as ofertas e as posições no mesmo arquivo.';

const NOME_SERIE: Record<SerieHistorico, string> = { 12: 'CDI', 11: 'Selic', 433: 'IPCA', 226: 'TR', 432: 'Selic meta' };
/** A ordem das séries no texto: o CDI primeiro, porque é o que mais pesa no valor. */
const ORDEM_SERIES: readonly SerieHistorico[] = [12, 11, 433, 226, 432];

/** "CDI de 2025, IPCA de 2025 e 2026": as séries e os anos que faltaram. */
function listarFaltando(faltando: HistoricoCarregado['faltando']): string {
  return ORDEM_SERIES.flatMap((serie) => {
    const anos = faltando.filter((f) => f.serie === serie).map((f) => f.ano).sort((a, b) => a - b);
    return anos.length === 0 ? [] : [`${NOME_SERIE[serie]} de ${anos.join(', ').replace(/, (\d+)$/, ' e $1')}`];
  }).join(', ');
}

/**
 * O que dizer sobre o histórico usado no valor das posições: carregando, completo, incompleto (série faltando ou
 * dias sem CDI), limitado a 10 anos ou sem histórico. Vazio sem posições.
 */
export function textoDoHistorico(estado: EstadoHistorico, ctx: { lacunas: number; invalido: boolean }): string {
  if (estado.fase === 'inativo') return '';
  if (estado.fase === 'carregando') return BUSCANDO_HISTORICO;
  const { series, faltando, limitado, inicio } = estado.carregado;
  if (series === null || ctx.invalido) {
    return ctx.invalido
      ? 'O histórico do Banco Central veio com dados fora do esperado e foi deixado de lado. Os valores saem pelo cenário.'
      : 'Não deu para buscar o histórico do Banco Central. Os valores saem pelo cenário.';
  }
  const partes: string[] = [];
  if (faltando.length > 0) partes.push(`Faltou parte do histórico (${listarFaltando(faltando)}), e nesses períodos o valor sai pelo cenário.`);
  else if (ctx.lacunas > 0) {
    partes.push(ctx.lacunas === 1
      ? 'Faltou 1 dia útil do CDI no histórico, e nele o valor sai pelo cenário.'
      : `Faltaram ${ctx.lacunas} dias úteis do CDI no histórico, e neles o valor sai pelo cenário.`);
  }
  if (limitado) partes.push(`O histórico cobre só os últimos 10 anos, desde ${dataBR(inicio)}. Antes disso, vale o cenário.`);
  if (partes.length === 0) partes.push(`Valores calculados com o histórico do Banco Central até ${dataBR(series.ultimaData)}.`);
  return partes.join(' ');
}

/** "+0,52%" ou "−1,3%": a diferença do extrato com o sinal. */
const comSinal = (d: number) => (d > 0 ? `+${formatarPercentual(d)}` : formatarPercentual(d));

/** "Extrato de 01/09/2026 (bruto): R$ X. O app calcula R$ Y nessa data, uma diferença de +0,2%." */
export function textoDoExtrato(e: ConferenciaExtrato): string {
  const base = e.base === 'BRUTO' ? 'bruto' : 'líquido';
  return `Extrato de ${dataBR(e.data)} (${base}): ${formatarMoeda(e.valor)}. O app calcula ${formatarMoeda(e.calculado)} nessa data, uma diferença de ${comSinal(e.diferencaPercentual)}.`;
}

/** O alerta de um conglomerado da carteira acima do limite: hoje, ou a data do cruzamento. */
export function textoDoLimiteNaCarteira(a: AlertaFGC, hoje: string): string {
  if (a.data === hoje) {
    return `O total no conglomerado ${a.conglomerado} já passa do limite do FGC hoje: ${formatarMoeda(a.total)}, ${formatarMoeda(a.excedente)} acima do que o FGC cobre.`;
  }
  const noFim = a.fim === a.data ? '' : ` e chega a ${formatarMoeda(a.totalNoFim)} em ${dataBR(a.fim)}, ${formatarMoeda(a.excedenteNoFim)} acima do que o FGC cobre`;
  return `O total no conglomerado ${a.conglomerado} passa do limite do FGC em ${dataBR(a.data)}${noFim}.`;
}

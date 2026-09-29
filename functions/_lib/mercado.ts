import { ehDiaUtil } from '../../src/engine/calendario';
import { somarDias, type DataISO } from '../../src/engine/datas';

/** Ticker no padrão B3: 4 letras maiúsculas seguidas de 1 ou 2 números. */
const REGEX_TICKER = /^[A-Z]{4}[0-9]{1,2}$/;

export function validarTicker(ticker: string): boolean {
  return REGEX_TICKER.test(ticker);
}

const FUSO_BRT_HORAS = -3;
const ABERTURA_HORA_BRT = 10;
const FECHAMENTO_HORA_BRT = 18;

function horaBRT(data: Date): number {
  return (data.getUTCHours() + FUSO_BRT_HORAS + 24) % 24;
}

function ehFimDeSemanaBRT(data: Date): boolean {
  // getUTCDay() de um instante 3h atrás cobre o "dia BRT" corretamente perto da virada.
  const diaBRT = new Date(data.getTime() + FUSO_BRT_HORAS * 60 * 60 * 1000).getUTCDay();
  return diaBRT === 0 || diaBRT === 6;
}

/** Próxima abertura (10h BRT) de um dia útil, ignorando feriados (aproximação aceitável para TTL de cache). */
function proximaAberturaUTC(data: Date): Date {
  // 10h BRT = 13h UTC (BRT = UTC-3). Ancora no dia UTC do instante `data` e ajusta a partir daí,
  // pra evitar que setUTCHours mude o "dia" errado perto da virada UTC/BRT.
  let candidato = new Date(Date.UTC(
    data.getUTCFullYear(),
    data.getUTCMonth(),
    data.getUTCDate(),
    ABERTURA_HORA_BRT - FUSO_BRT_HORAS,
    0, 0, 0,
  ));
  if (candidato <= data) candidato = new Date(candidato.getTime() + 24 * 60 * 60 * 1000);
  while (ehFimDeSemanaBRT(candidato)) candidato = new Date(candidato.getTime() + 24 * 60 * 60 * 1000);
  return candidato;
}

/**
 * TTL (em segundos) do cache de cotação: 30 minutos em pregão (dia útil, 10h-18h BRT), ou até a
 * próxima abertura fora disso. Não considera feriados (só fins de semana) — aproximação aceitável
 * pra um TTL de cache, nunca pra uma regra de negócio de verdade.
 */
export function segundosAteProximoBoundary(agora: Date): number {
  const hora = horaBRT(agora);
  const emPregao = !ehFimDeSemanaBRT(agora) && hora >= ABERTURA_HORA_BRT && hora < FECHAMENTO_HORA_BRT;
  if (emPregao) return 30 * 60;
  return Math.round((proximaAberturaUTC(agora).getTime() - agora.getTime()) / 1000);
}

/** O último dia útil anterior a `data` (não inclui `data`). */
function ultimoDiaUtilAntesDe(data: DataISO): DataISO {
  let d = somarDias(data, -1);
  while (!ehDiaUtil(d)) d = somarDias(d, -1);
  return d;
}

/**
 * Se o histórico salvo (`metaAte`) já cobre o último pregão fechado antes de `hoje`, não precisa
 * atualizar — o fechamento de hoje só existe depois que o pregão de hoje encerra, então o alvo é
 * sempre o último dia útil anterior a `hoje`, nunca `hoje` em si.
 */
export function precisaAtualizarHistorico(metaAte: DataISO | null, hoje: DataISO): boolean {
  if (metaAte === null) return true;
  return metaAte < ultimoDiaUtilAntesDe(hoje);
}

/** Orçamento do dia: o que resta no mês, dividido pelos dias que faltam, sem passar do teto. Nunca negativo. */
export function orcamentoDiario(usoMensalAteAgora: number, diasRestantesNoMes: number, teto: number): number {
  const restanteNoMes = Math.max(0, 15000 - usoMensalAteAgora);
  return Math.min(teto, Math.floor(restanteNoMes / diasRestantesNoMes));
}

// Textos da aba "Renda variável" (M4b2c). Rascunho: a revisão editorial passa pelo /vozmax antes do PR.
import type { ErroMercado } from '../dados/mercado';
import type { ResultadoSessao } from '../dados/turnstile';

export const TITULO_RENDA_VARIAVEL = 'Renda variável';
export const INTRO_RENDA_VARIAVEL = 'Digite o código de um ativo da B3 para ver como ele se comportou no histórico disponível, ao lado de CDI e IPCA no mesmo período.';
export const AVISO_TURNSTILE = 'Algumas áreas usam Cloudflare Turnstile pra bloquear tráfego automatizado, sem exigir login. Ele analisa sinais do navegador, sem usar cookies de rastreamento.';
export const NAO_INDICA = 'O app não indica ações, fundos ou outros ativos.';
export const HISTORICO_CURTO = 'Histórico ainda curto: ele cresce com o tempo.';
export const PREGOES_MINIMOS_HISTORICO = 60;
export const VERIFICANDO_ACESSO = 'Verificando o acesso…';
export const CONSULTANDO = 'Consultando o histórico…';

export const ERRO_TICKER = 'Código inválido. Use 4 letras e 1 ou 2 números, como PETR4 ou HGLG11.';
export const SEM_HISTORICO_CDI_IPCA = 'Carregando o histórico de CDI e IPCA para comparar. Se não aparecer, o Banco Central pode estar fora do ar.';
export const SEM_DADOS = 'Ainda não há histórico suficiente para esse código.';

export function textoErroSessao(erro: Extract<ResultadoSessao, { ok: false }>['erro']): string {
  return erro === 'TURNSTILE_INVALIDO'
    ? 'Não foi possível confirmar que você não é um robô. Tente de novo.'
    : 'A verificação de acesso está indisponível agora. Tente de novo em instantes.';
}

export function textoErroMercado(erro: ErroMercado): string {
  if (erro === 'TICKER_INVALIDO') return ERRO_TICKER;
  if (erro === 'SEM_SESSAO') return 'Sua sessão expirou e não foi possível renová-la. Tente de novo.';
  return 'Os dados de mercado estão indisponíveis agora. Tente de novo em instantes.';
}

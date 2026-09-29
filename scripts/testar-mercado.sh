#!/usr/bin/env bash
# scripts/testar-mercado.sh
#
# Smoke test manual de functions/api/mercado/cotacao.ts, functions/api/mercado/historico.ts
# e functions/status.ts (M4b2b). Roda uma vez, à mão, contra `wrangler pages dev` — não faz
# parte da suíte automatizada.
#
# Pré-requisito: `wrangler pages dev` rodando em outro terminal:
#   npx wrangler pages dev dist --port 8788
# com um .dev.vars assim (chaves de teste da Cloudflare + token real da brapi, nunca produção):
#   TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
#   SESSION_HMAC_KEY=qualquer-texto-para-teste-local
#   BRAPI_TOKEN=<token real, copiado do .env do projeto>
#
# Para confirmar o cache na chamada 4, acompanhe os logs do `wrangler pages dev` no outro
# terminal: a chamada 3 deve mostrar uma requisição de saída para brapi.dev, a chamada 4 não.
#
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8788}"
TOKEN_TESTE_SEMPRE_PASSA="XXXX.DUMMY.TOKEN.XXXX"

echo "1) POST /api/sessao com token de teste (sempre passa) -> espera 200 + Set-Cookie"
RESPOSTA=$(curl -s -i -X POST "$BASE_URL/api/sessao" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN_TESTE_SEMPRE_PASSA\"}")
echo "$RESPOSTA"

COOKIE=$(echo "$RESPOSTA" | grep -i '^set-cookie:' | sed -E 's/set-cookie: ?(sessao=[^;]+);.*/\1/I' | tr -d '\r')
if [ -z "$COOKIE" ]; then
  echo "Nao recebi Set-Cookie. Confira o .dev.vars (TURNSTILE_SECRET_KEY deve ser a secret key de teste pareada com o token acima)." >&2
  exit 1
fi

echo
echo "2) GET /api/mercado/cotacao?ticker=PETR4 com cookie -> espera 200 com preco real (1a chamada, sem cache)"
curl -s -w "\nstatus: %{http_code}\n" "$BASE_URL/api/mercado/cotacao?ticker=PETR4" -H "Cookie: $COOKIE"

echo
echo "3) GET /api/mercado/historico?ticker=PETR4 com cookie -> espera 200 com candles"
curl -s -w "\nstatus: %{http_code}\n" "$BASE_URL/api/mercado/historico?ticker=PETR4" -H "Cookie: $COOKIE"

echo
echo "4) GET /api/mercado/cotacao?ticker=PETR4 de novo, imediatamente -> espera 200 servido do cache"
echo "   (confirme nos logs do wrangler pages dev que NAO houve nova chamada a brapi.dev)"
curl -s -w "\nstatus: %{http_code}\n" "$BASE_URL/api/mercado/cotacao?ticker=PETR4" -H "Cookie: $COOKIE"

echo
echo "5) GET /api/mercado/cotacao?ticker=xyz (ticker invalido) -> espera 400"
curl -s -w "\nstatus: %{http_code}\n" "$BASE_URL/api/mercado/cotacao?ticker=xyz" -H "Cookie: $COOKIE"

echo
echo "6) GET /status sem cookie -> espera 200"
curl -s -w "\nstatus: %{http_code}\n" "$BASE_URL/status"

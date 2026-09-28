#!/usr/bin/env bash
# scripts/testar-sessao.sh
#
# Smoke test manual de functions/api/sessao.ts e functions/api/saude.ts.
# Roda uma vez, à mão, contra `wrangler pages dev` — não faz parte da suíte
# automatizada (a suíte cobre a lógica pura em tests/functions/sessao.test.ts).
#
# Pré-requisito: `wrangler pages dev` rodando em outro terminal:
#   npx wrangler pages dev dist --port 8788
# com um .dev.vars assim (chaves de teste da Cloudflare, nunca as de produção):
#   TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
#   SESSION_HMAC_KEY=qualquer-texto-para-teste-local
#
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8788}"
TOKEN_TESTE_SEMPRE_PASSA="XXXX.DUMMY.TOKEN.XXXX"

echo "1) GET /api/saude sem cookie -> espera 401"
curl -s -o /dev/stderr -w "\nstatus: %{http_code}\n" "$BASE_URL/api/saude"

echo
echo "2) POST /api/sessao com token de teste (sempre passa) -> espera 200 + Set-Cookie"
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
echo "3) GET /api/saude com o cookie recebido -> espera 200"
curl -s -o /dev/stderr -w "\nstatus: %{http_code}\n" "$BASE_URL/api/saude" -H "Cookie: $COOKIE"

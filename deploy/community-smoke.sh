#!/bin/sh
set -eu

usage() {
  printf '%s\n' "Usage: sh deploy/community-smoke.sh https://example.com" >&2
  printf '%s\n' "Optional: COMMUNITY_SMOKE_EMAIL/PASSWORD and REQUIRE_AUTH_SMOKE=1" >&2
  printf '%s\n' "The final check deliberately sends only malformed empty register bodies to prove HTTP 429." >&2
}

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

pass() {
  printf 'PASS: %s\n' "$*"
}

[ "$#" -le 1 ] || {
  usage
  exit 2
}

SMOKE_BASE_URL=${1:-${BASE_URL:-}}
[ -n "$SMOKE_BASE_URL" ] || {
  usage
  exit 2
}
SMOKE_BASE_URL=${SMOKE_BASE_URL%/}
case "$SMOKE_BASE_URL" in
  http://*|https://*) ;;
  *) fail "BASE_URL must be an http(s) origin" ;;
esac

authority=${SMOKE_BASE_URL#*://}
case "$authority" in
  ''|*/*|*@*|*'?'*|*'#'*) fail "BASE_URL must not contain credentials, path, query or fragment" ;;
esac

for tool in curl grep sed mktemp; do
  command -v "$tool" >/dev/null 2>&1 || fail "$tool is required"
done

SMOKE_TMP=$(mktemp -d "${TMPDIR:-/tmp}/webfish-community-smoke.XXXXXX") ||
  fail "unable to create temporary directory"
trap 'rm -rf -- "$SMOKE_TMP"' EXIT HUP INT TERM

request_number=0

request() {
  method=$1
  path=$2
  expected=$3
  body_file=$4
  header_file=$5
  request_number=$((request_number + 1))

  status=$(curl \
    --silent \
    --show-error \
    --compressed \
    --connect-timeout 5 \
    --max-time 20 \
    --request "$method" \
    --user-agent 'WebFish-community-smoke/1.0' \
    --dump-header "$header_file" \
    --output "$body_file" \
    --write-out '%{http_code}' \
    "$SMOKE_BASE_URL$path") || fail "$method $path request failed"

  [ "$status" = "$expected" ] ||
    fail "$method $path returned HTTP $status, expected $expected"
  pass "$method $path -> HTTP $status"
}

request_status() {
  method=$1
  path=$2
  body_file=$3
  header_file=$4
  shift 4

  status=$(curl \
    --silent \
    --show-error \
    --compressed \
    --connect-timeout 5 \
    --max-time 20 \
    --request "$method" \
    --user-agent 'WebFish-community-smoke/1.0' \
    --dump-header "$header_file" \
    --output "$body_file" \
    --write-out '%{http_code}' \
    "$SMOKE_BASE_URL$path") || fail "$method $path request failed"

  for expected in "$@"; do
    if [ "$status" = "$expected" ]; then
      pass "$method $path -> HTTP $status"
      return 0
    fi
  done
  fail "$method $path returned unexpected HTTP $status"
}

require_header() {
  file=$1
  regex=$2
  label=$3
  grep -Eiq "$regex" "$file" || fail "$label header is missing or unsafe"
  pass "$label header"
}

assert_origin_rejected() {
  path=$1
  label=$2
  origin=$3
  safe_name=$(printf '%s-%s' "$label" "$origin" | sed 's#[^A-Za-z0-9]#-#g')
  request_number=$((request_number + 1))

  if [ "$origin" = missing ]; then
    status=$(curl \
      --silent \
      --show-error \
      --compressed \
      --connect-timeout 5 \
      --max-time 20 \
      --request POST \
      --header 'Content-Type: application/json' \
      --data-binary '{}' \
      --dump-header "$SMOKE_TMP/origin-${safe_name}.headers" \
      --output "$SMOKE_TMP/origin-${safe_name}.json" \
      --write-out '%{http_code}' \
      "$SMOKE_BASE_URL$path") || fail "$label missing-Origin request failed"
  else
    status=$(curl \
      --silent \
      --show-error \
      --compressed \
      --connect-timeout 5 \
      --max-time 20 \
      --request POST \
      --header 'Content-Type: application/json' \
      --header 'Origin: https://attacker.invalid' \
      --data-binary '{}' \
      --dump-header "$SMOKE_TMP/origin-${safe_name}.headers" \
      --output "$SMOKE_TMP/origin-${safe_name}.json" \
      --write-out '%{http_code}' \
      "$SMOKE_BASE_URL$path") || fail "$label untrusted-Origin request failed"
  fi

  [ "$status" = 403 ] ||
    fail "$label with $origin Origin returned HTTP $status, expected 403"
  grep -Eq '"code"[[:space:]]*:[[:space:]]*"UNTRUSTED_ORIGIN"' \
    "$SMOKE_TMP/origin-${safe_name}.json" ||
    fail "$label with $origin Origin did not return UNTRUSTED_ORIGIN"
  pass "$label rejects $origin Origin before credential processing"
}

request GET /healthz 200 "$SMOKE_TMP/healthz.json" "$SMOKE_TMP/healthz.headers"
grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' "$SMOKE_TMP/healthz.json" ||
  fail "/healthz response is not the expected JSON"

request GET /api/health 200 "$SMOKE_TMP/api-health.json" "$SMOKE_TMP/api-health.headers"
request GET /api/health/ready 200 "$SMOKE_TMP/api-ready.json" "$SMOKE_TMP/api-ready.headers"

for path in \
  / \
  /login \
  /register \
  /news \
  /community \
  /farm \
  /ledou \
  /feed \
  /invite \
  /me \
  /friends \
  /community-guidelines \
  /tools \
  /games \
  /privacy-policy \
  /terms-of-service; do
  safe_name=$(printf '%s' "$path" | sed 's#[^A-Za-z0-9]#-#g')
  request GET "$path" 200 "$SMOKE_TMP/spa${safe_name}.html" "$SMOKE_TMP/spa${safe_name}.headers"
done

require_header "$SMOKE_TMP/spa-.headers" '^x-content-type-options:[[:space:]]*nosniff' 'nosniff'
require_header "$SMOKE_TMP/spa-.headers" '^x-frame-options:[[:space:]]*deny' 'frame denial'
require_header "$SMOKE_TMP/spa-.headers" '^referrer-policy:[[:space:]]*strict-origin-when-cross-origin' 'referrer policy'
require_header "$SMOKE_TMP/spa-.headers" '^content-security-policy:.*connect-src.*wss:' 'community CSP'
require_header "$SMOKE_TMP/spa-.headers" '^x-webfish-site-mode:[[:space:]]*community' 'community mode marker'
case "$SMOKE_BASE_URL" in
  https://*) require_header "$SMOKE_TMP/spa-.headers" '^strict-transport-security:[[:space:]]*max-age=' 'HSTS' ;;
esac
require_header "$SMOKE_TMP/api-health.headers" '^cache-control:[[:space:]]*no-store' 'API no-store'

# Cookie-creating endpoints must reject the request before parsing credentials. Empty bodies
# ensure this contract check cannot log in, consume a Beta code or send verification mail.
for auth_path_and_label in \
  '/api/v1/auth/account/register|account-register' \
  '/api/v1/auth/account/login|account-login' \
  '/api/v1/auth/login|login' \
  '/api/v1/auth/verify-email|verify-email'; do
  auth_path=${auth_path_and_label%%|*}
  auth_label=${auth_path_and_label#*|}
  assert_origin_rejected "$auth_path" "$auth_label" missing
  assert_origin_rejected "$auth_path" "$auth_label" hostile
done

# 认证路由必须存在，但未登录不能取得本人数据。
request_status GET /api/v1/me "$SMOKE_TMP/me.json" "$SMOKE_TMP/me.headers" 401 403
request_status GET /api/v1/guilds/me "$SMOKE_TMP/guild-me.json" "$SMOKE_TMP/guild-me.headers" 401 403

# 旧 full 站的上传、阅读、便签、偏好、工具目录和旧鉴权入口必须在代理层返回 404。
for path in \
  /api \
  /api/documents \
  /api/reading/test/article \
  /api/memo \
  /api/preferences \
  /api/tools \
  /api/skins \
  /api/auth/me \
  /api/v1/documents; do
  safe_name=$(printf '%s' "$path" | sed 's#[^A-Za-z0-9]#-#g')
  request GET "$path" 404 "$SMOKE_TMP/blocked${safe_name}.json" "$SMOKE_TMP/blocked${safe_name}.headers"
done
request POST /api/documents 404 "$SMOKE_TMP/blocked-upload.json" "$SMOKE_TMP/blocked-upload.headers"
request GET /ws 404 "$SMOKE_TMP/blocked-ws-root.json" "$SMOKE_TMP/blocked-ws-root.headers"
request GET /socket.io 404 "$SMOKE_TMP/blocked-socket-io.json" "$SMOKE_TMP/blocked-socket-io.headers"

# Upgrade 必须到达 API，而不是回落成 SPA 200。未授权/未开放时可安全拒绝。
ws_status=$(curl \
  --silent \
  --show-error \
  --http1.1 \
  --connect-timeout 5 \
  --max-time 20 \
  --header 'Connection: Upgrade' \
  --header 'Upgrade: websocket' \
  --header 'Sec-WebSocket-Version: 13' \
  --header 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  --output "$SMOKE_TMP/ws.body" \
  --write-out '%{http_code}' \
  "$SMOKE_BASE_URL/ws/chat") || fail "WebSocket routing check failed"
case "$ws_status" in
  400|401|403|404|426) pass "WebSocket path reaches a fail-closed API response -> HTTP $ws_status" ;;
  *) fail "WebSocket path returned HTTP $ws_status; it may have fallen back to the SPA" ;;
esac

SMOKE_EMAIL=${COMMUNITY_SMOKE_EMAIL:-}
SMOKE_PASSWORD=${COMMUNITY_SMOKE_PASSWORD:-}
REQUIRE_AUTH_SMOKE=${REQUIRE_AUTH_SMOKE:-0}
if [ -n "$SMOKE_EMAIL" ] || [ -n "$SMOKE_PASSWORD" ]; then
  [ -n "$SMOKE_EMAIL" ] && [ -n "$SMOKE_PASSWORD" ] ||
    fail "COMMUNITY_SMOKE_EMAIL and COMMUNITY_SMOKE_PASSWORD must be set together"
  case "$SMOKE_BASE_URL" in
    https://*) ;;
    *) fail "authenticated cookie smoke requires an HTTPS BASE_URL" ;;
  esac
  printf '%s\n' "$SMOKE_EMAIL" | grep -Eq '^[^[:space:]"@]+@[^[:space:]"@]+\.[^[:space:]"@]+$' ||
    fail "COMMUNITY_SMOKE_EMAIL has unsafe characters"
  case "$SMOKE_PASSWORD" in
    *[!A-Za-z0-9._~:@%+=,-]*) fail "COMMUNITY_SMOKE_PASSWORD has unsafe shell/JSON characters" ;;
  esac
  login_json=$(printf '{"email":"%s","password":"%s"}' "$SMOKE_EMAIL" "$SMOKE_PASSWORD")
  login_status=$(curl \
    --silent \
    --show-error \
    --compressed \
    --connect-timeout 5 \
    --max-time 20 \
    --request POST \
    --header 'Content-Type: application/json' \
    --header "Origin: $SMOKE_BASE_URL" \
    --data-binary "$login_json" \
    --cookie-jar "$SMOKE_TMP/cookies.txt" \
    --dump-header "$SMOKE_TMP/login.headers" \
    --output "$SMOKE_TMP/login.json" \
    --write-out '%{http_code}' \
    "$SMOKE_BASE_URL/api/v1/auth/login") || fail "authenticated login smoke failed"
  [ "$login_status" = 200 ] || fail "login smoke returned HTTP $login_status"
  grep -Eq '"accessToken"[[:space:]]*:[[:space:]]*"[^"[:space:]]+"' "$SMOKE_TMP/login.json" ||
    fail "login response is missing an access token"
  refresh_cookie=$(grep -E '^[Ss]et-[Cc]ookie:[[:space:]]*__Host-zbrs_refresh=' "$SMOKE_TMP/login.headers" || true)
  [ -n "$refresh_cookie" ] || fail "login did not issue __Host-zbrs_refresh"
  printf '%s\n' "$refresh_cookie" | grep -Eiq '(^|;[[:space:]]*)Secure([;[:space:]]|$)' ||
    fail "refresh cookie is missing Secure"
  printf '%s\n' "$refresh_cookie" | grep -Eiq '(^|;[[:space:]]*)HttpOnly([;[:space:]]|$)' ||
    fail "refresh cookie is missing HttpOnly"
  printf '%s\n' "$refresh_cookie" | grep -Eiq 'SameSite=Strict' ||
    fail "refresh cookie is missing SameSite=Strict"
  printf '%s\n' "$refresh_cookie" | grep -Eiq 'Path=/([;[:space:]]|$)' ||
    fail "__Host- refresh cookie is missing Path=/"
  if printf '%s\n' "$refresh_cookie" | grep -Eiq 'Domain='; then
    fail "refresh cookie must remain host-only and not set Domain"
  fi
  pass "authenticated refresh-cookie attributes"

  missing_origin_status=$(curl \
    --silent \
    --show-error \
    --compressed \
    --connect-timeout 5 \
    --max-time 20 \
    --request POST \
    --cookie "$SMOKE_TMP/cookies.txt" \
    --output "$SMOKE_TMP/refresh-no-origin.json" \
    --write-out '%{http_code}' \
    "$SMOKE_BASE_URL/api/v1/auth/refresh") || fail "refresh Origin rejection smoke failed"
  [ "$missing_origin_status" = 403 ] ||
    fail "refresh without Origin returned HTTP $missing_origin_status, expected 403"
  pass "refresh rejects a missing Origin"

  refresh_status=$(curl \
    --silent \
    --show-error \
    --compressed \
    --connect-timeout 5 \
    --max-time 20 \
    --request POST \
    --header "Origin: $SMOKE_BASE_URL" \
    --cookie "$SMOKE_TMP/cookies.txt" \
    --cookie-jar "$SMOKE_TMP/cookies.txt" \
    --output "$SMOKE_TMP/refresh.json" \
    --write-out '%{http_code}' \
    "$SMOKE_BASE_URL/api/v1/auth/refresh") || fail "authenticated refresh smoke failed"
  [ "$refresh_status" = 200 ] || fail "refresh smoke returned HTTP $refresh_status"
  grep -Eq '"accessToken"[[:space:]]*:[[:space:]]*"[^"[:space:]]+"' "$SMOKE_TMP/refresh.json" ||
    fail "refresh response is missing an access token"
  pass "refresh rotates the authenticated session"

  logout_status=$(curl \
    --silent \
    --show-error \
    --compressed \
    --connect-timeout 5 \
    --max-time 20 \
    --request POST \
    --header "Origin: $SMOKE_BASE_URL" \
    --cookie "$SMOKE_TMP/cookies.txt" \
    --output "$SMOKE_TMP/logout.body" \
    --write-out '%{http_code}' \
    "$SMOKE_BASE_URL/api/v1/auth/logout") || fail "authenticated logout smoke failed"
  [ "$logout_status" = 204 ] || fail "logout smoke returned HTTP $logout_status"
  pass "dedicated smoke session logged out"
elif [ "$REQUIRE_AUTH_SMOKE" = 1 ]; then
  fail "REQUIRE_AUTH_SMOKE=1 requires the two COMMUNITY_SMOKE_* values"
else
  printf 'SKIP: authenticated cookie smoke (set REQUIRE_AUTH_SMOKE=1 for release acceptance)\n'
fi

# 在所有真实账号检查结束后再耗尽 register 的 IP burst。请求体固定为空，因而不会
# 查询账号、执行 bcrypt、发送邮件或创建会话；入口应在有限次数内返回 429。
rate_limited=0
rate_attempt=1
while [ "$rate_attempt" -le 10 ]; do
  request_number=$((request_number + 1))
  rate_headers="$SMOKE_TMP/register-rate-${rate_attempt}.headers"
  rate_body="$SMOKE_TMP/register-rate-${rate_attempt}.json"
  rate_status=$(curl \
    --silent \
    --show-error \
    --compressed \
    --connect-timeout 5 \
    --max-time 20 \
    --request POST \
    --header 'Content-Type: application/json' \
    --data-binary '{}' \
    --dump-header "$rate_headers" \
    --output "$rate_body" \
    --write-out '%{http_code}' \
    "$SMOKE_BASE_URL/api/v1/auth/register") || fail "register rate-limit request failed"

  if [ "$rate_status" = 429 ]; then
    require_header "$rate_headers" '^retry-after:[[:space:]]*[1-9][0-9]*' 'register 429 Retry-After'
    grep -Eq '"code"[[:space:]]*:[[:space:]]*"RATE_LIMITED"' "$rate_body" ||
      fail "register 429 response is missing RATE_LIMITED"
    rate_limited=1
    break
  fi
  case "$rate_status" in
    400|403) ;;
    *) fail "malformed register rate-limit probe returned HTTP $rate_status before 429" ;;
  esac
  rate_attempt=$((rate_attempt + 1))
done
[ "$rate_limited" -eq 1 ] ||
  fail "register limiter did not return HTTP 429 within 10 harmless malformed requests"
pass "register limiter rejects a harmless burst with HTTP 429"

printf 'Community smoke passed with %s HTTP checks.\n' "$request_number"

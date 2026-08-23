#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE=${1:-"$ROOT_DIR/.env.community"}
COMPOSE_FILE=deploy/docker-compose.community.yml
COMPOSE_PROJECT=webfish-community
ERRORS=0

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  ERRORS=$((ERRORS + 1))
}

warn() {
  printf 'WARN: %s\n' "$*" >&2
}

env_value() {
  key=$1
  sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1 | tr -d '\r'
}

check_single_key() {
  key=$1
  count=$(grep -c "^${key}=" "$ENV_FILE" || true)
  [ "$count" -eq 1 ] || fail "$key must appear exactly once in $ENV_FILE"
}

check_required_text() {
  key=$1
  check_single_key "$key"
  value=$(env_value "$key")
  meaningful=$(printf '%s\n' "$value" | sed "s/[[:space:]\"']//g")
  case "$value" in
    ''|*example.com*|*待配置*|*请填写*|*replace-with*|*your-*|*change-me*)
      fail "$key is empty or still uses a placeholder"
      ;;
  esac
  [ -n "$meaningful" ] || fail "$key cannot contain only whitespace or quotes"
}

check_secret() {
  key=$1
  minimum=$2
  maximum=$3
  check_single_key "$key"
  value=$(env_value "$key")
  case "$value" in
    ''|*example*|*replace-with*|*change-me*|*password*|*secret*)
      fail "$key is empty or uses a published placeholder"
      return
      ;;
  esac
  length=${#value}
  [ "$length" -ge "$minimum" ] && [ "$length" -le "$maximum" ] ||
    fail "$key length must be between $minimum and $maximum characters"
  case "$value" in
    *[!A-Za-z0-9._~%+=,-]*)
      fail "$key must use unquoted URL/env-safe characters without spaces, colon, slash or @"
      ;;
  esac
}

check_boolean() {
  key=$1
  check_single_key "$key"
  case "$(env_value "$key")" in
    true|false) ;;
    *) fail "$key must be exactly true or false" ;;
  esac
}

check_base64url_32() {
  key=$1
  check_single_key "$key"
  value=$(env_value "$key")
  printf '%s\n' "$value" | grep -Eq '^[A-Za-z0-9_-]{43}$' ||
    fail "$key must be an unpadded 32-byte base64url value (43 characters)"
}

check_email() {
  key=$1
  check_required_text "$key"
  printf '%s\n' "$(env_value "$key")" |
    grep -Eq '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' ||
    fail "$key must be a plain email address"
}

[ -f "$ENV_FILE" ] || {
  printf 'ERROR: env file not found: %s\n' "$ENV_FILE" >&2
  exit 1
}

for file in \
  Dockerfile \
  deploy/community.nginx.conf \
  deploy/Caddyfile.community \
  deploy/docker-compose.community.yml \
  deploy/.env.community.example \
  deploy/community-smoke.sh \
  deploy/community-migration-rehearsal.sh \
  deploy/COMMUNITY_DEPLOYMENT.md; do
  [ -f "$ROOT_DIR/$file" ] || fail "missing required community deployment file: $file"
done

[ -f "$ROOT_DIR/packages/backend/src/main.community.ts" ] ||
  fail "packages/backend/src/main.community.ts is missing"
grep -Fq "community" "$ROOT_DIR/packages/frontend/vite.config.ts" ||
  fail "frontend build configuration does not expose community mode"

AUTH_COOKIE_SOURCE="$ROOT_DIR/packages/backend/src/modules/auth/auth-cookie.ts"
AUTH_EMAIL_SOURCE="$ROOT_DIR/packages/backend/src/modules/auth/email-delivery.service.ts"
AUTH_CRYPTO_SOURCE="$ROOT_DIR/packages/backend/src/modules/auth/auth-crypto.ts"
AUTH_SERVICE_SOURCE="$ROOT_DIR/packages/backend/src/modules/auth/auth.service.ts"
SOCIAL_VERIFICATION_SOURCE="$ROOT_DIR/packages/backend/src/modules/auth/social-verification-provider.service.ts"
COMMUNITY_WRITE_GATE_SOURCE="$ROOT_DIR/packages/backend/src/modules/community/community-write-gate.ts"
CHAT_MODERATION_SOURCE="$ROOT_DIR/packages/backend/src/modules/chat/chat-moderation.service.ts"
CHAT_REALTIME_SOURCE="$ROOT_DIR/packages/backend/src/modules/chat/chat-realtime.service.ts"
for file in \
  "$AUTH_COOKIE_SOURCE" \
  "$AUTH_EMAIL_SOURCE" \
  "$AUTH_CRYPTO_SOURCE" \
  "$AUTH_SERVICE_SOURCE" \
  "$SOCIAL_VERIFICATION_SOURCE" \
  "$COMMUNITY_WRITE_GATE_SOURCE" \
  "$CHAT_MODERATION_SOURCE" \
  "$CHAT_REALTIME_SOURCE"; do
  [ -f "$file" ] || fail "missing community auth deployment contract source: $file"
done
grep -Fq "'__Host-zbrs_refresh'" "$AUTH_COOKIE_SOURCE" ||
  fail "production backend must use a __Host- refresh-cookie name"
grep -Fq "sameSite: 'strict'" "$AUTH_COOKIE_SOURCE" ||
  fail "backend refresh cookie must remain SameSite=Strict or deploy policy must be reviewed"
grep -Eq "^[[:space:]]*path: '/',?[[:space:]]*$" "$AUTH_COOKIE_SOURCE" ||
  fail "backend __Host- refresh cookie must remain scoped to /"
grep -Fq 'AUTH_EMAIL_WEBHOOK_URL' "$AUTH_EMAIL_SOURCE" &&
grep -Fq 'AUTH_EMAIL_WEBHOOK_TOKEN' "$AUTH_EMAIL_SOURCE" ||
  fail "deploy email variables no longer match the backend adapter"
grep -Fq 'AUTH_TOKEN_PEPPER' "$AUTH_CRYPTO_SOURCE" ||
  fail "deploy auth pepper variable no longer matches the backend implementation"
grep -Fq 'FEATURE_REGISTRATION_ENABLED' "$AUTH_SERVICE_SOURCE" ||
  fail "backend no longer consumes FEATURE_REGISTRATION_ENABLED"
grep -Fq 'FEATURE_COMMUNITY_WRITES_ENABLED' "$COMMUNITY_WRITE_GATE_SOURCE" ||
  fail "backend no longer consumes FEATURE_COMMUNITY_WRITES_ENABLED"
grep -Fq 'SOCIAL_VERIFICATION_PROVIDER_NAME' "$SOCIAL_VERIFICATION_SOURCE" &&
grep -Fq 'SOCIAL_VERIFICATION_PROVIDER_SESSION_URL' "$SOCIAL_VERIFICATION_SOURCE" &&
grep -Fq 'SOCIAL_VERIFICATION_CALLBACK_URL' "$SOCIAL_VERIFICATION_SOURCE" &&
grep -Fq 'SOCIAL_VERIFICATION_PROVIDER_TOKEN' "$SOCIAL_VERIFICATION_SOURCE" &&
grep -Fq 'SOCIAL_VERIFICATION_CALLBACK_SECRET' "$SOCIAL_VERIFICATION_SOURCE" ||
  fail "deploy identity-provider variables no longer match the backend adapter"
grep -Fq 'CHAT_MODERATION_ENDPOINT' "$CHAT_MODERATION_SOURCE" &&
grep -Fq 'CHAT_MODERATION_API_TOKEN' "$CHAT_MODERATION_SOURCE" &&
grep -Fq 'CHAT_BUILTIN_MODERATION_ENABLED' "$CHAT_MODERATION_SOURCE" ||
  fail "deploy chat moderation variables no longer match the backend adapter"
grep -Fq 'REDIS_URL' "$CHAT_REALTIME_SOURCE" ||
  fail "deploy Redis URL no longer matches the chat realtime adapter"

grep -Eq '^FROM dependencies AS community-build$' "$ROOT_DIR/Dockerfile" ||
  fail "Dockerfile must define community-build"
grep -Eq '^FROM node:.* AS community-api$' "$ROOT_DIR/Dockerfile" ||
  fail "Dockerfile must define community-api"
grep -Eq '^FROM nginx:.* AS community-web$' "$ROOT_DIR/Dockerfile" ||
  fail "Dockerfile must define community-web"
grep -Fq 'packages/backend/dist/main.community.js' "$ROOT_DIR/Dockerfile" ||
  fail "community-api must start main.community.js"
grep -Fq '/app/packages/backend/node_modules ./packages/backend/node_modules' "$ROOT_DIR/Dockerfile" ||
  fail "community-api must copy workspace-scoped backend runtime dependencies"
for build_flag in \
  VITE_COMMUNITY_REGISTRATION_ENABLED \
  VITE_COMMUNITY_PASSWORD_RESET_ENABLED \
  VITE_COMMUNITY_SOCIAL_VERIFICATION_ENABLED \
  VITE_COMMUNITY_ACCOUNT_DELETION_ENABLED \
  VITE_COMMUNITY_PUBLIC_PROFILE_ENABLED \
  VITE_COMMUNITY_FRIENDS_ENABLED \
  VITE_COMMUNITY_INVITE_ENABLED \
  VITE_COMMUNITY_FEED_ENABLED \
  VITE_COMMUNITY_FARM_ENABLED \
  VITE_COMMUNITY_CONTENT_ENABLED \
  VITE_COMMUNITY_MODERATION_ENABLED \
  VITE_COMMUNITY_CHAT_ENABLED \
  VITE_COMMUNITY_NEWS_ENABLED \
  VITE_COMMUNITY_NEWS_ADMIN_ENABLED \
  VITE_COMMUNITY_LEDOU_ENABLED \
  VITE_COMMUNITY_BATTLE_SERVER_ENABLED; do
  grep -Fq "ARG ${build_flag}=" "$ROOT_DIR/Dockerfile" ||
    fail "Dockerfile does not declare $build_flag"
  grep -Fq "${build_flag}=\${${build_flag}}" "$ROOT_DIR/Dockerfile" ||
    fail "Dockerfile does not inject $build_flag into the community frontend build"
done
grep -Fq 'name: webfish-community' "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "$COMPOSE_FILE must keep the isolated webfish-community project name"
if grep -Fq 'webfish-review' "$ROOT_DIR/deploy/COMMUNITY_DEPLOYMENT.md"; then
  fail "community deployment commands must not reuse the legacy webfish-review project"
fi
grep -Fq -- '-p webfish-community' "$ROOT_DIR/deploy/COMMUNITY_DEPLOYMENT.md" ||
  fail "community deployment commands must explicitly use webfish-community"
grep -Fq -- '-p webfish-public' "$ROOT_DIR/deploy/COMMUNITY_DEPLOYMENT.md" ||
  fail "community rollback must explicitly restore the independent webfish-public project"

grep -Eq 'target:[[:space:]]*community-api' "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "$COMPOSE_FILE must build community-api"
grep -Eq 'target:[[:space:]]*community-web' "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "$COMPOSE_FILE must build community-web"
for service in postgres redis migrate api web gateway; do
  grep -Eq "^[[:space:]]{2}${service}:" "$ROOT_DIR/$COMPOSE_FILE" ||
    fail "$COMPOSE_FILE is missing service $service"
done
grep -Fq 'AUTH_REFRESH_COOKIE_NAME: __Host-zbrs_refresh' "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "community Compose must pin the production __Host- refresh-cookie name"
grep -Fq 'DB_LOGGING: "false"' "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "community Compose must hard-code DB_LOGGING=false in production"
grep -Fq 'PUBLIC_SITE_ORIGIN: https://${SITE_DOMAIN:?SITE_DOMAIN must be set}' \
  "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "community Compose must fail closed when PUBLIC_SITE_ORIGIN is unavailable"
grep -Fq 'AUTH_EMAIL_WEBHOOK_URL: ${AUTH_EMAIL_WEBHOOK_URL:?AUTH_EMAIL_WEBHOOK_URL must be set}' \
  "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "community Compose must require the implemented email webhook URL"
grep -Fq 'AUTH_EMAIL_WEBHOOK_TOKEN: ${AUTH_EMAIL_WEBHOOK_TOKEN:?AUTH_EMAIL_WEBHOOK_TOKEN must be set}' \
  "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "community Compose must require the implemented email webhook token"
grep -Fq 'AUTH_EMAIL_OUTBOX_ENCRYPTION_KEY: ${AUTH_EMAIL_OUTBOX_ENCRYPTION_KEY:?AUTH_EMAIL_OUTBOX_ENCRYPTION_KEY must be set}' \
  "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "community Compose must require the auth email outbox encryption key"
grep -Fq 'AUTH_EMAIL_OUTBOX_PUMP_ENABLED: "true"' \
  "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "community API must keep the durable auth email retry pump enabled"
grep -Fq 'SOCIAL_VERIFICATION_PROVIDER_NAME: ${SOCIAL_VERIFICATION_PROVIDER_NAME:-}' \
  "$ROOT_DIR/$COMPOSE_FILE" &&
grep -Fq 'SOCIAL_VERIFICATION_PROVIDER_SESSION_URL: ${SOCIAL_VERIFICATION_PROVIDER_SESSION_URL:-}' \
  "$ROOT_DIR/$COMPOSE_FILE" &&
grep -Fq 'SOCIAL_VERIFICATION_CALLBACK_URL: ${SOCIAL_VERIFICATION_CALLBACK_URL:-}' \
  "$ROOT_DIR/$COMPOSE_FILE" &&
grep -Fq 'SOCIAL_VERIFICATION_PROVIDER_TOKEN: ${SOCIAL_VERIFICATION_PROVIDER_TOKEN:-}' \
  "$ROOT_DIR/$COMPOSE_FILE" &&
grep -Fq 'SOCIAL_VERIFICATION_CALLBACK_SECRET: ${SOCIAL_VERIFICATION_CALLBACK_SECRET:-}' \
  "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "community Compose must pass all social verification provider settings"
grep -Fq 'CHAT_MODERATION_ENDPOINT: ${CHAT_MODERATION_ENDPOINT:-}' \
  "$ROOT_DIR/$COMPOSE_FILE" &&
grep -Fq 'CHAT_MODERATION_API_TOKEN: ${CHAT_MODERATION_API_TOKEN:-}' \
  "$ROOT_DIR/$COMPOSE_FILE" &&
grep -Fq 'CHAT_BUILTIN_MODERATION_ENABLED: ${CHAT_BUILTIN_MODERATION_ENABLED:-false}' \
  "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "community Compose must pass chat moderation settings"
grep -Fq 'COMMUNITY_MAX_ACTIVE_USERS: ${COMMUNITY_MAX_ACTIVE_USERS:?COMMUNITY_MAX_ACTIVE_USERS must be set}' \
  "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "community Compose must require the global active-account capacity"
grep -Fq 'FEATURE_REGISTRATION_ENABLED: ${FEATURE_REGISTRATION_ENABLED:-false}' \
  "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "community Compose must pass the registration flag to the API"
grep -Fq 'VITE_COMMUNITY_REGISTRATION_ENABLED: ${FEATURE_REGISTRATION_ENABLED:-false}' \
  "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "community frontend and API registration flags must use the same source"
grep -Fq 'VITE_SITE_OPERATOR: ""' "$ROOT_DIR/$COMPOSE_FILE" &&
grep -Fq 'VITE_SITE_CONTACT: ""' "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "community frontend build must not embed the operator name or personal contact"
if grep -Eq 'VITE_SITE_(OPERATOR|CONTACT): .*PRIVACY_' "$ROOT_DIR/$COMPOSE_FILE"; then
  fail "community frontend build leaks server-only privacy operator configuration"
fi
grep -Fq 'FEATURE_PASSWORD_RESET_ENABLED: ${FEATURE_PASSWORD_RESET_ENABLED:-false}' \
  "$ROOT_DIR/$COMPOSE_FILE" &&
grep -Fq 'VITE_COMMUNITY_PASSWORD_RESET_ENABLED: ${FEATURE_PASSWORD_RESET_ENABLED:-false}' \
  "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "password reset frontend and API flags must use the same source"
grep -Fq 'FEATURE_SOCIAL_VERIFICATION_ENABLED: ${FEATURE_SOCIAL_VERIFICATION_ENABLED:-false}' \
  "$ROOT_DIR/$COMPOSE_FILE" &&
grep -Fq 'VITE_COMMUNITY_SOCIAL_VERIFICATION_ENABLED: ${FEATURE_SOCIAL_VERIFICATION_ENABLED:-false}' \
  "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "social verification frontend and API flags must use the same source"
grep -Fq 'FEATURE_ACCOUNT_DELETION_ENABLED: ${FEATURE_ACCOUNT_DELETION_ENABLED:-false}' \
  "$ROOT_DIR/$COMPOSE_FILE" &&
grep -Fq 'VITE_COMMUNITY_ACCOUNT_DELETION_ENABLED: ${FEATURE_ACCOUNT_DELETION_ENABLED:-false}' \
  "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "account deletion frontend and API flags must use the same source"
grep -Fq 'FEATURE_COMMUNITY_CHAT_ENABLED: ${FEATURE_COMMUNITY_CHAT_ENABLED:-false}' \
  "$ROOT_DIR/$COMPOSE_FILE" &&
grep -Fq 'VITE_COMMUNITY_CHAT_ENABLED: ${FEATURE_COMMUNITY_CHAT_ENABLED:-false}' \
  "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "chat frontend and API flags must use the same source"
grep -Fq 'FEATURE_COMMUNITY_WRITES_ENABLED: ${FEATURE_COMMUNITY_WRITES_ENABLED:-false}' \
  "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "community Compose must pass the write flag to the API"
grep -Fq 'FEATURE_COMMUNITY_CONTENT_ENABLED: ${FEATURE_COMMUNITY_CONTENT_ENABLED:-false}' \
  "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "community Compose must pass the content flag to the API"
grep -Fq 'FEATURE_CONTENT_WRITES_ENABLED: ${FEATURE_COMMUNITY_CONTENT_WRITES_ENABLED:-false}' \
  "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "community Compose must pass the independent content write flag to the API"
grep -Fq 'FEATURE_MODERATION_OPERATIONS_ENABLED: ${FEATURE_COMMUNITY_MODERATION_ENABLED:-false}' \
  "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "community Compose must pass the moderation flag to the API"
grep -Fq 'FEATURE_CHAT_WRITES_ENABLED: ${FEATURE_COMMUNITY_CHAT_WRITES_ENABLED:-false}' \
  "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "community Compose must pass the independent chat write flag to the API"
grep -Fq 'FEATURE_COMMUNITY_NEWS_ENABLED: ${FEATURE_COMMUNITY_NEWS_ENABLED:-false}' \
  "$ROOT_DIR/$COMPOSE_FILE" &&
grep -Fq 'VITE_COMMUNITY_NEWS_ENABLED: ${FEATURE_COMMUNITY_NEWS_ENABLED:-false}' \
  "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "news frontend and API flags must use the same source"
grep -Fq 'VITE_COMMUNITY_NEWS_ADMIN_ENABLED: ${FEATURE_NEWS_ADMIN_ENABLED:-false}' \
  "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "news admin frontend and API flags must use the same source"
grep -Fq 'FEATURE_NEWS_ADMIN_ENABLED: ${FEATURE_NEWS_ADMIN_ENABLED:-false}' \
  "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "community Compose must pass the independent news admin flag"
grep -Fq 'FEATURE_COMMUNITY_BATTLE_ENABLED: ${FEATURE_COMMUNITY_BATTLE_ENABLED:-false}' \
  "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "community Compose must pass the battle flag to the API"
for frontend_flag in \
  VITE_COMMUNITY_PUBLIC_PROFILE_ENABLED \
  VITE_COMMUNITY_FRIENDS_ENABLED \
  VITE_COMMUNITY_INVITE_ENABLED \
  VITE_COMMUNITY_FEED_ENABLED \
  VITE_COMMUNITY_FARM_ENABLED; do
  grep -Fq "${frontend_flag}: \${FEATURE_COMMUNITY_WRITES_ENABLED:-false}" \
    "$ROOT_DIR/$COMPOSE_FILE" ||
    fail "$frontend_flag must use FEATURE_COMMUNITY_WRITES_ENABLED as its only Compose source"
done
grep -Fq 'VITE_COMMUNITY_CONTENT_ENABLED: ${FEATURE_COMMUNITY_CONTENT_ENABLED:-false}' \
  "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "community content frontend and API flags must use the same source"
grep -Fq 'VITE_COMMUNITY_MODERATION_ENABLED: ${FEATURE_COMMUNITY_MODERATION_ENABLED:-false}' \
  "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "moderation frontend and API flags must use the same source"
grep -Fq 'VITE_COMMUNITY_LEDOU_ENABLED: "true"' \
  "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "anonymous local office battle must remain available independently"
grep -Fq 'VITE_COMMUNITY_BATTLE_SERVER_ENABLED: ${FEATURE_COMMUNITY_BATTLE_ENABLED:-false}' \
  "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "server battle frontend and API flags must use the same source"
if grep -Eq 'SMTP_|DB_WORKER_POOL|community-worker|main\.worker\.js|^[[:space:]]{2}worker:' "$ROOT_DIR/$COMPOSE_FILE"; then
  fail "community Compose contains an unsupported mail or legacy worker setting"
fi
grep -Fq '127.0.0.1:${HTTP_PORT:-8080}:80' "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "community web port must remain loopback-only so X-Forwarded-For cannot be spoofed around Nginx limits"

grep -Fq 'proxy_cookie_flags __Host-zbrs_refresh secure httponly samesite=strict' \
  "$ROOT_DIR/deploy/community.nginx.conf" ||
  fail "community Nginx must harden the refresh cookie"
grep -Fq 'proxy_set_header Upgrade $http_upgrade' \
  "$ROOT_DIR/deploy/community.nginx.conf" ||
  fail "community Nginx must forward WebSocket Upgrade"
grep -Fq 'location /api/' "$ROOT_DIR/deploy/community.nginx.conf" ||
  fail "community Nginx must have a deny-by-default /api fallback"
if grep -E '^    location ~ .*\b(documents|reading|memo|preferences|tools|skins)\b' \
  "$ROOT_DIR/deploy/community.nginx.conf" >/dev/null; then
  fail "legacy private APIs must not appear in the community allowlist"
fi
for implemented_prefix in users friends friend-requests blocks referrals feeds farm notifications guilds; do
  grep -Eq "location ~ .*${implemented_prefix}" "$ROOT_DIR/deploy/community.nginx.conf" ||
    fail "implemented community API prefix is missing from Nginx allowlist: $implemented_prefix"
done
grep -Eq 'location ~ .*v1/.*chat' "$ROOT_DIR/deploy/community.nginx.conf" ||
  fail "implemented chat REST prefix is missing from the Nginx allowlist"
grep -Fq 'location = /ws/chat' "$ROOT_DIR/deploy/community.nginx.conf" ||
  fail "community Nginx must expose only the exact chat WebSocket path"
grep -Fq 'location = /ws' "$ROOT_DIR/deploy/community.nginx.conf" ||
  fail "community Nginx must reject the WebSocket root instead of serving the SPA"
if grep -Fq 'location ~ ^/(?:socket\.io|ws)' "$ROOT_DIR/deploy/community.nginx.conf"; then
  fail "community Nginx must not expose the old broad WebSocket regex"
fi
grep -Eq 'location ~ .*v1/community' "$ROOT_DIR/deploy/community.nginx.conf" ||
  fail "implemented content API prefix is missing from the Nginx allowlist"
grep -Eq 'location ~ .*v1/admin/.*moderation' "$ROOT_DIR/deploy/community.nginx.conf" ||
  fail "implemented moderation API prefix is missing from the Nginx allowlist"
grep -Eq 'location ~ .*v1/.*news' "$ROOT_DIR/deploy/community.nginx.conf" ||
  fail "implemented news API prefixes are missing from the Nginx allowlist"
grep -Eq 'location ~ .*v1/games/.*office-battle.*arcade' "$ROOT_DIR/deploy/community.nginx.conf" ||
  fail "implemented game API prefixes are missing from the Nginx allowlist"
grep -Eq 'location ~ .*v1/admin/.*account-appeals' "$ROOT_DIR/deploy/community.nginx.conf" ||
  fail "implemented account appeal API prefix is missing from the Nginx allowlist"
grep -Fq 'X-WebFish-Site-Mode "community"' "$ROOT_DIR/deploy/community.nginx.conf" ||
  fail "community responses must identify their deployment mode for capacity-test gating"
grep -Fq 'limit_req_status 429;' "$ROOT_DIR/deploy/community.nginx.conf" ||
  fail "community Nginx rate limits must return HTTP 429"
grep -Fq 'add_header Retry-After "60" always;' "$ROOT_DIR/deploy/community.nginx.conf" ||
  fail "community Nginx 429 response must include Retry-After"
for limit_zone in \
  community_register_ip \
  community_resend_ip \
  community_verify_ip \
  community_login_ip \
  community_refresh_ip \
  community_password_reset_request_ip \
  community_password_reset_ip \
  community_api_ip \
  community_ws_ip; do
  grep -Eq "limit_req_zone .*zone=${limit_zone}:" "$ROOT_DIR/deploy/community.nginx.conf" ||
    fail "community Nginx is missing rate-limit zone $limit_zone"
  grep -Eq "limit_req zone=${limit_zone}([;[:space:]]|$)" "$ROOT_DIR/deploy/community.nginx.conf" ||
    fail "community Nginx does not apply rate-limit zone $limit_zone"
done
grep -Eq 'limit_conn_zone .*zone=community_ws_connections:' "$ROOT_DIR/deploy/community.nginx.conf" ||
  fail "community Nginx is missing the WebSocket connection zone"
grep -Eq 'limit_conn community_ws_connections 10;' "$ROOT_DIR/deploy/community.nginx.conf" ||
  fail "community Nginx must cap unauthenticated WebSocket connections per client IP"
for auth_path in \
  /api/v1/auth/account/register \
  /api/v1/auth/account/login \
  /api/v1/auth/register \
  /api/v1/auth/email/verification-requests \
  /api/v1/auth/login \
  /api/v1/auth/refresh \
  /api/v1/auth/password-reset-requests \
  /api/v1/auth/password-resets; do
  grep -Fq "location ~ ^${auth_path}/?\$" "$ROOT_DIR/deploy/community.nginx.conf" ||
    fail "community Nginx is missing the dedicated limiter for $auth_path"
done
grep -Fq '^/api/v1/auth/(?:verify-email|email/verify)/?$' \
  "$ROOT_DIR/deploy/community.nginx.conf" ||
  fail "community Nginx is missing the verify-email limiter"

grep -Fq 'COMMUNITY CAPACITY NOT YET PROVEN.' \
  "$ROOT_DIR/loadtest/k6/community-capacity-gate.mjs" ||
  fail "community capacity gate must remain fail-closed"
grep -Fq -- '--header "Origin: $SMOKE_BASE_URL"' \
  "$ROOT_DIR/deploy/community-smoke.sh" ||
  fail "authenticated smoke login must send the trusted site Origin"
grep -Fq 'assert_origin_rejected "$auth_path" "$auth_label" missing' \
  "$ROOT_DIR/deploy/community-smoke.sh" ||
  fail "community smoke must enforce the missing-Origin auth contract"
grep -Fq 'register limiter rejects a harmless burst with HTTP 429' \
  "$ROOT_DIR/deploy/community-smoke.sh" ||
  fail "community smoke must exercise a harmless auth 429 contract"

grep -Fq 'BASELINE_TIMESTAMP=1700000000007' \
  "$ROOT_DIR/deploy/community-migration-rehearsal.sh" ||
  fail "migration rehearsal must start from the 0007 snapshot gate"
grep -Fq 'HARDENING_TIMESTAMP=1700000000008' \
  "$ROOT_DIR/deploy/community-migration-rehearsal.sh" ||
  fail "migration rehearsal must explicitly verify migration 0008"
grep -Fq 'CHAT_TIMESTAMP=1700000000014' \
  "$ROOT_DIR/deploy/community-migration-rehearsal.sh" &&
grep -Fq 'NEWS_TIMESTAMP=1700000000015' \
  "$ROOT_DIR/deploy/community-migration-rehearsal.sh" &&
grep -Fq 'GAME_GROWTH_TIMESTAMP=1700000000018' \
  "$ROOT_DIR/deploy/community-migration-rehearsal.sh" &&
grep -Fq 'UNIFIED_ECONOMY_TIMESTAMP=1700000000019' \
  "$ROOT_DIR/deploy/community-migration-rehearsal.sh" &&
grep -Fq 'GUILD_TIMESTAMP=1700000000020' \
  "$ROOT_DIR/deploy/community-migration-rehearsal.sh" &&
grep -Fq 'GUILD_BOSS_TIMESTAMP=1700000000021' \
  "$ROOT_DIR/deploy/community-migration-rehearsal.sh" &&
grep -Fq 'HOT_NEWS_TIMESTAMP=1700000000022' \
  "$ROOT_DIR/deploy/community-migration-rehearsal.sh" &&
grep -Fq 'ARCADE_TIMESTAMP=1700000000023' \
  "$ROOT_DIR/deploy/community-migration-rehearsal.sh" &&
grep -Fq 'LATEST_TIMESTAMP=1700000000023' \
  "$ROOT_DIR/deploy/community-migration-rehearsal.sh" &&
grep -Fq 'chat_socket_tickets' \
  "$ROOT_DIR/deploy/community-migration-rehearsal.sh" &&
grep -Fq 'news_review_decisions' \
  "$ROOT_DIR/deploy/community-migration-rehearsal.sh" &&
grep -Fq 'idx_chat_messages_author_room_created' \
  "$ROOT_DIR/deploy/community-migration-rehearsal.sh" &&
grep -Fq 'uq_users_username_normalized' \
  "$ROOT_DIR/deploy/community-migration-rehearsal.sh" &&
grep -Fq 'farm_version' \
  "$ROOT_DIR/deploy/community-migration-rehearsal.sh" &&
grep -Fq 'guild_ledger' \
  "$ROOT_DIR/deploy/community-migration-rehearsal.sh" &&
grep -Fq 'guild_boss_contributions' \
  "$ROOT_DIR/deploy/community-migration-rehearsal.sh" &&
grep -Fq 'hot_news_headlines' \
  "$ROOT_DIR/deploy/community-migration-rehearsal.sh" &&
grep -Fq 'arcade_best_scores' \
  "$ROOT_DIR/deploy/community-migration-rehearsal.sh" ||
  fail "migration rehearsal must verify chat 0014 through arcade leaderboards 0023"
grep -Fq 'migration:revert' "$ROOT_DIR/deploy/community-migration-rehearsal.sh" &&
grep -Fq 'EMAIL_NORMALIZATION_COLLISION' "$ROOT_DIR/deploy/community-migration-rehearsal.sh" &&
grep -Fq 'lock-timeout' "$ROOT_DIR/deploy/community-migration-rehearsal.sh" ||
  fail "migration rehearsal is missing revert, dirty-email or lock-timeout coverage"

check_single_key IMAGE_TAG
IMAGE_TAG=$(env_value IMAGE_TAG)
if printf '%s\n' "$IMAGE_TAG" | grep -Eq '^[0-9a-f]{40}$'; then
  HEAD_SHA=$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || true)
  [ "$IMAGE_TAG" = "$HEAD_SHA" ] ||
    fail "IMAGE_TAG must equal the full current HEAD commit SHA"
else
  fail "IMAGE_TAG must be a full 40-character lowercase Git commit SHA"
fi

[ -z "$(git -C "$ROOT_DIR" status --porcelain --untracked-files=normal 2>/dev/null || printf git-unavailable)" ] ||
  fail "repository must be clean before building the community image"

check_single_key HTTP_PORT
HTTP_PORT=$(env_value HTTP_PORT)
case "$HTTP_PORT" in
  ''|*[!0-9]*) fail "HTTP_PORT must be an integer" ;;
  *) [ "$HTTP_PORT" -ge 1 ] && [ "$HTTP_PORT" -le 65535 ] ||
       fail "HTTP_PORT must be between 1 and 65535" ;;
esac

check_required_text SITE_NAME
check_required_text SITE_DOMAIN
SITE_DOMAIN=$(env_value SITE_DOMAIN)
printf '%s\n' "$SITE_DOMAIN" |
  grep -Eq '^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$' ||
  fail "SITE_DOMAIN must be a hostname without protocol, path, port or wildcard"

check_email ACME_EMAIL
check_required_text PRIVACY_PROCESSOR_NAME
check_required_text PRIVACY_CONTACT
PRIVACY_CONTACT=$(env_value PRIVACY_CONTACT)
printf '%s\n' "$PRIVACY_CONTACT" |
  grep -Eq '(^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$)|(^https://[^[:space:]]+$)|(^\+?[0-9][0-9[:space:]-]{6,19}$)' ||
  fail "PRIVACY_CONTACT must be an email, HTTPS request URL or telephone number"

check_required_text PUBLIC_GAME_CLEARANCE_REFERENCE
if printf '%s\n' "$(env_value PUBLIC_GAME_CLEARANCE_REFERENCE)" | grep -Eiq 'ICP'; then
  fail "PUBLIC_GAME_CLEARANCE_REFERENCE cannot use an ICP filing number"
fi

check_required_text ICP_BEIAN_NUMBER
ICP_BEIAN_NUMBER=$(env_value ICP_BEIAN_NUMBER)
printf '%s\n' "$ICP_BEIAN_NUMBER" | grep -Eq '^.+ICP备[0-9]+号(-[0-9]+)?$' ||
  fail "ICP_BEIAN_NUMBER does not match the expected issued filing format"

check_single_key PUBLIC_SECURITY_BEIAN_NUMBER
check_single_key PUBLIC_SECURITY_BEIAN_URL
PUBLIC_SECURITY_BEIAN_NUMBER=$(env_value PUBLIC_SECURITY_BEIAN_NUMBER)
PUBLIC_SECURITY_BEIAN_URL=$(env_value PUBLIC_SECURITY_BEIAN_URL)
if [ -n "$PUBLIC_SECURITY_BEIAN_NUMBER" ] || [ -n "$PUBLIC_SECURITY_BEIAN_URL" ]; then
  [ -n "$PUBLIC_SECURITY_BEIAN_NUMBER" ] && [ -n "$PUBLIC_SECURITY_BEIAN_URL" ] ||
    fail "public-security filing number and URL must be set together"
  case "$PUBLIC_SECURITY_BEIAN_URL" in
    https://beian.mps.gov.cn/*|https://www.beian.gov.cn/*) ;;
    *) fail "PUBLIC_SECURITY_BEIAN_URL must use an official filing host" ;;
  esac
fi

check_secret JWT_SECRET 48 256
check_secret AUTH_TOKEN_PEPPER 32 256
check_secret DB_PASSWORD 16 128
check_secret REDIS_PASSWORD 32 128
check_secret AUTH_EMAIL_WEBHOOK_TOKEN 24 256
check_base64url_32 AUTH_EMAIL_OUTBOX_ENCRYPTION_KEY
check_required_text AUTH_EMAIL_OUTBOX_ENCRYPTION_KEY_ID
check_secret BETA_BOOTSTRAP_CODE 16 128

check_single_key COMMUNITY_MAX_ACTIVE_USERS
COMMUNITY_MAX_ACTIVE_USERS=$(env_value COMMUNITY_MAX_ACTIVE_USERS)
case "$COMMUNITY_MAX_ACTIVE_USERS" in
  ''|*[!0-9]*) fail "COMMUNITY_MAX_ACTIVE_USERS must be an integer" ;;
  *) [ "$COMMUNITY_MAX_ACTIVE_USERS" -ge 1 ] && [ "$COMMUNITY_MAX_ACTIVE_USERS" -le 4000 ] ||
       fail "COMMUNITY_MAX_ACTIVE_USERS must be between 1 and the planned maximum 4000" ;;
esac

check_single_key JWT_ACCESS_EXPIRES_IN
printf '%s\n' "$(env_value JWT_ACCESS_EXPIRES_IN)" | grep -Eq '^[1-9][0-9]*(s|m|h|d)$' ||
  fail "JWT_ACCESS_EXPIRES_IN must use a positive s/m/h/d duration such as 15m"

check_required_text DB_USERNAME
check_required_text DB_DATABASE
for key in DB_POOL_MAX DB_MIGRATE_POOL_MAX; do
  check_single_key "$key"
  value=$(env_value "$key")
  case "$value" in
    ''|*[!0-9]*) fail "$key must be a positive integer" ;;
    *) [ "$value" -ge 1 ] && [ "$value" -le 40 ] ||
         fail "$key must be between 1 and 40" ;;
  esac
done
check_boolean DB_LOGGING
[ "$(env_value DB_LOGGING)" = false ] ||
  fail "DB_LOGGING must be false in a production community release"

check_required_text AUTH_EMAIL_WEBHOOK_URL
case "$(env_value AUTH_EMAIL_WEBHOOK_URL)" in
  https://*) ;;
  *) fail "AUTH_EMAIL_WEBHOOK_URL must use HTTPS" ;;
esac
check_single_key BETA_BOOTSTRAP_USES
BETA_BOOTSTRAP_USES=$(env_value BETA_BOOTSTRAP_USES)
case "$BETA_BOOTSTRAP_USES" in
  ''|*[!0-9]*) fail "BETA_BOOTSTRAP_USES must be an integer" ;;
  *) [ "$BETA_BOOTSTRAP_USES" -ge 1 ] && [ "$BETA_BOOTSTRAP_USES" -le 10000 ] ||
       fail "BETA_BOOTSTRAP_USES must be between 1 and 10000" ;;
esac
check_boolean FEATURE_REGISTRATION_ENABLED
check_boolean FEATURE_PASSWORD_RESET_ENABLED
check_boolean FEATURE_SOCIAL_VERIFICATION_ENABLED
check_boolean FEATURE_ACCOUNT_DELETION_ENABLED
check_boolean FEATURE_COMMUNITY_WRITES_ENABLED
check_boolean FEATURE_COMMUNITY_CONTENT_ENABLED
check_boolean FEATURE_COMMUNITY_CONTENT_WRITES_ENABLED
check_boolean FEATURE_COMMUNITY_MODERATION_ENABLED
check_boolean FEATURE_COMMUNITY_CHAT_ENABLED
check_boolean FEATURE_COMMUNITY_CHAT_WRITES_ENABLED
check_boolean CHAT_BUILTIN_MODERATION_ENABLED
check_boolean FEATURE_COMMUNITY_NEWS_ENABLED
check_boolean FEATURE_NEWS_ADMIN_ENABLED
check_boolean FEATURE_COMMUNITY_BATTLE_ENABLED

[ "$(env_value FEATURE_COMMUNITY_CONTENT_WRITES_ENABLED)" = false ] ||
  [ "$(env_value FEATURE_COMMUNITY_CONTENT_ENABLED)" = true ] ||
  fail "FEATURE_COMMUNITY_CONTENT_WRITES_ENABLED requires FEATURE_COMMUNITY_CONTENT_ENABLED=true"
[ "$(env_value FEATURE_COMMUNITY_MODERATION_ENABLED)" = false ] ||
  [ "$(env_value FEATURE_COMMUNITY_CONTENT_ENABLED)" = true ] ||
  fail "FEATURE_COMMUNITY_MODERATION_ENABLED requires FEATURE_COMMUNITY_CONTENT_ENABLED=true"
[ "$(env_value FEATURE_COMMUNITY_CHAT_WRITES_ENABLED)" = false ] ||
  [ "$(env_value FEATURE_COMMUNITY_CHAT_ENABLED)" = true ] ||
  fail "FEATURE_COMMUNITY_CHAT_WRITES_ENABLED requires FEATURE_COMMUNITY_CHAT_ENABLED=true"
[ "$(env_value FEATURE_NEWS_ADMIN_ENABLED)" = false ] ||
  [ "$(env_value FEATURE_COMMUNITY_NEWS_ENABLED)" = true ] ||
  fail "FEATURE_NEWS_ADMIN_ENABLED requires FEATURE_COMMUNITY_NEWS_ENABLED=true"

if [ "$(env_value FEATURE_COMMUNITY_CHAT_WRITES_ENABLED)" = true ]; then
  if [ "$(env_value CHAT_BUILTIN_MODERATION_ENABLED)" != true ]; then
    check_required_text CHAT_MODERATION_ENDPOINT
    case "$(env_value CHAT_MODERATION_ENDPOINT)" in
      https://*) ;;
      *) fail "CHAT_MODERATION_ENDPOINT must use HTTPS" ;;
    esac
    check_secret CHAT_MODERATION_API_TOKEN 24 256
  fi
fi

if [ "$(env_value FEATURE_SOCIAL_VERIFICATION_ENABLED)" = true ]; then
  check_required_text SOCIAL_VERIFICATION_PROVIDER_NAME
  printf '%s\n' "$(env_value SOCIAL_VERIFICATION_PROVIDER_NAME)" |
    grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$' ||
    fail "SOCIAL_VERIFICATION_PROVIDER_NAME has an invalid format"
  check_required_text SOCIAL_VERIFICATION_PROVIDER_SESSION_URL
  case "$(env_value SOCIAL_VERIFICATION_PROVIDER_SESSION_URL)" in
    https://*) ;;
    *) fail "SOCIAL_VERIFICATION_PROVIDER_SESSION_URL must use HTTPS" ;;
  esac
  check_required_text SOCIAL_VERIFICATION_CALLBACK_URL
  expected_callback="https://${SITE_DOMAIN}/api/v1/auth/social-verification/callbacks"
  [ "$(env_value SOCIAL_VERIFICATION_CALLBACK_URL)" = "$expected_callback" ] ||
    fail "SOCIAL_VERIFICATION_CALLBACK_URL must equal $expected_callback"
  check_secret SOCIAL_VERIFICATION_PROVIDER_TOKEN 24 256
  check_secret SOCIAL_VERIFICATION_CALLBACK_SECRET 32 256
fi

mode=$(stat -c '%a' "$ENV_FILE" 2>/dev/null || true)
case "$mode" in
  600|400) ;;
  '') warn "could not inspect permissions for $ENV_FILE" ;;
  *) warn "$ENV_FILE permissions are $mode; use chmod 600 $ENV_FILE" ;;
esac

if [ "${PREFLIGHT_SKIP_DOCKER:-false}" = "true" ]; then
  warn "Docker checks explicitly skipped; this is not a deployment approval"
else
  command -v docker >/dev/null 2>&1 || fail "docker is not installed or not on PATH"
  if command -v docker >/dev/null 2>&1; then
    docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is unavailable"
    docker info >/dev/null 2>&1 || fail "Docker daemon is unavailable to the current user"
    if docker compose version >/dev/null 2>&1; then
      (
        cd "$ROOT_DIR"
        docker compose \
          -p "$COMPOSE_PROJECT" \
          -f "$COMPOSE_FILE" \
          --env-file "$ENV_FILE" \
          config -q
      ) || fail "community compose cannot be rendered with $ENV_FILE"
    fi
  fi
fi

if [ "$ERRORS" -ne 0 ]; then
  printf 'Community preflight failed with %s error(s).\n' "$ERRORS" >&2
  exit 1
fi

printf 'Community preflight passed for %s using Compose project %s.\n' \
  "$ENV_FILE" "$COMPOSE_PROJECT"

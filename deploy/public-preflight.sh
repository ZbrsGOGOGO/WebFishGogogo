#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE=${1:-"$ROOT_DIR/.env.public"}
COMPOSE_FILE=deploy/docker-compose.public.yml
COMPOSE_PROJECT=webfish-review
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
  meaningful_value=$(printf '%s\n' "$value" | sed "s/[[:space:]\"']//g")
  case "$value" in
    ''|*example.com*|*待配置*|*请填写*|*replace-with*|*your-*)
      fail "$key is empty or still uses a placeholder"
      ;;
  esac
  [ -n "$meaningful_value" ] || fail "$key cannot contain only whitespace or quotes"
}

[ -f "$ENV_FILE" ] || {
  printf 'ERROR: env file not found: %s\n' "$ENV_FILE" >&2
  exit 1
}

for file in \
  Dockerfile \
  deploy/public.nginx.conf \
  deploy/docker-compose.public.yml \
  deploy/Caddyfile.public \
  deploy/.env.public.example; do
  [ -f "$ROOT_DIR/$file" ] || fail "missing required public deployment file: $file"
done

grep -Eq 'target:[[:space:]]*public-web' "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "$COMPOSE_FILE must build the public-web target"
grep -Eq 'VITE_SITE_MODE:[[:space:]]*public' "$ROOT_DIR/$COMPOSE_FILE" ||
  fail "$COMPOSE_FILE must set VITE_SITE_MODE to public"

grep -Eq '^FROM site-build-base AS review-build$' "$ROOT_DIR/Dockerfile" ||
  fail "Dockerfile must define the isolated review-build stage"
grep -Eq '^FROM site-build-base AS public-build$' "$ROOT_DIR/Dockerfile" ||
  fail "Dockerfile must define the isolated public-build stage"
grep -Eq '^COPY --from=public-build /app/packages/frontend/dist /usr/share/nginx/html$' \
  "$ROOT_DIR/Dockerfile" ||
  fail "public-web must copy only the public-build artifact"

PUBLIC_BUILD_SECTION=$(sed -n \
  '/^FROM site-build-base AS public-build$/,/^FROM .* AS review-web$/p' \
  "$ROOT_DIR/Dockerfile")
for build_arg in \
  VITE_SITE_OPERATOR \
  VITE_SITE_CONTACT \
  PUBLIC_GAME_CLEARANCE_REFERENCE; do
  printf '%s\n' "$PUBLIC_BUILD_SECTION" | grep -Eq "^ARG ${build_arg}=" ||
    fail "public-build must declare and validate $build_arg"
done
printf '%s\n' "$PUBLIC_BUILD_SECTION" |
  grep -Fq 'test "$VITE_SITE_MODE" = public' ||
  fail "public-build must reject non-public VITE_SITE_MODE values"

for public_route in \
  /tower-defense \
  /ledou \
  /battle \
  /games/snake \
  /games/zhengdao/ \
  /games/zhengdao/js/01-data.js; do
  grep -Fq "fetch_exact '$public_route'" "$ROOT_DIR/deploy/public-smoke.sh" ||
    fail "public smoke must cover $public_route"
done
grep -Fq '本机最高分' "$ROOT_DIR/deploy/public-smoke.sh" &&
grep -Fq '不上传' "$ROOT_DIR/deploy/public-smoke.sh" &&
grep -Fq '不提供正式奖励' "$ROOT_DIR/deploy/public-smoke.sh" ||
  fail "public smoke must assert the tower-defense local-only boundary"

logging_none_count=$(grep -Ec \
  '^[[:space:]]+driver:[[:space:]]+none([[:space:]]*#.*)?$' \
  "$ROOT_DIR/$COMPOSE_FILE" || true)
[ "$logging_none_count" -eq 2 ] ||
  fail "$COMPOSE_FILE must disable persistent logging for both public services"
grep -Eq '^[[:space:]]*access_log[[:space:]]+off;' \
  "$ROOT_DIR/deploy/public.nginx.conf" ||
  fail "public.nginx.conf must disable access logging"

check_single_key IMAGE_TAG
IMAGE_TAG=$(env_value IMAGE_TAG)
if printf '%s\n' "$IMAGE_TAG" | grep -Eq '^[0-9a-f]{40}$'; then
  HEAD_SHA=$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || true)
  [ "$IMAGE_TAG" = "$HEAD_SHA" ] ||
    fail "IMAGE_TAG must equal the full current HEAD commit SHA"
else
  fail "IMAGE_TAG must be a full 40-character lowercase Git commit SHA"
fi

[ -z "$(git -C "$ROOT_DIR" status --porcelain --untracked-files=normal 2>/dev/null || printf 'git-unavailable')" ] ||
  fail "repository must be clean before building the public image"

check_single_key HTTP_BIND
[ "$(env_value HTTP_BIND)" = "127.0.0.1" ] ||
  fail "HTTP_BIND must be 127.0.0.1; public TLS is terminated by the bundled Caddy gateway"

check_single_key HTTP_PORT
HTTP_PORT=$(env_value HTTP_PORT)
case "$HTTP_PORT" in
  ''|*[!0-9]*) fail "HTTP_PORT must be an integer" ;;
  *) [ "$HTTP_PORT" -ge 1 ] && [ "$HTTP_PORT" -le 65535 ] ||
       fail "HTTP_PORT must be between 1 and 65535" ;;
esac

check_required_text SITE_NAME
[ "$(env_value SITE_NAME)" = "摸摸公司" ] ||
  fail "SITE_NAME must be 摸摸公司 for this release"
check_required_text SITE_DOMAIN
check_required_text ACME_EMAIL
check_required_text PRIVACY_PROCESSOR_NAME
check_required_text PRIVACY_CONTACT
check_required_text PUBLIC_GAME_CLEARANCE_REFERENCE
check_required_text ICP_BEIAN_NUMBER

PRIVACY_CONTACT=$(env_value PRIVACY_CONTACT)
printf '%s\n' "$PRIVACY_CONTACT" | grep -Eq \
  '(^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$)|(^https://[^[:space:]]+$)|(^\+?[0-9][0-9[:space:]-]{6,19}$)' ||
  fail "PRIVACY_CONTACT must be an email address, HTTPS request URL, or telephone number"

PUBLIC_GAME_CLEARANCE_REFERENCE=$(env_value PUBLIC_GAME_CLEARANCE_REFERENCE)
if printf '%s\n' "$PUBLIC_GAME_CLEARANCE_REFERENCE" | grep -Eiq 'ICP'; then
  fail "PUBLIC_GAME_CLEARANCE_REFERENCE cannot use an ICP filing number as game-publication clearance"
fi

ACME_EMAIL=$(env_value ACME_EMAIL)
printf '%s\n' "$ACME_EMAIL" | grep -Eq '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' ||
  fail "ACME_EMAIL must be a valid email address for TLS certificate notices"

SITE_DOMAIN=$(env_value SITE_DOMAIN)
printf '%s\n' "$SITE_DOMAIN" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$' ||
  fail "SITE_DOMAIN must be a hostname without protocol, path, port, or wildcard"

ICP_BEIAN_NUMBER=$(env_value ICP_BEIAN_NUMBER)
case "$ICP_BEIAN_NUMBER" in
  *X*|*x*|*待*|*示例*|*example*) fail "ICP_BEIAN_NUMBER must contain the issued filing number" ;;
esac
printf '%s\n' "$ICP_BEIAN_NUMBER" | grep -Eq '^.+ICP备[0-9]+号(-[0-9]+)?$' ||
  fail "ICP_BEIAN_NUMBER does not match the expected ICP filing number format"

check_single_key PUBLIC_SECURITY_BEIAN_NUMBER
check_single_key PUBLIC_SECURITY_BEIAN_URL
PUBLIC_SECURITY_BEIAN_NUMBER=$(env_value PUBLIC_SECURITY_BEIAN_NUMBER)
PUBLIC_SECURITY_BEIAN_URL=$(env_value PUBLIC_SECURITY_BEIAN_URL)
if [ -n "$PUBLIC_SECURITY_BEIAN_NUMBER" ] || [ -n "$PUBLIC_SECURITY_BEIAN_URL" ]; then
  [ -n "$PUBLIC_SECURITY_BEIAN_NUMBER" ] && [ -n "$PUBLIC_SECURITY_BEIAN_URL" ] ||
    fail "PUBLIC_SECURITY_BEIAN_NUMBER and PUBLIC_SECURITY_BEIAN_URL must be set together"
  case "$PUBLIC_SECURITY_BEIAN_URL" in
    https://beian.mps.gov.cn/*|https://www.beian.gov.cn/*) ;;
    *) fail "PUBLIC_SECURITY_BEIAN_URL must use an official public-security filing host" ;;
  esac
fi

mode=$(stat -c '%a' "$ENV_FILE" 2>/dev/null || true)
case "$mode" in
  600|400) ;;
  '') warn "could not inspect permissions for $ENV_FILE" ;;
  *) warn "$ENV_FILE permissions are $mode; use chmod 600 $ENV_FILE" ;;
esac

if [ "${PREFLIGHT_SKIP_DOCKER:-false}" = "true" ]; then
  warn "Docker checks explicitly skipped"
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
      ) || fail "public compose cannot be rendered with $ENV_FILE"
    fi
  fi
fi

if [ "$ERRORS" -ne 0 ]; then
  printf 'Public preflight failed with %s error(s).\n' "$ERRORS" >&2
  exit 1
fi

printf 'Public preflight passed for %s using Compose project %s.\n' \
  "$ENV_FILE" "$COMPOSE_PROJECT"

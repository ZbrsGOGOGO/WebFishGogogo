#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE=${1:-"$ROOT_DIR/.env.review"}
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
  case "$value" in
    ''|*example.com*|*待配置*|*请填写*|*replace-with*|*your-*)
      fail "$key is empty or still uses a placeholder"
      ;;
  esac
}

[ -f "$ENV_FILE" ] || {
  printf 'ERROR: env file not found: %s\n' "$ENV_FILE" >&2
  exit 1
}

for file in Dockerfile deploy/review.nginx.conf deploy/docker-compose.review.yml; do
  [ -f "$ROOT_DIR/$file" ] || fail "missing required review deployment file: $file"
done

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
  fail "repository must be clean before building the review image"

check_single_key HTTP_BIND
[ "$(env_value HTTP_BIND)" = "127.0.0.1" ] ||
  fail "HTTP_BIND must be 127.0.0.1; terminate public TLS in the host reverse proxy"

check_single_key HTTP_PORT
HTTP_PORT=$(env_value HTTP_PORT)
case "$HTTP_PORT" in
  ''|*[!0-9]*) fail "HTTP_PORT must be an integer" ;;
  *) [ "$HTTP_PORT" -ge 1 ] && [ "$HTTP_PORT" -le 65535 ] ||
       fail "HTTP_PORT must be between 1 and 65535" ;;
esac

check_required_text SITE_NAME
check_required_text SITE_DOMAIN
check_required_text SITE_OPERATOR
check_required_text SITE_CONTACT

SITE_CONTACT=$(env_value SITE_CONTACT)
case "$SITE_CONTACT" in
  *@*.*) ;;
  +[0-9]*|[0-9]*)
    printf '%s\n' "$SITE_CONTACT" | grep -Eq '^\+?[0-9 -]{7,20}$' ||
      fail "SITE_CONTACT must be a public email address or phone number"
    ;;
  *) fail "SITE_CONTACT must be a public email address or phone number" ;;
esac

SITE_DOMAIN=$(env_value SITE_DOMAIN)
printf '%s\n' "$SITE_DOMAIN" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$' ||
  fail "SITE_DOMAIN must be a hostname without protocol, path, port, or wildcard"

check_single_key ICP_BEIAN_NUMBER
ICP_BEIAN_NUMBER=$(env_value ICP_BEIAN_NUMBER)
case "$ICP_BEIAN_NUMBER" in
  *X*|*x*|*待*|*示例*|*example*) fail "ICP_BEIAN_NUMBER must be empty until a real number is issued" ;;
esac
[ -z "$ICP_BEIAN_NUMBER" ] || printf '%s\n' "$ICP_BEIAN_NUMBER" | grep -Eq '^.+ICP备[0-9]+号(-[0-9]+)?$' ||
  fail "ICP_BEIAN_NUMBER does not match the expected ICP filing number format"
[ -n "$ICP_BEIAN_NUMBER" ] || warn "ICP_BEIAN_NUMBER is empty; the page will truthfully display ICP filing under review"

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
        docker compose -f deploy/docker-compose.review.yml --env-file "$ENV_FILE" config -q
      ) || fail "review compose cannot be rendered with $ENV_FILE"
    fi
  fi
fi

if [ "$ERRORS" -ne 0 ]; then
  printf 'Review preflight failed with %s error(s).\n' "$ERRORS" >&2
  exit 1
fi

printf 'Review preflight passed for %s.\n' "$ENV_FILE"

#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE=${1:-"$ROOT_DIR/.env.production"}
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

check_secret() {
  key=$1
  min_length=$2
  max_length=$3
  check_single_key "$key"
  value=$(env_value "$key")
  case "$value" in
    ''|*replace-with*|*change-me*|*example*|*your-*)
      fail "$key is empty or still uses a published placeholder"
      return
      ;;
  esac
  length=${#value}
  [ "$length" -ge "$min_length" ] && [ "$length" -le "$max_length" ] ||
    fail "$key length must be between $min_length and $max_length characters"
  case "$value" in
    *[!A-Za-z0-9._~:@%+=,-]*)
      fail "$key must use unquoted, whitespace-free characters safe for an env file"
      ;;
  esac
}

[ -f "$ENV_FILE" ] || {
  printf 'ERROR: env file not found: %s\n' "$ENV_FILE" >&2
  exit 1
}

for file in Dockerfile docker-compose.yml deploy/nginx.conf; do
  [ -f "$ROOT_DIR/$file" ] || fail "missing required deployment file: $file"
done

check_single_key IMAGE_TAG
IMAGE_TAG=$(env_value IMAGE_TAG)
if printf '%s\n' "$IMAGE_TAG" | grep -Eq '^[0-9A-Fa-f]{7,40}$'; then
  git -C "$ROOT_DIR" rev-parse --verify --quiet "${IMAGE_TAG}^{commit}" >/dev/null ||
    fail "IMAGE_TAG does not resolve to a commit in this repository"
else
  fail "IMAGE_TAG must be a 7-40 character hexadecimal Git commit SHA"
fi

check_single_key HTTP_BIND
HTTP_BIND=$(env_value HTTP_BIND)
[ "$HTTP_BIND" = "127.0.0.1" ] ||
  fail "HTTP_BIND must be 127.0.0.1; terminate public TLS in the host reverse proxy"

check_single_key HTTP_PORT
HTTP_PORT=$(env_value HTTP_PORT)
case "$HTTP_PORT" in
  ''|*[!0-9]*) fail "HTTP_PORT must be an integer" ;;
  *) [ "$HTTP_PORT" -ge 1 ] && [ "$HTTP_PORT" -le 65535 ] ||
       fail "HTTP_PORT must be between 1 and 65535" ;;
esac

check_secret JWT_SECRET 32 256
check_secret DB_PASSWORD 16 128

grep -qx 'backups' "$ROOT_DIR/.dockerignore" ||
  fail ".dockerignore must exclude the default backups directory"

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
    docker compose version >/dev/null 2>&1 ||
      fail "Docker Compose v2 is unavailable"
    docker info >/dev/null 2>&1 ||
      fail "Docker daemon is unavailable to the current user"
    if docker compose version >/dev/null 2>&1; then
      (
        cd "$ROOT_DIR"
        docker compose --env-file "$ENV_FILE" config -q
      ) || fail "docker-compose.yml cannot be rendered with $ENV_FILE"
    fi
  fi
fi

if [ "$ERRORS" -ne 0 ]; then
  printf 'Preflight failed with %s error(s).\n' "$ERRORS" >&2
  exit 1
fi

printf 'Preflight passed for %s (secrets were not printed).\n' "$ENV_FILE"

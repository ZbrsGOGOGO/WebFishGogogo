#!/bin/sh
set -eu
umask 077

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE=${ENV_FILE:-"$ROOT_DIR/.env.production"}
BACKUP_ROOT=${BACKUP_ROOT:-"$ROOT_DIR/backups"}
QUIESCE=${QUIESCE:-true}
STAMP=$(date -u '+%Y%m%dT%H%M%SZ')
SNAPSHOT="$BACKUP_ROOT/$STAMP"
INCOMPLETE="$BACKUP_ROOT/.incomplete-$STAMP-$$"
STOPPED_SERVICES=

case "$QUIESCE" in
  true|false) ;;
  *)
    printf 'QUIESCE must be exactly true or false.\n' >&2
    exit 2
    ;;
esac

compose() {
  (cd "$ROOT_DIR" && docker compose --env-file "$ENV_FILE" "$@")
}

was_running() {
  compose ps --status running --services | grep -qx "$1"
}

restart_services() {
  [ -n "$STOPPED_SERVICES" ] || return 0
  # shellcheck disable=SC2086
  compose up -d --wait --wait-timeout 120 $STOPPED_SERVICES >/dev/null
}

cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  if ! restart_services; then
    printf 'Stopped services could not be restored to a healthy state.\n' >&2
    [ "$status" -ne 0 ] || status=1
  fi
  [ "$status" -eq 0 ] || rm -rf -- "$INCOMPLETE"
  exit "$status"
}
trap cleanup EXIT HUP INT TERM

sh "$ROOT_DIR/deploy/preflight.sh" "$ENV_FILE"
mkdir -p "$BACKUP_ROOT"
[ ! -e "$SNAPSHOT" ] || {
  printf 'Backup already exists: %s\n' "$SNAPSHOT" >&2
  exit 1
}
mkdir "$INCOMPLETE"
chmod 700 "$INCOMPLETE"

if [ "$QUIESCE" = "true" ]; then
  for service in web worker api; do
    if was_running "$service"; then
      compose stop "$service" >/dev/null
      STOPPED_SERVICES="$STOPPED_SERVICES $service"
    fi
  done
fi

compose exec -T postgres sh -ec \
  'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-privileges' \
  > "$INCOMPLETE/postgres.dump"
[ -s "$INCOMPLETE/postgres.dump" ] || {
  printf 'PostgreSQL dump is empty.\n' >&2
  exit 1
}

compose run --rm --no-deps \
  -T \
  --user 0:0 \
  --entrypoint /bin/sh \
  api -ec '
    : "${LOCAL_STORAGE_DIR:?LOCAL_STORAGE_DIR is required}"
    [ -d "$LOCAL_STORAGE_DIR" ]
    exec tar -C "$LOCAL_STORAGE_DIR" -czf - .
  ' > "$INCOMPLETE/documents.tar.gz"

[ -s "$INCOMPLETE/documents.tar.gz" ] || {
  printf 'Document archive is empty.\n' >&2
  exit 1
}

{
  printf 'format_version=2\n'
  printf 'created_at=%s\n' "$STAMP"
  printf 'git_commit=%s\n' "$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || printf unknown)"
  printf 'quiesced=%s\n' "$QUIESCE"
  printf 'storage_driver=local\n'
} > "$INCOMPLETE/metadata.env"

(
  cd "$INCOMPLETE"
  find . -type f ! -name SHA256SUMS -print0 |
    sort -z |
    xargs -0 sha256sum > SHA256SUMS
  sha256sum -c SHA256SUMS >/dev/null
)

chmod 600 "$INCOMPLETE"/*

mv "$INCOMPLETE" "$SNAPSHOT"
restart_services
STOPPED_SERVICES=
printf 'Backup completed: %s\n' "$SNAPSHOT"

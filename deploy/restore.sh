#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE=${ENV_FILE:-"$ROOT_DIR/.env.production"}

if [ "$#" -ne 2 ] || [ "$1" != "--confirm-restore" ]; then
  printf 'Usage: ENV_FILE=.env.production sh deploy/restore.sh --confirm-restore BACKUP_DIR\n' >&2
  exit 2
fi

SNAPSHOT=$(CDPATH= cd -- "$2" 2>/dev/null && pwd) || {
  printf 'Backup directory not found: %s\n' "$2" >&2
  exit 1
}

compose() {
  (cd "$ROOT_DIR" && docker compose --env-file "$ENV_FILE" "$@")
}

sh "$ROOT_DIR/deploy/preflight.sh" "$ENV_FILE"
[ -s "$SNAPSHOT/postgres.dump" ] &&
[ -f "$SNAPSHOT/SHA256SUMS" ] &&
[ -s "$SNAPSHOT/documents.tar.gz" ] || {
  printf 'Backup is incomplete: %s\n' "$SNAPSHOT" >&2
  exit 1
}
(cd "$SNAPSHOT" && sha256sum -c SHA256SUMS)

if ! compose run --rm --no-deps \
  --user 0:0 \
  -v "$SNAPSHOT:/restore:ro" \
  --entrypoint /bin/sh \
  api -ec '
    tar -tzf /restore/documents.tar.gz > /tmp/document-entries
    if grep -Eq "(^/|(^|/)\.\.(/|$))" /tmp/document-entries; then
      printf "Unsafe path found in document archive.\n" >&2
      exit 1
    fi
    tar -tvzf /restore/documents.tar.gz > /tmp/document-listing
    if grep -Eq "^[^-d]" /tmp/document-listing; then
      printf "Links or special files are not allowed in the document archive.\n" >&2
      exit 1
    fi
  '; then
  printf 'Document archive validation failed; nothing was restored.\n' >&2
  exit 1
fi

printf 'Stopping write-serving processes for restore...\n'
compose stop web worker api

if ! compose exec -T postgres sh -ec '
  case "$POSTGRES_DB" in
    postgres|template0|template1)
      printf "Refusing to replace PostgreSQL maintenance database: %s\n" "$POSTGRES_DB" >&2
      exit 1
      ;;
  esac
  dropdb --force --if-exists --maintenance-db=template1 -U "$POSTGRES_USER" "$POSTGRES_DB"
  createdb --maintenance-db=template1 -U "$POSTGRES_USER" -O "$POSTGRES_USER" "$POSTGRES_DB"
  exec pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --exit-on-error --no-owner --no-privileges
' \
  < "$SNAPSHOT/postgres.dump"; then
  printf 'Database restore failed. Services remain stopped; inspect before restarting.\n' >&2
  exit 1
fi

if ! compose run --rm --no-deps \
  --user 0:0 \
  -v "$SNAPSHOT:/restore:ro" \
  --entrypoint /bin/sh \
  api -ec '
    : "${LOCAL_STORAGE_DIR:?LOCAL_STORAGE_DIR is required}"
    mkdir -p "$LOCAL_STORAGE_DIR"
    find "$LOCAL_STORAGE_DIR" -mindepth 1 -delete
    tar --no-same-owner -xzf /restore/documents.tar.gz -C "$LOCAL_STORAGE_DIR"
    chown -R 10001:10001 "$LOCAL_STORAGE_DIR"
  '; then
  printf 'Document restore failed. Services remain stopped; inspect before restarting.\n' >&2
  exit 1
fi

compose run --rm migrate
if ! compose up -d --wait --wait-timeout 120 api worker web; then
  compose stop web worker api >/dev/null 2>&1 || true
  printf 'Restored services did not become healthy and remain stopped.\n' >&2
  exit 1
fi
printf 'Restore completed from %s. Run the documented smoke checks now.\n' "$SNAPSHOT"

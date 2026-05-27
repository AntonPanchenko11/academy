#!/bin/sh
set -eu

POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_BACKUP_DIR="${POSTGRES_BACKUP_DIR:-/backups/postgres}"
POSTGRES_BACKUP_RETENTION_COUNT="${POSTGRES_BACKUP_RETENTION_COUNT:-5}"
POSTGRES_BACKUP_TIMEZONE="${POSTGRES_BACKUP_TIMEZONE:-Europe/Moscow}"

require_env() {
  var_name="$1"
  eval "var_value=\${$var_name:-}"

  if [ -z "$var_value" ]; then
    echo "Missing required environment variable: $var_name" >&2
    exit 1
  fi
}

case "$POSTGRES_BACKUP_RETENTION_COUNT" in
  ''|*[!0-9]*)
    echo "POSTGRES_BACKUP_RETENTION_COUNT must be a positive integer" >&2
    exit 1
    ;;
esac

if [ "$POSTGRES_BACKUP_RETENTION_COUNT" -lt 1 ]; then
  echo "POSTGRES_BACKUP_RETENTION_COUNT must be greater than 0" >&2
  exit 1
fi

require_env POSTGRES_DB
require_env POSTGRES_USER
require_env POSTGRES_PASSWORD

mkdir -p "$POSTGRES_BACKUP_DIR"

timestamp="$(TZ="$POSTGRES_BACKUP_TIMEZONE" date +%Y%m%d-%H%M%S)"
backup_path="$POSTGRES_BACKUP_DIR/${POSTGRES_DB}-${timestamp}.dump"
tmp_path="$backup_path.tmp"

cleanup_tmp() {
  if [ -f "$tmp_path" ]; then
    rm -f "$tmp_path"
  fi
}

trap cleanup_tmp EXIT INT TERM

echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Starting PostgreSQL backup: $backup_path"

export PGPASSWORD="$POSTGRES_PASSWORD"

pg_dump \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  -Fc \
  -f "$tmp_path"

mv "$tmp_path" "$backup_path"

kept_count=0
find "$POSTGRES_BACKUP_DIR" -maxdepth 1 -type f -name "${POSTGRES_DB}-*.dump" | sort -r | while IFS= read -r file_path; do
  kept_count=$((kept_count + 1))

  if [ "$kept_count" -gt "$POSTGRES_BACKUP_RETENTION_COUNT" ]; then
    rm -f "$file_path"
    echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Removed old PostgreSQL backup: $file_path"
  fi
done

echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] PostgreSQL backup completed: $backup_path"

#!/usr/bin/env bash
# Logical backup of a Postgres database via pg_dump.
#
# Usage:
#   npm run backup:postgres
#   DATABASE_URL='postgresql://…' npm run backup:postgres
#   BACKUP_LABEL=contact-postgres DATABASE_URL='…' npm run backup:postgres
#
# Requires: pg_dump (PostgreSQL client tools) on PATH.
# Output: backups/<label>-YYYYMMDD-HHMMSS.sql.gz (gitignored)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LABEL="${BACKUP_LABEL:-reave-postgres}"
OUT_DIR="${BACKUP_OUT_DIR:-$ROOT/backups}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT_FILE="$OUT_DIR/${LABEL}-${STAMP}.sql.gz"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump not found. Install PostgreSQL client tools, e.g.:"
  echo "  macOS: brew install libpq && brew link --force libpq"
  echo "  Debian/Ubuntu: sudo apt-get install postgresql-client"
  exit 1
fi

DB_URL="${DATABASE_URL:-}"
if [[ -z "$DB_URL" ]]; then
  if [[ -f .env ]]; then
    DB_URL="$(grep -E '^DATABASE_URL=' .env | cut -d= -f2- || true)"
  fi
fi

if [[ -z "$DB_URL" ]]; then
  echo "DATABASE_URL is not set. Run npm run sync:env or export DATABASE_URL."
  exit 1
fi

mkdir -p "$OUT_DIR"

echo "Backing up $LABEL → $OUT_FILE"
pg_dump "$DB_URL" --no-owner --no-acl --format=plain | gzip -9 > "$OUT_FILE"

BYTES="$(wc -c < "$OUT_FILE" | tr -d ' ')"
echo "Done — $(numfmt --to=iec-i --suffix=B "$BYTES" 2>/dev/null || echo "${BYTES} bytes")"
echo "Verify with: gunzip -c \"$OUT_FILE\" | head"

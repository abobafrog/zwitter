#!/usr/bin/env sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$BACKUP_DIR/zwitter-$timestamp.dump"

pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file "$file"
gzip -f "$file"

find "$BACKUP_DIR" -name 'zwitter-*.dump.gz' -mtime "+$RETENTION_DAYS" -delete
echo "Created backup: $file.gz"

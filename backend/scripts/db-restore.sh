#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required (export it or load backend/.env first)."
  exit 1
fi

if [[ $# -lt 1 ]]; then
  echo "Usage: ./scripts/db-restore.sh <backup.sql>"
  exit 1
fi

backup_file="$1"
if [[ ! -f "$backup_file" ]]; then
  echo "Backup file not found: $backup_file"
  exit 1
fi

psql "$DATABASE_URL" --file "$backup_file"
echo "Restore complete from: $backup_file"

#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required (export it or load backend/.env first)."
  exit 1
fi

mkdir -p backups
timestamp="$(date +%Y%m%d_%H%M%S)"
outfile="backups/sparsha_backup_${timestamp}.sql"

pg_dump "$DATABASE_URL" --clean --if-exists --no-owner --no-privileges --file "$outfile"
echo "Backup created: $outfile"

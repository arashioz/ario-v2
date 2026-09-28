#!/usr/bin/env bash
# Loads an Ario full backup (format "ario-full-backup/1") into the dockerized database.
#
#   ./scripts/seed.sh                       # uses backend/src/static/fullBackup.json
#   ./scripts/seed.sh /path/to/backup.json
#   ARIO_FORCE=1 ./scripts/seed.sh ...      # also when records exist only in the new app (they are lost)
#
# The current database is dumped to backups/ first; restore one with:
#   docker compose exec -T mongodb mongorestore --drop --archive --gzip < backups/<file>.archive.gz
set -euo pipefail
cd "$(dirname "$0")/.."

backup="${1:-backend/src/static/fullBackup.json}"
[ -s "$backup" ] || { echo "Backup file not found or empty: $backup" >&2; exit 1; }
backup_abs="$(cd "$(dirname "$backup")" && pwd)/$(basename "$backup")"

docker compose up -d --wait mongodb

mkdir -p backups
dump="backups/pre-seed-$(date +%Y%m%d-%H%M%S).archive.gz"
docker compose exec -T mongodb mongodump --db ario_db --archive --gzip --quiet > "$dump"
echo "Current database saved to $dump"

docker compose run --rm --no-deps \
  -v "$backup_abs:/data/fullBackup.json:ro" \
  -e ARIO_BACKUP=/data/fullBackup.json \
  -e ARIO_SKIP_DUMP=1 \
  -e ARIO_FORCE="${ARIO_FORCE:-0}" \
  app node scripts/migrate-static-data.js

# Drop anything the running app cached from before the import.
if [ -n "$(docker compose ps -q app)" ]; then docker compose restart app; fi
echo "Seed finished."

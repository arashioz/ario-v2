#!/usr/bin/env bash
# Restores a backup taken by the app (Settings > Backup) into the dockerized database.
#
#   ./scripts/restore.sh                                  # list backups stored on the server
#   ./scripts/restore.sh ario-backup-2026-09-28-0200.json.gz   # one stored on the server
#   ./scripts/restore.sh ~/Downloads/ario-backup-....json.gz   # a downloaded copy
#
# The current database is dumped to backups/ first; undo with:
#   docker compose exec -T mongodb mongorestore --drop --archive --gzip < backups/<file>.archive.gz
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose up -d --wait mongodb

if [ $# -eq 0 ]; then
  docker compose run --rm --no-deps app sh -c 'ls -lh backups/daily 2>/dev/null || echo "No backups yet."'
  exit 0
fi

src="$1"
mount=()
if [ -f "$src" ]; then
  src_abs="$(cd "$(dirname "$src")" && pwd)/$(basename "$src")"
  mount=(-v "$src_abs:/data/restore.json.gz:ro")
  target=/data/restore.json.gz
else
  case "$src" in */*) echo "File not found: $src" >&2; exit 1 ;; esac
  target="backups/daily/$src"
fi

mkdir -p backups
dump="backups/pre-restore-$(date +%Y%m%d-%H%M%S).archive.gz"
docker compose exec -T mongodb mongodump --db ario_db --archive --gzip --quiet > "$dump"
echo "Current database saved to $dump"

docker compose run --rm --no-deps ${mount[@]+"${mount[@]}"} app node scripts/restore-backup.js "$target" --yes

if [ -n "$(docker compose ps -q app)" ]; then docker compose restart app; fi
echo "Restore finished."

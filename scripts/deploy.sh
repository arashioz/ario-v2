#!/usr/bin/env bash
# Builds and starts the app (http://<server>:APP_PORT), stopping the previous app first.
#
#   ./scripts/deploy.sh                 # build + start
#   ./scripts/deploy.sh --seed [file]   # then load a full backup (see scripts/seed.sh)
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "Missing .env: cp .env.example .env and fill it in." >&2; exit 1; }
# .env holds values with spaces, so read single keys instead of sourcing it.
env_get() { grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'; }
port="$(env_get APP_PORT)"; port="${port:-3000}"
old_dir="$(env_get OLD_APP_DIR)"

if [ -n "$old_dir" ] && [ -f "$old_dir/docker-compose.yml" ]; then
  echo "Stopping the previous app in $old_dir (its volumes are kept)..."
  (cd "$old_dir" && docker compose down)
fi

others="$(docker ps --filter "publish=$port" --format '{{.Names}}' | grep -vx ario_app || true)"
if [ -n "$others" ]; then
  echo "Stopping containers still using port $port: $others"
  docker stop $others
fi

docker compose build
docker compose up -d --wait mongodb
docker compose up -d app

echo -n "Waiting for the app on port $port"
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$port/api" >/dev/null 2>&1; then echo " ok"; break; fi
  echo -n "."; sleep 2
done
curl -fsS "http://127.0.0.1:$port/api" >/dev/null 2>&1 || { echo; docker compose logs --tail 50 app; exit 1; }

if [ "${1:-}" = "--seed" ]; then ./scripts/seed.sh "${2:-backend/src/static/fullBackup.json}"; fi
echo "App is running at http://localhost:$port"

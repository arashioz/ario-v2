#!/usr/bin/env bash
# Builds and starts the app behind nginx (http://<server-ip> on port 80).
#
#   ./scripts/deploy.sh                 # build + start
#   ./scripts/deploy.sh --seed [file]   # then load a full backup (see scripts/seed.sh)
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "Missing .env: cp .env.example .env and fill it in." >&2; exit 1; }
# .env holds values with spaces, so read single keys instead of sourcing it.
env_get() { grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'; }
port="$(env_get HTTP_PORT)"; port="${port:-80}"
old_dir="$(env_get OLD_APP_DIR)"

if [ -n "$old_dir" ] && [ -f "$old_dir/docker-compose.yml" ]; then
  echo "Stopping the previous app in $old_dir (its volumes are kept)..."
  (cd "$old_dir" && docker compose down)
fi

# This repo used to be project "ario-application" (the directory name). Those containers are not
# part of project ario-v2, so compose leaves them running and they keep port 27019.
legacy="$(docker ps -aq \
  --filter label=com.docker.compose.project=ario-application \
  --filter label=com.docker.compose.project.working_dir="$PWD" || true)"
if [ -n "$legacy" ]; then
  echo "Stopping leftover containers from the previous project name (volumes are kept)..."
  docker compose -p ario-application down
fi

others="$(docker ps --filter "publish=$port" --format '{{.Names}}' | grep -vx ariov2_nginx || true)"
if [ -n "$others" ]; then
  echo "Port $port is used by other containers ($others). Set a free HTTP_PORT in .env." >&2
  exit 1
fi

docker compose build
docker compose up -d --wait mongodb
docker compose up -d nginx

echo -n "Waiting for the app on port $port"
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$port/api" >/dev/null 2>&1; then echo " ok"; break; fi
  echo -n "."; sleep 2
done
curl -fsS "http://127.0.0.1:$port/api" >/dev/null 2>&1 || { echo; docker compose logs --tail 50 app; exit 1; }

if [ "${1:-}" = "--seed" ]; then ./scripts/seed.sh "${2:-backend/src/static/fullBackup.json}"; fi
echo "App is running at http://<server-ip> (port $port)"

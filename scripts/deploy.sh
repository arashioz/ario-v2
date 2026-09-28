#!/usr/bin/env bash
# Builds and starts the app behind nginx (http://<server-ip> on port 80).
#
#   ./scripts/deploy.sh                 # build + start
#   ./scripts/deploy.sh --seed [file]   # then load a full backup (see scripts/seed.sh)
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "Missing .env: cp .env.example .env and fill it in." >&2; exit 1; }
# .env holds values with spaces, so read single keys instead of sourcing it.
# `|| true` so a missing key returns empty instead of aborting the script under `set -e`.
env_get() { grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//' || true; }
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

# The app reaches MongoDB on the compose network. The host port is only for a shell on the server,
# so another stack may keep 27019 and this one moves to a free port (written into .env).
mongo_port="$(env_get MONGO_PORT)"; mongo_port="${mongo_port:-27019}"
port_holders() {
  docker ps --format '{{.Names}} {{.Ports}}' \
    | grep -E "(127\\.0\\.0\\.1|0\\.0\\.0\\.0|\\[::\\]):${1}->" \
    | awk '{print $1}' \
    | grep -vx ariov2_mongodb || true
}
mongo_holders="$(port_holders "$mongo_port")"
if [ -n "$mongo_holders" ]; then
  echo "Port $mongo_port is used by $mongo_holders. Publishing this MongoDB on 27029."
  mongo_port=27029
  mongo_holders="$(port_holders "$mongo_port")"
  if [ -n "$mongo_holders" ]; then
    echo "Port $mongo_port is also used by $mongo_holders. Set a free MONGO_PORT in .env." >&2
    exit 1
  fi
  if grep -q '^MONGO_PORT=' .env; then
    sed "s/^MONGO_PORT=.*/MONGO_PORT=$mongo_port/" .env > .env.tmp && mv .env.tmp .env
  else
    echo "MONGO_PORT=$mongo_port" >> .env
  fi
fi
export MONGO_PORT="$mongo_port"

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

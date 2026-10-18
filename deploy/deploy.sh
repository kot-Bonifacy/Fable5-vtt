#!/usr/bin/env bash
# Repeatable deploy on the VPS (stage 28): pull → build → migrations → restart.
# Migrations run in the server's entrypoint, before it listens.
#
#   cd /opt/docker-apps/vtt/deploy && ./deploy.sh            # pull + deploy
#   ./deploy.sh --no-pull                                    # deploy what is checked out
set -euo pipefail
cd "$(dirname "$0")"

[ -f .env.prod ] || { echo "deploy: no deploy/.env.prod — copy .env.prod.example and fill it" >&2; exit 1; }
set -a; . ./.env.prod; set +a
data_dir="${VTT_DATA_DIR:-/opt/docker-apps/vtt-data}"
network="${NPM_NETWORK:-npm_default}"

# Rulebook data is not in the repo and cannot be rebuilt from it (stage 13).
if [ ! -f "$data_dir/private/cpred/skills.json" ]; then
  echo "deploy: $data_dir/private/cpred/skills.json is missing — copy data/private/cpred first (docs/DEPLOY.md)" >&2
  exit 1
fi
[ -d "$data_dir/uploads/art" ] || echo "deploy: warning — $data_dir/uploads/art is missing, players get no welcome map" >&2
docker network inspect "$network" >/dev/null 2>&1 || {
  echo "deploy: Docker network $network not found — set NPM_NETWORK in .env.prod (docker network ls)" >&2
  exit 1
}
mkdir -p "$data_dir"/{db,uploads,private,backups}
if [ "$(stat -c %u "$data_dir/db")" != "1000" ]; then
  chown -R 1000:1000 "$data_dir"
fi

if [ "${1:-}" != "--no-pull" ]; then
  git -C .. pull --ff-only
fi
echo "deploy: $(git -C .. log -1 --format='%h %s')"

compose=(docker compose --env-file .env.prod)
# A snapshot right before new migrations touch the base (rotated like the hourly ones).
if [ "$(docker inspect -f '{{.State.Running}}' vtt-server 2>/dev/null || true)" = true ]; then
  "${compose[@]}" exec -T server node_modules/.bin/tsx scripts/snapshot.ts | sed -n 1p
fi
"${compose[@]}" build
"${compose[@]}" up -d
"${compose[@]}" ps

for _ in $(seq 1 45); do
  health="$(docker inspect -f '{{.State.Health.Status}}' vtt-server 2>/dev/null || true)"
  if [ "$health" = healthy ] && curl -fsS -o /dev/null http://127.0.0.1:8088/; then
    echo "deploy: server healthy, vtt-web answers on 127.0.0.1:8088"
    exit 0
  fi
  sleep 2
done
echo "deploy: not healthy after 90 s (server: ${health:-?}) — docker compose logs server" >&2
exit 1

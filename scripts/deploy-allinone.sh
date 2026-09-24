#!/usr/bin/env bash
# Executed on the droplet by .github/workflows/deploy.yml.
set -euo pipefail

: "${APP_DIR:?APP_DIR is required}" "${IMAGE_PREFIX:?IMAGE_PREFIX is required}"
: "${IMAGE_TAG:?IMAGE_TAG is required}" "${REGISTRY_USER:?REGISTRY_USER is required}"
: "${REGISTRY_PASSWORD:?REGISTRY_PASSWORD is required}"

if [[ ! "$IMAGE_TAG" =~ ^[0-9a-f]{40}$ ]]; then
  echo "IMAGE_TAG must be a full commit SHA."
  exit 1
fi

cd "$APP_DIR"
test -d .git
test -s .env.production
test -s .env.frontend
docker compose version

# Keep the same directory/project so the database, certificates and calendar
# network retain their existing names. Do not discard local tracked changes.
git diff --quiet
git diff --cached --quiet
git fetch origin "$IMAGE_TAG"
git checkout --detach "$IMAGE_TAG"

# Use the workflow's short-lived token for private GHCR images, then delete it.
DOCKER_CONFIG=$(mktemp -d)
export DOCKER_CONFIG
trap 'rm -rf -- "$DOCKER_CONFIG"' EXIT
printf '%s' "$REGISTRY_PASSWORD" | docker login ghcr.io -u "$REGISTRY_USER" --password-stdin
unset REGISTRY_PASSWORD

export IMAGE_PREFIX IMAGE_TAG
compose=(docker compose -f docker-compose.prod.allinone.yml)
"${compose[@]}" config --quiet

# Finish pulling before changing any running containers.
"${compose[@]}" pull

# Save the release selection for subsequent manual compose commands.
umask 077
printf 'IMAGE_PREFIX=%s\nIMAGE_TAG=%s\n' "$IMAGE_PREFIX" "$IMAGE_TAG" > .env.images

"${compose[@]}" up -d --no-build --wait --wait-timeout 120 postgres redis

# Prisma migrate deploy is a no-op when the database is already migrated.
# Recreate the one-off container so its previous exit status is never reused.
"${compose[@]}" up --no-build --no-deps --force-recreate --exit-code-from migrate migrate < /dev/null

# Wait for both application health checks before starting their dependants.
if ! "${compose[@]}" up -d --no-build --no-deps --wait --wait-timeout 180 server1 frontend; then
  "${compose[@]}" logs --no-color --tail 100 server1 frontend
  exit 1
fi
"${compose[@]}" up -d --no-build --no-deps --wait --wait-timeout 120 db-backup price-refresh discord-bot caddy turn

# Reload mounted routing configuration even when Caddy was not recreated.
"${compose[@]}" exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile

if [ -n "${WS_HEALTH_URL:-}" ]; then
  curl --fail --silent --show-error --retry 5 --retry-delay 2 --max-time 15 "$WS_HEALTH_URL"
fi
"${compose[@]}" ps
echo "Deployed $IMAGE_TAG using prebuilt images."

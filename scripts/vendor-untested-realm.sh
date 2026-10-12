#!/usr/bin/env bash
# Vendor the Untested Realm rules engine + search bot into vendor/untested-realm.
#
#   scripts/vendor-untested-realm.sh          # sync from OUR FORK's `realms` branch (default)
#   scripts/vendor-untested-realm.sh --check  # fail if the vendored files were edited here
#   scripts/vendor-untested-realm.sh --upstream [ref]
#                                             # sync from upstream directly, ignoring the fork
#
# WHERE THE CODE COMES FROM
#   upstream   DeliziosoJalapeno/Untested-realm — the real engine
#   fork       realms-cards/Untested-realm, branch `realms` — upstream plus the fixes upstream
#              has not merged yet
#   vendor/    a copy of `realms`. Never hand-edit it; the manifest check will catch you.
#
# ENGINE FIXES go in the fork, as ordinary commits, and upstream as pull requests — see
# scripts/untested-realm-fork.sh. Our own glue stays in src/lib/engine-mode/.
# Card images are deliberately not copied.
set -euo pipefail

UPSTREAM_REPO="https://github.com/DeliziosoJalapeno/Untested-realm.git"
FORK_REPO="https://github.com/realms-cards/Untested-realm.git"
FORK_BRANCH="realms"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/vendor/untested-realm"
MANIFEST="$DEST/UPSTREAM.sha256"

if [[ "${1:-}" == "--check" ]]; then
  (cd "$DEST" && shasum -a 256 -c --quiet UPSTREAM.sha256)
  echo "vendor/untested-realm matches its manifest"
  exit 0
fi

# By default we take our fork's `realms` branch, which is upstream plus whatever upstream has
# not merged yet. `--upstream` bypasses the fork, to see the engine exactly as shipped.
if [[ "${1:-}" == "--upstream" ]]; then
  REPO="$UPSTREAM_REPO"
  REF="${2:-main}"
  SOURCE="upstream"
else
  REPO="$FORK_REPO"
  REF="${1:-$FORK_BRANCH}"
  SOURCE="fork"
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git clone --quiet --filter=blob:none --no-checkout "$REPO" "$TMP/src"
git -C "$TMP/src" sparse-checkout set --no-cone /packages/shared/src /packages/shared/package.json \
  /packages/shared/tsconfig.json /packages/client/src/bot.ts /packages/client/src/bot_search.ts \
  /packages/client/src/bot.worker.ts
git -C "$TMP/src" checkout --quiet "$REF"
COMMIT="$(git -C "$TMP/src" rev-parse HEAD)"

rm -rf "$DEST"
mkdir -p "$DEST/shared" "$DEST/bot"
cp -R "$TMP/src/packages/shared/src" "$TMP/src/packages/shared/package.json" \
  "$TMP/src/packages/shared/tsconfig.json" "$DEST/shared/"
cp "$TMP/src/packages/client/src/bot.ts" "$TMP/src/packages/client/src/bot_search.ts" \
  "$TMP/src/packages/client/src/bot.worker.ts" "$DEST/bot/"

# Record the upstream commit this is based on as well, so the provenance survives even when
# we are tracking the fork.
BASE="$(git -C "$TMP/src" rev-parse HEAD)"
if [[ "$SOURCE" == "fork" ]]; then
  git -C "$TMP/src" remote add real "$UPSTREAM_REPO" 2>/dev/null || true
  git -C "$TMP/src" fetch --quiet --filter=blob:none real main 2>/dev/null || true
  BASE="$(git -C "$TMP/src" merge-base HEAD real/main 2>/dev/null || echo "$COMMIT")"
fi
printf '{\n  "source": "%s",\n  "repo": "%s",\n  "ref": "%s",\n  "commit": "%s",\n  "upstreamBase": "%s"\n}\n' \
  "$SOURCE" "$REPO" "$REF" "$COMMIT" "$BASE" > "$DEST/UPSTREAM.json"

(cd "$DEST" && find shared bot -type f | LC_ALL=C sort | xargs shasum -a 256 > UPSTREAM.sha256)
echo "Vendored Untested Realm from $SOURCE @ $COMMIT"

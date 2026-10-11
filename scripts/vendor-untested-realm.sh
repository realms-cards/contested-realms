#!/usr/bin/env bash
# Vendor the Untested Realm rules engine + search bot into vendor/untested-realm.
#
#   scripts/vendor-untested-realm.sh [ref]   # sync to a branch/tag/commit (default: main)
#   scripts/vendor-untested-realm.sh --check # fail if vendored files were edited locally
#
# The vendored tree is a pristine copy: never edit it. Fixes go upstream as PRs,
# our glue lives in src/lib/engine-mode/. Card images are deliberately not copied.
set -euo pipefail

REPO="https://github.com/DeliziosoJalapeno/Untested-realm.git"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/vendor/untested-realm"
MANIFEST="$DEST/UPSTREAM.sha256"

if [[ "${1:-}" == "--check" ]]; then
  (cd "$DEST" && shasum -a 256 -c --quiet UPSTREAM.sha256)
  echo "vendor/untested-realm matches its upstream manifest"
  exit 0
fi

REF="${1:-main}"
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

printf '{\n  "repo": "%s",\n  "commit": "%s"\n}\n' "$REPO" "$COMMIT" > "$DEST/UPSTREAM.json"
(cd "$DEST" && find shared bot -type f | LC_ALL=C sort | xargs shasum -a 256 > UPSTREAM.sha256)
echo "Vendored Untested Realm @ $COMMIT"

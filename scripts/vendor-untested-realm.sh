#!/usr/bin/env bash
# Vendor the Untested Realm rules engine + search bot into vendor/untested-realm.
#
#   scripts/vendor-untested-realm.sh [ref]    # sync to a branch/tag/commit (default: main)
#   scripts/vendor-untested-realm.sh --check  # fail if vendored files drifted from upstream+patches
#   scripts/vendor-untested-realm.sh --patch  # re-derive patches/ from the current vendor tree
#
# The vendored tree is upstream's, not ours: never hand-edit it. Our glue lives in
# src/lib/engine-mode/. Card images are deliberately not copied.
#
# ENGINE FIXES — the backport loop. When a bug is genuinely in the engine and cannot be
# worked around in the adapter:
#   1. make the change in vendor/, with a test in src/lib/engine-mode/ that fails without it
#   2. run --patch, which writes the diff to patches/untested-realm/ and re-stamps the manifest
#      so --check passes against "upstream + our patches" rather than bare upstream
#   3. send that same patch file upstream as a PR
#   4. when it lands, re-sync to the new ref and delete the patch; --check proves it is gone
# A patch file is a DEBT: it is carried only until upstream takes it.
set -euo pipefail

REPO="https://github.com/DeliziosoJalapeno/Untested-realm.git"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/vendor/untested-realm"
MANIFEST="$DEST/UPSTREAM.sha256"

PATCHES="$ROOT/patches/untested-realm"

restamp() {
  (cd "$DEST" && find shared bot -type f | LC_ALL=C sort | xargs shasum -a 256 > UPSTREAM.sha256)
}

if [[ "${1:-}" == "--check" ]]; then
  (cd "$DEST" && shasum -a 256 -c --quiet UPSTREAM.sha256)
  if compgen -G "$PATCHES/*.patch" > /dev/null; then
    echo "vendor/untested-realm matches its manifest (upstream + $(ls "$PATCHES"/*.patch | wc -l | tr -d ' ') local patch(es) awaiting upstream)"
  else
    echo "vendor/untested-realm matches its upstream manifest"
  fi
  exit 0
fi

# Re-derive the patch set from whatever is currently in vendor/, then re-stamp the manifest.
if [[ "${1:-}" == "--patch" ]]; then
  mkdir -p "$PATCHES"
  if git -C "$ROOT" diff --quiet -- vendor/untested-realm; then
    echo "vendor/untested-realm has no uncommitted changes to turn into a patch."
    exit 0
  fi
  OUT="$PATCHES/local-changes.patch"
  # paths are rewritten to upstream's layout so the file applies to their repo as-is
  git -C "$ROOT" diff -- vendor/untested-realm \
    | sed -e 's#a/vendor/untested-realm/shared/#a/packages/shared/#' \
          -e 's#b/vendor/untested-realm/shared/#b/packages/shared/#' \
          -e 's#a/vendor/untested-realm/bot/#a/packages/client/src/#' \
          -e 's#b/vendor/untested-realm/bot/#b/packages/client/src/#' > "$OUT"
  restamp
  echo "Wrote $OUT and re-stamped the manifest."
  echo "Send that file upstream; delete it here once the fix lands and re-sync."
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

# Re-apply any fix we are still carrying because upstream has not taken it yet. A patch that
# no longer applies means upstream changed that code — look at it rather than force it.
if compgen -G "$PATCHES/*.patch" > /dev/null; then
  for patch in "$PATCHES"/*.patch; do
    if git -C "$ROOT" apply --directory=vendor/untested-realm -p2 "$patch" 2>/dev/null; then
      echo "Re-applied $(basename "$patch")"
    else
      echo "WARNING: $(basename "$patch") no longer applies — upstream may have fixed or moved it."
      echo "         Check whether it can be dropped, then re-run --patch."
    fi
  done
fi

(cd "$DEST" && find shared bot -type f | LC_ALL=C sort | xargs shasum -a 256 > UPSTREAM.sha256)
echo "Vendored Untested Realm @ $COMMIT"

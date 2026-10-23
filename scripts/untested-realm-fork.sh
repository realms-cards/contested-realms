#!/usr/bin/env bash
# Work on our fork of the Untested Realm engine, so engine fixes are ordinary commits in a
# real repo and go upstream as pull requests.
#
#   scripts/untested-realm-fork.sh setup             # clone the fork, add upstream, install test deps
#   scripts/untested-realm-fork.sh status            # what upstream shipped, where our fixes stand
#   scripts/untested-realm-fork.sh check [ref]       # upstream's own gate: tsc + vitest + fuzzers
#   scripts/untested-realm-fork.sh branch <name>     # start fix/<name> off the upstream base branch
#   scripts/untested-realm-fork.sh pr <title>        # open a DRAFT pull request upstream
#   scripts/untested-realm-fork.sh land              # merge the current fix into `realms`, re-vendor
#   scripts/untested-realm-fork.sh sync [branch]     # merge an upstream branch into `realms`, re-vendor
#   scripts/untested-realm-fork.sh path              # print the working clone's path
#
# HOW THIS FITS TOGETHER
#   upstream/<base>  DeliziosoJalapeno/Untested-realm — the real engine (base: $UR_BASE, default main)
#   realms           our branch: upstream plus the fixes upstream has not taken YET
#   vendor/          a copy of `realms`, synced by scripts/vendor-untested-realm.sh
#
# A fix is one branch off the upstream base. Open the PR, then `land` it onto `realms` so our game
# gets it immediately. Branching off upstream rather than off `realms` keeps each PR free of our
# other pending fixes.
#
# `realms` only ever moves forward (merges, never rebases), so every commit vendor/UPSTREAM.json has
# pointed at stays reachable and nothing is ever force-pushed. When upstream merges one of our
# fixes, the next `sync` merge simply finds the change already there.
#
# Nothing reaches upstream or `realms` without `check` passing for that exact commit: upstream's
# typecheck, its full vitest suite and its script/cast/combat/raw-action fuzzers.
#
# The clone lives in .untested-realm-fork/ and is gitignored: it is a checkout, not content.
set -euo pipefail

FORK="realms-cards/Untested-realm"
UPSTREAM_SLUG="DeliziosoJalapeno/Untested-realm"
UPSTREAM="https://github.com/$UPSTREAM_SLUG.git"
BASE="${UR_BASE:-main}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$ROOT/.untested-realm-fork"
BRANCH="realms"
VENDOR_JSON="$ROOT/vendor/untested-realm/UPSTREAM.json"
PATCHES="$ROOT/shared/engine/scriptPatches.ts"
# keep in step with the sparse checkout in scripts/vendor-untested-realm.sh
VENDORED_PATHS=(packages/shared/src packages/shared/package.json packages/shared/tsconfig.json
  packages/client/src/bot.ts packages/client/src/bot_search.ts packages/client/src/bot.worker.ts)
FUZZERS=(fuzz_scripts fuzz_cast fuzz_combat fuzz_raw)
TEST_TIMEOUT="${UR_TEST_TIMEOUT:-600}"
STAMPS="$WORK/.git/ur-check"

g() { git -C "$WORK" "$@"; }

need_clone() {
  if [[ ! -d "$WORK/.git" ]]; then
    echo "No working clone yet — run: scripts/untested-realm-fork.sh setup" >&2
    exit 1
  fi
}

need_clean() {
  if [[ -n "$(g status --porcelain --untracked-files=no)" ]]; then
    echo "Uncommitted changes in $WORK — commit or stash them first." >&2
    exit 1
  fi
}

current_branch() { g rev-parse --abbrev-ref HEAD; }

vendored_commit() { sed -n 's/.*"commit": "\([0-9a-f]*\)".*/\1/p' "$VENDOR_JSON"; }

install_deps() {
  # only the engine package's test deps; upstream's lockfile is not ours to rewrite
  (cd "$WORK" && npm install --workspace @sorcery/shared --include-workspace-root=false \
    --no-audit --no-fund --loglevel=error)
  g checkout --quiet -- package-lock.json 2>/dev/null || true
}

# Run "$@" (in the background), killing it and its worker processes after $1 seconds.
# Returns 124 on timeout, like coreutils `timeout`, which macOS does not ship.
with_timeout() {
  local secs="$1" pid i=0
  shift
  "$@" &
  pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    if (( i >= secs )); then
      pkill -TERM -P "$pid" 2>/dev/null || true
      kill -TERM "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      return 124
    fi
    sleep 1
    i=$((i + 1))
  done
  wait "$pid"
}

# $1 = checkout, $2 = vitest config, $3 = log file
run_vitest() { cd "$1/packages/shared" && exec "$WORK/node_modules/.bin/vitest" run --config "$2" --root . > "$3" 2>&1; }
# $1 = checkout, $2 = fuzzer name, $3 = log file
# The clone has no tsconfig of its own at the root, so tsx would walk up to OURS — whose path alias
# sends `@sorcery/shared` to vendor/, i.e. the bot would run against the engine we vendored last
# time, not the commit being checked. An empty config keeps every import inside the checkout.
run_fuzzer() {
  echo '{}' > "$3.tsconfig.json"
  cd "$1" && TSX_TSCONFIG_PATH="$3.tsconfig.json" exec "$ROOT/node_modules/.bin/tsx" "scripts/$2.ts" > "$3" 2>&1
}

# Run upstream's own checks in directory $1. Prints a one-line summary on success.
run_checks() {
  local dir="$1" log config out n f rc
  log="$(mktemp -d)"
  # The clone sits inside our repo, so vitest would walk up and pick OUR vitest config ("No test
  # files found"). Our own config keeps upstream's defaults and only adds a hook that records each
  # test as it starts, so a test that never finishes can be named.
  cat > "$log/started.mjs" <<'EOF'
import { beforeEach } from 'vitest'
import { appendFileSync } from 'node:fs'
beforeEach((ctx) => {
  appendFileSync(process.env.UR_STARTED, `${ctx.task.file?.name} > ${ctx.task.suite?.name} > ${ctx.task.name}\n`)
})
EOF
  config="$log/vitest.config.mjs"
  echo "export default { test: { setupFiles: ['$log/started.mjs'] } }" > "$config"

  echo "  tsc --noEmit ..." >&2
  if ! (cd "$dir/packages/shared" && "$WORK/node_modules/.bin/tsc" --noEmit) > "$log/tsc.txt" 2>&1; then
    tail -20 "$log/tsc.txt" >&2; echo "FAILED: typecheck (log: $log/tsc.txt)" >&2; return 1
  fi

  echo "  vitest (upstream suite, ~1 min, gives up after ${TEST_TIMEOUT}s) ..." >&2
  rc=0
  UR_STARTED="$log/started.txt" with_timeout "$TEST_TIMEOUT" run_vitest "$dir" "$config" "$log/vitest.txt" || rc=$?
  if [[ "$rc" == "124" ]]; then
    # every finished file is listed with a ✓/×; a hung test sits in the one that never was
    sed -n 's/^ *[✓×↓] \(test\/[^ ]*\.test\.ts\).*/\1/p' "$log/vitest.txt" | sort -u > "$log/done.txt"
    echo "Still running after ${TEST_TIMEOUT}s — most likely an infinite loop. Last test started in each unfinished file:" >&2
    cut -d'>' -f1 "$log/started.txt" | sed 's/ *$//' | sort -u | while read -r file; do
      grep -qx "$file" "$log/done.txt" || grep "^$file " "$log/started.txt" | tail -1 | sed 's/^/  /' >&2
    done
    echo "FAILED: vitest timed out (logs: $log)" >&2; return 1
  elif [[ "$rc" != "0" ]]; then
    grep -E "FAIL|Test Files|Tests  " "$log/vitest.txt" | head -30 >&2
    echo "FAILED: vitest (log: $log/vitest.txt)" >&2; return 1
  fi
  out="$(grep -E "Tests  " "$log/vitest.txt" | sed "s/^ *Tests *//")"

  # the fuzzers always exit 0; their verdict is the "N crashes" in the summary line
  # (fuzz_raw arrived in 0.5.4 and says "N distinct crashes"; an older ref simply lacks it)
  local ran=()
  for f in "${FUZZERS[@]}"; do
    [[ -f "$dir/scripts/$f.ts" ]] || continue
    ran+=("$f")
    echo "  $f ..." >&2
    with_timeout 300 run_fuzzer "$dir" "$f" "$log/$f.txt" || true
    n="$(sed -n 's/^=== .*, \([0-9]*\) \(distinct \)*crashes ===$/\1/p' "$log/$f.txt" | head -1)"
    if [[ "$n" != "0" ]]; then
      grep -A15 "^===" "$log/$f.txt" | head -30 >&2
      echo "FAILED: $f reported ${n:-no summary} crashes (log: $log/$f.txt)" >&2; return 1
    fi
  done
  rm -rf "$log"
  echo "tsc clean; vitest $out; fuzzers ${ran[*]}: 0 crashes"
}

# Check commit $1 (default HEAD). A passing commit gets a stamp, so pr/land do not re-run it.
check_commit() {
  local ref="${1:-HEAD}" sha dir summary
  sha="$(g rev-parse "$ref^{commit}")"
  if [[ -f "$STAMPS/$sha" ]]; then
    echo "check already passed for ${sha:0:7}: $(cat "$STAMPS/$sha")"; return 0
  fi
  [[ -x "$WORK/node_modules/.bin/vitest" ]] || install_deps
  if [[ "$sha" == "$(g rev-parse HEAD)" && -z "$(g status --porcelain --untracked-files=no)" ]]; then
    dir="$WORK"
  else
    # anything other than a clean HEAD is checked in a throwaway worktree
    dir="$(mktemp -d)/wt"
    g worktree add --quiet --detach "$dir" "$sha"
    ln -s "$WORK/node_modules" "$dir/node_modules"
  fi
  echo "Checking ${sha:0:7} ($ref):"
  if summary="$(run_checks "$dir" | tail -1)"; then
    [[ "$dir" == "$WORK" ]] || g worktree remove --force "$dir"
    mkdir -p "$STAMPS"; echo "$summary" > "$STAMPS/$sha"
    echo "PASSED ${sha:0:7}: $summary"
  else
    [[ "$dir" == "$WORK" ]] || g worktree remove --force "$dir"
    return 1
  fi
}

# Would merging $2 into $1 conflict? Prints the conflicting files, if any. Leaves no trace.
trial_merge() {
  local dir rc=0
  dir="$(mktemp -d)/wt"
  g worktree add --quiet --detach "$dir" "$1"
  if ! git -C "$dir" merge --quiet --no-commit --no-ff "$2" > /dev/null 2>&1; then
    git -C "$dir" diff --name-only --diff-filter=U | sed 's/^/      conflict: /'
    rc=1
  fi
  g worktree remove --force "$dir"
  return $rc
}

case "${1:-}" in
  setup)
    if [[ -d "$WORK/.git" ]]; then
      echo "Already cloned at $WORK"
    else
      gh repo clone "$FORK" "$WORK" -- --quiet
      g remote add upstream "$UPSTREAM" 2>/dev/null || true
    fi
    g fetch --quiet upstream
    if ! g show-ref --quiet "refs/heads/$BRANCH"; then
      if g ls-remote --exit-code --heads origin "$BRANCH" > /dev/null; then
        g branch --quiet --track "$BRANCH" "origin/$BRANCH"
      else
        g checkout --quiet -b "$BRANCH" "upstream/$BASE"
        g push --quiet -u origin "$BRANCH"
      fi
    fi
    install_deps
    echo "Fork ready at $WORK (branch: $BRANCH, upstream: $UPSTREAM, base: $BASE)"
    ;;

  status)
    need_clone
    g fetch --quiet --prune upstream
    g fetch --quiet --prune origin
    VENDORED="$(vendored_commit)"
    echo "== Vendored: ${VENDORED:0:7} (vendor/untested-realm/UPSTREAM.json)"
    if g diff --quiet "$VENDORED" "origin/$BRANCH" -- "${VENDORED_PATHS[@]}"; then
      echo "   vendor/ is up to date with origin/$BRANCH"
    else
      echo "   origin/$BRANCH changed vendored files since — run: scripts/vendor-untested-realm.sh"
    fi
    if [[ "$(g rev-parse "$BRANCH")" != "$(g rev-parse "origin/$BRANCH")" ]]; then
      echo "   WARNING: local $BRANCH differs from origin/$BRANCH — push or reconcile it"
    fi

    echo
    echo "== Upstream branches with commits $BRANCH does not have:"
    FOUND=0
    for ref in $(g for-each-ref --format='%(refname:short)' refs/remotes/upstream); do
      [[ "$ref" == "upstream/HEAD" ]] && continue
      AHEAD="$(g rev-list --count "$BRANCH..$ref")"
      [[ "$AHEAD" == "0" ]] && continue
      FOUND=1
      echo "   $ref — $AHEAD commit(s), last $(g log -1 --format='%cs' "$ref")"
      g --no-pager log --format='      %h %s' --max-count=5 "$BRANCH..$ref" | cut -c1-110
      if trial_merge "$BRANCH" "$ref"; then
        echo "      merges cleanly into $BRANCH"
      else
        echo "      CONFLICTS with $BRANCH (files above)"
      fi
      SHIPPED="$(g diff --name-only "$BRANCH...$ref" -- packages/shared/src/cards/scripts \
        | sed -n 's#.*/\([^/]*\)\.ts$#\1#p' | tr '\n' ' ')"
      [[ -z "$SHIPPED" ]] || echo "      touches card scripts: $SHIPPED" | cut -c1-200
    done
    [[ "$FOUND" == "1" ]] || echo "   none — upstream has nothing new"

    echo
    echo "== Our fix branches:"
    for b in $(g for-each-ref --format='%(refname:short)' 'refs/heads/fix/*'); do
      if [[ -z "$(g cherry "upstream/$BASE" "$b" | grep '^+' || true)" ]]; then
        STATE="in upstream/$BASE — delete the branch"
      else
        PR="$(gh pr list --repo "$UPSTREAM_SLUG" --head "$b" --state all \
          --json number,state,isDraft --jq '.[0] | if . then "PR #\(.number) \(.state)\(if .isDraft then " (draft)" else "" end)" else "" end' 2>/dev/null || true)"
        STATE="${PR:-no PR yet}"
      fi
      g merge-base --is-ancestor "$b" "$BRANCH" || STATE="$STATE, NOT landed in $BRANCH"
      g show-ref --quiet "refs/remotes/origin/$b" || STATE="$STATE, NOT pushed"
      echo "   $b — $STATE"
    done

    echo
    echo "== Runtime workarounds in shared/engine/scriptPatches.ts (each should become a fix branch):"
    grep -E '^ \* [A-Z].* — WORKAROUND' "$PATCHES" | sed 's/^ \* /   /; s/ — WORKAROUND for vendor / → /; s/:.*//' || echo "   none"
    ;;

  check)
    need_clone
    check_commit "${2:-HEAD}"
    ;;

  branch)
    need_clone
    need_clean
    [[ -n "${2:-}" ]] || { echo "usage: $0 branch <name>   (UR_BASE=<branch> to start elsewhere)" >&2; exit 1; }
    g fetch --quiet upstream
    # off UPSTREAM, never off `realms`: a PR must not carry our other pending fixes
    g checkout --quiet -b "fix/$2" "upstream/$BASE"
    g push --quiet -u origin "fix/$2"
    echo "On fix/$2 (from upstream/$BASE) in $WORK, pushed to the fork."
    echo "Add a failing test under packages/shared/test/ first, then the smallest fix that passes it."
    ;;

  pr)
    need_clone
    need_clean
    [[ -n "${2:-}" ]] || { echo "usage: $0 pr <title>" >&2; exit 1; }
    CURRENT="$(current_branch)"
    [[ "$CURRENT" == fix/* ]] || { echo "Run pr from a fix/* branch (on $CURRENT)." >&2; exit 1; }
    g fetch --quiet upstream
    [[ -n "$(g rev-list "upstream/$BASE..HEAD")" ]] || { echo "$CURRENT has no commits." >&2; exit 1; }
    BODY="$WORK/.git/pr-body-${CURRENT//\//-}.md"
    if [[ ! -f "$BODY" ]]; then
      check_commit HEAD
      SUMMARY="$(cat "$STAMPS/$(g rev-parse HEAD)")"
      {
        echo "## Problem"
        echo
        echo "<!-- what goes wrong in a game: card, situation, what happens vs what should -->"
        echo
        echo "## Rules reference"
        echo
        echo "<!-- rulebook / FAQ / codex entry this follows -->"
        echo
        echo "## Change"
        echo
        g --no-pager log --reverse --format='- %s' "upstream/$BASE..HEAD"
        echo
        echo "## Tests"
        echo
        g diff --name-only --diff-filter=AM "upstream/$BASE...HEAD" -- packages/shared/test \
          | sed 's/^/- `/; s/$/`/'
        echo
        echo "Checked locally: $SUMMARY."
        echo
        echo "Found while running the engine in [realms.cards](https://realms.cards)."
      } > "$BODY"
      echo "Wrote the PR description to:"
      echo "  $BODY"
      echo "Fill in Problem and Rules reference, then run the same command again to open the PR."
      exit 0
    fi
    if grep -q '<!--' "$BODY"; then
      echo "$BODY still has template placeholders (<!-- ... -->) — fill them in first." >&2; exit 1
    fi
    check_commit HEAD
    g push --quiet -u origin "$CURRENT"
    # a draft first, so the description can be read on GitHub before the maintainer is pinged
    (cd "$WORK" && gh pr create --draft --repo "$UPSTREAM_SLUG" --head "realms-cards:$CURRENT" \
      --base "$BASE" --title "$2" --body-file "$BODY")
    echo "Draft opened. Mark it ready for review on GitHub when it reads right, then: $0 land"
    ;;

  land)
    need_clone
    need_clean
    CURRENT="$(current_branch)"
    [[ "$CURRENT" == fix/* ]] || { echo "Run land from a fix/* branch (on $CURRENT)." >&2; exit 1; }
    check_commit HEAD
    g push --quiet -u origin "$CURRENT"
    g fetch --quiet origin
    g checkout --quiet "$BRANCH"
    g merge --quiet --ff-only "origin/$BRANCH"
    g merge --quiet --no-edit "$CURRENT"
    # the fix passed on its own; the merged result must too
    if ! check_commit HEAD; then
      g reset --quiet --hard "origin/$BRANCH"
      g checkout --quiet "$CURRENT"
      echo "Not landed: $CURRENT breaks upstream's checks when combined with $BRANCH." >&2
      exit 1
    fi
    g push --quiet origin "$BRANCH"
    echo "Merged $CURRENT into $BRANCH. Re-vendoring:"
    "$ROOT/scripts/vendor-untested-realm.sh"
    echo
    echo "Now, in sorcery-client: delete the scriptPatches.ts entry this fix replaces (if any),"
    echo "run npx tsc --noEmit + npm test -- src/lib/engine-mode src/components/engine-mode, and commit"
    echo "vendor/ together with it."
    ;;

  sync)
    need_clone
    need_clean
    FROM="${2:-$BASE}"
    g fetch --quiet upstream
    g fetch --quiet origin
    g checkout --quiet "$BRANCH"
    g merge --quiet --ff-only "origin/$BRANCH"
    if [[ "$(g rev-list --count "$BRANCH..upstream/$FROM")" == "0" ]]; then
      echo "$BRANCH already contains upstream/$FROM."; exit 0
    fi
    # merge, never rebase: `realms` is published and vendor/ records its commits
    if ! g merge --no-edit -m "Merge upstream/$FROM into $BRANCH" "upstream/$FROM"; then
      echo "Merge stopped: upstream changed code one of our fixes touches." >&2
      echo "Resolve in $WORK, commit, then re-run: $0 sync $FROM" >&2
      exit 1
    fi
    if ! check_commit HEAD; then
      g reset --quiet --hard "origin/$BRANCH"
      echo "Not synced: upstream/$FROM + our fixes fail upstream's checks (see above)." >&2
      exit 1
    fi
    g push --quiet origin "$BRANCH"
    echo "Merged upstream/$FROM into $BRANCH. Fixes upstream has not taken:"
    g --no-pager log --no-merges --format='  %h %s' "upstream/$FROM..$BRANCH"
    echo "Re-vendoring:"
    "$ROOT/scripts/vendor-untested-realm.sh"
    echo
    echo "Now, in sorcery-client: delete scriptPatches.ts entries upstream fixed, run npx tsc --noEmit and"
    echo "npm test -- src/lib/engine-mode src/components/engine-mode, play one match vs the CPU, and commit"
    echo "vendor/. Saved engine games from the old engine commit will be discarded on load."
    ;;

  path)
    echo "$WORK"
    ;;

  *)
    sed -n '2,30p' "$0"
    exit 1
    ;;
esac

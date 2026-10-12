#!/usr/bin/env bash
# Work on our fork of the Untested Realm engine, so engine fixes are ordinary commits in a
# real repo and go upstream as pull requests.
#
#   scripts/untested-realm-fork.sh setup              # clone the fork, add upstream, make `realms`
#   scripts/untested-realm-fork.sh sync               # pull upstream main and rebase `realms` on it
#   scripts/untested-realm-fork.sh branch <name>      # start a fix branch off upstream/main
#   scripts/untested-realm-fork.sh pr <title>         # push the branch and open a PR upstream
#   scripts/untested-realm-fork.sh land               # merge the current branch into `realms`
#   scripts/untested-realm-fork.sh path               # print the working clone's path
#
# HOW THIS FITS TOGETHER
#   upstream/main  DeliziosoJalapeno/Untested-realm — the real engine
#   realms         our branch: upstream/main plus the fixes upstream has not taken YET
#   vendor/        a copy of `realms`, synced by scripts/vendor-untested-realm.sh
#
# A fix is one branch off upstream/main. Open the PR, then `land` it onto `realms` so our game
# gets it immediately. When upstream merges, the next `sync` rebase drops it automatically —
# that is the whole point of branching off upstream rather than off `realms`.
#
# The clone lives in .untested-realm-fork/ and is gitignored: it is a checkout, not content.
set -euo pipefail

FORK="realms-cards/Untested-realm"
UPSTREAM="https://github.com/DeliziosoJalapeno/Untested-realm.git"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$ROOT/.untested-realm-fork"
BRANCH="realms"

need_clone() {
  if [[ ! -d "$WORK/.git" ]]; then
    echo "No working clone yet — run: scripts/untested-realm-fork.sh setup" >&2
    exit 1
  fi
}

case "${1:-}" in
  setup)
    if [[ -d "$WORK/.git" ]]; then
      echo "Already cloned at $WORK"
    else
      gh repo clone "$FORK" "$WORK" -- --quiet
      git -C "$WORK" remote add upstream "$UPSTREAM" 2>/dev/null || true
    fi
    git -C "$WORK" fetch --quiet upstream
    # `realms` carries our not-yet-accepted fixes on top of upstream
    if ! git -C "$WORK" show-ref --quiet "refs/heads/$BRANCH"; then
      git -C "$WORK" checkout --quiet -b "$BRANCH" upstream/main
      git -C "$WORK" push --quiet -u origin "$BRANCH"
    fi
    echo "Fork ready at $WORK (branch: $BRANCH, upstream: $UPSTREAM)"
    ;;

  sync)
    need_clone
    git -C "$WORK" fetch --quiet upstream origin
    git -C "$WORK" checkout --quiet "$BRANCH"
    # rebase, so anything upstream has merged disappears from our branch by itself
    if git -C "$WORK" rebase --quiet upstream/main; then
      git -C "$WORK" push --quiet --force-with-lease origin "$BRANCH"
      AHEAD="$(git -C "$WORK" rev-list --count upstream/main.."$BRANCH")"
      echo "Rebased $BRANCH on upstream/main — carrying $AHEAD fix(es) upstream has not taken."
      git -C "$WORK" --no-pager log --oneline "upstream/main..$BRANCH" | sed 's/^/  /'
    else
      echo "Rebase stopped: upstream changed code one of our fixes touches." >&2
      echo "Resolve in $WORK, then: git rebase --continue" >&2
      exit 1
    fi
    ;;

  branch)
    need_clone
    [[ -n "${2:-}" ]] || { echo "usage: $0 branch <name>" >&2; exit 1; }
    git -C "$WORK" fetch --quiet upstream
    # off UPSTREAM, never off `realms`: a PR must not carry our other pending fixes
    git -C "$WORK" checkout --quiet -b "fix/$2" upstream/main
    echo "On fix/$2 (from upstream/main) in $WORK"
    ;;

  pr)
    need_clone
    [[ -n "${2:-}" ]] || { echo "usage: $0 pr <title>" >&2; exit 1; }
    CURRENT="$(git -C "$WORK" rev-parse --abbrev-ref HEAD)"
    [[ "$CURRENT" != "$BRANCH" ]] || { echo "Refusing to PR the $BRANCH branch itself." >&2; exit 1; }
    git -C "$WORK" push --quiet -u origin "$CURRENT"
    (cd "$WORK" && gh pr create --repo "$(gh repo view "$FORK" --json parent --jq '.parent.owner.login + "/" + .parent.name')" \
      --head "realms-cards:$CURRENT" --base main --title "$2" --body-file -)
    ;;

  land)
    need_clone
    CURRENT="$(git -C "$WORK" rev-parse --abbrev-ref HEAD)"
    [[ "$CURRENT" != "$BRANCH" ]] || { echo "Already on $BRANCH." >&2; exit 1; }
    git -C "$WORK" checkout --quiet "$BRANCH"
    git -C "$WORK" merge --quiet --no-edit "$CURRENT"
    git -C "$WORK" push --quiet origin "$BRANCH"
    echo "Merged $CURRENT into $BRANCH. Re-sync the vendor copy:"
    echo "  scripts/vendor-untested-realm.sh --fork"
    ;;

  path)
    echo "$WORK"
    ;;

  *)
    sed -n '2,20p' "$0"
    exit 1
    ;;
esac

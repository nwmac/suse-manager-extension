#!/usr/bin/env bash
#
# Release a new version of the SUSE Multi-Linux Manager UI extension.
#
# What it does:
#   1. Verifies the working tree is clean and the current branch is `main`.
#   2. Ensures the local main is up-to-date with origin/main.
#   3. Rewrites the "version" field in package.json to the given version.
#   4. Commits the bump ("Release vX.Y.Z") and pushes to origin/main.
#   5. Creates and pushes an annotated tag vX.Y.Z.
#   6. If `gh` is available, tails the resulting build-extension workflow run.
#
# The push to main triggers .github/workflows/build-extension.yml, which
# publishes the extension to the gh-pages branch. The tag anchors that release
# to a specific commit so consumers can pin against it.
#
# Usage:
#   scripts/release-extension.sh <version>
#   scripts/release-extension.sh 0.2.0
#
# Options:
#   --no-push   Bump, commit and tag locally but don't push (dry-ish run).
#   --yes       Skip the interactive confirmation before pushing.

set -euo pipefail

VERSION=""
DO_PUSH=1
ASSUME_YES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-push) DO_PUSH=0 ;;
    --yes|-y)  ASSUME_YES=1 ;;
    -h|--help)
      sed -n '2,25p' "$0"
      exit 0
      ;;
    -*)
      echo "Unknown flag: $1" >&2
      exit 1
      ;;
    *)
      if [[ -n "$VERSION" ]]; then
        echo "Multiple positional args; only <version> is expected." >&2
        exit 1
      fi
      VERSION="$1"
      ;;
  esac
  shift
done

if [[ -z "$VERSION" ]]; then
  echo "Usage: scripts/release-extension.sh <version> [--no-push] [--yes]" >&2
  exit 1
fi

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "Version must look like MAJOR.MINOR.PATCH (optionally with a -prerelease suffix); got: $VERSION" >&2
  exit 1
fi

TAG="suse-manager-$VERSION"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# --- preflight ---------------------------------------------------------------

BRANCH="$(git symbolic-ref --short HEAD)"
if [[ "$BRANCH" != "main" ]]; then
  echo "Current branch is '$BRANCH'; releases must be cut from 'main'." >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree has uncommitted changes; commit or stash them first." >&2
  git status --short >&2
  exit 1
fi

echo "Fetching origin..."
git fetch origin main --quiet

LOCAL_HEAD="$(git rev-parse HEAD)"
REMOTE_HEAD="$(git rev-parse origin/main)"
if [[ "$LOCAL_HEAD" != "$REMOTE_HEAD" ]]; then
  echo "Local main is not in sync with origin/main." >&2
  echo "  local : $LOCAL_HEAD" >&2
  echo "  origin: $REMOTE_HEAD" >&2
  echo "Pull/rebase before releasing." >&2
  exit 1
fi

if git rev-parse --verify "refs/tags/$TAG" >/dev/null 2>&1; then
  echo "Tag $TAG already exists locally." >&2
  exit 1
fi

if git ls-remote --exit-code --tags origin "$TAG" >/dev/null 2>&1; then
  echo "Tag $TAG already exists on origin." >&2
  exit 1
fi

CURRENT_VERSION="$(node -p "require('./package.json').version")"
echo "Current version: $CURRENT_VERSION"
echo "New version    : $VERSION"

if [[ "$CURRENT_VERSION" == "$VERSION" ]]; then
  echo "package.json already reports $VERSION; nothing to bump." >&2
  exit 1
fi

# --- bump --------------------------------------------------------------------

# `npm version` would run git ops on its own — do the rewrite ourselves so we
# stay in control of the commit and tag.
node -e '
  const fs = require("fs");
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  pkg.version = process.argv[1];
  fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
' "$VERSION"

# Refresh the yarn.lock resolution of our own package (if listed) so it stays
# consistent. Ignore failures — the lockfile does not always contain a self-ref.
yarn install --silent >/dev/null 2>&1 || true

git add package.json
if ! git diff --cached --quiet -- yarn.lock; then
  # only stage yarn.lock if the bump actually changed it
  git add yarn.lock
fi

git commit -m "Release $TAG"

git tag -a "$TAG" -m "Release $TAG"

echo
echo "Prepared release commit and tag $TAG:"
git --no-pager log -1 --oneline
git --no-pager show-ref --tags "$TAG"

# --- push --------------------------------------------------------------------

if [[ "$DO_PUSH" -eq 0 ]]; then
  echo
  echo "--no-push given; leaving the commit + tag local. To push manually:"
  echo "  git push origin main"
  echo "  git push origin $TAG"
  exit 0
fi

if [[ "$ASSUME_YES" -eq 0 ]]; then
  echo
  read -r -p "Push commit and tag to origin? [y/N] " REPLY
  if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
    echo "Aborted before push. Local state left as-is."
    exit 1
  fi
fi

git push origin main
git push origin "$TAG"

echo
echo "Pushed $TAG. build-extension.yml will publish the extension chart."

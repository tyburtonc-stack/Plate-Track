#!/usr/bin/env bash
# Undo blue theme on main without losing history (git revert).
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v git >/dev/null 2>&1; then
  echo "Error: git not found. Install Xcode Command Line Tools: xcode-select --install"
  exit 1
fi

HASH=""
if [[ -f .blue-theme-commit-hash ]]; then
  HASH=$(cat .blue-theme-commit-hash)
fi

if [[ -z "$HASH" ]]; then
  # Find commit by message
  HASH=$(git log --oneline --grep='Add blue color theme' -1 --format=%H 2>/dev/null || true)
fi

if [[ -z "$HASH" ]]; then
  echo "Could not find blue theme commit. Options:"
  echo "  1) git log --oneline   # find hash, then: git revert <hash>"
  echo "  2) git reset --hard pre-blue-theme && git push --force-with-lease origin main"
  exit 1
fi

echo "Reverting commit $HASH ..."
git revert "$HASH" --no-edit
git push origin main
echo "Blue theme reverted on main. Purple/gold only."

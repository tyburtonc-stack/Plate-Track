#!/usr/bin/env bash
# Push blue theme as a single commit + pre-blue-theme tag (easy revert).
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v git >/dev/null 2>&1; then
  echo "Error: git not found. Install Xcode Command Line Tools: xcode-select --install"
  exit 1
fi

if git diff --quiet index.html README.md 2>/dev/null && git diff --cached --quiet index.html README.md 2>/dev/null; then
  echo "No changes in index.html or README.md — already committed?"
  git log -1 --oneline
  exit 0
fi

# Tag current main before the theme commit (skip if tag already exists)
if git rev-parse pre-blue-theme >/dev/null 2>&1; then
  echo "Tag pre-blue-theme already exists at $(git rev-parse --short pre-blue-theme)"
else
  git tag -a pre-blue-theme -m "Snapshot before blue theme (easy revert)"
  echo "Tagged pre-blue-theme at $(git rev-parse --short pre-blue-theme)"
fi

git add index.html README.md scripts/push-blue-theme.sh scripts/revert-blue-theme.sh
git commit -m "$(cat <<'EOF'
Add blue color theme

Purple, gold, and blue appearance options in Profile. Single commit for easy revert.
EOF
)"

HASH=$(git rev-parse HEAD)
echo "$HASH" > .blue-theme-commit-hash
echo "Committed: $HASH"
echo "Saved hash to .blue-theme-commit-hash"

git push -u origin main
git push origin pre-blue-theme

echo ""
echo "Done. Revert later with: ./scripts/revert-blue-theme.sh"
echo "Live URL (after enabling GitHub Pages on main / root):"
echo "  https://tyburtonc-stack.github.io/Plate-Track/"

#!/usr/bin/env bash
# package.sh — Build and package pe-sub-ui for standalone deployment
# Run from the project root:  bash scripts/package.sh [version]
#
# Output: dist/pe-sub-ui-v<version>.tar.gz

set -euo pipefail

# Bump package.json before building: explicit arg sets it, otherwise patch++.
if [ -n "${1:-}" ]; then
  npm version "$1" --no-git-tag-version --allow-same-version >/dev/null
else
  npm version patch --no-git-tag-version >/dev/null
fi
VERSION=$(node -p "require('./package.json').version")
STAGE_DIR="pe-sub-ui-v${VERSION}"
ARCHIVE="dist/pe-sub-ui-v${VERSION}.tar.gz"

echo ""
echo "==> Building pe-sub-ui v${VERSION}"

echo "--> npm install"
npm install --prefer-offline

echo "--> npm run build"
npm run build

[ -f dist/index.html ] || { echo "ERROR: dist/index.html not found"; exit 1; }

echo "--> Creating archive: ${ARCHIVE}"
rm -rf "${STAGE_DIR}"
mkdir -p "${STAGE_DIR}"
cp -r dist/. "${STAGE_DIR}/"
rm -f "${ARCHIVE}"
tar -czf "${ARCHIVE}" "${STAGE_DIR}"
rm -rf "${STAGE_DIR}"

SIZE=$(du -sh "${ARCHIVE}" | cut -f1)
echo ""
echo "==> Package ready: ${ARCHIVE} (${SIZE})"
echo ""

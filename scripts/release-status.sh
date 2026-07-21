#!/bin/bash
# Shows build/notarization/publish status for a jebi release version.
#
# Usage: VERSION=0.1.25 bash scripts/release-status.sh

set -euo pipefail

VERSION="${VERSION:?VERSION is required, e.g. VERSION=0.1.25}"
NOTARY_PROFILE="${NOTARY_PROFILE:-jebi-notary}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/release-output/$VERSION"
BUILD_STATE="$OUT_DIR/.release-build-state"
PUBLISH_STATE="$OUT_DIR/.release-publish-state"

echo "jebi release status — v$VERSION"
echo "output dir: $OUT_DIR"
echo

if [ ! -d "$OUT_DIR" ]; then
  echo "No release-output directory for $VERSION yet."
  exit 0
fi

echo "-- build artifacts --"
for f in "jebi-${VERSION}-arm64.dmg" "jebi-${VERSION}-arm64.zip" "SHA256SUMS.txt"; do
  if [ -f "$OUT_DIR/$f" ]; then
    echo "  [x] $f"
  else
    echo "  [ ] $f"
  fi
done
echo

if [ -f "$BUILD_STATE" ]; then
  # shellcheck disable=SC1090
  source "$BUILD_STATE"
  echo "-- notarization --"
  echo "  submission id: ${SUBMISSION_ID:-unknown}"
  if [ -n "${SUBMISSION_ID:-}" ]; then
    xcrun notarytool info "$SUBMISSION_ID" --keychain-profile "$NOTARY_PROFILE" 2>&1 | sed 's/^/  /' || true
  fi
  echo
fi

echo "-- publish steps --"
for step in tag_pushed release_created assets_uploaded tap_updated release_published; do
  if [ -f "$PUBLISH_STATE" ] && grep -qx "$step" "$PUBLISH_STATE"; then
    echo "  [x] $step"
  else
    echo "  [ ] $step"
  fi
done

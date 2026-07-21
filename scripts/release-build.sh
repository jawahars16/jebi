#!/bin/bash
# Builds, signs, notarizes, staples and packages a jebi release.
#
# Usage:
#   VERSION=0.1.25 bash scripts/release-build.sh
#   VERSION=0.1.25 RESUME_NOTARIZATION=1 bash scripts/release-build.sh
#
# Env:
#   VERSION              required, e.g. 0.1.25
#   RESUME_NOTARIZATION  1 to resume polling an already-submitted notarization
#   NOTARY_PROFILE       keychain profile name (default: jebi-notary)

set -euo pipefail

VERSION="${VERSION:?VERSION is required, e.g. VERSION=0.1.25}"
RESUME_NOTARIZATION="${RESUME_NOTARIZATION:-0}"
NOTARY_PROFILE="${NOTARY_PROFILE:-jebi-notary}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CORE_DIR="$ROOT_DIR/core"
APP_DIR="$ROOT_DIR/app"
APP_BUNDLE="$APP_DIR/dist/mac-arm64/jebi.app"
OUT_DIR="$ROOT_DIR/release-output/$VERSION"
STATE_FILE="$OUT_DIR/.release-build-state"

POLL_INTERVAL_SECS=30
POLL_MAX_SECS=$((60 * 60))

log() { echo "[release-build] $*"; }
fail() { echo "[release-build] ERROR: $*" >&2; exit 1; }

json_get() {
  # json_get <key> reads json from stdin
  python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('$1',''))"
}

save_state() {
  mkdir -p "$OUT_DIR"
  {
    echo "SUBMISSION_ID=$SUBMISSION_ID"
    echo "SUBMISSION_ZIP=$SUBMISSION_ZIP"
  } > "$STATE_FILE"
}

load_state() {
  [ -f "$STATE_FILE" ] || fail "no state file at $STATE_FILE — cannot resume. Run without RESUME_NOTARIZATION first."
  # shellcheck disable=SC1090
  source "$STATE_FILE"
  [ -n "${SUBMISSION_ID:-}" ] || fail "state file missing SUBMISSION_ID"
}

do_build() {
  log "Cleaning app/dist and $OUT_DIR"
  rm -rf "$APP_DIR/dist" "$OUT_DIR"
  mkdir -p "$OUT_DIR"

  log "Setting app/package.json version to $VERSION"
  node -e "
    const fs = require('fs');
    const p = JSON.parse(fs.readFileSync('$APP_DIR/package.json'));
    p.version = '$VERSION';
    fs.writeFileSync('$APP_DIR/package.json', JSON.stringify(p, null, 2) + '\n');
  "

  log "Downloading llama dependencies"
  bash "$ROOT_DIR/scripts/download-deps.sh"

  log "Building Go core"
  (cd "$CORE_DIR" && go build -o term-core .)

  log "Building and signing Electron app (npm run build && npm run pack)"
  (cd "$APP_DIR" && npm run build && npm run pack)

  [ -d "$APP_BUNDLE" ] || fail "expected signed app bundle at $APP_BUNDLE, not found"

  SUBMISSION_ZIP="$APP_DIR/dist/jebi-${VERSION}-arm64.zip"
  [ -f "$SUBMISSION_ZIP" ] || fail "expected build zip at $SUBMISSION_ZIP, not found"

  log "Submitting $SUBMISSION_ZIP to Apple notary service (profile: $NOTARY_PROFILE)"
  SUBMIT_JSON=$(xcrun notarytool submit "$SUBMISSION_ZIP" --keychain-profile "$NOTARY_PROFILE" --output-format json)
  SUBMISSION_ID=$(echo "$SUBMIT_JSON" | json_get id)
  [ -n "$SUBMISSION_ID" ] || fail "could not parse submission id from notarytool output: $SUBMIT_JSON"

  log "Submission id: $SUBMISSION_ID"
  save_state
}

poll_notarization() {
  log "Polling notarization status for submission $SUBMISSION_ID (up to $((POLL_MAX_SECS / 60)) minutes)"
  local elapsed=0
  while [ "$elapsed" -lt "$POLL_MAX_SECS" ]; do
    INFO_JSON=$(xcrun notarytool info "$SUBMISSION_ID" --keychain-profile "$NOTARY_PROFILE" --output-format json)
    STATUS=$(echo "$INFO_JSON" | json_get status)
    log "status: $STATUS (elapsed ${elapsed}s)"

    case "$STATUS" in
      Accepted)
        return 0
        ;;
      "Invalid"|"Rejected")
        fail "notarization $STATUS for submission $SUBMISSION_ID. Run: xcrun notarytool log $SUBMISSION_ID --keychain-profile $NOTARY_PROFILE"
        ;;
      *)
        sleep "$POLL_INTERVAL_SECS"
        elapsed=$((elapsed + POLL_INTERVAL_SECS))
        ;;
    esac
  done

  log "Still in progress after $((POLL_MAX_SECS / 60)) minutes — exiting safely."
  log "Resume later with: make release-build VERSION=$VERSION RESUME_NOTARIZATION=1"
  exit 0
}

finalize() {
  log "Stapling notarization ticket to $APP_BUNDLE"
  xcrun stapler staple "$APP_BUNDLE"

  local dmg_path="$OUT_DIR/jebi-${VERSION}-arm64.dmg"
  local zip_path="$OUT_DIR/jebi-${VERSION}-arm64.zip"

  log "Creating final notarized ZIP: $zip_path"
  ditto -c -k --keepParent "$APP_BUNDLE" "$zip_path"

  log "Creating final notarized DMG: $dmg_path"
  staging_dir=$(mktemp -d)
  trap 'rm -rf "${staging_dir:-}"' EXIT
  cp -R "$APP_BUNDLE" "$staging_dir/"
  ln -s /Applications "$staging_dir/Applications"
  hdiutil create -volname "jebi $VERSION" -srcfolder "$staging_dir" -ov -format UDZO "$dmg_path"

  log "Validating codesign"
  codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE"

  log "Validating stapler ticket"
  xcrun stapler validate "$APP_BUNDLE"

  log "Validating Gatekeeper acceptance"
  spctl -a -vvv --type execute "$APP_BUNDLE"

  log "Generating SHA-256 checksums"
  (cd "$OUT_DIR" && shasum -a 256 "$(basename "$dmg_path")" "$(basename "$zip_path")" > SHA256SUMS.txt)

  log "Release artifacts ready in $OUT_DIR:"
  ls -la "$OUT_DIR"
}

if [ "$RESUME_NOTARIZATION" = "1" ]; then
  load_state
else
  do_build
fi

poll_notarization
finalize

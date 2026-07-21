#!/bin/bash
# Publishes a jebi release that has already been built, signed, notarized
# and stapled by `make release-build`. Never builds, signs or notarizes.
#
# Usage:
#   VERSION=0.1.25 bash scripts/release-publish.sh
#   VERSION=0.1.25 RESUME=1 bash scripts/release-publish.sh
#   VERSION=0.1.25 DRY_RUN=1 bash scripts/release-publish.sh
#
# Env:
#   VERSION            required, e.g. 0.1.25
#   RESUME             1 to resume a partially-completed publish
#   DRY_RUN            1 to print actions without performing them
#   HOMEBREW_TAP_REPO  git remote for the tap repo (default: git@github.com:jebi-sh/homebrew-tap.git)

set -euo pipefail

VERSION="${VERSION:?VERSION is required, e.g. VERSION=0.1.25}"
RESUME="${RESUME:-0}"
DRY_RUN="${DRY_RUN:-0}"
HOMEBREW_TAP_REPO="${HOMEBREW_TAP_REPO:-git@github.com:jebi-sh/homebrew-tap.git}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/app"
OUT_DIR="$ROOT_DIR/release-output/$VERSION"
STATE_FILE="$OUT_DIR/.release-publish-state"
TAG="v$VERSION"

DMG_PATH="$OUT_DIR/jebi-${VERSION}-arm64.dmg"
ZIP_PATH="$OUT_DIR/jebi-${VERSION}-arm64.zip"
CHECKSUMS_PATH="$OUT_DIR/SHA256SUMS.txt"

log() { echo "[release-publish] $*"; }
fail() { echo "[release-publish] ERROR: $*" >&2; exit 1; }

run() {
  if [ "$DRY_RUN" = "1" ]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

step_done() {
  [ -f "$STATE_FILE" ] && grep -qx "$1" "$STATE_FILE"
}

mark_done() {
  mkdir -p "$OUT_DIR"
  echo "$1" >> "$STATE_FILE"
}

require_step() {
  local name="$1"; shift
  if [ "$RESUME" = "1" ] && step_done "$name"; then
    log "skip (already done): $name"
    return 0
  fi
  "$@"
  [ "$DRY_RUN" = "1" ] || mark_done "$name"
}

check_artifacts() {
  [ -f "$DMG_PATH" ] || fail "missing $DMG_PATH — run make release-build VERSION=$VERSION first"
  [ -f "$ZIP_PATH" ] || fail "missing $ZIP_PATH — run make release-build VERSION=$VERSION first"
  [ -f "$CHECKSUMS_PATH" ] || fail "missing $CHECKSUMS_PATH — run make release-build VERSION=$VERSION first"
}

check_version_committed_and_pushed() {
  local committed_version
  committed_version=$(git -C "$ROOT_DIR" show "origin/main:app/package.json" 2>/dev/null | node -e "
    let d=''; process.stdin.on('data', c => d += c); process.stdin.on('end', () => {
      console.log(JSON.parse(d).version);
    });
  ") || fail "could not read app/package.json from origin/main. Run 'git fetch' first."

  [ "$committed_version" = "$VERSION" ] || fail "origin/main app/package.json version is '$committed_version', expected '$VERSION'. Commit and push the version bump first."

  local local_head remote_head
  local_head=$(git -C "$ROOT_DIR" rev-parse HEAD)
  remote_head=$(git -C "$ROOT_DIR" rev-parse origin/main)
  [ "$local_head" = "$remote_head" ] || fail "local HEAD ($local_head) differs from origin/main ($remote_head). Push your commits to main first."

  local current_branch
  current_branch=$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD)
  [ "$current_branch" = "main" ] || fail "current branch is '$current_branch', expected 'main'."
}

do_tag() {
  run git -C "$ROOT_DIR" tag "$TAG"
  run git -C "$ROOT_DIR" push origin "$TAG"
}

do_create_release() {
  run gh release create "$TAG" \
    --repo jebi-sh/jebi \
    --title "jebi $TAG" \
    --draft \
    --notes "$(cat <<EOF
## jebi $TAG

### Install via Homebrew
\`\`\`bash
brew tap jebi-sh/tap
brew install --cask jebi
\`\`\`

### Manual install
- **Apple Silicon (macOS 14+):** download \`jebi-${VERSION}-arm64.dmg\`
EOF
)"
}

do_upload_assets() {
  run gh release upload "$TAG" "$DMG_PATH" "$ZIP_PATH" "$CHECKSUMS_PATH" \
    --repo jebi-sh/jebi --clobber
}

do_update_tap() {
  local sha
  sha=$(shasum -a 256 "$DMG_PATH" | awk '{print $1}')

  tap_dir=$(mktemp -d)
  trap 'rm -rf "${tap_dir:-}"' EXIT

  run git clone "$HOMEBREW_TAP_REPO" "$tap_dir"

  if [ "$DRY_RUN" = "1" ]; then
    echo "[dry-run] write $tap_dir/Casks/jebi.rb with version=$VERSION sha256=$sha"
    echo "[dry-run] git -C $tap_dir commit -am 'jebi: update to $VERSION'"
    echo "[dry-run] git -C $tap_dir push"
    return 0
  fi

  mkdir -p "$tap_dir/Casks"
  cat > "$tap_dir/Casks/jebi.rb" <<EOF
cask "jebi" do
  version "${VERSION}"

  url "https://github.com/jebi-sh/jebi/releases/download/v${VERSION}/jebi-${VERSION}-arm64.dmg"
  sha256 "${sha}"

  name "jebi"
  desc "The AI-native terminal for Mac"
  homepage "https://jebi.sh"

  depends_on macos: :sonoma
  depends_on arch: :arm64

  app "jebi.app"
  binary "#{appdir}/jebi.app/Contents/MacOS/jebi"

  zap trash: [
    "~/Library/Application Support/jebi",
    "~/Library/Preferences/com.jawahar.jebi.plist",
  ]
end
EOF

  (cd "$tap_dir" && git add Casks/jebi.rb && git commit -m "jebi: update to ${VERSION}" && git push)
}

do_publish_release() {
  run gh release edit "$TAG" --repo jebi-sh/jebi --draft=false
}

log "Publishing jebi $TAG (dry_run=$DRY_RUN, resume=$RESUME)"

check_artifacts
check_version_committed_and_pushed

require_step "tag_pushed" do_tag
require_step "release_created" do_create_release
require_step "assets_uploaded" do_upload_assets
require_step "tap_updated" do_update_tap
require_step "release_published" do_publish_release

log "Done. Draft release published: https://github.com/jebi-sh/jebi/releases/tag/$TAG"

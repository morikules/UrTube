#!/usr/bin/env bash
# Builds the extension and submits it to addons.mozilla.org (AMO).
#   unlisted (default): AMO only signs it; the signed .xpi can be installed permanently.
#   listed:             the version is published on AMO after review.
#
# Needs a .env file in the project root (see .env.example):
#   WEB_EXT_API_KEY / WEB_EXT_API_SECRET  – from https://addons.mozilla.org/developers/addon/api/key/
#   AMO_CHANNEL (optional)                – unlisted | listed
#   RELEASE_DIR (optional)                – where to copy the signed .xpi
#
# Every submission needs a new version number in package.json.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "Missing: .env with WEB_EXT_API_KEY and WEB_EXT_API_SECRET (template: .env.example)" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a
: "${WEB_EXT_API_KEY:?WEB_EXT_API_KEY missing in .env}"
: "${WEB_EXT_API_SECRET:?WEB_EXT_API_SECRET missing in .env}"
channel="${AMO_CHANNEL:-unlisted}"

version=$(node -p "require('./package.json').version")
echo "== Tests"
npm test
echo "== Build + source archive (version $version)"
npm run zip

sources=$(ls .output/*-"$version"-sources.zip)
echo "== Submitting to addons.mozilla.org ($channel)"
npx web-ext sign \
  --source-dir .output/firefox-mv2 \
  --channel "$channel" \
  --upload-source-code "$sources" \
  --artifacts-dir signed

if [[ "$channel" == "listed" ]]; then
  echo "Submitted for review; AMO publishes it after the review."
  exit 0
fi
xpi=$(ls -t signed/*.xpi | head -1)
echo "Signed: $xpi"
if [[ -n "${RELEASE_DIR:-}" ]]; then
  mkdir -p "$RELEASE_DIR"
  cp "$xpi" "$RELEASE_DIR/urtube-$version.xpi"
  echo "Copied to: $RELEASE_DIR/urtube-$version.xpi"
fi

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/parakit-alpha-test.XXXXXX")"
cleanup() {
	rm -rf "$ROOT"
}
trap cleanup EXIT

APP_DIR="$ROOT/build/Parakit.app"
ARCHIVE="$ROOT/Parakit-mac-arm64.zip"
FEED="$ROOT/latest.json"
INSTALL_DIR="$ROOT/install"

mkdir -p "$APP_DIR/Contents/Resources/app"
cat > "$APP_DIR/Contents/Resources/app/product.json" <<'JSON'
{
	"nameShort": "Parakit",
	"version": "1.126.0",
	"commit": "test-alpha-commit"
}
JSON

if command -v ditto >/dev/null 2>&1; then
	/usr/bin/ditto -c -k --keepParent "$APP_DIR" "$ARCHIVE"
else
	(cd "$ROOT/build" && /usr/bin/zip -q -r "$ARCHIVE" "Parakit.app")
fi

SHA256="$(/usr/bin/shasum -a 256 "$ARCHIVE" | awk '{print $1}')"
SIZE="$(wc -c < "$ARCHIVE" | tr -d ' ')"
cat > "$FEED" <<JSON
{
	"version": "1.126.0",
	"commit": "test-alpha-commit",
	"date": "2026-07-01T00:00:00.000Z",
	"platform": "darwin-arm64",
	"url": "file://$ARCHIVE",
	"sha256": "$SHA256",
	"size": $SIZE
}
JSON

PARAKIT_ALPHA_FEED_URL="file://$FEED" \
PARAKIT_ALPHA_INSTALL_DIR="$INSTALL_DIR" \
PARAKIT_ALPHA_ALLOW_FILE_URL=1 \
PARAKIT_ALPHA_NO_OPEN=1 \
"$(dirname "$0")/install-alpha.sh"

if [ ! -f "$INSTALL_DIR/Parakit.app/Contents/Resources/app/product.json" ]; then
	echo "Installed app product.json was not found." >&2
	exit 1
fi

if ! /usr/bin/plutil -extract commit raw -o - "$INSTALL_DIR/Parakit.app/Contents/Resources/app/product.json" | grep -q '^test-alpha-commit$'; then
	echo "Installed app commit did not match the feed." >&2
	exit 1
fi

echo "Install script test passed."

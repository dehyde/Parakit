#!/usr/bin/env bash
set -euo pipefail

FEED_URL="${PARAKIT_ALPHA_FEED_URL:-https://github.com/dehyde/Parakit/releases/download/parakit-alpha/latest.json}"
INSTALL_DIR="${PARAKIT_ALPHA_INSTALL_DIR:-$HOME/Applications}"
APP_NAME="${PARAKIT_ALPHA_APP_NAME:-Parakit.app}"
ALLOW_FILE_URL="${PARAKIT_ALPHA_ALLOW_FILE_URL:-0}"
NO_OPEN="${PARAKIT_ALPHA_NO_OPEN:-0}"
TARGET_APP="$INSTALL_DIR/$APP_NAME"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/parakit-alpha.XXXXXX")"

cleanup() {
	rm -rf "$TMP_DIR"
}
trap cleanup EXIT

FEED_FILE="$TMP_DIR/latest.json"
ARCHIVE_FILE="$TMP_DIR/Parakit-mac-arm64.zip"
EXTRACT_DIR="$TMP_DIR/extract"

echo "Fetching Parakit alpha metadata..."
curl -fsSL "$FEED_URL" -o "$FEED_FILE"

json_value() {
	local key="$1"
	if /usr/bin/plutil -extract "$key" raw -o - "$FEED_FILE" 2>/dev/null; then
		return 0
	fi
	FEED_FILE="$FEED_FILE" JSON_KEY="$key" /usr/bin/osascript -l JavaScript -e '
		const app = Application.currentApplication();
		app.includeStandardAdditions = true;
		const file = app.systemAttribute("FEED_FILE");
		const key = app.systemAttribute("JSON_KEY");
		const data = JSON.parse(app.read(Path(file)));
		if (data[key] === undefined || data[key] === null) {
			throw new Error("Missing JSON key " + key);
		}
		String(data[key]);
	'
}

VERSION="$(json_value version)"
COMMIT="$(json_value commit)"
PLATFORM="$(json_value platform)"
URL="$(json_value url)"
SHA256="$(json_value sha256)"

if [ "$PLATFORM" != "darwin-arm64" ]; then
	echo "This alpha build is for $PLATFORM, not darwin-arm64." >&2
	exit 1
fi

case "$URL" in
	https://*) ;;
	file://*)
		if [ "$ALLOW_FILE_URL" != "1" ]; then
			echo "Refusing non-HTTPS alpha download URL." >&2
			exit 1
		fi
		;;
	*)
		echo "Refusing non-HTTPS alpha download URL." >&2
		exit 1
		;;
esac

echo "Downloading Parakit alpha $VERSION ($COMMIT)..."
curl -fsSL "$URL" -o "$ARCHIVE_FILE"

ACTUAL_SHA256="$(/usr/bin/shasum -a 256 "$ARCHIVE_FILE" | awk '{print $1}')"
if [ "$ACTUAL_SHA256" != "$SHA256" ]; then
	echo "SHA-256 mismatch." >&2
	echo "Expected: $SHA256" >&2
	echo "Actual:   $ACTUAL_SHA256" >&2
	exit 1
fi

mkdir -p "$EXTRACT_DIR"
/usr/bin/unzip -q "$ARCHIVE_FILE" -d "$EXTRACT_DIR"

APP_COUNT="$(find "$EXTRACT_DIR" -maxdepth 1 -name '*.app' -type d | wc -l | tr -d ' ')"
if [ "$APP_COUNT" != "1" ]; then
	echo "Expected exactly one app bundle in the alpha archive, found $APP_COUNT." >&2
	exit 1
fi

STAGED_APP="$(find "$EXTRACT_DIR" -maxdepth 1 -name '*.app' -type d -print -quit)"
BACKUP_APP="$INSTALL_DIR/${APP_NAME}.backup.$(date -u '+%Y%m%d%H%M%S')"

mkdir -p "$INSTALL_DIR"

if pgrep -x "Parakit" >/dev/null 2>&1; then
	echo "Asking the existing Parakit app to quit..."
	/usr/bin/osascript -e 'tell application "Parakit" to quit' >/dev/null 2>&1 || true
	for _ in $(seq 1 30); do
		if ! pgrep -x "Parakit" >/dev/null 2>&1; then
			break
		fi
		sleep 1
	done
fi

if [ -d "$TARGET_APP" ]; then
	rm -rf "$BACKUP_APP"
	mv "$TARGET_APP" "$BACKUP_APP"
fi

if ! mv "$STAGED_APP" "$TARGET_APP"; then
	if [ -d "$BACKUP_APP" ]; then
		rm -rf "$TARGET_APP"
		mv "$BACKUP_APP" "$TARGET_APP"
	fi
	echo "Failed to install Parakit alpha." >&2
	exit 1
fi

rm -rf "$BACKUP_APP"
xattr -dr com.apple.quarantine "$TARGET_APP" >/dev/null 2>&1 || true

echo "Installed Parakit alpha $VERSION ($COMMIT) to $TARGET_APP"

if [ "$NO_OPEN" != "1" ]; then
	open "$TARGET_APP"
fi

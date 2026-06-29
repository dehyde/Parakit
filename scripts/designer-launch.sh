#!/usr/bin/env bash

set -euo pipefail

CANONICAL_REPO="/Users/tombar-gal/Documents/DesignerRepos/VSCodeFork"
STABLE_APP="/Users/tombar-gal/Documents/VSCodeForkAppLaunchTest/Parakit.app"
USER_DATA_DIR="/tmp/vsc-code-open-u"
EXTENSIONS_DIR="/tmp/vsc-code-open-e"
SHARED_DATA_DIR="/tmp/vsc-code-open-s"
DESIGNER_REPOS_DIR="$HOME/Documents/Designer Repos"
DESIGNER_STATE_FILE="$DESIGNER_REPOS_DIR/.designer/state.json"
DESIGNER_MANIFEST_FILE="$DESIGNER_REPOS_DIR/.designer/managed-repos.json"
OLD_RECOVERY_REPO="/private/tmp/vscode-fork-designer-recovery"
WRONG_REPO="/Users/tombar-gal/Documents/VSCode-Fork"
LAUNCH_LABEL="designer-vscode-fork"
OLD_LAUNCH_LABEL="designer-vscode-recovery"
LAUNCH_WRAPPER="/tmp/designer-vscode-fork-launch-wrapper.sh"
READY_CDP_PORT=""
LAUNCHED_PID=""

RESTART=0
while [[ $# -gt 0 ]]; do
	case "$1" in
		--restart) RESTART=1; shift ;;
		*) echo "Unknown argument: $1" >&2; exit 2 ;;
	esac
done

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "$REPO" != "$CANONICAL_REPO" && "${DESIGNER_ALLOW_NONCANONICAL_REPO:-}" != "1" ]]; then
	echo "Refusing to launch from non-canonical checkout:" >&2
	echo "  actual:   $REPO" >&2
	echo "  expected: $CANONICAL_REPO" >&2
	exit 1
fi

if [[ ! -x "$REPO/scripts/code.sh" || ! -d "$REPO/.build/electron" || ! -d "$REPO/out" ]]; then
	echo "VS Code fork checkout is not built or is missing required launch files: $REPO" >&2
	exit 1
fi

if ! command -v node >/dev/null 2>&1 && [[ -s "$HOME/.nvm/nvm.sh" ]]; then
	# shellcheck disable=SC1091
	source "$HOME/.nvm/nvm.sh"
	nvm use --silent "$(cat "$REPO/.nvmrc")" >/dev/null
fi

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
	echo "Node.js is required to launch the designer VS Code fork. Install Node or load nvm before running this script." >&2
	exit 1
fi

SOURCE_APP="$REPO/.build/electron/Parakit.app"
if [[ ! -d "$SOURCE_APP" ]]; then
	echo "VS Code fork checkout is missing the Electron app bundle: $SOURCE_APP" >&2
	exit 1
fi
APP_TO_LAUNCH="$SOURCE_APP"

sync_stable_app() {
	local stable_parent
	stable_parent="$(dirname "$STABLE_APP")"
	mkdir -p "$stable_parent"
	if [[ ! -d "$STABLE_APP" || "$SOURCE_APP" -nt "$STABLE_APP" ]]; then
		echo "Syncing stable app bundle: $STABLE_APP"
		rm -rf "$STABLE_APP"
		ditto "$SOURCE_APP" "$STABLE_APP"
		codesign --force --deep --sign - "$STABLE_APP" >/dev/null
	fi
}

for dir in "$USER_DATA_DIR" "$EXTENSIONS_DIR" "$SHARED_DATA_DIR"; do
	if [[ ! -d "$dir" ]]; then
		mkdir -p "$dir"
	fi
done

kill_matching() {
	local pattern="$1"
	local pids
	pids="$(pgrep -f -- "$pattern" 2>/dev/null || true)"
	if [[ -n "$pids" ]]; then
		echo "$pids" | xargs kill 2>/dev/null || true
		for _ in $(seq 1 20); do
			pids="$(pgrep -f -- "$pattern" 2>/dev/null || true)"
			[[ -z "$pids" ]] && return 0
			sleep 0.1
		done
		echo "$pids" | xargs kill -9 2>/dev/null || true
	fi
}

kill_wrong_instances() {
	kill_matching "$OLD_RECOVERY_REPO/.build/electron/Code - OSS"
	kill_matching "$OLD_RECOVERY_REPO/.build/electron/Parakit"
	kill_matching "app-path=$OLD_RECOVERY_REPO"
	kill_matching "$WRONG_REPO/.build/electron/Code - OSS"
	kill_matching "$WRONG_REPO/.build/electron/Parakit"
	kill_matching "app-path=$WRONG_REPO"
	kill_matching "vscode-fork-workbench-"
	kill_matching "vscode-fork-launch-"
}

kill_current_instance() {
	kill_matching "$CANONICAL_REPO/.build/electron/Code - OSS"
	kill_matching "$CANONICAL_REPO/.build/electron/Parakit"
	kill_matching "$STABLE_APP/Contents/MacOS/Code - OSS"
	kill_matching "$STABLE_APP/Contents/MacOS/Parakit"
	kill_matching "app-path=$CANONICAL_REPO"
	kill_matching "--user-data-dir=$USER_DATA_DIR"
	kill_matching "chrome_crashpad_handler.*$USER_DATA_DIR/Crashpad"
}

is_current_running() {
	pgrep -f "$CANONICAL_REPO/.build/electron/Code - OSS" >/dev/null 2>&1 \
		|| pgrep -f "$CANONICAL_REPO/.build/electron/Parakit" >/dev/null 2>&1 \
		|| pgrep -f "$STABLE_APP/Contents/MacOS/Code - OSS" >/dev/null 2>&1 \
		|| pgrep -f "$STABLE_APP/Contents/MacOS/Parakit" >/dev/null 2>&1 \
		|| pgrep -f "app-path=$CANONICAL_REPO" >/dev/null 2>&1
}

pick_port() {
	"$NODE_BIN" -e '
		const net = require("net");
		const s = net.createServer();
		s.listen(0, "127.0.0.1", () => {
			const port = s.address().port;
			s.close(() => console.log(port));
		});
	'
}

resolve_startup_repo() {
	"$NODE_BIN" - "$CANONICAL_REPO" "$DESIGNER_STATE_FILE" "$DESIGNER_MANIFEST_FILE" <<'NODE'
		const fs = require('fs');
		const path = require('path');

		const canonicalRepo = path.resolve(process.argv[2]);
		const stateFile = process.argv[3];
		const manifestFile = process.argv[4];
		const normalize = value => path.resolve(value);
		const isAllowed = value => {
			if (!value || typeof value !== 'string') {
				return false;
			}
			const resolved = normalize(value);
			return resolved !== canonicalRepo && fs.existsSync(resolved);
		};
		const readJson = file => {
			try {
				return JSON.parse(fs.readFileSync(file, 'utf8'));
			} catch {
				return undefined;
			}
		};

		const state = readJson(stateFile);
		if (isAllowed(state?.lastActiveRepoPath)) {
			console.log(normalize(state.lastActiveRepoPath));
			process.exit(0);
		}

		const manifest = readJson(manifestFile);
		const repos = Array.isArray(manifest?.repos) ? manifest.repos : [];
		const repo = repos
			.filter(entry => isAllowed(entry?.path))
			.sort((first, second) => (second.addedAt ?? 0) - (first.addedAt ?? 0))[0];
		if (repo) {
			console.log(normalize(repo.path));
		}
NODE
}

cleanup_stale_profile_state() {
	rm -f "$USER_DATA_DIR/DevToolsActivePort" "$USER_DATA_DIR/code.lock"
	find "$USER_DATA_DIR" -maxdepth 1 \( -name '*.sock' -o -name '.com.visualstudio.code.oss.*' \) -delete 2>/dev/null || true
}

wait_for_cdp() {
	local port="$1"
	for _ in $(seq 1 60); do
		if curl -sf -o /dev/null --max-time 1 "http://127.0.0.1:$port/json/version" 2>/dev/null; then
			READY_CDP_PORT="$port"
			return 0
		fi
		if [[ -f "$USER_DATA_DIR/DevToolsActivePort" ]]; then
			local actual_port
			actual_port="$(head -n 1 "$USER_DATA_DIR/DevToolsActivePort" 2>/dev/null || true)"
			if [[ "$actual_port" =~ ^[0-9]+$ ]] && curl -sf -o /dev/null --max-time 1 "http://127.0.0.1:$actual_port/json/version" 2>/dev/null; then
				READY_CDP_PORT="$actual_port"
				return 0
			fi
		fi
		sleep 1
	done
	return 1
}

kill_wrong_instances

if [[ "$RESTART" == "1" ]]; then
	launchctl remove "$OLD_LAUNCH_LABEL" 2>/dev/null || true
	launchctl remove "$LAUNCH_LABEL" 2>/dev/null || true
	kill_current_instance
	sleep 1
elif is_current_running; then
	cat <<EOF
Designer VS Code fork is already running.
repo:            $CANONICAL_REPO
userDataDir:     $USER_DATA_DIR
extensionsDir:   $EXTENSIONS_DIR
sharedDataDir:   $SHARED_DATA_DIR
EOF
	exit 0
fi

CDP_PORT="$(pick_port)"
LOG_FILE="/tmp/designer-vscode-fork-launch.log"
STARTUP_REPO="$(resolve_startup_repo)"
cleanup_stale_profile_state

echo "Launching designer VS Code fork"
echo "repo:            $CANONICAL_REPO"
echo "startupRepo:     ${STARTUP_REPO:-<empty window>}"
echo "userDataDir:     $USER_DATA_DIR"
echo "extensionsDir:   $EXTENSIONS_DIR"
echo "sharedDataDir:   $SHARED_DATA_DIR"
echo "appBundle:       $APP_TO_LAUNCH"
echo "cdpPort:         $CDP_PORT"
echo "logFile:         $LOG_FILE"

cat > "$LAUNCH_WRAPPER" <<EOF
#!/usr/bin/env bash
cd "$CANONICAL_REPO"
export NODE_ENV=development
export VSCODE_DEV=1
export VSCODE_CLI=1
export ELECTRON_ENABLE_STACK_DUMPING=1
export ELECTRON_ENABLE_LOGGING=1
target_args=()
if [[ -n "$STARTUP_REPO" ]]; then
	target_args=("$STARTUP_REPO")
fi
launchctl setenv NODE_ENV development
launchctl setenv VSCODE_DEV 1
launchctl setenv VSCODE_CLI 1
launchctl setenv ELECTRON_ENABLE_STACK_DUMPING 1
launchctl setenv ELECTRON_ENABLE_LOGGING 1
exec "$APP_TO_LAUNCH/Contents/MacOS/Parakit" . \\
	--disable-extension=vscode.vscode-api-tests \\
	"--user-data-dir=$USER_DATA_DIR" \\
	"--extensions-dir=$EXTENSIONS_DIR" \\
	"--shared-data-dir=$SHARED_DATA_DIR" \\
	"--remote-debugging-port=$CDP_PORT" \\
	"\${target_args[@]}" \\
	>"$LOG_FILE" 2>&1
EOF
chmod +x "$LAUNCH_WRAPPER"
launchctl submit -l "$LAUNCH_LABEL" -- "$LAUNCH_WRAPPER"

if ! wait_for_cdp "$CDP_PORT"; then
	echo "Designer workbench failed to expose a browser debug port." >&2
	echo "Requested cdpPort: $CDP_PORT" >&2
	if [[ -f "$USER_DATA_DIR/DevToolsActivePort" ]]; then
		echo "DevToolsActivePort:" >&2
		cat "$USER_DATA_DIR/DevToolsActivePort" >&2 || true
	fi
	echo "Matching processes:" >&2
	ps aux | grep -E "Code - OSS|Parakit|$LAUNCH_LABEL|$USER_DATA_DIR" | grep -v grep >&2 || true
	echo "Log tail:" >&2
	tail -n 120 "$LOG_FILE" >&2 || true
	exit 1
fi
if [[ -n "$READY_CDP_PORT" && "$READY_CDP_PORT" != "$CDP_PORT" ]]; then
	echo "Electron exposed CDP on alternate port: $READY_CDP_PORT"
	CDP_PORT="$READY_CDP_PORT"
fi

PID="$(pgrep -f -- "remote-debugging-port=$CDP_PORT" | head -n 1 || true)"
PID="${PID:-$LAUNCHED_PID}"
echo "$PID" > /tmp/designer-vscode-fork-launch.pid

cat <<EOF
Designer VS Code fork ready.
pid:             $PID
repo:            $CANONICAL_REPO
startupRepo:     ${STARTUP_REPO:-<empty window>}
userDataDir:     $USER_DATA_DIR
extensionsDir:   $EXTENSIONS_DIR
sharedDataDir:   $SHARED_DATA_DIR
appBundle:       $APP_TO_LAUNCH
cdpPort:         $CDP_PORT
logFile:         $LOG_FILE
EOF

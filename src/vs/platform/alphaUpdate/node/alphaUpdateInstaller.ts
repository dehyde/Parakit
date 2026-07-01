/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import { createReadStream } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Promises } from '../../../base/node/pfs.js';

export interface IAlphaUpdateReplacementOptions {
	readonly stagedAppPath: string;
	readonly targetAppPath: string;
	readonly backupAppPath: string;
	readonly failAfterBackupForTest?: boolean;
}

export async function computeSha256(filePath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash = crypto.createHash('sha256');
		const stream = createReadStream(filePath);
		stream.on('error', reject);
		stream.on('data', chunk => hash.update(chunk));
		stream.on('end', () => resolve(hash.digest('hex')));
	});
}

export async function verifySha256(filePath: string, expectedSha256: string): Promise<void> {
	const actualSha256 = await computeSha256(filePath);
	if (actualSha256 !== expectedSha256.toLowerCase()) {
		throw new Error(`Alpha update SHA-256 mismatch. Expected ${expectedSha256}, got ${actualSha256}.`);
	}
}

export function findAppBundlePath(executablePath: string): string | undefined {
	let current = path.resolve(executablePath);
	while (current !== path.dirname(current)) {
		if (current.endsWith('.app')) {
			return current;
		}
		current = path.dirname(current);
	}
	return undefined;
}

export async function findSingleAppBundle(rootPath: string): Promise<string> {
	const entries = await fs.readdir(rootPath, { withFileTypes: true });
	const appBundles = entries
		.filter(entry => entry.isDirectory() && entry.name.endsWith('.app'))
		.map(entry => path.join(rootPath, entry.name));

	if (appBundles.length !== 1) {
		throw new Error(`Expected exactly one app bundle in alpha update archive, found ${appBundles.length}.`);
	}

	return appBundles[0];
}

export async function replaceAppBundle(options: IAlphaUpdateReplacementOptions): Promise<void> {
	const { stagedAppPath, targetAppPath, backupAppPath } = options;
	await Promises.rm(backupAppPath);

	let backupCreated = false;
	try {
		await fs.rename(targetAppPath, backupAppPath);
		backupCreated = true;

		if (options.failAfterBackupForTest) {
			throw new Error('Injected alpha update replacement failure.');
		}

		await fs.rename(stagedAppPath, targetAppPath);
		await Promises.rm(backupAppPath);
	} catch (error) {
		await Promises.rm(targetAppPath);
		if (backupCreated) {
			await fs.rename(backupAppPath, targetAppPath);
		}
		throw error;
	}
}

export function createAlphaUpdateHelperScript(): string {
	return `#!/bin/zsh
set -u

PID="$1"
STAGED_APP="$2"
TARGET_APP="$3"
BACKUP_APP="$4"
LOG_FILE="$5"

log() {
	printf '%s %s\\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$1" >> "$LOG_FILE"
}

restore_backup() {
	if [ -d "$BACKUP_APP" ]; then
		rm -rf "$TARGET_APP"
		mv "$BACKUP_APP" "$TARGET_APP"
	fi
}

log "waiting for Parakit to quit"
while kill -0 "$PID" >/dev/null 2>&1; do
	sleep 0.2
done

log "replacing app bundle"
rm -rf "$BACKUP_APP"
if ! mv "$TARGET_APP" "$BACKUP_APP"; then
	log "failed to move current app to backup"
	exit 1
fi

if ! mv "$STAGED_APP" "$TARGET_APP"; then
	log "failed to move staged app into place"
	restore_backup
	exit 1
fi

xattr -dr com.apple.quarantine "$TARGET_APP" >/dev/null 2>&1 || true
rm -rf "$BACKUP_APP"
log "relaunching Parakit"
open "$TARGET_APP" >> "$LOG_FILE" 2>&1 || log "failed to relaunch Parakit"
`;
}

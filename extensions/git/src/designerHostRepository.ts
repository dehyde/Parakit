/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

function normalizeForComparison(value: string): string {
	const normalized = realpathOrResolve(value);
	return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function realpathOrResolve(value: string): string {
	try {
		return fs.realpathSync.native(value);
	} catch {
		return path.resolve(value);
	}
}

export function getDesignerHostRepositoryRoot(extensionOutDir: string): string | undefined {
	const candidate = path.resolve(extensionOutDir, '../../..');

	if (!fs.existsSync(path.join(candidate, '.git'))) {
		return undefined;
	}

	if (!fs.existsSync(path.join(candidate, 'scripts/code.sh'))) {
		return undefined;
	}

	if (!fs.existsSync(path.join(candidate, 'src/vs/code/electron-main/main.ts'))) {
		return undefined;
	}

	return candidate;
}

export function isDesignerHostRepository(repositoryRoot: string, extensionOutDir: string): boolean {
	const hostRoot = getDesignerHostRepositoryRoot(extensionOutDir);
	if (!hostRoot) {
		return false;
	}

	return normalizeForComparison(repositoryRoot) === normalizeForComparison(hostRoot);
}

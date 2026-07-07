#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from 'path';
import { spawnSync } from 'child_process';
import { stat } from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const outputDir = path.join(repoRoot, '.build', 'alpha');
const releaseTag = 'parakit-alpha';
const releaseTitle = 'Parakit Alpha';
const archivePath = path.join(outputDir, 'Parakit-mac-arm64.zip');
const feedPath = path.join(outputDir, 'latest.json');
const args = new Set(process.argv.slice(2));

if (!args.has('--skip-package')) {
	run('node', [path.join(repoRoot, 'scripts', 'alpha', 'package-macos-arm64.mjs')]);
}

await assertFile(archivePath);
await assertFile(feedPath);

if (runCapture('git', ['status', '--porcelain']).length > 0) {
	throw new Error('Working tree is dirty. Commit the alpha updater changes before publishing a release.');
}

const branch = runCapture('git', ['branch', '--show-current']);
const commit = runCapture('git', ['rev-parse', 'HEAD']);
run('git', ['push', '-u', 'origin', branch]);
run('git', ['tag', '-f', releaseTag, commit]);
run('git', ['push', 'origin', `refs/tags/${releaseTag}`, '--force']);

const releaseExists = spawnSync('gh', ['release', 'view', releaseTag], { cwd: repoRoot, stdio: 'ignore' }).status === 0;
if (!releaseExists) {
	run('gh', ['release', 'create', releaseTag, '--title', releaseTitle, '--notes', `Alpha build for ${commit}.`, '--target', commit]);
} else {
	run('gh', ['release', 'edit', releaseTag, '--title', releaseTitle, '--notes', `Alpha build for ${commit}.`, '--target', commit]);
}

run('gh', ['release', 'upload', releaseTag, archivePath, feedPath, '--clobber']);

console.log(`Published ${releaseTag} from ${branch} at ${commit}`);

async function assertFile(filePath) {
	const stats = await stat(filePath).catch(() => undefined);
	if (!stats?.isFile()) {
		throw new Error(`Missing release artifact: ${filePath}`);
	}
}

function run(command, args) {
	const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit' });
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
	}
}

function runCapture(command, args) {
	const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8' });
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
	}
	return result.stdout.trim();
}

#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const releaseTag = 'parakit-alpha';
const platform = 'darwin-arm64';
const assetName = 'Parakit-mac-arm64.zip';
const defaultOutputDir = path.join(repoRoot, '.build', 'alpha');
const releaseBaseUrl = `https://github.com/dehyde/Parakit/releases/download/${releaseTag}`;

const args = new Set(process.argv.slice(2));
const skipBuild = args.has('--skip-build');
const allowCommitMismatch = args.has('--allow-commit-mismatch');
const appPath = getArgValue('--app') ?? path.resolve(repoRoot, '..', 'VSCode-darwin-arm64', 'Parakit.app');
const outputDir = getArgValue('--output') ?? defaultOutputDir;
const archivePath = path.join(outputDir, assetName);
const feedPath = path.join(outputDir, 'latest.json');

if (process.platform !== 'darwin') {
	throw new Error('Alpha packaging currently supports macOS only.');
}

if (process.arch !== 'arm64') {
	throw new Error('Alpha packaging must run on Apple Silicon for the darwin-arm64 build.');
}

if (!skipBuild) {
	run('npm', ['run', 'gulp', 'vscode-darwin-arm64-min']);
}

await assertDirectory(appPath, `Could not find app bundle at ${appPath}`);
await mkdir(outputDir, { recursive: true });
await rm(archivePath, { force: true });

const commit = runCapture('git', ['rev-parse', 'HEAD']);
const productPath = path.join(appPath, 'Contents', 'Resources', 'app', 'product.json');
const packagedProduct = JSON.parse(await readFile(productPath, 'utf8'));
if (!allowCommitMismatch && packagedProduct.commit && packagedProduct.commit !== commit) {
	throw new Error(`Packaged app commit ${packagedProduct.commit} does not match repository HEAD ${commit}. Rebuild or pass --allow-commit-mismatch.`);
}

run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appPath, archivePath]);

const archiveStats = await stat(archivePath);
const sha256 = await sha256File(archivePath);
const feed = {
	version: packagedProduct.version,
	commit,
	date: new Date().toISOString(),
	platform,
	url: `${releaseBaseUrl}/${assetName}`,
	sha256,
	size: archiveStats.size,
};

await writeFile(feedPath, `${JSON.stringify(feed, null, '\t')}\n`);

console.log(`Wrote ${archivePath}`);
console.log(`Wrote ${feedPath}`);
console.log(`Commit ${commit}`);
console.log(`SHA-256 ${sha256}`);

function getArgValue(name) {
	const args = process.argv.slice(2);
	const index = args.indexOf(name);
	if (index === -1) {
		return undefined;
	}
	if (!args[index + 1]) {
		throw new Error(`Missing value for ${name}`);
	}
	return path.resolve(repoRoot, args[index + 1]);
}

async function assertDirectory(directoryPath, message) {
	const stats = await stat(directoryPath).catch(() => undefined);
	if (!stats?.isDirectory()) {
		throw new Error(message);
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

async function sha256File(filePath) {
	return new Promise((resolve, reject) => {
		const hash = createHash('sha256');
		const stream = createReadStream(filePath);
		stream.on('error', reject);
		stream.on('data', chunk => hash.update(chunk));
		stream.on('end', () => resolve(hash.digest('hex')));
	});
}

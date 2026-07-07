/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { computeSha256, findAppBundlePath, replaceAppBundle, verifySha256 } from '../../node/alphaUpdateInstaller.js';

suite('Alpha update installer', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('rejects SHA-256 mismatches', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'parakit-alpha-sha-'));
		const filePath = path.join(root, 'archive.zip');
		await fs.writeFile(filePath, 'archive contents');

		const actualSha256 = await computeSha256(filePath);
		assert.notStrictEqual(actualSha256, '0'.repeat(64));
		await assert.rejects(() => verifySha256(filePath, '0'.repeat(64)), /SHA-256 mismatch/);
	});

	test('finds the running app bundle from an executable path', () => {
		assert.strictEqual(
			findAppBundlePath('/Applications/Parakit.app/Contents/MacOS/Parakit'),
			'/Applications/Parakit.app'
		);
	});

	test('replaces a fake app bundle and removes the backup', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'parakit-alpha-install-'));
		const targetAppPath = path.join(root, 'Parakit.app');
		const stagedAppPath = path.join(root, 'Staged.app');
		const backupAppPath = path.join(root, 'Parakit.app.backup');
		await writeFakeApp(targetAppPath, 'old');
		await writeFakeApp(stagedAppPath, 'new');

		await replaceAppBundle({ stagedAppPath, targetAppPath, backupAppPath });

		assert.strictEqual(await fs.readFile(path.join(targetAppPath, 'Contents', 'version.txt'), 'utf8'), 'new');
		await assert.rejects(() => fs.stat(backupAppPath));
	});

	test('restores the backup when replacement fails after moving the current app', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'parakit-alpha-restore-'));
		const targetAppPath = path.join(root, 'Parakit.app');
		const stagedAppPath = path.join(root, 'Staged.app');
		const backupAppPath = path.join(root, 'Parakit.app.backup');
		await writeFakeApp(targetAppPath, 'old');
		await writeFakeApp(stagedAppPath, 'new');

		await assert.rejects(() => replaceAppBundle({ stagedAppPath, targetAppPath, backupAppPath, failAfterBackupForTest: true }));

		assert.strictEqual(await fs.readFile(path.join(targetAppPath, 'Contents', 'version.txt'), 'utf8'), 'old');
	});
});

async function writeFakeApp(appPath: string, version: string): Promise<void> {
	await fs.mkdir(path.join(appPath, 'Contents'), { recursive: true });
	await fs.writeFile(path.join(appPath, 'Contents', 'version.txt'), version);
}

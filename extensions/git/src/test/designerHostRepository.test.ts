/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getDesignerHostRepositoryRoot, isDesignerHostRepository } from '../designerHostRepository';

suite('Designer Host Repository', () => {
	let root: string;

	setup(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'designer-host-repo-'));
		fs.mkdirSync(path.join(root, '.git'));
		fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
		fs.writeFileSync(path.join(root, 'scripts/code.sh'), '');
		fs.mkdirSync(path.join(root, 'src/vs/code/electron-main'), { recursive: true });
		fs.writeFileSync(path.join(root, 'src/vs/code/electron-main/main.ts'), '');
		fs.mkdirSync(path.join(root, 'extensions/git/out'), { recursive: true });
	});

	teardown(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	test('detects the repository that is serving the dev app', () => {
		const extensionOutDir = path.join(root, 'extensions/git/out');
		assert.strictEqual(getDesignerHostRepositoryRoot(extensionOutDir), root);
		assert.strictEqual(isDesignerHostRepository(root, extensionOutDir), true);
	});

	test('does not detect ordinary user repositories', () => {
		const userRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'designer-user-repo-'));
		try {
			fs.mkdirSync(path.join(userRepo, '.git'));
			const extensionOutDir = path.join(root, 'extensions/git/out');
			assert.strictEqual(isDesignerHostRepository(userRepo, extensionOutDir), false);
		} finally {
			fs.rmSync(userRepo, { recursive: true, force: true });
		}
	});

	test('detects the host repository through a symlinked path', function () {
		if (process.platform === 'win32') {
			this.skip();
		}

		const symlinkRoot = path.join(os.tmpdir(), `designer-host-repo-link-${Date.now()}`);
		try {
			fs.symlinkSync(root, symlinkRoot, 'dir');
			const extensionOutDir = path.join(root, 'extensions/git/out');
			assert.strictEqual(isDesignerHostRepository(symlinkRoot, extensionOutDir), true);
		} finally {
			fs.rmSync(symlinkRoot, { recursive: true, force: true });
		}
	});
});

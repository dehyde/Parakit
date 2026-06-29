/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('autofetch defaults', () => {
	test('git.autofetch defaults to enabled without a first-run prompt', () => {
		const extensionRoot = path.join(__dirname, '..', '..');
		const packageJson = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'));
		const autofetchSource = fs.readFileSync(path.join(extensionRoot, 'src', 'autofetch.ts'), 'utf8');

		assert.strictEqual(packageJson.contributes.configuration.properties['git.autofetch'].default, true);
		assert.ok(!autofetchSource.includes('showInformationMessage'));
		assert.ok(!autofetchSource.includes('periodically run "git fetch"'));
	});
});

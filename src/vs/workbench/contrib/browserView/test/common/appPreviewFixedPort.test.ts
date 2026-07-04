/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { resolveWorkbenchAppPreviewFixedPortAction } from '../../common/appPreviewConfig.js';

suite('AppPreviewFixedPort', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const root = '/Users/dev/repos/acs-schedule';

	test('a free port is ready to bind immediately', () => {
		assert.strictEqual(
			resolveWorkbenchAppPreviewFixedPortAction({ portFree: true, owner: undefined, rootPath: root }),
			'ready',
		);
	});

	test('a free port is ready even if a stale owner lookup is passed', () => {
		assert.strictEqual(
			resolveWorkbenchAppPreviewFixedPortAction({ portFree: true, owner: { pid: 123, cwd: '/somewhere/else' }, rootPath: root }),
			'ready',
		);
	});

	test('an owner running out of this repo is reused, not killed', () => {
		assert.strictEqual(
			resolveWorkbenchAppPreviewFixedPortAction({ portFree: false, owner: { pid: 123, cwd: root }, rootPath: root }),
			'reuseRepoLocal',
		);
	});

	test('an owner in a subdirectory of this repo is reused', () => {
		assert.strictEqual(
			resolveWorkbenchAppPreviewFixedPortAction({ portFree: false, owner: { pid: 123, cwd: `${root}/apps/demo` }, rootPath: root }),
			'reuseRepoLocal',
		);
	});

	test('a foreign owner from a different repo is closed (the observed incident)', () => {
		assert.strictEqual(
			resolveWorkbenchAppPreviewFixedPortAction({
				portFree: false,
				owner: { pid: 16453, cwd: '/Users/dev/projects/acs-sc-web-platform/apps/demo' },
				rootPath: root,
			}),
			'closeForeign',
		);
	});

	test('a sibling repo whose path prefixes the root string is still foreign', () => {
		assert.strictEqual(
			resolveWorkbenchAppPreviewFixedPortAction({ portFree: false, owner: { pid: 123, cwd: `${root}-other` }, rootPath: root }),
			'closeForeign',
		);
	});

	test('a known pid with an unreadable cwd is treated as foreign', () => {
		assert.strictEqual(
			resolveWorkbenchAppPreviewFixedPortAction({ portFree: false, owner: { pid: 123 }, rootPath: root }),
			'closeForeign',
		);
	});

	test('an occupied port with no identifiable owner is waited on, not killed', () => {
		assert.strictEqual(
			resolveWorkbenchAppPreviewFixedPortAction({ portFree: false, owner: undefined, rootPath: root }),
			'waitUnknownOwner',
		);
	});

	test('an owner with a non-positive pid is not killed', () => {
		assert.strictEqual(
			resolveWorkbenchAppPreviewFixedPortAction({ portFree: false, owner: { pid: 0 }, rootPath: root }),
			'waitUnknownOwner',
		);
	});
});

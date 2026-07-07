/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { resolveWorkbenchAppPreviewHealthFromSignals } from '../../common/appPreviewConfig.js';

suite('AppPreviewHealth', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('an unreachable server is unhealthy regardless of render', () => {
		assert.strictEqual(
			resolveWorkbenchAppPreviewHealthFromSignals({ httpReachable: false, previewOnServerOrigin: true, renderVerified: true }),
			'unhealthy',
		);
	});

	test('reachable but not yet looking at the app is only reachable, never healthy', () => {
		assert.strictEqual(
			resolveWorkbenchAppPreviewHealthFromSignals({ httpReachable: true, previewOnServerOrigin: false, renderVerified: undefined }),
			'reachable',
		);
	});

	test('reachable with a confirmed render is healthy', () => {
		assert.strictEqual(
			resolveWorkbenchAppPreviewHealthFromSignals({ httpReachable: true, previewOnServerOrigin: true, renderVerified: true }),
			'healthy',
		);
	});

	test('reachable but confirmed NOT rendered stays reachable (the healthy-but-blank case)', () => {
		assert.strictEqual(
			resolveWorkbenchAppPreviewHealthFromSignals({ httpReachable: true, previewOnServerOrigin: true, renderVerified: false }),
			'reachable',
		);
	});

	test('reachable with an undeterminable render fails open to healthy (no regression)', () => {
		assert.strictEqual(
			resolveWorkbenchAppPreviewHealthFromSignals({ httpReachable: true, previewOnServerOrigin: true, renderVerified: undefined }),
			'healthy',
		);
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { BrowserViewSharingState } from '../../common/browserView.js';
import { getBrowserShareControlPresentation } from '../../common/browserShareControlPresentation.js';

suite('BrowserShareControlPresentation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('becomes a stop AI control CTA while the browser tab is shared', () => {
		const presentation = getBrowserShareControlPresentation(BrowserViewSharingState.Shared);

		assert.strictEqual(presentation.visible, true);
		assert.strictEqual(presentation.label, 'Stop AI control');
		assert.strictEqual(presentation.title, 'Stop AI control for this browser tab');
		assert.strictEqual(presentation.ariaLabel, 'Stop AI control for this browser tab');
		assert.strictEqual(presentation.checked, false);
		assert.strictEqual(presentation.isStopControl, true);
	});
});

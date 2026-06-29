/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { forcePrimarySidebarClosedOnStartup } from '../../browser/layout.js';

suite('Workbench Layout', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('startup forces primary sidebar and activity bar hidden', () => {
		const state = new Map<string, unknown>([
			['activityBar.hidden', false],
			['sideBar.hidden', false],
			['panel.hidden', false],
		]);

		forcePrimarySidebarClosedOnStartup(state);

		assert.strictEqual(state.get('activityBar.hidden'), true);
		assert.strictEqual(state.get('sideBar.hidden'), true);
		assert.strictEqual(state.get('panel.hidden'), false);
	});
});

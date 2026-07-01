/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { Extensions as ConfigurationExtensions } from '../../../platform/configuration/common/configurationRegistry.js';
import type { IConfigurationRegistry } from '../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { forcePrimarySidebarClosedOnStartup } from '../../browser/layout.js';
import '../../browser/workbench.contribution.js';

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

	test('titlebar navigation controls default to hidden', () => {
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		const navigationControl = configurationRegistry.getConfigurationProperties()['workbench.navigationControl.enabled'];

		assert.strictEqual(navigationControl.default, false);
	});
});

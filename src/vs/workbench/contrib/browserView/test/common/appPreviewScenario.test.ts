/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { addAppPreviewScenarioChoice, addAppPreviewScenarioControl, addAppPreviewScenarioGroup, createAppPreviewScenarioBridgePayload, createAppPreviewScenarioChatContext, createDefaultAppPreviewScenarioConfig, getAppPreviewScenarioDefaultValues, getAppPreviewScenarioStorageKey, getStarterAppPreviewScenarioGroups, isAppPreviewScenarioDesignOnlyFilePath, moveAppPreviewScenarioControl, normalizeAppPreviewScenarioState, parseAppPreviewScenarioConfig, removeAppPreviewScenarioChoice, removeAppPreviewScenarioControl, removeAppPreviewScenarioGroup, summarizeAppPreviewScenarioState, updateAppPreviewScenarioChoiceLabel } from '../../common/appPreviewScenario.js';

suite('App Preview Scenario', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('creates starter groups with automatic defaults', () => {
		const groups = getStarterAppPreviewScenarioGroups();
		const defaults = getAppPreviewScenarioDefaultValues(groups);

		assert.deepStrictEqual(groups.map(group => group.label), ['Permissions', 'UI State', 'Content Stress', 'Concept Variant']);
		assert.deepStrictEqual(groups[0].controls.map(control => control.label), ['Role']);
		assert.deepStrictEqual(groups[2].controls.map(control => control.label), ['Length']);
		assert.strictEqual(defaults['permissions.role'], 'member');
		assert.strictEqual(defaults['permissions.billing'], undefined);
		assert.strictEqual(defaults['ui.error'], false);
		assert.strictEqual(defaults['content.length'], 'normal');
		assert.strictEqual(defaults['content.overflow'], undefined);
		assert.strictEqual(defaults['concept.variant'], 'a');

		const config = createDefaultAppPreviewScenarioConfig(groups);
		assert.deepStrictEqual(config.defaultValues, defaults);
	});

	test('rejects duplicate group and control ids', () => {
		const result = parseAppPreviewScenarioConfig({
			version: 1,
			groups: [
				{ id: 'permissions', label: 'Permissions', controls: [{ id: 'role', label: 'Role', type: 'toggle' }] },
				{ id: 'permissions', label: 'Again', controls: [{ id: 'role', label: 'Role', type: 'toggle' }] },
			],
			defaultValues: {
				'permissions.role': false
			}
		});

		assert.deepStrictEqual(result.errors.map(error => error.code), ['duplicateGroupId', 'duplicateControlId']);
		assert.strictEqual(result.config, undefined);
	});

	test('rejects invalid defaults', () => {
		const result = parseAppPreviewScenarioConfig({
			version: 1,
			groups: [
				{
					id: 'permissions',
					label: 'Permissions',
					controls: [
						{ id: 'role', label: 'Role', type: 'choice', choices: [{ id: 'member', label: 'Member' }] },
						{ id: 'billing', label: 'Billing', type: 'toggle' },
					]
				}
			],
			defaultValues: {
				'permissions.role': 'admin',
				'permissions.billing': 'yes',
				'permissions.unknown': false,
			}
		});

		assert.deepStrictEqual(result.errors.map(error => error.code), ['invalidChoiceDefault', 'invalidToggleDefault', 'unknownDefaultControl']);
		assert.strictEqual(result.config, undefined);
	});

	test('normalizes tab state by filling defaults and dropping invalid values', () => {
		const config = createDefaultAppPreviewScenarioConfig([{
			id: 'permissions',
			label: 'Permissions',
			controls: [
				{ id: 'role', label: 'Role', type: 'choice', choices: [{ id: 'member', label: 'Member' }, { id: 'admin', label: 'Admin' }] },
				{ id: 'billing', label: 'Billing', type: 'toggle' },
			]
		}]);

		assert.deepStrictEqual(normalizeAppPreviewScenarioState(config, {
			'permissions.role': 'admin',
			'permissions.billing': 'true',
			'permissions.unknown': false,
		}), {
			'permissions.role': 'admin',
			'permissions.billing': false,
		});
	});

	test('supports multi-select controls', () => {
		const result = parseAppPreviewScenarioConfig({
			version: 1,
			groups: [{
				id: 'content',
				label: 'Content',
				controls: [{
					id: 'states',
					label: 'States',
					type: 'multiChoice',
					choices: [
						{ id: 'empty', label: 'Empty' },
						{ id: 'long', label: 'Long' },
					]
				}]
			}],
			defaultValues: {
				'content.states': ['empty']
			}
		});

		assert.deepStrictEqual(result.errors, []);
		assert.deepStrictEqual(normalizeAppPreviewScenarioState(result.config!, {
			'content.states': ['long', 'missing']
		}), {
			'content.states': ['empty']
		});
		assert.strictEqual(summarizeAppPreviewScenarioState(result.config!, {
			'content.states': ['empty', 'long']
		}), 'States: Empty, Long');
	});

	test('edits groups, properties, values, and moved properties', () => {
		let config = createDefaultAppPreviewScenarioConfig([{
			id: 'ui',
			label: 'UI State',
			controls: []
		}]);

		config = addAppPreviewScenarioGroup(config, 'Concept Variant');
		config = addAppPreviewScenarioControl(config, 'concept-variant', 'choice', 'Variant');
		config = addAppPreviewScenarioChoice(config, 'concept-variant', 'variant', 'B');
		config = addAppPreviewScenarioControl(config, 'ui', 'toggle', 'Disabled');
		config = moveAppPreviewScenarioControl(config, 'concept-variant', 'variant', 'ui');

		assert.deepStrictEqual(config.groups.map(group => group.id), ['ui', 'concept-variant']);
		assert.deepStrictEqual(config.groups[0].controls.map(control => control.id), ['disabled', 'variant']);
		assert.strictEqual(config.defaultValues['ui.disabled'], false);
		assert.strictEqual(config.defaultValues['ui.variant'], 'option-1');
		assert.strictEqual(config.defaultValues['concept-variant.variant'], undefined);

		config = updateAppPreviewScenarioChoiceLabel(config, 'ui', 'variant', 'option-1', 'A');
		assert.strictEqual(summarizeAppPreviewScenarioState(config, { 'ui.variant': 'b' }), 'Variant: B');
		assert.strictEqual(summarizeAppPreviewScenarioState(config, { 'ui.variant': 'option-1' }), 'Default');

		config = removeAppPreviewScenarioChoice(config, 'ui', 'variant', 'b');
		assert.deepStrictEqual(config.groups[0].controls[1], {
			id: 'variant',
			label: 'Variant',
			type: 'choice',
			choices: [{ id: 'option-1', label: 'A' }]
		});

		config = removeAppPreviewScenarioControl(config, 'ui', 'disabled');
		assert.deepStrictEqual(config.groups[0].controls.map(control => control.id), ['variant']);
		assert.strictEqual(config.defaultValues['ui.disabled'], undefined);

		config = removeAppPreviewScenarioGroup(config, 'ui');
		assert.deepStrictEqual(config.groups.map(group => group.id), ['concept-variant']);
		assert.deepStrictEqual(config.defaultValues, {});
	});

	test('summarizes default and custom state', () => {
		const config = createDefaultAppPreviewScenarioConfig([{
			id: 'permissions',
			label: 'Permissions',
			controls: [
				{ id: 'role', label: 'Role', type: 'choice', choices: [{ id: 'member', label: 'Member' }, { id: 'admin', label: 'Admin' }] },
				{ id: 'billing', label: 'Billing', type: 'toggle' },
			]
		}]);

		assert.strictEqual(summarizeAppPreviewScenarioState(config, config.defaultValues), 'Default');
		assert.strictEqual(summarizeAppPreviewScenarioState(config, {
			'permissions.role': 'admin',
			'permissions.billing': true,
		}), 'Role: Admin, Billing: on');
	});

	test('separates tab state by repo, branch, and browser tab', () => {
		assert.notStrictEqual(
			getAppPreviewScenarioStorageKey('/repo/a', 'main', 'tab-1'),
			getAppPreviewScenarioStorageKey('/repo/a', 'feature', 'tab-1')
		);
		assert.notStrictEqual(
			getAppPreviewScenarioStorageKey('/repo/a', 'main', 'tab-1'),
			getAppPreviewScenarioStorageKey('/repo/a', 'main', 'tab-2')
		);
		assert.notStrictEqual(
			getAppPreviewScenarioStorageKey('/repo/a', 'main', 'tab-1'),
			getAppPreviewScenarioStorageKey('/repo/b', 'main', 'tab-1')
		);
	});

	test('creates bridge payload with normalized state and unknown support by default', () => {
		const config = createDefaultAppPreviewScenarioConfig([{
			id: 'permissions',
			label: 'Permissions',
			controls: [
				{ id: 'role', label: 'Role', type: 'choice', choices: [{ id: 'member', label: 'Member' }, { id: 'admin', label: 'Admin' }] },
				{ id: 'billing', label: 'Billing', type: 'toggle' },
			]
		}]);

		assert.deepStrictEqual(createAppPreviewScenarioBridgePayload(config, {
			'permissions.role': 'admin',
			'permissions.billing': 'invalid',
		}), {
			version: 1,
			defaultValues: {
				'permissions.role': 'member',
				'permissions.billing': false,
			},
			values: {
				'permissions.role': 'admin',
				'permissions.billing': false,
			},
			summary: 'Role: Admin',
			support: {
				'permissions.role': 'unknown',
				'permissions.billing': 'unknown',
			}
		});
	});

	test('creates chat context for active scenario and differing tabs', () => {
		const config = createDefaultAppPreviewScenarioConfig([{
			id: 'permissions',
			label: 'Permissions',
			controls: [
				{ id: 'role', label: 'Role', type: 'choice', choices: [{ id: 'member', label: 'Member' }, { id: 'admin', label: 'Admin' }] },
				{ id: 'billing', label: 'Billing', type: 'toggle' },
			]
		}]);

		const context = createAppPreviewScenarioChatContext({
			config,
			activeTabId: 'tab-1',
			activeValues: { 'permissions.role': 'admin' },
			otherTabs: [
				{ tabId: 'tab-2', values: { 'permissions.billing': true } },
				{ tabId: 'tab-3', values: config.defaultValues },
			]
		});

		assert.ok(context.includes('Active App Preview tab tab-1 variant: Role: Admin'));
		assert.ok(context.includes('Other App Preview tabs differ: tab-2: Billing: on'));
		assert.ok(context.includes('infer from conversation context'));
	});

	test('accepts only safe design-only cleanup paths', () => {
		assert.strictEqual(isAppPreviewScenarioDesignOnlyFilePath('.designer/scenario-support.ts'), true);
		assert.strictEqual(isAppPreviewScenarioDesignOnlyFilePath('src/design/scenarioSupport.ts'), true);
		assert.strictEqual(isAppPreviewScenarioDesignOnlyFilePath('/tmp/scenarioSupport.ts'), false);
		assert.strictEqual(isAppPreviewScenarioDesignOnlyFilePath('../scenarioSupport.ts'), false);
		assert.strictEqual(isAppPreviewScenarioDesignOnlyFilePath('src/../scenarioSupport.ts'), false);
		assert.strictEqual(isAppPreviewScenarioDesignOnlyFilePath('https://example.com/file.ts'), false);
	});
});

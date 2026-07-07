/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CDPEvent, ICDPConnection } from '../../common/cdp/types.js';
import { captureElementStates } from '../../common/cdpElementExtraction.js';

class FakeCDPConnection extends Disposable implements ICDPConnection {
	readonly sessionId = 'fake-session';
	readonly targetId = 'fake-target';

	private readonly _onEvent = this._register(new Emitter<CDPEvent>());
	readonly onEvent: Event<CDPEvent> = this._onEvent.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose: Event<void> = this._onClose.event;

	readonly calls: Array<{ readonly method: string; readonly params: unknown }> = [];

	constructor(private readonly responses: Readonly<Record<string, unknown>>) {
		super();
	}

	async sendCommand(method: string, params?: unknown): Promise<unknown> {
		this.calls.push({ method, params });
		return method in this.responses ? this.responses[method] : {};
	}
}

suite('captureElementStates', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('forces each requested pseudo-state, captures CSS variables and matched rules, then restores', async () => {
		const connection = store.add(new FakeCDPConnection({
			'CSS.getMatchedStylesForNode': {
				matchedCSSRules: [{
					rule: {
						origin: 'regular',
						style: { cssText: 'color: var(--brand-color);', cssProperties: [{ name: 'color', value: 'var(--brand-color)' }] },
						selectorList: { selectors: [{ text: '.button:hover' }] },
					},
				}],
			},
			'CSS.getComputedStyleForNode': {
				computedStyle: [
					{ name: 'color', value: 'rgb(255, 0, 0)' },
					{ name: '--brand-color', value: '#ff0000' },
				],
			},
		}));

		const states = await captureElementStates(connection, 42, ['hover', 'focus']);

		assert.strictEqual(states.length, 2);
		assert.strictEqual(states[0].state, 'hover');
		assert.strictEqual(states[0].computedStyles['--brand-color'], '#ff0000');
		assert.strictEqual(states[0].matchedStyleRules.length, 1);
		assert.strictEqual(states[0].matchedStyleRules[0].selector, '.button:hover');

		const forceCalls = connection.calls.filter(call => call.method === 'CSS.forcePseudoState');
		assert.strictEqual(forceCalls.length, 3);
		assert.deepStrictEqual(forceCalls[0].params, { nodeId: 42, forcedPseudoClasses: ['hover'] });
		assert.deepStrictEqual(forceCalls[1].params, { nodeId: 42, forcedPseudoClasses: ['focus'] });
		assert.deepStrictEqual(forceCalls[2].params, { nodeId: 42, forcedPseudoClasses: [] });
	});

	test('silently drops pseudo-state names the CDP protocol does not support', async () => {
		const connection = store.add(new FakeCDPConnection({}));

		const states = await captureElementStates(connection, 1, ['made-up-state']);

		assert.strictEqual(states.length, 0);
		assert.strictEqual(connection.calls.length, 0);
	});

	test('always restores state even if a forced-state read throws', async () => {
		let callCount = 0;
		const connection: ICDPConnection = {
			sessionId: 'fake-session',
			targetId: 'fake-target',
			onEvent: Event.None,
			onClose: Event.None,
			dispose: () => { },
			sendCommand: async (method: string, params?: unknown): Promise<unknown> => {
				callCount++;
				if (method === 'CSS.getMatchedStylesForNode') {
					throw new Error('boom');
				}
				return {};
			},
		};

		const states = await captureElementStates(connection, 1, ['hover']);

		assert.strictEqual(states.length, 0);
		assert.ok(callCount >= 2);
	});
});

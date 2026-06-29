/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createElementContextValue, isTrustedContentAttachmentUrl } from '../../electron-browser/features/browserEditorChatFeatures.js';
import { IElementData } from '../../../../../platform/browserView/common/browserView.js';

suite('BrowserEditorChatFeatures', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('createElementContextValue formats selected element context for clipboard handoff', () => {
		const value = createElementContextValue({
			url: 'https://example.com/page',
			outerHTML: '<button id="save">Save</button>',
			computedStyle: 'display: inline-flex;',
			ancestors: [
				{ tagName: 'BODY', classNames: [] },
				{ tagName: 'BUTTON', id: 'save', classNames: ['primary'] }
			],
			dimensions: { top: 10, left: 20, width: 80, height: 24 },
			bounds: { x: 20, y: 10, width: 80, height: 24 }
		} as IElementData, 'button#save.primary');

		assert.ok(value.includes('Attached Element Context from Integrated Browser'));
		assert.ok(value.includes('URL: https://example.com/page'));
		assert.ok(value.includes('HTML Path: BODY > BUTTON#save.primary'));
		assert.ok(value.includes('```html\n<button id="save">Save</button>\n```'));
		assert.ok(value.includes('```css\ndisplay: inline-flex;\n```'));
	});

	test('isTrustedContentAttachmentUrl trusts localhost and file URLs with trusted workspace info', async () => {
		assert.strictEqual(await isTrustedContentAttachmentUrl('http://localhost:3000'), true);
		assert.strictEqual(await isTrustedContentAttachmentUrl('http://127.0.0.1:3000'), true);
		assert.strictEqual(await isTrustedContentAttachmentUrl('file:///tmp/index.html', async () => true), true);
	});

	test('isTrustedContentAttachmentUrl does not trust remote or untrusted file URLs', async () => {
		assert.strictEqual(await isTrustedContentAttachmentUrl('https://example.com'), false);
		assert.strictEqual(await isTrustedContentAttachmentUrl('file:///tmp/index.html', async () => false), false);
		assert.strictEqual(await isTrustedContentAttachmentUrl('not a url'), false);
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { BrowserViewKind, getBrowserViewAuthNavigationAction, getBrowserViewExternalLinkAction, getBrowserViewKindForInitialState, isBrowserViewLocalHttpUrl, shouldOpenBrowserViewTargetInternally } from '../../common/browserView.js';

suite('BrowserView Auth Flow', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('opens outbound App Preview web URLs internally from local origins', () => {
		assert.strictEqual(getBrowserViewAuthNavigationAction({
			kind: BrowserViewKind.AppPreview,
			currentUrl: 'http://127.0.0.1:3000/',
			targetUrl: 'https://login.example.com/oauth',
		}), 'openInternal');
	});

	test('opens outbound App Preview web URLs internally from startup pages', () => {
		assert.strictEqual(getBrowserViewAuthNavigationAction({
			kind: BrowserViewKind.AppPreview,
			currentUrl: 'data:text/html,Starting',
			targetUrl: 'https://login.example.com/oauth',
		}), 'openInternal');
	});

	test('ignores outbound web URLs for regular browser views', () => {
		assert.strictEqual(getBrowserViewAuthNavigationAction({
			kind: BrowserViewKind.Browser,
			currentUrl: 'http://127.0.0.1:3000/',
			targetUrl: 'https://login.example.com/oauth',
		}), 'allow');
	});

	test('opens integrated browser web popup targets internally', () => {
		assert.strictEqual(shouldOpenBrowserViewTargetInternally('https://example.com/login'), true);
		assert.strictEqual(shouldOpenBrowserViewTargetInternally('http://example.com/docs'), true);
		assert.strictEqual(shouldOpenBrowserViewTargetInternally('mailto:test@example.com'), false);
	});

	test('opens external web links internally while an App Preview is active', () => {
		assert.strictEqual(getBrowserViewExternalLinkAction({
			targetUrl: 'https://login.example.com/oauth',
			hasAppPreview: true,
			openLocalhostLinks: false,
		}), 'openInternal');
	});

	test('keeps all-interfaces dev server links internal when localhost links are enabled', () => {
		assert.strictEqual(getBrowserViewExternalLinkAction({
			targetUrl: 'http://0.0.0.0:5173/',
			hasAppPreview: false,
			openLocalhostLinks: true,
		}), 'openInternal');
	});

	test('does not open non-web external links internally', () => {
		assert.strictEqual(getBrowserViewExternalLinkAction({
			targetUrl: 'mailto:test@example.com',
			hasAppPreview: true,
			openLocalhostLinks: true,
		}), 'allowExternal');
	});

	test('routes auth flow callbacks back to App Preview', () => {
		assert.strictEqual(getBrowserViewAuthNavigationAction({
			kind: BrowserViewKind.AppPreview,
			currentUrl: 'https://login.example.com/oauth',
			targetUrl: 'https://local.example.test/callback?code=123',
			inAuthWindow: true,
		}), 'returnToPreview');
	});

	test('keeps auth window redirects in the same internal tab', () => {
		assert.strictEqual(getBrowserViewAuthNavigationAction({
			kind: BrowserViewKind.AppPreview,
			currentUrl: 'https://login.example.com/oauth',
			targetUrl: 'https://sts.example.com/saml',
			inAuthWindow: true,
		}), 'allow');
	});

	test('does not intercept non-web protocols', () => {
		assert.strictEqual(getBrowserViewAuthNavigationAction({
			kind: BrowserViewKind.AppPreview,
			currentUrl: 'http://127.0.0.1:3000/',
			targetUrl: 'mailto:test@example.com',
		}), 'allow');
	});

	test('recognizes local app preview callback origins', () => {
		assert.strictEqual(isBrowserViewLocalHttpUrl('http://localhost:3000/'), true);
		assert.strictEqual(isBrowserViewLocalHttpUrl('http://127.0.0.1:3000/'), true);
		assert.strictEqual(isBrowserViewLocalHttpUrl('https://local.example.test/callback'), true);
		assert.strictEqual(isBrowserViewLocalHttpUrl('https://example.com/'), false);
	});

	test('preserves App Preview kind when restoring serialized preview state', () => {
		assert.strictEqual(getBrowserViewKindForInitialState({ isSessionAppPreview: true }), BrowserViewKind.AppPreview);
		assert.strictEqual(getBrowserViewKindForInitialState({}), BrowserViewKind.Browser);
	});
});

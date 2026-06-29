/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { extractHttpUrls, extractLocalhostUrls, normalizeHttpUrl } from '../../common/appPreviewUrl.js';

suite('AppPreviewUrl', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('extracts localhost URLs from dev server output', () => {
		assert.deepStrictEqual(
			extractLocalhostUrls('Local: http://localhost:5173/ ready'),
			['http://localhost:5173/'],
		);
		assert.deepStrictEqual(
			extractLocalhostUrls('Next.js started at http://127.0.0.1:3000'),
			['http://127.0.0.1:3000/'],
		);
	});

	test('extracts multiple URLs on one line', () => {
		assert.deepStrictEqual(
			extractLocalhostUrls('Local: http://localhost:5173/ Network: http://0.0.0.0:5173/'),
			['http://localhost:5173/', 'http://localhost:5173/'],
		);
	});

	test('ignores external and malformed URLs', () => {
		assert.deepStrictEqual(
			extractLocalhostUrls('Docs: https://example.com App: http://not a url'),
			[],
		);
	});

	test('normalizes all-interface hosts to localhost', () => {
		assert.deepStrictEqual(
			extractLocalhostUrls('Network: http://0.0.0.0:4173/path?q=1'),
			['http://localhost:4173/path?q=1'],
		);
	});

	test('trims punctuation around URLs in logs and prose', () => {
		assert.deepStrictEqual(
			extractLocalhostUrls('Open (http://localhost:3000).'),
			['http://localhost:3000/'],
		);
	});

	test('extracts advertised http URLs including custom local hostnames', () => {
		assert.deepStrictEqual(
			extractHttpUrls('ready built in 22.5s\nNetwork: https://local.preview.example.test:22552/'),
			['https://local.preview.example.test:22552/'],
		);
	});

	test('does not include terminal color escapes in extracted URLs', () => {
		assert.deepStrictEqual(
			extractHttpUrls('Network: https://local.preview.example.test:22552/\x1B[39m'),
			['https://local.preview.example.test:22552/'],
		);
	});

	test('extracts advertised URLs after terminal chunks are accumulated', () => {
		const chunks = [
			'ready built in 22.5s\nNetwork: https://local.preview.example.',
			'test:22552/'
		];
		assert.deepStrictEqual(
			extractHttpUrls(chunks.join('')),
			['https://local.preview.example.test:22552/'],
		);
	});

	test('normalizes only http and https URLs', () => {
		assert.strictEqual(normalizeHttpUrl('http://localhost:3000'), 'http://localhost:3000/');
		assert.strictEqual(normalizeHttpUrl('https://localhost:3000'), 'https://localhost:3000/');
		assert.strictEqual(normalizeHttpUrl('file:///tmp/index.html'), undefined);
		assert.strictEqual(normalizeHttpUrl('not a url'), undefined);
	});
});

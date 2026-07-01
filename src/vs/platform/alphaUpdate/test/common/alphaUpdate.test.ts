/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AlphaUpdateValidationError, AlphaUpdateValidationFailureCode, IAlphaUpdate, PARAKIT_ALPHA_PLATFORM, validateAlphaUpdateFeed } from '../../common/alphaUpdate.js';

suite('Alpha update feed validation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('parses a valid feed', () => {
		const update = validateAlphaUpdateFeed(validFeed(), { currentCommit: 'old-commit', expectedPlatform: PARAKIT_ALPHA_PLATFORM });

		assert.deepStrictEqual(update, validFeed());
	});

	test('rejects the current commit', () => {
		assertValidationFailure(
			() => validateAlphaUpdateFeed(validFeed(), { currentCommit: 'new-commit', expectedPlatform: PARAKIT_ALPHA_PLATFORM }),
			AlphaUpdateValidationFailureCode.SameCommit
		);
	});

	test('rejects the wrong platform', () => {
		assertValidationFailure(
			() => validateAlphaUpdateFeed({ ...validFeed(), platform: 'darwin-x64' }, { currentCommit: 'old-commit', expectedPlatform: PARAKIT_ALPHA_PLATFORM }),
			AlphaUpdateValidationFailureCode.UnsupportedPlatform
		);
	});

	test('rejects non-HTTPS download URLs', () => {
		assertValidationFailure(
			() => validateAlphaUpdateFeed({ ...validFeed(), url: 'http://example.com/Parakit.zip' }, { currentCommit: 'old-commit', expectedPlatform: PARAKIT_ALPHA_PLATFORM }),
			AlphaUpdateValidationFailureCode.NonHttpsUrl
		);
	});

	test('rejects malformed SHA-256 values', () => {
		assertValidationFailure(
			() => validateAlphaUpdateFeed({ ...validFeed(), sha256: 'abc123' }, { currentCommit: 'old-commit', expectedPlatform: PARAKIT_ALPHA_PLATFORM }),
			AlphaUpdateValidationFailureCode.InvalidSha256
		);
	});
});

function validFeed(): IAlphaUpdate {
	return {
		version: '1.126.0',
		commit: 'new-commit',
		date: '2026-07-01T00:00:00.000Z',
		platform: PARAKIT_ALPHA_PLATFORM,
		url: 'https://github.com/dehyde/Parakit/releases/download/parakit-alpha/Parakit-mac-arm64.zip',
		sha256: '0'.repeat(64),
		size: 1,
	};
}

function assertValidationFailure(fn: () => void, code: AlphaUpdateValidationFailureCode): void {
	try {
		fn();
		assert.fail(`Expected alpha update validation failure ${code}`);
	} catch (error) {
		assert.ok(error instanceof AlphaUpdateValidationError);
		assert.strictEqual(error.code, code);
	}
}

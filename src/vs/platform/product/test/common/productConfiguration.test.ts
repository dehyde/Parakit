/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import product from '../../common/product.js';

suite('Product Configuration', () => {

	test('ships Claude Code as an auto-updateable built-in extension in stable quality', () => {
		const claudeCodeExtensionId = 'Anthropic.claude-code';

		assert.strictEqual(product.quality, 'stable');
		assert.ok(product.builtInExtensions?.some(extension => extension.name === claudeCodeExtensionId));
		assert.ok(product.builtInExtensionsEnabledWithAutoUpdates.includes(claudeCodeExtensionId));
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { getDesignerWorkspaceRepository } from '../designerWorkspaceRepository';

suite('Designer Workspace Repository', () => {
	test('matches an open repository by workspace root', () => {
		const repository = createRepository({ root: '/Users/test/Documents/Designer Repos/app' });

		assert.strictEqual(getDesignerWorkspaceRepository([repository], '/Users/test/Documents/Designer Repos/app'), repository);
	});

	test('matches an open repository by real path when workspace root is a symlink', () => {
		const repository = createRepository({
			root: '/Users/test/Documents/Designer Repos/app',
			rootRealPath: '/private/var/folders/app-real'
		});

		assert.strictEqual(getDesignerWorkspaceRepository([repository], '/Users/test/Desktop/app-link', '/private/var/folders/app-real'), repository);
	});

	test('ignores hidden and non-repository entries', () => {
		const hidden = createRepository({ root: '/repo', isHidden: true });
		const worktree = createRepository({ root: '/repo', kind: 'worktree' });
		const repository = createRepository({ root: '/repo' });

		assert.strictEqual(getDesignerWorkspaceRepository([hidden, worktree, repository], '/repo'), repository);
	});
});

function createRepository(options: { root: string; rootRealPath?: string; isHidden?: boolean; kind?: string }) {
	return {
		root: options.root,
		rootRealPath: options.rootRealPath,
		isHidden: options.isHidden ?? false,
		kind: options.kind ?? 'repository'
	};
}

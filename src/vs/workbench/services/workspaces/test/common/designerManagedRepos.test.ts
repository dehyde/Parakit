/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { clearDesignerStartupRestorePending, getDesignerManagedRepoForFolder, getDesignerManagedReposManifestResource, getDesignerStateResource, markDesignerStartupRestorePending, parseDesignerManagedReposManifest, parseDesignerState, updateDesignerLastActiveRepo, upsertDesignerManagedRepo } from '../../common/designerManagedRepos.js';

suite('Designer Managed Repos Manifest', () => {
	test('missing or invalid manifest is ignored safely', () => {
		assert.deepStrictEqual(parseDesignerManagedReposManifest(undefined), { version: 1, repos: [] });
		assert.deepStrictEqual(parseDesignerManagedReposManifest('{'), { version: 1, repos: [] });
		assert.deepStrictEqual(parseDesignerManagedReposManifest(JSON.stringify({ version: 2, repos: [{ path: '/repo' }] })), { version: 1, repos: [] });
	});

	test('repo path in manifest is recognized', () => {
		const manifest = parseDesignerManagedReposManifest(JSON.stringify({
			version: 1,
			repos: [{ path: '/Users/test/Documents/Designer Repos/app', name: 'app', addedAt: 1 }]
		}));

		assert.strictEqual(getDesignerManagedRepoForFolder(manifest, '/Users/test/Documents/Designer Repos/app', '/Users/test/Documents/VSCode Fork')?.path, '/Users/test/Documents/Designer Repos/app');
	});

	test('child folder inside a manifest repo is recognized', () => {
		const manifest = parseDesignerManagedReposManifest(JSON.stringify({
			version: 1,
			repos: [{ path: '/Users/test/Documents/Designer Repos/app', name: 'app', addedAt: 1 }]
		}));

		assert.strictEqual(getDesignerManagedRepoForFolder(manifest, '/Users/test/Documents/Designer Repos/app/packages/site', '/Users/test/Documents/VSCode Fork')?.path, '/Users/test/Documents/Designer Repos/app');
	});

	test('similar path prefix is not recognized as a child folder', () => {
		const manifest = parseDesignerManagedReposManifest(JSON.stringify({
			version: 1,
			repos: [{ path: '/Users/test/Documents/Designer Repos/app', name: 'app', addedAt: 1 }]
		}));

		assert.strictEqual(getDesignerManagedRepoForFolder(manifest, '/Users/test/Documents/Designer Repos/application', '/Users/test/Documents/VSCode Fork'), undefined);
	});

	test('app source repo is rejected even if present in manifest', () => {
		const manifest = parseDesignerManagedReposManifest(JSON.stringify({
			version: 1,
			repos: [{ path: '/Users/test/Documents/VSCode Fork', name: 'VSCode Fork', addedAt: 1 }]
		}));

		assert.strictEqual(getDesignerManagedRepoForFolder(manifest, '/Users/test/Documents/VSCode Fork', '/Users/test/Documents/VSCode Fork'), undefined);
	});

	test('upsert appends and updates repos by path without dropping previous repos', () => {
		const first = upsertDesignerManagedRepo({ version: 1, repos: [] }, { path: '/repo-a', name: 'repo-a', addedAt: 10 });
		const second = upsertDesignerManagedRepo(first, { path: '/repo-b', name: 'repo-b', addedAt: 20 });
		const updated = upsertDesignerManagedRepo(second, { path: '/repo-a', name: 'Repo A', url: 'https://example.com/repo-a.git', addedAt: 30 });

		assert.deepStrictEqual(updated.repos.map(repo => repo.path), ['/repo-a', '/repo-b']);
		assert.strictEqual(updated.repos[0].name, 'Repo A');
		assert.strictEqual(updated.repos[0].url, 'https://example.com/repo-a.git');
		assert.strictEqual(updated.repos[0].addedAt, 10);
	});

	test('manifest resource lives outside project repos in the designer parent folder', () => {
		assert.strictEqual(
			getDesignerManagedReposManifestResource(URI.file('/Users/test')).fsPath,
			'/Users/test/Documents/Designer Repos/.designer/managed-repos.json'
		);
	});

	test('designer state stores the last active repo path', () => {
		const state = updateDesignerLastActiveRepo(parseDesignerState(undefined), '/Users/test/Documents/Designer Repos/app');

		assert.deepStrictEqual(state, { version: 1, lastActiveRepoPath: '/Users/test/Documents/Designer Repos/app' });
	});

	test('designer state stores the last active branch name', () => {
		const state = updateDesignerLastActiveRepo(parseDesignerState(undefined), '/Users/test/Documents/Designer Repos/app', 'feature/design');

		assert.deepStrictEqual(state, {
			version: 1,
			lastActiveRepoPath: '/Users/test/Documents/Designer Repos/app',
			lastActiveBranchName: 'feature/design'
		});
		assert.deepStrictEqual(parseDesignerState(JSON.stringify(state)), state);
	});

	test('designer state marks and clears pending startup restore', () => {
		const state = updateDesignerLastActiveRepo(parseDesignerState(undefined), '/Users/test/Documents/Designer Repos/app', 'feature/design');
		const pending = markDesignerStartupRestorePending(state, 100);

		assert.deepStrictEqual(pending, {
			version: 1,
			lastActiveRepoPath: '/Users/test/Documents/Designer Repos/app',
			lastActiveBranchName: 'feature/design',
			pendingStartupRestore: {
				repoPath: '/Users/test/Documents/Designer Repos/app',
				branchName: 'feature/design',
				createdAt: 100
			}
		});
		assert.deepStrictEqual(clearDesignerStartupRestorePending(pending), state);
	});

	test('invalid designer state is ignored safely', () => {
		assert.deepStrictEqual(parseDesignerState('{'), { version: 1 });
		assert.deepStrictEqual(parseDesignerState(JSON.stringify({ version: 2, lastActiveRepoPath: '/repo' })), { version: 1 });
		assert.deepStrictEqual(parseDesignerState(JSON.stringify({ version: 1, lastActiveRepoPath: '' })), { version: 1 });
	});

	test('designer state resource lives next to managed repos manifest', () => {
		assert.strictEqual(
			getDesignerStateResource(URI.file('/Users/test')).fsPath,
			'/Users/test/Documents/Designer Repos/.designer/state.json'
		);
	});
});

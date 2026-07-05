/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustTransitionParticipant } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { getDesignerManagedReposManifestResource, readDesignerManagedReposManifest, readDesignerState } from '../../common/designerManagedRepos.js';
import { trustDesignerManagedFolder } from '../../browser/designerWorkspaceTrust.contribution.js';

suite('Designer Workspace Trust Command', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let fileService: FileService;
	let trustService: RecordingWorkspaceTrustManagementService;
	const userHome = URI.file('/Users/test');
	const environmentService = {
		userHome,
		appRoot: '/Users/test/Documents/VSCode Fork'
	} as unknown as IWorkbenchEnvironmentService;

	setup(() => {
		fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
		trustService = new RecordingWorkspaceTrustManagementService();
	});

	test('object argument writes manifest and trusts folder', async () => {
		await trustDesignerManagedFolder(fileService, trustService, environmentService, {
			path: '/Users/test/Documents/Designer Repos/app',
			name: 'app',
			url: 'https://example.com/app.git',
			branchName: 'feature/design'
		});

		const manifest = await readDesignerManagedReposManifest(fileService, userHome);
		assert.strictEqual(manifest.repos.length, 1);
		assert.strictEqual(manifest.repos[0].path, '/Users/test/Documents/Designer Repos/app');
		assert.strictEqual(manifest.repos[0].name, 'app');
		assert.strictEqual(manifest.repos[0].url, 'https://example.com/app.git');
		const state = await readDesignerState(fileService, userHome);
		assert.strictEqual(state.lastActiveRepoPath, '/Users/test/Documents/Designer Repos/app');
		assert.strictEqual(state.lastActiveBranchName, 'feature/design');
		assert.deepStrictEqual(trustService.trustedUris.map(uri => uri.fsPath), ['/Users/test/Documents/Designer Repos/app']);
	});

	test('legacy string argument still works', async () => {
		await trustDesignerManagedFolder(fileService, trustService, environmentService, '/Users/test/Documents/Designer Repos/app');

		const manifest = await readDesignerManagedReposManifest(fileService, userHome);
		assert.strictEqual(manifest.repos[0].path, '/Users/test/Documents/Designer Repos/app');
		assert.strictEqual((await readDesignerState(fileService, userHome)).lastActiveRepoPath, '/Users/test/Documents/Designer Repos/app');
		assert.deepStrictEqual(trustService.trustedUris.map(uri => uri.fsPath), ['/Users/test/Documents/Designer Repos/app']);
	});

	test('existing manifest entries are preserved when a new repo is trusted', async () => {
		const manifestResource = getDesignerManagedReposManifestResource(userHome);
		await fileService.createFolder(URI.file('/Users/test/Documents/Designer Repos/.designer'));
		await fileService.writeFile(manifestResource, VSBuffer.fromString(JSON.stringify({
			version: 1,
			repos: [{ path: '/Users/test/Documents/Designer Repos/app-a', name: 'app-a', addedAt: 1 }]
		})));

		await trustDesignerManagedFolder(fileService, trustService, environmentService, {
			path: '/Users/test/Documents/Designer Repos/app-b',
			name: 'app-b'
		});

		const manifest = await readDesignerManagedReposManifest(fileService, userHome);
		assert.deepStrictEqual(manifest.repos.map(repo => repo.path), [
			'/Users/test/Documents/Designer Repos/app-a',
			'/Users/test/Documents/Designer Repos/app-b'
		]);
	});

	test('empty path and app source repo are rejected', async () => {
		await trustDesignerManagedFolder(fileService, trustService, environmentService, '');
		await trustDesignerManagedFolder(fileService, trustService, environmentService, '/Users/test/Documents/VSCode Fork');

		const manifest = await readDesignerManagedReposManifest(fileService, userHome);
		assert.strictEqual(manifest.repos.length, 0);
		assert.strictEqual((await readDesignerState(fileService, userHome)).lastActiveRepoPath, undefined);
		assert.strictEqual(trustService.trustedUris.length, 0);
	});
});

class RecordingWorkspaceTrustManagementService implements IWorkspaceTrustManagementService {
	declare readonly _serviceBrand: undefined;

	readonly trustedUris: URI[] = [];

	readonly workspaceResolved = Promise.resolve();
	readonly workspaceTrustInitialized = Promise.resolve();
	readonly onDidChangeTrust = Event.None;
	readonly onDidChangeTrustedFolders = Event.None;
	acceptsOutOfWorkspaceFiles = false;

	isWorkspaceTrusted(): boolean { return false; }
	isWorkspaceTrustForced(): boolean { return false; }
	canSetParentFolderTrust(): boolean { return false; }
	async setParentFolderTrust(): Promise<void> { }
	canSetWorkspaceTrust(): boolean { return false; }
	async setWorkspaceTrust(): Promise<void> { }
	async getUriTrustInfo(uri: URI): Promise<{ trusted: boolean; uri: URI }> { return { trusted: false, uri }; }
	async setUrisTrust(uris: URI[], trusted: boolean): Promise<void> {
		if (trusted) {
			this.trustedUris.push(...uris);
		}
	}
	getTrustedUris(): URI[] { return this.trustedUris; }
	async setTrustedUris(uris: URI[]): Promise<void> {
		this.trustedUris.splice(0, this.trustedUris.length, ...uris);
	}
	addWorkspaceTrustTransitionParticipant(_participant: IWorkspaceTrustTransitionParticipant): IDisposable { return { dispose() { } }; }
}

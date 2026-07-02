/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AddDesignerRepoSourceCommandId, CheckoutDesignerBranchCommandId, DesignerAddRepoChoice, GetDesignerBranchesStateCommandId, shouldShowDesignerEmptyRepoFtux, shouldShowDesignerStartupRepoPicker, shouldSuppressDesignerStartupWelcome, SwitchDesignerRepoCommandId, type DesignerBranchState } from '../../../../services/workspaces/common/designerRepoCommands.js';
import { checkoutDesignerStartupBranch, IDesignerAddRepoServices, IDesignerStartupRepoPickerServices, openDesignerStartupRepo, showDesignerAddRepo } from '../../browser/emptyRepoFtux.contribution.js';

suite('Parakit Empty Repo FTUX', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('is active only when the Parakit repo list is empty', () => {
		assert.strictEqual(shouldShowDesignerEmptyRepoFtux({ currentRepoPath: undefined, repos: [] }), true);
		assert.strictEqual(shouldShowDesignerEmptyRepoFtux({ currentRepoPath: undefined, repos: [{ name: 'app', path: '/repo/app', status: 'ready', isCurrent: false }] }), false);
		assert.strictEqual(shouldShowDesignerEmptyRepoFtux(undefined), false);
	});

	test('startup repo picker is active only when repos exist without a selected repo', () => {
		assert.strictEqual(shouldShowDesignerStartupRepoPicker(undefined), false);
		assert.strictEqual(shouldShowDesignerStartupRepoPicker({ currentRepoPath: undefined, repos: [] }), false);
		assert.strictEqual(shouldShowDesignerStartupRepoPicker({ currentRepoPath: '/repo/app', repos: [{ name: 'app', path: '/repo/app', status: 'ready', isCurrent: true }] }), false);
		assert.strictEqual(shouldShowDesignerStartupRepoPicker({ currentRepoPath: undefined, repos: [{ name: 'app', path: '/repo/app', status: 'ready', isCurrent: true }] }), false);
		assert.strictEqual(shouldShowDesignerStartupRepoPicker({ currentRepoPath: undefined, repos: [{ name: 'app', path: '/repo/app', status: 'ready', isCurrent: false }] }), true);
	});

	test('startup welcome is suppressed while a Designer repo modal owns startup', () => {
		assert.strictEqual(shouldSuppressDesignerStartupWelcome(undefined), false);
		assert.strictEqual(shouldSuppressDesignerStartupWelcome({ currentRepoPath: undefined, repos: [] }), true);
		assert.strictEqual(shouldSuppressDesignerStartupWelcome({ currentRepoPath: undefined, repos: [{ name: 'app', path: '/repo/app', status: 'ready', isCurrent: false }] }), true);
		assert.strictEqual(shouldSuppressDesignerStartupWelcome({ currentRepoPath: '/repo/app', repos: [{ name: 'app', path: '/repo/app', status: 'ready', isCurrent: true }] }), false);
	});

	test('typed repo URL delegates to add source', async () => {
		const commands: { id: string; arg: unknown }[] = [];
		const result = await showDesignerAddRepo(createTestServices({
			pickedSource: ' https://github.com/acme/app.git ',
			onExecute: (id, arg) => commands.push({ id, arg })
		}));

		assert.strictEqual(result, true);
		assert.deepStrictEqual(commands, [{ id: AddDesignerRepoSourceCommandId, arg: { source: 'https://github.com/acme/app.git' } }]);
	});

	test('Open local folder delegates to add source', async () => {
		const commands: { id: string; arg: unknown }[] = [];
		const result = await showDesignerAddRepo(createTestServices({
			pickedChoice: DesignerAddRepoChoice.OpenLocalFolder,
			folder: URI.file('/workspace/app'),
			onExecute: (id, arg) => commands.push({ id, arg })
		}));

		assert.strictEqual(result, true);
		assert.deepStrictEqual(commands, [{ id: AddDesignerRepoSourceCommandId, arg: { source: '/workspace/app' } }]);
	});

	test('direct source skips the modal pick', async () => {
		let pickRequests = 0;
		const commands: { id: string; arg: unknown }[] = [];
		const result = await showDesignerAddRepo(createTestServices({
			onPick: () => pickRequests++,
			onExecute: (id, arg) => commands.push({ id, arg })
		}), { source: 'https://github.com/acme/app.git' });

		assert.strictEqual(result, true);
		assert.strictEqual(pickRequests, 0);
		assert.deepStrictEqual(commands, [{ id: AddDesignerRepoSourceCommandId, arg: { source: 'https://github.com/acme/app.git' } }]);
	});

	test('empty pasted URL cancels without adding', async () => {
		const commands: { id: string; arg: unknown }[] = [];
		const result = await showDesignerAddRepo(createTestServices({
			pickedSource: ' ',
			onExecute: (id, arg) => commands.push({ id, arg })
		}));

		assert.strictEqual(result, false);
		assert.deepStrictEqual(commands, []);
	});

	test('startup repo card opens repo and loads branch tree', async () => {
		const branchState = createBranchState();
		const commands: { id: string; arg: unknown }[] = [];
		const result = await openDesignerStartupRepo(createStartupPickerServices({
			onExecute(commandId, argument) {
				commands.push({ id: commandId, arg: argument });
				if (commandId === GetDesignerBranchesStateCommandId) {
					return branchState;
				}
				return undefined;
			}
		}), { name: 'app', path: '/repo/app', status: 'ready', isCurrent: false });

		assert.strictEqual(result, branchState);
		assert.deepStrictEqual(commands, [
			{ id: SwitchDesignerRepoCommandId, arg: { repoPath: '/repo/app', skipSave: true } },
			{ id: GetDesignerBranchesStateCommandId, arg: { updateRemotes: true } }
		]);
	});

	test('startup repo card rejects repos that are not ready', async () => {
		const commands: { id: string; arg: unknown }[] = [];
		await assert.rejects(
			() => openDesignerStartupRepo(createStartupPickerServices({
				onExecute: (commandId, argument) => commands.push({ id: commandId, arg: argument })
			}), { name: 'app', path: '/repo/app', status: 'problem', isCurrent: false }),
			/Repo is not ready/
		);

		assert.deepStrictEqual(commands, []);
	});

	test('startup branch selection checks out non-current branches without saving', async () => {
		const commands: { id: string; arg: unknown }[] = [];
		const result = await checkoutDesignerStartupBranch(createStartupPickerServices({
			onExecute: (commandId, argument) => commands.push({ id: commandId, arg: argument })
		}), { name: 'design/card-list', path: ['design', 'card-list'], status: 'synced', isCurrent: false, isDefault: false });

		assert.strictEqual(result, true);
		assert.deepStrictEqual(commands, [
			{ id: CheckoutDesignerBranchCommandId, arg: { branchName: 'design/card-list', skipSave: true } }
		]);
	});
});

function createBranchState(): DesignerBranchState {
	return {
		projectName: 'app',
		defaultBranch: 'main',
		currentBranch: 'main',
		syncState: 'synced',
		repositoryReady: true,
		branches: [
			{ name: 'main', path: ['main'], status: 'synced', isCurrent: true, isDefault: true },
			{ name: 'design/card-list', path: ['design', 'card-list'], status: 'synced', isCurrent: false, isDefault: false }
		],
		tree: [
			{ name: 'main', path: ['main'], branch: { name: 'main', path: ['main'], status: 'synced', isCurrent: true, isDefault: true }, children: [] },
			{
				name: 'design',
				path: ['design'],
				children: [
					{ name: 'card-list', path: ['design', 'card-list'], branch: { name: 'design/card-list', path: ['design', 'card-list'], status: 'synced', isCurrent: false, isDefault: false }, children: [] }
				]
			}
		]
	};
}

function createTestServices(options: {
	readonly pickedChoice?: DesignerAddRepoChoice;
	readonly pickedSource?: string;
	readonly folder?: URI;
	readonly onPick?: () => void;
	readonly onExecute?: (id: string, arg: unknown) => void;
}): IDesignerAddRepoServices {
	return {
		dialog: {
			async pick() {
				options.onPick?.();
				if (options.pickedSource !== undefined) {
					return { source: options.pickedSource };
				}
				if (options.pickedChoice === DesignerAddRepoChoice.OpenLocalFolder) {
					return { choice: DesignerAddRepoChoice.OpenLocalFolder };
				}
				return undefined;
			}
		},
		fileDialog: {
			pickFolder: async () => options.folder
		},
		commands: {
			async execute(commandId: string, argument: unknown) {
				options.onExecute?.(commandId, argument);
			}
		},
		notify: {
			error(error: unknown) {
				throw error instanceof Error ? error : new Error(String(error));
			}
		}
	};
}

function createStartupPickerServices(options: {
	readonly onExecute?: (id: string, arg: unknown) => unknown;
}): IDesignerStartupRepoPickerServices {
	return {
		commands: {
			async execute(commandId: string, argument: unknown) {
				return options.onExecute?.(commandId, argument);
			}
		},
		notify: {
			error(error: unknown) {
				throw error instanceof Error ? error : new Error(String(error));
			}
		}
	};
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AddDesignerRepoSourceCommandId, DesignerAddRepoChoice, shouldShowDesignerEmptyRepoFtux } from '../../../../services/workspaces/common/designerRepoCommands.js';
import { IDesignerAddRepoServices, showDesignerAddRepo } from '../../browser/emptyRepoFtux.contribution.js';

suite('Parakit Empty Repo FTUX', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('is active only when the Parakit repo list is empty', () => {
		assert.strictEqual(shouldShowDesignerEmptyRepoFtux({ currentRepoPath: undefined, repos: [] }), true);
		assert.strictEqual(shouldShowDesignerEmptyRepoFtux({ currentRepoPath: undefined, repos: [{ name: 'app', path: '/repo/app', status: 'ready', isCurrent: false }] }), false);
		assert.strictEqual(shouldShowDesignerEmptyRepoFtux(undefined), false);
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
});

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

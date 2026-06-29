/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandEvent, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { saveDesignerChangesBeforeUpdate } from '../../browser/update.js';

suite('Designer update preflight', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('blocks update when designer save preflight is blocked', async () => {
		const commandService = new DesignerPreflightCommandService({ state: 'blocked', message: 'Could not save before update' });

		await assert.rejects(
			() => saveDesignerChangesBeforeUpdate(commandService),
			error => error instanceof Error && error.message === 'Could not save before update'
		);
		assert.deepStrictEqual(commandService.commands, ['_designerBranches.saveBeforeCriticalAction']);
	});

	test('allows update when designer save preflight is synced', async () => {
		const commandService = new DesignerPreflightCommandService({ state: 'synced' });

		await saveDesignerChangesBeforeUpdate(commandService);

		assert.deepStrictEqual(commandService.commands, ['_designerBranches.saveBeforeCriticalAction']);
	});
});

class DesignerPreflightCommandService implements ICommandService {
	declare readonly _serviceBrand: undefined;

	private readonly _onWillExecuteCommand = new Emitter<ICommandEvent>();
	readonly onWillExecuteCommand: Event<ICommandEvent> = this._onWillExecuteCommand.event;

	private readonly _onDidExecuteCommand = new Emitter<ICommandEvent>();
	readonly onDidExecuteCommand: Event<ICommandEvent> = this._onDidExecuteCommand.event;

	readonly commands: string[] = [];

	constructor(private readonly result: { state?: string; message?: string }) { }

	async executeCommand<T>(commandId: string): Promise<T | undefined> {
		this.commands.push(commandId);
		return this.result as T;
	}
}

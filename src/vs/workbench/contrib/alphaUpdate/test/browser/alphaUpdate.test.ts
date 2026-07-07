/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AlphaUpdateState, IAlphaUpdate, IAlphaUpdateService, PARAKIT_ALPHA_PLATFORM } from '../../../../../platform/alphaUpdate/common/alphaUpdate.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { INotificationHandle, INotificationService, IPromptChoice, IPromptChoiceWithMenu, NoOpNotification, Severity } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { checkForAlphaUpdatesWithPrompt } from '../../browser/alphaUpdate.js';

suite('Alpha update prompt', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('suppresses startup prompts after Later for the same commit', async () => {
		const update = createUpdate();
		const alphaUpdateService = new TestAlphaUpdateService(update);
		const notificationService = new TestNotificationService();
		const storageService = disposables.add(new TestStorageService());
		const commandService = new class extends mock<ICommandService>() { };
		const openerService = new class extends mock<IOpenerService>() {
			override open(_resource: URI | string): Promise<boolean> {
				return Promise.resolve(true);
			}
		};

		await checkForAlphaUpdatesWithPrompt(alphaUpdateService, commandService, notificationService, openerService, storageService, false);
		assert.strictEqual(notificationService.prompts.length, 1);

		notificationService.prompts[0].choices.find(choice => choice.label === 'Later')?.run();
		notificationService.prompts.length = 0;

		await checkForAlphaUpdatesWithPrompt(alphaUpdateService, commandService, notificationService, openerService, storageService, false);
		assert.strictEqual(notificationService.prompts.length, 0);

		await checkForAlphaUpdatesWithPrompt(alphaUpdateService, commandService, notificationService, openerService, storageService, true);
		assert.strictEqual(notificationService.prompts.length, 1);
	});
});

class TestAlphaUpdateService implements IAlphaUpdateService {
	declare readonly _serviceBrand: undefined;

	readonly onStateChange = Event.None;
	readonly state = AlphaUpdateState.Idle();

	constructor(private readonly update: IAlphaUpdate | undefined) { }

	checkForUpdates(_explicit: boolean): Promise<IAlphaUpdate | undefined> {
		return Promise.resolve(this.update);
	}

	installUpdate(_update: IAlphaUpdate): Promise<void> {
		return Promise.resolve();
	}
}

class TestNotificationService extends mock<INotificationService>() {
	readonly prompts: { severity: Severity; message: string; choices: (IPromptChoice | IPromptChoiceWithMenu)[] }[] = [];

	override prompt(severity: Severity, message: string, choices: (IPromptChoice | IPromptChoiceWithMenu)[]): INotificationHandle {
		this.prompts.push({ severity, message, choices });
		return new NoOpNotification();
	}

	override info(): void { }
}

function createUpdate(): IAlphaUpdate {
	return {
		version: '1.126.0',
		commit: 'next-commit',
		date: '2026-07-01T00:00:00.000Z',
		platform: PARAKIT_ALPHA_PLATFORM,
		url: 'https://github.com/dehyde/Parakit/releases/download/parakit-alpha/Parakit-mac-arm64.zip',
		sha256: '0'.repeat(64),
		size: 1,
	};
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IAlphaUpdate, IAlphaUpdateService, PARAKIT_ALPHA_RELEASE_URL } from '../../../../platform/alphaUpdate/common/alphaUpdate.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { URI } from '../../../../base/common/uri.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ILifecycleService, LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { saveDesignerChangesBeforeUpdate } from '../../update/browser/update.js';

const LATER_COMMIT_STORAGE_KEY = 'parakit.alphaUpdate.laterCommit';
const STARTUP_CHECK_DELAY = 30 * 1000;

export class AlphaUpdateContribution extends Disposable {

	constructor(
		@IAlphaUpdateService private readonly alphaUpdateService: IAlphaUpdateService,
		@ICommandService private readonly commandService: ICommandService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@INotificationService private readonly notificationService: INotificationService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		lifecycleService.when(LifecyclePhase.Restored).then(() => {
			setTimeout(() => checkForAlphaUpdatesWithPrompt(alphaUpdateService, commandService, notificationService, openerService, storageService, false), STARTUP_CHECK_DELAY);
		});
	}

	async checkForUpdates(explicit: boolean): Promise<IAlphaUpdate | undefined> {
		return checkForAlphaUpdatesWithPrompt(this.alphaUpdateService, this.commandService, this.notificationService, this.openerService, this.storageService, explicit);
	}
}

export async function checkForAlphaUpdatesWithPrompt(
	alphaUpdateService: IAlphaUpdateService,
	commandService: ICommandService,
	notificationService: INotificationService,
	openerService: IOpenerService,
	storageService: IStorageService,
	explicit: boolean
): Promise<IAlphaUpdate | undefined> {
	const update = await alphaUpdateService.checkForUpdates(explicit);
	if (!update) {
		if (explicit) {
			notificationService.info(localize('alphaUpdate.notAvailable', "Parakit is already on the latest alpha."));
		}
		return undefined;
	}

	if (!explicit && storageService.get(LATER_COMMIT_STORAGE_KEY, StorageScope.APPLICATION) === update.commit) {
		return update;
	}

	notificationService.prompt(
		Severity.Info,
		localize('alphaUpdate.available', "A new Parakit alpha is available."),
		[{
			label: localize('alphaUpdate.installAndRestart', "Install and Restart"),
			run: async () => {
				await saveDesignerChangesBeforeUpdate(commandService);
				await alphaUpdateService.installUpdate(update);
			}
		}, {
			label: localize('alphaUpdate.later', "Later"),
			run: () => storageService.store(LATER_COMMIT_STORAGE_KEY, update.commit, StorageScope.APPLICATION, StorageTarget.MACHINE)
		}, {
			label: localize('alphaUpdate.openRelease', "Open Release"),
			run: () => openerService.open(URI.parse(PARAKIT_ALPHA_RELEASE_URL))
		}]
	);

	return update;
}

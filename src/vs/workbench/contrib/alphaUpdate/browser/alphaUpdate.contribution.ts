/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IAlphaUpdateService } from '../../../../platform/alphaUpdate/common/alphaUpdate.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import product from '../../../../platform/product/common/product.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { AlphaUpdateContribution, checkForAlphaUpdatesWithPrompt } from './alphaUpdate.js';

const workbench = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbench.registerWorkbenchContribution(AlphaUpdateContribution, LifecyclePhase.Eventually);

class CheckForAlphaUpdateAction extends Action2 {
	constructor() {
		super({
			id: 'parakit.alphaUpdate.check',
			title: localize2('checkForAlphaUpdate', 'Check for Parakit Alpha Update...'),
			category: { value: product.nameShort, original: product.nameShort },
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		await checkForAlphaUpdatesWithPrompt(
			accessor.get(IAlphaUpdateService),
			accessor.get(ICommandService),
			accessor.get(INotificationService),
			accessor.get(IOpenerService),
			accessor.get(IStorageService),
			true
		);
	}
}

registerAction2(CheckForAlphaUpdateAction);

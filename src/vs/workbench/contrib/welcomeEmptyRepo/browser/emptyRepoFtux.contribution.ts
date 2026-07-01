/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './emptyRepoFtux.css';
import { $, addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { AddDesignerRepoSourceCommandId, DesignerAddRepoChoice, GetDesignerReposStateCommandId, shouldShowDesignerEmptyRepoFtux, ShowDesignerAddRepoCommandId, type DesignerRepoState } from '../../../services/workspaces/common/designerRepoCommands.js';

export type DesignerAddRepoDialogResult =
	| { readonly source: string }
	| { readonly choice: DesignerAddRepoChoice.OpenLocalFolder };

export interface DesignerAddRepoOptions {
	readonly choice?: DesignerAddRepoChoice;
	readonly source?: string;
}

export interface IDesignerAddRepoServices {
	readonly dialog: {
		pick(initialChoice?: DesignerAddRepoChoice): Promise<DesignerAddRepoDialogResult | undefined>;
	};
	readonly fileDialog: {
		pickFolder(): Promise<URI | undefined>;
	};
	readonly commands: {
		execute(commandId: string, argument: unknown): Promise<unknown>;
	};
	readonly notify: {
		error(error: unknown): void;
	};
}

export async function showDesignerAddRepo(services: IDesignerAddRepoServices, options?: DesignerAddRepoOptions | DesignerAddRepoChoice): Promise<boolean> {
	const normalizedOptions = normalizeDesignerAddRepoOptions(options);
	try {
		if (normalizedOptions.source !== undefined) {
			return servicesAddRepoSource(services, normalizedOptions.source);
		}

		if (normalizedOptions.choice === DesignerAddRepoChoice.OpenLocalFolder) {
			return servicesOpenLocalFolder(services);
		}

		const selection = await services.dialog.pick(normalizedOptions.choice);
		if (!selection) {
			return false;
		}

		if ('source' in selection) {
			return servicesAddRepoSource(services, selection.source);
		}

		return servicesOpenLocalFolder(services);
	} catch (error) {
		services.notify.error(error);
		return false;
	}
}

function normalizeDesignerAddRepoOptions(options: DesignerAddRepoOptions | DesignerAddRepoChoice | undefined): DesignerAddRepoOptions {
	if (typeof options === 'string') {
		return { choice: options };
	}

	return options ?? {};
}

async function servicesAddRepoSource(services: IDesignerAddRepoServices, source: string): Promise<boolean> {
	const trimmedSource = source.trim();
	if (!trimmedSource) {
		return false;
	}

	await services.commands.execute(AddDesignerRepoSourceCommandId, { source: trimmedSource });
	return true;
}

async function servicesOpenLocalFolder(services: IDesignerAddRepoServices): Promise<boolean> {
	const folder = await services.fileDialog.pickFolder();
	if (!folder) {
		return false;
	}

	await services.commands.execute(AddDesignerRepoSourceCommandId, { source: folder.fsPath });
	return true;
}

function createDesignerAddRepoServices(accessor: ServicesAccessor): IDesignerAddRepoServices {
	const commandService = accessor.get(ICommandService);
	const fileDialogService = accessor.get(IFileDialogService);
	const notificationService = accessor.get(INotificationService);

	return {
		dialog: {
			pick: initialChoice => showDesignerAddRepoDialog(initialChoice)
		},
		fileDialog: {
			async pickFolder(): Promise<URI | undefined> {
				const folders = await fileDialogService.showOpenDialog({
					canSelectFiles: false,
					canSelectFolders: true,
					canSelectMany: false,
					openLabel: localize('parakitOpenLocalFolderOpenLabel', "Open Folder"),
					title: localize('parakitOpenLocalFolderTitle', "Open Local Folder")
				});

				return folders?.[0];
			}
		},
		commands: {
			execute: (commandId: string, argument: unknown) => commandService.executeCommand(commandId, argument)
		},
		notify: {
			error: error => notificationService.error(error instanceof Error ? error : String(error))
		}
	};
}

function showDesignerAddRepoDialog(initialChoice?: DesignerAddRepoChoice): Promise<DesignerAddRepoDialogResult | undefined> {
	return new Promise(resolve => {
		const store = new DisposableStore();
		const document = mainWindow.document;
		const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;

		const overlay = $('.parakit-empty-repo-dialog-overlay');
		const dialog = $('.parakit-empty-repo-dialog');
		dialog.setAttribute('role', 'dialog');
		dialog.setAttribute('aria-modal', 'true');
		dialog.setAttribute('aria-labelledby', 'parakit-empty-repo-dialog-title');

		const close = document.createElement('button');
		close.className = 'parakit-empty-repo-dialog__close';
		close.type = 'button';
		close.title = localize('parakitEmptyRepoSnooze', "Snooze until next session");
		close.setAttribute('aria-label', localize('parakitEmptyRepoSnoozeAria', "Snooze until next session"));
		close.append($('span.codicon.codicon-close'));

		const logoWrap = $('.parakit-empty-repo-dialog__logo-wrap');
		const logo = document.createElement('img');
		logo.className = 'parakit-empty-repo-dialog__logo';
		logo.alt = localize('parakitEmptyRepoLogoAlt', "Parakit");
		logo.src = FileAccess.asBrowserUri('vs/workbench/browser/media/code-icon.svg').toString(true);
		logoWrap.append(logo);

		const title = $('h1#parakit-empty-repo-dialog-title.parakit-empty-repo-dialog__title', undefined, localize('parakitEmptyRepoWelcomeTitle', "Welcome to Parakit"));
		const detail = $('.parakit-empty-repo-dialog__detail', undefined, localize('parakitEmptyRepoWelcomeDetail', "Parakit makes codebases accessible to PMs and designers. Add a repo to start exploring branches, previews, and product work in one place."));

		const form = document.createElement('form');
		form.className = 'parakit-empty-repo-dialog__form';

		const input = document.createElement('input');
		input.className = 'parakit-empty-repo-dialog__input';
		input.type = 'text';
		input.placeholder = localize('parakitEmptyRepoUrlPlaceholder', "Paste repo URL");
		input.setAttribute('aria-label', localize('parakitEmptyRepoUrlAria', "Repo URL"));
		input.spellcheck = false;

		const submit = document.createElement('button');
		submit.className = 'parakit-empty-repo-dialog__submit';
		submit.type = 'submit';
		submit.disabled = true;
		submit.textContent = localize('parakitEmptyRepoAddRepo', "Add repo");

		const folder = document.createElement('button');
		folder.className = 'parakit-empty-repo-dialog__folder';
		folder.type = 'button';
		folder.append(
			$('span.codicon.codicon-folder-opened'),
			$('span', undefined, localize('parakitEmptyRepoOpenFolder', "Open local folder"))
		);

		const urlRow = $('.parakit-empty-repo-dialog__url-row');
		urlRow.append(input, submit);
		form.append(urlRow, folder);

		const snooze = document.createElement('button');
		snooze.className = 'parakit-empty-repo-dialog__snooze';
		snooze.type = 'button';
		snooze.textContent = localize('parakitEmptyRepoSnoozeButton', "Snooze until next session");

		dialog.append(close, logoWrap, title, detail, form, snooze);
		overlay.append(dialog);
		document.body.append(overlay);

		const finish = (result: DesignerAddRepoDialogResult | undefined) => {
			store.dispose();
			overlay.remove();
			previousFocus?.focus({ preventScroll: true });
			resolve(result);
		};

		const updateSubmitState = () => {
			submit.disabled = !input.value.trim();
		};

		store.add(addDisposableListener(input, EventType.INPUT, updateSubmitState));
		store.add(addDisposableListener(form, EventType.SUBMIT, event => {
			event.preventDefault();
			if (submit.disabled) {
				return;
			}
			finish({ source: input.value.trim() });
		}));
		store.add(addDisposableListener(folder, EventType.CLICK, () => finish({ choice: DesignerAddRepoChoice.OpenLocalFolder })));
		store.add(addDisposableListener(close, EventType.CLICK, () => finish(undefined)));
		store.add(addDisposableListener(snooze, EventType.CLICK, () => finish(undefined)));
		store.add(addDisposableListener(overlay, EventType.MOUSE_DOWN, event => {
			if (event.target === overlay) {
				finish(undefined);
			}
		}));
		store.add(addDisposableListener(document, EventType.KEY_DOWN, event => {
			if (event.key === 'Escape') {
				event.preventDefault();
				finish(undefined);
			}
		}));

		mainWindow.requestAnimationFrame(() => {
			if (initialChoice === DesignerAddRepoChoice.OpenLocalFolder) {
				folder.focus({ preventScroll: true });
				return;
			}

			input.focus({ preventScroll: true });
		});
	});
}

class DesignerEmptyRepoFtuxContribution {

	static readonly ID = 'workbench.contrib.designerEmptyRepoFtux';

	private startupModalSnoozed = false;

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@ILogService private readonly logService: ILogService
	) {
		void this.maybeShowStartupModal();
	}

	private async maybeShowStartupModal(): Promise<void> {
		if (this.startupModalSnoozed) {
			return;
		}

		let repoState: DesignerRepoState | undefined;
		try {
			repoState = await this.commandService.executeCommand<DesignerRepoState>(GetDesignerReposStateCommandId);
		} catch (error) {
			this.logService.debug('[ParakitEmptyRepoFtux] Repo state is unavailable during startup.', error);
			return;
		}

		if (!shouldShowDesignerEmptyRepoFtux(repoState)) {
			return;
		}

		this.startupModalSnoozed = true;
		await this.commandService.executeCommand(ShowDesignerAddRepoCommandId);
	}
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ShowDesignerAddRepoCommandId,
			title: localize2('parakitAddRepoCommandTitle', "Add Repo"),
			f1: false
		});
	}

	override run(accessor: ServicesAccessor, options?: DesignerAddRepoOptions): Promise<boolean> {
		return showDesignerAddRepo(createDesignerAddRepoServices(accessor), options);
	}
});

registerWorkbenchContribution2(DesignerEmptyRepoFtuxContribution.ID, DesignerEmptyRepoFtuxContribution, WorkbenchPhase.AfterRestored);

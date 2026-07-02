/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './emptyRepoFtux.css';
import { $, addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
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
import { AddDesignerRepoSourceCommandId, CheckoutDesignerBranchCommandId, DesignerAddRepoChoice, GetDesignerBranchesStateCommandId, GetDesignerReposStateCommandId, shouldShowDesignerEmptyRepoFtux, shouldShowDesignerStartupRepoPicker, ShowDesignerAddRepoCommandId, SwitchDesignerRepoCommandId, type DesignerBranchCheckoutResult, type DesignerBranchItem, type DesignerBranchState, type DesignerBranchTreeNode, type DesignerRepoItem, type DesignerRepoState, type DesignerRepoSwitchResult } from '../../../services/workspaces/common/designerRepoCommands.js';

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

export interface IDesignerStartupRepoPickerServices {
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

export async function openDesignerStartupRepo(services: IDesignerStartupRepoPickerServices, repo: DesignerRepoItem): Promise<DesignerBranchState | undefined> {
	if (repo.status !== 'ready' || !repo.path) {
		throw new Error(localize('parakitStartupRepoNotReady', "Repo is not ready."));
	}

	const switchResult = await services.commands.execute(SwitchDesignerRepoCommandId, { repoPath: repo.path, skipSave: true }) as DesignerRepoSwitchResult | undefined;
	if (switchResult?.blocked) {
		throw new Error(switchResult.blocked.message);
	}

	const branchState = await services.commands.execute(GetDesignerBranchesStateCommandId, { updateRemotes: true }) as DesignerBranchState | undefined;
	return branchState;
}

export async function checkoutDesignerStartupBranch(services: IDesignerStartupRepoPickerServices, branch: DesignerBranchItem): Promise<boolean> {
	if (branch.isCurrent) {
		return true;
	}

	const checkoutResult = await services.commands.execute(CheckoutDesignerBranchCommandId, { branchName: branch.name, skipSave: true }) as DesignerBranchCheckoutResult | undefined;
	if (checkoutResult?.blocked) {
		throw new Error(checkoutResult.blocked.message);
	}

	return true;
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

function createDesignerStartupRepoPickerServices(commandService: ICommandService, notificationService: INotificationService): IDesignerStartupRepoPickerServices {
	return {
		commands: {
			execute: (commandId: string, argument: unknown) => commandService.executeCommand(commandId, argument)
		},
		notify: {
			error: error => notificationService.error(error instanceof Error ? error : String(error))
		}
	};
}

function showDesignerStartupRepoPicker(services: IDesignerStartupRepoPickerServices, repoState: DesignerRepoState): Promise<boolean> {
	return new Promise(resolve => {
		const store = new DisposableStore();
		const renderStore = store.add(new DisposableStore());
		const document = mainWindow.document;
		const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
		let selectedRepo: DesignerRepoItem | undefined;
		let branchState: DesignerBranchState | undefined;
		let busyRepoPath: string | undefined;
		let busyBranchName: string | undefined;
		let problemMessage: string | undefined;

		const overlay = $('.parakit-startup-repo-picker-overlay');
		const dialog = $('.parakit-startup-repo-picker');
		dialog.setAttribute('role', 'dialog');
		dialog.setAttribute('aria-modal', 'true');
		dialog.setAttribute('aria-labelledby', 'parakit-startup-repo-picker-title');
		overlay.append(dialog);
		document.body.append(overlay);

		const finish = (result: boolean) => {
			store.dispose();
			overlay.remove();
			previousFocus?.focus({ preventScroll: true });
			resolve(result);
		};

		const render = () => {
			renderStore.clear();
			dialog.replaceChildren();

			const close = document.createElement('button');
			close.className = 'parakit-startup-repo-picker__close';
			close.type = 'button';
			close.title = localize('parakitStartupRepoPickerSnooze', "Snooze until next session");
			close.setAttribute('aria-label', localize('parakitStartupRepoPickerSnoozeAria', "Snooze until next session"));
			close.append($('span.codicon.codicon-close'));
			renderStore.add(addDisposableListener(close, EventType.CLICK, () => finish(false)));

			const header = $('.parakit-startup-repo-picker__header');
			if (selectedRepo && branchState) {
				const back = document.createElement('button');
				back.className = 'parakit-startup-repo-picker__back';
				back.type = 'button';
				back.title = localize('parakitStartupRepoPickerBackTitle', "Back to repos");
				back.setAttribute('aria-label', localize('parakitStartupRepoPickerBackAria', "Back to repos"));
				back.append($('span.codicon.codicon-arrow-left'));
				renderStore.add(addDisposableListener(back, EventType.CLICK, () => {
					selectedRepo = undefined;
					branchState = undefined;
					busyBranchName = undefined;
					problemMessage = undefined;
					render();
				}));

				header.append(
					back,
					$('div.parakit-startup-repo-picker__header-text', undefined,
						$('h1#parakit-startup-repo-picker-title.parakit-startup-repo-picker__title', undefined, localize('parakitStartupBranchPickerTitle', "Choose a branch")),
						$('p.parakit-startup-repo-picker__detail', undefined, localize('parakitStartupBranchPickerDetail', "Branches for {0}", selectedRepo.name))
					)
				);
			} else {
				header.append(
					$('div.parakit-startup-repo-picker__header-text', undefined,
						$('h1#parakit-startup-repo-picker-title.parakit-startup-repo-picker__title', undefined, localize('parakitStartupRepoPickerTitle', "Open a repo")),
						$('p.parakit-startup-repo-picker__detail', undefined, localize('parakitStartupRepoPickerDetail', "Select a repo to choose a branch."))
					)
				);
			}

			dialog.append(close, header);

			if (problemMessage) {
				dialog.append($('.parakit-startup-repo-picker__problem', undefined,
					$('span.codicon.codicon-warning.parakit-startup-repo-picker__problem-icon'),
					$('span', undefined, problemMessage)
				));
			}

			if (selectedRepo && branchState) {
				dialog.append(renderBranchPicker(services, branchState, renderStore, {
					getBusyBranchName: () => busyBranchName,
					setBusyBranchName: branchName => {
						busyBranchName = branchName;
						render();
					},
					setProblem: message => {
						busyBranchName = undefined;
						problemMessage = message;
						render();
					},
					finish
				}));
			} else {
				dialog.append(renderRepoCards(services, repoState.repos, renderStore, {
					getBusyRepoPath: () => busyRepoPath,
					setBusyRepoPath: repoPath => {
						busyRepoPath = repoPath;
						render();
					},
					selectRepo: (repo, state) => {
						selectedRepo = repo;
						branchState = state;
						busyRepoPath = undefined;
						problemMessage = undefined;
						render();
					},
					setProblem: message => {
						busyRepoPath = undefined;
						problemMessage = message;
						render();
					},
					finish
				}));
			}
		};

		store.add(addDisposableListener(document, EventType.KEY_DOWN, event => {
			if (event.key === 'Escape') {
				event.preventDefault();
				finish(false);
			}
		}));

		render();
		mainWindow.requestAnimationFrame(() => {
			(dialog.querySelector('.parakit-startup-repo-picker__repo-card:not(:disabled), .parakit-startup-repo-picker__close') as HTMLElement | null)?.focus({ preventScroll: true });
		});
	});
}

function renderRepoCards(services: IDesignerStartupRepoPickerServices, repos: readonly DesignerRepoItem[], store: DisposableStore, callbacks: {
	readonly getBusyRepoPath: () => string | undefined;
	readonly setBusyRepoPath: (repoPath: string) => void;
	readonly selectRepo: (repo: DesignerRepoItem, branchState: DesignerBranchState) => void;
	readonly setProblem: (message: string) => void;
	readonly finish: (result: boolean) => void;
}): HTMLElement {
	const list = $('.parakit-startup-repo-picker__repo-grid');

	for (const repo of repos) {
		const card = document.createElement('button');
		card.className = `parakit-startup-repo-picker__repo-card parakit-startup-repo-picker__repo-card--${repo.status}`;
		card.type = 'button';
		card.disabled = repo.status !== 'ready' || !!callbacks.getBusyRepoPath();
		card.title = repo.message ?? repo.path;

		const busy = repo.path === callbacks.getBusyRepoPath();
		const iconClass = busy
			? 'codicon-loading codicon-modifier-spin'
			: repo.status === 'problem'
				? 'codicon-error'
				: repo.status === 'cloning'
					? 'codicon-loading codicon-modifier-spin'
					: 'codicon-repo';

		card.append(
			$('span.parakit-startup-repo-picker__repo-icon.codicon', undefined),
			$('span.parakit-startup-repo-picker__repo-name', undefined, repo.name),
			$('span.parakit-startup-repo-picker__repo-path', undefined, repo.path),
			$('span.parakit-startup-repo-picker__repo-badge', undefined, getRepoCardBadge(repo, busy))
		);
		card.querySelector('.parakit-startup-repo-picker__repo-icon')?.classList.add(...iconClass.split(' '));

		if (repo.status === 'ready') {
			store.add(addDisposableListener(card, EventType.CLICK, async () => {
				callbacks.setBusyRepoPath(repo.path);
				try {
					const state = await openDesignerStartupRepo(services, repo);
					if (!state) {
						callbacks.finish(true);
						return;
					}
					callbacks.selectRepo(repo, state);
				} catch (error) {
					callbacks.setProblem(getErrorMessage(error));
					services.notify.error(error);
				}
			}));
		}

		list.append(card);
	}

	return list;
}

function getRepoCardBadge(repo: DesignerRepoItem, busy: boolean): string {
	if (busy) {
		return localize('parakitStartupRepoPickerOpeningBadge', "opening");
	}

	if (repo.status === 'cloning') {
		return localize('parakitStartupRepoPickerCloningBadge', "cloning");
	}

	if (repo.status === 'problem') {
		return localize('parakitStartupRepoPickerProblemBadge', "problem");
	}

	return localize('parakitStartupRepoPickerReadyBadge', "ready");
}

function renderBranchPicker(services: IDesignerStartupRepoPickerServices, state: DesignerBranchState, store: DisposableStore, callbacks: {
	readonly getBusyBranchName: () => string | undefined;
	readonly setBusyBranchName: (branchName: string) => void;
	readonly setProblem: (message: string) => void;
	readonly finish: (result: boolean) => void;
}): HTMLElement {
	if (state.setup) {
		return $('.parakit-startup-repo-picker__empty', undefined,
			$('span.codicon.codicon-git-branch.parakit-startup-repo-picker__empty-icon'),
			$('span', undefined, localize('parakitStartupBranchPickerSetupRequired', "Branches appear after this folder is connected to a remote."))
		);
	}

	if (!state.tree.length) {
		return $('.parakit-startup-repo-picker__empty', undefined,
			$('span.codicon.codicon-git-branch.parakit-startup-repo-picker__empty-icon'),
			$('span', undefined, localize('parakitStartupBranchPickerEmpty', "No branches found."))
		);
	}

	const tree = $('.parakit-startup-repo-picker__branch-tree');
	tree.setAttribute('role', 'menu');
	for (const node of state.tree) {
		renderBranchTreeNode(tree, node, 0, services, store, callbacks);
	}

	return tree;
}

function renderBranchTreeNode(parent: HTMLElement, node: DesignerBranchTreeNode, depth: number, services: IDesignerStartupRepoPickerServices, store: DisposableStore, callbacks: {
	readonly getBusyBranchName: () => string | undefined;
	readonly setBusyBranchName: (branchName: string) => void;
	readonly setProblem: (message: string) => void;
	readonly finish: (result: boolean) => void;
}): void {
	if (node.branch) {
		parent.append(renderBranchRow(node.branch, depth, services, store, callbacks));
	} else {
		const folder = $('.parakit-startup-repo-picker__branch-folder');
		folder.style.paddingLeft = `${10 + depth * 14}px`;
		folder.append(
			$('span.codicon.codicon-folder.parakit-startup-repo-picker__branch-icon'),
			$('span', undefined, node.name)
		);
		parent.append(folder);
	}

	for (const child of node.children) {
		renderBranchTreeNode(parent, child, depth + 1, services, store, callbacks);
	}
}

function renderBranchRow(branch: DesignerBranchItem, depth: number, services: IDesignerStartupRepoPickerServices, store: DisposableStore, callbacks: {
	readonly getBusyBranchName: () => string | undefined;
	readonly setBusyBranchName: (branchName: string) => void;
	readonly setProblem: (message: string) => void;
	readonly finish: (result: boolean) => void;
}): HTMLElement {
	const row = document.createElement('button');
	row.className = `parakit-startup-repo-picker__branch-row parakit-startup-repo-picker__branch-row--${branch.status}`;
	row.type = 'button';
	row.style.paddingLeft = `${10 + depth * 14}px`;
	row.setAttribute('role', 'menuitemradio');
	row.setAttribute('aria-checked', String(branch.isCurrent));
	row.disabled = !!callbacks.getBusyBranchName();
	row.title = branch.cloudProblem?.message ?? branch.name;

	const busy = branch.name === callbacks.getBusyBranchName();
	const displayName = branch.path[branch.path.length - 1] ?? branch.name;
	row.append(
		$(busy ? 'span.codicon.codicon-loading.codicon-modifier-spin.parakit-startup-repo-picker__branch-icon' : 'span.codicon.codicon-git-branch.parakit-startup-repo-picker__branch-icon'),
		$('span.parakit-startup-repo-picker__branch-label', undefined, displayName),
		$('span.parakit-startup-repo-picker__branch-badge', undefined, getBranchBadge(branch, busy))
	);

	if (branch.isCurrent) {
		row.classList.add('parakit-startup-repo-picker__branch-row--current');
		row.append($('span.codicon.codicon-check.parakit-startup-repo-picker__branch-check'));
	}

	store.add(addDisposableListener(row, EventType.CLICK, async () => {
		callbacks.setBusyBranchName(branch.name);
		try {
			await checkoutDesignerStartupBranch(services, branch);
			callbacks.finish(true);
		} catch (error) {
			callbacks.setProblem(getErrorMessage(error));
			services.notify.error(error);
		}
	}));

	return row;
}

function getBranchBadge(branch: DesignerBranchItem, busy: boolean): string {
	if (busy) {
		return localize('parakitStartupBranchPickerSwitchingBadge', "switching");
	}

	if (branch.cloudProblem) {
		return localize('parakitStartupBranchPickerCloudProblemBadge', "problem");
	}

	if (branch.isCurrent) {
		return localize('parakitStartupBranchPickerCurrentBadge', "current");
	}

	if (branch.isDefault) {
		return localize('parakitStartupBranchPickerDefaultBadge', "default");
	}

	if (branch.status === 'remoteOnly') {
		return localize('parakitStartupBranchPickerRemoteBadge', "cloud");
	}

	if (branch.status === 'localOnly') {
		return localize('parakitStartupBranchPickerLocalBadge', "local");
	}

	if (branch.status === 'problem') {
		return localize('parakitStartupBranchPickerProblemBadge', "problem");
	}

	return '';
}

class DesignerEmptyRepoFtuxContribution {

	static readonly ID = 'workbench.contrib.designerEmptyRepoFtux';

	private startupModalSnoozed = false;

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService
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
			if (!shouldShowDesignerStartupRepoPicker(repoState)) {
				return;
			}

			this.startupModalSnoozed = true;
			await showDesignerStartupRepoPicker(createDesignerStartupRepoPickerServices(this.commandService, this.notificationService), repoState);
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
import { timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { FileAccess } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ICommandEvent, ICommandService } from '../../../../platform/commands/common/commands.js';
import { ConfirmResult, IFileDialogService, IOpenDialogOptions, IPickAndOpenOptions, ISaveDialogOptions, IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../platform/dialogs/test/common/testDialogService.js';
import { IWorkspaceTrustRequestService, WorkspaceTrustUriResponse } from '../../../../platform/workspace/common/workspaceTrust.js';
import { DesignerBranchSwitcher } from '../../../browser/parts/designerBranchSwitcher/designerBranchSwitcher.js';
import { createWorkbenchAppPreviewStartupDataUrl, getWorkbenchAppPreviewStartupTitle } from '../../../contrib/browserView/common/appPreviewStartupPage.js';
import '../../../contrib/welcomeEmptyRepo/browser/emptyRepoFtux.css';
import { AddDesignerRepoSourceCommandId, GetDesignerReposStateCommandId } from '../../../services/workspaces/common/designerRepoCommands.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';

export default defineThemedFixtureGroup({ path: 'parakit/' }, {
	EmptyRepoFTUX: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderEmptyRepoFtux,
	}),
});

async function renderEmptyRepoFtux({ container, disposableStore }: ComponentFixtureContext): Promise<void> {
	container.style.width = '980px';
	container.style.minHeight = '620px';
	container.style.padding = '18px';
	container.style.boxSizing = 'border-box';
	container.style.display = 'grid';
	container.style.gridTemplateColumns = '430px minmax(0, 1fr)';
	container.style.gap = '18px';
	container.style.alignItems = 'start';
	container.style.background = 'var(--vscode-editor-background)';
	container.style.color = 'var(--vscode-foreground)';
	container.style.fontFamily = 'var(--vscode-font-family)';
	container.style.fontSize = 'var(--vscode-font-size)';

	const modalHost = $('.parakit-empty-repo-ftux__modal-host');
	const commandService = new EmptyRepoFixtureCommandService(modalHost);
	commandService.showWelcomeModal();

	const left = $('.parakit-empty-repo-ftux__column');
	left.style.display = 'grid';
	left.style.gap = '14px';
	left.append(modalHost);

	const repoSwitcherHost = $('.parakit-empty-repo-ftux__switcher');
	repoSwitcherHost.style.width = '340px';
	repoSwitcherHost.style.height = '34px';
	repoSwitcherHost.style.border = '1px solid var(--vscode-widget-border)';
	repoSwitcherHost.style.background = 'var(--vscode-sideBar-background)';
	left.append(repoSwitcherHost);

	const right = $('.parakit-empty-repo-ftux__column');
	right.style.display = 'grid';
	right.style.gap = '14px';

	const branchSwitcherHost = $('.parakit-empty-repo-ftux__switcher');
	branchSwitcherHost.style.width = '340px';
	branchSwitcherHost.style.height = '34px';
	branchSwitcherHost.style.border = '1px solid var(--vscode-widget-border)';
	branchSwitcherHost.style.background = 'var(--vscode-sideBar-background)';
	right.append(branchSwitcherHost);

	const previewFrame = document.createElement('iframe');
	previewFrame.title = 'Parakit empty repo preview';
	previewFrame.src = createWorkbenchAppPreviewStartupDataUrl({
		phase: 'emptyRepo',
		title: getWorkbenchAppPreviewStartupTitle('emptyRepo', undefined),
		message: 'Parakit needs a repo before it can show an app preview.',
		actions: ['pasteRepoUrl', 'openLocalFolder']
	});
	previewFrame.style.width = '100%';
	previewFrame.style.height = '380px';
	previewFrame.style.border = '1px solid var(--vscode-widget-border)';
	previewFrame.style.background = 'var(--vscode-editor-background)';
	right.append(previewFrame);

	container.append(left, right);

	const dialogService: IDialogService = new TestDialogService();
	const trustService = new StaticWorkspaceTrustRequestService();
	const fileDialogService = new EmptyRepoFixtureFileDialogService();
	disposableStore.add(new DesignerBranchSwitcher(repoSwitcherHost, commandService, dialogService, trustService, fileDialogService));
	disposableStore.add(new DesignerBranchSwitcher(branchSwitcherHost, commandService, dialogService, trustService, fileDialogService));

	await timeout(0);

	(repoSwitcherHost.querySelector('.designer-branch-switcher__repo-button') as HTMLButtonElement | undefined)?.click();
	(branchSwitcherHost.querySelector('.designer-branch-switcher__branch-button') as HTMLButtonElement | undefined)?.click();
}

class EmptyRepoFixtureCommandService implements ICommandService {
	declare readonly _serviceBrand: undefined;

	private readonly _onWillExecuteCommand = new Emitter<ICommandEvent>();
	readonly onWillExecuteCommand: Event<ICommandEvent> = this._onWillExecuteCommand.event;

	private readonly _onDidExecuteCommand = new Emitter<ICommandEvent>();
	readonly onDidExecuteCommand: Event<ICommandEvent> = this._onDidExecuteCommand.event;

	constructor(private readonly modalHost: HTMLElement) { }

	async executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
		if (commandId === GetDesignerReposStateCommandId) {
			return {
				currentRepoPath: undefined,
				repos: []
			} as T;
		}

		if (commandId === '_designerBranches.getState') {
			return {
				projectName: 'Parakit',
				defaultBranch: undefined,
				currentBranch: undefined,
				syncState: 'synced',
				repositoryReady: false,
				branches: [],
				tree: []
			} as T;
		}

		if (commandId === AddDesignerRepoSourceCommandId) {
			this.showWelcomeModal();
			return {
				currentRepoPath: undefined,
				repos: []
			} as T;
		}

		throw new Error(`Unexpected command: ${commandId}`);
	}

	showWelcomeModal(): void {
		const dialog = $('.parakit-empty-repo-dialog');
		const close = document.createElement('button');
		close.className = 'parakit-empty-repo-dialog__close';
		close.type = 'button';
		close.title = 'Snooze until next session';
		close.append($('span.codicon.codicon-close'));

		const logoWrap = $('.parakit-empty-repo-dialog__logo-wrap');
		const logo = document.createElement('img');
		logo.className = 'parakit-empty-repo-dialog__logo';
		logo.alt = 'Parakit';
		logo.src = FileAccess.asBrowserUri('vs/workbench/browser/media/code-icon.svg').toString(true);
		logoWrap.append(logo);

		const title = $('h1.parakit-empty-repo-dialog__title', undefined, 'Welcome to Parakit');
		const detail = $('.parakit-empty-repo-dialog__detail', undefined, 'Parakit makes codebases accessible to PMs and designers. Add a repo to start exploring branches, previews, and product work in one place.');

		const form = document.createElement('form');
		form.className = 'parakit-empty-repo-dialog__form';
		const input = document.createElement('input');
		input.className = 'parakit-empty-repo-dialog__input';
		input.type = 'text';
		input.placeholder = 'Paste repo URL';
		const submit = document.createElement('button');
		submit.className = 'parakit-empty-repo-dialog__submit';
		submit.type = 'submit';
		submit.disabled = true;
		submit.textContent = 'Add repo';
		const folder = document.createElement('button');
		folder.className = 'parakit-empty-repo-dialog__folder';
		folder.type = 'button';
		folder.append($('span.codicon.codicon-folder-opened'), $('span', undefined, 'Open local folder'));
		const urlRow = $('.parakit-empty-repo-dialog__url-row');
		urlRow.append(input, submit);
		form.append(urlRow, folder);

		const snooze = document.createElement('button');
		snooze.className = 'parakit-empty-repo-dialog__snooze';
		snooze.type = 'button';
		snooze.textContent = 'Snooze until next session';

		dialog.append(close, logoWrap, title, detail, form, snooze);
		this.modalHost.replaceChildren(dialog);
	}
}

class StaticWorkspaceTrustRequestService implements IWorkspaceTrustRequestService {
	declare readonly _serviceBrand: undefined;

	readonly onDidInitiateOpenFilesTrustRequest = Event.None;
	readonly onDidInitiateResourcesTrustRequest = Event.None;
	readonly onDidInitiateWorkspaceTrustRequest = Event.None;
	readonly onDidInitiateWorkspaceTrustRequestOnStartup = Event.None;

	async requestOpenFilesTrust(): Promise<WorkspaceTrustUriResponse> { return WorkspaceTrustUriResponse.Open; }
	async completeOpenFilesTrustRequest(): Promise<void> { }
	async completeResourcesTrustRequest(): Promise<void> { }
	async requestResourcesTrust(): Promise<boolean> { return true; }
	cancelWorkspaceTrustRequest(): void { }
	async completeWorkspaceTrustRequest(): Promise<void> { }
	async requestWorkspaceTrust(): Promise<boolean> { return true; }
	requestWorkspaceTrustOnStartup(): void { }
}

class EmptyRepoFixtureFileDialogService implements IFileDialogService {
	declare readonly _serviceBrand: undefined;

	async defaultFilePath(): Promise<URI> { return URI.file('/'); }
	async defaultFolderPath(): Promise<URI> { return URI.file('/'); }
	async defaultWorkspacePath(): Promise<URI> { return URI.file('/'); }
	async preferredHome(): Promise<URI> { return URI.file('/'); }
	async pickFileFolderAndOpen(_options: IPickAndOpenOptions): Promise<void> { }
	async pickFileAndOpen(_options: IPickAndOpenOptions): Promise<void> { }
	async pickFolderAndOpen(_options: IPickAndOpenOptions): Promise<void> { }
	async pickWorkspaceAndOpen(_options: IPickAndOpenOptions): Promise<void> { }
	async pickFileToSave(): Promise<URI | undefined> { return undefined; }
	async showSaveDialog(_options: ISaveDialogOptions): Promise<URI | undefined> { return undefined; }
	async showOpenDialog(_options: IOpenDialogOptions): Promise<URI[] | undefined> { return [URI.file('/Users/example/product-app')]; }
	async showSaveConfirm(): Promise<ConfirmResult> { return ConfirmResult.CANCEL; }
}

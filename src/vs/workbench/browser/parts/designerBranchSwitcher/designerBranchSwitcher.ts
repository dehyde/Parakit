/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './designerBranchSwitcher.css';
import { $, addDisposableListener, EventType, getWindow } from '../../../../base/browser/dom.js';
import { Emitter } from '../../../../base/common/event.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IDialogService, IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { localize } from '../../../../nls.js';

const onDidChangeDesignerBranchStateEmitter = new Emitter<DesignerBranchState>();

CommandsRegistry.registerCommand('_designerBranches.didChangeState', (_accessor, state: DesignerBranchState) => {
	onDidChangeDesignerBranchStateEmitter.fire(state);
});

type DesignerBranchStatus = 'synced' | 'remoteOnly' | 'localOnly' | 'problem';

interface DesignerBranchItem {
	readonly name: string;
	readonly path: readonly string[];
	readonly status: DesignerBranchStatus;
	readonly isCurrent: boolean;
	readonly isDefault: boolean;
	readonly cloudProblem?: DesignerCloudProblem;
}

interface DesignerCloudProblem {
	readonly message: string;
}

interface DesignerBranchTreeNode {
	readonly name: string;
	readonly path: readonly string[];
	readonly branch?: DesignerBranchItem;
	readonly children: readonly DesignerBranchTreeNode[];
}

interface DesignerBranchState {
	readonly projectName: string;
	readonly defaultBranch: string | undefined;
	readonly currentBranch: string | undefined;
	readonly cloudProblem?: DesignerCloudProblem;
	readonly syncState: 'synced' | 'syncing' | 'problem';
	readonly repositoryReady?: boolean;
	readonly setup?: DesignerBranchSetup;
	readonly branches: readonly DesignerBranchItem[];
	readonly tree: readonly DesignerBranchTreeNode[];
}

interface DesignerBranchSetup {
	readonly reason: 'notGitRepository';
}

type DesignerSyncState = 'idle' | 'saving' | 'pushing' | 'synced' | 'blocked' | 'problem';

interface DesignerSyncStatus {
	readonly state: DesignerSyncState;
	readonly message?: string;
	readonly previousBranch?: string;
	readonly targetBranch?: string;
	readonly targetRepoPath?: string;
	readonly agentPrompt?: string;
}

interface DesignerBranchCheckoutResult {
	readonly state: DesignerBranchState;
	readonly sync?: DesignerSyncStatus;
	readonly blocked?: {
		readonly reason: 'dirtyWorkTree' | 'worktreeBranchAlreadyUsed' | 'branchNameRequired' | 'mergeConflicts' | 'noRemote' | 'pushRejected' | 'authRequired' | 'saveFailed' | 'switchFailed' | 'unsafeHostRepository';
		readonly message: string;
	};
}

type DesignerRepoStatus = 'ready' | 'cloning' | 'problem';

interface DesignerRepoItem {
	readonly name: string;
	readonly path: string;
	readonly status: DesignerRepoStatus;
	readonly isCurrent: boolean;
	readonly url?: string;
	readonly message?: string;
}

interface DesignerRepoState {
	readonly currentRepoPath: string | undefined;
	readonly repos: readonly DesignerRepoItem[];
}

interface DesignerRepoSwitchResult {
	readonly state: DesignerRepoState;
	readonly sync?: DesignerSyncStatus;
	readonly blocked?: {
		readonly reason: 'branchNameRequired' | 'mergeConflicts' | 'noRemote' | 'pushRejected' | 'authRequired' | 'saveFailed' | 'switchFailed' | 'unsafeHostRepository';
		readonly message: string;
	};
}

interface DesignerRepoRemoveResult {
	readonly state: DesignerRepoState;
}

export class DesignerBranchSwitcher extends Disposable {

	private static readonly startupRefreshRetryDelayMs = 250;
	private static readonly maxStartupRefreshAttempts = 40;

	private readonly renderDisposables = this._register(new DisposableStore());
	private readonly windowDisposables = this._register(new DisposableStore());
	private readonly treeDisposables = this._register(new DisposableStore());
	private readonly container: HTMLElement;
	private readonly controls: HTMLElement;
	private readonly repoButton: HTMLButtonElement;
	private readonly branchButton: HTMLButtonElement;
	private readonly status: HTMLElement;
	private readonly dropdown: HTMLElement;

	private state: DesignerBranchState | undefined;
	private repoState: DesignerRepoState | undefined;
	private filterInput: HTMLInputElement | undefined;
	private repoSourceInput: HTMLInputElement | undefined;
	private treeElement: HTMLElement | undefined;
	private problemMessage: string | undefined;
	private repoProblemMessage: string | undefined;
	private blockedCheckoutBranchName: string | undefined;
	private blockedRepoPath: string | undefined;
	private recoveryAgentPrompt: string | undefined;
	private dropdownMode: 'branch' | 'repo' | undefined;
	private refreshingBranches = false;
	private refreshingRepos = false;
	private switchingBranchName: string | undefined;
	private switchingRepoPath: string | undefined;
	private activeSyncState: DesignerSyncState | undefined;
	private removingRepoPath: string | undefined;
	private addingRepoSource: string | undefined;
	private repoSourceDraft = '';
	private pickingRepoFolder = false;
	private projectAccessLimited = false;
	private treeRenderDeferred = false;
	private refreshPromise: Promise<void> | undefined;
	private pendingRefreshOptions: { updateRemotes?: boolean; retryDuringStartup?: boolean } | undefined;
	private repoRefreshPromise: Promise<void> | undefined;
	private startupRefreshAttempts = 0;
	private startupRefreshRetryHandle: number | undefined;
	private useDesignPrefix = true;
	private branchFilter = '';
	private disposed = false;

	constructor(
		parent: HTMLElement,
		@ICommandService private readonly commandService: ICommandService,
		@IDialogService private readonly dialogService: IDialogService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService
	) {
		super();

		this.container = $('.designer-branch-switcher');
		this.controls = $('.designer-branch-switcher__controls');
		this.repoButton = document.createElement('button');
		this.repoButton.className = 'designer-branch-switcher__button designer-branch-switcher__repo-button';
		this.repoButton.type = 'button';
		this.repoButton.setAttribute('aria-haspopup', 'menu');

		this.branchButton = document.createElement('button');
		this.branchButton.className = 'designer-branch-switcher__button designer-branch-switcher__branch-button';
		this.branchButton.type = 'button';
		this.branchButton.setAttribute('aria-haspopup', 'menu');

		this.status = $('.designer-branch-switcher__status');
		this.status.hidden = true;
		this.status.setAttribute('role', 'status');

		this.dropdown = $('.designer-branch-switcher__dropdown');
		this.dropdown.hidden = true;

		this.controls.append(this.repoButton, $('span.designer-branch-switcher__separator', undefined, ':'), this.branchButton);
		this.container.append(this.controls, this.status, this.dropdown);
		parent.appendChild(this.container);

		this._register(addDisposableListener(this.repoButton, EventType.CLICK, () => this.toggleRepoDropdown()));
		this._register(addDisposableListener(this.branchButton, EventType.CLICK, () => this.toggleBranchDropdown()));
		this._register(toDisposable(() => this.clearStartupRefreshRetry()));
		this._register(onDidChangeDesignerBranchStateEmitter.event(state => this.updateBranchState(state)));

		this.render();
		this.refresh({ retryDuringStartup: true });
		this.refreshRepos();
	}

	override dispose(): void {
		this.disposed = true;
		this.dropdown.remove();
		super.dispose();
	}

	private async toggleBranchDropdown(): Promise<void> {
		this.dropdownMode = this.dropdownMode === 'branch' ? undefined : 'branch';

		if (this.dropdownMode === 'branch') {
			this.branchFilter = '';
			this.deferTreeRender();
			this.installWindowListeners();
			this.refresh({ updateRemotes: true });
		} else {
			this.windowDisposables.clear();
		}

		this.render();
		this.focusFilterInput();
	}

	private async toggleRepoDropdown(): Promise<void> {
		this.dropdownMode = this.dropdownMode === 'repo' ? undefined : 'repo';

		if (this.dropdownMode === 'repo') {
			this.installWindowListeners();
			this.refreshRepos();
		} else {
			this.windowDisposables.clear();
		}

		this.render();
		this.focusRepoSourceInput();
	}

	private deferTreeRender(): void {
		this.treeRenderDeferred = true;

		const targetWindow = getWindow(this.container);
		targetWindow.requestAnimationFrame(() => {
			if (this.dropdownMode !== 'branch') {
				this.treeRenderDeferred = false;
				return;
			}

			this.treeRenderDeferred = false;
			this.render();
			this.focusFilterInput();
		});
	}

	private focusFilterInput(): void {
		if (this.dropdownMode !== 'branch') {
			return;
		}

		getWindow(this.container).requestAnimationFrame(() => {
			this.filterInput?.focus({ preventScroll: true });
			this.filterInput?.setSelectionRange(this.filterInput.value.length, this.filterInput.value.length);
		});
	}

	private focusRepoSourceInput(): void {
		if (this.dropdownMode !== 'repo') {
			return;
		}

		getWindow(this.container).requestAnimationFrame(() => {
			this.repoSourceInput?.focus({ preventScroll: true });
			this.repoSourceInput?.setSelectionRange(this.repoSourceInput.value.length, this.repoSourceInput.value.length);
		});
	}

	private installWindowListeners(): void {
		this.windowDisposables.clear();

		const targetWindow = getWindow(this.container);
		this.windowDisposables.add(addDisposableListener(targetWindow.document, EventType.MOUSE_DOWN, event => {
			const target = event.target as Node;
			if (!this.container.contains(target) && !this.dropdown.contains(target)) {
				this.closeDropdown();
			}
		}, true));

		this.windowDisposables.add(addDisposableListener(targetWindow.document, EventType.KEY_DOWN, event => {
			if (event.key === 'Escape') {
				this.closeDropdown();
			}
		}));

		this.windowDisposables.add(addDisposableListener(targetWindow, EventType.BLUR, () => {
			if (!this.pickingRepoFolder) {
				this.closeDropdown();
			}
		}));
	}

	private closeDropdown(): void {
		this.dropdownMode = undefined;
		this.windowDisposables.clear();
		this.render();
	}

	private refresh(options: { updateRemotes?: boolean; retryDuringStartup?: boolean } = {}): void {
		if (this.refreshPromise) {
			this.pendingRefreshOptions = this.mergeRefreshOptions(this.pendingRefreshOptions, options);
			return;
		}

		this.clearStartupRefreshRetry();
		this.refreshingBranches = true;
		this.problemMessage = undefined;
		this.blockedCheckoutBranchName = undefined;
		this.render();

		this.refreshPromise = this.doRefresh(options)
			.catch(error => {
				this.problemMessage = this.getRefreshProblemMessage(error);
				this.scheduleStartupRefreshRetry(options);
			})
			.finally(() => {
				this.refreshPromise = undefined;
				this.refreshingBranches = false;
				this.render();
				this.focusFilterInput();
				const pendingOptions = this.pendingRefreshOptions;
				this.pendingRefreshOptions = undefined;
				if (pendingOptions) {
					this.refresh(pendingOptions);
				}
			});
	}

	private mergeRefreshOptions(first: { updateRemotes?: boolean; retryDuringStartup?: boolean } | undefined, second: { updateRemotes?: boolean; retryDuringStartup?: boolean }): { updateRemotes?: boolean; retryDuringStartup?: boolean } {
		return {
			updateRemotes: first?.updateRemotes === true || second.updateRemotes === true,
			retryDuringStartup: first?.retryDuringStartup === true || second.retryDuringStartup === true
		};
	}

	private refreshRepos(): void {
		if (this.repoRefreshPromise) {
			return;
		}

		this.refreshingRepos = true;
		this.repoProblemMessage = undefined;
		this.render();

		this.repoRefreshPromise = this.doRefreshRepos()
			.catch(error => {
				this.repoProblemMessage = this.getRefreshProblemMessage(error);
			})
			.finally(() => {
				this.repoRefreshPromise = undefined;
				this.refreshingRepos = false;
				this.render();
				this.focusRepoSourceInput();
			});
	}

	private async doRefreshRepos(): Promise<void> {
		this.repoState = await this.commandService.executeCommand<DesignerRepoState>('_designerRepos.getState');
		this.projectAccessLimited = false;
	}

	private async doRefresh(options: { updateRemotes?: boolean; retryDuringStartup?: boolean }): Promise<void> {
		this.state = await this.commandService.executeCommand<DesignerBranchState>('_designerBranches.getState', { updateRemotes: options.updateRemotes === true });
		this.projectAccessLimited = false;
		if (this.state?.repositoryReady === false && !this.state.setup) {
			this.scheduleStartupRefreshRetry(options);
			return;
		}

		this.startupRefreshAttempts = 0;
	}

	private updateBranchState(state: DesignerBranchState): void {
		this.state = state;
		this.projectAccessLimited = false;
		this.problemMessage = undefined;
		this.startupRefreshAttempts = 0;
		this.clearStartupRefreshRetry();
		this.render();
	}

	private scheduleStartupRefreshRetry(options: { updateRemotes?: boolean; retryDuringStartup?: boolean }): void {
		if (!options.retryDuringStartup || this.dropdownMode) {
			return;
		}

		if (this.startupRefreshAttempts >= DesignerBranchSwitcher.maxStartupRefreshAttempts) {
			return;
		}

		this.startupRefreshAttempts++;
		this.startupRefreshRetryHandle = getWindow(this.container).setTimeout(() => {
			this.startupRefreshRetryHandle = undefined;
			this.refresh(options);
		}, DesignerBranchSwitcher.startupRefreshRetryDelayMs);
	}

	private clearStartupRefreshRetry(): void {
		if (this.startupRefreshRetryHandle === undefined) {
			return;
		}

		getWindow(this.container).clearTimeout(this.startupRefreshRetryHandle);
		this.startupRefreshRetryHandle = undefined;
	}

	private render(): void {
		if (this.disposed) {
			return;
		}

		this.renderDisposables.clear();
		this.treeDisposables.clear();
		this.filterInput = undefined;
		this.repoSourceInput = undefined;
		this.treeElement = undefined;
		this.repoButton.replaceChildren();
		this.branchButton.replaceChildren();
		this.status.replaceChildren();
		this.dropdown.replaceChildren();
		this.dropdown.hidden = !this.dropdownMode;
		this.updateDropdownHost();
		this.repoButton.setAttribute('aria-expanded', String(this.dropdownMode === 'repo'));
		this.branchButton.setAttribute('aria-expanded', String(this.dropdownMode === 'branch'));

		const projectName = this.getRepoButtonLabel();
		const branchName = this.getBranchButtonLabel();

		this.repoButton.append($('span.designer-branch-switcher__project', undefined, projectName));
		this.branchButton.append(
			this.renderBranchIndicatorIcon(),
			$('span.designer-branch-switcher__branch', undefined, branchName)
		);
		this.renderSelectorStatus();

		if (!this.dropdownMode) {
			return;
		}

		this.layoutDropdown();

		if (this.dropdownMode === 'repo') {
			this.renderRepoDropdown();
			return;
		}

		if (this.problemMessage) {
			this.dropdown.append(this.renderProblem(this.problemMessage));
		}

		if (this.refreshingBranches && !this.state) {
			this.dropdown.append(
				this.renderFilter(),
				$('.designer-branch-switcher__empty', undefined, localize('designerBranchSwitcherLoading', "Loading branches...")),
				this.renderNewBranch()
			);
			return;
		}

		if (this.state?.setup) {
			this.dropdown.append(this.renderBranchSetup(this.state.setup));
			return;
		}

		this.dropdown.append(this.renderFilter(), this.renderTree(), this.renderNewBranch());
	}

	private renderSelectorStatus(): void {
		const message = this.problemMessage ?? this.repoProblemMessage;
		const shouldShowStatus = !!message && (!this.dropdownMode || !!this.blockedCheckoutBranchName || !!this.blockedRepoPath);
		if (!shouldShowStatus) {
			this.status.hidden = true;
			return;
		}

		this.status.hidden = false;
		this.layoutStatus();
		this.status.append(this.renderProblem(message));
	}

	private layoutStatus(): void {
		const targetWindow = getWindow(this.container);
		const viewportWidth = Math.max(targetWindow.innerWidth, 0);
		const viewportPadding = 12;
		const containerRect = this.controls.getBoundingClientRect();
		const width = Math.min(Math.max(containerRect.width, 320), Math.max(320, viewportWidth - viewportPadding * 2));
		const left = Math.min(Math.max(containerRect.left, viewportPadding), Math.max(viewportPadding, viewportWidth - width - viewportPadding));

		this.status.style.left = `${left}px`;
		this.status.style.top = `${containerRect.bottom + 4}px`;
		this.status.style.width = `${width}px`;
	}

	private updateDropdownHost(): void {
		const targetDocument = getWindow(this.container).document;
		const targetParent = this.dropdownMode ? targetDocument.body : this.container;

		if (this.dropdown.parentElement !== targetParent) {
			targetParent.appendChild(this.dropdown);
		}

	}

	private layoutDropdown(): void {
		const targetWindow = getWindow(this.container);
		const viewportWidth = Math.max(targetWindow.innerWidth, 0);
		const button = this.dropdownMode === 'repo' ? this.repoButton : this.branchButton;
		const buttonRect = button.getBoundingClientRect();
		const minimumWidth = 320;
		const viewportPadding = 12;
		const availableWidth = Math.max(minimumWidth, viewportWidth - viewportPadding * 2);
		const width = Math.min(Math.max(buttonRect.width, minimumWidth), availableWidth);
		const left = Math.min(Math.max(buttonRect.left, viewportPadding), Math.max(viewportPadding, viewportWidth - width - viewportPadding));
		const top = buttonRect.bottom + 4;

		this.dropdown.style.position = 'fixed';
		this.dropdown.style.left = `${left}px`;
		this.dropdown.style.right = 'auto';
		this.dropdown.style.top = `${top}px`;
		this.dropdown.style.width = `${width}px`;
	}

	private renderRepoDropdown(): void {
		if (this.repoProblemMessage) {
			this.dropdown.append(this.renderProblem(this.repoProblemMessage));
		}

		this.dropdown.append(this.renderRepoList(), this.renderAddRepo());
	}

	private renderBranchIndicatorIcon(): HTMLElement {
		const cloudProblem = this.state?.cloudProblem;
		const syncState = this.problemMessage || this.repoProblemMessage || cloudProblem ? 'problem' : this.activeSyncState === 'saving' || this.activeSyncState === 'pushing' ? 'syncing' : this.isBusy() ? 'syncing' : this.state?.syncState ?? 'syncing';
		const icon = document.createElement('span');
		icon.classList.add('codicon', 'designer-branch-switcher__sync', `designer-branch-switcher__sync--${syncState}`);

		if (syncState === 'syncing') {
			icon.classList.add('codicon-sync', 'codicon-modifier-spin');
		} else if (cloudProblem) {
			icon.classList.add('codicon-cloud');
		} else if (syncState === 'problem') {
			icon.classList.add('codicon-error');
		} else {
			icon.classList.add('codicon-cloud');
		}

		const title = syncState === 'syncing'
			? this.switchingBranchName
				? localize('designerBranchSwitcherSwitching', "Switching branches")
				: localize('designerBranchSwitcherSyncing', "Syncing")
			: cloudProblem
				? cloudProblem.message
			: syncState === 'problem'
				? localize('designerBranchSwitcherProblem', "Sync problem")
				: localize('designerBranchSwitcherSynced', "Synced");

		icon.title = title;
		return icon;
	}

	private getBranchButtonLabel(): string {
		if (this.activeSyncState === 'pushing') {
			return localize('designerBranchSwitcherPushingLabel', "Saving to cloud...");
		}

		if (this.switchingBranchName) {
			return localize('designerBranchSwitcherSwitchingToBranchLabel', "Switching to {0}...", this.switchingBranchName);
		}

		if (this.blockedCheckoutBranchName && this.problemMessage) {
			return localize('designerBranchSwitcherCouldNotSwitchToBranchLabel', "Couldn’t switch to {0}", this.blockedCheckoutBranchName);
		}

		if (this.activeSyncState === 'saving') {
			return localize('designerBranchSwitcherSavingLabel', "Saving...");
		}

		if (this.state?.setup?.reason === 'notGitRepository') {
			return localize('designerBranchSwitcherConnectRepoLabel', "Connect repo");
		}

		if (this.isLoadingBranchInformation()) {
			return localize('designerBranchSwitcherLoadingBranchInformation', "Loading branch information...");
		}

		return this.state?.currentBranch ?? this.state?.defaultBranch ?? localize('designerBranchSwitcherNoBranch', "No branch");
	}

	private getRepoButtonLabel(): string {
		if (this.switchingRepoPath) {
			return localize('designerRepoSwitcherSwitchingToRepoLabel', "Switching to {0}...", this.getRepoNameForPath(this.switchingRepoPath));
		}

		if (this.blockedRepoPath && this.repoProblemMessage) {
			return localize('designerRepoSwitcherCouldNotOpenRepoLabel', "Couldn’t open {0}", this.getRepoNameForPath(this.blockedRepoPath));
		}

		return this.repoState?.repos.find(repo => repo.isCurrent)?.name ?? this.state?.projectName ?? localize('designerBranchSwitcherProjectFallback', "Project");
	}

	private getRepoNameForPath(repoPath: string): string {
		return this.repoState?.repos.find(repo => repo.path === repoPath)?.name ?? this.getRepoNameFromPath(repoPath);
	}

	private getRepoNameFromPath(repoPath: string): string {
		const normalized = repoPath.trim().replace(/[/\\]+$/, '');
		const lastSegment = normalized.split(/[/\\]/).filter(Boolean).pop();
		return lastSegment || localize('designerRepoSwitcherUnknownRepo', "New repo");
	}

	private isLoadingBranchInformation(): boolean {
		return this.refreshingBranches || (this.state?.repositoryReady === false && !this.state.setup) || (!this.state?.currentBranch && !this.state?.defaultBranch && this.state?.syncState === 'syncing');
	}

	private renderProblem(message: string): HTMLElement {
		const problem = $('.designer-branch-switcher__problem');
		problem.append(
			$('span.codicon.codicon-warning.designer-branch-switcher__problem-icon'),
			$('span.designer-branch-switcher__problem-message', undefined, message)
		);

		if (this.projectAccessLimited) {
			const actions = $('.designer-branch-switcher__problem-actions');
			const allow = document.createElement('button');
			allow.className = 'designer-branch-switcher__problem-action designer-branch-switcher__problem-action--trust';
			allow.type = 'button';
			allow.textContent = localize('designerBranchSwitcherAllowProject', "Allow this project");

			this.renderDisposables.add(addDisposableListener(allow, EventType.CLICK, () => this.allowProjectAccess()));
			actions.append(allow);
			problem.append(actions);
		} else if (this.blockedCheckoutBranchName || this.blockedRepoPath) {
			const actions = $('.designer-branch-switcher__problem-actions');
			actions.classList.add('designer-branch-switcher__problem-actions--recovery');
			const retry = document.createElement('button');
			retry.className = 'designer-branch-switcher__problem-action designer-branch-switcher__problem-action--retry';
			retry.type = 'button';
			retry.textContent = localize('designerBranchSwitcherRetrySave', "Retry save");

			const switchWithoutSaving = document.createElement('button');
			switchWithoutSaving.className = 'designer-branch-switcher__problem-action designer-branch-switcher__problem-action--switch';
			switchWithoutSaving.type = 'button';
			switchWithoutSaving.textContent = localize('designerBranchSwitcherSwitchWithoutSaving', "Switch without saving");

			const copy = document.createElement('button');
			copy.className = 'designer-branch-switcher__problem-action designer-branch-switcher__problem-action--copy';
			copy.type = 'button';
			copy.textContent = localize('designerBranchSwitcherCopyIssueForAgent', "Copy issue for agent");
			copy.disabled = !this.recoveryAgentPrompt;

			const dismiss = this.createProblemDismissButton(true);

			this.renderDisposables.add(addDisposableListener(retry, EventType.CLICK, () => {
				if (this.blockedCheckoutBranchName) {
					this.saveAndCheckoutBranch(this.blockedCheckoutBranchName);
				} else if (this.blockedRepoPath) {
					this.switchRepo(this.blockedRepoPath);
				}
			}));
			this.renderDisposables.add(addDisposableListener(switchWithoutSaving, EventType.CLICK, () => {
				if (this.blockedCheckoutBranchName) {
					this.checkoutBranchWithoutSaving(this.blockedCheckoutBranchName);
				} else if (this.blockedRepoPath) {
					this.switchRepoWithoutSaving(this.blockedRepoPath);
				}
			}));
			this.renderDisposables.add(addDisposableListener(copy, EventType.CLICK, () => this.copyRecoveryPrompt()));
			if (this.recoveryAgentPrompt) {
				actions.append(retry, switchWithoutSaving, copy);
			}
			actions.append(dismiss);
			problem.append(actions);
		} else {
			const actions = $('.designer-branch-switcher__problem-actions');
			const dismiss = this.createProblemDismissButton(false);

			actions.append(dismiss);
			problem.append(actions);
		}

		return problem;
	}

	private createProblemDismissButton(clearBlockedTarget: boolean): HTMLButtonElement {
		const dismiss = document.createElement('button');
		dismiss.className = 'designer-branch-switcher__problem-dismiss';
		dismiss.type = 'button';
		dismiss.title = localize('designerBranchSwitcherDismissProblem', "Dismiss");
		dismiss.append($('span.codicon.codicon-close'));

		this.renderDisposables.add(addDisposableListener(dismiss, EventType.CLICK, () => {
			this.problemMessage = undefined;
			this.repoProblemMessage = undefined;
				this.recoveryAgentPrompt = undefined;
				if (clearBlockedTarget) {
					this.blockedCheckoutBranchName = undefined;
					this.blockedRepoPath = undefined;
				}
				this.activeSyncState = undefined;
				this.render();
			}));

		return dismiss;
	}

	private getRefreshProblemMessage(error: unknown): string {
		const message = getErrorMessage(error);
		if (this.isDesignerCommandUnavailable(message)) {
			this.projectAccessLimited = true;
			return localize('designerBranchSwitcherAccessLimited', "Project access is limited. Allow this project to load repos and branches.");
		}

		return message;
	}

	private isDesignerCommandUnavailable(message: string): boolean {
		return /_designer(?:Branches|Repos)\./.test(message) && /not found|not registered|unknown command/i.test(message);
	}

	private async allowProjectAccess(): Promise<void> {
		const trusted = await this.workspaceTrustRequestService.requestWorkspaceTrust({
			message: localize('designerBranchSwitcherTrustRequest', "Allow this project so branches, saving, and project switching can work.")
		});

		if (!trusted) {
			return;
		}

		this.projectAccessLimited = false;
		this.problemMessage = undefined;
		this.repoProblemMessage = undefined;
		this.refresh({ retryDuringStartup: true });
		this.refreshRepos();
	}

	private renderBranchSetup(setup: DesignerBranchSetup): HTMLElement {
		const container = $('.designer-branch-switcher__setup');
		const message = setup.reason === 'notGitRepository'
			? localize('designerBranchSwitcherNotGitRepository', "This folder is not connected to a remote repo yet.")
			: localize('designerBranchSwitcherSetupRequired', "This folder needs setup before branches are available.");

		container.append(
			$('span.codicon.codicon-repo.designer-branch-switcher__setup-icon'),
			$('span.designer-branch-switcher__setup-message', undefined, message)
		);

		const connect = document.createElement('button');
		connect.className = 'designer-branch-switcher__setup-action designer-branch-switcher__setup-action--connect';
		connect.type = 'button';
		connect.textContent = localize('designerBranchSwitcherConnectRemoteRepo', "Connect to Remote Repo");
		this.renderDisposables.add(addDisposableListener(connect, EventType.CLICK, () => this.connectCurrentFolderToRemote()));
		container.append(connect);

		return container;
	}

	private async connectCurrentFolderToRemote(): Promise<void> {
		this.problemMessage = undefined;
		this.render();

		try {
			const state = await this.commandService.executeCommand<DesignerBranchState>('_designerRepos.connectCurrentFolderToRemote');
			if (state) {
				this.updateBranchState(state);
			} else {
				this.refresh({ retryDuringStartup: true });
			}
			this.refreshRepos();
		} catch (error) {
			this.problemMessage = getErrorMessage(error);
			this.render();
		}
	}

	private renderTree(): HTMLElement {
		const tree = $('.designer-branch-switcher__tree');
		tree.setAttribute('role', 'menu');
		this.treeElement = tree;
		this.populateTree(tree);

		return tree;
	}

	private populateTree(tree: HTMLElement): void {
		if (this.treeRenderDeferred) {
			tree.append($('.designer-branch-switcher__empty', undefined, localize('designerBranchSwitcherPreparingBranches', "Preparing branches...")));
			return;
		}

		const filteredTree = this.getFilteredTree();

		if (!filteredTree.length) {
			tree.append($('.designer-branch-switcher__empty', undefined, localize('designerBranchSwitcherEmpty', "No branches found.")));
			return;
		}

		for (const node of filteredTree) {
			this.renderTreeNode(tree, node, 0);
		}
	}

	private updateRenderedTree(): void {
		if (!this.treeElement) {
			this.render();
			this.focusFilterInput();
			return;
		}

		this.treeDisposables.clear();
		this.treeElement.replaceChildren();
		this.populateTree(this.treeElement);
	}

	private renderRepoList(): HTMLElement {
		const list = $('.designer-branch-switcher__repo-list');

		if (this.refreshingRepos && !this.repoState) {
			list.append($('.designer-branch-switcher__empty', undefined, localize('designerRepoSwitcherLoading', "Loading repos...")));
			return list;
		}

		const repos = this.repoState?.repos ?? [];
		if (!repos.length) {
			list.append($('.designer-branch-switcher__empty', undefined, localize('designerRepoSwitcherEmpty', "No repos added yet.")));
			return list;
		}

		for (const repo of repos) {
			list.append(this.renderRepoRow(repo));
		}

		if (this.addingRepoSource) {
			const cloningRow = this.renderRepoRow({
				name: this.getRepoNameFromSource(this.addingRepoSource),
				path: '',
				status: 'cloning',
				isCurrent: false,
				url: this.addingRepoSource
			});
			list.append(cloningRow);
		}

		return list;
	}

	private renderRepoRow(repo: DesignerRepoItem): HTMLElement {
		const row = document.createElement('div');
		row.className = `designer-branch-switcher__repo-row designer-branch-switcher__repo-row--${repo.status}`;

		const icon = repo.status === 'cloning'
			? $('span.codicon.codicon-loading.codicon-modifier-spin.designer-branch-switcher__row-icon')
			: repo.status === 'problem'
				? $('span.codicon.codicon-error.designer-branch-switcher__row-icon')
				: $('span.codicon.codicon-repo.designer-branch-switcher__row-icon');

		const open = document.createElement('button');
		open.className = 'designer-branch-switcher__repo-open';
		open.type = 'button';
		open.disabled = repo.status !== 'ready' || repo.isCurrent || !!this.switchingRepoPath;
		open.append(
			icon,
			$('span.designer-branch-switcher__row-label', undefined, repo.name),
			$('span.designer-branch-switcher__badge', undefined, this.getRepoBadge(repo))
		);
		row.append(open);

		if (repo.isCurrent) {
			row.classList.add('designer-branch-switcher__repo-row--current');
			row.append($('span.codicon.codicon-check.designer-branch-switcher__row-check'));
		} else if (repo.path === this.switchingRepoPath) {
			row.classList.add('designer-branch-switcher__repo-row--switching');
			row.append($('span.codicon.codicon-sync.codicon-modifier-spin.designer-branch-switcher__row-check'));
		} else if (repo.status === 'ready') {
			this.renderDisposables.add(addDisposableListener(open, EventType.CLICK, () => this.switchRepo(repo.path)));
			this.renderDisposables.add(addDisposableListener(row, EventType.CLICK, event => {
				if (event.target === open || open.contains(event.target as Node)) {
					return;
				}
				this.switchRepo(repo.path);
			}));
		}

		if (!repo.isCurrent && repo.status === 'ready') {
			const remove = document.createElement('button');
			remove.className = 'designer-branch-switcher__repo-remove';
			remove.type = 'button';
			remove.disabled = this.isBusy() || repo.path === this.removingRepoPath;
			remove.title = localize('designerRepoSwitcherRemoveTitle', "Remove repo");
			remove.setAttribute('aria-label', localize('designerRepoSwitcherRemoveAria', "Remove {0}", repo.name));
			remove.append(repo.path === this.removingRepoPath ? $('span.codicon.codicon-sync.codicon-modifier-spin') : $('span.codicon.codicon-close'));

			this.renderDisposables.add(addDisposableListener(remove, EventType.CLICK, event => {
				event.preventDefault();
				event.stopPropagation();
				this.confirmRemoveRepo(repo);
			}));

			row.append(remove);
		}

		if (repo.message) {
			row.title = repo.message;
		} else if (repo.path) {
			row.title = repo.path;
			open.title = repo.path;
		}

		return row;
	}

	private getRepoBadge(repo: DesignerRepoItem): string {
		if (repo.status === 'cloning') {
			return localize('designerRepoSwitcherCloningBadge', "cloning");
		}

		if (repo.status === 'problem') {
			return localize('designerRepoSwitcherProblemBadge', "problem");
		}

		return repo.isCurrent ? localize('designerRepoSwitcherCurrentBadge', "current") : '';
	}

	private renderFilter(): HTMLElement {
		const wrapper = $('.designer-branch-switcher__filter');
		wrapper.append($('span.codicon.codicon-search.designer-branch-switcher__filter-icon'));

		const input = document.createElement('input');
		input.className = 'designer-branch-switcher__filter-input';
		input.type = 'text';
		input.value = this.branchFilter;
		input.placeholder = localize('designerBranchSwitcherFilterPlaceholder', "Search branches");
		input.setAttribute('aria-label', localize('designerBranchSwitcherFilterAria', "Search branches"));
		this.filterInput = input;

		this.renderDisposables.add(addDisposableListener(input, EventType.INPUT, () => {
			this.branchFilter = input.value;
			this.updateRenderedTree();
		}));

		wrapper.append(input);
		return wrapper;
	}

	private getFilteredTree(): readonly DesignerBranchTreeNode[] {
		const query = this.branchFilter.trim().toLowerCase();
		if (!query) {
			return this.state?.tree ?? [];
		}

		return this.filterTree(this.state?.tree ?? [], query);
	}

	private filterTree(nodes: readonly DesignerBranchTreeNode[], query: string): DesignerBranchTreeNode[] {
		const result: DesignerBranchTreeNode[] = [];

		for (const node of nodes) {
			const children = this.filterTree(node.children, query);
			const branchMatches = node.branch ? this.branchMatchesFilter(node.branch, query) : false;
			const folderMatches = node.name.toLowerCase().includes(query);

			if (branchMatches || folderMatches || children.length > 0) {
				result.push({
					...node,
					children: folderMatches ? node.children : children
				});
			}
		}

		return result;
	}

	private branchMatchesFilter(branch: DesignerBranchItem, query: string): boolean {
		return branch.name.toLowerCase().includes(query) ||
			branch.path.some(segment => segment.toLowerCase().includes(query));
	}

	private renderTreeNode(parent: HTMLElement, node: DesignerBranchTreeNode, depth: number): void {
		if (node.branch) {
			parent.append(this.renderBranchRow(node.branch, depth));
		} else {
			const folder = $('.designer-branch-switcher__folder');
			folder.style.paddingLeft = `${6 + depth * 14}px`;
			folder.append(
				$('span.codicon.codicon-folder.designer-branch-switcher__folder-icon'),
				$('span', undefined, node.name)
			);
			parent.append(folder);
		}

		for (const child of node.children) {
			this.renderTreeNode(parent, child, depth + 1);
		}
	}

	private renderBranchRow(branch: DesignerBranchItem, depth: number): HTMLElement {
		const row = document.createElement('button');
		row.type = 'button';
		row.className = `designer-branch-switcher__row designer-branch-switcher__row--${branch.status}`;
		row.style.paddingLeft = `${6 + depth * 14}px`;
		row.setAttribute('role', 'menuitemradio');
		row.setAttribute('aria-checked', String(branch.isCurrent));
		row.disabled = !!this.switchingBranchName;

		const displayName = branch.path[branch.path.length - 1] ?? branch.name;
		row.append(
			$('span.codicon.codicon-git-branch.designer-branch-switcher__row-icon'),
			$('span.designer-branch-switcher__row-label', undefined, displayName),
			this.renderBranchBadge(branch)
		);

		if (branch.isCurrent) {
			row.classList.add('designer-branch-switcher__row--current');
			row.append($('span.codicon.codicon-check.designer-branch-switcher__row-check'));
		} else if (branch.name === this.switchingBranchName) {
			row.classList.add('designer-branch-switcher__row--switching');
			row.append($('span.codicon.codicon-sync.codicon-modifier-spin.designer-branch-switcher__row-check'));
		} else {
			this.treeDisposables.add(addDisposableListener(row, EventType.CLICK, () => this.checkoutBranch(branch.name)));
		}

		return row;
	}

	private renderBranchBadge(branch: DesignerBranchItem): HTMLElement {
		if (branch.cloudProblem) {
			const badge = $('span.designer-branch-switcher__badge.designer-branch-switcher__badge--cloud-problem');
			badge.title = branch.cloudProblem.message;
			badge.append($('span.codicon.codicon-cloud.designer-branch-switcher__badge-icon'));
			return badge;
		}

		const badgeText = branch.name === this.switchingBranchName
			? this.activeSyncState === 'saving' || this.activeSyncState === 'pushing'
				? localize('designerBranchSwitcherSavingBadge', "saving")
				: localize('designerBranchSwitcherSwitchingBadge', "switching")
			: branch.isDefault
				? localize('designerBranchSwitcherDefaultBadge', "default")
				: branch.status === 'remoteOnly'
					? localize('designerBranchSwitcherRemoteBadge', "cloud")
					: branch.status === 'localOnly'
						? localize('designerBranchSwitcherLocalBadge', "local")
						: branch.status === 'problem'
							? localize('designerBranchSwitcherProblemBadge', "needs sync")
							: '';

		return $('span.designer-branch-switcher__badge', undefined, badgeText);
	}

	private async checkoutBranch(branchName: string): Promise<void> {
		return this.saveAndCheckoutBranch(branchName);
	}

	private async saveAndCheckoutBranch(branchName: string): Promise<void> {
		this.switchingBranchName = branchName;
		this.activeSyncState = 'saving';
		this.problemMessage = undefined;
		this.blockedCheckoutBranchName = undefined;
		this.recoveryAgentPrompt = undefined;
		this.closeDropdown();

		try {
			const result = await this.commandService.executeCommand<DesignerBranchCheckoutResult>('_designerBranches.saveAndCheckout', { branchName });
			if (!result) {
				throw new Error(localize('designerBranchSwitcherSaveAndCheckoutFailed', "Branch could not be saved and switched."));
			}

			this.state = result.state;
			this.activeSyncState = result.sync?.state;

			if (result.blocked) {
				this.problemMessage = result.blocked.message;
				this.blockedCheckoutBranchName = result.blocked.reason === 'unsafeHostRepository' ? undefined : branchName;
				this.recoveryAgentPrompt = result.sync?.agentPrompt;
				this.activeSyncState = 'blocked';
			} else {
				this.blockedCheckoutBranchName = undefined;
				this.recoveryAgentPrompt = undefined;
				this.dropdownMode = undefined;
				this.windowDisposables.clear();
			}
		} catch (error) {
			this.problemMessage = getErrorMessage(error);
			this.blockedCheckoutBranchName = branchName;
			this.recoveryAgentPrompt = this.createFallbackAgentPrompt(this.problemMessage);
			this.activeSyncState = 'problem';
		} finally {
			this.switchingBranchName = undefined;
			if (this.activeSyncState === 'saving' || this.activeSyncState === 'pushing') {
				this.activeSyncState = undefined;
			}
			this.render();
		}
	}

	private async checkoutBranchWithoutSaving(branchName: string): Promise<void> {
		this.switchingBranchName = branchName;
		this.activeSyncState = undefined;
		this.problemMessage = undefined;
		this.blockedCheckoutBranchName = undefined;
		this.recoveryAgentPrompt = undefined;
		this.closeDropdown();

		try {
			const result = await this.commandService.executeCommand<DesignerBranchCheckoutResult>('_designerBranches.checkout', { branchName, skipSave: true });
			if (!result) {
				throw new Error(localize('designerBranchSwitcherCheckoutFailed', "Branch could not be switched."));
			}

			this.state = result.state;
			if (result.blocked) {
				this.problemMessage = result.blocked.message;
				this.blockedCheckoutBranchName = result.blocked.reason === 'unsafeHostRepository' ? undefined : branchName;
				this.recoveryAgentPrompt = result.blocked.reason === 'unsafeHostRepository' ? undefined : result.sync?.agentPrompt;
			} else {
				this.blockedCheckoutBranchName = undefined;
				this.recoveryAgentPrompt = undefined;
				this.dropdownMode = undefined;
				this.windowDisposables.clear();
			}
		} catch (error) {
			this.problemMessage = getErrorMessage(error);
			this.blockedCheckoutBranchName = branchName;
			this.recoveryAgentPrompt = this.createFallbackAgentPrompt(this.problemMessage);
		} finally {
			this.switchingBranchName = undefined;
			this.render();
		}
	}

	private async switchRepo(repoPath: string): Promise<void> {
		this.switchingRepoPath = repoPath;
		this.activeSyncState = 'saving';
		this.repoProblemMessage = undefined;
		this.blockedRepoPath = undefined;
		this.recoveryAgentPrompt = undefined;
		this.closeDropdown();

		try {
			const result = await this.commandService.executeCommand<DesignerRepoSwitchResult>('_designerRepos.saveAndSwitch', { repoPath });
			if (!result) {
				throw new Error(localize('designerRepoSwitcherSwitchFailed', "Repo could not be opened."));
			}

			this.repoState = result.state;
			this.activeSyncState = result.sync?.state;
			if (result.blocked) {
				this.repoProblemMessage = result.blocked.message;
				this.blockedRepoPath = result.blocked.reason === 'unsafeHostRepository' ? undefined : repoPath;
				this.recoveryAgentPrompt = result.blocked.reason === 'unsafeHostRepository' ? undefined : result.sync?.agentPrompt;
				this.activeSyncState = 'blocked';
			} else {
				this.dropdownMode = undefined;
				this.windowDisposables.clear();
			}
		} catch (error) {
			this.repoProblemMessage = getErrorMessage(error);
			this.blockedRepoPath = repoPath;
			this.recoveryAgentPrompt = this.createFallbackAgentPrompt(this.repoProblemMessage);
			this.activeSyncState = 'problem';
		} finally {
			this.switchingRepoPath = undefined;
			if (this.activeSyncState === 'saving' || this.activeSyncState === 'pushing') {
				this.activeSyncState = undefined;
			}
			this.render();
		}
	}

	private async switchRepoWithoutSaving(repoPath: string): Promise<void> {
		this.switchingRepoPath = repoPath;
		this.activeSyncState = undefined;
		this.repoProblemMessage = undefined;
		this.blockedRepoPath = undefined;
		this.recoveryAgentPrompt = undefined;
		this.closeDropdown();

		try {
			const result = await this.commandService.executeCommand<DesignerRepoSwitchResult>('_designerRepos.switch', { repoPath, skipSave: true });
			if (!result) {
				throw new Error(localize('designerRepoSwitcherSwitchFailed', "Repo could not be opened."));
			}

			this.repoState = result.state;
			if (result.blocked) {
				this.repoProblemMessage = result.blocked.message;
				this.blockedRepoPath = result.blocked.reason === 'unsafeHostRepository' ? undefined : repoPath;
				this.recoveryAgentPrompt = result.blocked.reason === 'unsafeHostRepository' ? undefined : result.sync?.agentPrompt;
			} else {
				this.blockedRepoPath = undefined;
				this.recoveryAgentPrompt = undefined;
				this.dropdownMode = undefined;
				this.windowDisposables.clear();
			}
		} catch (error) {
			this.repoProblemMessage = getErrorMessage(error);
			this.blockedRepoPath = repoPath;
			this.recoveryAgentPrompt = this.createFallbackAgentPrompt(this.repoProblemMessage);
		} finally {
			this.switchingRepoPath = undefined;
			this.render();
		}
	}

	private async copyRecoveryPrompt(): Promise<void> {
		if (!this.recoveryAgentPrompt) {
			return;
		}

		try {
			await getWindow(this.container).navigator.clipboard?.writeText(this.recoveryAgentPrompt);
		} catch {
			// Clipboard support is unavailable in some test/browser contexts. The recovery text remains visible through the action state.
		}
	}

	private createFallbackAgentPrompt(message: string | undefined): string {
		return localize('designerBranchSwitcherFallbackAgentPrompt', "Help me resolve this Git save or switch issue: {0}", message ?? localize('designerBranchSwitcherUnknownIssue', "Unknown issue"));
	}

	private async confirmRemoveRepo(repo: DesignerRepoItem): Promise<void> {
		const removeFromList = localize('designerRepoSwitcherRemoveFromList', "Remove from List");
		const deleteLocalFiles = localize('designerRepoSwitcherDeleteLocalFiles', "Remove and Delete Local Files");

		const result = await this.dialogService.prompt<'list' | 'delete'>({
			type: 'warning',
			message: localize('designerRepoSwitcherRemovePrompt', "Remove {0}?", repo.name),
			detail: localize('designerRepoSwitcherRemovePromptDetail', "Removing from the list keeps local files. Deleting local files moves the repo folder to the trash."),
			buttons: [
				{
					label: removeFromList,
					run: () => 'list'
				},
				{
					label: deleteLocalFiles,
					run: () => 'delete'
				}
			],
			cancelButton: true
		});

		if (!result.result) {
			return;
		}

		await this.removeRepo(repo.path, result.result === 'delete');
	}

	private async removeRepo(repoPath: string, deleteLocalFiles: boolean): Promise<void> {
		this.removingRepoPath = repoPath;
		this.repoProblemMessage = undefined;
		this.render();

		try {
			const result = await this.commandService.executeCommand<DesignerRepoRemoveResult>('_designerRepos.remove', { repoPath, deleteLocalFiles });
			if (!result) {
				throw new Error(localize('designerRepoSwitcherRemoveFailed', "Repo could not be removed."));
			}

			this.repoState = result.state;
		} catch (error) {
			this.repoProblemMessage = getErrorMessage(error);
		} finally {
			this.removingRepoPath = undefined;
			this.render();
			this.focusRepoSourceInput();
		}
	}

	private renderNewBranch(): HTMLElement {
		const form = document.createElement('form');
		form.className = 'designer-branch-switcher__new';

		const prefix = document.createElement('button');
		prefix.className = 'designer-branch-switcher__prefix';
		prefix.type = 'button';
		prefix.textContent = this.useDesignPrefix ? 'design/' : localize('designerBranchSwitcherNoPrefix', "root");
		prefix.title = this.useDesignPrefix
			? localize('designerBranchSwitcherRemovePrefix', "Create outside design/")
			: localize('designerBranchSwitcherAddPrefix', "Create inside design/");

		const input = document.createElement('input');
		input.className = 'designer-branch-switcher__input';
		input.type = 'text';
		input.placeholder = localize('designerBranchSwitcherNewBranchPlaceholder', "new-branch-name");
		input.setAttribute('aria-label', localize('designerBranchSwitcherNewBranchAria', "New branch name"));

		const create = document.createElement('button');
		create.className = 'designer-branch-switcher__create';
		create.type = 'submit';
		create.disabled = true;
		create.append(
			$('span.codicon.codicon-add'),
			$('span', undefined, localize('designerBranchSwitcherCreateBranch', "Create"))
		);

		form.append(prefix, input, create);

		if (!this.useDesignPrefix) {
			form.append($('.designer-branch-switcher__prefix-warning', undefined, localize('designerBranchSwitcherPrefixWarning', "Creates at the branch root. Keep design work grouped when possible.")));
		}

		this.renderDisposables.add(addDisposableListener(prefix, EventType.CLICK, () => {
			this.useDesignPrefix = !this.useDesignPrefix;
			this.render();
		}));

		const updateCreateButtonState = () => {
			create.disabled = !this.getBranchName(input.value);
		};

		this.renderDisposables.add(addDisposableListener(input, EventType.INPUT, updateCreateButtonState));
		updateCreateButtonState();

		this.renderDisposables.add(addDisposableListener(form, EventType.SUBMIT, event => {
			event.preventDefault();
			if (create.disabled) {
				return;
			}
			this.createBranch(input.value);
		}));

		return form;
	}

	private async createBranch(input: string): Promise<void> {
		const branchName = this.getBranchName(input);
		if (!branchName) {
			this.problemMessage = localize('designerBranchSwitcherBranchNameRequired', "Enter a branch name.");
			this.render();
			return;
		}

		this.switchingBranchName = branchName;
		this.problemMessage = undefined;
		this.render();

		try {
			this.state = await this.commandService.executeCommand<DesignerBranchState>('_designerBranches.create', { branchName });
			this.dropdownMode = undefined;
			this.windowDisposables.clear();
		} catch (error) {
			this.problemMessage = getErrorMessage(error);
		} finally {
			this.switchingBranchName = undefined;
			this.render();
		}
	}

	private isBusy(): boolean {
		return this.refreshingBranches || this.refreshingRepos || !!this.switchingBranchName || !!this.switchingRepoPath || !!this.removingRepoPath || !!this.addingRepoSource || this.pickingRepoFolder;
	}

	private getBranchName(input: string): string {
		const branchName = input
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9/_-]+/g, '-')
			.replace(/\/+/g, '/')
			.replace(/^-+|-+$/g, '')
			.replace(/^\/+|\/+$/g, '');

		if (!branchName) {
			return '';
		}

		if (!this.useDesignPrefix) {
			return branchName;
		}

		return `design/${branchName.replace(/^design\//, '')}`;
	}

	private renderAddRepo(): HTMLElement {
		const form = document.createElement('form');
		form.className = 'designer-branch-switcher__repo-add-form';

		const chooseFolder = document.createElement('button');
		chooseFolder.className = 'designer-branch-switcher__repo-source-folder';
		chooseFolder.type = 'button';
		chooseFolder.title = localize('designerRepoSwitcherChooseLocalFolderTitle', "Choose Local Folder");
		chooseFolder.setAttribute('aria-label', localize('designerRepoSwitcherChooseLocalFolderAria', "Choose Local Folder"));
		chooseFolder.disabled = this.isBusy();
		chooseFolder.append($('span.codicon.codicon-folder'));

		const input = document.createElement('input');
		input.className = 'designer-branch-switcher__repo-source-input';
		input.type = 'text';
		input.value = this.repoSourceDraft;
		input.placeholder = localize('designerRepoSwitcherSourcePlaceholder', "Add repo URL or local folder");
		input.setAttribute('aria-label', localize('designerRepoSwitcherSourceAria', "Repo URL or Local Folder Path"));
		this.repoSourceInput = input;

		const add = document.createElement('button');
		add.className = 'designer-branch-switcher__repo-add';
		add.type = 'submit';
		add.disabled = true;
		add.append(
			$('span.codicon.codicon-add'),
			$('span', undefined, localize('designerRepoSwitcherAdd', "Add"))
		);

		form.append(chooseFolder, input, add);

		const updateAddButtonState = () => {
			add.disabled = !input.value.trim() || !!this.addingRepoSource || this.pickingRepoFolder;
		};

		this.renderDisposables.add(addDisposableListener(chooseFolder, EventType.CLICK, () => this.pickRepoSourceFolder(updateAddButtonState)));
		this.renderDisposables.add(addDisposableListener(input, EventType.INPUT, () => {
			this.repoSourceDraft = input.value;
			if (this.repoProblemMessage) {
				this.repoProblemMessage = undefined;
				this.render();
				this.focusRepoSourceInput();
				return;
			}

			updateAddButtonState();
		}));
		updateAddButtonState();

		this.renderDisposables.add(addDisposableListener(form, EventType.SUBMIT, event => {
			event.preventDefault();
			const source = input.value.trim();
			if (!source || add.disabled) {
				return;
			}
			this.addRepoSource(source);
		}));

		return form;
	}

	private async pickRepoSourceFolder(updateAddButtonState: () => void): Promise<void> {
		this.pickingRepoFolder = true;
		let selectedPath: string | undefined;
		let problem: string | undefined;

		try {
			const folders = await this.fileDialogService.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				openLabel: localize('designerRepoSwitcherChooseFolderOpenLabel', "Choose Folder"),
				title: localize('designerRepoSwitcherChooseFolderTitle', "Choose Local Folder")
			});
			const folder = folders?.[0];
			if (folder) {
				selectedPath = folder.fsPath;
			}
		} catch (error) {
			problem = getErrorMessage(error);
		} finally {
			this.pickingRepoFolder = false;
		}

		if (problem) {
			this.repoProblemMessage = problem;
			this.render();
			this.focusRepoSourceInput();
			return;
		}

		if (selectedPath) {
			this.repoSourceDraft = selectedPath;
			this.repoProblemMessage = undefined;
			this.render();
			this.focusRepoSourceInput();
			return;
		}

		updateAddButtonState();
		this.focusRepoSourceInput();
	}

	private async addRepoSource(source: string): Promise<void> {
		this.addingRepoSource = source;
		this.repoSourceDraft = source;
		this.repoProblemMessage = undefined;
		this.render();

		try {
			const nextState = await this.commandService.executeCommand<DesignerRepoState>('_designerRepos.addSource', { source });
			this.repoState = nextState ? this.mergeRepoState(this.repoState, nextState) : nextState;
			this.repoSourceDraft = '';
		} catch (error) {
			this.repoProblemMessage = getErrorMessage(error);
		} finally {
			this.addingRepoSource = undefined;
			this.render();
			this.focusRepoSourceInput();
		}
	}

	private getRepoNameFromSource(source: string): string {
		const trimmed = source.trim().replace(/[/\\]+$/, '').replace(/\.git$/, '');
		const lastSegment = trimmed.split(/[/:]/).filter(Boolean).pop();
		if (!lastSegment) {
			return localize('designerRepoSwitcherUnknownRepo', "New repo");
		}

		return lastSegment
			.replace(/[-_]+/g, ' ')
			.replace(/\b\w/g, value => value.toUpperCase());
	}

	private mergeRepoState(existingState: DesignerRepoState | undefined, nextState: DesignerRepoState): DesignerRepoState {
		if (!existingState) {
			return nextState;
		}

		const reposByPath = new Map<string, DesignerRepoItem>();
		for (const repo of existingState.repos) {
			reposByPath.set(this.normalizeRepoPath(repo.path), repo);
		}

		for (const repo of nextState.repos) {
			const key = this.normalizeRepoPath(repo.path);
			const existingRepo = reposByPath.get(key);
			reposByPath.set(key, existingRepo ? { ...existingRepo, ...repo } : repo);
		}

		return {
			currentRepoPath: nextState.currentRepoPath ?? existingState.currentRepoPath,
			repos: [...reposByPath.values()]
		};
	}

	private normalizeRepoPath(repoPath: string): string {
		return repoPath.trim().toLowerCase();
	}
}

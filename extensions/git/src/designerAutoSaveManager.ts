/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, Disposable, Event, EventEmitter, l10n, LogOutputChannel, Memento, window, workspace } from 'vscode';
import { DesignerAutoSaveBranchKind, DesignerAutoSaveCommitMessage, DesignerAutoSaveIdleDelayMs, DesignerAutoSaveMaxDelayMs, DesignerAutoSaveScheduler, DesignerAutoSaveTrigger, DesignerMainlineManualRemoteApprovalText, getDesignerAutoSavePolicy, isDesignerBranchName, isDesignerMainlineBranchName } from './designerAutoSave';
import { Model } from './model';
import { Repository } from './repository';
import { isDescendant } from './util';

export interface DesignerCloudProblem {
	readonly message: string;
}

export interface DesignerAutoSaveResult {
	readonly branchName: string | undefined;
	readonly committed: boolean;
	readonly pushed: boolean;
	readonly pushFailed: boolean;
	readonly manualCommitRequired?: boolean;
	readonly message?: string;
}

interface RepositoryAutoSaveState {
	readonly disposables: Disposable[];
	readonly scheduler: DesignerAutoSaveScheduler;
	retryTimer?: ReturnType<typeof setTimeout>;
}

export class DesignerAutoSaveManager implements Disposable {
	private readonly disposables: Disposable[] = [];
	private readonly repositories = new Map<Repository, RepositoryAutoSaveState>();
	private readonly cloudProblems = new Map<string, DesignerCloudProblem>();
	private readonly manualCommitReminders = new Set<string>();
	private readonly _onDidChangeCloudProblems = new EventEmitter<void>();
	readonly onDidChangeCloudProblems: Event<void> = this._onDidChangeCloudProblems.event;

	constructor(
		private readonly model: Model,
		_globalState: Memento,
		private readonly logger: LogOutputChannel
	) {
		for (const repository of this.model.repositories) {
			this.addRepository(repository);
		}

		this.disposables.push(this.model.onDidOpenRepository(repository => this.addRepository(repository)));
		this.disposables.push(this.model.onDidCloseRepository(repository => this.removeRepository(repository)));
	}

	getCloudProblem(repositoryRoot: string, branchName: string | undefined): DesignerCloudProblem | undefined {
		if (!branchName) {
			return undefined;
		}

		return this.cloudProblems.get(this.getCloudProblemKey(repositoryRoot, branchName));
	}

	async save(repository: Repository, trigger: DesignerAutoSaveTrigger, options: { branchName?: string; remoteConfirmed?: boolean; background?: boolean } = {}): Promise<DesignerAutoSaveResult> {
		await this.saveDirtyTextDocuments(repository);
		await repository.status();

		const branchName = options.branchName ?? repository.HEAD?.name;
		if (!branchName) {
			return { branchName, committed: false, pushed: false, pushFailed: false };
		}

		const policy = getDesignerAutoSavePolicy(branchName, trigger, options.remoteConfirmed);
		const hasChanges = this.hasChanges(repository);
		let committed = false;

		if (hasChanges) {
			if (repository.mergeGroup.resourceStates.length > 0) {
				throw new Error(l10n.t('Resolve merge conflicts before saving.'));
			}

			if (!policy.commit) {
				if (options.background && policy.promptForManualCommit) {
					this.recordManualCommitRequired(repository, branchName);
				}

				if (!options.background) {
					throw new Error(getDesignerManualCommitRequiredMessage(policy.branchKind, branchName));
				}

				return { branchName, committed: false, pushed: false, pushFailed: false, manualCommitRequired: true };
			}

			const resources = [
				...repository.workingTreeGroup.resourceStates.map(resource => resource.resourceUri),
				...repository.untrackedGroup.resourceStates.map(resource => resource.resourceUri)
			];

			if (resources.length > 0) {
				await repository.add(resources);
			}

			await repository.commit(DesignerAutoSaveCommitMessage, { all: true, noVerify: true });
			await repository.status();
			committed = true;
		}

		if (!committed && !this.getCloudProblem(repository.root, branchName)) {
			return { branchName, committed, pushed: false, pushFailed: false };
		}

		if (!policy.push) {
			return { branchName, committed, pushed: false, pushFailed: false };
		}

		try {
			await this.pushCurrentBranch(repository, branchName);
			this.clearCloudProblem(repository.root, branchName);
			return { branchName, committed, pushed: true, pushFailed: false };
		} catch (error) {
			const message = getDesignerAutoSaveErrorMessage(error);
			this.setCloudProblem(repository.root, branchName, message);
			if (!options.background) {
				throw error;
			}

			this.logger.trace(`[DesignerAutoSave] Background push failed for ${branchName}: ${message}`);
			return { branchName, committed, pushed: false, pushFailed: true, message };
		}
	}

	async pushSharedBranchWithConfirmation(repository: Repository): Promise<boolean> {
		await repository.status();
		const branchName = repository.HEAD?.name;
		if (!branchName) {
			throw new Error(l10n.t('Add a branch name before saving to cloud.'));
		}

		if (isDesignerBranchName(branchName)) {
			await this.pushCurrentBranch(repository, branchName);
			this.clearCloudProblem(repository.root, branchName);
			return true;
		}

		const policy = getDesignerAutoSavePolicy(branchName, 'manualRemote');
		if (this.hasChanges(repository)) {
			throw new Error(getDesignerManualCommitRequiredMessage(policy.branchKind, branchName));
		}

		const publish = l10n.t('Publish to Shared Branch');
		const result = await window.showWarningMessage(
			l10n.t('This will publish your local commits to "{0}", a shared branch that engineers may depend on. Only continue if you understand this can change code other people are using.', branchName),
			{ modal: true },
			publish
		);

		if (result !== publish) {
			return false;
		}

		const mainlineApproved = isDesignerMainlineBranchName(branchName)
			? await this.confirmMainlineRemotePublish(branchName)
			: false;
		const remotePolicy = getDesignerAutoSavePolicy(branchName, 'manualRemote', true, mainlineApproved);
		if (!remotePolicy.push) {
			return false;
		}

		await this.pushCurrentBranch(repository, branchName);
		this.clearCloudProblem(repository.root, branchName);
		return true;
	}

	private async confirmMainlineRemotePublish(branchName: string): Promise<boolean> {
		const result = await window.showInputBox({
			prompt: l10n.t('Type "{0}" to publish "{1}" to the remote.', DesignerMainlineManualRemoteApprovalText, branchName),
			placeHolder: DesignerMainlineManualRemoteApprovalText,
			ignoreFocusOut: true,
			validateInput: value => value === DesignerMainlineManualRemoteApprovalText
				? null
				: l10n.t('Type "{0}" exactly to continue.', DesignerMainlineManualRemoteApprovalText)
		});

		return result === DesignerMainlineManualRemoteApprovalText;
	}

	dispose(): void {
		this.disposables.forEach(disposable => disposable.dispose());
		for (const repository of this.repositories.keys()) {
			this.removeRepository(repository);
		}
		this._onDidChangeCloudProblems.dispose();
	}

	private addRepository(repository: Repository): void {
		if (this.repositories.has(repository)) {
			return;
		}

		const state: RepositoryAutoSaveState = {
			disposables: [],
			scheduler: new DesignerAutoSaveScheduler({
				idleMs: DesignerAutoSaveIdleDelayMs,
				maxMs: DesignerAutoSaveMaxDelayMs,
				setTimeout,
				clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
				run: () => this.runBackgroundSave(repository)
			})
		};

		state.disposables.push(repository.onDidRunGitStatus(() => this.onRepositoryStatus(repository)));
		state.disposables.push(repository.onDidChangeState(() => this.onRepositoryStatus(repository)));
		this.repositories.set(repository, state);
		this.onRepositoryStatus(repository);
	}

	private removeRepository(repository: Repository): void {
		const state = this.repositories.get(repository);
		if (!state) {
			return;
		}

		state.scheduler.dispose();
		if (state.retryTimer) {
			clearTimeout(state.retryTimer);
		}
		state.disposables.forEach(disposable => disposable.dispose());
		this.repositories.delete(repository);
	}

	private onRepositoryStatus(repository: Repository): void {
		if (repository.mergeGroup.resourceStates.length > 0) {
			return;
		}

		const branchName = repository.HEAD?.name;
		if (!this.hasChanges(repository)) {
			if (branchName) {
				this.clearManualCommitReminder(repository.root, branchName);
			}
			return;
		}

		this.repositories.get(repository)?.scheduler.markDirty();
	}

	private async runBackgroundSave(repository: Repository): Promise<void> {
		try {
			const result = await this.save(repository, 'background', { background: true });

			if (result.pushFailed) {
				this.schedulePushRetry(repository);
			}
		} catch (error) {
			const branchName = repository.HEAD?.name;
			const message = getDesignerAutoSaveErrorMessage(error);
			if (branchName) {
				this.setCloudProblem(repository.root, branchName, message);
			}
			this.logger.trace(`[DesignerAutoSave] Background save failed for ${branchName ?? 'unknown branch'}: ${message}`);
			this.schedulePushRetry(repository);
		}
	}

	private schedulePushRetry(repository: Repository): void {
		const state = this.repositories.get(repository);
		if (!state || state.retryTimer) {
			return;
		}

		state.retryTimer = setTimeout(() => {
			state.retryTimer = undefined;
			state.scheduler.markDirty();
		}, DesignerAutoSaveIdleDelayMs);
	}

	private async saveDirtyTextDocuments(repository: Repository): Promise<void> {
		const documents = workspace.textDocuments.filter(document =>
			document.isDirty &&
			document.uri.scheme === 'file' &&
			isDescendant(repository.root, document.uri.fsPath)
		);

		const saved = await Promise.all(documents.map(document => document.save()));
		if (saved.some(result => !result)) {
			throw new Error(l10n.t('Save open files before saving changes to Git.'));
		}
		await repository.status();
	}

	private hasChanges(repository: Repository): boolean {
		return repository.mergeGroup.resourceStates.length > 0 ||
			repository.indexGroup.resourceStates.length > 0 ||
			repository.workingTreeGroup.resourceStates.length > 0 ||
			repository.untrackedGroup.resourceStates.length > 0;
	}

	private async pushCurrentBranch(repository: Repository, branchName: string): Promise<void> {
		const defaultRemote = repository.getDefaultRemote();
		const upstream = repository.HEAD?.upstream;

		if (upstream) {
			await repository.push(repository.HEAD);
		} else if (defaultRemote) {
			await repository.pushTo(defaultRemote.name, `${branchName}:${branchName}`, true);
		} else {
			throw new Error(l10n.t('No remote is configured for this project.'));
		}
	}

	private recordManualCommitRequired(repository: Repository, branchName: string): void {
		const key = this.getManualCommitReminderKey(repository.root, branchName);
		if (this.manualCommitReminders.has(key)) {
			return;
		}

		this.manualCommitReminders.add(key);
		this.showManualCommitRequiredReminder(branchName).catch(error => {
			window.showErrorMessage(getDesignerAutoSaveErrorMessage(error));
		});
	}

	private async showManualCommitRequiredReminder(branchName: string): Promise<void> {
		const openSourceControl = l10n.t('Open Source Control');
		const result = await window.showInformationMessage(
			l10n.t('Parakit does not auto-commit on "{0}". Commit changes manually from Source Control when ready.', branchName),
			openSourceControl
		);

		if (result === openSourceControl) {
			await commands.executeCommand('workbench.view.scm');
		}
	}

	private clearManualCommitReminder(repositoryRoot: string, branchName: string): void {
		this.manualCommitReminders.delete(this.getManualCommitReminderKey(repositoryRoot, branchName));
	}

	private setCloudProblem(repositoryRoot: string, branchName: string, message: string): void {
		this.cloudProblems.set(this.getCloudProblemKey(repositoryRoot, branchName), { message });
		this._onDidChangeCloudProblems.fire();
	}

	private clearCloudProblem(repositoryRoot: string, branchName: string): void {
		if (this.cloudProblems.delete(this.getCloudProblemKey(repositoryRoot, branchName))) {
			this._onDidChangeCloudProblems.fire();
		}
	}

	private getCloudProblemKey(repositoryRoot: string, branchName: string): string {
		return `${repositoryRoot}\0${branchName}`;
	}

	private getManualCommitReminderKey(repositoryRoot: string, branchName: string): string {
		return `${repositoryRoot}\0${branchName}`;
	}
}

function getDesignerAutoSaveErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

function getDesignerManualCommitRequiredMessage(branchKind: DesignerAutoSaveBranchKind, branchName: string): string {
	if (branchKind === 'mainline') {
		return l10n.t('Parakit will not commit on "{0}". Move changes to a design branch or commit manually before continuing.', branchName);
	}

	return l10n.t('Parakit does not auto-commit on "{0}". Commit changes manually before continuing.', branchName);
}

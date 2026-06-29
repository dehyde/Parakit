/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, Event, EventEmitter, l10n, LogOutputChannel, Memento, window, workspace } from 'vscode';
import { DesignerAutoSaveCommitMessage, DesignerAutoSaveIdleDelayMs, DesignerAutoSaveLocalReminderCommitCount, DesignerAutoSaveMaxDelayMs, DesignerAutoSaveScheduler, DesignerAutoSaveTrigger, getDesignerAutoSavePolicy, isDesignerBranchName } from './designerAutoSave';
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
	private readonly _onDidChangeCloudProblems = new EventEmitter<void>();
	readonly onDidChangeCloudProblems: Event<void> = this._onDidChangeCloudProblems.event;

	constructor(
		private readonly model: Model,
		private readonly globalState: Memento,
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
			if (committed && policy.branchKind === 'shared') {
				this.recordLocalOnlyCommit(repository, branchName);
			}

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

		const publish = l10n.t('Publish to Shared Branch');
		const result = await window.showWarningMessage(
			l10n.t('This will publish your local auto-save commits to "{0}", a shared branch that engineers may depend on. Only continue if you understand this can change code other people are using.', branchName),
			{ modal: true },
			publish
		);

		if (result !== publish) {
			return false;
		}

		await this.save(repository, 'manualRemote', { branchName, remoteConfirmed: true });
		return true;
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

		if (this.hasChanges(repository)) {
			this.repositories.get(repository)?.scheduler.markDirty();
		}
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

	private recordLocalOnlyCommit(repository: Repository, branchName: string): void {
		const suppressedKey = this.getLocalReminderSuppressedKey(repository.root);
		if (this.globalState.get<boolean>(suppressedKey)) {
			return;
		}

		const countKey = this.getLocalReminderCountKey(repository.root, branchName);
		const count = this.globalState.get<number>(countKey, 0) + 1;
		this.globalState.update(countKey, count);

		if (count < DesignerAutoSaveLocalReminderCommitCount) {
			return;
		}

		this.globalState.update(countKey, 0);
		this.showLocalOnlyReminder(repository, branchName).catch(error => {
			window.showErrorMessage(getDesignerAutoSaveErrorMessage(error));
		});
	}

	private async showLocalOnlyReminder(repository: Repository, branchName: string): Promise<void> {
		const push = l10n.t('Publish to Cloud');
		const dontShowAgain = l10n.t('Don\'t Show Again');
		const result = await window.showInformationMessage(
			l10n.t('Auto-save is committing locally on "{0}". Publish manually if this shared branch should be updated in the cloud.', branchName),
			push,
			dontShowAgain
		);

		if (result === push) {
			await this.pushSharedBranchWithConfirmation(repository);
		} else if (result === dontShowAgain) {
			this.globalState.update(this.getLocalReminderSuppressedKey(repository.root), true);
		}
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

	private getLocalReminderCountKey(repositoryRoot: string, branchName: string): string {
		return `designer.autoSave.localOnlyReminder.count.${repositoryRoot}.${branchName}`;
	}

	private getLocalReminderSuppressedKey(repositoryRoot: string): string {
		return `designer.autoSave.localOnlyReminder.suppressed.${repositoryRoot}`;
	}
}

function getDesignerAutoSaveErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

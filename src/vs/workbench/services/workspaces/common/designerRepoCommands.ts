/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const ShowDesignerAddRepoCommandId = 'workbench.action.parakit.addRepo';
export const GetDesignerReposStateCommandId = '_designerRepos.getState';
export const AddDesignerRepoSourceCommandId = '_designerRepos.addSource';
export const SwitchDesignerRepoCommandId = '_designerRepos.switch';
export const SaveAndSwitchDesignerRepoCommandId = '_designerRepos.saveAndSwitch';
export const GetDesignerBranchesStateCommandId = '_designerBranches.getState';
export const CheckoutDesignerBranchCommandId = '_designerBranches.checkout';
export const SaveAndCheckoutDesignerBranchCommandId = '_designerBranches.saveAndCheckout';

export const enum DesignerAddRepoChoice {
	PasteRepoUrl = 'pasteRepoUrl',
	OpenLocalFolder = 'openLocalFolder'
}

export type DesignerRepoStatus = 'ready' | 'cloning' | 'problem';

export interface DesignerRepoItem {
	readonly name: string;
	readonly path: string;
	readonly status: DesignerRepoStatus;
	readonly isCurrent: boolean;
	readonly url?: string;
	readonly message?: string;
}

export interface DesignerRepoState {
	readonly currentRepoPath: string | undefined;
	readonly repos: readonly DesignerRepoItem[];
}

export type DesignerBranchStatus = 'synced' | 'remoteOnly' | 'localOnly' | 'problem';

export interface DesignerBranchItem {
	readonly name: string;
	readonly path: readonly string[];
	readonly status: DesignerBranchStatus;
	readonly isCurrent: boolean;
	readonly isDefault: boolean;
	readonly cloudProblem?: DesignerCloudProblem;
}

export interface DesignerCloudProblem {
	readonly message: string;
}

export interface DesignerBranchTreeNode {
	readonly name: string;
	readonly path: readonly string[];
	readonly branch?: DesignerBranchItem;
	readonly children: readonly DesignerBranchTreeNode[];
}

export interface DesignerBranchState {
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

export interface DesignerBranchSetup {
	readonly reason: 'notGitRepository';
}

export type DesignerSyncState = 'idle' | 'saving' | 'pushing' | 'synced' | 'blocked' | 'problem';

export interface DesignerSyncStatus {
	readonly state: DesignerSyncState;
	readonly message?: string;
	readonly previousBranch?: string;
	readonly targetBranch?: string;
	readonly targetRepoPath?: string;
	readonly agentPrompt?: string;
}

export interface DesignerBranchCheckoutResult {
	readonly state: DesignerBranchState;
	readonly sync?: DesignerSyncStatus;
	readonly blocked?: {
		readonly reason: 'dirtyWorkTree' | 'worktreeBranchAlreadyUsed' | 'branchNameRequired' | 'mergeConflicts' | 'noRemote' | 'pushRejected' | 'authRequired' | 'saveFailed' | 'switchFailed' | 'unsafeHostRepository';
		readonly message: string;
	};
}

export interface DesignerRepoSwitchResult {
	readonly state: DesignerRepoState;
	readonly sync?: DesignerSyncStatus;
	readonly blocked?: {
		readonly reason: 'branchNameRequired' | 'mergeConflicts' | 'noRemote' | 'pushRejected' | 'authRequired' | 'saveFailed' | 'switchFailed' | 'unsafeHostRepository';
		readonly message: string;
	};
}

export interface DesignerRepoRemoveResult {
	readonly state: DesignerRepoState;
}

export function shouldShowDesignerEmptyRepoFtux(state: DesignerRepoState | undefined): state is DesignerRepoState {
	return !!state && state.repos.length === 0;
}

export function shouldShowDesignerStartupRepoPicker(state: DesignerRepoState | undefined): state is DesignerRepoState {
	return !!state && state.repos.length > 0 && !state.currentRepoPath && state.repos.every(repo => !repo.isCurrent);
}

export function shouldSuppressDesignerStartupWelcome(state: DesignerRepoState | undefined): state is DesignerRepoState {
	return shouldShowDesignerEmptyRepoFtux(state) || shouldShowDesignerStartupRepoPicker(state);
}

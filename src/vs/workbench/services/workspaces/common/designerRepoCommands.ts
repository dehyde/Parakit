/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const ShowDesignerAddRepoCommandId = 'workbench.action.parakit.addRepo';
export const GetDesignerReposStateCommandId = '_designerRepos.getState';
export const AddDesignerRepoSourceCommandId = '_designerRepos.addSource';

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

export function shouldShowDesignerEmptyRepoFtux(state: DesignerRepoState | undefined): boolean {
	return !!state && state.repos.length === 0;
}

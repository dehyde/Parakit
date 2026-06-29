/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type DesignerWorkspaceContextReason = 'checkout' | 'create' | 'repoSwitch' | 'startup';

export interface DesignerWorkspaceContext {
	readonly repoPath: string;
	readonly branchName: string | undefined;
	readonly previousBranchName?: string;
	readonly reason: DesignerWorkspaceContextReason;
}

export function createDesignerWorkspaceContext(context: DesignerWorkspaceContext): DesignerWorkspaceContext {
	return {
		repoPath: context.repoPath,
		branchName: context.branchName,
		previousBranchName: context.previousBranchName,
		reason: context.reason
	};
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface DesignerWorkspaceRepositoryCandidate {
	readonly root: string;
	readonly rootRealPath?: string;
	readonly isHidden: boolean;
	readonly kind: string;
}

function pathEquals(first: string, second: string): boolean {
	return normalizePath(first) === normalizePath(second);
}

function normalizePath(value: string): string {
	return value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

export function getDesignerWorkspaceRepository<T extends DesignerWorkspaceRepositoryCandidate>(
	repositories: readonly T[],
	workspaceRoot: string | undefined,
	workspaceRootRealPath?: string
): T | undefined {
	if (!workspaceRoot) {
		return undefined;
	}

	return repositories.find(repository => {
		if (repository.isHidden || (repository.kind !== 'repository' && repository.kind !== 'submodule')) {
			return false;
		}

		if (pathEquals(repository.root, workspaceRoot)) {
			return true;
		}

		if (workspaceRootRealPath && pathEquals(repository.rootRealPath ?? repository.root, workspaceRootRealPath)) {
			return true;
		}

		return false;
	});
}

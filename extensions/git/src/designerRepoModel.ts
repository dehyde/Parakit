/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface DesignerKnownRepo {
	readonly path: string;
	readonly name: string;
	readonly url?: string;
}

export type DesignerRepoSource =
	| { readonly kind: 'remote'; readonly url: string }
	| { readonly kind: 'localPath'; readonly path: string };

export type DesignerRepoSwitchMode = 'alreadyOpen' | 'saveThenSwitch' | 'switchWithoutSaving';

interface MergeDesignerKnownReposOptions {
	readonly currentRepo?: DesignerKnownRepo;
	readonly storedRepos: readonly { readonly path?: string; readonly name?: string; readonly url?: string }[];
	readonly discoveredRepos: readonly DesignerKnownRepo[];
	readonly repoToInclude?: DesignerKnownRepo;
	readonly hiddenRepoPaths: readonly string[];
}

interface DesignerRepoSwitchModeOptions {
	readonly currentRepoPath?: string;
	readonly targetRepoPath: string;
	readonly currentRepositoryAvailable: boolean;
	readonly currentRepositoryIsHost: boolean;
}

export function mergeDesignerKnownRepos(options: MergeDesignerKnownReposOptions): DesignerKnownRepo[] {
	const repos: DesignerKnownRepo[] = [];

	appendRepo(repos, options.currentRepo, options.hiddenRepoPaths, true);

	for (const repo of options.storedRepos) {
		if (!repo.path) {
			continue;
		}

		appendRepo(repos, {
			path: repo.path,
			name: repo.name || getDesignerRepoLabel(repo.path),
			url: repo.url
		}, options.hiddenRepoPaths, false);
	}

	for (const repo of options.discoveredRepos) {
		appendRepo(repos, repo, options.hiddenRepoPaths, false);
	}

	appendRepo(repos, options.repoToInclude, options.hiddenRepoPaths, false);

	return repos;
}

export function getDesignerRepoSwitchMode(options: DesignerRepoSwitchModeOptions): DesignerRepoSwitchMode {
	if (options.currentRepoPath && pathEquals(options.currentRepoPath, options.targetRepoPath)) {
		return 'alreadyOpen';
	}

	if (!options.currentRepoPath || options.currentRepositoryIsHost || !options.currentRepositoryAvailable) {
		return 'switchWithoutSaving';
	}

	return 'saveThenSwitch';
}

export function getDesignerRepoLabel(repoPath: string): string {
	return repoPath.split(/[\\/]/).filter(Boolean).at(-1) || repoPath;
}

export function parseDesignerRepoSource(source: string): DesignerRepoSource {
	const trimmed = source.trim();
	if (isRemoteRepoSource(trimmed)) {
		return { kind: 'remote', url: trimmed };
	}

	return { kind: 'localPath', path: trimTrailingSeparators(trimmed) };
}

function appendRepo(repos: DesignerKnownRepo[], repo: DesignerKnownRepo | undefined, hiddenRepoPaths: readonly string[], forceInclude: boolean): void {
	if (!repo?.path) {
		return;
	}

	if (!forceInclude && hiddenRepoPaths.some(hiddenPath => pathEquals(hiddenPath, repo.path))) {
		return;
	}

	const existingIndex = repos.findIndex(existing => pathEquals(existing.path, repo.path));
	if (existingIndex !== -1) {
		const existing = repos[existingIndex];
		repos[existingIndex] = {
			path: existing.path,
			name: existing.name || repo.name,
			url: existing.url ?? repo.url
		};
		return;
	}

	repos.push(repo);
}

function pathEquals(first: string, second: string): boolean {
	return normalizePath(first) === normalizePath(second);
}

function normalizePath(repoPath: string): string {
	return repoPath.replace(/\\/g, '/').toLowerCase();
}

function isRemoteRepoSource(source: string): boolean {
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(source)) {
		return true;
	}

	return /^[^@\s]+@[^:\s]+:.+/.test(source);
}

function trimTrailingSeparators(value: string): string {
	return value.replace(/[\\/]+$/, '');
}

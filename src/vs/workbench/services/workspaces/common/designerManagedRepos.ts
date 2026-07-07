/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { isWindows } from '../../../../base/common/platform.js';
import { dirname, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';

export const DESIGNER_MANAGED_REPOS_MANIFEST_VERSION = 1;
export const DESIGNER_STATE_VERSION = 1;

export interface DesignerManagedRepoEntry {
	readonly path: string;
	readonly name?: string;
	readonly url?: string;
	readonly addedAt: number;
}

export interface DesignerManagedReposManifest {
	readonly version: 1;
	readonly repos: readonly DesignerManagedRepoEntry[];
}

export interface DesignerManagedRepoInput {
	readonly path: string;
	readonly name?: string;
	readonly url?: string;
	readonly addedAt?: number;
}

export interface DesignerState {
	readonly version: 1;
	readonly lastActiveRepoPath?: string;
	readonly lastActiveBranchName?: string;
	readonly pendingStartupRestore?: DesignerPendingStartupRestore;
}

export interface DesignerPendingStartupRestore {
	readonly repoPath: string;
	readonly branchName?: string;
	readonly createdAt: number;
}

export function getDesignerReposRoot(userHome: URI): URI {
	return joinPath(userHome, 'repos');
}

export function getDesignerManagedReposManifestResource(userHome: URI): URI {
	return joinPath(getDesignerReposRoot(userHome), '.designer', 'managed-repos.json');
}

export function getDesignerStateResource(userHome: URI): URI {
	return joinPath(getDesignerReposRoot(userHome), '.designer', 'state.json');
}

export function parseDesignerManagedReposManifest(raw: string | undefined): DesignerManagedReposManifest {
	if (!raw) {
		return createEmptyDesignerManagedReposManifest();
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return createEmptyDesignerManagedReposManifest();
	}

	if (!isObject(parsed) || parsed.version !== DESIGNER_MANAGED_REPOS_MANIFEST_VERSION || !Array.isArray(parsed.repos)) {
		return createEmptyDesignerManagedReposManifest();
	}

	const repos: DesignerManagedRepoEntry[] = [];
	for (const entry of parsed.repos) {
		if (!isObject(entry) || typeof entry.path !== 'string' || entry.path.trim().length === 0 || typeof entry.addedAt !== 'number') {
			continue;
		}

		repos.push({
			path: trimTrailingSeparators(entry.path.trim()),
			name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : undefined,
			url: typeof entry.url === 'string' && entry.url.trim() ? entry.url.trim() : undefined,
			addedAt: entry.addedAt
		});
	}

	return { version: DESIGNER_MANAGED_REPOS_MANIFEST_VERSION, repos };
}

export function upsertDesignerManagedRepo(manifest: DesignerManagedReposManifest, input: DesignerManagedRepoInput): DesignerManagedReposManifest {
	const repoPath = trimTrailingSeparators(input.path.trim());
	if (!repoPath) {
		return manifest;
	}

	const normalizedRepoPath = normalizeManagedRepoPath(repoPath);
	const existing = manifest.repos.find(repo => normalizeManagedRepoPath(repo.path) === normalizedRepoPath);
	const updated: DesignerManagedRepoEntry = {
		path: repoPath,
		name: input.name?.trim() || existing?.name,
		url: input.url?.trim() || existing?.url,
		addedAt: existing?.addedAt ?? input.addedAt ?? Date.now()
	};

	return {
		version: DESIGNER_MANAGED_REPOS_MANIFEST_VERSION,
		repos: existing
			? manifest.repos.map(repo => normalizeManagedRepoPath(repo.path) === normalizedRepoPath ? updated : repo)
			: [...manifest.repos, updated]
	};
}

export function parseDesignerState(raw: string | undefined): DesignerState {
	if (!raw) {
		return createEmptyDesignerState();
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return createEmptyDesignerState();
	}

	if (!isObject(parsed) || parsed.version !== DESIGNER_STATE_VERSION) {
		return createEmptyDesignerState();
	}

	const lastActiveRepoPath = typeof parsed.lastActiveRepoPath === 'string' && parsed.lastActiveRepoPath.trim()
		? trimTrailingSeparators(parsed.lastActiveRepoPath.trim())
		: undefined;
	const lastActiveBranchName = typeof parsed.lastActiveBranchName === 'string' && parsed.lastActiveBranchName.trim()
		? parsed.lastActiveBranchName.trim()
		: undefined;
	const pendingStartupRestore = parseDesignerPendingStartupRestore(parsed.pendingStartupRestore);

	return createDesignerState({
		version: DESIGNER_STATE_VERSION,
		lastActiveRepoPath,
		lastActiveBranchName: lastActiveRepoPath ? lastActiveBranchName : undefined,
		pendingStartupRestore
	});
}

export function updateDesignerLastActiveRepo(state: DesignerState, repoPath: string, branchName?: string): DesignerState {
	const lastActiveRepoPath = trimTrailingSeparators(repoPath.trim());
	if (!lastActiveRepoPath) {
		return state;
	}

	return createDesignerState({
		version: DESIGNER_STATE_VERSION,
		lastActiveRepoPath,
		lastActiveBranchName: branchName?.trim() || undefined,
		pendingStartupRestore: state.pendingStartupRestore
	});
}

export function markDesignerStartupRestorePending(state: DesignerState, createdAt = Date.now()): DesignerState {
	if (!state.lastActiveRepoPath) {
		return state;
	}

	return createDesignerState({
		version: DESIGNER_STATE_VERSION,
		lastActiveRepoPath: state.lastActiveRepoPath,
		lastActiveBranchName: state.lastActiveBranchName,
		pendingStartupRestore: createDesignerPendingStartupRestore({
			repoPath: state.lastActiveRepoPath,
			branchName: state.lastActiveBranchName,
			createdAt
		})
	});
}

export function clearDesignerStartupRestorePending(state: DesignerState): DesignerState {
	return createDesignerState({
		version: DESIGNER_STATE_VERSION,
		lastActiveRepoPath: state.lastActiveRepoPath,
		lastActiveBranchName: state.lastActiveBranchName
	});
}

export function getDesignerManagedRepoForFolder(manifest: DesignerManagedReposManifest, folderPath: string, appRoot: string | undefined): DesignerManagedRepoEntry | undefined {
	const normalizedFolderPath = normalizeManagedRepoPath(folderPath);
	const normalizedAppRoot = appRoot ? normalizeManagedRepoPath(appRoot) : undefined;

	if (normalizedAppRoot && pathsOverlap(normalizedFolderPath, normalizedAppRoot)) {
		return undefined;
	}

	let bestMatch: DesignerManagedRepoEntry | undefined;
	for (const repo of manifest.repos) {
		const normalizedRepoPath = normalizeManagedRepoPath(repo.path);
		if (!normalizedRepoPath || normalizedAppRoot && pathsOverlap(normalizedRepoPath, normalizedAppRoot)) {
			continue;
		}

		if (!isEqualOrParentPath(normalizedFolderPath, normalizedRepoPath)) {
			continue;
		}

		if (!bestMatch || normalizedRepoPath.length > normalizeManagedRepoPath(bestMatch.path).length) {
			bestMatch = repo;
		}
	}

	return bestMatch;
}

export function isDesignerManagedRepoAllowed(repoPath: string, appRoot: string | undefined): boolean {
	const normalizedRepoPath = normalizeManagedRepoPath(repoPath);
	const normalizedAppRoot = appRoot ? normalizeManagedRepoPath(appRoot) : undefined;
	return !!normalizedRepoPath && !(normalizedAppRoot && pathsOverlap(normalizedRepoPath, normalizedAppRoot));
}

export async function readDesignerManagedReposManifest(fileService: IFileService, userHome: URI | undefined): Promise<DesignerManagedReposManifest> {
	if (!userHome) {
		return createEmptyDesignerManagedReposManifest();
	}

	try {
		const content = await fileService.readFile(getDesignerManagedReposManifestResource(userHome));
		return parseDesignerManagedReposManifest(content.value.toString());
	} catch {
		return createEmptyDesignerManagedReposManifest();
	}
}

export async function readDesignerState(fileService: IFileService, userHome: URI | undefined): Promise<DesignerState> {
	if (!userHome) {
		return createEmptyDesignerState();
	}

	try {
		const content = await fileService.readFile(getDesignerStateResource(userHome));
		return parseDesignerState(content.value.toString());
	} catch {
		return createEmptyDesignerState();
	}
}

export async function writeDesignerManagedReposManifest(fileService: IFileService, userHome: URI, manifest: DesignerManagedReposManifest): Promise<void> {
	const manifestResource = getDesignerManagedReposManifestResource(userHome);
	await fileService.createFolder(dirname(manifestResource));
	await fileService.writeFile(manifestResource, VSBuffer.fromString(JSON.stringify(manifest, undefined, '\t')));
}

export async function writeDesignerState(fileService: IFileService, userHome: URI, state: DesignerState): Promise<void> {
	const stateResource = getDesignerStateResource(userHome);
	await fileService.createFolder(dirname(stateResource));
	await fileService.writeFile(stateResource, VSBuffer.fromString(JSON.stringify(state, undefined, '\t')));
}

function createEmptyDesignerManagedReposManifest(): DesignerManagedReposManifest {
	return { version: DESIGNER_MANAGED_REPOS_MANIFEST_VERSION, repos: [] };
}

function createEmptyDesignerState(): DesignerState {
	return { version: DESIGNER_STATE_VERSION };
}

function createDesignerState(state: DesignerState): DesignerState {
	return {
		version: DESIGNER_STATE_VERSION,
		...(state.lastActiveRepoPath ? { lastActiveRepoPath: state.lastActiveRepoPath } : {}),
		...(state.lastActiveRepoPath && state.lastActiveBranchName ? { lastActiveBranchName: state.lastActiveBranchName } : {}),
		...(state.pendingStartupRestore ? { pendingStartupRestore: state.pendingStartupRestore } : {})
	};
}

function parseDesignerPendingStartupRestore(value: unknown): DesignerPendingStartupRestore | undefined {
	if (!isObject(value) || typeof value.repoPath !== 'string' || !value.repoPath.trim() || typeof value.createdAt !== 'number') {
		return undefined;
	}

	return createDesignerPendingStartupRestore({
		repoPath: trimTrailingSeparators(value.repoPath.trim()),
		branchName: typeof value.branchName === 'string' && value.branchName.trim() ? value.branchName.trim() : undefined,
		createdAt: value.createdAt
	});
}

function createDesignerPendingStartupRestore(state: DesignerPendingStartupRestore): DesignerPendingStartupRestore {
	return {
		repoPath: state.repoPath,
		...(state.branchName ? { branchName: state.branchName } : {}),
		createdAt: state.createdAt
	};
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function normalizeManagedRepoPath(value: string): string {
	const trimmed = trimTrailingSeparators(value.trim().replace(/\\/g, '/'));
	return isWindows ? trimmed.toLowerCase() : trimmed;
}

function trimTrailingSeparators(value: string): string {
	return value.replace(/\/+$/, '');
}

function pathsOverlap(left: string, right: string): boolean {
	return isEqualOrParentPath(left, right) || isEqualOrParentPath(right, left);
}

function isEqualOrParentPath(candidate: string, parent: string): boolean {
	if (candidate === parent) {
		return true;
	}

	return candidate.startsWith(`${parent}/`);
}

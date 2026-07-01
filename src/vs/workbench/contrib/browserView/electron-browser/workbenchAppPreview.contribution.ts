/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, RunOnceScheduler } from '../../../../base/common/async.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { $, addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { hash } from '../../../../base/common/hash.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { dirname, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { BrowserViewKind, IBrowserViewLoadingEvent, IBrowserViewLoadError } from '../../../../platform/browserView/common/browserView.js';
import { IPlaywrightService } from '../../../../platform/browserView/common/playwrightService.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { FileChangeType, IFileService } from '../../../../platform/files/common/files.js';
import { ILocalGitService } from '../../../../platform/git/common/localGitService.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { DesignerAddRepoChoice, GetDesignerReposStateCommandId, shouldShowDesignerEmptyRepoFtux, ShowDesignerAddRepoCommandId, type DesignerRepoState } from '../../../services/workspaces/common/designerRepoCommands.js';
import { CountTokensCallback, ILanguageModelToolsService, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, IPreparedToolInvocation, ToolDataSource, ToolProgress } from '../../chat/common/tools/languageModelToolsService.js';
import { IChatSessionsService } from '../../chat/common/chatSessionsService.js';
import { ITerminalInstance, ITerminalService } from '../../terminal/browser/terminal.js';
import { NavigateWorkbenchAppPreviewHomeCommandId, PickWorkbenchAppPreviewHomeCommandId } from '../common/appPreviewCommands.js';
import { adaptWorkbenchAppPreviewUrlToPort, applyWorkbenchAppPreviewDevPort, getDefaultPreviewUrl, getPreviewBranchUrl, getPreviewUrlForBranch, getWorkbenchAppPreviewClaudeReconciliationCommands, getWorkbenchAppPreviewDevConfigFixedPort, getWorkbenchAppPreviewHealthFetchMode, getWorkbenchAppPreviewStartupPageKey, hasWorkbenchAppPreviewPortTemplate, IPreviewConfig, IResolvedWorkbenchAppPreviewDevConfig, isWorkbenchAppPreviewLoopbackUrl, isWorkbenchAppPreviewManagedLocalUrl, isWorkbenchAppPreviewPortConflict, isWorkbenchAppPreviewUrlForBranch, IWorkbenchAppPreviewBranchRuntime, IWorkbenchAppPreviewDevConfig, IWorkbenchAppPreviewEnv, IWorkbenchAppPreviewHomeTarget, normalizeWorkbenchAppPreviewLoopbackUrl, observeWorkbenchAppPreviewBranch, parseWorkbenchAppPreviewEnv, resolveWorkbenchAppPreviewAdvertisedUrl, resolveWorkbenchAppPreviewDevConfig, resolveWorkbenchAppPreviewHeuristicDevConfig, resolveWorkbenchAppPreviewHomeTargets, resolveWorkbenchAppPreviewPreferredUrl, resolveWorkbenchAppPreviewStaticHtmlConfig, shouldFallbackFromWorkbenchAppPreviewDevConfig, shouldForceNavigateWorkbenchAppPreview, shouldNavigateWorkbenchAppPreview, shouldRecoverWorkbenchAppPreviewLoadError, shouldRestartWorkbenchAppPreviewAfterHealthFailures } from '../common/appPreviewConfig.js';
import { createWorkbenchAppPreviewStartupDataUrl, getWorkbenchAppPreviewStartupTitle, IWorkbenchAppPreviewStartupPageState, IWorkbenchAppPreviewStartupStage, WorkbenchAppPreviewStartupPhase, WORKBENCH_APP_PREVIEW_STARTUP_HEALTH_TIMEOUT as PREVIEW_STARTUP_HEALTH_TIMEOUT } from '../common/appPreviewStartupPage.js';
import { extractHttpUrls, extractLocalhostUrls, normalizeHttpUrl } from '../common/appPreviewUrl.js';
import { BrowserEditorInput } from '../common/browserEditorInput.js';
import { IBrowserViewWorkbenchService } from '../common/browserView.js';
import { playwrightInvokeRaw } from './tools/browserToolHelpers.js';

const APP_PREVIEW_ID_PREFIX = 'workbench-app-preview-';
const APP_PREVIEW_EMPTY_REPO_ID = 'workbench-app-preview-empty-repo';
const APP_PREVIEW_URL_STORAGE_KEY = 'workbench.appPreview.url';
const APP_PREVIEW_OVERRIDES_STORAGE_KEY = 'workbench.appPreview.overrides';
const APP_PREVIEW_BRANCH_RUNTIME_STORAGE_KEY = 'workbench.appPreview.branchRuntime';
const PREVIEW_CONFIG_PATH = '.designer/preview.json';
const DEV_CONFIG_PATH = '.designer/dev.json';
const WORKSPACE_BRANCH_POLL_INTERVAL = 2000;
const SERVER_HEALTH_POLL_INTERVAL = 5000;
const STARTUP_ANCHOR_DELAYS = [0, 250, 1000, 2500];
const AGENT_LOG_INITIAL_READ_LIMIT = 64 * 1024;
const AGENT_LOG_SCAN_DELAY = 500;
const APP_PREVIEW_PLAYWRIGHT_SESSION_ID = 'workbench-app-preview';
const MAX_PORT_CONFLICT_RECOVERY_ATTEMPTS = 3;
const MAX_BACKGROUND_HEALTH_FAILURES = 3;
const MAX_BACKGROUND_RESTART_ATTEMPTS = 3;
const PREVIEW_STARTUP_HEALTH_INTERVAL = 1_000;
const PREVIEW_HEALTH_FETCH_TIMEOUT = 5_000;
const PREVIEW_SERVER_OUTPUT_LIMIT = 24 * 1024;

export const ConfigureWorkbenchAppPreviewUrlCommandId = 'workbench.action.agentSessions.configureAppPreviewUrl';
export const ClearWorkbenchAppPreviewOverrideCommandId = 'workbench.action.appPreview.clearOverride';
export const EditWorkbenchAppPreviewProjectUrlCommandId = 'workbench.action.appPreview.editProjectUrl';
export const GetWorkbenchAppPreviewStatusCommandId = 'workbench.action.appPreview.getStatus';
export const RunWorkbenchAppPreviewServerCommandId = 'workbench.action.appPreview.runServer';
export const RestartWorkbenchAppPreviewServerCommandId = 'workbench.action.appPreview.restartServer';
export const NavigateWorkbenchAppPreviewCommandId = 'workbench.action.appPreview.navigate';
export { NavigateWorkbenchAppPreviewHomeCommandId, PickWorkbenchAppPreviewHomeCommandId };
export const ReadWorkbenchAppPreviewCommandId = 'workbench.action.appPreview.readPage';
export const ScreenshotWorkbenchAppPreviewCommandId = 'workbench.action.appPreview.screenshot';
export const ClickWorkbenchAppPreviewCommandId = 'workbench.action.appPreview.click';
export const TypeWorkbenchAppPreviewCommandId = 'workbench.action.appPreview.type';
export const PreflightDesignerWorkspaceContextCommandId = '_designerWorkspaceContext.preflight';
export const DesignerWorkspaceContextChangedCommandId = '_designerWorkspaceContext.didChange';

const AppPreviewToolReferenceName = {
	RunPreviewServer: 'run_preview_server',
	GetPreviewStatus: 'get_preview_status',
	RestartPreviewServer: 'restart_preview_server',
	PromotePreviewUrl: 'promote_preview_url',
} as const;

interface IAppPreviewRepoOverrides {
	default?: string;
	branches?: Record<string, string>;
}

interface IAppPreviewOverrides {
	[repo: string]: IAppPreviewRepoOverrides | undefined;
}

interface IDesignerWorkspaceContext {
	repoPath: string;
	branchName?: string;
	previousBranchName?: string;
	reason: 'checkout' | 'create' | 'repoSwitch' | 'startup';
}

interface IDesignerWorkspaceContextPreflight {
	needsConfirmation: boolean;
	message?: string;
}

interface IAppPreviewBranchRuntimeStore {
	[repo: string]: Record<string, IWorkbenchAppPreviewBranchRuntime> | undefined;
}

type PreviewServerState = 'stopped' | 'starting' | 'running' | 'failed';
type PreviewHealthState = 'unknown' | 'healthy' | 'unhealthy';

interface IPreviewServerStatus {
	state: PreviewServerState;
	health: PreviewHealthState;
	url?: string;
	healthUrl?: string;
	branch?: string;
	command?: string;
	message?: string;
	needsConfigurationPrompt?: boolean;
}

interface IAppPreviewCommandStatus extends IPreviewServerStatus {
	previewAvailable: boolean;
	pageId?: string;
	title?: string;
	currentUrl?: string;
}

type PreviewStartupPhase = WorkbenchAppPreviewStartupPhase;
type IPreviewStartupStage = IWorkbenchAppPreviewStartupStage;
type IPreviewStartupPageState = IWorkbenchAppPreviewStartupPageState;

interface IAppPreviewNavigateCommandArgs {
	url?: string;
}

interface IAppPreviewClickCommandArgs {
	ref?: string;
	selector?: string;
	element?: string;
	doubleClick?: boolean;
	dblClick?: boolean;
	button?: 'left' | 'right' | 'middle';
}

interface IAppPreviewTypeCommandArgs {
	text?: string;
	key?: string;
	ref?: string;
	selector?: string;
	element?: string;
	submit?: boolean;
}

interface IAppPreviewScreenshotCommandArgs {
	ref?: string;
	selector?: string;
	element?: string;
	scrollIntoViewIfNeeded?: boolean;
}

function getWorkspaceRoot(workspaceContextService: IWorkspaceContextService): URI | undefined {
	return workspaceContextService.getWorkspace().folders[0]?.uri;
}

function getWorkspacePreviewId(root: URI): string {
	return `${APP_PREVIEW_ID_PREFIX}${hash(root.toString()).toString(16)}`;
}

function getUriKey(uri: URI | undefined): string | undefined {
	return uri?.fsPath.toLowerCase();
}

async function readPreviewConfig(fileService: IFileService, repository: URI): Promise<IPreviewConfig> {
	try {
		const content = await fileService.readFile(joinPath(repository, PREVIEW_CONFIG_PATH));
		return JSON.parse(content.value.toString()) as IPreviewConfig;
	} catch {
		return {};
	}
}

async function readDevConfig(fileService: IFileService, repository: URI): Promise<IWorkbenchAppPreviewDevConfig | undefined> {
	try {
		const content = await fileService.readFile(joinPath(repository, DEV_CONFIG_PATH));
		const parsed = JSON.parse(content.value.toString());
		return typeof parsed === 'object' && parsed !== null ? parsed as IWorkbenchAppPreviewDevConfig : undefined;
	} catch {
		return undefined;
	}
}

async function readPreviewEnv(fileService: IFileService, repository: URI): Promise<IWorkbenchAppPreviewEnv> {
	let env: IWorkbenchAppPreviewEnv = {};
	for (const file of ['.env', '.env.development', '.env.local', '.env.development.local']) {
		try {
			const content = await fileService.readFile(joinPath(repository, file));
			env = { ...env, ...parseWorkbenchAppPreviewEnv(content.value.toString()) };
		} catch {
			// Environment files are optional.
		}
	}

	return env;
}

function isHttpPreviewTarget(url: string | undefined): boolean {
	if (!url) {
		return false;
	}

	try {
		const parsed = new URL(url.replace(/\$\{PORT\}/g, '4173'));
		return parsed.protocol === 'http:' || parsed.protocol === 'https:';
	} catch {
		return false;
	}
}

async function resolveHeuristicDevConfig(fileService: IFileService, repository: URI, url?: string): Promise<IResolvedWorkbenchAppPreviewDevConfig | undefined> {
	const env = await readPreviewEnv(fileService, repository);
	try {
		const content = await fileService.readFile(joinPath(repository, 'package.json'));
		const parsed = JSON.parse(content.value.toString());
		const scripts = typeof parsed === 'object' && parsed !== null ? (parsed as { scripts?: Record<string, unknown> }).scripts : undefined;
		const npmConfig = resolveWorkbenchAppPreviewHeuristicDevConfig(scripts, isHttpPreviewTarget(url) ? url : undefined, env);
		if (npmConfig) {
			return npmConfig;
		}
	} catch {
		// Continue to static HTML detection when package.json is missing or invalid.
	}

	for (const dir of ['', 'docs', 'public', 'dist', 'build', 'site', 'out']) {
		const htmlPath = dir ? joinPath(repository, dir, 'index.html') : joinPath(repository, 'index.html');
		try {
			await fileService.stat(htmlPath);
			return resolveWorkbenchAppPreviewStaticHtmlConfig(dir || '.');
		} catch {
			// Try the next well-known static output directory.
		}
	}

	return undefined;
}

function parsePreviewOverrides(raw: string | undefined): IAppPreviewOverrides {
	if (!raw) {
		return {};
	}

	try {
		const parsed = JSON.parse(raw);
		return typeof parsed === 'object' && parsed !== null ? parsed : {};
	} catch {
		return {};
	}
}

function getRepoOverride(overrides: IAppPreviewOverrides, repo: URI): IAppPreviewRepoOverrides {
	return overrides[repo.toString()] ?? {};
}

function storePreviewOverrides(storageService: IStorageService, overrides: IAppPreviewOverrides): void {
	if (Object.keys(overrides).length === 0) {
		storageService.remove(APP_PREVIEW_OVERRIDES_STORAGE_KEY, StorageScope.APPLICATION);
		return;
	}

	storageService.store(APP_PREVIEW_OVERRIDES_STORAGE_KEY, JSON.stringify(overrides), StorageScope.APPLICATION, StorageTarget.USER);
}

function parseBranchRuntimeStore(raw: string | undefined): IAppPreviewBranchRuntimeStore {
	if (!raw) {
		return {};
	}

	try {
		const parsed = JSON.parse(raw);
		return typeof parsed === 'object' && parsed !== null ? parsed : {};
	} catch {
		return {};
	}
}

function getBranchRuntimeKey(branchName: string | undefined): string {
	return branchName || '__detached__';
}

function getBranchRuntime(storageService: IStorageService, repo: URI, branchName: string | undefined): IWorkbenchAppPreviewBranchRuntime {
	const runtime = parseBranchRuntimeStore(storageService.get(APP_PREVIEW_BRANCH_RUNTIME_STORAGE_KEY, StorageScope.APPLICATION));
	return runtime[repo.toString()]?.[getBranchRuntimeKey(branchName)] ?? {};
}

function storeBranchRuntime(storageService: IStorageService, repo: URI, branchName: string | undefined, value: IWorkbenchAppPreviewBranchRuntime): void {
	const runtime = parseBranchRuntimeStore(storageService.get(APP_PREVIEW_BRANCH_RUNTIME_STORAGE_KEY, StorageScope.APPLICATION));
	const repoKey = repo.toString();
	runtime[repoKey] = {
		...runtime[repoKey],
		[getBranchRuntimeKey(branchName)]: value
	};
	storageService.store(APP_PREVIEW_BRANCH_RUNTIME_STORAGE_KEY, JSON.stringify(runtime), StorageScope.APPLICATION, StorageTarget.USER);
}

function setLocalPreviewOverride(storageService: IStorageService, repo: URI, branchName: string | undefined, url: string): void {
	const overrides = parsePreviewOverrides(storageService.get(APP_PREVIEW_OVERRIDES_STORAGE_KEY, StorageScope.APPLICATION));
	const repoKey = repo.toString();
	const repoOverrides: IAppPreviewRepoOverrides = { ...overrides[repoKey] };
	if (branchName) {
		repoOverrides.branches = { ...repoOverrides.branches, [branchName]: url };
	} else {
		repoOverrides.default = url;
	}
	overrides[repoKey] = repoOverrides;
	storePreviewOverrides(storageService, overrides);
}

function clearLocalPreviewOverride(storageService: IStorageService, repo: URI, branchName: string | undefined): void {
	const overrides = parsePreviewOverrides(storageService.get(APP_PREVIEW_OVERRIDES_STORAGE_KEY, StorageScope.APPLICATION));
	const repoKey = repo.toString();
	const repoOverrides: IAppPreviewRepoOverrides = { ...overrides[repoKey] };
	if (branchName) {
		repoOverrides.branches = { ...repoOverrides.branches };
		delete repoOverrides.branches[branchName];
		if (Object.keys(repoOverrides.branches).length === 0) {
			delete repoOverrides.branches;
		}
	} else {
		delete repoOverrides.default;
		storageService.remove(APP_PREVIEW_URL_STORAGE_KEY, StorageScope.WORKSPACE);
	}

	if (!repoOverrides.default && !repoOverrides.branches) {
		delete overrides[repoKey];
	} else {
		overrides[repoKey] = repoOverrides;
	}
	storePreviewOverrides(storageService, overrides);
}

function clearAllLocalPreviewOverrides(storageService: IStorageService, repo: URI): void {
	const overrides = parsePreviewOverrides(storageService.get(APP_PREVIEW_OVERRIDES_STORAGE_KEY, StorageScope.APPLICATION));
	delete overrides[repo.toString()];
	storageService.remove(APP_PREVIEW_URL_STORAGE_KEY, StorageScope.WORKSPACE);
	storePreviewOverrides(storageService, overrides);
}

async function resolveCurrentBranch(localGitService: ILocalGitService, root: URI): Promise<string | undefined> {
	try {
		return await localGitService.currentBranch(root.fsPath);
	} catch {
		return undefined;
	}
}

async function writeProjectPreviewUrl(fileService: IFileService, repository: URI, branchName: string | undefined, url: string): Promise<void> {
	const config = await readPreviewConfig(fileService, repository);
	const updated: IPreviewConfig = { ...config };
	if (branchName) {
		updated.branches = { ...updated.branches, [branchName]: url };
	} else {
		updated.default = url;
	}

	const resource = joinPath(repository, PREVIEW_CONFIG_PATH);
	await fileService.createFolder(dirname(resource));
	await fileService.writeFile(resource, VSBuffer.fromString(JSON.stringify(updated, undefined, '\t')));
}

function normalizePreviewUrlTemplate(value: string): string | undefined {
	const trimmed = value.trim();
	if (!trimmed) {
		return undefined;
	}

	const templated = templatePreviewUrlPort(trimmed);
	const validationUrl = templated.replace(/\$\{PORT\}/g, '4173');
	return normalizeHttpUrl(validationUrl) ? templated : undefined;
}

function detectPreviewUrlPort(value: string): { prefix: string; port: string; suffix: string; templatedUrl: string } | undefined {
	const match = /^(https?:\/\/(?:\[[^\]]+\]|[^/?#:]+)):(\d{1,5})(?=\/|[?#]|$)(.*)$/i.exec(value.trim());
	if (!match) {
		return undefined;
	}

	const port = Number(match[2]);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		return undefined;
	}

	return {
		prefix: match[1],
		port: match[2],
		suffix: match[3],
		templatedUrl: `${match[1]}:\${PORT}${match[3]}`
	};
}

function templatePreviewUrlPort(value: string): string {
	return detectPreviewUrlPort(value)?.templatedUrl ?? value.trim();
}

const APP_PREVIEW_STARTUP_ANIMATION_SRC = 'data:image/svg+xml;base64,' +
	'PHN2ZyB3aWR0aD0iOTEiIGhlaWdodD0iMTU5IiB2aWV3Qm94PSIwIDAgOTEgMTU5IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAw' +
	'MC9zdmciPgo8c3R5bGU+CnN2ZyB7IG92ZXJmbG93OiB2aXNpYmxlOyB9CkBrZXlmcmFtZXMga2ZfRWxsaXBzZV8xX3RyYW5zZm9ybV8wIHsKICAwJSB7CiAg' +
	'ICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVgoNTcuNjQ3cHgpIHRyYW5zbGF0ZVkoMTYuNDcxcHgpIHRyYW5zbGF0ZSg0LjExOHB4LCA0LjExOHB4KSBzY2FsZVgo' +
	'MCkgc2NhbGVZKDApIHRyYW5zbGF0ZSgtNC4xMThweCwgLTQuMTE4cHgpOwogIH0KICAxMi44NCUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjog' +
	'Y3ViaWMtYmV6aWVyKDAuNSwgMCwgMC41LCAxKTsKICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWCg1Ny42NDdweCkgdHJhbnNsYXRlWSgxNi40NzFweCkgdHJh' +
	'bnNsYXRlKDQuMTE4cHgsIDQuMTE4cHgpIHNjYWxlWCgwKSBzY2FsZVkoMCkgdHJhbnNsYXRlKC00LjExOHB4LCAtNC4xMThweCk7CiAgfQogIDE2LjQ1JSB7' +
	'CiAgICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVgoNTcuNjQ3cHgpIHRyYW5zbGF0ZVkoMTYuNDcxcHgpIHRyYW5zbGF0ZSg0LjExOHB4LCA0LjExOHB4KSBzY2Fs' +
	'ZVgoMSkgc2NhbGVZKDEpIHRyYW5zbGF0ZSgtNC4xMThweCwgLTQuMTE4cHgpOwogIH0KICA3Ni41MiUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlv' +
	'bjogY3ViaWMtYmV6aWVyKDAuNSwgMCwgMC41LCAxKTsKICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWCg1Ny42NDdweCkgdHJhbnNsYXRlWSgxNi40NzFweCkg' +
	'dHJhbnNsYXRlKDQuMTE4cHgsIDQuMTE4cHgpIHNjYWxlWCgxKSBzY2FsZVkoMSkgdHJhbnNsYXRlKC00LjExOHB4LCAtNC4xMThweCk7CiAgfQogIDgxLjA5' +
	'JSB7CiAgICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVgoNTcuNjQ3cHgpIHRyYW5zbGF0ZVkoMTYuNDcxcHgpIHRyYW5zbGF0ZSg0LjExOHB4LCA0LjExOHB4KSBz' +
	'Y2FsZVgoMCkgc2NhbGVZKDApIHRyYW5zbGF0ZSgtNC4xMThweCwgLTQuMTE4cHgpOwogIH0KICAxMDAlIHsKICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWCg1' +
	'Ny42NDdweCkgdHJhbnNsYXRlWSgxNi40NzFweCkgdHJhbnNsYXRlKDQuMTE4cHgsIDQuMTE4cHgpIHNjYWxlWCgwKSBzY2FsZVkoMCkgdHJhbnNsYXRlKC00' +
	'LjExOHB4LCAtNC4xMThweCk7CiAgfQp9CiNFbGxpcHNlXzEgewogIHRyYW5zZm9ybS1vcmlnaW46IDAgMDsKICBhbmltYXRpb246IGtmX0VsbGlwc2VfMV90' +
	'cmFuc2Zvcm1fMCAzLjAzMzI2cyBsaW5lYXIgaW5maW5pdGU7Cn0KQGtleWZyYW1lcyBrZl9WZWN0b3JfMV9zdWIwX2JvcmRlci13aWR0aF8wIHsKICAwJSB7' +
	'CiAgICBhbmltYXRpb24tdGltaW5nLWZ1bmN0aW9uOiBsaW5lYXI7CiAgICBzdHJva2Utd2lkdGg6IDdweDsKICB9CiAgODUuMyUgewogICAgYW5pbWF0aW9u' +
	'LXRpbWluZy1mdW5jdGlvbjogY3ViaWMtYmV6aWVyKDAuNSwgMCwgMC41LCAxKTsKICAgIHN0cm9rZS13aWR0aDogN3B4OwogIH0KICA5MS40MyUgewogICAg' +
	'YW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogbGluZWFyOwogICAgc3Ryb2tlLXdpZHRoOiAwcHg7CiAgfQogIDkxLjQ5JSB7CiAgICBhbmltYXRpb24tdGlt' +
	'aW5nLWZ1bmN0aW9uOiBsaW5lYXI7CiAgICBzdHJva2Utd2lkdGg6IDBweDsKICB9CiAgOTkuNTklIHsKICAgIGFuaW1hdGlvbi10aW1pbmctZnVuY3Rpb246' +
	'IGxpbmVhcjsKICAgIHN0cm9rZS13aWR0aDogMHB4OwogIH0KICAxMDAlIHsKICAgIHN0cm9rZS13aWR0aDogMHB4OwogIH0KfQpAa2V5ZnJhbWVzIGtmX1Zl' +
	'Y3Rvcl8xX3N1YjBfcGF0aC10cmltXzAgewogIDAlIHsKICAgIHN0cm9rZS1kYXNoYXJyYXk6IDAgMTsKICAgIHN0cm9rZS1kYXNob2Zmc2V0OiAwOwogICAg' +
	'dmlzaWJpbGl0eTogaGlkZGVuOwogIH0KICAyLjYzNyUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogbGluZWFyOwogICAgc3Ryb2tlLWRhc2hh' +
	'cnJheTogMCAxOwogICAgc3Ryb2tlLWRhc2hvZmZzZXQ6IDA7CiAgICB2aXNpYmlsaXR5OiBoaWRkZW47CiAgfQogIDM1LjYwNSUgewogICAgc3Ryb2tlLWRh' +
	'c2hhcnJheTogMSAxOwogICAgc3Ryb2tlLWRhc2hvZmZzZXQ6IDA7CiAgICB2aXNpYmlsaXR5OiB2aXNpYmxlOwogIH0KICA0NS40OTYlIHsKICAgIHN0cm9r' +
	'ZS1kYXNoYXJyYXk6IDEgMTsKICAgIHN0cm9rZS1kYXNob2Zmc2V0OiAwOwogICAgdmlzaWJpbGl0eTogdmlzaWJsZTsKICB9CiAgNjEuMTU1JSB7CiAgICBh' +
	'bmltYXRpb24tdGltaW5nLWZ1bmN0aW9uOiBjdWJpYy1iZXppZXIoMC43NiwgMCwgMC4yNCwgMSk7CiAgICBzdHJva2UtZGFzaGFycmF5OiAxIDE7CiAgICBz' +
	'dHJva2UtZGFzaG9mZnNldDogMDsKICAgIHZpc2liaWxpdHk6IHZpc2libGU7CiAgfQogIDg3LjQ3MiUgewogICAgc3Ryb2tlLWRhc2hhcnJheTogMCAxOwog' +
	'ICAgc3Ryb2tlLWRhc2hvZmZzZXQ6IC0xOwogICAgdmlzaWJpbGl0eTogaGlkZGVuOwogIH0KICAxMDAlIHsKICAgIHN0cm9rZS1kYXNoYXJyYXk6IDAgMTsK' +
	'ICAgIHN0cm9rZS1kYXNob2Zmc2V0OiAtMTsKICAgIHZpc2liaWxpdHk6IGhpZGRlbjsKICB9Cn0KI1ZlY3Rvcl8xX3N1YjAgewogIGFuaW1hdGlvbjoKICAg' +
	'IGtmX1ZlY3Rvcl8xX3N1YjBfYm9yZGVyLXdpZHRoXzAgMy4wMzMyNnMgbGluZWFyIGluZmluaXRlLAogICAga2ZfVmVjdG9yXzFfc3ViMF9wYXRoLXRyaW1f' +
	'MCAzLjAzMzI2cyBsaW5lYXIgaW5maW5pdGU7Cn0KQGtleWZyYW1lcyBrZl9WZWN0b3JfMV9zdWIxX2JvcmRlci13aWR0aF8wIHsKICAwJSB7CiAgICBhbmlt' +
	'YXRpb24tdGltaW5nLWZ1bmN0aW9uOiBsaW5lYXI7CiAgICBzdHJva2Utd2lkdGg6IDdweDsKICB9CiAgODUuMyUgewogICAgYW5pbWF0aW9uLXRpbWluZy1m' +
	'dW5jdGlvbjogY3ViaWMtYmV6aWVyKDAuNSwgMCwgMC41LCAxKTsKICAgIHN0cm9rZS13aWR0aDogN3B4OwogIH0KICA5MS40MyUgewogICAgYW5pbWF0aW9u' +
	'LXRpbWluZy1mdW5jdGlvbjogbGluZWFyOwogICAgc3Ryb2tlLXdpZHRoOiAwcHg7CiAgfQogIDEwMCUgewogICAgc3Ryb2tlLXdpZHRoOiAwcHg7CiAgfQp9' +
	'CkBrZXlmcmFtZXMga2ZfVmVjdG9yXzFfc3ViMV9wYXRoLXRyaW1fMCB7CiAgMCUgewogICAgc3Ryb2tlLWRhc2hhcnJheTogMCAxOwogICAgc3Ryb2tlLWRh' +
	'c2hvZmZzZXQ6IDA7CiAgICB2aXNpYmlsaXR5OiBoaWRkZW47CiAgfQogIDQuNDE4JSB7CiAgICBzdHJva2UtZGFzaGFycmF5OiAwIDE7CiAgICBzdHJva2Ut' +
	'ZGFzaG9mZnNldDogMDsKICAgIHZpc2liaWxpdHk6IGhpZGRlbjsKICB9CiAgNC42MTUlIHsKICAgIGFuaW1hdGlvbi10aW1pbmctZnVuY3Rpb246IGxpbmVh' +
	'cjsKICAgIHN0cm9rZS1kYXNoYXJyYXk6IDAgMTsKICAgIHN0cm9rZS1kYXNob2Zmc2V0OiAwOwogICAgdmlzaWJpbGl0eTogaGlkZGVuOwogIH0KICAzNy41' +
	'ODMlIHsKICAgIHN0cm9rZS1kYXNoYXJyYXk6IDEgMTsKICAgIHN0cm9rZS1kYXNob2Zmc2V0OiAwOwogICAgdmlzaWJpbGl0eTogdmlzaWJsZTsKICB9CiAg' +
	'NDcuNDc0JSB7CiAgICBzdHJva2UtZGFzaGFycmF5OiAxIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogMDsKICAgIHZpc2liaWxpdHk6IHZpc2libGU7CiAg' +
	'fQogIDU2LjYwNiUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogY3ViaWMtYmV6aWVyKDAuNSwgMCwgMC41LCAxKTsKICAgIHN0cm9rZS1kYXNo' +
	'YXJyYXk6IDEgMTsKICAgIHN0cm9rZS1kYXNob2Zmc2V0OiAwOwogICAgdmlzaWJpbGl0eTogdmlzaWJsZTsKICB9CiAgNjEuMTU1JSB7CiAgICBhbmltYXRp' +
	'b24tdGltaW5nLWZ1bmN0aW9uOiBjdWJpYy1iZXppZXIoMC43NiwgMCwgMC4yNCwgMSk7CiAgICBzdHJva2UtZGFzaGFycmF5OiAwLjk3MDkgMTsKICAgIHN0' +
	'cm9rZS1kYXNob2Zmc2V0OiAwOwogICAgdmlzaWJpbGl0eTogdmlzaWJsZTsKICB9CiAgODkuNDUlIHsKICAgIGFuaW1hdGlvbi10aW1pbmctZnVuY3Rpb246' +
	'IGN1YmljLWJlemllcigwLjUsIDAsIDAuNSwgMSk7CiAgICBzdHJva2UtZGFzaGFycmF5OiAwIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogMDsKICAgIHZp' +
	'c2liaWxpdHk6IGhpZGRlbjsKICB9CiAgMTAwJSB7CiAgICBzdHJva2UtZGFzaGFycmF5OiAwIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogLTE7CiAgICB2' +
	'aXNpYmlsaXR5OiBoaWRkZW47CiAgfQp9CiNWZWN0b3JfMV9zdWIxIHsKICBhbmltYXRpb246CiAgICBrZl9WZWN0b3JfMV9zdWIxX2JvcmRlci13aWR0aF8w' +
	'IDMuMDMzMjZzIGxpbmVhciBpbmZpbml0ZSwKICAgIGtmX1ZlY3Rvcl8xX3N1YjFfcGF0aC10cmltXzAgMy4wMzMyNnMgbGluZWFyIGluZmluaXRlOwp9CkBr' +
	'ZXlmcmFtZXMga2ZfVmVjdG9yXzJfc3ViMl9ib3JkZXItd2lkdGhfMCB7CiAgMCUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogbGluZWFyOwog' +
	'ICAgc3Ryb2tlLXdpZHRoOiA3cHg7CiAgfQogIDk1LjQ1JSB7CiAgICBhbmltYXRpb24tdGltaW5nLWZ1bmN0aW9uOiBjdWJpYy1iZXppZXIoMC41LCAwLCAw' +
	'LjUsIDEpOwogICAgc3Ryb2tlLXdpZHRoOiA3cHg7CiAgfQogIDk5LjU5JSB7CiAgICBhbmltYXRpb24tdGltaW5nLWZ1bmN0aW9uOiBsaW5lYXI7CiAgICBz' +
	'dHJva2Utd2lkdGg6IDBweDsKICB9CiAgMTAwJSB7CiAgICBzdHJva2Utd2lkdGg6IDBweDsKICB9Cn0KQGtleWZyYW1lcyBrZl9WZWN0b3JfMl9zdWIyX3Bh' +
	'dGgtdHJpbV8wIHsKICAwJSB7CiAgICBzdHJva2UtZGFzaGFycmF5OiAwIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogLTE7CiAgICB2aXNpYmlsaXR5OiBo' +
	'aWRkZW47CiAgfQogIDYuNTk0JSB7CiAgICBzdHJva2UtZGFzaGFycmF5OiAwIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogLTE7CiAgICB2aXNpYmlsaXR5' +
	'OiBoaWRkZW47CiAgfQogIDI2LjMyNiUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogY3ViaWMtYmV6aWVyKDAuNTIsIDAsIDAuNzMxLCAwLjU1' +
	'Myk7CiAgICBzdHJva2UtZGFzaGFycmF5OiAwIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogLTE7CiAgICB2aXNpYmlsaXR5OiBoaWRkZW47CiAgfQogIDM5' +
	'LjU2MSUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogY3ViaWMtYmV6aWVyKDAuMjQ1LCAwLjU0MywgMC41MjcsIDEpOwogICAgc3Ryb2tlLWRh' +
	'c2hhcnJheTogMC42NDEyIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogLTAuMzU4ODsKICAgIHZpc2liaWxpdHk6IHZpc2libGU7CiAgfQogIDQ5LjQ1MiUg' +
	'ewogICAgc3Ryb2tlLWRhc2hhcnJheTogMSAxOwogICAgc3Ryb2tlLWRhc2hvZmZzZXQ6IDA7CiAgICB2aXNpYmlsaXR5OiB2aXNpYmxlOwogIH0KICA2MS4x' +
	'NTUlIHsKICAgIHN0cm9rZS1kYXNoYXJyYXk6IDEgMTsKICAgIHN0cm9rZS1kYXNob2Zmc2V0OiAwOwogICAgdmlzaWJpbGl0eTogdmlzaWJsZTsKICB9CiAg' +
	'ODEuMDg5JSB7CiAgICBhbmltYXRpb24tdGltaW5nLWZ1bmN0aW9uOiBjdWJpYy1iZXppZXIoMC4wMjYsIDAuMjg5LCAwLjUsIDEpOwogICAgc3Ryb2tlLWRh' +
	'c2hhcnJheTogMSAxOwogICAgc3Ryb2tlLWRhc2hvZmZzZXQ6IDA7CiAgICB2aXNpYmlsaXR5OiB2aXNpYmxlOwogIH0KICA5NS4zODMlIHsKICAgIHN0cm9r' +
	'ZS1kYXNoYXJyYXk6IDAgMTsKICAgIHN0cm9rZS1kYXNob2Zmc2V0OiAwOwogICAgdmlzaWJpbGl0eTogaGlkZGVuOwogIH0KICAxMDAlIHsKICAgIHN0cm9r' +
	'ZS1kYXNoYXJyYXk6IDAgMTsKICAgIHN0cm9rZS1kYXNob2Zmc2V0OiAwOwogICAgdmlzaWJpbGl0eTogaGlkZGVuOwogIH0KfQojVmVjdG9yXzJfc3ViMiB7' +
	'CiAgYW5pbWF0aW9uOgogICAga2ZfVmVjdG9yXzJfc3ViMl9ib3JkZXItd2lkdGhfMCAzLjAzMzI2cyBsaW5lYXIgaW5maW5pdGUsCiAgICBrZl9WZWN0b3Jf' +
	'Ml9zdWIyX3BhdGgtdHJpbV8wIDMuMDMzMjZzIGxpbmVhciBpbmZpbml0ZTsKfQpAa2V5ZnJhbWVzIGtmX1ZlY3Rvcl8yX3N1YjNfYm9yZGVyLXdpZHRoXzAg' +
	'ewogIDAlIHsKICAgIGFuaW1hdGlvbi10aW1pbmctZnVuY3Rpb246IGxpbmVhcjsKICAgIHN0cm9rZS13aWR0aDogN3B4OwogIH0KICA4NC4zOSUgewogICAg' +
	'YW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogY3ViaWMtYmV6aWVyKDAuNSwgMCwgMC41LCAxKTsKICAgIHN0cm9rZS13aWR0aDogN3B4OwogIH0KICA4OS40' +
	'NSUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogbGluZWFyOwogICAgc3Ryb2tlLXdpZHRoOiAwcHg7CiAgfQogIDEwMCUgewogICAgc3Ryb2tl' +
	'LXdpZHRoOiAwcHg7CiAgfQp9CkBrZXlmcmFtZXMga2ZfVmVjdG9yXzJfc3ViM19wYXRoLXRyaW1fMCB7CiAgMCUgewogICAgc3Ryb2tlLWRhc2hhcnJheTog' +
	'MCAxOwogICAgc3Ryb2tlLWRhc2hvZmZzZXQ6IDA7CiAgICB2aXNpYmlsaXR5OiBoaWRkZW47CiAgfQogIDguNTcyJSB7CiAgICBhbmltYXRpb24tdGltaW5n' +
	'LWZ1bmN0aW9uOiBsaW5lYXI7CiAgICBzdHJva2UtZGFzaGFycmF5OiAwIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogMDsKICAgIHZpc2liaWxpdHk6IGhp' +
	'ZGRlbjsKICB9CiAgNDEuNTM5JSB7CiAgICBzdHJva2UtZGFzaGFycmF5OiAxIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogMDsKICAgIHZpc2liaWxpdHk6' +
	'IHZpc2libGU7CiAgfQogIDUxLjQzJSB7CiAgICBzdHJva2UtZGFzaGFycmF5OiAxIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogMDsKICAgIHZpc2liaWxp' +
	'dHk6IHZpc2libGU7CiAgfQogIDYxLjE1NSUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogY3ViaWMtYmV6aWVyKDAuMTUxLCAtMC4wMTMsIDEs' +
	'IDAuNDY2KTsKICAgIHN0cm9rZS1kYXNoYXJyYXk6IDEgMTsKICAgIHN0cm9rZS1kYXNob2Zmc2V0OiAwOwogICAgdmlzaWJpbGl0eTogdmlzaWJsZTsKICB9' +
	'CiAgODEuMDg5JSB7CiAgICBzdHJva2UtZGFzaGFycmF5OiAwIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogLTE7CiAgICB2aXNpYmlsaXR5OiBoaWRkZW47' +
	'CiAgfQogIDEwMCUgewogICAgc3Ryb2tlLWRhc2hhcnJheTogMCAxOwogICAgc3Ryb2tlLWRhc2hvZmZzZXQ6IC0xOwogICAgdmlzaWJpbGl0eTogaGlkZGVu' +
	'OwogIH0KfQojVmVjdG9yXzJfc3ViMyB7CiAgYW5pbWF0aW9uOgogICAga2ZfVmVjdG9yXzJfc3ViM19ib3JkZXItd2lkdGhfMCAzLjAzMzI2cyBsaW5lYXIg' +
	'aW5maW5pdGUsCiAgICBrZl9WZWN0b3JfMl9zdWIzX3BhdGgtdHJpbV8wIDMuMDMzMjZzIGxpbmVhciBpbmZpbml0ZTsKfQpAa2V5ZnJhbWVzIGtmX1ZlY3Rv' +
	'cl8yX3N1YjRfYm9yZGVyLXdpZHRoXzAgewogIDAlIHsKICAgIGFuaW1hdGlvbi10aW1pbmctZnVuY3Rpb246IGxpbmVhcjsKICAgIHN0cm9rZS13aWR0aDog' +
	'N3B4OwogIH0KICA4Ny41NiUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogY3ViaWMtYmV6aWVyKDAuNSwgMCwgMC41LCAxKTsKICAgIHN0cm9r' +
	'ZS13aWR0aDogN3B4OwogIH0KICA4OS40NSUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogbGluZWFyOwogICAgc3Ryb2tlLXdpZHRoOiAwcHg7' +
	'CiAgfQogIDEwMCUgewogICAgc3Ryb2tlLXdpZHRoOiAwcHg7CiAgfQp9CkBrZXlmcmFtZXMga2ZfVmVjdG9yXzJfc3ViNF9wYXRoLXRyaW1fMCB7CiAgMCUg' +
	'ewogICAgc3Ryb2tlLWRhc2hhcnJheTogMCAxOwogICAgc3Ryb2tlLWRhc2hvZmZzZXQ6IDA7CiAgICB2aXNpYmlsaXR5OiBoaWRkZW47CiAgfQogIDEwLjcx' +
	'NSUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogbGluZWFyOwogICAgc3Ryb2tlLWRhc2hhcnJheTogMCAxOwogICAgc3Ryb2tlLWRhc2hvZmZz' +
	'ZXQ6IDA7CiAgICB2aXNpYmlsaXR5OiBoaWRkZW47CiAgfQogIDUxLjQzJSB7CiAgICBzdHJva2UtZGFzaGFycmF5OiAxIDE7CiAgICBzdHJva2UtZGFzaG9m' +
	'ZnNldDogMDsKICAgIHZpc2liaWxpdHk6IHZpc2libGU7CiAgfQogIDUzLjQwOCUgewogICAgc3Ryb2tlLWRhc2hhcnJheTogMSAxOwogICAgc3Ryb2tlLWRh' +
	'c2hvZmZzZXQ6IDA7CiAgICB2aXNpYmlsaXR5OiB2aXNpYmxlOwogIH0KICA2MS4xNTUlIHsKICAgIGFuaW1hdGlvbi10aW1pbmctZnVuY3Rpb246IGN1Ymlj' +
	'LWJlemllcigwLjc2LCAwLCAwLjI0LCAxKTsKICAgIHN0cm9rZS1kYXNoYXJyYXk6IDEgMTsKICAgIHN0cm9rZS1kYXNob2Zmc2V0OiAwOwogICAgdmlzaWJp' +
	'bGl0eTogdmlzaWJsZTsKICB9CiAgOTUuNTc0JSB7CiAgICBzdHJva2UtZGFzaGFycmF5OiAwIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogLTE7CiAgICB2' +
	'aXNpYmlsaXR5OiBoaWRkZW47CiAgfQogIDEwMCUgewogICAgc3Ryb2tlLWRhc2hhcnJheTogMCAxOwogICAgc3Ryb2tlLWRhc2hvZmZzZXQ6IC0xOwogICAg' +
	'dmlzaWJpbGl0eTogaGlkZGVuOwogIH0KfQojVmVjdG9yXzJfc3ViNCB7CiAgYW5pbWF0aW9uOgogICAga2ZfVmVjdG9yXzJfc3ViNF9ib3JkZXItd2lkdGhf' +
	'MCAzLjAzMzI2cyBsaW5lYXIgaW5maW5pdGUsCiAgICBrZl9WZWN0b3JfMl9zdWI0X3BhdGgtdHJpbV8wIDMuMDMzMjZzIGxpbmVhciBpbmZpbml0ZTsKfQpA' +
	'a2V5ZnJhbWVzIGtmX1ZlY3Rvcl8zX3N1YjVfYm9yZGVyLXdpZHRoXzAgewogIDAlIHsKICAgIGFuaW1hdGlvbi10aW1pbmctZnVuY3Rpb246IGxpbmVhcjsK' +
	'ICAgIHN0cm9rZS13aWR0aDogNnB4OwogIH0KICA4NC4zOSUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogY3ViaWMtYmV6aWVyKDAuNSwgMCwg' +
	'MC41LCAxKTsKICAgIHN0cm9rZS13aWR0aDogNnB4OwogIH0KICA4Ny45MiUgewogICAgYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvbjogbGluZWFyOwogICAg' +
	'c3Ryb2tlLXdpZHRoOiAwcHg7CiAgfQogIDEwMCUgewogICAgc3Ryb2tlLXdpZHRoOiAwcHg7CiAgfQp9CkBrZXlmcmFtZXMga2ZfVmVjdG9yXzNfc3ViNV9w' +
	'YXRoLXRyaW1fMCB7CiAgMCUgewogICAgc3Ryb2tlLWRhc2hhcnJheTogMCAxOwogICAgc3Ryb2tlLWRhc2hvZmZzZXQ6IC0xOwogICAgdmlzaWJpbGl0eTog' +
	'aGlkZGVuOwogIH0KICAxOS4xNTQlIHsKICAgIGFuaW1hdGlvbi10aW1pbmctZnVuY3Rpb246IGN1YmljLWJlemllcigwLjAxNywgMC45OTYsIDAuNSwgMSk7' +
	'CiAgICBzdHJva2UtZGFzaGFycmF5OiAwIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogLTE7CiAgICB2aXNpYmlsaXR5OiBoaWRkZW47CiAgfQogIDI5Ljk2' +
	'OCUgewogICAgc3Ryb2tlLWRhc2hhcnJheTogMSAxOwogICAgc3Ryb2tlLWRhc2hvZmZzZXQ6IDA7CiAgICB2aXNpYmlsaXR5OiB2aXNpYmxlOwogIH0KICA2' +
	'MS4xNTUlIHsKICAgIGFuaW1hdGlvbi10aW1pbmctZnVuY3Rpb246IGN1YmljLWJlemllcigwLjc2LCAwLCAwLjI0LCAxKTsKICAgIHN0cm9rZS1kYXNoYXJy' +
	'YXk6IDEgMTsKICAgIHN0cm9rZS1kYXNob2Zmc2V0OiAwOwogICAgdmlzaWJpbGl0eTogdmlzaWJsZTsKICB9CiAgOTcuMzYzJSB7CiAgICBzdHJva2UtZGFz' +
	'aGFycmF5OiAwIDE7CiAgICBzdHJva2UtZGFzaG9mZnNldDogLTE7CiAgICB2aXNpYmlsaXR5OiBoaWRkZW47CiAgfQogIDEwMCUgewogICAgc3Ryb2tlLWRh' +
	'c2hhcnJheTogMCAxOwogICAgc3Ryb2tlLWRhc2hvZmZzZXQ6IC0xOwogICAgdmlzaWJpbGl0eTogaGlkZGVuOwogIH0KfQojVmVjdG9yXzNfc3ViNSB7CiAg' +
	'YW5pbWF0aW9uOgogICAga2ZfVmVjdG9yXzNfc3ViNV9ib3JkZXItd2lkdGhfMCAzLjAzMzI2cyBsaW5lYXIgaW5maW5pdGUsCiAgICBrZl9WZWN0b3JfM19z' +
	'dWI1X3BhdGgtdHJpbV8wIDMuMDMzMjZzIGxpbmVhciBpbmZpbml0ZTsKfQo8L3N0eWxlPgo8ZyBpZD0icGFyYWtpdF9hbmltYXRpb25fd2hpdGUiPgo8Y2ly' +
	'Y2xlIGlkPSJFbGxpcHNlXzEiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDU3LjY0NzEgMTYuNDcwNikiIGN4PSI0LjExNzY1IiBjeT0iNC4xMTc2NSIgcj0iMy43' +
	'MDU4OCIgZmlsbD0id2hpdGUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMC44MjM1MjkiLz4KPHBhdGggaWQ9IlZlY3Rvcl8xX3N1YjAiIHRyYW5z' +
	'Zm9ybT0idHJhbnNsYXRlKDE0LjgyMzUgMzguMjY5MykiIGQ9Ik0wIDUxLjQ5NTRDMCA0NC4wODM2IDMuMjk0MTIgLTEuMjEwNSAyNy4xNzY1IDAuMDI0Nzk3' +
	'NiIgcGF0aExlbmd0aD0iMSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSI3IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1kYXNoYXJyYXk9' +
	'IjAuOTI0MiAxIi8+CjxwYXRoIGlkPSJWZWN0b3JfMV9zdWIxIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtNy42MjkzOWUtMDYgNDEuNTg4MikiIGQ9Ik0wIDcw' +
	'LjQxMThDMCA1OC4wNTg4IDQ2LjcxNDIgNTEuNzU4MiA1NS4xNzY1IDIwLjE3NjVDNTcuNDkzNCAxMS41Mjk0IDU2LjQxMTggNi41ODgyNCA1MS4wNTg4IDAi' +
	'IHBhdGhMZW5ndGg9IjEiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iNyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtZGFzaGFycmF5PSIw' +
	'LjUxMDQgMSIvPgo8cGF0aCBpZD0iVmVjdG9yXzJfc3ViMiIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNi4xNzY0NyA5OC4yMTA2KSIgZD0iTTYuMTc2NDcgMTYu' +
	'MjZDNi4xNzY0NyAyNi44ODQ3IDIuMTYwNjMgMzguMDQ0OCAwLjYwNTIxNCA0OS4wOTI4QzAuMDI5MDQxNyA1My4xODUzIDMuODI4MTMgNTUuODkzMyA2LjU4' +
	'NjE2IDUyLjgxNTRDMTYuOTUzMyA0MS4yNDU4IDIzLjQ0MTggOS45NjM4NyA0MC45NzUzIDAiIHBhdGhMZW5ndGg9IjEiIHZpc2liaWxpdHk9ImhpZGRlbiIg' +
	'c3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSI3IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1kYXNoYXJyYXk9IjAgMSIvPgo8cGF0aCBpZD0i' +
	'VmVjdG9yXzJfc3ViMyIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNDcuMTUxOCA5NS4xMTc3KSIgZD0iTTM2Ljg0ODIgNS43NjQ3MUMzNi44NDgyIDUuNzY0NzEg' +
	'MjkuNDM2NCAwIDExLjczMDUgMEM3LjMxODI1IDAgMy40NDU4MyAxLjEzNDgxIDAgMy4wOTI5OCIgcGF0aExlbmd0aD0iMSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ry' +
	'b2tlLXdpZHRoPSI3IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1kYXNoYXJyYXk9IjAuMDMwMyAxIi8+CjxwYXRoIGlkPSJWZWN0b3JfMl9zdWI0' +
	'IiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyOS4yMzUzIDUuNzkxZS0wNikiIGQ9Ik0wIDQyLjgyMzVDMi4xOTYwOCA0MS44NjI3IDYuMTc2NDcgMzcuNDcwNiA2' +
	'LjE3NjQ3IDI3LjU4ODJDNi4xNzY0NyAxNS4yMzUzIDEzLjU4ODIgMCAzMC44ODI0IDBDNDguMTc2NSAwIDUyLjcwNTkgMTUuMjM1MyA1Mi43MDU5IDIxQzUy' +
	'LjcwNTkgMjIuODU3MiA1My44ODA4IDIyLjQ3MzEgNTMuNTI5NCAyNS4xMTc2QzUzLjExOTYgMjguMjAxOSA1MS40MDYyIDMzLjI2NzIgNDguNDIwOCAzNi43' +
	'MjZDNDYuOTQzNyAzOC40MzcyIDQ1LjY4ODIgNDAuNTAxNiA0Ni4xNDI3IDQyLjcxNkM0Ni42MzA3IDQ1LjA5MjkgNDcuMzUyOSA0Ny41OTMxIDQ3LjM1Mjkg' +
	'NTAuNjQ3MUM0Ny4zNTI5IDU2LjIxMzkgNDQuNjY1IDcyLjkxNjQgMjguOTA2NiA4Ny4xMDczQzI4LjA3MDMgODcuODYwNCAyOC4xNTU0IDg5LjI0NjkgMjgu' +
	'OTc0OCA5MC4wMTg0QzMxLjE3MjIgOTIuMDg3MSAzMy43NjQ3IDk1LjgyMDcgMzMuNzY0NyAxMDAuODgyQzMzLjc2NDcgMTA3LjQ3MSAyNy41ODgyIDEwNy40' +
	'NzEgMjcuMTc2NSAxMDcuNDcxQzIwLjU4ODIgMTA3LjQ3MSAxNy45MTY1IDk4LjIxMDYgMTcuOTE2NSA5OC4yMTA2IiBwYXRoTGVuZ3RoPSIxIiBzdHJva2U9' +
	'IndoaXRlIiBzdHJva2Utd2lkdGg9IjciIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWRhc2hhcnJheT0iMC4yNjk1IDEiLz4KPHBhdGggaWQ9IlZl' +
	'Y3Rvcl8zX3N1YjUiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDcyLjQ3MDYgMjAuODc5MykiIGQ9Ik05LjQ3MDU5IDAuMTIwNzA1QzYuMzEzNzMgLTAuMjkxMDYg' +
	'MCAwLjEyMDcwNSAwIDUuMDYxODhDMCAxMC4wMDMxIDMuNDMxMzcgMTMuOTgzNSA1LjM1Mjk0IDE1LjM1NkM3LjI1NTI5IDE2LjcxNDggMTIuNTIwNyAwLjg1' +
	'NDYzNCA5LjU2Mjc1IDAuMTM3NzYiIHBhdGhMZW5ndGg9IjEiIHZpc2liaWxpdHk9ImhpZGRlbiIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSI3IiBz' +
	'dHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1kYXNoYXJyYXk9IjAgMSIvPgo8L2c+Cjwvc3ZnPgo=';

interface IBranchPreviewSettingsResult {
	readonly action: 'saveShared' | 'saveLocal' | 'clearLocal';
	readonly url?: string;
}

interface IBranchPreviewSettingsModel {
	readonly branchName: string;
	readonly sharedBranchUrl?: string;
	readonly inheritedSharedUrl?: string;
	readonly localOverrideUrl?: string;
	readonly assignedPort?: number;
}

function createSettingsButton(label: string, className?: string): HTMLButtonElement {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = `app-preview-settings-button${className ? ` ${className}` : ''}`;
	button.textContent = label;
	return button;
}

function renderPortAwareUrl(element: HTMLElement, value: string): void {
	const detected = detectPreviewUrlPort(value);
	if (!detected) {
		element.textContent = value;
		return;
	}

	element.replaceChildren(
		document.createTextNode(`${detected.prefix}:`),
		$('span.app-preview-settings-url-port', undefined, detected.port),
		document.createTextNode(detected.suffix)
	);
}

function createSettingsField(label: string, value: string, placeholder: string): { row: HTMLElement; input: HTMLInputElement } {
	const row = $('.app-preview-settings-field');
	const labelElement = document.createElement('label');
	labelElement.textContent = label;
	const input = document.createElement('input');
	input.type = 'text';
	input.value = value;
	input.placeholder = placeholder;
	input.spellcheck = false;
	labelElement.append(input);
	row.append(labelElement);
	return { row, input };
}

function createSettingsUrlField(label: string, value: string, caption: string): { row: HTMLElement; input: HTMLInputElement; update(): void } {
	const row = $('.app-preview-settings-field');
	const labelElement = document.createElement('label');
	labelElement.textContent = label;
	const wrapper = $('.app-preview-settings-url-input-wrap');
	const overlay = $('.app-preview-settings-url-overlay');
	const input = document.createElement('input');
	input.type = 'text';
	input.value = value;
	input.spellcheck = false;
	input.setAttribute('aria-label', label);
	input.className = 'app-preview-settings-url-input';
	wrapper.append(overlay, input);
	const captionElement = $('.app-preview-settings-caption', undefined, caption);
	labelElement.append(wrapper);
	row.append(labelElement, captionElement);
	const update = (): void => renderPortAwareUrl(overlay, input.value);
	update();
	return { row, input, update };
}

function createPortDetectionPreview(input: HTMLInputElement): { element: HTMLElement; update(): void } {
	const element = $('.app-preview-settings-port-preview');
	const update = (): void => {
		const detected = detectPreviewUrlPort(input.value);
		if (!detected) {
			element.hidden = true;
			element.replaceChildren();
			return;
		}

		element.hidden = false;
		element.textContent = localize('appPreviewSettingsDetectedPort', "Saves as {0}", detected.templatedUrl);
	};
	update();
	return { element, update };
}

function showBranchPreviewSettingsModal(model: IBranchPreviewSettingsModel): Promise<IBranchPreviewSettingsResult | undefined> {
	return new Promise(resolve => {
		const disposables = new DisposableStore();
		let settled = false;

		const finish = (result?: IBranchPreviewSettingsResult): void => {
			if (settled) {
				return;
			}
			settled = true;
			disposables.dispose();
			block.remove();
			resolve(result);
		};

		const block = $('.app-preview-settings-modal-block');
		const dialog = $('.app-preview-settings-modal');
		dialog.setAttribute('role', 'dialog');
		dialog.setAttribute('aria-modal', 'true');
		dialog.setAttribute('aria-label', localize('appPreviewSettingsDialogAria', "Branch Preview Settings"));
		block.append(dialog);

		const header = $('.app-preview-settings-header');
		header.append(
			$('.app-preview-settings-title', undefined, localize('appPreviewSettingsTitle', "Branch Preview Settings")),
			$('.app-preview-settings-branch', undefined, model.branchName)
		);
		dialog.append(header);

		const body = $('.app-preview-settings-body');
		const error = $('.app-preview-settings-error');
		error.hidden = true;
		body.append(error);

		let primaryAction: 'saveShared' | 'saveLocal';
		let primaryInput: HTMLInputElement;
		let primaryPortPreview: ReturnType<typeof createPortDetectionPreview> | undefined;
		let primaryUrlField: ReturnType<typeof createSettingsUrlField> | undefined;

		if (!model.sharedBranchUrl) {
			primaryAction = 'saveShared';
			const defaultUrl = model.inheritedSharedUrl ? adaptWorkbenchAppPreviewUrlToPort(model.inheritedSharedUrl, model.assignedPort) ?? model.inheritedSharedUrl : '';
			const field = createSettingsUrlField(
				localize('appPreviewSettingsSharedUrlLabel', "Preview URL"),
				defaultUrl,
				localize('appPreviewSettingsSharedCaption', "Branch default")
			);
			primaryInput = field.input;
			primaryUrlField = field;
			primaryPortPreview = createPortDetectionPreview(primaryInput);
			body.append(
				field.row,
				primaryPortPreview.element
			);
		} else {
			primaryAction = 'saveLocal';
			const usesLocalOverride = Boolean(model.localOverrideUrl);
			const field = createSettingsUrlField(
				localize('appPreviewSettingsLocalOverrideLabel', "Preview URL"),
				model.localOverrideUrl ?? adaptWorkbenchAppPreviewUrlToPort(model.sharedBranchUrl, model.assignedPort) ?? model.sharedBranchUrl,
				usesLocalOverride
					? localize('appPreviewSettingsLocalCaption', "Local override")
					: localize('appPreviewSettingsBranchDefaultCaption', "Using branch default")
			);
			primaryInput = field.input;
			primaryUrlField = field;
			body.append(field.row);

			const sharedSummary = $('.app-preview-settings-shared-summary');
			const revealShared = createSettingsButton(localize('appPreviewSettingsRevealShared', "Edit branch default"), 'app-preview-settings-link-button');
			sharedSummary.append(revealShared);
			body.append(sharedSummary);

			const sharedPanel = $('.app-preview-settings-danger-panel');
			sharedPanel.hidden = true;
			const sharedField = createSettingsField(localize('appPreviewSettingsSharedEditLabel', "Branch default"), model.sharedBranchUrl, 'http://127.0.0.1:${PORT}/');
			const sharedPortPreview = createPortDetectionPreview(sharedField.input);
			const confirmLabel = document.createElement('label');
			confirmLabel.className = 'app-preview-settings-checkbox';
			const confirm = document.createElement('input');
			confirm.type = 'checkbox';
			confirmLabel.append(confirm, document.createTextNode(localize('appPreviewSettingsSharedConfirm', "Apply for everyone on this branch.")));
			const saveShared = createSettingsButton(localize('appPreviewSettingsSaveShared', "Save Default"), 'app-preview-settings-danger-button');
			saveShared.disabled = true;
			sharedPanel.append(
				$('.app-preview-settings-warning', undefined, localize('appPreviewSettingsSharedWarning', "Changes the branch default.")),
				sharedField.row,
				sharedPortPreview.element,
				confirmLabel,
				saveShared
			);
			body.append(sharedPanel);

			disposables.add(addDisposableListener(revealShared, EventType.CLICK, () => {
				sharedPanel.hidden = false;
				revealShared.hidden = true;
				sharedField.input.focus();
			}));
			disposables.add(addDisposableListener(confirm, EventType.CHANGE, () => {
				saveShared.disabled = !confirm.checked;
			}));
			disposables.add(addDisposableListener(sharedField.input, EventType.INPUT, () => {
				sharedPortPreview.update();
			}));
			disposables.add(addDisposableListener(saveShared, EventType.CLICK, () => {
				const normalized = normalizePreviewUrlTemplate(sharedField.input.value);
				if (!normalized) {
					error.textContent = localize('appPreviewSettingsInvalidShared', "Enter a valid http or https URL. Use ${PORT} for shared branch defaults.");
					error.hidden = false;
					return;
				}
				finish({ action: 'saveShared', url: normalized });
			}));
		}

		dialog.append(body);

		const footer = $('.app-preview-settings-footer');
		const cancel = createSettingsButton(localize('appPreviewSettingsCancel', "Cancel"));
		const clearLocal = createSettingsButton(localize('appPreviewSettingsClearLocal', "Clear Override"));
		clearLocal.hidden = primaryAction !== 'saveLocal' || !model.localOverrideUrl;
		const save = createSettingsButton(localize('appPreviewSettingsSave', "Save"), 'app-preview-settings-primary-button');
		footer.append(cancel, clearLocal, save);
		dialog.append(footer);

		const validatePrimary = (): string | undefined => {
			const normalized = primaryAction === 'saveShared'
				? normalizePreviewUrlTemplate(primaryInput.value)
				: normalizeHttpUrl(primaryInput.value.trim());
			if (!normalized) {
				error.textContent = primaryAction === 'saveShared'
					? localize('appPreviewSettingsInvalidPrimaryShared', "Enter a valid http or https URL. Use ${PORT} instead of a concrete port when possible.")
					: localize('appPreviewSettingsInvalidPrimaryLocal', "Enter a valid http or https URL.");
				error.hidden = false;
				return undefined;
			}
			return normalized;
		};

		disposables.add(addDisposableListener(save, EventType.CLICK, () => {
			const normalized = validatePrimary();
			if (normalized) {
				finish({ action: primaryAction, url: normalized });
			}
		}));
		if (primaryPortPreview) {
			disposables.add(addDisposableListener(primaryInput, EventType.INPUT, () => {
				primaryPortPreview?.update();
				primaryUrlField?.update();
			}));
		}
		if (primaryUrlField && !primaryPortPreview) {
			disposables.add(addDisposableListener(primaryInput, EventType.INPUT, () => {
				primaryUrlField?.update();
			}));
		}
		disposables.add(addDisposableListener(clearLocal, EventType.CLICK, () => finish({ action: 'clearLocal' })));
		disposables.add(addDisposableListener(cancel, EventType.CLICK, () => finish()));
		disposables.add(addDisposableListener(block, EventType.MOUSE_DOWN, event => {
			if (event.target === block) {
				finish();
			}
		}));
		disposables.add(addDisposableListener(mainWindow.document, EventType.KEY_DOWN, event => {
			if (event.key === 'Escape') {
				finish();
			}
		}));

		mainWindow.document.body.append(block);
		primaryInput.focus();
		primaryInput.select();
	});
}

export class WorkbenchAppPreviewController extends Disposable {

	static readonly ID = 'workbench.contrib.workbenchAppPreview';

	private readonly _storageListenerStore = this._register(new DisposableStore());
	private readonly _activeGroupListenerStore = this._register(new DisposableStore());
	private readonly _startupAnchorStore = this._register(new DisposableStore());
	private readonly _previewActionListenerStore = this._register(new DisposableStore());
	private readonly _agentLogOffsets = new Map<string, number>();
	private readonly _agentLogScanScheduler = this._register(new RunOnceScheduler(() => {
		void this._scanAgentLogs().catch(error => {
			this._logService.error('[WorkbenchAppPreview] Failed to scan agent logs.', error);
		});
	}, AGENT_LOG_SCAN_DELAY));
	private readonly _terminalCwdKeys = new Map<number, Promise<string | undefined>>();
	private readonly _serverTerminalExitStore = this._register(new DisposableStore());
	private _preview: BrowserEditorInput | undefined;
	private _discoveredUrl: string | undefined;
	private _discoveredUrlBranchName: string | undefined;
	private _activeManagedPreviewUrl: string | undefined;
	private _workspaceRootKey: string | undefined;
	private _lastBranchName: string | undefined;
	private _hasObservedBranchName = false;
	private readonly _previewBranchesOpenedThisSession = new Set<string>();
	private _lastWorkspaceContext: IDesignerWorkspaceContext | undefined;
	private _previewStartupInProgress = false;
	private _serverRecentOutput = '';
	private _serverLastOutputAt: number | undefined;
	private _previewStartupAgentContext = '';
	private _previewStartupPageState: IPreviewStartupPageState | undefined;
	private _previewStartupPageKey: string | undefined;
	private _previewStartupPhase: PreviewStartupPhase | undefined;
	private _previewStartupPhaseStartedAt = 0;
	private _lastHealthError: string | undefined;
	private _consecutiveHealthFailures = 0;
	private _backgroundRestartAttempts = 0;
	private _backgroundRestartInFlight = false;
	private _previewLoadFailureRecoveryInFlight = false;
	private _previewAutoStartInFlight = false;
	private _healthCheckInFlight = false;

	constructor(
		@IBrowserViewWorkbenchService private readonly _browserViewService: IBrowserViewWorkbenchService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IStorageService private readonly _storageService: IStorageService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IFileService private readonly _fileService: IFileService,
		@ILocalGitService private readonly _localGitService: ILocalGitService,
		@ILogService private readonly _logService: ILogService,
		@IPlaywrightService private readonly _playwrightService: IPlaywrightService,
		@ILanguageModelToolsService private readonly _toolsService: ILanguageModelToolsService,
		@ICommandService private readonly _commandService: ICommandService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@INativeHostService private readonly _nativeHostService: INativeHostService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
	) {
		super();

		this._register(this._storageService.onDidChangeValue(StorageScope.WORKSPACE, APP_PREVIEW_URL_STORAGE_KEY, this._storageListenerStore)(() => {
			this.refreshFromOverride();
		}));
		this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, APP_PREVIEW_OVERRIDES_STORAGE_KEY, this._storageListenerStore)(() => {
			this.refreshFromOverride();
		}));
		const branchPoll = mainWindow.setInterval(() => {
			void this._refreshPreviewFromGit().catch(error => {
				this._logService.error('[WorkbenchAppPreview] Failed to refresh app preview for the current branch.', error);
			});
		}, WORKSPACE_BRANCH_POLL_INTERVAL);
		this._register(toDisposable(() => mainWindow.clearInterval(branchPoll)));
		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => {
			void this._reconcileCurrentWorkspaceContext('repoSwitch').catch(error => {
				this._logService.error('[WorkbenchAppPreview] Failed to refresh app preview after repository switch.', error);
			});
		}));

		this._register(this._terminalService.onAnyInstanceData(e => {
			void this._handleTerminalData(e.instance, e.data).catch(error => {
				this._logService.error('[WorkbenchAppPreview] Failed to inspect terminal output.', error);
			});
		}));

		this._register(this._fileService.watch(this._environmentService.logsHome, {
			recursive: true,
			excludes: [],
		}));

		this._register(this._fileService.onDidFilesChange(e => {
			if (e.affects(this._environmentService.logsHome, FileChangeType.ADDED, FileChangeType.UPDATED)) {
				this._agentLogScanScheduler.schedule();
			}
		}));

		this._register(this._editorGroupsService.onDidChangeActiveGroup(() => {
			this._trackActiveGroup();
			void this.ensurePreview(false).catch(error => {
				this._logService.error('[WorkbenchAppPreview] Failed to reveal app preview after active group change.', error);
			});
		}));

		this._trackActiveGroup();
		this._scheduleStartupAnchors();
		this._registerAppPreviewCommands();
		this._registerPreviewTools();
		this._agentLogScanScheduler.schedule(0);
	}

	private readonly _serverHealthPollStore = this._register(new DisposableStore());
	private _serverTerminal: ITerminalInstance | undefined;
	private _serverTerminalExited = true;
	private _serverState: PreviewServerState = 'stopped';
	private _serverHealth: PreviewHealthState = 'unknown';
	private _serverUrl: string | undefined;
	private _serverHealthUrl: string | undefined;
	private _serverHealthPath: string | undefined;
	private _serverBranch: string | undefined;
	private _serverCommand: string | undefined;
	private _serverPort: number | undefined;
	private _serverFixedPort: number | undefined;
	private _serverMessage: string | undefined;
	private _serverCwd: string | undefined;
	private _serverStartInFlight: Promise<IPreviewServerStatus> | undefined;
	private _serverStartGeneration = 0;
	private _needsConfigurationPrompt = false;
	private _portConflictRecoveryAttempts = 0;
	private _portConflictRecoveryInFlight = false;

	async ensurePreview(reveal: boolean, options?: { skipPreferredNavigation?: boolean }): Promise<BrowserEditorInput | undefined> {
		const root = getWorkspaceRoot(this._workspaceContextService);
		if (!root) {
			if (this._workspaceRootKey !== undefined) {
				this._stopPreviewServer();
			}
			this._workspaceRootKey = undefined;
			this._lastBranchName = undefined;
			this._hasObservedBranchName = false;
			this._lastWorkspaceContext = undefined;
			return this._ensureEmptyRepoPreview(reveal);
		}

		const rootKey = root.toString();
		let workspaceChanged = false;
		if (this._workspaceRootKey !== rootKey) {
			if (this._workspaceRootKey !== undefined) {
				this._stopPreviewServer();
			}
			workspaceChanged = this._workspaceRootKey !== undefined;
			this._preview = undefined;
			this._discoveredUrl = undefined;
			this._discoveredUrlBranchName = undefined;
			this._workspaceRootKey = rootKey;
			this._lastBranchName = undefined;
			this._hasObservedBranchName = false;
			this._lastWorkspaceContext = undefined;
			this._previewActionListenerStore.clear();
		}

		const previewId = getWorkspacePreviewId(root);
		let isNewPreview = false;
		if (!this._preview || this._preview.isDisposed()) {
			isNewPreview = !this._browserViewService.getKnownBrowserViews().has(previewId);
				this._preview = this._browserViewService.getOrCreateLazy(previewId, {
					url: this._getLegacyOverrideUrl(),
					title: localize('workbenchAppPreviewTitle', "App Preview"),
					isSessionAppPreview: true,
				}, { kind: BrowserViewKind.AppPreview });

			this._register(this._preview.onBeforeDispose(e => {
				if (!this._preview?.isDisposed()) {
					e.veto();
				}
			}));
		}
		this._installPreviewActionListener(this._preview);

		const preview = this._preview;
		const activeGroup = this._editorGroupsService.activeGroup;
		const shouldOpen = reveal || activeGroup.getIndexOfEditor(preview) !== 0 || !activeGroup.isPinned(preview);
		if (shouldOpen) {
			const options: IEditorOptions = { pinned: true, index: 0, preserveFocus: !reveal };
			await this._editorService.openEditor(preview, options, activeGroup);
			activeGroup.pinEditor(preview);
		}

		if (await this._maybeStartPreviewServerForCurrentBranch()) {
			return preview;
		}

		if (options?.skipPreferredNavigation) {
			return preview;
		}

		void this._navigatePreferredUrl({ isNewPreview, forceNavigate: workspaceChanged }).catch(error => {
			this._logService.error('[WorkbenchAppPreview] Failed to navigate app preview.', error);
		});
		return preview;
	}

	private async _ensureEmptyRepoPreview(reveal: boolean): Promise<BrowserEditorInput | undefined> {
		let repoState: DesignerRepoState | undefined;
		try {
			repoState = await this._commandService.executeCommand<DesignerRepoState>(GetDesignerReposStateCommandId);
		} catch (error) {
			this._logService.debug('[WorkbenchAppPreview] Empty repo state is unavailable.', error);
			return undefined;
		}

		if (!shouldShowDesignerEmptyRepoFtux(repoState)) {
			return undefined;
		}

		if (!this._preview || this._preview.isDisposed() || this._preview.id !== APP_PREVIEW_EMPTY_REPO_ID) {
			this._preview = this._browserViewService.getOrCreateLazy(APP_PREVIEW_EMPTY_REPO_ID, {
				url: 'about:blank',
				title: localize('workbenchAppPreviewTitle', "App Preview"),
				isSessionAppPreview: true,
			}, { kind: BrowserViewKind.AppPreview });

			this._register(this._preview.onBeforeDispose(e => {
				if (!this._preview?.isDisposed()) {
					e.veto();
				}
			}));
		}
		this._installPreviewActionListener(this._preview);

		const preview = this._preview;
		const activeGroup = this._editorGroupsService.activeGroup;
		const shouldOpen = reveal || activeGroup.getIndexOfEditor(preview) !== 0 || !activeGroup.isPinned(preview);
		if (shouldOpen) {
			const options: IEditorOptions = { pinned: true, index: 0, preserveFocus: !reveal };
			await this._editorService.openEditor(preview, options, activeGroup);
			activeGroup.pinEditor(preview);
		}

		this._showPreviewStartupPage({
			phase: 'emptyRepo',
			title: getWorkbenchAppPreviewStartupTitle('emptyRepo', undefined),
			message: localize('workbenchAppPreviewEmptyRepoMessage', "Parakit needs a repo before it can show an app preview."),
			actions: ['pasteRepoUrl', 'openLocalFolder']
		});

		return preview;
	}

	private async _maybeStartPreviewServerForCurrentBranch(): Promise<boolean> {
		if (this._previewStartupInProgress || this._previewAutoStartInFlight || this._serverState === 'starting' || this._serverState === 'running') {
			return false;
		}

		const root = getWorkspaceRoot(this._workspaceContextService);
		if (!root) {
			return false;
		}

		const branchName = await this._resolveWorkspaceBranchName(root);
		const configuredUrl = await this._resolveConfiguredPreviewUrl(root, branchName, getBranchRuntime(this._storageService, root, branchName));
		if (configuredUrl && await this._shouldOpenConfiguredPreviewWithoutServer(root, branchName, configuredUrl)) {
			return false;
		}

		this._previewStartupInProgress = true;
		this._previewAutoStartInFlight = true;
		this._showPreviewStartupPage(this._createPreviewStartupPageState('starting', root, branchName, this._lastWorkspaceContext, {
			message: localize('appPreviewAutoStartMessage', "Preparing the preview for this branch."),
		}));

		void this._startPreviewServer(false, await this._getOrAssignBranchPort(root, branchName), false, true, this._lastWorkspaceContext)
			.catch(error => {
				this._logService.error('[WorkbenchAppPreview] Failed to auto-start app preview server.', error);
			})
			.finally(() => {
				this._previewAutoStartInFlight = false;
			});

		return true;
	}

	private _installPreviewActionListener(preview: BrowserEditorInput): void {
		this._previewActionListenerStore.clear();
		this._previewActionListenerStore.add(preview.onceModelResolves(model => {
			this._previewActionListenerStore.add(model.onDidNavigate(e => this._handlePreviewStartupAction(e.url)));
			this._previewActionListenerStore.add(model.onDidChangeLoadingState(e => {
				void this._handlePreviewLoadingState(e).catch(error => {
					this._logService.error('[WorkbenchAppPreview] Failed to handle preview loading state.', error);
				});
			}));
		}));
	}

	private _handlePreviewStartupAction(url: string): void {
		const hashIndex = url.indexOf('#');
		if (hashIndex === -1) {
			return;
		}

		const params = new URLSearchParams(url.substring(hashIndex + 1));
		const action = params.get('app-preview-action');
		if (!action) {
			return;
		}

		if (action === 'retry') {
			void this._retryPreviewStartup().catch(error => {
				this._logService.error('[WorkbenchAppPreview] Failed to retry preview startup.', error);
			});
		} else if (action === 'restart') {
			void this._restartPreviewFromStartupPage().catch(error => {
				this._logService.error('[WorkbenchAppPreview] Failed to restart preview from startup page.', error);
			});
		} else if (action === 'logs') {
			void this._showPreviewServerLogs().catch(error => {
				this._logService.error('[WorkbenchAppPreview] Failed to show preview server logs.', error);
			});
		} else if (action === 'copy') {
			void this._copyPreviewStartupContext().catch(error => {
				this._logService.error('[WorkbenchAppPreview] Failed to copy preview startup context.', error);
			});
		} else if (action === 'pasteRepoUrl') {
			void this._showAddRepoFromStartupPage(DesignerAddRepoChoice.PasteRepoUrl).catch(error => {
				this._logService.error('[WorkbenchAppPreview] Failed to start add repo URL flow.', error);
			});
		} else if (action === 'openLocalFolder') {
			void this._showAddRepoFromStartupPage(DesignerAddRepoChoice.OpenLocalFolder).catch(error => {
				this._logService.error('[WorkbenchAppPreview] Failed to start open local folder flow.', error);
			});
		}
	}

	private async _showAddRepoFromStartupPage(choice: DesignerAddRepoChoice): Promise<void> {
		await this._commandService.executeCommand(ShowDesignerAddRepoCommandId, { choice });
	}

	private async _retryPreviewStartup(): Promise<void> {
		if (this._lastWorkspaceContext) {
			await this.reconcileDesignerWorkspaceContext(this._lastWorkspaceContext);
			return;
		}

		await this._startPreviewServer(true, await this._getCurrentBranchPort(), false, true);
	}

	private async _restartPreviewFromStartupPage(): Promise<void> {
		await this._startPreviewServer(true, await this._getCurrentBranchPort(), false, true);
	}

	private async _showPreviewServerLogs(): Promise<void> {
		if (!this._serverTerminal || this._serverTerminal.isDisposed) {
			return;
		}

		await this._terminalService.revealTerminal(this._serverTerminal, false);
		this._serverTerminal.focus(true);
	}

	private async _copyPreviewStartupContext(): Promise<void> {
		if (!this._previewStartupAgentContext) {
			return;
		}

		await this._clipboardService.writeText(this._previewStartupAgentContext);
		if (this._previewStartupPageState) {
			this._showPreviewStartupPage(this._previewStartupPageState);
		}
	}

	async navigateDiscoveredUrl(url: string): Promise<void> {
		const normalizedUrl = normalizeWorkbenchAppPreviewLoopbackUrl(url);
		this._discoveredUrl = normalizedUrl;
		const root = getWorkspaceRoot(this._workspaceContextService);
		this._discoveredUrlBranchName = root ? await this._resolveWorkspaceBranchName(root) : undefined;
		if (this._previewStartupInProgress) {
			return;
		}
		await this._navigatePreferredUrl();
	}

	refreshFromOverride(): void {
		void this._navigatePreferredUrl().catch(error => {
			this._logService.error('[WorkbenchAppPreview] Failed to refresh app preview override.', error);
		});
	}

	private async _navigatePreferredUrl(options?: { isNewPreview?: boolean; allowDuringStartup?: boolean; forceNavigate?: boolean; preferRunningServer?: boolean }): Promise<void> {
		const root = getWorkspaceRoot(this._workspaceContextService);
		if (!root || !this._preview || this._preview.isDisposed()) {
			return;
		}
		if (this._previewStartupInProgress && !options?.allowDuringStartup) {
			return;
		}

		const branchName = await this._resolveWorkspaceBranchName(root);
		const branchObservation = observeWorkbenchAppPreviewBranch({
			hasObservedBranchName: this._hasObservedBranchName,
			lastBranchName: this._lastBranchName,
			currentBranchName: branchName,
		});
		const branchChanged = branchObservation.changed;
		this._lastBranchName = branchObservation.branchName;
		this._hasObservedBranchName = branchObservation.hasObservedBranchName;
		const branchSessionKey = this._getBranchSessionKey(root, branchName);
		const branchOpenedInSession = this._previewBranchesOpenedThisSession.has(branchSessionKey);
		const runtime = getBranchRuntime(this._storageService, root, branchName);
		const runningServerUrl = this._serverBranch === branchName ? this._serverUrl : undefined;
		const discoveredUrl = isWorkbenchAppPreviewUrlForBranch(this._discoveredUrlBranchName, branchName) ? adaptWorkbenchAppPreviewUrlToPort(this._discoveredUrl, runtime.port) : undefined;
		const configuredUrl = await this._resolveConfiguredPreviewUrl(root, branchName, runtime);
		const url = configuredUrl ?? resolveWorkbenchAppPreviewPreferredUrl({
			runningServerUrl,
			discoveredUrl,
			allowRunningServerFallback: !options?.preferRunningServer,
		});

		if (!url) {
			if (branchChanged || options?.forceNavigate || options?.preferRunningServer) {
				this._showPreviewSetupState(root, branchName);
			}
			return;
		}

		this._navigatePreviewUrl(url, runtime, {
			isNewPreview: !!options?.isNewPreview,
			branchChanged,
			forceNavigate: this._shouldForcePreferredNavigation(!!options?.forceNavigate, !!options?.isNewPreview, branchOpenedInSession),
			branchOpenedInSession,
		});
		this._previewBranchesOpenedThisSession.add(branchSessionKey);
	}

	private _shouldForcePreferredNavigation(forceNavigate: boolean, isNewPreview: boolean, branchOpenedInSession: boolean): boolean {
		if (!forceNavigate) {
			return false;
		}

		return shouldForceNavigateWorkbenchAppPreview({
			currentUrl: this._preview?.url,
			isNewPreview,
			branchOpenedInSession,
		});
	}

	private _getBranchSessionKey(root: URI, branchName: string | undefined): string {
		return `${root.toString()}#${branchName ?? '<detached>'}`;
	}

	private _navigatePreviewUrl(url: string, runtime: IWorkbenchAppPreviewBranchRuntime, options: { isNewPreview: boolean; branchChanged: boolean; forceNavigate: boolean; branchOpenedInSession?: boolean }): void {
		const root = getWorkspaceRoot(this._workspaceContextService);
		if (!root || !this._preview || this._preview.isDisposed()) {
			return;
		}

		const shouldNavigate = options.forceNavigate || shouldNavigateWorkbenchAppPreview({
			currentUrl: this._preview.url,
			preferredUrl: url,
			isNewPreview: options.isNewPreview,
			branchChanged: options.branchChanged,
			branchOpenedInSession: options.branchOpenedInSession,
		});
		if (shouldNavigate) {
			storeBranchRuntime(this._storageService, root, this._lastBranchName, { ...runtime, lastUrl: url });
			this._previewStartupPageKey = undefined;
			this._activeManagedPreviewUrl = isWorkbenchAppPreviewManagedLocalUrl(url, runtime.port) ? url : undefined;
			this._preview?.navigate(url);
		}
	}

	private async _resolveConfiguredPreviewUrl(root: URI, branchName: string | undefined, runtime: IWorkbenchAppPreviewBranchRuntime): Promise<string | undefined> {
		return (await this._resolveConfiguredPreviewTargets(root, branchName, runtime))[0]?.url;
	}

	private async _resolveConfiguredPreviewTargets(root: URI, branchName: string | undefined, runtime: IWorkbenchAppPreviewBranchRuntime): Promise<readonly IWorkbenchAppPreviewHomeTarget[]> {
		const config = await readPreviewConfig(this._fileService, root);
		const overrides = getRepoOverride(parsePreviewOverrides(this._storageService.get(APP_PREVIEW_OVERRIDES_STORAGE_KEY, StorageScope.APPLICATION)), root);
		const legacyOverride = this._getLegacyOverrideUrl();
		const localDefaultOverride = adaptWorkbenchAppPreviewUrlToPort(overrides.default ?? legacyOverride, runtime.port);
		const runningServerUrl = this._serverBranch === branchName ? this._serverUrl : undefined;
		return resolveWorkbenchAppPreviewHomeTargets({
			localBranchOverride: adaptWorkbenchAppPreviewUrlToPort(branchName ? overrides.branches?.[branchName] : undefined, runtime.port),
			localDefaultOverride,
			repoBranchUrl: adaptWorkbenchAppPreviewUrlToPort(getPreviewBranchUrl(config, branchName), runtime.port),
			repoDefaultUrl: adaptWorkbenchAppPreviewUrlToPort(getDefaultPreviewUrl(config), runtime.port),
			runningServerUrl,
		}).map(target => ({ ...target, url: this._resolvePreviewTargetUrl(root, target.url) }));
	}

	private _resolvePreviewTargetUrl(root: URI, url: string): string {
		const trimmed = url.trim();
		if (hasWorkbenchAppPreviewPortTemplate(trimmed)) {
			return trimmed;
		}

		if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed)) {
			return trimmed;
		}

		if (trimmed.startsWith('/')) {
			return URI.file(trimmed).toString();
		}

		return joinPath(root, trimmed).toString();
	}

	private async _shouldOpenConfiguredPreviewWithoutServer(root: URI, branchName: string | undefined, configuredUrl: string): Promise<boolean> {
		if (hasWorkbenchAppPreviewPortTemplate(configuredUrl)) {
			return false;
		}

		if (this._isFilePreviewUrl(configuredUrl)) {
			return true;
		}

		return !await this._resolveRunnablePreviewServerConfig(root, branchName);
	}

	private _isFilePreviewUrl(url: string): boolean {
		try {
			return new URL(url).protocol === 'file:';
		} catch {
			return false;
		}
	}

	private async _resolveRunnablePreviewServerConfig(root: URI, branchName: string | undefined, devConfig?: IWorkbenchAppPreviewDevConfig): Promise<IResolvedWorkbenchAppPreviewDevConfig | undefined> {
		const resolvedDevConfig = devConfig ?? await readDevConfig(this._fileService, root);
		if (resolvedDevConfig) {
			const resolved = resolveWorkbenchAppPreviewDevConfig(resolvedDevConfig, branchName);
			if (resolved || !shouldFallbackFromWorkbenchAppPreviewDevConfig(resolvedDevConfig, branchName)) {
				return resolved;
			}
		}

		const previewConfig = await readPreviewConfig(this._fileService, root);
		return resolveHeuristicDevConfig(this._fileService, root, getPreviewUrlForBranch(previewConfig, branchName));
	}

	private _showPreviewSetupState(root: URI, branchName: string | undefined): void {
		if (!this._preview || this._preview.isDisposed()) {
			return;
		}

		this._needsConfigurationPrompt = true;
		this._serverMessage = `No preview URL is configured for ${branchName ?? 'the current branch'}. Configure a branch preview URL or start the app from Claude Code.`;
		this._showPreviewStartupPage(this._createPreviewStartupPageState('setup', root, branchName, this._lastWorkspaceContext, {
			message: localize('appPreviewSetupMessage', "No preview URL is configured for this branch. Configure a branch preview URL or restart the preview server."),
			url: this._serverUrl,
			healthUrl: this._serverHealthUrl,
			command: this._serverCommand,
			cwd: this._serverCwd
		}));
	}

	private _getLegacyOverrideUrl(): string | undefined {
		return this._storageService.get(APP_PREVIEW_URL_STORAGE_KEY, StorageScope.WORKSPACE);
	}

	private async _resolveWorkspaceBranchName(root: URI): Promise<string | undefined> {
		try {
			return await this._localGitService.currentBranch(root.fsPath);
		} catch {
			return undefined;
		}
	}

	private async _refreshPreviewFromGit(): Promise<void> {
		const root = getWorkspaceRoot(this._workspaceContextService);
		if (!root) {
			return;
		}

		const rootChanged = this._workspaceRootKey !== undefined && this._workspaceRootKey !== root.toString();
		if (rootChanged) {
			await this._reconcileCurrentWorkspaceContext('repoSwitch');
			return;
		}

		const branchName = await this._resolveWorkspaceBranchName(root);
		const branchObservation = observeWorkbenchAppPreviewBranch({
			hasObservedBranchName: this._hasObservedBranchName,
			lastBranchName: this._lastBranchName,
			currentBranchName: branchName,
		});
		this._lastBranchName = branchObservation.branchName;
		this._hasObservedBranchName = branchObservation.hasObservedBranchName;
		if (branchObservation.changed) {
			await this._reconcileCurrentWorkspaceContext('checkout', branchObservation.previousBranchName);
			return;
		}

		await this.ensurePreview(false);
		await this._navigatePreferredUrl();
	}

	private async _reconcileCurrentWorkspaceContext(reason: IDesignerWorkspaceContext['reason'], previousBranchName?: string): Promise<void> {
		const root = getWorkspaceRoot(this._workspaceContextService);
		if (!root) {
			return;
		}

		await this.reconcileDesignerWorkspaceContext({
			repoPath: root.fsPath,
			branchName: await this._resolveWorkspaceBranchName(root),
			previousBranchName,
			reason
		});
	}

	private _trackActiveGroup(): void {
		this._activeGroupListenerStore.clear();
		this._activeGroupListenerStore.add(this._editorGroupsService.activeGroup.onDidModelChange(() => {
			if (!this._preview || this._preview.isDisposed()) {
				return;
			}

			const activeGroup = this._editorGroupsService.activeGroup;
			if (activeGroup.getIndexOfEditor(this._preview) !== 0 || !activeGroup.isPinned(this._preview)) {
				void this.ensurePreview(false).catch(error => {
					this._logService.error('[WorkbenchAppPreview] Failed to restore app preview tab position.', error);
				});
			}
		}));
	}

	private _scheduleStartupAnchors(): void {
		this._startupAnchorStore.clear();
		for (const delay of STARTUP_ANCHOR_DELAYS) {
			this._startupAnchorStore.add(disposableTimeout(() => {
				void this.ensurePreview(true).catch(error => {
					this._logService.error('[WorkbenchAppPreview] Failed to anchor app preview at startup.', error);
				});
			}, delay));
		}
	}

	private async _handleTerminalData(instance: ITerminalInstance, data: string): Promise<void> {
		if (instance === this._serverTerminal) {
			this._serverRecentOutput = `${this._serverRecentOutput}${data}`.slice(-PREVIEW_SERVER_OUTPUT_LIMIT);
			this._serverLastOutputAt = Date.now();
			const url = this._extractServerAdvertisedUrl(this._serverRecentOutput);
			if (url) {
				await this._adoptServerAdvertisedUrl(url);
			}
			if (isWorkbenchAppPreviewPortConflict(data, this._serverPort)) {
				await this._recoverPreviewPortConflict();
			}
			return;
		}

		const root = getWorkspaceRoot(this._workspaceContextService);
		const rootKey = getUriKey(root);
		if (!rootKey) {
			return;
		}

		const terminalCwdKey = await this._getTerminalCwdKey(instance);
		if (terminalCwdKey !== rootKey) {
			return;
		}

		const [url] = extractLocalhostUrls(data);
		if (url) {
			await this.ensurePreview(false);
			await this.navigateDiscoveredUrl(url);
		}
	}

	private _extractServerAdvertisedUrl(data: string): string | undefined {
		return extractHttpUrls(data).find(url => {
			try {
				const parsed = new URL(url);
				const hostname = parsed.hostname.toLowerCase();
				return hostname === 'localhost' ||
					hostname === '127.0.0.1' ||
					hostname === '::1' ||
					hostname === '0.0.0.0' ||
					hostname === '::' ||
					hostname.startsWith('local.');
			} catch {
				return false;
			}
		});
	}

	private async _adoptServerAdvertisedUrl(url: string): Promise<void> {
		const root = getWorkspaceRoot(this._workspaceContextService);
		if (!root) {
			return;
		}

		const branchName = await this._resolveWorkspaceBranchName(root);
		if (this._serverBranch !== branchName) {
			return;
		}

		const advertisedUrl = normalizeWorkbenchAppPreviewLoopbackUrl(url);
		const normalizedUrl = resolveWorkbenchAppPreviewAdvertisedUrl({
			currentServerUrl: this._serverUrl,
			advertisedUrl
		});
		if (!normalizedUrl) {
			this._logService.info(`[WorkbenchAppPreview] Ignored advertised preview URL ${advertisedUrl}; active server URL is ${this._serverUrl ?? '<none>'}.`);
			return;
		}

		const healthUrl = this._resolveHealthUrl(normalizedUrl, this._serverHealthPath);
		if (this._serverUrl === normalizedUrl && this._serverHealthUrl === healthUrl) {
			return;
		}

		this._serverUrl = normalizedUrl;
		this._serverHealthUrl = healthUrl;
		this._discoveredUrl = normalizedUrl;
		this._discoveredUrlBranchName = branchName;
		storeBranchRuntime(this._storageService, root, branchName, {
			...getBranchRuntime(this._storageService, root, branchName),
			port: this._serverPort,
			lastUrl: normalizedUrl
		});

		if (this._previewStartupInProgress) {
			this._showPreviewStartupPage(this._createPreviewStartupPageState('healthChecking', root, branchName, this._lastWorkspaceContext, {
				message: localize('appPreviewHealthCheckingAdvertisedMessage', "The server is starting. Waiting for the advertised preview address to respond."),
					url: normalizedUrl,
					healthUrl,
					command: this._serverCommand,
					cwd: this._serverCwd
				}));
				return;
			}

			await this.navigateDiscoveredUrl(normalizedUrl);
		}

	private _resolveHealthUrl(url: string, healthPath: string | undefined): string {
		return healthPath ? new URL(healthPath, url).toString() : url;
	}

	private _getTerminalCwdKey(instance: ITerminalInstance): Promise<string | undefined> {
		let cached = this._terminalCwdKeys.get(instance.instanceId);
		if (!cached) {
			cached = instance.getInitialCwd()
				.then(cwd => cwd.toLowerCase())
				.catch(() => undefined);
			this._terminalCwdKeys.set(instance.instanceId, cached);
		}
		return cached;
	}

	private async _scanAgentLogs(): Promise<void> {
		for (const resource of await this._getAgentLogResources()) {
			const data = await this._readNewLogData(resource);
			if (!data) {
				continue;
			}

			const [url] = extractLocalhostUrls(data);
			if (url) {
				await this.ensurePreview(false);
				await this.navigateDiscoveredUrl(url);
				return;
			}
		}
	}

	private async _readNewLogData(resource: URI): Promise<string | undefined> {
		try {
			const content = await this._fileService.readFile(resource);
			const value = content.value.toString();
			const key = resource.toString();
			const previousOffset = this._agentLogOffsets.get(key) ?? Math.max(0, value.length - AGENT_LOG_INITIAL_READ_LIMIT);
			this._agentLogOffsets.set(key, value.length);
			return value.slice(previousOffset);
		} catch {
			return undefined;
		}
	}

	private async _getAgentLogResources(): Promise<URI[]> {
		const resources: URI[] = [];
		const rootLogs = [
			joinPath(this._environmentService.logsHome, 'agenthost.log'),
			joinPath(this._environmentService.logsHome, 'mcpGateway.log'),
		];
		for (const resource of rootLogs) {
			if (await this._fileService.exists(resource)) {
				resources.push(resource);
			}
		}
		try {
			const logs = await this._fileService.resolve(this._environmentService.logsHome);
			for (const child of logs.children ?? []) {
				if (child.name.startsWith('window')) {
					await this._collectAgentLogResources(child.resource, resources, 0);
				}
			}
		} catch {
			// Discovery from terminal output still covers preview startup if logs are unavailable.
		}
		return resources;
	}

	private async _collectAgentLogResources(resource: URI, resources: URI[], depth: number): Promise<void> {
		if (depth > 5) {
			return;
		}

		let stat;
		try {
			stat = await this._fileService.resolve(resource);
		} catch {
			return;
		}

		if (stat.isFile) {
			const path = resource.path;
			if (path.endsWith('/Claude VSCode.log') || path.endsWith('/agentSessionsOutput.log') || path.endsWith('/tasks.log')) {
				resources.push(resource);
			}
			return;
		}

		for (const child of stat.children ?? []) {
			await this._collectAgentLogResources(child.resource, resources, depth + 1);
		}
	}

	async runPreviewServer(): Promise<IPreviewServerStatus> {
		return this._startPreviewServer(false, await this._getCurrentBranchPort());
	}

	async restartPreviewServer(): Promise<IPreviewServerStatus> {
		return this._startPreviewServer(true, await this._getCurrentBranchPort());
	}

	preflightDesignerWorkspaceContext(): IDesignerWorkspaceContextPreflight {
		const activeClaudeSessions = this._chatSessionsService.getInProgress()
			.filter(session => session.chatSessionType === 'claude-code' || session.chatSessionType === 'agent-host-claude')
			.reduce((count, session) => count + session.count, 0);

		if (activeClaudeSessions === 0) {
			return { needsConfirmation: false };
		}

		return {
			needsConfirmation: true,
			message: localize('designerWorkspaceContextActiveClaude', "Claude Code has active work in this window. Switching branches will open a branch-specific Claude session.")
		};
	}

	async reconcileDesignerWorkspaceContext(context: IDesignerWorkspaceContext | undefined): Promise<IAppPreviewCommandStatus> {
		const root = getWorkspaceRoot(this._workspaceContextService);
		if (!root || !context || getUriKey(root) !== context.repoPath.toLowerCase()) {
			this._logService.info(`[WorkbenchAppPreview] Ignored workspace context reconciliation for ${context?.repoPath ?? '<missing>'}#${context?.branchName ?? '<detached>'}; active root is ${root?.fsPath ?? '<none>'}.`);
			return this.getCommandStatus();
		}

		this._lastWorkspaceContext = context;
		this._lastBranchName = context.branchName;
		this._hasObservedBranchName = true;
		this._logService.info(`[WorkbenchAppPreview] Reconciling workspace context ${context.repoPath}#${context.branchName ?? '<detached>'} reason=${context.reason} previous=${context.previousBranchName ?? '<none>'}.`);
		const branchChanged = context.previousBranchName !== undefined && context.previousBranchName !== context.branchName && this._serverBranch !== context.branchName;
		if (branchChanged) {
			this._stopPreviewServer();
		}
		this._previewStartupInProgress = true;
		await this.ensurePreview(false);
		this._showPreviewStartupPage(this._createPreviewStartupPageState('starting', root, context.branchName, context, {
			message: localize('appPreviewStartingMessage', "Preparing the preview for this branch.")
		}));

		const branchName = await this._resolveWorkspaceBranchName(root);
		const configuredUrl = await this._resolveConfiguredPreviewUrl(root, branchName, getBranchRuntime(this._storageService, root, branchName));
		if (configuredUrl && await this._shouldOpenConfiguredPreviewWithoutServer(root, branchName, configuredUrl)) {
			this._showPreviewStartupPage(this._createPreviewStartupPageState('opening', root, context.branchName, context, {
				message: localize('appPreviewOpeningConfiguredMessage', "Opening the configured preview for this repository."),
				url: configuredUrl
			}));
			this._previewStartupInProgress = false;
			const branchOpenedInSession = this._previewBranchesOpenedThisSession.has(this._getBranchSessionKey(root, branchName));
			await this._navigatePreferredUrl({ allowDuringStartup: true, forceNavigate: !branchOpenedInSession });
			await this._reconcileClaudeWorkspaceContext(context);
			return this.getCommandStatus();
		}

		const port = await this._getOrAssignBranchPort(root, context.branchName);
		const serverStatus = await this._startPreviewServer(true, port, false, true, context);
		this._logService.info(`[WorkbenchAppPreview] Preview reconciliation status branch=${serverStatus.branch ?? '<detached>'} state=${serverStatus.state} url=${serverStatus.url ?? '<none>'} message=${serverStatus.message ?? '<none>'}.`);
		if (serverStatus.state !== 'running') {
			this._serverMessage = `${serverStatus.message ?? 'Preview did not update.'} Retry from App Preview when the branch app is ready.`;
		}

		await this._reconcileClaudeWorkspaceContext(context);
		return this.getCommandStatus();
	}

	private async _reconcileClaudeWorkspaceContext(context: IDesignerWorkspaceContext): Promise<void> {
		const errors: unknown[] = [];
		for (const attempt of getWorkbenchAppPreviewClaudeReconciliationCommands()) {
			try {
				await this._commandService.executeCommand(attempt.commandId, ...attempt.args);
				this._logService.info(`[WorkbenchAppPreview] Requested Claude branch session with ${attempt.commandId} for ${context.repoPath}#${context.branchName ?? '<detached>'}.`);
				return;
			} catch (error) {
				errors.push(error);
			}
		}

		this._logService.warn(`[WorkbenchAppPreview] Failed to open Claude session for ${context.repoPath}#${context.branchName ?? '<detached>'}.`, ...errors);
	}

	getPreviewStatus(): IPreviewServerStatus {
		return {
			state: this._serverState,
			health: this._serverHealth,
			url: this._serverUrl,
			healthUrl: this._serverHealthUrl,
			branch: this._serverBranch,
			command: this._serverCommand,
			message: this._serverMessage,
			needsConfigurationPrompt: this._needsConfigurationPrompt,
		};
	}

	async promotePreviewUrl(url: string | undefined): Promise<IPreviewServerStatus> {
		const root = getWorkspaceRoot(this._workspaceContextService);
		if (!root) {
			throw new Error('No workspace is open.');
		}
		const normalized = normalizeHttpUrl((url ?? this._serverUrl ?? '').trim());
		if (!normalized) {
			throw new Error('No valid preview URL is available to promote.');
		}
		const branchName = await this._resolveWorkspaceBranchName(root);
		await writeProjectPreviewUrl(this._fileService, root, branchName, normalized);
		this._needsConfigurationPrompt = false;
		await this._navigatePreferredUrl();
		this._serverMessage = `Saved ${normalized} as the project preview URL${branchName ? ` for ${branchName}` : ''}.`;
		return this.getPreviewStatus();
	}

	async getCommandStatus(): Promise<IAppPreviewCommandStatus> {
		const root = getWorkspaceRoot(this._workspaceContextService);
		const branch = root ? await this._resolveWorkspaceBranchName(root) : undefined;
		return this._toCommandStatus(branch);
	}

	async navigateAppPreview(url: string | undefined): Promise<IAppPreviewCommandStatus> {
		const normalized = normalizeHttpUrl((url ?? '').trim());
		if (!normalized) {
			throw new Error('No valid App Preview URL was provided.');
		}

		const root = getWorkspaceRoot(this._workspaceContextService);
		const branchName = this._serverBranch ?? (root ? await this._resolveWorkspaceBranchName(root) : undefined);
		const runtime = root ? getBranchRuntime(this._storageService, root, branchName) : {};
		const branchUrl = adaptWorkbenchAppPreviewUrlToPort(normalized, runtime.port) ?? normalized;
		const preview = await this._requirePreview(true, { skipPreferredNavigation: true });
		this._previewStartupPageKey = undefined;
		this._activeManagedPreviewUrl = isWorkbenchAppPreviewManagedLocalUrl(branchUrl, runtime.port) ? branchUrl : undefined;
		preview.navigate(branchUrl);
		this._discoveredUrl = branchUrl;
		if (root) {
			storeBranchRuntime(this._storageService, root, branchName, { ...runtime, lastUrl: branchUrl });
			this._previewBranchesOpenedThisSession.add(this._getBranchSessionKey(root, branchName));
		}
		await this._playwrightService.startTrackingPage(preview.id);
		return {
			...await this.getCommandStatus(),
			currentUrl: branchUrl,
		};
	}

	async navigateAppPreviewHome(): Promise<IAppPreviewCommandStatus> {
		const context = await this._resolveAppPreviewHomeContext();
		if (!context.targets.length) {
			this._showPreviewSetupState(context.root, context.branchName);
			return this.getCommandStatus();
		}

		return this._navigateAppPreviewHomeTarget(context, context.targets[0]);
	}

	async pickAppPreviewHome(): Promise<IAppPreviewCommandStatus> {
		const context = await this._resolveAppPreviewHomeContext();
		if (!context.targets.length) {
			this._showPreviewSetupState(context.root, context.branchName);
			return this.getCommandStatus();
		}

		const pick = await this._quickInputService.pick(context.targets.map(target => ({
			label: this._getAppPreviewHomeTargetLabel(target),
			description: target.url,
			target,
		})), {
			canPickMany: false,
			placeHolder: localize('appPreviewHomeTargetPickerPlaceholder', "Choose an App Preview home URL"),
			ignoreFocusLost: true,
		});
		if (!pick) {
			return this.getCommandStatus();
		}

		return this._navigateAppPreviewHomeTarget(context, pick.target);
	}

	private async _resolveAppPreviewHomeContext(): Promise<{ root: URI; branchName: string | undefined; runtime: IWorkbenchAppPreviewBranchRuntime; targets: readonly IWorkbenchAppPreviewHomeTarget[] }> {
		const root = getWorkspaceRoot(this._workspaceContextService);
		if (!root) {
			throw new Error('No workspace is open.');
		}

		const branchName = await this._resolveWorkspaceBranchName(root);
		const runtime = getBranchRuntime(this._storageService, root, branchName);
		return {
			root,
			branchName,
			runtime,
			targets: await this._resolveConfiguredPreviewTargets(root, branchName, runtime),
		};
	}

	private async _navigateAppPreviewHomeTarget(context: { root: URI; branchName: string | undefined; runtime: IWorkbenchAppPreviewBranchRuntime }, target: IWorkbenchAppPreviewHomeTarget): Promise<IAppPreviewCommandStatus> {
		this._lastBranchName = context.branchName;
		this._hasObservedBranchName = true;
		const preview = await this._requirePreview(true, { skipPreferredNavigation: true });
		this._previewBranchesOpenedThisSession.add(this._getBranchSessionKey(context.root, context.branchName));
		this._navigatePreviewUrl(target.url, context.runtime, {
			isNewPreview: false,
			branchChanged: false,
			forceNavigate: true,
		});
		await this._playwrightService.startTrackingPage(preview.id);
		return {
			...await this.getCommandStatus(),
			currentUrl: target.url,
		};
	}

	private _getAppPreviewHomeTargetLabel(target: IWorkbenchAppPreviewHomeTarget): string {
		switch (target.source) {
			case 'localBranchOverride':
				return localize('appPreviewHomeLocalBranchOverride', "Local Branch Override");
			case 'localCanonicalBranchUrl':
				return localize('appPreviewHomeLocalCanonicalBranchUrl', "Local Canonical Branch URL");
			case 'localCanonicalDefaultUrl':
				return localize('appPreviewHomeLocalCanonicalDefaultUrl', "Local Canonical Default URL");
			case 'localDefaultOverride':
				return localize('appPreviewHomeLocalDefaultOverride', "Local Default Override");
			case 'repoBranchUrl':
				return localize('appPreviewHomeCanonicalBranchUrl', "Canonical Branch URL");
			case 'repoDefaultUrl':
				return localize('appPreviewHomeCanonicalDefaultUrl', "Canonical Default URL");
		}
	}

	async readAppPreview(): Promise<{ pageId: string; url?: string; title?: string; summary: string }> {
		const preview = await this._requireTrackedPreview();
		const summary = await this._playwrightService.getSummary(APP_PREVIEW_PLAYWRIGHT_SESSION_ID, preview.id);
		return {
			pageId: preview.id,
			url: preview.url,
			title: preview.getName(),
			summary,
		};
	}

	async screenshotAppPreview(args?: IAppPreviewScreenshotCommandArgs): Promise<{ pageId: string; mimeType: string; data: string }> {
		const preview = await this._requireTrackedPreview();
		const model = await preview.resolve();
		let selector = args?.selector;
		if (args?.ref) {
			selector = `aria-ref=${args.ref}`;
		}
		const bounds = selector && await playwrightInvokeRaw(this._playwrightService, APP_PREVIEW_PLAYWRIGHT_SESSION_ID, preview.id, async (page, selector, scrollIntoViewIfNeeded) => {
			const locator = page.locator(selector);
			if (scrollIntoViewIfNeeded) {
				await locator.scrollIntoViewIfNeeded();
			}
			const bounds = await locator.boundingBox();
			if (!bounds) {
				throw new Error(`No element matched selector "${selector}".`);
			}
			return bounds;
		}, selector, args?.scrollIntoViewIfNeeded ?? false) || undefined;
		const screenshot = await model.captureScreenshot({ pageRect: bounds });
		return {
			pageId: preview.id,
			mimeType: 'image/jpeg',
			data: encodeBase64(screenshot),
		};
	}

	async clickAppPreview(args?: IAppPreviewClickCommandArgs): Promise<{ pageId: string; summary: string }> {
		const preview = await this._requireTrackedPreview();
		const selector = this._resolveSelector(args);
		const button = args?.button ?? 'left';
		if (args?.doubleClick || args?.dblClick) {
			await playwrightInvokeRaw(this._playwrightService, APP_PREVIEW_PLAYWRIGHT_SESSION_ID, preview.id, (page, sel, btn) => page.locator(sel).dblclick({ button: btn }), selector, button);
		} else {
			await playwrightInvokeRaw(this._playwrightService, APP_PREVIEW_PLAYWRIGHT_SESSION_ID, preview.id, (page, sel, btn) => page.locator(sel).click({ button: btn }), selector, button);
		}
		return {
			pageId: preview.id,
			summary: await this._playwrightService.getSummary(APP_PREVIEW_PLAYWRIGHT_SESSION_ID, preview.id),
		};
	}

	async typeInAppPreview(args?: IAppPreviewTypeCommandArgs): Promise<{ pageId: string; summary: string }> {
		const preview = await this._requireTrackedPreview();
		let selector = args?.selector;
		if (args?.ref) {
			selector = `aria-ref=${args.ref}`;
		}

		if (!args?.text && !args?.key) {
			throw new Error('Either a "text" or "key" parameter is required.');
		}

		if (args.key) {
			if (selector) {
				await playwrightInvokeRaw(this._playwrightService, APP_PREVIEW_PLAYWRIGHT_SESSION_ID, preview.id, (page, sel, key) => page.locator(sel).press(key), selector, args.key);
			} else {
				await playwrightInvokeRaw(this._playwrightService, APP_PREVIEW_PLAYWRIGHT_SESSION_ID, preview.id, (page, key) => page.keyboard.press(key), args.key);
			}
		} else if (selector) {
			await playwrightInvokeRaw(this._playwrightService, APP_PREVIEW_PLAYWRIGHT_SESSION_ID, preview.id, async (page, sel, text, submit) => {
				const locator = page.locator(sel);
				await locator.fill(text);
				if (submit) {
					await locator.press('Enter');
				}
			}, selector, args.text!, args.submit ?? false);
		} else {
			await playwrightInvokeRaw(this._playwrightService, APP_PREVIEW_PLAYWRIGHT_SESSION_ID, preview.id, async (page, text, submit) => {
				await page.keyboard.type(text);
				if (submit) {
					await page.keyboard.press('Enter');
				}
			}, args.text!, args.submit ?? false);
		}

		return {
			pageId: preview.id,
			summary: await this._playwrightService.getSummary(APP_PREVIEW_PLAYWRIGHT_SESSION_ID, preview.id),
		};
	}

	private _registerAppPreviewCommands(): void {
		this._register(CommandsRegistry.registerCommand(GetWorkbenchAppPreviewStatusCommandId, () => this.getCommandStatus()));
		this._register(CommandsRegistry.registerCommand(RunWorkbenchAppPreviewServerCommandId, async () => {
			await this.runPreviewServer();
			return this.getCommandStatus();
		}));
		this._register(CommandsRegistry.registerCommand(RestartWorkbenchAppPreviewServerCommandId, async () => {
			await this.restartPreviewServer();
			return this.getCommandStatus();
		}));
		this._register(CommandsRegistry.registerCommand(NavigateWorkbenchAppPreviewCommandId, (_accessor, args?: IAppPreviewNavigateCommandArgs) => this.navigateAppPreview(args?.url)));
		this._register(CommandsRegistry.registerCommand(NavigateWorkbenchAppPreviewHomeCommandId, () => this.navigateAppPreviewHome()));
		this._register(CommandsRegistry.registerCommand(PickWorkbenchAppPreviewHomeCommandId, () => this.pickAppPreviewHome()));
		this._register(CommandsRegistry.registerCommand(ReadWorkbenchAppPreviewCommandId, () => this.readAppPreview()));
		this._register(CommandsRegistry.registerCommand(ScreenshotWorkbenchAppPreviewCommandId, (_accessor, args?: IAppPreviewScreenshotCommandArgs) => this.screenshotAppPreview(args)));
		this._register(CommandsRegistry.registerCommand(ClickWorkbenchAppPreviewCommandId, (_accessor, args?: IAppPreviewClickCommandArgs) => this.clickAppPreview(args)));
		this._register(CommandsRegistry.registerCommand(TypeWorkbenchAppPreviewCommandId, (_accessor, args?: IAppPreviewTypeCommandArgs) => this.typeInAppPreview(args)));
		this._register(CommandsRegistry.registerCommand(PreflightDesignerWorkspaceContextCommandId, () => this.preflightDesignerWorkspaceContext()));
		this._register(CommandsRegistry.registerCommand(DesignerWorkspaceContextChangedCommandId, (_accessor, context?: IDesignerWorkspaceContext) => this.reconcileDesignerWorkspaceContext(context)));
	}

	private async _requirePreview(reveal: boolean, options?: { skipPreferredNavigation?: boolean }): Promise<BrowserEditorInput> {
		const preview = await this.ensurePreview(reveal, options);
		if (!preview || preview.isDisposed()) {
			throw new Error('App Preview is not available.');
		}
		return preview;
	}

	private async _requireTrackedPreview(): Promise<BrowserEditorInput> {
		const preview = await this._requirePreview(true);
		if (!preview.url) {
			throw new Error('No URL configured.');
		}
		await this._playwrightService.startTrackingPage(preview.id);
		return preview;
	}

	private _resolveSelector(args: IAppPreviewClickCommandArgs | undefined): string {
		if (args?.ref) {
			return `aria-ref=${args.ref}`;
		}
		if (args?.selector) {
			return args.selector;
		}
		throw new Error('Either a "ref" or "selector" parameter is required.');
	}

	private _toCommandStatus(branch: string | undefined): IAppPreviewCommandStatus {
		const status = this.getPreviewStatus();
		return {
			...status,
			branch: branch ?? status.branch,
			previewAvailable: !!this._preview && !this._preview.isDisposed(),
			pageId: this._preview && !this._preview.isDisposed() ? this._preview.id : undefined,
			title: this._preview && !this._preview.isDisposed() ? this._preview.getName() : undefined,
			currentUrl: this._preview && !this._preview.isDisposed() ? this._preview.url : undefined,
		};
	}

	private _startPreviewServer(forceRestart: boolean, requestedPort?: number, portConflictRetry = false, waitForHealthy = false, context?: IDesignerWorkspaceContext): Promise<IPreviewServerStatus> {
		if (this._serverStartInFlight && !forceRestart && !portConflictRetry) {
			return this._serverStartInFlight;
		}

		const startPromise = this._doStartPreviewServer(forceRestart, requestedPort, portConflictRetry, waitForHealthy, context);
		this._serverStartInFlight = startPromise;
		return startPromise.finally(() => {
			if (this._serverStartInFlight === startPromise) {
				this._serverStartInFlight = undefined;
			}
		});
	}

	private async _doStartPreviewServer(forceRestart: boolean, requestedPort?: number, portConflictRetry = false, waitForHealthy = false, context?: IDesignerWorkspaceContext): Promise<IPreviewServerStatus> {
		const root = getWorkspaceRoot(this._workspaceContextService);
		if (!root) {
			throw new Error('No workspace is open.');
		}

		if (!portConflictRetry) {
			this._portConflictRecoveryAttempts = 0;
		}
		const backgroundRestartAttempts = this._backgroundRestartAttempts;
		if (forceRestart || this._serverTerminal) {
			this._stopPreviewServer();
		}
		const startGeneration = ++this._serverStartGeneration;
		const isCurrentStart = () => startGeneration === this._serverStartGeneration;
		if (!waitForHealthy && backgroundRestartAttempts > 0) {
			this._backgroundRestartAttempts = backgroundRestartAttempts;
			this._backgroundRestartInFlight = true;
		}

		this._serverState = 'starting';
		this._serverHealth = 'unknown';
		this._serverMessage = undefined;
		this._serverRecentOutput = '';
		this._serverLastOutputAt = undefined;
		this._previewStartupPhase = undefined;
		this._previewStartupPhaseStartedAt = 0;
		this._lastHealthError = undefined;
		this._needsConfigurationPrompt = false;
		this._previewStartupInProgress = waitForHealthy;
		this._consecutiveHealthFailures = 0;
		if (!portConflictRetry) {
			this._backgroundRestartAttempts = waitForHealthy ? 0 : this._backgroundRestartAttempts;
		}

		const branchName = await this._resolveWorkspaceBranchName(root);
		if (!isCurrentStart()) {
			return this.getPreviewStatus();
		}
		const devConfig = await readDevConfig(this._fileService, root);
		if (!isCurrentStart()) {
			return this.getPreviewStatus();
		}
		const resolvedConfig = await this._resolveRunnablePreviewServerConfig(root, branchName, devConfig);
		if (!isCurrentStart()) {
			return this.getPreviewStatus();
		}
		if (!resolvedConfig) {
			this._serverState = 'failed';
			this._serverMessage = devConfig ? `Invalid ${DEV_CONFIG_PATH}: expected a default command.` : `No ${DEV_CONFIG_PATH} or runnable package script was found.`;
			this._previewStartupInProgress = false;
			this._showPreviewStartupPage(this._createPreviewStartupPageState('failed', root, branchName, context, {
				message: this._serverMessage,
			}));
			return this.getPreviewStatus();
		}

		const fixedPort = getWorkbenchAppPreviewDevConfigFixedPort(resolvedConfig);
		const port = fixedPort ?? (requestedPort && await this._isPortAvailable(requestedPort) ? requestedPort : await this._findAvailablePort());
		const resolvedServer = applyWorkbenchAppPreviewDevPort(resolvedConfig, port);
		const cwd = resolvedConfig.cwd ? joinPath(root, resolvedConfig.cwd).fsPath : root.fsPath;
		this._serverUrl = resolvedServer.url;
		this._serverHealthUrl = resolvedServer.healthUrl;
		this._serverHealthPath = resolvedConfig.healthPath;
		this._serverBranch = branchName;
		this._serverCommand = resolvedServer.command;
		this._serverPort = port;
		this._serverFixedPort = fixedPort;
		this._serverCwd = cwd;
		storeBranchRuntime(this._storageService, root, branchName, {
			...getBranchRuntime(this._storageService, root, branchName),
			port,
			lastUrl: resolvedServer.url
		});

		await this.ensurePreview(false);
		if (waitForHealthy) {
			this._showPreviewStartupPage(this._createPreviewStartupPageState('serverStarting', root, branchName, context, {
				message: localize('appPreviewServerStartingMessage', "Starting the preview server for this branch."),
				url: resolvedServer.url,
				healthUrl: resolvedServer.healthUrl,
				command: resolvedServer.command,
				cwd
			}));
		} else {
			await this.navigateDiscoveredUrl(resolvedServer.url);
		}
		this._needsConfigurationPrompt = await this._shouldPromptToPromotePreviewUrl(root, branchName);

		try {
			const terminal = await this._terminalService.createTerminal({
				cwd,
				location: TerminalLocation.Panel,
				config: {
					name: localize('appPreviewDevServerTerminalName', "App Preview Server"),
					env: resolvedServer.env,
					hideFromUser: false,
				}
			});
			if (!isCurrentStart()) {
				terminal.dispose();
				return this.getPreviewStatus();
			}
			this._serverTerminal = terminal;
			this._serverTerminalExited = false;
			this._serverTerminalExitStore.clear();
			this._serverTerminalExitStore.add(terminal.onExit(() => {
				this._serverTerminalExited = true;
			}));
			await this._serverTerminal.sendText(resolvedServer.command, true, true);
			if (!isCurrentStart()) {
				return this.getPreviewStatus();
			}
			this._serverState = 'running';
			this._serverMessage = this._needsConfigurationPrompt
				? `Opened ${resolvedServer.url}. Ask the user whether to save this as the branch preview URL.`
				: `Opened ${resolvedServer.url}.`;
			if (waitForHealthy) {
				this._showPreviewStartupPage(this._createPreviewStartupPageState('healthChecking', root, branchName, context, {
					message: localize('appPreviewHealthCheckingMessage', "The server is starting. Waiting for the preview health check to pass."),
					url: resolvedServer.url,
					healthUrl: resolvedServer.healthUrl,
					command: resolvedServer.command,
					cwd
				}));
				const healthy = await this._waitForPreviewHealth(PREVIEW_STARTUP_HEALTH_TIMEOUT);
				if (!isCurrentStart()) {
					return this.getPreviewStatus();
				}
				if (healthy) {
					this._showPreviewStartupPage(this._createPreviewStartupPageState('opening', root, branchName, context, {
						message: localize('appPreviewOpeningMessage', "Health check passed. Opening the preview."),
						url: this._serverUrl,
						healthUrl: this._serverHealthUrl,
						command: this._serverCommand,
						cwd
					}));
					this._previewStartupInProgress = false;
					this._startHealthPolling();
					await this._navigatePreferredUrl({ isNewPreview: false, allowDuringStartup: true, forceNavigate: true, preferRunningServer: true });
				} else if (this._serverTerminalExited) {
					this._serverHealth = 'unhealthy';
					this._serverState = 'failed';
					this._serverMessage = localize('appPreviewServerExitedMessage', "Preview server exited unexpectedly.");
					this._showPreviewStartupPage(this._createPreviewStartupPageState('failed', root, branchName, context, {
						message: localize('appPreviewServerExitedDetails', "The server process exited before the health check passed. Check the terminal logs for errors."),
						url: this._serverUrl,
						healthUrl: this._serverHealthUrl,
						command: this._serverCommand,
						cwd
					}));
					this._previewStartupInProgress = false;
				} else {
					this._serverHealth = 'unhealthy';
					this._serverMessage = localize('appPreviewHealthTimeoutMessage', "Preview is taking longer than expected.");
					this._showPreviewStartupPage(this._createPreviewStartupPageState('slow', root, branchName, context, {
						message: localize('appPreviewHealthTimeoutDetails', "The server started, but the health check did not pass within 2.5 minutes."),
						url: this._serverUrl,
						healthUrl: this._serverHealthUrl,
						command: this._serverCommand,
						cwd
					}));
					this._previewStartupInProgress = false;
					this._startHealthPolling();
				}
			} else {
				this._startHealthPolling();
				void this._checkServerHealth().catch(error => {
					this._logService.warn('[WorkbenchAppPreview] Initial preview server health check failed.', error);
				});
			}
		} catch (error) {
			if (!isCurrentStart()) {
				return this.getPreviewStatus();
			}
			this._serverState = 'failed';
			this._serverHealth = 'unknown';
			this._serverMessage = error instanceof Error ? error.message : String(error);
			this._previewStartupInProgress = false;
			this._showPreviewStartupPage(this._createPreviewStartupPageState('failed', root, branchName, context, {
				message: this._serverMessage,
				url: resolvedServer.url,
				healthUrl: resolvedServer.healthUrl,
				command: resolvedServer.command,
				cwd
			}));
		}

		return this.getPreviewStatus();
	}

	private _showPreviewStartupPage(state: IPreviewStartupPageState): void {
		const preview = this._preview;
		if (!preview || preview.isDisposed()) {
			return;
		}

		this._previewStartupAgentContext = state.agentContext ?? '';
		this._previewStartupPageState = state;
		const pageKey = getWorkbenchAppPreviewStartupPageKey(state);
		if (this._previewStartupPageKey === pageKey && (preview.url ?? '').startsWith('data:text/html;base64,')) {
			return;
		}

		this._previewStartupPageKey = pageKey;
		preview.navigate(createWorkbenchAppPreviewStartupDataUrl(state, APP_PREVIEW_STARTUP_ANIMATION_SRC));
	}

	private _getPreviewStartupStages(phase: PreviewStartupPhase): readonly IPreviewStartupStage[] {
		if (phase === 'setup') {
			return [{
				label: localize('appPreviewStageConfigure', "Configure preview"),
				status: 'current',
				startedAt: this._previewStartupPhaseStartedAt
			}];
		}

		const stageLabels = [
			localize('appPreviewStagePrepare', "Prepare preview"),
			localize('appPreviewStageStartServer', "Start server"),
			localize('appPreviewStageWaitForApp', "Wait for app response"),
			localize('appPreviewStageOpenPreview', "Open preview"),
		];
		const currentIndex = phase === 'starting'
			? 0
			: phase === 'serverStarting'
				? 1
				: phase === 'healthChecking' || phase === 'slow'
					? 2
					: phase === 'opening'
						? 3
						: stageLabels.length;

		const stages = stageLabels.map((label, index): IPreviewStartupStage => ({
			label,
			status: index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'pending',
			startedAt: index === currentIndex ? this._previewStartupPhaseStartedAt : undefined
		}));

		if (phase === 'failed') {
			return [
				...stages.map(stage => stage.status === 'current' ? { ...stage, status: 'done' as const, startedAt: undefined } : stage),
				{
					label: localize('appPreviewStageNeedsAttention', "Needs attention"),
					status: 'current',
					startedAt: this._previewStartupPhaseStartedAt
				}
			];
		}

		return stages;
	}

	private _createPreviewStartupPageState(
		phase: PreviewStartupPhase,
		root: URI,
		branchName: string | undefined,
		context: IDesignerWorkspaceContext | undefined,
		options: {
			message: string;
			url?: string;
			healthUrl?: string;
			command?: string;
			cwd?: string;
		}
	): IPreviewStartupPageState {
		if (this._previewStartupPhase !== phase || !this._previewStartupPhaseStartedAt) {
			this._previewStartupPhase = phase;
			this._previewStartupPhaseStartedAt = Date.now();
		}
		const title = getWorkbenchAppPreviewStartupTitle(phase, branchName);
		const details = [
			phase === 'starting' ? localize('appPreviewStartingDetails', "Switching branches is complete. The preview server is being prepared.") : undefined,
			phase === 'serverStarting' ? localize('appPreviewServerInitializing', "Server is initializing.") : undefined,
			phase === 'healthChecking' ? localize('appPreviewHealthCheckWaiting', "Health check is waiting for the app to respond.") : undefined,
			phase === 'slow' ? localize('appPreviewSlowHint', "The server may still be compiling or waiting on a dependency.") : undefined,
			phase === 'failed' ? localize('appPreviewFailedHint', "Check the terminal logs or restart the preview server.") : undefined,
			phase === 'setup' ? localize('appPreviewSetupHint', "The current branch does not have a saved preview URL.") : undefined,
		].filter((value): value is string => !!value);
		const actions: IPreviewStartupPageState['actions'] = phase === 'slow'
			? ['retry', 'restart', 'logs', 'copy']
			: phase === 'failed' || phase === 'setup'
				? ['retry', 'restart', 'logs']
				: [];

		return {
			phase,
			title,
			message: options.message,
			stages: this._getPreviewStartupStages(phase),
			currentStageStartedAt: this._previewStartupPhaseStartedAt,
			lastServerOutputAt: this._serverLastOutputAt,
			repoPath: root.fsPath,
			branchName,
			previousBranchName: context?.previousBranchName,
			port: this._serverPort,
			url: options.url ?? this._serverUrl,
			healthUrl: options.healthUrl ?? this._serverHealthUrl,
			command: options.command ?? this._serverCommand,
			cwd: options.cwd ?? this._serverCwd,
			details,
			agentContext: this._createPreviewAgentContext(root, branchName, context, options.message),
			actions
		};
	}

	private _createPreviewAgentContext(root: URI, branchName: string | undefined, context: IDesignerWorkspaceContext | undefined, message: string): string {
		return [
			'Help diagnose this App Preview startup issue.',
			`Message: ${message}`,
			`Project: ${root.fsPath}`,
			`Branch: ${branchName ?? '<detached>'}`,
			context?.previousBranchName ? `Previous branch: ${context.previousBranchName}` : undefined,
			context?.reason ? `Reason: ${context.reason}` : undefined,
			this._serverCommand ? `Command: ${this._serverCommand}` : undefined,
			this._serverCwd ? `Working directory: ${this._serverCwd}` : undefined,
			this._serverPort ? `Assigned port: ${this._serverPort}` : undefined,
			this._serverUrl ? `Preview URL: ${this._serverUrl}` : undefined,
			this._serverHealthUrl ? `Health URL: ${this._serverHealthUrl}` : undefined,
			`Server state: ${this._serverState}`,
			`Health state: ${this._serverHealth}`,
			this._lastHealthError ? `Last health error: ${this._lastHealthError}` : undefined,
			this._serverRecentOutput ? `Recent server output:\n${this._serverRecentOutput}` : undefined,
		].filter((value): value is string => !!value).join('\n');
	}

	private async _waitForPreviewHealth(timeoutMs: number): Promise<boolean> {
		const startedAt = Date.now();
		while (Date.now() - startedAt < timeoutMs) {
			if (await this._checkServerHealthNow()) {
				return true;
			}
			if (this._serverTerminalExited) {
				return false;
			}
			await new Promise(resolve => mainWindow.setTimeout(resolve, PREVIEW_STARTUP_HEALTH_INTERVAL));
		}
		return false;
	}

	private _stopPreviewServer(): void {
		this._serverStartGeneration++;
		this._serverHealthPollStore.clear();
		this._serverTerminalExitStore.clear();
		this._serverTerminal?.dispose();
		this._serverTerminal = undefined;
		this._serverTerminalExited = true;
		this._serverState = 'stopped';
		this._serverHealth = 'unknown';
		this._serverUrl = undefined;
		this._activeManagedPreviewUrl = undefined;
		this._serverHealthUrl = undefined;
		this._serverHealthPath = undefined;
		this._serverBranch = undefined;
		this._serverCommand = undefined;
		this._serverPort = undefined;
		this._serverFixedPort = undefined;
		this._serverCwd = undefined;
		this._serverMessage = undefined;
		this._serverRecentOutput = '';
		this._serverLastOutputAt = undefined;
		this._previewStartupPhase = undefined;
		this._previewStartupPhaseStartedAt = 0;
		this._lastHealthError = undefined;
		this._previewStartupInProgress = false;
		this._consecutiveHealthFailures = 0;
		this._backgroundRestartAttempts = 0;
		this._backgroundRestartInFlight = false;
		this._previewAutoStartInFlight = false;
		this._healthCheckInFlight = false;
		this._needsConfigurationPrompt = false;
	}

	private _startHealthPolling(): void {
		this._serverHealthPollStore.clear();
		const interval = mainWindow.setInterval(() => {
			void this._checkServerHealth().catch(error => {
				this._logService.warn('[WorkbenchAppPreview] Preview server health check failed.', error);
			});
		}, SERVER_HEALTH_POLL_INTERVAL);
		this._serverHealthPollStore.add(toDisposable(() => mainWindow.clearInterval(interval)));
	}

	private async _checkServerHealth(): Promise<void> {
		if (!this._serverHealthUrl || this._serverState !== 'running') {
			return;
		}
		if (this._healthCheckInFlight) {
			return;
		}
		this._healthCheckInFlight = true;
		try {
			await this._checkServerHealthCore();
		} finally {
			this._healthCheckInFlight = false;
		}
	}

	private async _checkServerHealthCore(): Promise<void> {
		const healthy = await this._checkServerHealthNow();
		if (healthy) {
			this._consecutiveHealthFailures = 0;
			this._backgroundRestartAttempts = 0;
			await this._clearPreviewHealthOverlay();
			await this._openPreviewAfterStartupRecovery();
			return;
		}

		this._consecutiveHealthFailures++;
		if (this._consecutiveHealthFailures >= MAX_BACKGROUND_HEALTH_FAILURES) {
			await this._handleBackgroundHealthFailure();
		}
	}

	private async _openPreviewAfterStartupRecovery(): Promise<void> {
		if (this._previewStartupPhase !== 'slow' || !this._preview || this._preview.isDisposed()) {
			return;
		}

		const currentUrl = this._preview.url;
		if (!currentUrl?.startsWith('data:text/html;base64,')) {
			return;
		}

		const root = getWorkspaceRoot(this._workspaceContextService);
		if (!root) {
			return;
		}

		const branchName = await this._resolveWorkspaceBranchName(root);
		this._showPreviewStartupPage(this._createPreviewStartupPageState('opening', root, branchName, this._lastWorkspaceContext, {
			message: localize('appPreviewRecoveredOpeningMessage', "Health check passed. Opening the preview."),
			url: this._serverUrl,
			healthUrl: this._serverHealthUrl,
			command: this._serverCommand,
			cwd: this._serverCwd
		}));
		await this._navigatePreferredUrl({ allowDuringStartup: true, forceNavigate: true, preferRunningServer: true });
	}

	private async _fetchHealth(url: string, init?: RequestInit): Promise<Response> {
		const controller = new AbortController();
		const timeout = mainWindow.setTimeout(() => controller.abort(), PREVIEW_HEALTH_FETCH_TIMEOUT);
		try {
			return await fetch(url, { ...init, signal: controller.signal });
		} finally {
			mainWindow.clearTimeout(timeout);
		}
	}

	private async _checkServerHealthNow(): Promise<boolean> {
		if (!this._serverHealthUrl || this._serverState !== 'running') {
			return false;
		}
		try {
			const mode = getWorkbenchAppPreviewHealthFetchMode(this._serverHealthUrl);
			const response = await this._fetchHealth(this._serverHealthUrl, { method: 'GET', cache: 'no-store', mode });
			if (mode === 'no-cors') {
				this._serverHealth = 'healthy';
				this._lastHealthError = undefined;
				return true;
			}
			this._serverHealth = response.ok ? 'healthy' : 'unhealthy';
			this._lastHealthError = response.ok ? undefined : `${response.status} ${response.statusText}`.trim();
			return response.ok;
		} catch (error) {
			try {
				await this._fetchHealth(this._serverHealthUrl, { method: 'GET', cache: 'no-store', mode: 'no-cors' });
				this._serverHealth = 'healthy';
				this._lastHealthError = undefined;
				return true;
			} catch {
				this._lastHealthError = error instanceof Error ? `Health check request failed: ${error.message}` : 'Health check request failed.';
				this._serverHealth = 'unhealthy';
				return false;
			}
		}
	}

	private async _handlePreviewLoadingState(event: IBrowserViewLoadingEvent): Promise<void> {
		if (event.loading || !event.error || this._previewStartupInProgress || this._previewLoadFailureRecoveryInFlight) {
			return;
		}

		if (this._isRecoverablePreviewLoadError(event.error)) {
			const root = getWorkspaceRoot(this._workspaceContextService);
			if (!root) {
				return;
			}

			this._previewLoadFailureRecoveryInFlight = true;
			try {
				const branchName = await this._resolveWorkspaceBranchName(root);
				this._lastHealthError = `${event.error.errorDescription} (${event.error.errorCode}) while loading ${event.error.url}`;
				this._serverHealth = 'unhealthy';
				if (event.error.errorCode === -7 && this._isManagedPreviewServerProcessAlive()) {
					this._showPreviewStartupPage(this._createPreviewStartupPageState('slow', root, branchName, this._lastWorkspaceContext, {
						message: localize('appPreviewLoadTimedOutWaiting', "Preview is taking longer than expected. Waiting for the app to respond."),
						url: this._serverUrl ?? event.error.url,
						healthUrl: this._serverHealthUrl,
						command: this._serverCommand,
						cwd: this._serverCwd
					}));
					return;
				}

				this._showPreviewStartupPage(this._createPreviewStartupPageState('serverStarting', root, branchName, this._lastWorkspaceContext, {
					message: localize('appPreviewLoadFailedRestarting', "Preview lost connection. Restarting the server and reopening when it is ready."),
					url: this._serverUrl ?? event.error.url,
					healthUrl: this._serverHealthUrl,
					command: this._serverCommand,
					cwd: this._serverCwd
				}));
				await this._startPreviewServer(true, await this._getOrAssignBranchPort(root, branchName), false, true, this._lastWorkspaceContext);
			} finally {
				this._previewLoadFailureRecoveryInFlight = false;
			}
			return;
		}

		if (this._isUnmanagedLocalhostConnectionFailure(event.error)) {
			await this._handleUnmanagedLocalhostConnectionFailure(event.error);
		}
	}

	private _isRecoverablePreviewLoadError(error: IBrowserViewLoadError): boolean {
		return shouldRecoverWorkbenchAppPreviewLoadError({
			errorUrl: error.url,
			errorCode: error.errorCode,
			serverUrl: this._serverUrl,
			activeManagedPreviewUrl: this._activeManagedPreviewUrl,
		});
	}

	private _isUnmanagedLocalhostConnectionFailure(error: IBrowserViewLoadError): boolean {
		return (
			(error.errorCode === -102 || error.errorCode === -105 || error.errorCode === -106) &&
			isWorkbenchAppPreviewLoopbackUrl(error.url)
		);
	}

	private async _handleUnmanagedLocalhostConnectionFailure(error: IBrowserViewLoadError): Promise<void> {
		const root = getWorkspaceRoot(this._workspaceContextService);
		if (!root) {
			return;
		}

		this._previewLoadFailureRecoveryInFlight = true;
		try {
			const branchName = await this._resolveWorkspaceBranchName(root);
			const devConfig = await readDevConfig(this._fileService, root);

			if (devConfig) {
				this._showPreviewStartupPage(this._createPreviewStartupPageState('serverStarting', root, branchName, this._lastWorkspaceContext, {
					message: localize('appPreviewUnmanagedStarting', "Preview server is not running. Starting it now."),
					url: error.url,
				}));
				await this._startPreviewServer(true, await this._getOrAssignBranchPort(root, branchName), false, true, this._lastWorkspaceContext);
			} else {
				this._showPreviewSetupState(root, branchName);
			}
		} finally {
			this._previewLoadFailureRecoveryInFlight = false;
		}
	}

	private async _handleBackgroundHealthFailure(): Promise<void> {
		if (this._previewStartupInProgress || this._backgroundRestartInFlight) {
			return;
		}

		const root = getWorkspaceRoot(this._workspaceContextService);
		const branchName = root ? await this._resolveWorkspaceBranchName(root) : undefined;
		if (!root) {
			return;
		}

		if (this._backgroundRestartAttempts >= MAX_BACKGROUND_RESTART_ATTEMPTS) {
			this._showPreviewStartupPage(this._createPreviewStartupPageState('slow', root, branchName, this._lastWorkspaceContext, {
				message: localize('appPreviewBackgroundRestartExhausted', "Preview server is still offline after automatic restart attempts."),
				url: this._serverUrl,
				healthUrl: this._serverHealthUrl,
				command: this._serverCommand,
				cwd: this._serverCwd
			}));
			return;
		}

		if (!shouldRestartWorkbenchAppPreviewAfterHealthFailures({
			previewStartupInProgress: this._previewStartupInProgress,
			backgroundRestartInFlight: this._backgroundRestartInFlight,
			serverProcessAlive: this._isManagedPreviewServerProcessAlive(),
			backgroundRestartAttempts: this._backgroundRestartAttempts,
			maxBackgroundRestartAttempts: MAX_BACKGROUND_RESTART_ATTEMPTS,
		})) {
			this._consecutiveHealthFailures = 0;
			this._serverMessage = localize('appPreviewHealthCheckWaitingLiveProcess', "Preview server is still running. Waiting for it to respond.");
			return;
		}

		this._backgroundRestartAttempts++;
		this._backgroundRestartInFlight = true;
		const overlayShown = await this._showPreviewHealthOverlay(localize(
			'appPreviewBackgroundRestarting',
			"Preview server is offline. Trying to reconnect... ({0}/{1})",
			this._backgroundRestartAttempts,
			MAX_BACKGROUND_RESTART_ATTEMPTS
		));

		try {
			await this._startPreviewServer(true, await this._getOrAssignBranchPort(root, branchName), false, false, this._lastWorkspaceContext);
			const healthy = await this._waitForPreviewHealth(PREVIEW_STARTUP_HEALTH_TIMEOUT);
			if (healthy) {
				this._consecutiveHealthFailures = 0;
				this._backgroundRestartAttempts = 0;
				await this._clearPreviewHealthOverlay();
				return;
			}

			if (!overlayShown || this._backgroundRestartAttempts >= MAX_BACKGROUND_RESTART_ATTEMPTS) {
				this._showPreviewStartupPage(this._createPreviewStartupPageState('slow', root, branchName, this._lastWorkspaceContext, {
					message: localize('appPreviewBackgroundRestartFailed', "Preview server did not recover after an automatic restart."),
					url: this._serverUrl,
					healthUrl: this._serverHealthUrl,
					command: this._serverCommand,
					cwd: this._serverCwd
				}));
			}
		} finally {
			this._backgroundRestartInFlight = false;
		}
	}

	private _isManagedPreviewServerProcessAlive(): boolean {
		return !!this._serverTerminal && !this._serverTerminal.isDisposed && !this._serverTerminalExited && this._serverTerminal.processId !== undefined;
	}

	private async _showPreviewHealthOverlay(message: string): Promise<boolean> {
		if (!this._preview || this._preview.isDisposed()) {
			return false;
		}

		try {
			await playwrightInvokeRaw(this._playwrightService, APP_PREVIEW_PLAYWRIGHT_SESSION_ID, this._preview.id, async (page, text) => {
				await page.evaluate((value: string) => {
					const id = 'workbench-app-preview-health-overlay';
					let element = document.getElementById(id);
					if (!element) {
						element = document.createElement('div');
						element.id = id;
						element.setAttribute('role', 'status');
						element.style.position = 'fixed';
						element.style.right = '16px';
						element.style.bottom = '16px';
						element.style.zIndex = '2147483647';
						element.style.maxWidth = '360px';
						element.style.padding = '10px 12px';
						element.style.borderRadius = '8px';
						element.style.boxShadow = '0 8px 28px rgba(0, 0, 0, 0.22)';
						element.style.background = 'rgba(40, 40, 40, 0.88)';
						element.style.color = 'white';
						element.style.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
						element.style.lineHeight = '1.4';
						document.documentElement.appendChild(element);
					}
					element.textContent = value;
				}, text);
			}, message);
			return true;
		} catch (error) {
			this._logService.warn('[WorkbenchAppPreview] Failed to show preview health overlay.', error);
			return false;
		}
	}

	private async _clearPreviewHealthOverlay(): Promise<void> {
		if (!this._preview || this._preview.isDisposed()) {
			return;
		}

		try {
			await playwrightInvokeRaw(this._playwrightService, APP_PREVIEW_PLAYWRIGHT_SESSION_ID, this._preview.id, async page => {
				await page.evaluate(() => document.getElementById('workbench-app-preview-health-overlay')?.remove());
			});
		} catch {
			// Best-effort cleanup. If the page is gone, the overlay is gone too.
		}
	}

	private async _shouldPromptToPromotePreviewUrl(root: URI, branchName: string | undefined): Promise<boolean> {
		const config = await readPreviewConfig(this._fileService, root);
		const overrides = getRepoOverride(parsePreviewOverrides(this._storageService.get(APP_PREVIEW_OVERRIDES_STORAGE_KEY, StorageScope.APPLICATION)), root);
		return !(
			(branchName ? overrides.branches?.[branchName] : undefined) ||
			overrides.default ||
			getPreviewBranchUrl(config, branchName) ||
			getDefaultPreviewUrl(config)
		);
	}

	private async _recoverPreviewPortConflict(): Promise<void> {
		if (this._portConflictRecoveryInFlight) {
			return;
		}

		const root = getWorkspaceRoot(this._workspaceContextService);
		const branchName = root ? await this._resolveWorkspaceBranchName(root) : undefined;
		const conflictedPort = this._serverPort;
		if (!root || !conflictedPort) {
			return;
		}

		if (this._portConflictRecoveryAttempts >= MAX_PORT_CONFLICT_RECOVERY_ATTEMPTS) {
			this._serverState = 'failed';
			this._serverHealth = 'unhealthy';
			this._serverMessage = `Preview port ${conflictedPort} is still unavailable after ${MAX_PORT_CONFLICT_RECOVERY_ATTEMPTS} retries.`;
			return;
		}

		if (this._serverFixedPort) {
			this._serverState = 'failed';
			this._serverHealth = 'unhealthy';
			this._serverMessage = `Preview port ${conflictedPort} is configured by the repo and is already in use. Stop the process using that port and restart App Preview.`;
			this._previewStartupInProgress = false;
			this._showPreviewStartupPage(this._createPreviewStartupPageState('failed', root, branchName, this._lastWorkspaceContext, {
				message: this._serverMessage,
				url: this._serverUrl,
				healthUrl: this._serverHealthUrl,
				command: this._serverCommand,
				cwd: this._serverCwd,
			}));
			return;
		}

		this._portConflictRecoveryAttempts++;
		this._portConflictRecoveryInFlight = true;
		try {
			const nextPort = await this._findAvailablePort([conflictedPort]);
			const runtime = getBranchRuntime(this._storageService, root, branchName);
			storeBranchRuntime(this._storageService, root, branchName, {
				...runtime,
				port: nextPort,
				lastUrl: adaptWorkbenchAppPreviewUrlToPort(runtime.lastUrl ?? this._serverUrl, nextPort)
			});
			await this._startPreviewServer(true, nextPort, true, this._previewStartupInProgress, this._lastWorkspaceContext);
			if (this._serverState === 'running') {
				this._serverMessage = `Preview port ${conflictedPort} was already in use. Reassigned ${branchName ?? 'detached branch'} to ${nextPort} and opened ${this._serverUrl}.`;
			}
		} catch (error) {
			this._serverState = 'failed';
			this._serverHealth = 'unknown';
			this._serverMessage = error instanceof Error ? error.message : String(error);
		} finally {
			this._portConflictRecoveryInFlight = false;
		}
	}

	private async _findAvailablePort(excludedPorts: readonly number[] = []): Promise<number> {
		for (let attempt = 0; attempt < 50; attempt++) {
			const startPort = 3000 + Math.floor(Math.random() * 20000);
			const port = await this._nativeHostService.findFreePort(startPort, 10, 3000);
			if (excludedPorts.includes(port)) {
				continue;
			}
			if (port > 0 && await this._isPortAvailable(port)) {
				return port;
			}
		}
		throw new Error('Could not find an available local port.');
	}

	private async _getOrAssignBranchPort(root: URI, branchName: string | undefined): Promise<number> {
		const runtime = getBranchRuntime(this._storageService, root, branchName);
		if (runtime.port && this._serverBranch === branchName) {
			return runtime.port;
		}
		if (runtime.port && await this._isPortAvailable(runtime.port)) {
			return runtime.port;
		}

		const port = await this._findAvailablePort();
		storeBranchRuntime(this._storageService, root, branchName, { ...runtime, port });
		return port;
	}

	private async _getCurrentBranchPort(): Promise<number | undefined> {
		const root = getWorkspaceRoot(this._workspaceContextService);
		if (!root) {
			return undefined;
		}

		return this._getOrAssignBranchPort(root, await this._resolveWorkspaceBranchName(root));
	}

	private async _isPortAvailable(port: number): Promise<boolean> {
		return this._nativeHostService.isPortFree(port);
	}

	private _registerPreviewTools(): void {
		this._register(this._toolsService.registerTool(RunPreviewServerToolData, new RunPreviewServerTool(this)));
		this._register(this._toolsService.registerTool(GetPreviewStatusToolData, new GetPreviewStatusTool(this)));
		this._register(this._toolsService.registerTool(RestartPreviewServerToolData, new RestartPreviewServerTool(this)));
		this._register(this._toolsService.registerTool(PromotePreviewUrlToolData, new PromotePreviewUrlTool(this)));
	}
}

function statusToToolResult(status: IPreviewServerStatus): IToolResult {
	return {
		content: [{
			kind: 'text',
			value: JSON.stringify(status, undefined, 2),
		}]
	};
}

abstract class AppPreviewTool implements IToolImpl {
	constructor(protected readonly controller: WorkbenchAppPreviewController) { }

	abstract invoke(invocation: IToolInvocation, countTokens: CountTokensCallback, progress: ToolProgress, token: CancellationToken): Promise<IToolResult>;

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return undefined;
	}
}

const RunPreviewServerToolData: IToolData = {
	id: AppPreviewToolReferenceName.RunPreviewServer,
	toolReferenceName: AppPreviewToolReferenceName.RunPreviewServer,
	displayName: localize('runPreviewServerTool.displayName', "Run Preview Server"),
	modelDescription: 'Start the deterministic project preview dev server, open its URL in the pinned app preview tab, and report whether the URL needs user confirmation before saving it to project config.',
	icon: Codicon.run,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {}
	},
};

class RunPreviewServerTool extends AppPreviewTool {
	override async prepareToolInvocation(): Promise<IPreparedToolInvocation> {
		return {
			invocationMessage: localize('runPreviewServerTool.invocation', "Starting preview server"),
			pastTenseMessage: localize('runPreviewServerTool.past', "Started preview server"),
		};
	}

	async invoke(_invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		return statusToToolResult(await this.controller.runPreviewServer());
	}
}

const GetPreviewStatusToolData: IToolData = {
	id: AppPreviewToolReferenceName.GetPreviewStatus,
	toolReferenceName: AppPreviewToolReferenceName.GetPreviewStatus,
	displayName: localize('getPreviewStatusTool.displayName', "Get Preview Status"),
	modelDescription: 'Return the current app preview server URL, Git branch, lifecycle state, health state, and whether the user should be asked to save the candidate URL.',
	icon: Codicon.info,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {}
	},
};

class GetPreviewStatusTool extends AppPreviewTool {
	async invoke(_invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		return statusToToolResult(this.controller.getPreviewStatus());
	}
}

const RestartPreviewServerToolData: IToolData = {
	id: AppPreviewToolReferenceName.RestartPreviewServer,
	toolReferenceName: AppPreviewToolReferenceName.RestartPreviewServer,
	displayName: localize('restartPreviewServerTool.displayName', "Restart Preview Server"),
	modelDescription: 'Restart the deterministic project preview dev server and reopen its URL in the pinned app preview tab.',
	icon: Codicon.debugRestart,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {}
	},
};

class RestartPreviewServerTool extends AppPreviewTool {
	override async prepareToolInvocation(): Promise<IPreparedToolInvocation> {
		return {
			invocationMessage: localize('restartPreviewServerTool.invocation', "Restarting preview server"),
			pastTenseMessage: localize('restartPreviewServerTool.past', "Restarted preview server"),
		};
	}

	async invoke(_invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		return statusToToolResult(await this.controller.restartPreviewServer());
	}
}

const PromotePreviewUrlToolData: IToolData = {
	id: AppPreviewToolReferenceName.PromotePreviewUrl,
	toolReferenceName: AppPreviewToolReferenceName.PromotePreviewUrl,
	displayName: localize('promotePreviewUrlTool.displayName', "Promote Preview URL"),
	modelDescription: 'After explicit user approval, save the current or provided preview URL into .designer/preview.json for the current Git branch.',
	icon: Codicon.save,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			url: {
				type: 'string',
				description: 'Optional URL to save. When omitted, the current preview server URL is saved.',
			}
		}
	},
};

class PromotePreviewUrlTool extends AppPreviewTool {
	override async prepareToolInvocation(): Promise<IPreparedToolInvocation> {
		return {
			invocationMessage: localize('promotePreviewUrlTool.invocation', "Saving preview URL"),
			pastTenseMessage: localize('promotePreviewUrlTool.past', "Saved preview URL"),
			confirmationMessages: {
				title: localize('promotePreviewUrlTool.confirmTitle', "Save Project Preview URL?"),
				message: localize('promotePreviewUrlTool.confirmMessage', "This writes the preview URL into .designer/preview.json for the current branch."),
			},
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as { url?: string };
		return statusToToolResult(await this.controller.promotePreviewUrl(params.url));
	}
}

class ConfigureWorkbenchAppPreviewUrlAction extends Action2 {
	constructor() {
		super({
			id: ConfigureWorkbenchAppPreviewUrlCommandId,
			title: localize2('configureWorkbenchAppPreviewUrl', "Override Preview URL"),
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const storageService = accessor.get(IStorageService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const localGitService = accessor.get(ILocalGitService);
		const fileService = accessor.get(IFileService);
		const commandService = accessor.get(ICommandService);
		const root = getWorkspaceRoot(workspaceContextService);
		if (!root) {
			return;
		}

		const branchName = await resolveCurrentBranch(localGitService, root);
		if (!branchName) {
			return;
		}

		const config = await readPreviewConfig(fileService, root);
		const overrides = getRepoOverride(parsePreviewOverrides(storageService.get(APP_PREVIEW_OVERRIDES_STORAGE_KEY, StorageScope.APPLICATION)), root);
		const runtime = getBranchRuntime(storageService, root, branchName);
		const result = await showBranchPreviewSettingsModal({
			branchName,
			sharedBranchUrl: getPreviewBranchUrl(config, branchName),
			inheritedSharedUrl: getDefaultPreviewUrl(config),
			localOverrideUrl: overrides.branches?.[branchName],
			assignedPort: runtime.port,
		});
		if (!result) {
			return;
		}

		if (result.action === 'clearLocal') {
			clearLocalPreviewOverride(storageService, root, branchName);
			return;
		}

		if (!result.url) {
			return;
		}

		if (result.action === 'saveLocal') {
			setLocalPreviewOverride(storageService, root, branchName, result.url);
			return;
		}

		await writeProjectPreviewUrl(fileService, root, branchName, result.url);
		const concreteUrl = adaptWorkbenchAppPreviewUrlToPort(result.url, runtime.port);
		if (concreteUrl && normalizeHttpUrl(concreteUrl)) {
			await commandService.executeCommand(NavigateWorkbenchAppPreviewCommandId, { url: concreteUrl });
		}
	}
}

class ClearWorkbenchAppPreviewOverrideAction extends Action2 {
	constructor() {
		super({
			id: ClearWorkbenchAppPreviewOverrideCommandId,
			title: localize2('clearWorkbenchAppPreviewOverride', "Clear Preview Override"),
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const storageService = accessor.get(IStorageService);
		const quickInputService = accessor.get(IQuickInputService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const localGitService = accessor.get(ILocalGitService);
		const root = getWorkspaceRoot(workspaceContextService);
		if (!root) {
			return;
		}

		const branchName = await resolveCurrentBranch(localGitService, root);
		if (!branchName) {
			clearLocalPreviewOverride(storageService, root, undefined);
			return;
		}

		const pick = await quickInputService.pick([
			{ label: localize('clearCurrentBranchOverride', "Current Branch"), description: branchName, kind: 'branch' as const },
			{ label: localize('clearDefaultOverride', "All Branches"), description: localize('clearDefaultOverrideDescription', "Default for this repo"), kind: 'default' as const },
			{ label: localize('clearAllOverrides', "All Local Overrides"), description: localize('clearAllOverridesDescription', "This repo only"), kind: 'all' as const },
		], {
			canPickMany: false,
			placeHolder: localize('clearPreviewOverrideScope', "Choose which local preview override to clear"),
			ignoreFocusLost: true,
		});
		if (!pick) {
			return;
		}

		if (pick.kind === 'all') {
			clearAllLocalPreviewOverrides(storageService, root);
		} else {
			clearLocalPreviewOverride(storageService, root, pick.kind === 'branch' ? branchName : undefined);
		}
	}
}

class EditWorkbenchAppPreviewProjectUrlAction extends Action2 {
	constructor() {
		super({
			id: EditWorkbenchAppPreviewProjectUrlCommandId,
			title: localize2('editWorkbenchAppPreviewProjectUrl', "Edit Project Preview URL"),
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const fileService = accessor.get(IFileService);
		const localGitService = accessor.get(ILocalGitService);
		const root = getWorkspaceRoot(workspaceContextService);
		if (!root) {
			return;
		}

		const branchName = await resolveCurrentBranch(localGitService, root);
		let targetBranch = branchName;
		if (branchName) {
			const pick = await quickInputService.pick([
				{ label: localize('editProjectCurrentBranch', "Current Branch"), description: branchName, branchName },
				{ label: localize('editProjectDefault', "Default"), description: localize('editProjectDefaultDescription', "Shared default for this repo") },
			], {
				canPickMany: false,
				placeHolder: localize('editProjectPreviewScope', "Choose which project preview URL to edit"),
				ignoreFocusLost: true,
			});
			if (!pick) {
				return;
			}
			targetBranch = pick.branchName;
		}

		const config = await readPreviewConfig(fileService, root);
		const currentUrl = getPreviewUrlForBranch(config, targetBranch);
		const url = await quickInputService.input({
			title: localize('editProjectPreviewUrlTitle', "Edit Project Preview URL"),
			prompt: localize('editProjectPreviewUrlPrompt', "Enter the shared project preview URL."),
			placeHolder: 'http://localhost:3000',
			value: currentUrl ?? '',
			ignoreFocusLost: true,
			validateInput: async value => {
				if (!value.trim()) {
					return localize('requiredProjectPreviewUrl', "Enter a preview URL.");
				}
				return normalizeHttpUrl(value.trim()) ? undefined : localize('invalidProjectPreviewUrl', "Enter a valid http or https URL.");
			}
		});
		if (url === undefined) {
			return;
		}

		const normalized = normalizeHttpUrl(url.trim());
		if (normalized) {
			await writeProjectPreviewUrl(fileService, root, targetBranch, normalized);
		}
	}
}

registerAction2(ConfigureWorkbenchAppPreviewUrlAction);
registerAction2(ClearWorkbenchAppPreviewOverrideAction);
registerAction2(EditWorkbenchAppPreviewProjectUrlAction);
registerWorkbenchContribution2(WorkbenchAppPreviewController.ID, WorkbenchAppPreviewController, WorkbenchPhase.AfterRestored);

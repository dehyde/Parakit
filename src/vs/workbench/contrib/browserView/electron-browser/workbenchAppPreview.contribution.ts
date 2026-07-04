/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, RunOnceScheduler, timeout } from '../../../../base/common/async.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { $, addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { hash, hashAsync } from '../../../../base/common/hash.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { dirname, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { BrowserViewKind, IElementData, IBrowserViewLoadingEvent, IBrowserViewLoadError } from '../../../../platform/browserView/common/browserView.js';
import { CDPEvent, CDPRequest, CDPResponse, CDPTargetInfo, ICDPConnection } from '../../../../platform/browserView/common/cdp/types.js';
import { extractNodeData } from '../../../../platform/browserView/common/cdpElementExtraction.js';
import { IPlaywrightService } from '../../../../platform/browserView/common/playwrightService.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { FileChangeType, IFileService, type IFileStat } from '../../../../platform/files/common/files.js';
import { ILocalGitService } from '../../../../platform/git/common/localGitService.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ICommandDetectionCapability, ITerminalCommand, TerminalCapability } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { PromptInputState } from '../../../../platform/terminal/common/capabilities/commandDetection/promptInputModel.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { DesignerAddRepoChoice, GetDesignerReposStateCommandId, shouldShowDesignerEmptyRepoFtux, ShowDesignerAddRepoCommandId, type DesignerRepoState } from '../../../services/workspaces/common/designerRepoCommands.js';
import { CountTokensCallback, ILanguageModelToolsService, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, IPreparedToolInvocation, ToolDataSource, ToolProgress } from '../../chat/common/tools/languageModelToolsService.js';
import { IChatSessionsService } from '../../chat/common/chatSessionsService.js';
import { ITerminalInstance, ITerminalService } from '../../terminal/browser/terminal.js';
import { NavigateWorkbenchAppPreviewHomeCommandId, PickWorkbenchAppPreviewHomeCommandId } from '../common/appPreviewCommands.js';
import { adaptWorkbenchAppPreviewUrlToPort, applyWorkbenchAppPreviewDevPort, canStartWorkbenchAppPreviewServerWithoutInstall, classifyWorkbenchAppPreviewTerminalFailure, getDefaultPreviewUrl, getPreviewBranchUrl, getPreviewUrlForBranch, getWorkbenchAppPreviewClaudeReconciliationCommands, getWorkbenchAppPreviewDevConfigFixedPort, getWorkbenchAppPreviewHealthFetchMode, getWorkbenchAppPreviewServerStateAfterCommandExit, getWorkbenchAppPreviewServerStateAfterHealthTimeout, getWorkbenchAppPreviewStartupPageKey, hasWorkbenchAppPreviewPortTemplate, IPreviewConfig, IResolvedWorkbenchAppPreviewDevConfig, isWorkbenchAppPreviewLoopbackUrl, isWorkbenchAppPreviewManagedLocalUrl, isWorkbenchAppPreviewPathUnderRoot, isWorkbenchAppPreviewPortConflict, isWorkbenchAppPreviewUrlForBranch, IWorkbenchAppPreviewBranchRuntime, IWorkbenchAppPreviewDevConfig, IWorkbenchAppPreviewEnv, IWorkbenchAppPreviewHomeTarget, normalizeWorkbenchAppPreviewLoopbackUrl, observeWorkbenchAppPreviewBranch, parseWorkbenchAppPreviewEnv, resolveWorkbenchAppPreviewAdvertisedUrl, resolveWorkbenchAppPreviewDevConfig, resolveWorkbenchAppPreviewHeuristicDevConfig, resolveWorkbenchAppPreviewHomeTargets, resolveWorkbenchAppPreviewInferredStartupUrl, resolveWorkbenchAppPreviewPreferredUrl, resolveWorkbenchAppPreviewStaticHtmlConfig, resolveWorkbenchAppPreviewDiscoveredPortReconciliation, resolveWorkbenchAppPreviewFixedPortAction, resolveWorkbenchAppPreviewHealthFromSignals, IWorkbenchAppPreviewPortOwner, selectWorkbenchAppPreviewStaticHtmlFile, shouldFallbackFromWorkbenchAppPreviewDevConfig, shouldForceNavigateWorkbenchAppPreview, shouldIgnoreWorkbenchAppPreviewLoadEvent, shouldNavigateWorkbenchAppPreview, shouldRecoverWorkbenchAppPreviewLoadError, shouldRestartWorkbenchAppPreviewAfterHealthFailures, shouldRestartWorkbenchAppPreviewAfterLoadError, shouldShowWorkbenchAppPreviewSetupBeforeServerStart, WorkbenchAppPreviewHealthState, WorkbenchAppPreviewServerState } from '../common/appPreviewConfig.js';
import { detectWorkbenchAppPreviewPackageManager, resolveWorkbenchAppPreviewDependencyReadiness, resolveWorkbenchAppPreviewPackageManagerInstallCommand, resolveWorkbenchAppPreviewPackageManagerScriptCommandPrefix } from '../common/appPreviewPackageManager.js';
import { APP_PREVIEW_STARTUP_ANIMATION_SRC, createWorkbenchAppPreviewStartupDataUrl, getWorkbenchAppPreviewStartupTitle, IWorkbenchAppPreviewStartupPageState, IWorkbenchAppPreviewStartupStage, WorkbenchAppPreviewStartupPhase, WORKBENCH_APP_PREVIEW_STARTUP_HEALTH_TIMEOUT as PREVIEW_STARTUP_HEALTH_TIMEOUT } from '../common/appPreviewStartupPage.js';
import { extractHttpUrls, extractLocalhostUrls, normalizeHttpUrl } from '../common/appPreviewUrl.js';
import { BrowserEditorInput } from '../common/browserEditorInput.js';
import { IBrowserViewCDPService, IBrowserViewWorkbenchService } from '../common/browserView.js';
import { IBrowserDesignElementService, IDesignElementPropertyGroup } from '../common/browserDesignElementService.js';
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
const PREVIEW_PORT_RELEASE_TIMEOUT = 4_000;
const PREVIEW_PORT_POLL_INTERVAL = 200;
const MAX_BACKGROUND_HEALTH_FAILURES = 3;
const MAX_BACKGROUND_RESTART_ATTEMPTS = 3;
const PREVIEW_STARTUP_HEALTH_INTERVAL = 1_000;
const PREVIEW_HEALTH_FETCH_TIMEOUT = 5_000;
const PREVIEW_RENDER_PROBE_TIMEOUT = 2_500;
const PREVIEW_SERVER_OUTPUT_LIMIT = 24 * 1024;
const PREVIEW_COREPACK_PROBE_TIMEOUT = 5_000;
const PREVIEW_DEPENDENCY_INSTALL_TIMEOUT = 5 * 60_000;
const PREVIEW_COMMAND_DETECTION_WAIT_TIMEOUT = 3_000;
const APP_PREVIEW_INSTALL_HASH_MARKER = '.parakit-install-hash';
const APP_PREVIEW_LOCKFILE_HASH_VERSION = 'v1';
const APP_PREVIEW_LOCKFILE_PATHS = [
	'package-lock.json',
	'npm-shrinkwrap.json',
	'pnpm-lock.yaml',
	'yarn.lock',
	'bun.lock',
	'bun.lockb',
];
const PREVIEW_TERMINAL_READY_TIMEOUT = 10_000;
const PREVIEW_TERMINAL_READY_ATTEMPTS = 2;
const PREVIEW_STATIC_HTML_INDEX_DIRS = ['', 'docs', 'public', 'dist', 'build', 'site', 'out'];
const PREVIEW_STATIC_HTML_SCAN_DIRS: readonly { readonly dir: string; readonly depth: number }[] = [
	{ dir: '', depth: 0 },
	{ dir: 'docs', depth: 2 },
	{ dir: 'public', depth: 2 },
	{ dir: 'static', depth: 2 },
	{ dir: 'dist', depth: 2 },
	{ dir: 'build', depth: 2 },
	{ dir: 'site', depth: 2 },
	{ dir: 'out', depth: 2 },
];
const PREVIEW_STATIC_HTML_SCAN_LIMIT = 80;

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
export const InspectElementWorkbenchAppPreviewCommandId = 'workbench.action.appPreview.inspectElement';
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

type PreviewServerState = WorkbenchAppPreviewServerState;
type PreviewHealthState = WorkbenchAppPreviewHealthState;

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

interface IPreviewTerminalCommandResult {
	exitCode?: number;
	output?: string;
	timedOut?: boolean;
}

interface IPreviewTerminalSentinel {
	value: string;
	resolve(result: IPreviewTerminalCommandResult): void;
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

interface IAppPreviewInspectElementCommandArgs {
	ref?: string;
	selector?: string;
	states?: readonly string[];
}

type IAppPreviewInspectElementResult = IElementData & {
	readonly propertyGroups: readonly IDesignElementPropertyGroup[];
};

interface ICDPRequestSequence {
	value: number;
}

function isCDPResponse(message: CDPResponse | CDPEvent): message is CDPResponse {
	return typeof (message as CDPResponse).id === 'number';
}

function nextCDPRequestId(sequence: ICDPRequestSequence): number {
	const id = sequence.value;
	sequence.value++;
	return id;
}

async function sendAppPreviewCDPCommand(
	browserViewCDPService: IBrowserViewCDPService,
	groupId: string,
	store: DisposableStore,
	sequence: ICDPRequestSequence,
	method: string,
	params?: unknown,
	sessionId?: string
): Promise<unknown> {
	const id = nextCDPRequestId(sequence);
	return new Promise<unknown>((resolve, reject) => {
		const listener = browserViewCDPService.onCDPMessage(groupId)(message => {
			if (!isCDPResponse(message) || message.id !== id) {
				return;
			}
			listener.dispose();
			if (message.error) {
				reject(new Error(message.error.message));
				return;
			}
			resolve(message.result ?? {});
		});
		store.add(listener);

		const request: CDPRequest = { id, method, params, sessionId };
		browserViewCDPService.sendCDPMessage(groupId, request).catch(error => {
			listener.dispose();
			reject(error);
		});
	});
}

class AppPreviewCDPConnection extends Disposable implements ICDPConnection {
	private readonly _onEvent = this._register(new Emitter<CDPEvent>());
	readonly onEvent: Event<CDPEvent> = this._onEvent.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose: Event<void> = this._onClose.event;

	constructor(
		private readonly browserViewCDPService: IBrowserViewCDPService,
		private readonly groupId: string,
		private readonly store: DisposableStore,
		private readonly sequence: ICDPRequestSequence,
		readonly sessionId: string,
		readonly targetId: string
	) {
		super();
		this._register(browserViewCDPService.onCDPMessage(groupId)(message => {
			if (isCDPResponse(message) || message.sessionId !== this.sessionId) {
				return;
			}
			this._onEvent.fire(message);
		}));
		this._register(browserViewCDPService.onDidDestroy(groupId)(() => {
			this._onClose.fire();
		}));
	}

	sendCommand(method: string, params?: unknown, sessionId: string | undefined = this.sessionId): Promise<unknown> {
		return sendAppPreviewCDPCommand(this.browserViewCDPService, this.groupId, this.store, this.sequence, method, params, sessionId);
	}
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

async function statWorkbenchAppPreviewPathMtime(fileService: IFileService, resource: URI): Promise<number | undefined> {
	try {
		return (await fileService.stat(resource)).mtime;
	} catch {
		return undefined;
	}
}

async function existsWorkbenchAppPreviewPath(fileService: IFileService, resource: URI): Promise<boolean> {
	try {
		return await fileService.exists(resource);
	} catch {
		return false;
	}
}

async function readWorkbenchAppPreviewTextFile(fileService: IFileService, resource: URI): Promise<string | undefined> {
	try {
		return (await fileService.readFile(resource)).value.toString();
	} catch {
		return undefined;
	}
}

async function readWorkbenchAppPreviewFileBase64(fileService: IFileService, resource: URI): Promise<string | undefined> {
	try {
		return encodeBase64((await fileService.readFile(resource)).value);
	} catch {
		return undefined;
	}
}

async function computeWorkbenchAppPreviewLockfileHash(fileService: IFileService, repository: URI): Promise<string | undefined> {
	const hashInput: string[] = [];

	for (const relativePath of APP_PREVIEW_LOCKFILE_PATHS) {
		const content = await readWorkbenchAppPreviewFileBase64(fileService, joinPath(repository, relativePath));
		if (content !== undefined) {
			hashInput.push(`${relativePath}\n${content}`);
		}
	}

	if (!hashInput.length) {
		return undefined;
	}

	return `${APP_PREVIEW_LOCKFILE_HASH_VERSION}:${await hashAsync(hashInput.join('\n'))}`;
}

async function readWorkbenchAppPreviewInstallHashMarker(fileService: IFileService, repository: URI): Promise<string | undefined> {
	const marker = await readWorkbenchAppPreviewTextFile(fileService, joinPath(repository, 'node_modules', APP_PREVIEW_INSTALL_HASH_MARKER));
	return marker?.trim() || undefined;
}

async function writeWorkbenchAppPreviewInstallHashMarker(fileService: IFileService, repository: URI): Promise<void> {
	const lockfileHash = await computeWorkbenchAppPreviewLockfileHash(fileService, repository);
	if (!lockfileHash) {
		return;
	}

	const nodeModules = joinPath(repository, 'node_modules');
	if (!await existsWorkbenchAppPreviewPath(fileService, nodeModules)) {
		return;
	}

	await fileService.writeFile(joinPath(nodeModules, APP_PREVIEW_INSTALL_HASH_MARKER), VSBuffer.fromString(`${lockfileHash}\n`));
}

function maxWorkbenchAppPreviewMtime(...values: (number | undefined)[]): number | undefined {
	const mtimes = values.filter((value): value is number => typeof value === 'number');
	return mtimes.length ? Math.max(...mtimes) : undefined;
}

function parseWorkbenchAppPreviewYarnPath(yarnRc: string | undefined): string | undefined {
	if (!yarnRc) {
		return undefined;
	}

	const match = yarnRc.match(/^\s*yarnPath\s*:\s*["']?([^"'\r\n#]+)["']?\s*(?:#.*)?$/m);
	return match?.[1]?.trim();
}

async function hasWorkbenchAppPreviewYarnRelease(fileService: IFileService, repository: URI): Promise<boolean> {
	try {
		const releases = await fileService.resolve(joinPath(repository, '.yarn', 'releases'));
		return releases.children?.some(child => child.isFile && child.name.startsWith('yarn-') && child.name.endsWith('.cjs')) === true;
	} catch {
		return false;
	}
}

async function resolveHeuristicPackageManagerConfig(fileService: IFileService, repository: URI, packageManager: string | undefined) {
	const yarnRc = await readWorkbenchAppPreviewTextFile(fileService, joinPath(repository, '.yarnrc.yml'));
	const packageLockMtime = maxWorkbenchAppPreviewMtime(
		await statWorkbenchAppPreviewPathMtime(fileService, joinPath(repository, 'package-lock.json')),
		await statWorkbenchAppPreviewPathMtime(fileService, joinPath(repository, 'npm-shrinkwrap.json')),
	);
	const pnpmLockMtime = await statWorkbenchAppPreviewPathMtime(fileService, joinPath(repository, 'pnpm-lock.yaml'));
	const yarnLockMtime = await statWorkbenchAppPreviewPathMtime(fileService, joinPath(repository, 'yarn.lock'));
	const bunLockMtime = maxWorkbenchAppPreviewMtime(
		await statWorkbenchAppPreviewPathMtime(fileService, joinPath(repository, 'bun.lock')),
		await statWorkbenchAppPreviewPathMtime(fileService, joinPath(repository, 'bun.lockb')),
	);
	const nodeModulesMtime = await statWorkbenchAppPreviewPathMtime(fileService, joinPath(repository, 'node_modules'));
	const dependencyArtifactMtime = maxWorkbenchAppPreviewMtime(
		nodeModulesMtime,
		await statWorkbenchAppPreviewPathMtime(fileService, joinPath(repository, '.pnp.cjs')),
		await statWorkbenchAppPreviewPathMtime(fileService, joinPath(repository, '.pnp.loader.mjs')),
		await statWorkbenchAppPreviewPathMtime(fileService, joinPath(repository, '.yarn', 'install-state.gz')),
	);
	const lockfileMtime = maxWorkbenchAppPreviewMtime(packageLockMtime, pnpmLockMtime, yarnLockMtime, bunLockMtime);
	const lockfileHash = await computeWorkbenchAppPreviewLockfileHash(fileService, repository);
	const installedLockfileHash = nodeModulesMtime !== undefined ? await readWorkbenchAppPreviewInstallHashMarker(fileService, repository) : undefined;
	const detection = detectWorkbenchAppPreviewPackageManager({
		packageManager,
		yarnPath: parseWorkbenchAppPreviewYarnPath(yarnRc),
		hasYarnRelease: await hasWorkbenchAppPreviewYarnRelease(fileService, repository),
		hasYarnIntegrity: await existsWorkbenchAppPreviewPath(fileService, joinPath(repository, 'node_modules', '.yarn-integrity')),
		hasPnpmModulesYaml: await existsWorkbenchAppPreviewPath(fileService, joinPath(repository, 'node_modules', '.modules.yaml')),
		hasPackageLock: packageLockMtime !== undefined,
		hasPnpmLock: pnpmLockMtime !== undefined,
		hasYarnLock: yarnLockMtime !== undefined,
		hasBunLock: bunLockMtime !== undefined,
	});
	const dependencyReadiness = resolveWorkbenchAppPreviewDependencyReadiness({ dependencyArtifactMtime, lockfileMtime, lockfileHash, installedLockfileHash });
	const scriptCommandPrefix = resolveWorkbenchAppPreviewPackageManagerScriptCommandPrefix(detection, false);
	const corepackScriptCommandPrefix = resolveWorkbenchAppPreviewPackageManagerScriptCommandPrefix(detection, true);
	const installCommand = resolveWorkbenchAppPreviewPackageManagerInstallCommand(detection, false);
	const corepackInstallCommand = resolveWorkbenchAppPreviewPackageManagerInstallCommand(detection, true);

	return {
		scriptCommandPrefix,
		...(corepackScriptCommandPrefix !== scriptCommandPrefix ? { corepackScriptCommandPrefix } : {}),
		installCommand,
		...(corepackInstallCommand !== installCommand ? { corepackInstallCommand } : {}),
		dependencyReadiness,
	};
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
		const packageManager = typeof parsed === 'object' && parsed !== null ? (parsed as { packageManager?: unknown }).packageManager : undefined;
		const packageManagerConfig = await resolveHeuristicPackageManagerConfig(fileService, repository, typeof packageManager === 'string' ? packageManager : undefined);
		const npmConfig = resolveWorkbenchAppPreviewHeuristicDevConfig(scripts, isHttpPreviewTarget(url) ? url : undefined, env, packageManagerConfig);
		if (npmConfig) {
			return npmConfig;
		}
	} catch {
		// Continue to static HTML detection when package.json is missing or invalid.
	}

	return resolveStaticHtmlDevConfig(fileService, repository);
}

async function resolveStaticHtmlDevConfig(fileService: IFileService, repository: URI): Promise<IResolvedWorkbenchAppPreviewDevConfig | undefined> {
	for (const dir of PREVIEW_STATIC_HTML_INDEX_DIRS) {
		const htmlPath = dir ? joinPath(repository, dir, 'index.html') : joinPath(repository, 'index.html');
		try {
			await fileService.stat(htmlPath);
			return resolveWorkbenchAppPreviewStaticHtmlConfig(dir || '.');
		} catch {
			// Try the next well-known static output directory.
		}
	}

	const htmlFiles: string[] = [];
	for (const { dir, depth } of PREVIEW_STATIC_HTML_SCAN_DIRS) {
		await collectStaticHtmlFiles(fileService, repository, dir, depth, htmlFiles);
		if (htmlFiles.length >= PREVIEW_STATIC_HTML_SCAN_LIMIT) {
			break;
		}
	}

	const selected = selectWorkbenchAppPreviewStaticHtmlFile(htmlFiles);
	if (!selected) {
		return undefined;
	}

	const { serveDir, initialPath } = splitStaticHtmlFile(selected);
	return resolveWorkbenchAppPreviewStaticHtmlConfig(serveDir, initialPath);
}

async function collectStaticHtmlFiles(fileService: IFileService, repository: URI, relativeDir: string, depth: number, htmlFiles: string[]): Promise<void> {
	if (htmlFiles.length >= PREVIEW_STATIC_HTML_SCAN_LIMIT) {
		return;
	}

	let stat: IFileStat;
	try {
		stat = await fileService.resolve(resolveStaticHtmlResource(repository, relativeDir));
	} catch {
		return;
	}

	const children = [...(stat.children ?? [])].sort((first, second) => first.name.localeCompare(second.name));
	for (const child of children) {
		if (htmlFiles.length >= PREVIEW_STATIC_HTML_SCAN_LIMIT) {
			return;
		}

		const relativePath = joinStaticHtmlPath(relativeDir, child.name);
		if (child.isFile && child.name.toLowerCase().endsWith('.html')) {
			htmlFiles.push(relativePath);
			continue;
		}

		if (child.isDirectory && depth > 0) {
			await collectStaticHtmlFiles(fileService, repository, relativePath, depth - 1, htmlFiles);
		}
	}
}

function resolveStaticHtmlResource(repository: URI, relativePath: string): URI {
	return relativePath ? joinPath(repository, ...relativePath.split('/')) : repository;
}

function joinStaticHtmlPath(parent: string, child: string): string {
	return parent ? `${parent}/${child}` : child;
}

function splitStaticHtmlFile(relativePath: string): { serveDir: string; initialPath: string } {
	const lastSlash = relativePath.lastIndexOf('/');
	if (lastSlash === -1) {
		return { serveDir: '.', initialPath: relativePath };
	}

	return {
		serveDir: relativePath.slice(0, lastSlash) || '.',
		initialPath: relativePath.slice(lastSlash + 1),
	};
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

function getRepoBranchRuntimes(storageService: IStorageService, repo: URI): readonly IWorkbenchAppPreviewBranchRuntime[] {
	const runtime = parseBranchRuntimeStore(storageService.get(APP_PREVIEW_BRANCH_RUNTIME_STORAGE_KEY, StorageScope.APPLICATION));
	return Object.values(runtime[repo.toString()] ?? {});
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
		dialog.setAttribute('aria-label', localize('appPreviewSettingsDialogAria', "Branch Default URL Settings"));
		block.append(dialog);

		const header = $('.app-preview-settings-header');
		header.append(
			$('.app-preview-settings-title', undefined, localize('appPreviewSettingsTitle', "Branch Default URL")),
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
				localize('appPreviewSettingsSharedUrlLabel', "Default URL"),
				defaultUrl,
				localize('appPreviewSettingsSharedCaption', "This opens by default for this branch.")
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
				localize('appPreviewSettingsLocalOverrideLabel', "Default URL"),
				model.localOverrideUrl ?? adaptWorkbenchAppPreviewUrlToPort(model.sharedBranchUrl, model.assignedPort) ?? model.sharedBranchUrl,
				usesLocalOverride
					? localize('appPreviewSettingsLocalCaption', "Local override")
					: localize('appPreviewSettingsBranchDefaultCaption', "This opens by default for this branch.")
			);
			primaryInput = field.input;
			primaryUrlField = field;
			body.append(field.row);

			const sharedSummary = $('.app-preview-settings-shared-summary');
			const revealShared = createSettingsButton(localize('appPreviewSettingsRevealShared', "Edit branch default URL"), 'app-preview-settings-link-button');
			sharedSummary.append(revealShared);
			body.append(sharedSummary);

			const sharedPanel = $('.app-preview-settings-danger-panel');
			sharedPanel.hidden = true;
			const sharedField = createSettingsField(localize('appPreviewSettingsSharedEditLabel', "Branch default URL"), model.sharedBranchUrl, 'http://127.0.0.1:${PORT}/');
			const sharedPortPreview = createPortDetectionPreview(sharedField.input);
			const confirmLabel = document.createElement('label');
			confirmLabel.className = 'app-preview-settings-checkbox';
			const confirm = document.createElement('input');
			confirm.type = 'checkbox';
			confirmLabel.append(confirm, document.createTextNode(localize('appPreviewSettingsSharedConfirm', "Apply for everyone on this branch.")));
			const saveShared = createSettingsButton(localize('appPreviewSettingsSaveShared', "Save default URL"), 'app-preview-settings-danger-button');
			saveShared.disabled = true;
			sharedPanel.append(
				$('.app-preview-settings-warning', undefined, localize('appPreviewSettingsSharedWarning', "Changes what opens by default for this branch.")),
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
		@IBrowserViewCDPService private readonly _browserViewCDPService: IBrowserViewCDPService,
		@IBrowserDesignElementService private readonly _browserDesignElementService: IBrowserDesignElementService,
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
	private _serverTerminalSentinel: IPreviewTerminalSentinel | undefined;
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
		const runtime = getBranchRuntime(this._storageService, root, branchName);
		const configuredUrl = await this._resolveConfiguredPreviewUrl(root, branchName, runtime);
		const needsConfigurationPrompt = await this._shouldPromptToPromotePreviewUrl(root, branchName);
		const inferredStartupUrl = !configuredUrl && needsConfigurationPrompt
			? this._resolveInferredPreviewStartupUrl(root, branchName, runtime.port ?? await this._getOrAssignBranchPort(root, branchName))
			: undefined;
		const runnableConfig = !configuredUrl && needsConfigurationPrompt ? await this._resolveRunnablePreviewServerConfig(root, branchName, undefined, inferredStartupUrl) : undefined;
		if (shouldShowWorkbenchAppPreviewSetupBeforeServerStart({
			configuredUrl,
			inferredStartupUrl,
			needsConfigurationPrompt,
			hasRunnableServerConfig: !!runnableConfig,
			canStartServerWithoutInstall: canStartWorkbenchAppPreviewServerWithoutInstall(runnableConfig),
		})) {
			this._showPreviewSetupState(root, branchName);
			return true;
		}
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
		} else if (action === 'configure') {
			void this._configurePreviewFromStartupPage().catch(error => {
				this._logService.error('[WorkbenchAppPreview] Failed to set default URL from startup page.', error);
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

	private async _configurePreviewFromStartupPage(): Promise<void> {
		await this._commandService.executeCommand(ConfigureWorkbenchAppPreviewUrlCommandId);
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

	async navigateDiscoveredUrl(url: string, options?: { trustedSource?: boolean }): Promise<void> {
		const normalizedUrl = normalizeWorkbenchAppPreviewLoopbackUrl(url);
		this._discoveredUrl = normalizedUrl;
		const root = getWorkspaceRoot(this._workspaceContextService);
		this._discoveredUrlBranchName = root ? await this._resolveWorkspaceBranchName(root) : undefined;
		// Only reconcile tracked server state from a source we know is the managed dev-server
		// terminal (see the trustedSource: true call site below). Untrusted callers (any other
		// terminal at the workspace cwd, or agent log scanning) can still navigate opportunistically,
		// but must not be able to overwrite/persist server state from an unrelated command's output.
		if (root && options?.trustedSource) {
			await this._reconcileDiscoveredServerPort(root, normalizedUrl, this._discoveredUrlBranchName);
		}
		if (this._previewStartupInProgress) {
			return;
		}
		await this._navigatePreferredUrl();
	}

	/**
	 * Dev servers frequently bind to a different port than requested (e.g. "3001 is in use,
	 * using 3002 instead") without emitting a recognizable port-conflict error. When the
	 * server's own terminal output reveals it is actually listening somewhere other than
	 * where we assumed, trust the terminal: update the tracked URL/health URL/port so
	 * status reporting, health checks, and navigation all target the real server instead
	 * of silently polling a stale or unrelated process on the originally requested port.
	 */
	private async _reconcileDiscoveredServerPort(root: URI, discoveredUrl: string, discoveredBranchName: string | undefined): Promise<void> {
		const reconciliation = resolveWorkbenchAppPreviewDiscoveredPortReconciliation({
			serverUrl: this._serverUrl,
			serverHealthUrl: this._serverHealthUrl,
			serverBranch: this._serverBranch,
			serverFixedPort: this._serverFixedPort,
			discoveredUrl,
			discoveredBranchName,
		});
		if (!reconciliation) {
			return;
		}

		this._logService.info(`[WorkbenchAppPreview] Preview server for ${this._serverBranch ?? '<detached>'} is actually listening on port ${reconciliation.port} (expected ${this._serverPort}); updating tracked URL to ${reconciliation.url}.`);
		this._serverPort = reconciliation.port;
		this._serverUrl = reconciliation.url;
		this._serverHealthUrl = reconciliation.healthUrl;
		const branchName = await this._resolveWorkspaceBranchName(root);
		storeBranchRuntime(this._storageService, root, branchName, {
			...getBranchRuntime(this._storageService, root, branchName),
			port: reconciliation.port,
			lastUrl: reconciliation.url,
		});
	}

	refreshFromOverride(): void {
		void this._navigatePreferredUrl().catch(error => {
			this._logService.error('[WorkbenchAppPreview] Failed to refresh app preview override.', error);
		});
	}

	private async _navigatePreferredUrl(options?: { isNewPreview?: boolean; allowDuringStartup?: boolean; forceNavigate?: boolean; preferRunningServer?: boolean }): Promise<string | undefined> {
		const root = getWorkspaceRoot(this._workspaceContextService);
		if (!root || !this._preview || this._preview.isDisposed()) {
			return undefined;
		}
		if (this._previewStartupInProgress && !options?.allowDuringStartup) {
			return undefined;
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
			return undefined;
		}

		this._navigatePreviewUrl(url, runtime, {
			isNewPreview: !!options?.isNewPreview,
			branchChanged,
			forceNavigate: this._shouldForcePreferredNavigation(!!options?.forceNavigate, !!options?.isNewPreview, branchOpenedInSession),
			branchOpenedInSession,
		});
		this._previewBranchesOpenedThisSession.add(branchSessionKey);
		return url;
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

	private async _resolveRunnablePreviewServerConfig(root: URI, branchName: string | undefined, devConfig?: IWorkbenchAppPreviewDevConfig, inferredStartupUrl?: string): Promise<IResolvedWorkbenchAppPreviewDevConfig | undefined> {
		const resolvedDevConfig = devConfig ?? await readDevConfig(this._fileService, root);
		if (resolvedDevConfig) {
			const resolved = resolveWorkbenchAppPreviewDevConfig(resolvedDevConfig, branchName);
			if (resolved || !shouldFallbackFromWorkbenchAppPreviewDevConfig(resolvedDevConfig, branchName)) {
				return resolved;
			}
		}

		const previewConfig = await readPreviewConfig(this._fileService, root);
		return resolveHeuristicDevConfig(this._fileService, root, getPreviewUrlForBranch(previewConfig, branchName) ?? inferredStartupUrl);
	}

	private _resolveInferredPreviewStartupUrl(root: URI, branchName: string | undefined, port: number | undefined): string | undefined {
		return resolveWorkbenchAppPreviewInferredStartupUrl({
			port,
			branchRuntime: getBranchRuntime(this._storageService, root, branchName),
			repoRuntimes: getRepoBranchRuntimes(this._storageService, root),
		});
	}

	private _storeSuccessfulPreviewUrl(root: URI, branchName: string | undefined, url: string | undefined): void {
		if (!url) {
			return;
		}

		const normalized = normalizeHttpUrl(url);
		if (!normalized) {
			return;
		}

		storeBranchRuntime(this._storageService, root, branchName, {
			...getBranchRuntime(this._storageService, root, branchName),
			port: this._serverPort,
			lastUrl: normalized,
			lastSuccessfulUrl: normalized,
			lastSuccessfulAt: Date.now()
		});
	}

	private _showPreviewSetupState(root: URI, branchName: string | undefined): void {
		if (!this._preview || this._preview.isDisposed()) {
			return;
		}

		this._previewStartupInProgress = false;
		this._needsConfigurationPrompt = true;
		this._serverMessage = `No default URL is set for ${branchName ?? 'the current branch'}. Set the URL that opens by default for this branch.`;
		this._showPreviewStartupPage(this._createPreviewStartupPageState('setup', root, branchName, this._lastWorkspaceContext, {
			message: localize('appPreviewSetupMessage', "Set the URL that opens by default for this branch."),
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
			this._resolveServerTerminalSentinelFromOutput();
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

	private _resolveServerTerminalSentinelFromOutput(): void {
		const sentinel = this._serverTerminalSentinel;
		if (!sentinel) {
			return;
		}

		const match = this._serverRecentOutput.match(new RegExp(`${sentinel.value}:(\\d+)`));
		if (!match) {
			return;
		}

		this._serverTerminalSentinel = undefined;
		sentinel.resolve({
			exitCode: Number(match[1]),
			output: this._serverRecentOutput,
		});
	}

	private async _waitForCommandDetectionCapability(terminal: ITerminalInstance, timeoutMs: number): Promise<ICommandDetectionCapability | undefined> {
		const existing = terminal.capabilities.get(TerminalCapability.CommandDetection);
		if (existing) {
			return existing;
		}

		return new Promise(resolve => {
			const store = new DisposableStore();
			const timeout = mainWindow.setTimeout(() => {
				store.dispose();
				resolve(undefined);
			}, timeoutMs);
			store.add(terminal.capabilities.onDidAddCommandDetectionCapability(capability => {
				mainWindow.clearTimeout(timeout);
				store.dispose();
				resolve(capability);
			}));
		});
	}

	private async _runPreviewTerminalCommandWithDetection(terminal: ITerminalInstance, command: string, timeoutMs: number): Promise<IPreviewTerminalCommandResult | undefined> {
		const commandDetection = await this._waitForCommandDetectionCapability(terminal, PREVIEW_COMMAND_DETECTION_WAIT_TIMEOUT);
		if (!commandDetection) {
			return undefined;
		}

		const commandId = `app-preview-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		return new Promise(resolve => {
			const store = new DisposableStore();
			const timeout = mainWindow.setTimeout(() => {
				store.dispose();
				resolve({ output: this._serverRecentOutput, timedOut: true });
			}, timeoutMs);
			const finish = (terminalCommand: ITerminalCommand) => {
				if (!this._matchesPreviewTerminalCommand(terminalCommand, commandId, command)) {
					return;
				}

				mainWindow.clearTimeout(timeout);
				store.dispose();
				resolve({
					exitCode: terminalCommand.exitCode,
					output: terminalCommand.getOutput() ?? this._serverRecentOutput,
				});
			};
			store.add(commandDetection.onCommandFinished(finish));
			store.add(commandDetection.onCommandInvalidated(commands => {
				for (const terminalCommand of commands) {
					finish(terminalCommand);
				}
			}));
			void terminal.runCommand(command, true, commandId, true).catch(error => {
				mainWindow.clearTimeout(timeout);
				store.dispose();
				resolve({ output: error instanceof Error ? error.message : String(error), exitCode: 1 });
			});
		});
	}

	private _matchesPreviewTerminalCommand(terminalCommand: ITerminalCommand, commandId: string, command: string): boolean {
		if (terminalCommand.id === commandId || terminalCommand.command === command) {
			return true;
		}

		try {
			return terminalCommand.extractCommandLine() === command;
		} catch {
			return false;
		}
	}

	private async _runPreviewTerminalCommandWithSentinel(terminal: ITerminalInstance, command: string, timeoutMs: number): Promise<IPreviewTerminalCommandResult> {
		const sentinel = `__APP_PREVIEW_COMMAND_${Date.now()}_${Math.random().toString(36).slice(2)}__`;
		const sentinelCommand = `${command}; echo ${sentinel}:$?`;
		return new Promise(resolve => {
			const timeout = mainWindow.setTimeout(() => {
				if (this._serverTerminalSentinel?.value === sentinel) {
					this._serverTerminalSentinel = undefined;
				}
				resolve({ output: this._serverRecentOutput, timedOut: true });
			}, timeoutMs);
			this._serverTerminalSentinel = {
				value: sentinel,
				resolve: result => {
					mainWindow.clearTimeout(timeout);
					resolve(result);
				}
			};
			void terminal.sendText(sentinelCommand, true, true).catch(error => {
				mainWindow.clearTimeout(timeout);
				if (this._serverTerminalSentinel?.value === sentinel) {
					this._serverTerminalSentinel = undefined;
				}
				resolve({ output: error instanceof Error ? error.message : String(error), exitCode: 1 });
			});
		});
	}

	private async _runPreviewTerminalCommand(terminal: ITerminalInstance, command: string, timeoutMs: number, useSentinelFallback: boolean): Promise<IPreviewTerminalCommandResult> {
		const detectionResult = await this._runPreviewTerminalCommandWithDetection(terminal, command, timeoutMs);
		if (detectionResult) {
			return detectionResult;
		}

		if (!useSentinelFallback) {
			return { output: this._serverRecentOutput, timedOut: true };
		}

		return this._runPreviewTerminalCommandWithSentinel(terminal, command, timeoutMs);
	}

	private async _waitForPreviewServerTerminalReady(terminal: ITerminalInstance): Promise<boolean> {
		for (let attempt = 0; attempt < PREVIEW_TERMINAL_READY_ATTEMPTS; attempt++) {
			const result = await this._runPreviewTerminalCommandWithSentinel(terminal, ':', PREVIEW_TERMINAL_READY_TIMEOUT);
			if (!result.timedOut && result.exitCode === 0) {
				this._serverRecentOutput = '';
				this._serverLastOutputAt = undefined;
				return true;
			}
		}

		return false;
	}

	private async _runPreviewServerTerminalCommand(terminal: ITerminalInstance, command: string, root: URI, branchName: string | undefined, context: IDesignerWorkspaceContext | undefined): Promise<void> {
		const commandDetection = await this._waitForCommandDetectionCapability(terminal, PREVIEW_COMMAND_DETECTION_WAIT_TIMEOUT);
		if (!commandDetection) {
			await terminal.sendText(command, true, true);
			return;
		}

		const commandId = `app-preview-server-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		const store = new DisposableStore();
		let finished = false;
		const finish = (result: IPreviewTerminalCommandResult) => {
			if (finished) {
				return;
			}

			finished = true;
			store.dispose();
			void this._handlePreviewServerCommandExit(terminal, result, root, branchName, context).catch(error => {
				this._logService.error('[WorkbenchAppPreview] Failed to handle preview server command exit.', error);
			});
		};
		const finishCommand = (terminalCommand: ITerminalCommand) => {
			if (!this._matchesPreviewTerminalCommand(terminalCommand, commandId, command)) {
				return;
			}

			finish({
				exitCode: terminalCommand.exitCode,
				output: terminalCommand.getOutput() ?? this._serverRecentOutput,
			});
		};

		store.add(commandDetection.onCommandFinished(finishCommand));
		store.add(commandDetection.onCommandInvalidated(commands => {
			for (const terminalCommand of commands) {
				finishCommand(terminalCommand);
			}
		}));
		this._serverTerminalExitStore.add(store);
		void terminal.runCommand(command, true, commandId, true).catch(error => {
			finish({
				exitCode: 1,
				output: error instanceof Error ? error.message : String(error),
			});
		});
	}

	private async _handlePreviewServerCommandExit(terminal: ITerminalInstance, result: IPreviewTerminalCommandResult, root: URI, branchName: string | undefined, context: IDesignerWorkspaceContext | undefined): Promise<void> {
		if (terminal !== this._serverTerminal || this._serverTerminalExited) {
			return;
		}

		const nextState = getWorkbenchAppPreviewServerStateAfterCommandExit({
			serverState: this._serverState,
			serverHealth: this._serverHealth,
		});
		if (!nextState) {
			return;
		}

		this._serverState = nextState;
		this._serverHealth = 'unhealthy';
		this._serverMessage = this._formatPreviewTerminalFailureMessage(
			result.output ?? this._serverRecentOutput,
			nextState === 'failed'
				? localize('appPreviewServerCommandExitedBeforeReadyMessage', "Preview server command exited before the app became available.")
				: localize('appPreviewServerCommandStoppedMessage', "Preview server command exited.")
		);

		if (nextState === 'failed') {
			this._previewStartupInProgress = false;
			this._showPreviewStartupPage(this._createPreviewStartupPageState('failed', root, branchName, context, {
				message: this._serverMessage,
				url: this._serverUrl,
				healthUrl: this._serverHealthUrl,
				command: this._serverCommand,
				cwd: this._serverCwd
			}));
		}
	}

	private async _isCorepackAvailable(terminal: ITerminalInstance): Promise<boolean> {
		const result = await this._runPreviewTerminalCommand(terminal, 'corepack --version', PREVIEW_COREPACK_PROBE_TIMEOUT, false);
		return result.exitCode === 0;
	}

	private _formatPreviewTerminalFailureMessage(output: string, fallback: string): string {
		switch (classifyWorkbenchAppPreviewTerminalFailure(output, this._serverPort)) {
			case 'portConflict':
				return localize('appPreviewTerminalFailurePortConflict', "The preview server could not start because the selected port is already in use.");
			case 'missingBinary':
				return localize('appPreviewTerminalFailureMissingBinary', "A required command was not found on this machine.");
			case 'moduleNotFound':
				return localize('appPreviewTerminalFailureModuleNotFound', "A required Node dependency is missing.");
			case 'permissionDenied':
				return localize('appPreviewTerminalFailurePermissionDenied', "The preview command was blocked by a permissions error.");
			default:
				return fallback;
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

			await this.navigateDiscoveredUrl(normalizedUrl, { trustedSource: true });
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
		if (await this._showPreviewSetupInsteadOfStarting()) {
			return this.getPreviewStatus();
		}
		return this._startPreviewServer(false, await this._getCurrentBranchPort(), false, true);
	}

	async restartPreviewServer(): Promise<IPreviewServerStatus> {
		if (await this._showPreviewSetupInsteadOfStarting()) {
			return this.getPreviewStatus();
		}
		return this._startPreviewServer(true, await this._getCurrentBranchPort(), false, true);
	}

	/**
	 * Mirrors the setup-before-start gate already applied to the automatic startup paths
	 * (initial auto-start and branch-switch reconciliation), so explicitly triggered
	 * Run/Restart Preview Server commands and their LM tool equivalents also show the
	 * "this branch needs configuration" screen instead of attempting a doomed normal start.
	 */
	private async _showPreviewSetupInsteadOfStarting(): Promise<boolean> {
		const root = getWorkspaceRoot(this._workspaceContextService);
		if (!root) {
			return false;
		}
		const branchName = await this._resolveWorkspaceBranchName(root);
		const runtime = getBranchRuntime(this._storageService, root, branchName);
		const configuredUrl = await this._resolveConfiguredPreviewUrl(root, branchName, runtime);
		const needsConfigurationPrompt = await this._shouldPromptToPromotePreviewUrl(root, branchName);
		const inferredStartupUrl = !configuredUrl && needsConfigurationPrompt
			? this._resolveInferredPreviewStartupUrl(root, branchName, runtime.port ?? await this._getOrAssignBranchPort(root, branchName))
			: undefined;
		const runnableConfig = !configuredUrl && needsConfigurationPrompt ? await this._resolveRunnablePreviewServerConfig(root, branchName, undefined, inferredStartupUrl) : undefined;
		if (shouldShowWorkbenchAppPreviewSetupBeforeServerStart({
			configuredUrl,
			inferredStartupUrl,
			needsConfigurationPrompt,
			canStartServerWithoutInstall: canStartWorkbenchAppPreviewServerWithoutInstall(runnableConfig),
		})) {
			this._showPreviewSetupState(root, branchName);
			return true;
		}
		return false;
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
		const runtime = getBranchRuntime(this._storageService, root, branchName);
		const configuredUrl = await this._resolveConfiguredPreviewUrl(root, branchName, runtime);
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
		const needsConfigurationPrompt = await this._shouldPromptToPromotePreviewUrl(root, branchName);
		const inferredStartupUrl = !configuredUrl && needsConfigurationPrompt
			? this._resolveInferredPreviewStartupUrl(root, branchName, runtime.port ?? await this._getOrAssignBranchPort(root, branchName))
			: undefined;
		const runnableConfig = !configuredUrl && needsConfigurationPrompt ? await this._resolveRunnablePreviewServerConfig(root, branchName, undefined, inferredStartupUrl) : undefined;
		if (shouldShowWorkbenchAppPreviewSetupBeforeServerStart({
			configuredUrl,
			inferredStartupUrl,
			needsConfigurationPrompt,
			hasRunnableServerConfig: !!runnableConfig,
			canStartServerWithoutInstall: canStartWorkbenchAppPreviewServerWithoutInstall(runnableConfig),
		})) {
			this._showPreviewSetupState(root, branchName);
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
			throw new Error('No valid URL is available to save as the branch default.');
		}
		const branchName = await this._resolveWorkspaceBranchName(root);
		await writeProjectPreviewUrl(this._fileService, root, branchName, normalized);
		this._needsConfigurationPrompt = false;
		await this._navigatePreferredUrl();
		this._serverMessage = `Saved ${normalized} as the default URL${branchName ? ` for ${branchName}` : ''}.`;
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
			throw new Error('No valid default URL was provided.');
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

	async inspectAppPreviewElement(args?: IAppPreviewInspectElementCommandArgs): Promise<IAppPreviewInspectElementResult> {
		const preview = await this._requireTrackedPreview();
		const selector = args?.ref ? `aria-ref=${args.ref}` : args?.selector;
		if (!selector) {
			throw new Error('Either a "ref" or "selector" parameter is required.');
		}

		const states = Array.isArray(args?.states) ? args.states.filter((state): state is string => typeof state === 'string') : undefined;
		const markerAttribute = 'data-parakit-inspect-marker';
		const markerId = generateUuid();
		const groupStore = new DisposableStore();
		let groupId: string | undefined;
		let sessionId: string | undefined;

		try {
			await playwrightInvokeRaw(this._playwrightService, APP_PREVIEW_PLAYWRIGHT_SESSION_ID, preview.id, (page, sel, attr, id) => page.locator(sel).evaluate((element, marker) => {
				const [attrName, attrValue] = marker as [string, string];
				element.setAttribute(attrName, attrValue);
			}, [attr, id]), selector, markerAttribute, markerId);

			groupId = await this._browserViewCDPService.createSessionGroup(preview.id);
			const sequence: ICDPRequestSequence = { value: 1 };
			const { targetInfos } = await sendAppPreviewCDPCommand(this._browserViewCDPService, groupId, groupStore, sequence, 'Target.getTargets') as { targetInfos?: CDPTargetInfo[] };
			const targets = targetInfos ?? [];
			const target = targets.find(target => target.type === 'page') ?? targets[0];
			if (!target) {
				throw new Error('Could not resolve a CDP target for this App Preview tab.');
			}

			const attachResult = await sendAppPreviewCDPCommand(this._browserViewCDPService, groupId, groupStore, sequence, 'Target.attachToTarget', {
				targetId: target.targetId,
				flatten: true
			}) as { sessionId?: string };
			if (!attachResult.sessionId) {
				throw new Error('Could not attach a CDP session to the App Preview tab.');
			}
			sessionId = attachResult.sessionId;

			const connection = groupStore.add(new AppPreviewCDPConnection(this._browserViewCDPService, groupId, groupStore, sequence, sessionId, target.targetId));
			await connection.sendCommand('DOM.enable');
			await connection.sendCommand('CSS.enable');
			await connection.sendCommand('Runtime.enable');

			const { root } = await connection.sendCommand('DOM.getDocument') as { root?: { nodeId?: number } };
			if (typeof root?.nodeId !== 'number') {
				throw new Error('Could not read the App Preview DOM root.');
			}

			const { nodeId } = await connection.sendCommand('DOM.querySelector', {
				nodeId: root.nodeId,
				selector: `[${markerAttribute}="${markerId}"]`,
			}) as { nodeId?: number };
			if (!nodeId) {
				throw new Error(`Could not locate an element matching "${selector}" for inspection.`);
			}

			const elementData = await extractNodeData(connection, { nodeId }, { states });
			const { propertyGroups } = await this._browserDesignElementService.inspectElement(elementData);
			return { ...elementData, propertyGroups };
		} finally {
			await playwrightInvokeRaw(this._playwrightService, APP_PREVIEW_PLAYWRIGHT_SESSION_ID, preview.id, (page, sel, attr) => page.locator(sel).evaluate((element, attrName) => {
				element.removeAttribute(attrName);
			}, attr), selector, markerAttribute).catch(() => {
				// Best effort cleanup.
			});
			if (groupId && sessionId) {
				const sequence: ICDPRequestSequence = { value: 1_000_000 };
				await sendAppPreviewCDPCommand(this._browserViewCDPService, groupId, groupStore, sequence, 'Target.detachFromTarget', { sessionId }).catch(() => {
					// Best effort cleanup.
				});
			}
			if (groupId) {
				await this._browserViewCDPService.destroySessionGroup(groupId).catch(() => {
					// Best effort cleanup.
				});
			}
			groupStore.dispose();
		}
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
		this._register(CommandsRegistry.registerCommand(InspectElementWorkbenchAppPreviewCommandId, (_accessor, args?: IAppPreviewInspectElementCommandArgs) => this.inspectAppPreviewElement(args)));
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

		// A repo-fixed port is non-negotiable: the built HTML pins its asset URLs to it, so the dev
		// server cannot be allowed to silently fall back to another port. Guarantee the port is ours
		// before launching - auto-closing any foreign process squatting on it (e.g. an orphaned dev
		// server from a different repo) - so opening or switching always lands on the real app
		// instead of a stale/foreign one that happens to answer on the same port.
		if (fixedPort !== undefined) {
			const fixedPortReady = await this._ensureRequiredPortAvailable(fixedPort, root);
			if (!isCurrentStart()) {
				return this.getPreviewStatus();
			}
			if (!fixedPortReady.ok) {
				this._serverState = 'failed';
				this._serverHealth = 'unhealthy';
				this._serverMessage = fixedPortReady.message;
				this._previewStartupInProgress = false;
				this._showPreviewStartupPage(this._createPreviewStartupPageState('failed', root, branchName, context, {
					message: fixedPortReady.message,
				}));
				return this.getPreviewStatus();
			}
		}

		const resolvedServer = applyWorkbenchAppPreviewDevPort(resolvedConfig, port);
		const replacePort = (value: string) => value.replace(/\$\{PORT\}/g, String(port));
		let serverCommand = resolvedServer.command;
		let installCommand = resolvedConfig.installCommand ? replacePort(resolvedConfig.installCommand) : undefined;
		const cwd = resolvedConfig.cwd ? joinPath(root, resolvedConfig.cwd).fsPath : root.fsPath;
		this._serverUrl = resolvedServer.url;
		this._serverHealthUrl = resolvedServer.healthUrl;
		this._serverHealthPath = resolvedConfig.healthPath;
		this._serverBranch = branchName;
		this._serverCommand = serverCommand;
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
			this._showPreviewStartupPage(this._createPreviewStartupPageState(installCommand ? 'installingDependencies' : 'serverStarting', root, branchName, context, {
				message: installCommand
					? localize('appPreviewInstallPreparingMessage', "Checking and installing dependencies before starting the preview. A fresh install can take a few minutes.")
					: localize('appPreviewServerStartingMessage', "Starting the preview server for this branch."),
				url: resolvedServer.url,
				healthUrl: resolvedServer.healthUrl,
				command: installCommand ?? serverCommand,
				cwd
			}));
		}
		// Do not navigate to resolvedServer.url here: _stopPreviewServer() above always tears down
		// any existing terminal, so nothing is listening at this URL yet. Navigation happens once the
		// server is actually confirmed (health check below, or the server's own terminal output).
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
			const terminalReady = await this._waitForPreviewServerTerminalReady(terminal);
			if (!isCurrentStart()) {
				return this.getPreviewStatus();
			}
			if (!terminalReady) {
				this._serverState = 'failed';
				this._serverHealth = 'unknown';
				this._serverMessage = this._formatPreviewTerminalFailureMessage(this._serverRecentOutput, localize('appPreviewTerminalNotReadyMessage', "Preview terminal did not become ready before the server could start."));
				this._previewStartupInProgress = false;
				this._showPreviewStartupPage(this._createPreviewStartupPageState('failed', root, branchName, context, {
					message: this._serverMessage,
					url: resolvedServer.url,
					healthUrl: resolvedServer.healthUrl,
					command: serverCommand,
					cwd
				}));
				return this.getPreviewStatus();
			}
			const corepackAvailable = resolvedConfig.corepackCommand || resolvedConfig.corepackInstallCommand
				? await this._isCorepackAvailable(terminal)
				: false;
			if (corepackAvailable && resolvedConfig.corepackCommand) {
				serverCommand = replacePort(resolvedConfig.corepackCommand);
			}
			if (corepackAvailable && resolvedConfig.corepackInstallCommand) {
				installCommand = replacePort(resolvedConfig.corepackInstallCommand);
			}
			this._serverCommand = serverCommand;
			if (!isCurrentStart()) {
				return this.getPreviewStatus();
			}
			if (installCommand) {
				if (waitForHealthy) {
					this._showPreviewStartupPage(this._createPreviewStartupPageState('installingDependencies', root, branchName, context, {
						message: localize('appPreviewInstallingDependenciesMessage', "Installing dependencies before starting the preview server. A fresh install can take a few minutes."),
						url: resolvedServer.url,
						healthUrl: resolvedServer.healthUrl,
						command: installCommand,
						cwd
					}));
				}
				const installResult = await this._runPreviewTerminalCommand(terminal, installCommand, PREVIEW_DEPENDENCY_INSTALL_TIMEOUT, true);
				if (!isCurrentStart()) {
					return this.getPreviewStatus();
				}
				if (installResult.timedOut || (installResult.exitCode !== undefined && installResult.exitCode !== 0)) {
					this._serverState = 'failed';
					this._serverHealth = 'unknown';
					this._serverMessage = this._formatPreviewTerminalFailureMessage(installResult.output ?? this._serverRecentOutput, installResult.timedOut
						? localize('appPreviewInstallTimedOutMessage', "Dependency install timed out before the preview server could start.")
						: localize('appPreviewInstallFailedMessage', "Dependency install failed before the preview server could start."));
					this._previewStartupInProgress = false;
					this._showPreviewStartupPage(this._createPreviewStartupPageState('missingDependencies', root, branchName, context, {
						message: this._serverMessage,
						url: resolvedServer.url,
						healthUrl: resolvedServer.healthUrl,
						command: installCommand,
						cwd
					}));
					return this.getPreviewStatus();
				}
				try {
					await writeWorkbenchAppPreviewInstallHashMarker(this._fileService, root);
				} catch (error) {
					this._logService.warn('[WorkbenchAppPreview] Failed to record dependency install hash.', error);
				}
			}
			if (waitForHealthy) {
				this._showPreviewStartupPage(this._createPreviewStartupPageState('serverStarting', root, branchName, context, {
					message: localize('appPreviewServerStartingMessage', "Starting the preview server for this branch."),
					url: resolvedServer.url,
					healthUrl: resolvedServer.healthUrl,
					command: serverCommand,
					cwd
				}));
			}
			await this._runPreviewServerTerminalCommand(terminal, serverCommand, root, branchName, context);
			if (!isCurrentStart()) {
				return this.getPreviewStatus();
			}
			if (this._serverState === 'starting') {
				this._serverState = 'running';
				this._serverMessage = this._needsConfigurationPrompt
					? `Opened ${resolvedServer.url}. Ask the user whether to save this as the default URL for this branch.`
					: `Opened ${resolvedServer.url}.`;
			}
			if (this._serverState !== 'running') {
				return this.getPreviewStatus();
			}
			if (waitForHealthy) {
				this._showPreviewStartupPage(this._createPreviewStartupPageState('healthChecking', root, branchName, context, {
					message: localize('appPreviewHealthCheckingMessage', "The server is starting. Waiting for the preview health check to pass."),
					url: resolvedServer.url,
					healthUrl: resolvedServer.healthUrl,
					command: serverCommand,
					cwd
				}));
				const healthy = await this._waitForPreviewHealth(PREVIEW_STARTUP_HEALTH_TIMEOUT, isCurrentStart);
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
					// Health succeeded even if the terminal output did not advertise a URL first.
					// Mark the managed server URL as discovered so the handoff can keep it without
					// enabling raw running-server fallback in unrelated preferred-url calls.
					if (this._serverUrl && (!isWorkbenchAppPreviewUrlForBranch(this._discoveredUrlBranchName, branchName) || this._discoveredUrl !== this._serverUrl)) {
						this._discoveredUrl = this._serverUrl;
						this._discoveredUrlBranchName = branchName;
					}
					const openedUrl = await this._navigatePreferredUrl({ isNewPreview: false, allowDuringStartup: true, forceNavigate: true, preferRunningServer: true });
					this._storeSuccessfulPreviewUrl(root, branchName, openedUrl);
				} else if (getWorkbenchAppPreviewServerStateAfterHealthTimeout({
					serverState: this._serverState,
					serverHealth: this._serverHealth,
					serverTerminalExited: this._serverTerminalExited,
					serverCommandActive: this._isPreviewServerCommandActive(),
				}) === 'failed') {
					this._serverHealth = 'unhealthy';
					this._serverState = 'failed';
					this._serverMessage = this._formatPreviewTerminalFailureMessage(
						this._serverRecentOutput,
						this._serverTerminalExited
							? localize('appPreviewServerExitedMessage', "Preview server exited unexpectedly.")
							: localize('appPreviewServerCommandInactiveMessage', "Preview server command exited before the app became available.")
					);
					this._showPreviewStartupPage(this._createPreviewStartupPageState('failed', root, branchName, context, {
						message: this._serverMessage,
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
				command: serverCommand,
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
			return [];
		}

		const stageLabels = [
			localize('appPreviewStagePrepare', "Prepare preview"),
			localize('appPreviewStageInstallDependencies', "Install dependencies"),
			localize('appPreviewStageStartServer', "Start server"),
			localize('appPreviewStageWaitForApp', "Wait for app response"),
			localize('appPreviewStageOpenPreview', "Open preview"),
		];
		const currentIndex = phase === 'starting'
			? 0
			: phase === 'installingDependencies'
				? 1
				: phase === 'serverStarting'
					? 2
					: phase === 'healthChecking' || phase === 'slow'
						? 3
						: phase === 'opening'
							? 4
							: stageLabels.length;

		const stages = stageLabels.map((label, index): IPreviewStartupStage => ({
			label,
			status: index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'pending',
			startedAt: index === currentIndex ? this._previewStartupPhaseStartedAt : undefined
		}));

		if (phase === 'failed' || phase === 'missingDependencies') {
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
			phase === 'installingDependencies' ? localize('appPreviewInstallingDependenciesDetails', "Dependencies are being installed before the server starts.") : undefined,
			phase === 'serverStarting' ? localize('appPreviewServerInitializing', "Server is initializing.") : undefined,
			phase === 'healthChecking' ? localize('appPreviewHealthCheckWaiting', "Health check is waiting for the app to respond.") : undefined,
			phase === 'slow' ? localize('appPreviewSlowHint', "The server may still be compiling or waiting on a dependency.") : undefined,
			phase === 'missingDependencies' ? localize('appPreviewMissingDependenciesHint', "Dependency install did not complete. Check the terminal logs or retry the preview server.") : undefined,
			phase === 'failed' ? localize('appPreviewFailedHint', "Check the terminal logs or restart the preview server.") : undefined,
			phase === 'setup' ? localize('appPreviewSetupHint', "The current branch does not have a default URL.") : undefined,
		].filter((value): value is string => !!value);
		const actions: IPreviewStartupPageState['actions'] = phase === 'slow'
			? ['retry', 'restart', 'logs', 'copy']
			: phase === 'setup'
				? ['configure']
				: (phase === 'failed' || phase === 'missingDependencies') ? ['retry', 'restart', 'logs'] : [];

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

	private async _waitForPreviewHealth(timeoutMs: number, isCurrent?: () => boolean): Promise<boolean> {
		const startedAt = Date.now();
		while (Date.now() - startedAt < timeoutMs) {
			// A newer start (e.g. a fast branch switch) supersedes this one - stop polling immediately
			// instead of running to the full timeout and mutating shared health state behind it.
			if (isCurrent && !isCurrent()) {
				return false;
			}
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

	private _isPreviewServerCommandActive(): boolean | undefined {
		const commandDetection = this._serverTerminal?.capabilities.get(TerminalCapability.CommandDetection);
		if (!commandDetection) {
			return undefined;
		}

		if (commandDetection.executingCommandObject || commandDetection.executingCommand) {
			return true;
		}

		return commandDetection.promptInputModel.state === PromptInputState.Input ? false : undefined;
	}

	private _stopPreviewServer(): void {
		this._serverStartGeneration++;
		this._serverHealthPollStore.clear();
		this._serverTerminalExitStore.clear();
		this._serverTerminalSentinel?.resolve({ output: this._serverRecentOutput, timedOut: true });
		this._serverTerminalSentinel = undefined;
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
		await this._checkServerHealthNow();
		// Success requires a render-confirmed 'healthy' - not merely a reachable transport - so a
		// server that answers HTTP while the app stays blank ('reachable') accrues failures and lets
		// the watchdog recover it, instead of being pinned healthy forever.
		if (this._serverHealth === 'healthy') {
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
		const openedUrl = await this._navigatePreferredUrl({ allowDuringStartup: true, forceNavigate: true, preferRunningServer: true });
		this._storeSuccessfulPreviewUrl(root, branchName, openedUrl);
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

		const reachable = await this._probeServerReachable(this._serverHealthUrl);
		if (!reachable) {
			this._serverHealth = 'unhealthy';
			return false;
		}

		// The server answered, but an HTTP 200 on an SPA only proves the shell is served - not that
		// the app mounted. When the preview is actually pointed at the app, confirm it rendered so a
		// blank/stale/foreign page can never be reported as healthy. Fail open when we cannot probe.
		const previewOnServerOrigin = this._isPreviewOnServerOrigin();
		const renderVerified = previewOnServerOrigin ? await this._probePreviewRender() : undefined;
		this._serverHealth = resolveWorkbenchAppPreviewHealthFromSignals({ httpReachable: true, previewOnServerOrigin, renderVerified });
		if (this._serverHealth === 'healthy') {
			this._lastHealthError = undefined;
		} else if (renderVerified === false) {
			this._lastHealthError = 'The server responded but the app has not rendered yet.';
		}
		return reachable;
	}

	/** HTTP reachability probe for the dev server, preserving the browser fetch-mode fallbacks. */
	private async _probeServerReachable(healthUrl: string): Promise<boolean> {
		try {
			const mode = getWorkbenchAppPreviewHealthFetchMode(healthUrl);
			const response = await this._fetchHealth(healthUrl, { method: 'GET', cache: 'no-store', mode });
			if (mode === 'no-cors') {
				return true;
			}
			if (!response.ok) {
				this._lastHealthError = `${response.status} ${response.statusText}`.trim();
			}
			return response.ok;
		} catch (error) {
			try {
				await this._fetchHealth(healthUrl, { method: 'GET', cache: 'no-store', mode: 'no-cors' });
				return true;
			} catch {
				this._lastHealthError = error instanceof Error ? `Health check request failed: ${error.message}` : 'Health check request failed.';
				return false;
			}
		}
	}

	private _isPreviewOnServerOrigin(): boolean {
		const preview = this._preview;
		if (!preview || preview.isDisposed() || !this._serverUrl || !preview.url) {
			return false;
		}
		try {
			return new URL(preview.url).origin === new URL(this._serverUrl).origin;
		} catch {
			return false;
		}
	}

	/**
	 * Probe the live preview page for whether the app actually rendered. Returns true/false when the
	 * page could be inspected, or undefined when it could not (no session, timeout, cross-origin) so
	 * callers fail open. Uses a generic signal - the document is complete and the app root has real
	 * content - rather than any framework-specific title, so it works across dev servers.
	 */
	private async _probePreviewRender(): Promise<boolean | undefined> {
		const preview = this._preview;
		if (!preview || preview.isDisposed()) {
			return undefined;
		}
		const timeoutPromise = timeout(PREVIEW_RENDER_PROBE_TIMEOUT);
		try {
			const probe = playwrightInvokeRaw(this._playwrightService, APP_PREVIEW_PLAYWRIGHT_SESSION_ID, preview.id, (page) => page.evaluate(() => {
				const roots = [document.getElementById('root'), document.querySelector('#app'), document.querySelector('[data-reactroot]'), document.querySelector('main'), document.body];
				const root = roots.find(candidate => !!candidate) ?? undefined;
				return { readyState: document.readyState, childElementCount: root ? root.childElementCount : 0 };
			}));
			const result = await Promise.race([
				probe.catch(() => undefined),
				timeoutPromise.then(() => undefined, () => undefined),
			]);
			if (!result) {
				return undefined;
			}
			return result.readyState === 'complete' && result.childElementCount > 0;
		} catch (error) {
			this._logService.trace('[WorkbenchAppPreview] Preview render probe failed.', error);
			return undefined;
		} finally {
			timeoutPromise.cancel();
		}
	}

	private async _handlePreviewLoadingState(event: IBrowserViewLoadingEvent): Promise<void> {
		if (shouldIgnoreWorkbenchAppPreviewLoadEvent({
			eventLoading: event.loading,
			hasError: !!event.error,
			previewStartupInProgress: this._previewStartupInProgress,
			previewLoadFailureRecoveryInFlight: this._previewLoadFailureRecoveryInFlight,
			serverStartInFlight: !!this._serverStartInFlight,
		}) || !event.error) {
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
				if (!shouldRestartWorkbenchAppPreviewAfterLoadError({
					recoverableLoadError: true,
					serverProcessAlive: this._isManagedPreviewServerProcessAlive(),
					serverState: this._serverState,
				})) {
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
			// Distinguish "transport is down" from "server answers but the app never mounted" so the
			// reachable-but-blank state is explained rather than presented as a silent spinner.
			this._serverMessage = this._serverHealth === 'reachable'
				? localize('appPreviewReachableNotRendered', "Preview server is responding but the app has not rendered yet. Waiting for it to mount.")
				: localize('appPreviewHealthCheckWaitingLiveProcess', "Preview server is still running. Waiting for it to respond.");
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
				// The restarted server may be serving a stale/errored page from before the crash
				// (a health overlay only draws on top of the existing page, it doesn't reload it),
				// and may have landed on a different port (see _reconcileDiscoveredServerPort).
				// Force a re-navigate to the real, current URL now that it's confirmed healthy.
				await this._navigatePreferredUrl({ allowDuringStartup: true, forceNavigate: true, preferRunningServer: true });
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
		if (runtime.port && this._serverBranch === branchName && this._isManagedPreviewServerProcessAlive()) {
			return runtime.port;
		}
		if (runtime.port && await this._isPortSafeToReuse(runtime.port, root)) {
			return runtime.port;
		}

		const port = await this._findAvailablePort();
		storeBranchRuntime(this._storageService, root, branchName, { ...runtime, port });
		return port;
	}

	/**
	 * A port with nothing bound to it is always safe. A port that's already occupied is only
	 * safe to reuse if whatever is bound to it is running out of this same repo (e.g. a dev
	 * server started independently of Parakit, per the .designer/dev.json no-op pattern) —
	 * otherwise it's treated as a stale/unrelated process and a fresh port is picked instead.
	 */
	private async _isPortSafeToReuse(port: number, root: URI): Promise<boolean> {
		if (await this._isPortAvailable(port)) {
			return true;
		}
		try {
			const owner = await this._nativeHostService.getPortOwner(port);
			return !!owner?.cwd && isWorkbenchAppPreviewPathUnderRoot(owner.cwd, root.fsPath);
		} catch {
			return false;
		}
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

	/**
	 * Ensure a repo-fixed port is actually available for our dev server before we launch.
	 *
	 * Unlike a dynamically assigned port, a fixed port cannot be swapped for a free one - the built
	 * HTML pins its asset URLs to it - so if something else holds it the dev server silently binds a
	 * different port and the preview renders the wrong app (or nothing). We therefore verify who owns
	 * the port and make it ours:
	 * - Free -> ready.
	 * - Held by a process running out of this repo -> reuse it (our own just-stopped server releasing
	 *   the socket, or an independently started dev server per the .designer/dev.json no-op pattern).
	 * - Held by a foreign process -> auto-close it (SIGTERM, then SIGKILL) and wait for release.
	 */
	private async _ensureRequiredPortAvailable(port: number, root: URI): Promise<{ ok: true } | { ok: false; message: string }> {
		if (await this._isPortAvailable(port)) {
			return { ok: true };
		}

		let owner: IWorkbenchAppPreviewPortOwner | undefined;
		try {
			owner = await this._nativeHostService.getPortOwner(port);
		} catch (error) {
			this._logService.warn(`[WorkbenchAppPreview] Could not determine the owner of required port ${port}.`, error);
			owner = undefined;
		}

		const action = resolveWorkbenchAppPreviewFixedPortAction({ portFree: false, owner, rootPath: root.fsPath });
		if (action === 'reuseRepoLocal') {
			// Our own previous server tearing down, or an intentional repo-local dev server. Give a
			// just-stopped process a moment to release the socket; if it persists we adopt it as-is.
			await this._waitForPortFree(port, PREVIEW_PORT_RELEASE_TIMEOUT);
			return { ok: true };
		}
		if (action === 'closeForeign' && owner) {
			await this._closeForeignPortOwner(port, owner);
		} else {
			// Occupied but the owner is unknown - best effort wait for it to clear on its own.
			await this._waitForPortFree(port, PREVIEW_PORT_RELEASE_TIMEOUT);
		}

		if (await this._isPortAvailable(port)) {
			return { ok: true };
		}

		const who = owner
			? `another process (pid ${owner.pid}${owner.cwd ? `, ${owner.cwd}` : ''})`
			: 'another process';
		return {
			ok: false,
			message: `Port ${port} is required by this app but is held by ${who} that could not be closed automatically. Close it and restart App Preview.`,
		};
	}

	/**
	 * Auto-close a foreign process squatting on a required fixed port: SIGTERM first for a graceful
	 * exit, then SIGKILL if it does not release the socket in time. `getPortOwner` returns the actual
	 * listener pid, so killing it frees the port even when it is a child of another launcher.
	 */
	private async _closeForeignPortOwner(port: number, owner: IWorkbenchAppPreviewPortOwner): Promise<void> {
		this._logService.info(`[WorkbenchAppPreview] Required port ${port} is held by a foreign process (pid ${owner.pid}${owner.cwd ? `, cwd ${owner.cwd}` : ''}); auto-closing it so the preview can bind the correct port.`);
		try {
			await this._nativeHostService.killProcess(owner.pid, 'SIGTERM');
		} catch (error) {
			this._logService.warn(`[WorkbenchAppPreview] SIGTERM of pid ${owner.pid} failed.`, error);
		}
		if (await this._waitForPortFree(port, PREVIEW_PORT_RELEASE_TIMEOUT)) {
			return;
		}
		try {
			await this._nativeHostService.killProcess(owner.pid, 'SIGKILL');
		} catch (error) {
			this._logService.warn(`[WorkbenchAppPreview] SIGKILL of pid ${owner.pid} failed.`, error);
		}
		await this._waitForPortFree(port, PREVIEW_PORT_RELEASE_TIMEOUT);
	}

	private async _waitForPortFree(port: number, timeoutMs: number): Promise<boolean> {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			if (await this._isPortAvailable(port)) {
				return true;
			}
			await timeout(PREVIEW_PORT_POLL_INTERVAL);
		}
		return this._isPortAvailable(port);
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
	displayName: localize('promotePreviewUrlTool.displayName', "Save Default URL"),
	modelDescription: 'After explicit user approval, save the current or provided URL as the default URL for the current Git branch in .designer/preview.json.',
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
			invocationMessage: localize('promotePreviewUrlTool.invocation', "Saving default URL"),
			pastTenseMessage: localize('promotePreviewUrlTool.past', "Saved default URL"),
			confirmationMessages: {
				title: localize('promotePreviewUrlTool.confirmTitle', "Save Default URL?"),
				message: localize('promotePreviewUrlTool.confirmMessage', "This writes the URL that opens by default for the current branch into .designer/preview.json."),
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
			title: localize2('configureWorkbenchAppPreviewUrl', "Set Default URL"),
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
			title: localize2('clearWorkbenchAppPreviewOverride', "Clear Default URL Override"),
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
			title: localize2('editWorkbenchAppPreviewProjectUrl', "Edit Default URL"),
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
				placeHolder: localize('editProjectPreviewScope', "Choose which default URL to edit"),
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
			title: localize('editProjectPreviewUrlTitle', "Edit Default URL"),
			prompt: localize('editProjectPreviewUrlPrompt', "Enter the URL that opens by default."),
			placeHolder: 'http://localhost:3000',
			value: currentUrl ?? '',
			ignoreFocusLost: true,
			validateInput: async value => {
				if (!value.trim()) {
					return localize('requiredProjectPreviewUrl', "Enter a default URL.");
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

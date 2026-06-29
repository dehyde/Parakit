/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hash } from '../../../../base/common/hash.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IReader } from '../../../../base/common/observable.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILocalGitService } from '../../../../platform/git/common/localGitService.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { BrowserEditorInput } from '../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { extractLocalhostUrls } from '../../../../workbench/contrib/browserView/common/appPreviewUrl.js';
import { IBrowserViewWorkbenchService } from '../../../../workbench/contrib/browserView/common/browserView.js';
import { ITerminalInstance, ITerminalService } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsTasksService } from '../../chat/browser/sessionsTasksService.js';

const PREVIEW_ID_PREFIX = 'session-app-preview-';
const WORKSPACE_PREVIEW_ID_PREFIX = 'session-app-preview-workspace-';
const PREVIEW_CONFIG_PATH = '.designer/preview.json';
const WORKSPACE_BRANCH_POLL_INTERVAL = 2000;

export const ConfigureSessionAppPreviewUrlCommandId = 'workbench.action.agentSessions.configureAppPreviewUrl';

interface IPreviewConfigTarget {
	url?: string;
}

interface IPreviewConfig {
	url?: string;
	defaultUrl?: string;
	default?: string | IPreviewConfigTarget;
	branches?: Record<string, string | IPreviewConfigTarget>;
}

function getSessionKey(session: ISession): string {
	return session.resource.toString();
}

function getSessionPreviewId(session: ISession): string {
	return `${PREVIEW_ID_PREFIX}${hash(getSessionKey(session)).toString(16)}`;
}

function getWorkspacePreviewKey(repository: URI): string {
	return `workspace:${repository.toString()}`;
}

function getWorkspacePreviewId(repository: URI): string {
	return `${WORKSPACE_PREVIEW_ID_PREFIX}${hash(repository.toString()).toString(16)}`;
}

function getSessionRepository(session: ISession, reader?: IReader): URI | undefined {
	const workspace = reader ? session.workspace.read(reader) : session.workspace.get();
	return workspace?.folders[0]?.root;
}

function getSessionBranchName(session: ISession, reader?: IReader): string | undefined {
	const workspace = reader ? session.workspace.read(reader) : session.workspace.get();
	return workspace?.folders[0]?.gitRepository?.branchName;
}

function getSessionWorkingDirectory(session: ISession): URI | undefined {
	const folder = session.workspace.get()?.folders[0];
	return folder?.workingDirectory ?? folder?.root;
}

function getWorkspaceRepository(workspaceContextService: IWorkspaceContextService): URI | undefined {
	return workspaceContextService.getWorkspace().folders[0]?.uri;
}

function getUriKey(uri: URI | undefined): string | undefined {
	return uri?.fsPath.toLowerCase();
}

function getTargetUrl(target: string | IPreviewConfigTarget | undefined): string | undefined {
	return typeof target === 'string' ? target : target?.url;
}

function getDefaultPreviewUrl(config: IPreviewConfig): string | undefined {
	return getTargetUrl(config.default) ?? config.defaultUrl ?? config.url;
}

function getPreviewUrlForBranch(config: IPreviewConfig, branchName: string | undefined): string | undefined {
	if (!branchName) {
		return getDefaultPreviewUrl(config);
	}

	return getTargetUrl(config.branches?.[branchName]) ?? getDefaultPreviewUrl(config);
}

async function readPreviewConfig(fileService: IFileService, repository: URI): Promise<IPreviewConfig> {
	try {
		const content = await fileService.readFile(joinPath(repository, PREVIEW_CONFIG_PATH));
		return JSON.parse(content.value.toString()) as IPreviewConfig;
	} catch {
		return {};
	}
}

export class SessionAppPreviewController extends Disposable {

	static readonly ID = 'workbench.contrib.sessionAppPreview';

	private readonly _previewsBySession = new Map<string, BrowserEditorInput>();
	private readonly _workspacePreviewKeys = new Set<string>();
	private readonly _discoveredUrlsBySession = new Map<string, string>();
	private readonly _lastBranchByPreviewKey = new Map<string, string | undefined>();
	private readonly _terminalCwdKeys = new Map<number, Promise<string | undefined>>();
	private _lastActivePreviewKey: string | undefined;
	private _lastWorkspaceBranchName: string | undefined;

	constructor(
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsTasksService private readonly _sessionsTasksService: ISessionsTasksService,
		@IBrowserViewWorkbenchService private readonly _browserViewService: IBrowserViewWorkbenchService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly _fileService: IFileService,
		@ILocalGitService private readonly _localGitService: ILocalGitService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(autorun(reader => {
			const activeSession = this._sessionsService.activeSession.read(reader);
			if (!activeSession) {
				const repository = getWorkspaceRepository(this._workspaceContextService);
				if (!repository) {
					this._lastActivePreviewKey = undefined;
					return;
				}
				const overrideUrl = this._sessionsTasksService.getBrowserUrl(repository).read(reader);
				const previewKey = getWorkspacePreviewKey(repository);
				const shouldReveal = this._lastActivePreviewKey !== previewKey;
				this._lastActivePreviewKey = previewKey;
				void this._ensureWorkspacePreview(repository, shouldReveal).then(preview => {
					void this._resolveWorkspaceBranchName(repository).then(branchName => {
						this._lastWorkspaceBranchName = branchName;
						return this._navigatePreviewToPreferredUrl(preview, repository, branchName, overrideUrl, this._discoveredUrlsBySession.get(previewKey));
					}).catch(error => {
						this._logService.error('[SessionAppPreview] Failed to resolve workspace app preview URL.', error);
					});
				}).catch(error => {
					this._logService.error('[SessionAppPreview] Failed to ensure workspace app preview.', error);
				});
				return;
			}
			if (activeSession.loading.read(reader)) {
				return;
			}

			const repository = getSessionRepository(activeSession, reader);
			const branchName = getSessionBranchName(activeSession, reader);
			const overrideUrl = this._sessionsTasksService.getBrowserUrl(repository).read(reader);
			const sessionKey = getSessionKey(activeSession);
			const shouldReveal = this._lastActivePreviewKey !== sessionKey;
			this._lastActivePreviewKey = sessionKey;
			void this.ensurePreview(activeSession, shouldReveal).then(() => {
				this._navigatePreferredUrl(activeSession, branchName, overrideUrl);
			}).catch(error => {
				this._logService.error('[SessionAppPreview] Failed to ensure app preview.', error);
			});
		}));

		this._register(this._terminalService.onAnyInstanceData(e => {
			void this._handleTerminalData(e.instance, e.data).catch(error => {
				this._logService.error('[SessionAppPreview] Failed to inspect terminal output.', error);
			});
		}));

		const workspaceBranchPoll = setInterval(() => {
			void this._refreshWorkspacePreviewFromGit().catch(error => {
				this._logService.error('[SessionAppPreview] Failed to refresh workspace preview branch.', error);
			});
		}, WORKSPACE_BRANCH_POLL_INTERVAL);
		this._register(toDisposable(() => clearInterval(workspaceBranchPoll)));
	}

	async ensurePreview(session: ISession, reveal = true): Promise<BrowserEditorInput> {
		this._disposeWorkspacePreviews();

		const sessionKey = getSessionKey(session);
		const existing = this._previewsBySession.get(sessionKey);
		if (existing && !existing.isDisposed()) {
			if (reveal) {
				await this._openPreview(existing);
			}
			return existing;
		}

		const repository = getSessionRepository(session);
		const overrideUrl = this._sessionsTasksService.getBrowserUrl(repository).get();
		const preview = this._browserViewService.getOrCreateLazy(getSessionPreviewId(session), {
			url: overrideUrl,
			title: localize('sessionAppPreviewTitle', "App Preview"),
			isSessionAppPreview: true,
		});

		this._previewsBySession.set(sessionKey, preview);
		this._register(preview.onBeforeDispose(e => {
			if (!preview.isDisposed()) {
				e.veto();
			}
		}));
		this._register(preview.onWillDispose(() => {
			if (this._previewsBySession.get(sessionKey) === preview) {
				this._previewsBySession.delete(sessionKey);
			}
			this._lastBranchByPreviewKey.delete(sessionKey);
		}));

		await this._openPreview(preview);
		return preview;
	}

	private async _ensureWorkspacePreview(repository: URI, reveal = true): Promise<BrowserEditorInput> {
		const previewKey = getWorkspacePreviewKey(repository);
		const existing = this._previewsBySession.get(previewKey);
		if (existing && !existing.isDisposed()) {
			if (reveal) {
				await this._openPreview(existing);
			}
			return existing;
		}

		const overrideUrl = this._sessionsTasksService.getBrowserUrl(repository).get();
		const preview = this._browserViewService.getOrCreateLazy(getWorkspacePreviewId(repository), {
			url: overrideUrl,
			title: localize('sessionAppPreviewTitle', "App Preview"),
			isSessionAppPreview: true,
		});

		this._previewsBySession.set(previewKey, preview);
		this._workspacePreviewKeys.add(previewKey);
		this._register(preview.onBeforeDispose(e => {
			if (!preview.isDisposed()) {
				e.veto();
			}
		}));
		this._register(preview.onWillDispose(() => {
			if (this._previewsBySession.get(previewKey) === preview) {
				this._previewsBySession.delete(previewKey);
			}
			this._workspacePreviewKeys.delete(previewKey);
			this._lastBranchByPreviewKey.delete(previewKey);
		}));

		await this._openPreview(preview);
		return preview;
	}

	getPreview(session: ISession): BrowserEditorInput | undefined {
		return this._previewsBySession.get(getSessionKey(session));
	}

	navigateDiscoveredUrl(session: ISession, url: string): void {
		const sessionKey = getSessionKey(session);
		this._discoveredUrlsBySession.set(sessionKey, url);
		const repository = getSessionRepository(session);
		const branchName = getSessionBranchName(session);
		void this._navigatePreferredUrl(session, branchName, this._sessionsTasksService.getBrowserUrl(repository).get());
	}

	private _navigateWorkspaceDiscoveredUrl(repository: URI, url: string): void {
		const previewKey = getWorkspacePreviewKey(repository);
		this._discoveredUrlsBySession.set(previewKey, url);
		void this._resolveWorkspaceBranchName(repository).then(branchName => {
			this._lastWorkspaceBranchName = branchName;
			return this._navigatePreviewToPreferredUrl(this._previewsBySession.get(previewKey), repository, branchName, this._sessionsTasksService.getBrowserUrl(repository).get(), url);
		});
	}

	refreshFromOverride(session: ISession): void {
		const repository = getSessionRepository(session);
		void this._navigatePreferredUrl(session, getSessionBranchName(session), this._sessionsTasksService.getBrowserUrl(repository).get());
	}

	private async _openPreview(preview: BrowserEditorInput): Promise<void> {
		const activeGroup = this._editorGroupsService.activeGroup;
		await this._editorService.openEditor(preview, { pinned: true, index: 0 }, activeGroup);
		activeGroup.pinEditor(preview);
	}

	private async _navigatePreferredUrl(session: ISession, branchName: string | undefined, overrideUrl: string | undefined): Promise<void> {
		const repository = getSessionRepository(session);
		const workingDirectory = getSessionWorkingDirectory(session) ?? repository;
		const configUrl = await this._resolvePreviewConfigUrl(workingDirectory, branchName);
		const url = configUrl ?? overrideUrl ?? this._discoveredUrlsBySession.get(getSessionKey(session));
		this._navigatePreviewIfNeeded(this.getPreview(session), getSessionKey(session), url, branchName);
	}

	private async _navigatePreviewToPreferredUrl(preview: BrowserEditorInput | undefined, repository: URI, branchName: string | undefined, overrideUrl: string | undefined, discoveredUrl: string | undefined): Promise<void> {
		const configUrl = await this._resolvePreviewConfigUrl(repository, branchName);
		const url = configUrl ?? overrideUrl ?? discoveredUrl;
		this._navigatePreviewIfNeeded(preview, getWorkspacePreviewKey(repository), url, branchName);
	}

	private _navigatePreviewIfNeeded(preview: BrowserEditorInput | undefined, previewKey: string, url: string | undefined, branchName: string | undefined): void {
		if (!url || !preview) {
			return;
		}

		const hadPreviousBranch = this._lastBranchByPreviewKey.has(previewKey);
		const previousBranch = this._lastBranchByPreviewKey.get(previewKey);
		this._lastBranchByPreviewKey.set(previewKey, branchName);
		if (preview.url !== url || (hadPreviousBranch && previousBranch !== branchName)) {
			preview.navigate(url);
		}
	}

	private async _resolvePreviewConfigUrl(repository: URI | undefined, branchName: string | undefined): Promise<string | undefined> {
		if (!repository) {
			return undefined;
		}

		try {
			const config = await readPreviewConfig(this._fileService, repository);
			return getPreviewUrlForBranch(config, branchName)?.trim() || undefined;
		} catch {
			return undefined;
		}
	}

	private async _resolveWorkspaceBranchName(repository: URI): Promise<string | undefined> {
		if (repository.scheme !== 'file') {
			return undefined;
		}

		try {
			return await this._localGitService.currentBranch(repository.fsPath);
		} catch {
			return undefined;
		}
	}

	private async _refreshWorkspacePreviewFromGit(): Promise<void> {
		if (this._sessionsService.activeSession.get()) {
			return;
		}

		const repository = getWorkspaceRepository(this._workspaceContextService);
		if (!repository) {
			return;
		}

		const branchName = await this._resolveWorkspaceBranchName(repository);
		if (branchName === this._lastWorkspaceBranchName) {
			return;
		}

		this._lastWorkspaceBranchName = branchName;
		const previewKey = getWorkspacePreviewKey(repository);
		await this._navigatePreviewToPreferredUrl(
			this._previewsBySession.get(previewKey),
			repository,
			branchName,
			this._sessionsTasksService.getBrowserUrl(repository).get(),
			this._discoveredUrlsBySession.get(previewKey)
		);
	}

	private async _handleTerminalData(instance: ITerminalInstance, data: string): Promise<void> {
		const activeSession = this._sessionsService.activeSession.get();
		if (activeSession?.loading.get()) {
			return;
		}

		const workingDirectory = activeSession ? getSessionWorkingDirectory(activeSession) : getWorkspaceRepository(this._workspaceContextService);
		const targetCwdKey = getUriKey(workingDirectory);
		if (!targetCwdKey) {
			return;
		}

		const terminalCwdKey = await this._getTerminalCwdKey(instance);
		if (terminalCwdKey !== targetCwdKey) {
			return;
		}

		const [url] = extractLocalhostUrls(data);
		if (url) {
			if (activeSession) {
				this.navigateDiscoveredUrl(activeSession, url);
			} else if (workingDirectory) {
				this._navigateWorkspaceDiscoveredUrl(workingDirectory, url);
			}
		}
	}

	private _disposeWorkspacePreviews(): void {
		for (const previewKey of [...this._workspacePreviewKeys]) {
			this._previewsBySession.get(previewKey)?.dispose(true);
		}
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
}

class ConfigureSessionAppPreviewUrlAction extends Action2 {
	constructor() {
		super({
			id: ConfigureSessionAppPreviewUrlCommandId,
			title: localize2('configureSessionAppPreviewUrl', "Configure App Preview URL"),
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const sessionsService = accessor.get(ISessionsService);
		const sessionsTasksService = accessor.get(ISessionsTasksService);
		const quickInputService = accessor.get(IQuickInputService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const fileService = accessor.get(IFileService);
		const localGitService = accessor.get(ILocalGitService);
		const activeSession = sessionsService.activeSession.get();
		const repository = activeSession ? getSessionRepository(activeSession) : getWorkspaceRepository(workspaceContextService);
		const workingDirectory = activeSession ? getSessionWorkingDirectory(activeSession) : repository;
		if (!repository) {
			return;
		}

		const branchName = activeSession ? getSessionBranchName(activeSession) : await (async () => {
			if (repository.scheme !== 'file') {
				return undefined;
			}
			try {
				return await localGitService.currentBranch(repository.fsPath);
			} catch {
				return undefined;
			}
		})();
		const configRepository = workingDirectory ?? repository;
		const config = await readPreviewConfig(fileService, configRepository);
		const currentUrl = getPreviewUrlForBranch(config, branchName) ?? sessionsTasksService.getBrowserUrl(repository).get();
		const url = await quickInputService.input({
			title: localize('configureAppPreviewUrlTitle', "Configure App Preview URL"),
			prompt: localize('configureAppPreviewUrlPrompt', "Enter the URL to open in the app preview. Leave empty to clear."),
			placeHolder: 'http://localhost:3000',
			value: currentUrl ?? '',
			ignoreFocusLost: true,
		});
		if (url === undefined) {
			return;
		}

		const trimmed = url.trim();
		if (branchName) {
			const branches = { ...(config.branches ?? {}) };
			if (trimmed) {
				branches[branchName] = trimmed;
			} else {
				delete branches[branchName];
			}
			config.branches = branches;
		} else if (trimmed) {
			config.default = { url: trimmed };
		} else {
			delete config.default;
			delete config.defaultUrl;
			delete config.url;
		}

		await fileService.createFolder(joinPath(configRepository, '.designer'));
		await fileService.writeFile(joinPath(configRepository, PREVIEW_CONFIG_PATH), VSBuffer.fromString(JSON.stringify(config, null, 2) + '\n'));
		sessionsTasksService.setBrowserUrl(repository, url);
	}
}

registerAction2(ConfigureSessionAppPreviewUrlAction);

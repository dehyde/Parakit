/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, timeout } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { dirname, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { BrowserViewKind } from '../../../../platform/browserView/common/browserView.js';
import { IPlaywrightService } from '../../../../platform/browserView/common/playwrightService.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { FileChangeType, IFileService } from '../../../../platform/files/common/files.js';
import { ILocalGitService } from '../../../../platform/git/common/localGitService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IChatContextService } from '../../chat/browser/contextContrib/chatContextService.js';
import { APP_PREVIEW_SCENARIOS_CONFIG_PATH, AppPreviewScenarioControlValue, AppPreviewScenarioSupportStatus, createAppPreviewScenarioBridgePayload, createAppPreviewScenarioChatContext, createAppPreviewScenarioImplementationSignature, createDefaultAppPreviewScenarioConfig, getAppPreviewScenarioImplementationFiles, getAppPreviewScenarioStorageKey, IAppPreviewScenarioBridgePayload, IAppPreviewScenarioConfig, IAppPreviewScenarioImplementationFileState, isAppPreviewScenarioDesignOnlyFilePath, normalizeAppPreviewScenarioState, parseAppPreviewScenarioConfig } from '../common/appPreviewScenario.js';
import { IAppPreviewScenarioChangeEvent, IAppPreviewScenarioCleanupResult, IAppPreviewScenarioConfigState, IAppPreviewScenarioService } from '../common/appPreviewScenarioService.js';
import { IBrowserViewModel } from '../common/browserView.js';
import { playwrightInvokeRaw } from './tools/browserToolHelpers.js';

const APP_PREVIEW_PLAYWRIGHT_SESSION_ID = 'workbench-app-preview';
const SCENARIO_CHAT_CONTEXT_ID = 'workbench.appPreview.scenario';
const SCENARIO_LOCAL_STORAGE_KEY = '__vscodeDesignerScenario';
const SCENARIO_SUPPORT_LOCAL_STORAGE_KEY = '__vscodeDesignerScenarioSupport';

export const CleanupAppPreviewScenarioArtifactsCommandId = 'workbench.action.appPreview.scenarioCleanup';

class AppPreviewScenarioService extends Disposable implements IAppPreviewScenarioService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeScenario = this._register(new Emitter<IAppPreviewScenarioChangeEvent>());
	readonly onDidChangeScenario = this._onDidChangeScenario.event;

	private readonly _onDidChangeSupport = this._register(new Emitter<string>());
	readonly onDidChangeSupport = this._onDidChangeSupport.event;

	private readonly _registeredModels = new Map<string, IBrowserViewModel>();
	private readonly _trackingReadyByTab = new Map<string, Promise<void>>();
	private readonly _scenarioFileWatchDisposables = this._register(new DisposableStore());
	private readonly _implementationSignatureByTab = new Map<string, string>();
	private readonly _scenarioFileChangeScheduler: RunOnceScheduler;
	private _scenarioWatchedResources: URI[] = [];

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ILocalGitService private readonly localGitService: ILocalGitService,
		@IPlaywrightService private readonly playwrightService: IPlaywrightService,
		@IChatContextService private readonly chatContextService: IChatContextService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._scenarioFileChangeScheduler = this._register(new RunOnceScheduler(() => {
			void this.handleScenarioFilesChanged().catch(error => {
				this.logService.debug('[AppPreviewScenario] Failed to refresh after scenario file change', error);
			});
		}, 150));

		this._register(this.fileService.onDidFilesChange(event => {
			if (this._scenarioWatchedResources.some(resource => event.affects(resource, FileChangeType.ADDED, FileChangeType.UPDATED, FileChangeType.DELETED))) {
				this._scenarioFileChangeScheduler.schedule();
			}
		}));

		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => {
			this._implementationSignatureByTab.clear();
			void this.updateScenarioFileWatches().catch(error => {
				this.logService.debug('[AppPreviewScenario] Failed to update scenario file watches after workspace change', error);
			});
		}));

		void this.updateScenarioFileWatches().catch(error => {
			this.logService.debug('[AppPreviewScenario] Failed to initialize scenario file watches', error);
		});
	}

	async readScenarioConfig(repository = this.getWorkspaceRoot(), _branch?: string): Promise<IAppPreviewScenarioConfigState> {
		const starterConfig = createDefaultAppPreviewScenarioConfig();
		if (!repository) {
			return { config: starterConfig, source: 'starter', errors: [] };
		}

		try {
			const content = await this.fileService.readFile(joinPath(repository, APP_PREVIEW_SCENARIOS_CONFIG_PATH));
			const parsed = parseAppPreviewScenarioConfig(JSON.parse(content.value.toString()));
			if (!parsed.config) {
				return { config: starterConfig, source: 'file', errors: parsed.errors };
			}

			return { config: parsed.config, source: 'file', errors: [] };
		} catch (error) {
			if (error instanceof SyntaxError) {
				return {
					config: starterConfig,
					source: 'file',
					errors: [{
						code: 'invalidConfig',
						path: '',
						message: 'Variant config JSON is invalid.'
					}]
				};
			}

			return { config: starterConfig, source: 'starter', errors: [] };
		}
	}

	async saveScenarioConfig(repository: URI | undefined, config: IAppPreviewScenarioConfig): Promise<void> {
		const root = repository ?? this.getWorkspaceRoot();
		if (!root) {
			throw new Error('Cannot save App Preview scenarios without a workspace folder.');
		}

		const parsed = parseAppPreviewScenarioConfig(config);
		if (!parsed.config) {
			throw new Error(`Cannot save invalid App Preview variant config: ${parsed.errors.map(error => error.message).join('; ')}`);
		}

		const target = joinPath(root, APP_PREVIEW_SCENARIOS_CONFIG_PATH);
		await this.fileService.createFolder(dirname(target));
		await this.fileService.writeFile(target, VSBuffer.fromString(`${JSON.stringify(parsed.config, null, '\t')}\n`));
		await this.updateScenarioFileWatches(parsed.config);
		this._onDidChangeScenario.fire({});
		await this.applyScenarioToRegisteredTabs();
	}

	async getTabScenarioState(tabId: string): Promise<Record<string, AppPreviewScenarioControlValue>> {
		const configState = await this.readScenarioConfig();
		return normalizeAppPreviewScenarioState(configState.config, await this.readStoredTabState(tabId));
	}

	async setTabControlValue(tabId: string, controlId: string, value: AppPreviewScenarioControlValue): Promise<void> {
		const configState = await this.readScenarioConfig();
		const current = normalizeAppPreviewScenarioState(configState.config, await this.readStoredTabState(tabId));
		const next = normalizeAppPreviewScenarioState(configState.config, { ...current, [controlId]: value });
		await this.storeTabState(tabId, next);
		this._onDidChangeScenario.fire({ tabId });
		await this.applyScenarioToTab(tabId);
		await this.updateChatContext(tabId);
	}

	async resetTabToDefault(tabId: string): Promise<void> {
		const storageKey = await this.getStorageKey(tabId);
		if (storageKey) {
			this.storageService.remove(storageKey, StorageScope.WORKSPACE);
		}
		this._onDidChangeScenario.fire({ tabId });
		await this.applyScenarioToTab(tabId);
		await this.updateChatContext(tabId);
	}

	async getScenarioChatContext(activeTabId: string): Promise<string | undefined> {
		if (!this._registeredModels.has(activeTabId)) {
			return undefined;
		}

		const configState = await this.readScenarioConfig();
		const activeValues = await this.getTabScenarioState(activeTabId);
		const otherTabs = [];
		for (const tabId of this._registeredModels.keys()) {
			if (tabId === activeTabId) {
				continue;
			}
			otherTabs.push({ tabId, values: await this.getTabScenarioState(tabId) });
		}

		return createAppPreviewScenarioChatContext({
			config: configState.config,
			activeTabId,
			activeValues,
			otherTabs
		});
	}

	async getTabSupport(tabId: string): Promise<Record<string, AppPreviewScenarioSupportStatus>> {
		const model = this._registeredModels.get(tabId);
		if (!model) {
			return {};
		}

		if (!await this.ensureAppPreviewPageTracked(model)) {
			return {};
		}

		try {
			const support = await playwrightInvokeRaw(this.playwrightService, APP_PREVIEW_PLAYWRIGHT_SESSION_ID, model.id, async page => {
				return page.evaluate(() => {
					const fromWindow = (window as unknown as { __vscodeDesignerScenarioSupport?: unknown }).__vscodeDesignerScenarioSupport;
					if (fromWindow && typeof fromWindow === 'object') {
						return fromWindow;
					}
					return {};
				});
			});

			return isRecord(support) ? support as Record<string, AppPreviewScenarioSupportStatus> : {};
		} catch (error) {
			this.logService.debug('[AppPreviewScenario] Failed to read scenario support state', error);
			return {};
		}
	}

	async cleanupScenarioArtifacts(repository = this.getWorkspaceRoot()): Promise<IAppPreviewScenarioCleanupResult> {
		if (!repository) {
			return { removed: [], modified: [] };
		}

		const configState = await this.readScenarioConfig(repository);
		const designOnlyFiles = configState.config.implementation?.designOnlyFiles ?? [];
		const modified: string[] = [];
		const removable: URI[] = [];
		const removed: string[] = [];

		for (const file of designOnlyFiles) {
			if (!isAppPreviewScenarioDesignOnlyFilePath(file.path)) {
				modified.push(file.path);
				continue;
			}

			try {
				const resource = joinPath(repository, file.path);
				const content = await this.fileService.readFile(resource);
				const sha256 = await sha256Hex(content.value.toString());
				if (sha256 !== file.sha256) {
					modified.push(file.path);
					continue;
				}
				removable.push(resource);
			} catch {
				// Missing generated files are already clean from the cleanup perspective.
			}
		}

		if (modified.length > 0) {
			return { removed: [], modified };
		}

		for (const resource of removable) {
			await this.fileService.del(resource, { recursive: false, useTrash: false });
			removed.push(resource.fsPath);
		}

		try {
			await this.fileService.del(joinPath(repository, APP_PREVIEW_SCENARIOS_CONFIG_PATH), { recursive: false, useTrash: false });
			removed.push(APP_PREVIEW_SCENARIOS_CONFIG_PATH);
		} catch {
			// The scenario config may already be absent.
		}

		this._onDidChangeScenario.fire({});
		await this.updateScenarioFileWatches(createDefaultAppPreviewScenarioConfig());
		await this.applyScenarioToRegisteredTabs();
		return { removed, modified: [] };
	}

	registerAppPreviewModel(model: IBrowserViewModel): void {
		if (model.owner.kind !== BrowserViewKind.AppPreview) {
			return;
		}
		if (this._registeredModels.get(model.id) === model) {
			return;
		}

		this._registeredModels.set(model.id, model);
		void this.trackAppPreviewPage(model).catch(() => { });
		this._register(model.onDidNavigate(() => {
			void this.applyScenarioToTab(model.id);
		}));
		this._register(model.onDidChangeLoadingState(event => {
			if (!event.loading) {
				void this.applyScenarioToTab(model.id);
			}
		}));
		this._register(model.onWillDispose(() => {
			this._registeredModels.delete(model.id);
			this._trackingReadyByTab.delete(model.id);
			this._implementationSignatureByTab.delete(model.id);
			void this.playwrightService.stopTrackingPage(model.id).catch(error => {
				this.logService.debug('[AppPreviewScenario] Failed to stop tracking App Preview page', error);
			});
		}));

		void this.applyScenarioToTab(model.id);
		void this.updateChatContext(model.id);
	}

	private trackAppPreviewPage(model: IBrowserViewModel): Promise<void> {
		const existing = this._trackingReadyByTab.get(model.id);
		if (existing) {
			return existing;
		}

		const tracking = this.playwrightService.startTrackingPage(model.id).catch(error => {
			this._trackingReadyByTab.delete(model.id);
			this.logService.debug('[AppPreviewScenario] Failed to track App Preview page', error);
			throw error;
		});
		this._trackingReadyByTab.set(model.id, tracking);
		return tracking;
	}

	private async ensureAppPreviewPageTracked(model: IBrowserViewModel): Promise<boolean> {
		try {
			await this.trackAppPreviewPage(model);
			return true;
		} catch {
			return false;
		}
	}

	async applyScenarioToTab(tabId: string): Promise<void> {
		const model = this._registeredModels.get(tabId);
		if (!model) {
			return;
		}

		if (!await this.ensureAppPreviewPageTracked(model)) {
			return;
		}

		const configState = await this.readScenarioConfig();
		if (await this.reloadTabForImplementationChange(model, configState.config)) {
			return;
		}

		const state = await this.getTabScenarioState(tabId);
		const support = await this.getTabSupport(tabId);
		const payload = createAppPreviewScenarioBridgePayload(configState.config, state, support);

		try {
			await this.applyScenarioBridgeWithRetry(model.id, payload);
		} catch (error) {
			this.logService.debug('[AppPreviewScenario] Failed to apply scenario bridge', error);
		}
	}

	private async applyScenarioBridgeWithRetry(tabId: string, payload: IAppPreviewScenarioBridgePayload): Promise<void> {
		let lastError: unknown;
		for (let attempt = 1; attempt <= 5; attempt++) {
			try {
				await this.applyScenarioBridge(tabId, payload);
				return;
			} catch (error) {
				lastError = error;
				if (attempt < 5) {
					await timeout(250 * attempt);
				}
			}
		}

		throw lastError;
	}

	private createScenarioStoragePayload(payload: IAppPreviewScenarioBridgePayload): Omit<IAppPreviewScenarioBridgePayload, 'support'> {
		const { support, ...storagePayload } = payload;
		return storagePayload;
	}

	private async applyScenarioBridge(tabId: string, payload: IAppPreviewScenarioBridgePayload): Promise<void> {
		const storagePayload = this.createScenarioStoragePayload(payload);
		await playwrightInvokeRaw(this.playwrightService, APP_PREVIEW_PLAYWRIGHT_SESSION_ID, tabId, async (page, payload, storagePayload, scenarioStorageKey, supportStorageKey) => {
			const installScenario = ({ payload, storagePayload, scenarioStorageKey, supportStorageKey }: { payload: unknown; storagePayload: unknown; scenarioStorageKey: string; supportStorageKey: string }) => {
				const targetWindow = window as unknown as {
					__vscodeDesignerScenario?: unknown;
					__vscodeDesignerScenarioSupport?: unknown;
					__vscodeDesignerScenarioBridgeInstalled?: boolean;
				};
				targetWindow.__vscodeDesignerScenario = payload;
				try {
					localStorage.setItem(scenarioStorageKey, JSON.stringify(storagePayload));
				} catch {
					// Some previews disable storage; the live window bridge still works.
				}
				try {
					localStorage.removeItem(supportStorageKey);
				} catch {
					// Support feedback is page-lifetime only.
				}
				if (!targetWindow.__vscodeDesignerScenarioBridgeInstalled) {
					targetWindow.__vscodeDesignerScenarioBridgeInstalled = true;
					window.addEventListener('vscode:designerScenarioSupport', event => {
						const detail = event instanceof CustomEvent ? event.detail : undefined;
						targetWindow.__vscodeDesignerScenarioSupport = detail;
					});
				}
				window.dispatchEvent(new CustomEvent('vscode:designerScenarioChange', { detail: payload }));
			};

			await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => { });
			await page.addInitScript(({ payload, storagePayload, scenarioStorageKey, supportStorageKey }) => {
				const targetWindow = window as unknown as {
					__vscodeDesignerScenario?: unknown;
					__vscodeDesignerScenarioSupport?: unknown;
					__vscodeDesignerScenarioBridgeInstalled?: boolean;
				};
				targetWindow.__vscodeDesignerScenario = payload;
				targetWindow.__vscodeDesignerScenarioSupport = undefined;
				try {
					localStorage.setItem(scenarioStorageKey, JSON.stringify(storagePayload));
				} catch {
					// Some previews disable storage; the live window bridge still works.
				}
				try {
					localStorage.removeItem(supportStorageKey);
				} catch {
					// Support feedback is page-lifetime only.
				}
				if (!targetWindow.__vscodeDesignerScenarioBridgeInstalled) {
					targetWindow.__vscodeDesignerScenarioBridgeInstalled = true;
					window.addEventListener('vscode:designerScenarioSupport', event => {
						const detail = event instanceof CustomEvent ? event.detail : undefined;
						targetWindow.__vscodeDesignerScenarioSupport = detail;
					});
				}
			}, { payload, storagePayload, scenarioStorageKey, supportStorageKey });
			await page.evaluate(installScenario, { payload, storagePayload, scenarioStorageKey, supportStorageKey });
		}, payload, storagePayload, SCENARIO_LOCAL_STORAGE_KEY, SCENARIO_SUPPORT_LOCAL_STORAGE_KEY);
	}

	private async updateScenarioFileWatches(config?: IAppPreviewScenarioConfig): Promise<void> {
		const repository = this.getWorkspaceRoot();
		this._scenarioFileWatchDisposables.clear();
		this._scenarioWatchedResources = [];
		if (!repository) {
			return;
		}

		const effectiveConfig = config ?? (await this.readScenarioConfig(repository)).config;
		const resources = new Map<string, URI>();
		const addResource = (resource: URI) => resources.set(resource.toString(), resource);
		addResource(joinPath(repository, APP_PREVIEW_SCENARIOS_CONFIG_PATH));
		for (const file of getAppPreviewScenarioImplementationFiles(effectiveConfig)) {
			addResource(joinPath(repository, file.path));
		}

		this._scenarioWatchedResources = Array.from(resources.values());
		for (const resource of this._scenarioWatchedResources) {
			this._scenarioFileWatchDisposables.add(this.fileService.watch(resource, { recursive: false, excludes: [] }));
		}
	}

	private async handleScenarioFilesChanged(): Promise<void> {
		await this.updateScenarioFileWatches();
		this._onDidChangeScenario.fire({});
		await this.applyScenarioToRegisteredTabs();
		for (const tabId of this._registeredModels.keys()) {
			await this.updateChatContext(tabId);
		}
	}

	private async reloadTabForImplementationChange(model: IBrowserViewModel, config: IAppPreviewScenarioConfig): Promise<boolean> {
		const signature = await this.createImplementationSignature(config);
		const previousSignature = this._implementationSignatureByTab.get(model.id);
		this._implementationSignatureByTab.set(model.id, signature);
		if (!previousSignature || previousSignature === signature) {
			return false;
		}

		await this.clearTabScenarioSupport(model.id);
		try {
			const stoppedLoading = Event.toPromise(Event.filter(model.onDidChangeLoadingState, event => !event.loading));
			await model.reload(true);
			await Promise.race([stoppedLoading, timeout(10_000)]);
			await this.applyScenarioToTab(model.id);
			return true;
		} catch (error) {
			this.logService.debug('[AppPreviewScenario] Failed to reload App Preview after scenario implementation change', error);
			return false;
		}
	}

	private async createImplementationSignature(config: IAppPreviewScenarioConfig): Promise<string> {
		const repository = this.getWorkspaceRoot();
		const fileStates: IAppPreviewScenarioImplementationFileState[] = [];
		if (repository) {
			for (const file of getAppPreviewScenarioImplementationFiles(config)) {
				try {
					const content = await this.fileService.readFile(joinPath(repository, file.path));
					fileStates.push({ path: file.path, sha256: await sha256Hex(content.value.toString()), exists: true });
				} catch {
					fileStates.push({ path: file.path, sha256: undefined, exists: false });
				}
			}
		}

		return createAppPreviewScenarioImplementationSignature(config, fileStates);
	}

	private async clearTabScenarioSupport(tabId: string): Promise<void> {
		const model = this._registeredModels.get(tabId);
		if (!model) {
			return;
		}

		try {
			await playwrightInvokeRaw(this.playwrightService, APP_PREVIEW_PLAYWRIGHT_SESSION_ID, model.id, async (page, supportStorageKey) => {
				await page.evaluate(key => {
					const targetWindow = window as unknown as { __vscodeDesignerScenarioSupport?: unknown };
					delete targetWindow.__vscodeDesignerScenarioSupport;
					try {
						localStorage.removeItem(key);
					} catch {
						// Support feedback is page-lifetime only.
					}
				}, supportStorageKey);
			}, SCENARIO_SUPPORT_LOCAL_STORAGE_KEY);
		} catch (error) {
			this.logService.debug('[AppPreviewScenario] Failed to clear scenario support state', error);
		}
		this._onDidChangeSupport.fire(tabId);
	}

	private async applyScenarioToRegisteredTabs(): Promise<void> {
		for (const tabId of this._registeredModels.keys()) {
			await this.applyScenarioToTab(tabId);
		}
	}

	private async updateChatContext(activeTabId: string): Promise<void> {
		const value = await this.getScenarioChatContext(activeTabId);
		if (!value) {
			this.chatContextService.updateWorkspaceContextItems(SCENARIO_CHAT_CONTEXT_ID, []);
			return;
		}

		this.chatContextService.updateWorkspaceContextItems(SCENARIO_CHAT_CONTEXT_ID, [{
			handle: 0,
			label: 'App Preview Variants',
			modelDescription: 'Current App Preview variant controls and agent targeting rule.',
			value
		}]);
	}

	private getWorkspaceRoot(): URI | undefined {
		return this.workspaceContextService.getWorkspace().folders[0]?.uri;
	}

	private async getBranchName(repository: URI | undefined): Promise<string | undefined> {
		if (!repository) {
			return undefined;
		}

		try {
			return await this.localGitService.currentBranch(repository.fsPath);
		} catch {
			return undefined;
		}
	}

	private async getStorageKey(tabId: string): Promise<string | undefined> {
		const repository = this.getWorkspaceRoot();
		if (!repository) {
			return undefined;
		}

		return getAppPreviewScenarioStorageKey(repository.fsPath, await this.getBranchName(repository), tabId);
	}

	private async readStoredTabState(tabId: string): Promise<unknown> {
		const storageKey = await this.getStorageKey(tabId);
		if (!storageKey) {
			return {};
		}

		const raw = this.storageService.get(storageKey, StorageScope.WORKSPACE);
		if (!raw) {
			return {};
		}

		try {
			return JSON.parse(raw);
		} catch {
			return {};
		}
	}

	private async storeTabState(tabId: string, values: Record<string, AppPreviewScenarioControlValue>): Promise<void> {
		const storageKey = await this.getStorageKey(tabId);
		if (!storageKey) {
			return;
		}

		this.storageService.store(storageKey, JSON.stringify(values), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

registerSingleton(IAppPreviewScenarioService, AppPreviewScenarioService, InstantiationType.Delayed);

CommandsRegistry.registerCommand(CleanupAppPreviewScenarioArtifactsCommandId, accessor => {
	return accessor.get(IAppPreviewScenarioService).cleanupScenarioArtifacts(undefined);
});

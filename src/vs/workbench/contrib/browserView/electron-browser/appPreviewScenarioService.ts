/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { dirname, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { BrowserViewKind } from '../../../../platform/browserView/common/browserView.js';
import { IPlaywrightService } from '../../../../platform/browserView/common/playwrightService.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILocalGitService } from '../../../../platform/git/common/localGitService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IChatContextService } from '../../chat/browser/contextContrib/chatContextService.js';
import { APP_PREVIEW_SCENARIOS_CONFIG_PATH, AppPreviewScenarioControlValue, AppPreviewScenarioSupportStatus, createAppPreviewScenarioBridgePayload, createAppPreviewScenarioChatContext, createDefaultAppPreviewScenarioConfig, getAppPreviewScenarioStorageKey, IAppPreviewScenarioConfig, isAppPreviewScenarioDesignOnlyFilePath, normalizeAppPreviewScenarioState, parseAppPreviewScenarioConfig } from '../common/appPreviewScenario.js';
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

		try {
			const support = await playwrightInvokeRaw(this.playwrightService, APP_PREVIEW_PLAYWRIGHT_SESSION_ID, model.id, async (page, storageKey) => {
				return page.evaluate(key => {
					const fromWindow = (window as unknown as { __vscodeDesignerScenarioSupport?: unknown }).__vscodeDesignerScenarioSupport;
					if (fromWindow && typeof fromWindow === 'object') {
						return fromWindow;
					}
					try {
						const raw = localStorage.getItem(key);
						return raw ? JSON.parse(raw) : {};
					} catch {
						return {};
					}
				}, storageKey);
			}, SCENARIO_SUPPORT_LOCAL_STORAGE_KEY);

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
		}));

		void this.applyScenarioToTab(model.id);
		void this.updateChatContext(model.id);
	}

	async applyScenarioToTab(tabId: string): Promise<void> {
		const model = this._registeredModels.get(tabId);
		if (!model) {
			return;
		}

		const configState = await this.readScenarioConfig();
		const state = await this.getTabScenarioState(tabId);
		const support = await this.getTabSupport(tabId);
		const payload = createAppPreviewScenarioBridgePayload(configState.config, state, support);

		try {
			await playwrightInvokeRaw(this.playwrightService, APP_PREVIEW_PLAYWRIGHT_SESSION_ID, model.id, async (page, payload, scenarioStorageKey, supportStorageKey) => {
				const installScenario = ({ payload, scenarioStorageKey, supportStorageKey }: { payload: unknown; scenarioStorageKey: string; supportStorageKey: string }) => {
					const targetWindow = window as unknown as {
						__vscodeDesignerScenario?: unknown;
						__vscodeDesignerScenarioSupport?: unknown;
						__vscodeDesignerScenarioBridgeInstalled?: boolean;
					};
					targetWindow.__vscodeDesignerScenario = payload;
					try {
						localStorage.setItem(scenarioStorageKey, JSON.stringify(payload));
					} catch {
						// Some previews disable storage; the live window bridge still works.
					}
					if (!targetWindow.__vscodeDesignerScenarioBridgeInstalled) {
						targetWindow.__vscodeDesignerScenarioBridgeInstalled = true;
						window.addEventListener('vscode:designerScenarioSupport', event => {
							const detail = event instanceof CustomEvent ? event.detail : undefined;
							targetWindow.__vscodeDesignerScenarioSupport = detail;
							try {
								localStorage.setItem(supportStorageKey, JSON.stringify(detail ?? {}));
							} catch {
								// Support feedback is best-effort.
							}
						});
					}
					window.dispatchEvent(new CustomEvent('vscode:designerScenarioChange', { detail: payload }));
				};

				await page.addInitScript(({ payload, scenarioStorageKey, supportStorageKey }) => {
					const targetWindow = window as unknown as {
						__vscodeDesignerScenario?: unknown;
						__vscodeDesignerScenarioSupport?: unknown;
						__vscodeDesignerScenarioBridgeInstalled?: boolean;
					};
					targetWindow.__vscodeDesignerScenario = payload;
					try {
						localStorage.setItem(scenarioStorageKey, JSON.stringify(payload));
					} catch {
						// Some previews disable storage; the live window bridge still works.
					}
					if (!targetWindow.__vscodeDesignerScenarioBridgeInstalled) {
						targetWindow.__vscodeDesignerScenarioBridgeInstalled = true;
						window.addEventListener('vscode:designerScenarioSupport', event => {
							const detail = event instanceof CustomEvent ? event.detail : undefined;
							targetWindow.__vscodeDesignerScenarioSupport = detail;
							try {
								localStorage.setItem(supportStorageKey, JSON.stringify(detail ?? {}));
							} catch {
								// Support feedback is best-effort.
							}
						});
					}
				}, { payload, scenarioStorageKey, supportStorageKey });
				await page.evaluate(installScenario, { payload, scenarioStorageKey, supportStorageKey });
			}, payload, SCENARIO_LOCAL_STORAGE_KEY, SCENARIO_SUPPORT_LOCAL_STORAGE_KEY);
		} catch (error) {
			this.logService.debug('[AppPreviewScenario] Failed to apply scenario bridge', error);
		}
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

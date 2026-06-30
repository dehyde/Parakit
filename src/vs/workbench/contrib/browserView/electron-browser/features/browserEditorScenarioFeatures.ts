/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, clearNode, EventType } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { BrowserViewKind } from '../../../../../platform/browserView/common/browserView.js';
import { AppPreviewScenarioControlValue, AppPreviewScenarioSupportStatus, getAppPreviewScenarioControlKey, summarizeAppPreviewScenarioState } from '../../common/appPreviewScenario.js';
import { IAppPreviewScenarioService } from '../../common/appPreviewScenarioService.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { BrowserEditor, BrowserEditorContribution, BrowserWidgetLocation, IBrowserEditorWidget } from '../browserEditor.js';

class BrowserEditorScenarioController extends BrowserEditorContribution {
	private readonly _container = $('.browser-scenario-controller');
	private readonly _button: HTMLButtonElement;
	private readonly _panel = $('.browser-scenario-panel');
	private _model: IBrowserViewModel | undefined;
	private _refreshGeneration = 0;
	private readonly _supportByTab = new Map<string, Record<string, AppPreviewScenarioSupportStatus>>();

	constructor(
		editor: BrowserEditor,
		@IAppPreviewScenarioService private readonly appPreviewScenarioService: IAppPreviewScenarioService,
	) {
		super(editor);

		this._button = $('button.browser-scenario-button') as HTMLButtonElement;
		this._button.type = 'button';
		this._button.appendChild($('span', { class: ThemeIcon.asClassName(Codicon.variableGroup) }));
		this._button.appendChild($('span.browser-scenario-button-label', undefined, localize('scenario.button', "Variants")));
		this._container.appendChild(this._button);
		this._container.style.display = 'none';

		this._panel.style.display = 'none';
		mainWindow.document.body.appendChild(this._panel);

		this._register(addDisposableListener(this._button, EventType.CLICK, () => {
			void this._togglePanel();
		}));
		this._register(addDisposableListener(mainWindow.document, EventType.MOUSE_DOWN, event => {
			const target = event.target as Node | null;
			if (target && (this._panel.contains(target) || this._container.contains(target))) {
				return;
			}
			this._closePanel();
		}));
		this._register(addDisposableListener(mainWindow, EventType.RESIZE, () => this._positionPanel()));
		this._register(addDisposableListener(mainWindow.document, EventType.KEY_DOWN, event => {
			if (event.key === 'Escape') {
				this._closePanel();
			}
		}));
		this._register(this.appPreviewScenarioService.onDidChangeScenario(event => {
			if (!event.tabId || event.tabId === this._model?.id) {
				void this._refresh();
			}
		}));
		this._register(this.appPreviewScenarioService.onDidChangeSupport(tabId => {
			if (tabId === this._model?.id) {
				void this._refresh();
			}
		}));
		this._register(toDisposable(() => this._panel.remove()));
	}

	override get widgets(): readonly IBrowserEditorWidget[] {
		return [{ location: BrowserWidgetLocation.PostUrl, element: this._container, order: 90 }];
	}

	protected override onModelAttached(model: IBrowserViewModel, store: DisposableStore): void {
		this._model = model;
		const visible = model.owner.kind === BrowserViewKind.AppPreview;
		this._container.style.display = visible ? '' : 'none';
		if (!visible) {
			this._closePanel();
			return;
		}

		this.appPreviewScenarioService.registerAppPreviewModel(model);
		store.add(model.onDidNavigate(() => void this._refresh()));
		store.add(model.onDidChangeLoadingState(() => void this._refresh()));
		void this._refresh();
	}

	override onModelDetached(): void {
		this._model = undefined;
		this._supportByTab.clear();
		this._container.style.display = 'none';
		this._closePanel();
	}

	private async _togglePanel(): Promise<void> {
		if (this._panel.style.display === 'none') {
			await this._openPanel();
		} else {
			this._closePanel();
		}
	}

	private async _openPanel(): Promise<void> {
		if (!this._model || this._model.owner.kind !== BrowserViewKind.AppPreview) {
			return;
		}

		this._panel.style.display = '';
		this._renderPendingPanel();
		this._positionPanel();
		await this._refresh();
	}

	private _closePanel(): void {
		this._panel.style.display = 'none';
	}

	private _positionPanel(): void {
		if (this._panel.style.display === 'none') {
			return;
		}

		const rect = this._button.getBoundingClientRect();
		const width = Math.min(380, mainWindow.innerWidth - 16);
		const left = Math.max(8, Math.min(mainWindow.innerWidth - width - 8, rect.right - width));
		this._panel.style.width = `${width}px`;
		this._panel.style.left = `${left}px`;
		this._panel.style.top = `${rect.bottom + 6}px`;
	}

	private async _refresh(options: { refreshSupport?: boolean } = {}): Promise<void> {
		const model = this._model;
		if (!model || model.owner.kind !== BrowserViewKind.AppPreview) {
			return;
		}

		const generation = ++this._refreshGeneration;
		const [configState, values] = await Promise.all([
			this.appPreviewScenarioService.readScenarioConfig(),
			this.appPreviewScenarioService.getTabScenarioState(model.id),
		]);
		if (generation !== this._refreshGeneration) {
			return;
		}

		const support = this._supportByTab.get(model.id) ?? {};
		const summary = summarizeAppPreviewScenarioState(configState.config, values);
		const isHappyPath = summary === 'Happy path';
		this._button.classList.toggle('custom', !isHappyPath);
		const label = this._button.querySelector('.browser-scenario-button-label');
		if (label) {
			label.textContent = isHappyPath ? localize('scenario.button', "Variants") : summary;
		}
		this._button.title = localize('scenario.buttonTitle', "App Preview variants: {0}", summary);

		if (this._panel.style.display !== 'none') {
			this._renderPanel(model.id, configState, values, support, summary);
			this._positionPanel();
			if (options.refreshSupport ?? true) {
				void this._refreshSupport(model.id, generation);
			}
		}
	}

	private async _refreshSupport(tabId: string, generation: number): Promise<void> {
		const support = await this.appPreviewScenarioService.getTabSupport(tabId);
		if (generation !== this._refreshGeneration || this._model?.id !== tabId) {
			return;
		}

		this._supportByTab.set(tabId, support);
		if (this._panel.style.display !== 'none') {
			void this._refresh({ refreshSupport: false });
		}
	}

	private _renderPendingPanel(): void {
		clearNode(this._panel);

		const header = $('.browser-scenario-panel-header');
		header.appendChild($('.browser-scenario-panel-title', undefined, localize('scenario.title', "App Preview Variants")));
		header.appendChild($('.browser-scenario-panel-summary', undefined, localize('scenario.loading', "Loading variants...")));
		this._panel.appendChild(header);
	}

	private _renderPanel(tabId: string, configState: Awaited<ReturnType<IAppPreviewScenarioService['readScenarioConfig']>>, values: Record<string, AppPreviewScenarioControlValue>, support: Record<string, AppPreviewScenarioSupportStatus>, summary: string): void {
		clearNode(this._panel);

		const header = $('.browser-scenario-panel-header');
		header.appendChild($('.browser-scenario-panel-title', undefined, localize('scenario.title', "App Preview Variants")));
		header.appendChild($('.browser-scenario-panel-summary', undefined, summary));
		this._panel.appendChild(header);

		if (configState.errors.length > 0) {
			this._panel.appendChild($('.browser-scenario-error', undefined, configState.errors[0].message));
		}

		if (configState.source === 'starter') {
			const starter = $('.browser-scenario-starter');
			starter.appendChild($('.browser-scenario-starter-text', undefined, localize('scenario.starter', "Starter variant groups are not saved yet.")));
			const saveButton = this._createTextButton(localize('scenario.save', "Create"));
			saveButton.classList.add('primary');
			saveButton.addEventListener('click', () => {
				void this.appPreviewScenarioService.saveScenarioConfig(undefined, configState.config).then(() => this._refresh());
			});
			starter.appendChild(saveButton);
			this._panel.appendChild(starter);
		}

		const defaultRow = $('.browser-scenario-default-row');
		defaultRow.appendChild($('span.browser-scenario-default-label', undefined, localize('scenario.branchDefault', "Branch default")));
		defaultRow.appendChild($('span.browser-scenario-default-value', undefined, localize('scenario.happyPath', "Happy path")));
		this._panel.appendChild(defaultRow);

		for (const group of configState.config.groups) {
			const section = $('.section.browser-scenario-group');
			section.appendChild($('.h3.browser-scenario-group-title', undefined, group.label));
			for (const control of group.controls) {
				const key = getAppPreviewScenarioControlKey(group.id, control.id);
				const row = $('.browser-scenario-control');
				const label = $('.browser-scenario-control-label');
				label.appendChild($('span', undefined, control.label));
				label.appendChild(this._createSupportBadge(support[key]));
				row.appendChild(label);

				if (control.type === 'choice') {
					const segments = $('.browser-scenario-segments');
					for (const choice of control.choices) {
						const segment = this._createTextButton(choice.label);
						segment.classList.add('browser-scenario-segment');
						segment.classList.toggle('checked', values[key] === choice.id);
						segment.addEventListener('click', () => {
							void this.appPreviewScenarioService.setTabControlValue(tabId, key, choice.id).then(() => this._refresh());
						});
						segments.appendChild(segment);
					}
					row.appendChild(segments);
				} else {
					const switchLabel = $('label.browser-scenario-switch');
					const input = $('input') as HTMLInputElement;
					input.type = 'checkbox';
					input.checked = values[key] === true;
					input.addEventListener('change', () => {
						void this.appPreviewScenarioService.setTabControlValue(tabId, key, input.checked).then(() => this._refresh());
					});
					switchLabel.appendChild(input);
					switchLabel.appendChild($('.span.browser-scenario-switch-track'));
					row.appendChild(switchLabel);
				}

				section.appendChild(row);
			}
			this._panel.appendChild(section);
		}

		const footer = $('.browser-scenario-footer');
		const resetButton = this._createTextButton(localize('scenario.reset', "Reset"));
		resetButton.addEventListener('click', () => {
			void this.appPreviewScenarioService.resetTabToDefault(tabId).then(() => this._refresh());
		});
		const cleanupButton = this._createTextButton(localize('scenario.cleanup', "Cleanup"));
		cleanupButton.addEventListener('click', () => {
			void this._runCleanup();
		});
		footer.appendChild(cleanupButton);
		footer.appendChild(resetButton);
		this._panel.appendChild(footer);
	}

	private _createSupportBadge(status: AppPreviewScenarioSupportStatus | undefined): HTMLElement {
		const effectiveStatus = status ?? 'unknown';
		const badge = $('span.browser-scenario-support', undefined, this._supportLabel(effectiveStatus));
		badge.classList.add(this._supportClass(effectiveStatus));
		badge.title = effectiveStatus;
		return badge;
	}

	private _supportLabel(status: AppPreviewScenarioSupportStatus): string {
		if (status === 'supported') {
			return localize('scenario.supported', "supported");
		}
		if (status === 'unsupported') {
			return localize('scenario.unsupported', "unsupported");
		}
		if (status === 'unknown') {
			return localize('scenario.unknown', "unknown");
		}
		return localize('scenario.diagnostic', "diagnostic");
	}

	private _supportClass(status: AppPreviewScenarioSupportStatus): string {
		if (status === 'supported') {
			return 'supported';
		}
		if (status === 'unsupported') {
			return 'unsupported';
		}
		if (status === 'unknown') {
			return 'unknown';
		}
		return 'diagnostic';
	}

	private _createTextButton(label: string): HTMLButtonElement {
		const button = $('button.browser-scenario-text-button') as HTMLButtonElement;
		button.type = 'button';
		button.textContent = label;
		return button;
	}

	private async _runCleanup(): Promise<void> {
		const result = await this.appPreviewScenarioService.cleanupScenarioArtifacts(undefined);
		const message = result.modified.length > 0
			? localize('scenario.cleanupBlocked', "Cleanup blocked: edited design helper files.")
			: localize('scenario.cleanupDone', "Variant artifacts cleaned up.");
		const status = $('.browser-scenario-cleanup-status', undefined, message);
		this._panel.appendChild(status);
		await this._refresh();
	}
}

BrowserEditor.registerContribution(BrowserEditorScenarioController);

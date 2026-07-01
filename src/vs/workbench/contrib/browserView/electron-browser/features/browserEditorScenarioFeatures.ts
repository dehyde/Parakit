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
import { addAppPreviewScenarioChoice, addAppPreviewScenarioControl, addAppPreviewScenarioGroup, AppPreviewScenarioControlValue, AppPreviewScenarioEditableControlType, AppPreviewScenarioSupportStatus, areAppPreviewScenarioValuesEqual, getAppPreviewScenarioControlKey, IAppPreviewScenarioConfig, moveAppPreviewScenarioControl, removeAppPreviewScenarioChoice, removeAppPreviewScenarioControl, removeAppPreviewScenarioGroup, summarizeAppPreviewScenarioState } from '../../common/appPreviewScenario.js';
import { IAppPreviewScenarioService } from '../../common/appPreviewScenarioService.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { BrowserEditor, BrowserEditorContribution, BrowserWidgetLocation, IBrowserEditorWidget } from '../browserEditor.js';
import { IScenarioPanelPosition, positionScenarioPanelAt, positionScenarioPanelDropdown, updateScenarioPanelDropdownHost } from './browserEditorScenarioPanel.js';

class BrowserEditorScenarioController extends BrowserEditorContribution {
	private readonly _container = $('.browser-scenario-controller');
	private readonly _button: HTMLButtonElement;
	private readonly _panel = $('.browser-scenario-panel');
	private _model: IBrowserViewModel | undefined;
	private _refreshGeneration = 0;
	private readonly _supportByTab = new Map<string, Record<string, AppPreviewScenarioSupportStatus>>();
	private _addingGroup = false;
	private _addingControlGroupId: string | undefined;
	private _addingChoiceKey: string | undefined;
	private _panelPosition: IScenarioPanelPosition | undefined;
	private _panelDragStore: DisposableStore | undefined;

	constructor(
		editor: BrowserEditor,
		@IAppPreviewScenarioService private readonly appPreviewScenarioService: IAppPreviewScenarioService,
	) {
		super(editor);

		this._button = $('button.browser-scenario-button') as HTMLButtonElement;
		this._button.type = 'button';
		this._button.setAttribute('aria-haspopup', 'menu');
		this._button.setAttribute('aria-expanded', 'false');
		this._button.appendChild($('span', { class: ThemeIcon.asClassName(Codicon.variableGroup) }));
		this._button.appendChild($('span.browser-scenario-button-label', undefined, localize('scenario.button', "Variants")));
		this._container.appendChild(this._button);
		this._container.style.display = 'none';

		this._panel.style.display = 'none';
		updateScenarioPanelDropdownHost(this._container, this._panel, false);

		this._register(addDisposableListener(this._button, EventType.CLICK, () => {
			void this._togglePanel();
		}));
		this._register(addDisposableListener(mainWindow, EventType.RESIZE, () => this._positionPanel()));
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
			return;
		}

		this._positionPanel();
	}

	private async _openPanel(): Promise<void> {
		if (!this._model || this._model.owner.kind !== BrowserViewKind.AppPreview) {
			return;
		}

		this._panel.style.display = '';
		this._button.setAttribute('aria-expanded', 'true');
		updateScenarioPanelDropdownHost(this._container, this._panel, true);
		this._renderPendingPanel();
		this._positionPanel();
		await this._refresh();
	}

	private _closePanel(): void {
		this._panel.style.display = 'none';
		this._button.setAttribute('aria-expanded', 'false');
		updateScenarioPanelDropdownHost(this._container, this._panel, false);
		this._panelDragStore?.dispose();
		this._panelDragStore = undefined;
	}

	private _positionPanel(): void {
		if (this._panel.style.display === 'none') {
			return;
		}

		if (this._panelPosition) {
			this._panelPosition = positionScenarioPanelAt(this._panel, mainWindow, this._panelPosition);
			return;
		}

		positionScenarioPanelDropdown(this._button, this._panel, mainWindow);
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
		const isDefault = summary === 'Default';
		this._button.classList.toggle('custom', !isDefault);
		const label = this._button.querySelector('.browser-scenario-button-label');
		if (label) {
			label.textContent = isDefault ? localize('scenario.button', "Variants") : summary;
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
		header.addEventListener('mousedown', event => this._startPanelDrag(event));
		const titleRow = $('.browser-scenario-panel-title-row');
		titleRow.appendChild($('.browser-scenario-panel-title', undefined, localize('scenario.title', "App Preview Variants")));
		const actions = $('.span.browser-scenario-panel-actions');
		actions.appendChild(this._createCloseButton());
		titleRow.appendChild(actions);
		header.appendChild(titleRow);
		header.appendChild($('.browser-scenario-panel-summary', undefined, localize('scenario.loading', "Loading variants...")));
		this._panel.appendChild(header);
	}

	private _renderPanel(tabId: string, configState: Awaited<ReturnType<IAppPreviewScenarioService['readScenarioConfig']>>, values: Record<string, AppPreviewScenarioControlValue>, support: Record<string, AppPreviewScenarioSupportStatus>, summary: string): void {
		clearNode(this._panel);
		const canEdit = configState.errors.length === 0;

		const header = $('.browser-scenario-panel-header');
		header.addEventListener('mousedown', event => this._startPanelDrag(event));
		const titleRow = $('.browser-scenario-panel-title-row');
		titleRow.appendChild($('.browser-scenario-panel-title', undefined, localize('scenario.title', "App Preview Variants")));
		const panelActions = $('.span.browser-scenario-panel-actions');
		if (canEdit) {
			const addGroupButton = this._createIconButton(Codicon.add, localize('scenario.addGroup', "Add group"));
			addGroupButton.addEventListener('click', () => {
				this._addingGroup = true;
				this._addingControlGroupId = undefined;
				this._addingChoiceKey = undefined;
				void this._refresh({ refreshSupport: false });
			});
			panelActions.appendChild(addGroupButton);
		}
		panelActions.appendChild(this._createCloseButton());
		titleRow.appendChild(panelActions);
		header.appendChild(titleRow);
		header.appendChild($('.browser-scenario-panel-summary', undefined, summary));
		if (this._addingGroup && canEdit) {
			header.appendChild(this._createAddGroupForm(configState.config));
		}
		this._panel.appendChild(header);

		if (configState.errors.length > 0) {
			this._panel.appendChild($('.browser-scenario-error', undefined, configState.errors[0].message));
		}

		for (const group of configState.config.groups) {
			const section = $('.section.browser-scenario-group');
			section.dataset.scenarioGroupId = group.id;
			if (canEdit) {
				section.addEventListener('dragover', event => {
					event.preventDefault();
					section.classList.add('drag-target');
				});
				section.addEventListener('dragleave', () => {
					section.classList.remove('drag-target');
				});
				section.addEventListener('drop', event => {
					event.preventDefault();
					section.classList.remove('drag-target');
					const dragPayload = this._getDragPayload(event);
					if (!dragPayload) {
						return;
					}
					void this._saveScenarioConfig(moveAppPreviewScenarioControl(configState.config, dragPayload.groupId, dragPayload.controlId, group.id));
				});
			}

			const groupHeader = $('.browser-scenario-group-header');
			groupHeader.appendChild($('.h3.browser-scenario-group-title', undefined, group.label));
			if (canEdit) {
				const groupActions = $('.span.browser-scenario-group-actions');
				const addControlButton = this._createIconButton(Codicon.add, localize('scenario.addProperty', "Add property"));
				addControlButton.addEventListener('click', () => {
					this._addingGroup = false;
					this._addingControlGroupId = group.id;
					this._addingChoiceKey = undefined;
					void this._refresh({ refreshSupport: false });
				});
				groupActions.appendChild(addControlButton);
				const removeGroupButton = this._createIconButton(Codicon.trash, localize('scenario.removeGroup', "Remove group"));
				removeGroupButton.addEventListener('click', () => {
					void this._saveScenarioConfig(removeAppPreviewScenarioGroup(configState.config, group.id));
				});
				groupActions.appendChild(removeGroupButton);
				groupHeader.appendChild(groupActions);
			}
			section.appendChild(groupHeader);
			if (this._addingControlGroupId === group.id && canEdit) {
				section.appendChild(this._createAddControlForm(configState.config, group.id));
			}
			if (group.controls.length === 0) {
				section.appendChild($('.browser-scenario-empty-group', undefined, localize('scenario.emptyGroup', "No properties yet.")));
			}

			for (const control of group.controls) {
				const key = getAppPreviewScenarioControlKey(group.id, control.id);
				const defaultValue = configState.config.defaultValues[key];
				const row = $('.browser-scenario-control');
				row.draggable = canEdit;
				if (canEdit) {
					row.addEventListener('dragstart', event => {
						row.classList.add('dragging');
						event.dataTransfer?.setData('application/vnd.code.appPreviewVariantControl', JSON.stringify({ groupId: group.id, controlId: control.id }));
						event.dataTransfer?.setData('text/plain', key);
					});
					row.addEventListener('dragend', () => row.classList.remove('dragging'));
				}

				const label = $('.browser-scenario-control-label');
				const name = $('.span.browser-scenario-control-name');
				if (canEdit) {
					name.appendChild($('span', { class: `${ThemeIcon.asClassName(Codicon.arrowSwap)} browser-scenario-drag-handle` }));
				}
				name.appendChild($('span', undefined, control.label));
				label.appendChild(name);

				const actions = $('.span.browser-scenario-control-actions');
				actions.appendChild(this._createSupportBadge(support[key]));
				actions.appendChild(this._createControlDefaultButton(tabId, key, areAppPreviewScenarioValuesEqual(values[key], defaultValue), defaultValue));
				if (canEdit) {
					const removeControlButton = this._createIconButton(Codicon.trash, localize('scenario.removeProperty', "Remove property"));
					removeControlButton.addEventListener('click', () => {
						void this._saveScenarioConfig(removeAppPreviewScenarioControl(configState.config, group.id, control.id));
					});
					actions.appendChild(removeControlButton);
				}
				label.appendChild(actions);
				row.appendChild(label);

				if (control.type === 'choice' || control.type === 'multiChoice') {
					row.classList.add(control.type === 'choice' ? 'choice' : 'multi-choice');
					const currentValues = Array.isArray(values[key]) ? values[key] : [];
					const dropdown = $('details.browser-scenario-value-dropdown') as HTMLDetailsElement;
					const summary = $('summary.browser-scenario-value-summary');
					summary.classList.toggle('custom', !areAppPreviewScenarioValuesEqual(values[key], defaultValue));
					summary.appendChild($('span.browser-scenario-value-summary-text', undefined, this._formatControlSelection(control.choices, values[key])));
					dropdown.appendChild(summary);
					dropdown.open = this._addingChoiceKey === key;
					const menu = $('.browser-scenario-value-menu');
					for (const choice of control.choices) {
						const checked = control.type === 'choice' ? values[key] === choice.id : currentValues.includes(choice.id);
						const valueRow = $('.browser-scenario-value-menu-row');
						const item = this._createTextButton(choice.label);
						item.classList.add('browser-scenario-value-menu-item');
						item.classList.toggle('checked', checked);
						item.addEventListener('click', () => {
							const nextValue = control.type === 'choice'
								? choice.id
								: checked
									? currentValues.filter(value => value !== choice.id)
									: [...currentValues, choice.id];
							if (control.type === 'choice') {
								dropdown.open = false;
							}
							void this.appPreviewScenarioService.setTabControlValue(tabId, key, nextValue).then(() => this._refresh());
						});
						valueRow.appendChild(item);
						if (canEdit) {
							const removeChoiceButton = this._createTextButton(localize('scenario.remove', "Remove"));
							removeChoiceButton.classList.add('browser-scenario-value-remove');
							removeChoiceButton.disabled = control.choices.length <= 1;
							removeChoiceButton.addEventListener('click', event => {
								event.preventDefault();
								event.stopPropagation();
								void this._saveScenarioConfig(removeAppPreviewScenarioChoice(configState.config, group.id, control.id, choice.id));
							});
							valueRow.appendChild(removeChoiceButton);
						}
						menu.appendChild(valueRow);
					}
					if (canEdit) {
						const valueFooter = $('.browser-scenario-value-menu-footer');
						const addChoiceButton = this._createTextButton(localize('scenario.addValue', "Add value"));
						addChoiceButton.classList.add('browser-scenario-add-value');
						addChoiceButton.addEventListener('click', event => {
							event.preventDefault();
							event.stopPropagation();
							this._addingGroup = false;
							this._addingControlGroupId = undefined;
							this._addingChoiceKey = key;
							void this._refresh({ refreshSupport: false });
						});
						if (this._addingChoiceKey === key) {
							valueFooter.appendChild(this._createAddChoiceForm(configState.config, group.id, control.id));
						} else {
							valueFooter.appendChild(addChoiceButton);
						}
						menu.appendChild(valueFooter);
					}
					dropdown.appendChild(menu);
					row.appendChild(dropdown);
				} else {
					row.classList.add('toggle');
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

	private _createAddGroupForm(config: IAppPreviewScenarioConfig): HTMLFormElement {
		return this._createInlineTextForm({
			placeholder: localize('scenario.groupName', "Group name"),
			submitLabel: localize('scenario.add', "Add"),
			onSubmit: label => this._saveScenarioConfig(addAppPreviewScenarioGroup(config, label)),
			onCancel: () => {
				this._addingGroup = false;
				void this._refresh({ refreshSupport: false });
			}
		});
	}

	private _createAddControlForm(config: IAppPreviewScenarioConfig, groupId: string): HTMLFormElement {
		const form = $('form.browser-scenario-inline-form') as HTMLFormElement;
		const input = $('input.browser-scenario-inline-input') as HTMLInputElement;
		input.type = 'text';
		input.placeholder = localize('scenario.propertyName', "Property name");
		input.setAttribute('aria-label', localize('scenario.propertyNameAria', "Property name"));

		const select = $('select.browser-scenario-inline-select') as HTMLSelectElement;
		for (const option of [
			{ value: 'choice', label: localize('scenario.singleSelect', "Single select") },
			{ value: 'multiChoice', label: localize('scenario.multiSelect', "Multi select") },
			{ value: 'toggle', label: localize('scenario.boolean', "Boolean") },
		]) {
			const optionElement = $('option') as HTMLOptionElement;
			optionElement.value = option.value;
			optionElement.textContent = option.label;
			select.appendChild(optionElement);
		}

		const submit = this._createTextButton(localize('scenario.add', "Add"));
		submit.classList.add('primary');
		const cancel = this._createTextButton(localize('scenario.cancel', "Cancel"));
		cancel.addEventListener('click', () => {
			this._addingControlGroupId = undefined;
			void this._refresh({ refreshSupport: false });
		});

		form.addEventListener('submit', event => {
			event.preventDefault();
			const label = input.value.trim();
			if (!label) {
				input.focus();
				return;
			}

			void this._saveScenarioConfig(addAppPreviewScenarioControl(config, groupId, select.value as AppPreviewScenarioEditableControlType, label));
		});

		form.append(input, select, submit, cancel);
		mainWindow.setTimeout(() => input.focus(), 0);
		return form;
	}

	private _createAddChoiceForm(config: IAppPreviewScenarioConfig, groupId: string, controlId: string): HTMLFormElement {
		return this._createInlineTextForm({
			placeholder: localize('scenario.valueName', "Value name"),
			submitLabel: localize('scenario.add', "Add"),
			onSubmit: label => this._saveScenarioConfig(addAppPreviewScenarioChoice(config, groupId, controlId, label)),
			onCancel: () => {
				this._addingChoiceKey = undefined;
				void this._refresh({ refreshSupport: false });
			}
		});
	}

	private _createInlineTextForm(options: { placeholder: string; submitLabel: string; onSubmit: (label: string) => void; onCancel: () => void }): HTMLFormElement {
		const form = $('form.browser-scenario-inline-form') as HTMLFormElement;
		const input = $('input.browser-scenario-inline-input') as HTMLInputElement;
		input.type = 'text';
		input.placeholder = options.placeholder;
		input.setAttribute('aria-label', options.placeholder);

		const submit = this._createTextButton(options.submitLabel);
		submit.classList.add('primary');
		const cancel = this._createTextButton(localize('scenario.cancel', "Cancel"));
		cancel.addEventListener('click', options.onCancel);

		form.addEventListener('submit', event => {
			event.preventDefault();
			const label = input.value.trim();
			if (!label) {
				input.focus();
				return;
			}
			options.onSubmit(label);
		});

		form.append(input, submit, cancel);
		mainWindow.setTimeout(() => input.focus(), 0);
		return form;
	}

	private async _saveScenarioConfig(config: IAppPreviewScenarioConfig): Promise<void> {
		this._addingGroup = false;
		this._addingControlGroupId = undefined;
		this._addingChoiceKey = undefined;
		await this.appPreviewScenarioService.saveScenarioConfig(undefined, config);
		await this._refresh();
	}

	private _getDragPayload(event: DragEvent): { groupId: string; controlId: string } | undefined {
		const raw = event.dataTransfer?.getData('application/vnd.code.appPreviewVariantControl');
		if (!raw) {
			return undefined;
		}

		try {
			const parsed = JSON.parse(raw) as { groupId?: unknown; controlId?: unknown };
			if (typeof parsed.groupId === 'string' && typeof parsed.controlId === 'string') {
				return { groupId: parsed.groupId, controlId: parsed.controlId };
			}
		} catch {
			return undefined;
		}

		return undefined;
	}

	private _createCloseButton(): HTMLButtonElement {
		const closeButton = this._createIconButton(Codicon.close, localize('scenario.close', "Close variants"));
		closeButton.addEventListener('click', () => this._closePanel());
		return closeButton;
	}

	private _startPanelDrag(event: MouseEvent): void {
		if (event.button !== 0 || this._panel.style.display === 'none') {
			return;
		}

		const target = event.target as HTMLElement | null;
		if (target?.closest('button,input,select,textarea,summary,details,a')) {
			return;
		}

		event.preventDefault();
		const rect = this._panel.getBoundingClientRect();
		const offsetX = event.clientX - rect.left;
		const offsetY = event.clientY - rect.top;
		const dragStore = new DisposableStore();
		this._panelDragStore?.dispose();
		this._panelDragStore = dragStore;

		const stopDrag = () => {
			dragStore.dispose();
			if (this._panelDragStore === dragStore) {
				this._panelDragStore = undefined;
			}
		};

		dragStore.add(addDisposableListener(mainWindow.document, EventType.MOUSE_MOVE, moveEvent => {
			moveEvent.preventDefault();
			this._panelPosition = positionScenarioPanelAt(this._panel, mainWindow, {
				left: moveEvent.clientX - offsetX,
				top: moveEvent.clientY - offsetY
			});
		}));
		dragStore.add(addDisposableListener(mainWindow.document, EventType.MOUSE_UP, stopDrag));
		dragStore.add(addDisposableListener(mainWindow, EventType.BLUR, stopDrag));
	}

	private _createSupportBadge(status: AppPreviewScenarioSupportStatus | undefined): HTMLElement {
		const effectiveStatus = status ?? 'unknown';
		const badge = $('span.browser-scenario-support', undefined, this._supportLabel(effectiveStatus));
		badge.classList.add(this._supportClass(effectiveStatus));
		badge.title = effectiveStatus;
		return badge;
	}

	private _formatControlSelection(choices: readonly { id: string; label: string }[], value: AppPreviewScenarioControlValue): string {
		if (Array.isArray(value)) {
			if (value.length === 0) {
				return localize('scenario.noneSelected', "None");
			}
			return value
				.map(item => choices.find(choice => choice.id === item)?.label ?? item)
				.join(', ');
		}

		if (typeof value === 'string') {
			return choices.find(choice => choice.id === value)?.label ?? value;
		}

		return localize('scenario.noneSelected', "None");
	}

	private _supportLabel(status: AppPreviewScenarioSupportStatus): string {
		if (status === 'supported') {
			return localize('scenario.supported', "supported");
		}
		if (status === 'unsupported') {
			return localize('scenario.unsupported', "unsupported");
		}
		if (status === 'unknown') {
			return '';
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

	private _createIconButton(icon: ThemeIcon, label: string): HTMLButtonElement {
		const button = $('button.browser-scenario-icon-button') as HTMLButtonElement;
		button.type = 'button';
		button.title = label;
		button.setAttribute('aria-label', label);
		button.appendChild($('span', { class: ThemeIcon.asClassName(icon) }));
		return button;
	}

	private _createControlDefaultButton(tabId: string, key: string, isDefault: boolean, defaultValue: AppPreviewScenarioControlValue | undefined): HTMLButtonElement {
		const button = this._createTextButton(localize('scenario.controlDefault', "Default"));
		button.classList.add('browser-scenario-control-default');
		button.disabled = isDefault || defaultValue === undefined;
		button.title = isDefault
			? localize('scenario.controlDefaultCurrent', "This control is already using its default value.")
			: localize('scenario.controlDefaultRevert', "Revert this control to its default value.");
		button.addEventListener('click', () => {
			if (defaultValue !== undefined) {
				void this.appPreviewScenarioService.setTabControlValue(tabId, key, defaultValue).then(() => this._refresh());
			}
		});
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

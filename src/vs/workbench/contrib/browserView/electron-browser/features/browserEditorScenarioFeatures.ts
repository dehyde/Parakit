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
import { addAppPreviewScenarioChoice, addAppPreviewScenarioControl, addAppPreviewScenarioGroup, AppPreviewScenarioControlValue, AppPreviewScenarioEditableControlType, AppPreviewScenarioSupportStatus, areAppPreviewScenarioValuesEqual, getAppPreviewScenarioControlKey, IAppPreviewScenarioConfig, IAppPreviewScenarioGroup, moveAppPreviewScenarioControl, removeAppPreviewScenarioChoice, removeAppPreviewScenarioControl, removeAppPreviewScenarioGroup, summarizeAppPreviewScenarioState, updateAppPreviewScenarioChoiceLabel, updateAppPreviewScenarioControlLabel } from '../../common/appPreviewScenario.js';
import { IAppPreviewScenarioService } from '../../common/appPreviewScenarioService.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { BrowserEditor, BrowserEditorContribution, BrowserWidgetLocation, IBrowserEditorWidget } from '../browserEditor.js';
import { closeScenarioGroupMenuSurface, createScenarioPanelToolbarWidget, isScenarioPanelToolbarOpen, positionScenarioGroupMenu, setScenarioPanelToolbarOpen } from './browserEditorScenarioPanel.js';

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
	private _openGroupId: string | undefined;
	private _openGroupButton: HTMLElement | undefined;
	private _openGroupMenu: HTMLElement | undefined;
	private readonly _pendingChoiceValues = new Map<string, AppPreviewScenarioControlValue>();

	constructor(
		editor: BrowserEditor,
		@IAppPreviewScenarioService private readonly appPreviewScenarioService: IAppPreviewScenarioService,
	) {
		super(editor);

		this._button = $('button.browser-scenario-button') as HTMLButtonElement;
		this._button.type = 'button';
		this._button.setAttribute('aria-haspopup', 'dialog');
		this._button.setAttribute('aria-expanded', 'false');
		this._button.appendChild($('span', { class: ThemeIcon.asClassName(Codicon.variableGroup) }));
		this._button.appendChild($('span.browser-scenario-button-label', undefined, localize('scenario.button', "Variants")));
		this._container.appendChild(this._button);
		this._container.style.display = 'none';

		setScenarioPanelToolbarOpen(this._panel, false);

		this._register(addDisposableListener(this._button, EventType.CLICK, () => {
			void this._togglePanel();
		}));
		this._register(addDisposableListener(mainWindow, EventType.RESIZE, () => this._positionOpenGroupMenu()));
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
		return [
			{ location: BrowserWidgetLocation.PostUrl, element: this._container, order: 90 },
			createScenarioPanelToolbarWidget(this._panel)
		];
	}

	protected override onModelAttached(model: IBrowserViewModel, store: DisposableStore): void {
		this._model = model;
		const visible = model.owner.kind === BrowserViewKind.AppPreview;
		this._container.style.display = visible ? '' : 'none';
		if (!visible) {
			void this._closePanel();
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
		void this._closePanel();
	}

	private async _togglePanel(): Promise<void> {
		if (isScenarioPanelToolbarOpen(this._panel)) {
			await this._closePanel();
			return;
		}

		await this._openPanel();
	}

	private async _openPanel(): Promise<void> {
		if (!this._model || this._model.owner.kind !== BrowserViewKind.AppPreview) {
			return;
		}

		setScenarioPanelToolbarOpen(this._panel, true);
		this._button.setAttribute('aria-expanded', 'true');
		this._renderPendingPanel();
		this.editor.layoutBrowserContainer();
		await this._refresh();
	}

	private async _closePanel(): Promise<void> {
		const wasOpen = isScenarioPanelToolbarOpen(this._panel);
		setScenarioPanelToolbarOpen(this._panel, false);
		this._button.setAttribute('aria-expanded', 'false');
		this._openGroupId = undefined;
		this._openGroupButton = undefined;
		this._openGroupMenu = undefined;
		this._addingGroup = false;
		this._addingControlGroupId = undefined;
		this._addingChoiceKey = undefined;
		this._pendingChoiceValues.clear();
		if (wasOpen && this._model?.owner.kind === BrowserViewKind.AppPreview) {
			await this.appPreviewScenarioService.resetTabToDefault(this._model.id);
			await this._refresh({ refreshSupport: false });
		}
		if (wasOpen) {
			this.editor.layoutBrowserContainer();
		}
	}

	private _closeOpenMenuSurface(): void {
		const hadOpenMenu = !!this._openGroupMenu || !!this._panel.querySelector('.browser-scenario-group-menu');
		closeScenarioGroupMenuSurface(this._panel);
		this._addingGroup = false;
		this._addingControlGroupId = undefined;
		this._addingChoiceKey = undefined;
		this._openGroupId = undefined;
		this._openGroupButton = undefined;
		this._openGroupMenu = undefined;
		this._pendingChoiceValues.clear();
		if (hadOpenMenu) {
			this.editor.layoutBrowserContainer();
		}
	}

	private _positionOpenGroupMenu(): void {
		if (!isScenarioPanelToolbarOpen(this._panel) || !this._openGroupButton || !this._openGroupMenu) {
			return;
		}

		positionScenarioGroupMenu(this._panel, this._openGroupButton, this._openGroupMenu, mainWindow);
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
		this._button.classList.toggle('custom', isScenarioPanelToolbarOpen(this._panel));
		const label = this._button.querySelector('.browser-scenario-button-label');
		if (label) {
			label.textContent = localize('scenario.button', "Variants");
		}
		this._button.title = localize('scenario.buttonTitle', "App Preview variants");

		if (isScenarioPanelToolbarOpen(this._panel)) {
			this._renderPanel(model.id, configState, values, support, summary);
			this.editor.layoutBrowserContainer();
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
		if (isScenarioPanelToolbarOpen(this._panel)) {
			void this._refresh({ refreshSupport: false });
		}
	}

	private _renderPendingPanel(): void {
		clearNode(this._panel);

		const header = $('.browser-scenario-panel-header');
		const titleRow = $('.browser-scenario-panel-title-row');
		titleRow.appendChild($('.browser-scenario-panel-summary', undefined, localize('scenario.loading', "Loading variants...")));
		header.appendChild(titleRow);
		this._panel.appendChild(header);

		const closeAction = $('.span.browser-scenario-panel-close');
		closeAction.appendChild(this._createCloseButton());
		this._panel.appendChild(closeAction);
	}

	private _renderPanel(tabId: string, configState: Awaited<ReturnType<IAppPreviewScenarioService['readScenarioConfig']>>, values: Record<string, AppPreviewScenarioControlValue>, support: Record<string, AppPreviewScenarioSupportStatus>, summary: string): void {
		clearNode(this._panel);
		const canEdit = configState.errors.length === 0;
		this._openGroupButton = undefined;
		this._openGroupMenu = undefined;

		if (this._addingGroup) {
			this._openGroupId = undefined;
		} else if (this._addingControlGroupId) {
			this._openGroupId = this._addingControlGroupId;
		} else if (this._addingChoiceKey) {
			this._openGroupId = configState.config.groups.find(group =>
				group.controls.some(control => getAppPreviewScenarioControlKey(group.id, control.id) === this._addingChoiceKey)
			)?.id;
		}

		if (this._openGroupId && !configState.config.groups.some(group => group.id === this._openGroupId)) {
			this._openGroupId = undefined;
		}

		const header = $('.browser-scenario-panel-header');
		const titleRow = $('.browser-scenario-panel-title-row');
		titleRow.appendChild($('.browser-scenario-panel-summary', undefined, summary));
		header.appendChild(titleRow);
		this._panel.appendChild(header);

		const groupsStrip = $('.browser-scenario-groups-strip');
		groupsStrip.addEventListener('scroll', () => this._positionOpenGroupMenu());
		this._panel.appendChild(groupsStrip);

		if (configState.config.groups.length === 0) {
			groupsStrip.appendChild($('.span.browser-scenario-empty-group', undefined, localize('scenario.emptyGroups', "No groups yet.")));
		}

		let openGroup: IAppPreviewScenarioGroup | undefined;
		let addGroupButton: HTMLButtonElement | undefined;

		for (const group of configState.config.groups) {
			const groupButton = $('button.browser-scenario-group-tab');
			groupButton.classList.add('browser-scenario-group-tab');
			groupButton.classList.toggle('open', this._openGroupId === group.id);
			groupButton.setAttribute('aria-expanded', String(this._openGroupId === group.id));
			groupButton.addEventListener('click', () => {
				const willOpen = this._openGroupId !== group.id;
				this._openGroupId = willOpen ? group.id : undefined;
				if (!willOpen) {
					this._addingControlGroupId = undefined;
					this._addingChoiceKey = undefined;
				}
				this._addingGroup = false;
				void this._refresh({ refreshSupport: false });
			});
			const groupLabel = $('span.browser-scenario-group-title-text', undefined, group.label);
			groupButton.appendChild(groupLabel);
			const stateBadges = this._createGroupStateBadges(tabId, configState.config, group, values);
			if (stateBadges) {
				groupButton.appendChild(stateBadges);
			}
			groupsStrip.appendChild(groupButton);

			if (this._openGroupId === group.id) {
				openGroup = group;
				this._openGroupButton = groupButton;
			}
		}

		if (canEdit) {
			addGroupButton = this._createIconButton(Codicon.add, localize('scenario.addGroup', "Add group"));
			addGroupButton.classList.add('browser-scenario-group-tab', 'browser-scenario-group-add');
			addGroupButton.addEventListener('click', () => {
				this._addingGroup = true;
				this._addingControlGroupId = undefined;
				this._addingChoiceKey = undefined;
				this._openGroupId = undefined;
				void this._refresh({ refreshSupport: false });
			});
			groupsStrip.appendChild(addGroupButton);
		}

		const footer = $('.browser-scenario-footer');
		const cleanupButton = this._createTextButton(localize('scenario.cleanup', "Cleanup artifacts"));
		cleanupButton.title = localize('scenario.cleanupTitle', "Cleanup generated variant artifacts generated by the current app preview helpers.");
		cleanupButton.addEventListener('click', () => {
			void this._runCleanup();
		});
		const resetButton = this._createTextButton(localize('scenario.reset', "Reset variants"));
		resetButton.title = localize('scenario.resetTitle', "Revert all variants to their default values.");
		resetButton.addEventListener('click', () => {
			void this._resetTabToDefaultAndRevealPreview(tabId);
		});
		footer.appendChild(cleanupButton);
		footer.appendChild(resetButton);
		this._panel.appendChild(footer);

		const closeAction = $('.span.browser-scenario-panel-close');
		closeAction.appendChild(this._createCloseButton());
		this._panel.appendChild(closeAction);

		if (configState.errors.length > 0) {
			const errorMenu = $('.browser-scenario-group-menu.browser-scenario-error-menu');
			errorMenu.appendChild($('.browser-scenario-error', undefined, configState.errors[0].message));
			this._panel.appendChild(errorMenu);
			this._openGroupMenu = errorMenu;
			this._openGroupButton = header;
			mainWindow.requestAnimationFrame(() => this._positionOpenGroupMenu());
			return;
		}

		if (this._addingGroup && canEdit && addGroupButton) {
			const addGroupMenu = $('.browser-scenario-group-menu.browser-scenario-add-group-menu');
			addGroupMenu.appendChild(this._createAddGroupForm(configState.config));
			this._panel.appendChild(addGroupMenu);
			this._openGroupMenu = addGroupMenu;
			this._openGroupButton = addGroupButton;
			mainWindow.requestAnimationFrame(() => this._positionOpenGroupMenu());
			return;
		}

		if (!openGroup) {
			return;
		}

		const validKeys = new Set<string>();
		for (const group of configState.config.groups) {
			for (const control of group.controls) {
				validKeys.add(getAppPreviewScenarioControlKey(group.id, control.id));
			}
		}
		for (const key of Array.from(this._pendingChoiceValues.keys())) {
			if (!validKeys.has(key)) {
				this._pendingChoiceValues.delete(key);
			}
		}

		const menu = $('.browser-scenario-group-menu');
		const section = $('.section.browser-scenario-group');
		section.dataset.scenarioGroupId = openGroup.id;
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
				void this._saveScenarioConfig(moveAppPreviewScenarioControl(configState.config, dragPayload.groupId, dragPayload.controlId, openGroup.id));
			});
		}

		const groupHeader = $('.browser-scenario-group-header');
		groupHeader.appendChild($('.h3.browser-scenario-group-title', undefined, openGroup.label));
		if (canEdit) {
			const groupActions = $('.span.browser-scenario-group-actions');
			const addControlButton = this._createIconButton(Codicon.add, localize('scenario.addProperty', "Add property"));
			addControlButton.addEventListener('click', () => {
				this._addingGroup = false;
				this._addingControlGroupId = openGroup.id;
				this._addingChoiceKey = undefined;
				this._openGroupId = openGroup.id;
				void this._refresh({ refreshSupport: false });
			});
			groupActions.appendChild(addControlButton);
			const removeGroupButton = this._createIconButton(Codicon.trash, localize('scenario.removeGroup', "Remove group"));
			removeGroupButton.addEventListener('click', () => {
				this._openGroupId = undefined;
				void this._saveScenarioConfig(removeAppPreviewScenarioGroup(configState.config, openGroup.id));
			});
			groupActions.appendChild(removeGroupButton);
			groupHeader.appendChild(groupActions);
		}
		section.appendChild(groupHeader);
		if (this._addingControlGroupId === openGroup.id && canEdit) {
			section.appendChild(this._createAddControlForm(configState.config, openGroup.id));
		}
		if (openGroup.controls.length === 0) {
			section.appendChild($('.browser-scenario-empty-group', undefined, localize('scenario.emptyGroup', "No properties yet.")));
		}

		for (const control of openGroup.controls) {
			const key = getAppPreviewScenarioControlKey(openGroup.id, control.id);
			const defaultValue = configState.config.defaultValues[key];
			const selectedValue = this._pendingChoiceValues.get(key) ?? values[key];
			const row = $('.browser-scenario-control');
			row.dataset.scenarioControlId = control.id;
			row.draggable = canEdit;
			if (canEdit) {
				row.addEventListener('dragstart', event => {
					row.classList.add('dragging');
					event.dataTransfer?.setData('application/vnd.code.appPreviewVariantControl', JSON.stringify({ groupId: openGroup.id, controlId: control.id }));
					event.dataTransfer?.setData('text/plain', key);
				});
				row.addEventListener('dragend', () => row.classList.remove('dragging'));
				row.addEventListener('dragover', event => {
					event.preventDefault();
					row.classList.add('drag-target');
				});
				row.addEventListener('dragleave', () => row.classList.remove('drag-target'));
				row.addEventListener('drop', event => {
					event.preventDefault();
					row.classList.remove('drag-target');
					const dragPayload = this._getDragPayload(event);
					if (!dragPayload) {
						return;
					}
					if (dragPayload.groupId !== openGroup.id || dragPayload.controlId === control.id) {
						return;
					}
					void this._saveScenarioConfig(moveAppPreviewScenarioControl(
						configState.config,
						dragPayload.groupId,
						dragPayload.controlId,
						openGroup.id,
						control.id
					));
				});
			}

			const label = $('.browser-scenario-control-label');
			const name = $('.span.browser-scenario-control-name');
			if (canEdit) {
				name.appendChild($('span', { class: `${ThemeIcon.asClassName(Codicon.arrowSwap)} browser-scenario-drag-handle` }));
			}
			name.appendChild($('span', undefined, control.label));
			if (canEdit) {
				const editControlNameButton = this._createIconButton(Codicon.edit, localize('scenario.renameProperty', "Rename variant"));
				editControlNameButton.addEventListener('click', () => {
					const nextName = this._promptText(localize('scenario.renamePropertyPrompt', "Rename variant"), control.label);
					if (!nextName) {
						return;
					}
					void this._saveScenarioConfig(updateAppPreviewScenarioControlLabel(configState.config, openGroup.id, control.id, nextName));
				});
				name.appendChild(editControlNameButton);
			}
			label.appendChild(name);

			const actions = $('.span.browser-scenario-control-actions');
			actions.appendChild(this._createSupportBadge(support[key]));
			actions.appendChild(this._createControlDefaultButton(tabId, key, areAppPreviewScenarioValuesEqual(values[key], defaultValue), defaultValue));
			if (canEdit) {
				const removeControlButton = this._createIconButton(Codicon.trash, localize('scenario.removeProperty', "Remove property"));
				removeControlButton.addEventListener('click', () => {
					void this._saveScenarioConfig(removeAppPreviewScenarioControl(configState.config, openGroup.id, control.id));
				});
				actions.appendChild(removeControlButton);
			}
			label.appendChild(actions);
			row.appendChild(label);

			if (control.type === 'choice' || control.type === 'multiChoice') {
				row.classList.add(control.type === 'choice' ? 'choice' : 'multi-choice');
				const dropdown = $('details.browser-scenario-value-dropdown') as HTMLDetailsElement;
				const valueSummary = $('summary.browser-scenario-value-summary');
				valueSummary.classList.toggle('custom', !areAppPreviewScenarioValuesEqual(selectedValue, defaultValue));
				const summaryText = $('span.browser-scenario-value-summary-text');
				summaryText.textContent = this._formatControlSelection(control.choices, selectedValue);
				valueSummary.appendChild(summaryText);
				dropdown.appendChild(valueSummary);
				dropdown.open = true;
				const valueMenu = $('.browser-scenario-value-menu');
				const getCurrentSelection = (): AppPreviewScenarioControlValue => this._pendingChoiceValues.get(key) ?? values[key];
				let applyButton: HTMLButtonElement | undefined;
				const setPending = (nextValue: AppPreviewScenarioControlValue): void => {
					this._pendingChoiceValues.set(key, nextValue);
					summaryText.textContent = this._formatControlSelection(control.choices, nextValue);
					if (applyButton) {
						applyButton.disabled = areAppPreviewScenarioValuesEqual(nextValue, values[key]);
					}
					const nextSelection = Array.isArray(nextValue) ? new Set(nextValue) : new Set([nextValue]);
					for (const item of Array.from(valueMenu.querySelectorAll('.browser-scenario-value-menu-item'))) {
						const itemChoiceId = item.getAttribute('data-choice-id');
						if (!itemChoiceId) {
							continue;
						}
						item.classList.toggle('checked', control.type === 'choice' ? itemChoiceId === nextValue : nextSelection.has(itemChoiceId));
					}
				};
				for (const choice of control.choices) {
					const checked = (() => {
						const currentSelection = getCurrentSelection();
						if (control.type === 'choice') {
							return currentSelection === choice.id;
						}
						return Array.isArray(currentSelection) && currentSelection.includes(choice.id);
					})();
					const valueRow = $('.browser-scenario-value-menu-row');
					const item = this._createTextButton(choice.label);
					item.classList.add('browser-scenario-value-menu-item');
					item.classList.toggle('checked', checked);
					item.setAttribute('data-choice-id', choice.id);
					item.addEventListener('click', () => {
						const nextValue = (() => {
							if (control.type === 'choice') {
								return choice.id;
							}

							const currentSelection = getCurrentSelection();
							const selectedValues = Array.isArray(currentSelection) ? currentSelection : [];
							return selectedValues.includes(choice.id)
								? selectedValues.filter(value => value !== choice.id)
								: [...selectedValues, choice.id];
						})();
						if (canEdit) {
							setPending(nextValue);
							return;
						}
						void this._setTabControlValueAndRevealPreview(tabId, key, nextValue);
					});
					valueRow.appendChild(item);
					if (canEdit) {
						const editChoiceButton = this._createIconButton(Codicon.edit, localize('scenario.editValue', "Rename value"));
						editChoiceButton.addEventListener('click', event => {
							event.preventDefault();
							event.stopPropagation();
							const nextLabel = this._promptText(localize('scenario.editValuePrompt', "Rename value"), choice.label);
							if (!nextLabel) {
								return;
							}
							void this._saveScenarioConfig(updateAppPreviewScenarioChoiceLabel(configState.config, openGroup.id, control.id, choice.id, nextLabel));
						});
						valueRow.appendChild(editChoiceButton);
					}
					if (canEdit) {
						const removeChoiceButton = this._createTextButton(localize('scenario.remove', "Remove"));
						removeChoiceButton.classList.add('browser-scenario-value-remove');
						removeChoiceButton.disabled = control.choices.length <= 1;
						removeChoiceButton.addEventListener('click', event => {
							event.preventDefault();
							event.stopPropagation();
							void this._saveScenarioConfig(removeAppPreviewScenarioChoice(configState.config, openGroup.id, control.id, choice.id));
						});
						valueRow.appendChild(removeChoiceButton);
					}
					valueMenu.appendChild(valueRow);
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
						this._openGroupId = openGroup.id;
						void this._refresh({ refreshSupport: false });
					});
					if (this._addingChoiceKey === key) {
						valueFooter.appendChild(this._createAddChoiceForm(configState.config, openGroup.id, control.id));
					} else {
						valueFooter.appendChild(addChoiceButton);
					}
					applyButton = this._createTextButton(localize('scenario.apply', "Apply"));
					applyButton.classList.add('browser-scenario-value-apply');
					applyButton.disabled = areAppPreviewScenarioValuesEqual(this._pendingChoiceValues.get(key) ?? selectedValue, values[key]);
					applyButton.addEventListener('click', () => {
						const nextValue = this._pendingChoiceValues.get(key);
						if (nextValue === undefined) {
							return;
						}
						void this._setTabControlValueAndRevealPreview(tabId, key, nextValue);
					});
					valueFooter.appendChild(applyButton);
					valueMenu.appendChild(valueFooter);
				}
				dropdown.appendChild(valueMenu);
				row.appendChild(dropdown);
			} else {
				row.classList.add('toggle');
				const switchLabel = $('label.browser-scenario-switch');
				const input = $('input') as HTMLInputElement;
				input.type = 'checkbox';
				input.checked = values[key] === true;
				input.addEventListener('change', () => {
					void this._setTabControlValueAndRevealPreview(tabId, key, input.checked);
				});
				switchLabel.appendChild(input);
				switchLabel.appendChild($('.span.browser-scenario-switch-track'));
				row.appendChild(switchLabel);
			}

			section.appendChild(row);
		}

		menu.appendChild(section);
		this._panel.appendChild(menu);
		this._openGroupMenu = menu;
		mainWindow.requestAnimationFrame(() => this._positionOpenGroupMenu());
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

	private _createGroupStateBadges(tabId: string, config: IAppPreviewScenarioConfig, group: IAppPreviewScenarioGroup, values: Record<string, AppPreviewScenarioControlValue>): HTMLElement | undefined {
		const badges = $('.span.browser-scenario-group-state-badges');
		for (const control of group.controls) {
			const key = getAppPreviewScenarioControlKey(group.id, control.id);
			const defaultValue = config.defaultValues[key];
			const currentValue = values[key];
			if (defaultValue !== undefined && areAppPreviewScenarioValuesEqual(currentValue, defaultValue)) {
				continue;
			}

			const badge = $('.span.browser-scenario-group-state-badge');
			badge.appendChild($('span.browser-scenario-group-state-badge-text', undefined, this._formatControlValue(control, currentValue)));
			const clearButton = this._createIconButton(Codicon.close, localize('scenario.revertState', "Revert this state"));
			clearButton.addEventListener('click', event => {
				event.preventDefault();
				event.stopPropagation();
				if (defaultValue !== undefined) {
					void this._setTabControlValueAndRevealPreview(tabId, key, defaultValue);
				}
			});
			badge.appendChild(clearButton);
			badges.appendChild(badge);
		}

		return badges.children.length > 0 ? badges : undefined;
	}

	private _formatControlValue(control: { label: string; type: string; choices?: readonly { id: string; label: string }[] }, value: AppPreviewScenarioControlValue): string {
		if (control.type === 'toggle') {
			return `${control.label}: ${value ? localize('scenario.on', "on") : localize('scenario.off', "off")}`;
		}

		if (!Array.isArray(value)) {
			const choiceValue = value === undefined ? localize('scenario.noneSelected', "None") : value;
			if (control.type === 'choice' && control.choices) {
				return `${control.label}: ${control.choices.find(option => option.id === choiceValue)?.label ?? choiceValue}`;
			}
		}

		return `${control.label}: ${this._formatControlSelection(control.choices ?? [], value)}`;
	}

	private _promptText(title: string, initialValue: string): string | undefined {
		const nextValue = mainWindow.prompt(title, initialValue);
		if (!nextValue) {
			return undefined;
		}
		const trimmed = nextValue.trim();
		return trimmed.length > 0 ? trimmed : undefined;
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

	private async _setTabControlValueAndRevealPreview(tabId: string, key: string, value: AppPreviewScenarioControlValue): Promise<void> {
		this._closeOpenMenuSurface();
		await this.appPreviewScenarioService.setTabControlValue(tabId, key, value);
		await this._refresh();
	}

	private async _resetTabToDefaultAndRevealPreview(tabId: string): Promise<void> {
		this._closeOpenMenuSurface();
		await this.appPreviewScenarioService.resetTabToDefault(tabId);
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
		closeButton.addEventListener('click', () => {
			void this._closePanel();
		});
		return closeButton;
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
				void this._setTabControlValueAndRevealPreview(tabId, key, defaultValue);
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

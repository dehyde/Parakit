/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CodeWindow } from '../../../../../base/browser/window.js';
import { BrowserWidgetLocation, IBrowserEditorWidget } from '../browserEditor.js';

export const SCENARIO_PANEL_TOOLBAR_ORDER = 10;

export interface IScenarioGroupMenuLayoutOptions {
	readonly preferredWidth?: number;
	readonly viewportWidth?: number;
	readonly viewportHeight?: number;
}

export function createScenarioPanelToolbarWidget(panel: HTMLElement): IBrowserEditorWidget {
	return { location: BrowserWidgetLocation.Toolbar, element: panel, order: SCENARIO_PANEL_TOOLBAR_ORDER };
}

export function isScenarioPanelToolbarOpen(panel: HTMLElement): boolean {
	return panel.style.display !== 'none';
}

export function setScenarioPanelToolbarOpen(panel: HTMLElement, open: boolean): void {
	panel.style.display = open ? '' : 'none';
}

export function closeScenarioGroupMenuSurface(panel: HTMLElement): void {
	for (const menu of Array.from(panel.querySelectorAll('.browser-scenario-group-menu'))) {
		menu.remove();
	}
	for (const button of Array.from(panel.querySelectorAll('.browser-scenario-group-tab.open'))) {
		button.classList.remove('open');
		button.setAttribute('aria-expanded', 'false');
	}
}

export function positionScenarioGroupMenu(panel: HTMLElement, button: HTMLElement, menu: HTMLElement, targetWindow: CodeWindow, options: IScenarioGroupMenuLayoutOptions = {}): void {
	const viewportWidth = Math.max(options.viewportWidth ?? targetWindow.innerWidth, 0);
	const viewportHeight = Math.max(options.viewportHeight ?? targetWindow.innerHeight, 0);
	const viewportPadding = 8;
	const preferredWidth = options.preferredWidth ?? 340;
	const availableWidth = Math.max(0, viewportWidth - viewportPadding * 2);
	const width = Math.min(preferredWidth, availableWidth);
	const panelRect = panel.getBoundingClientRect();
	const buttonRect = button.getBoundingClientRect();
	const minLeft = viewportPadding - panelRect.left;
	const maxLeft = Math.max(minLeft, viewportWidth - panelRect.left - width - viewportPadding);
	const left = Math.min(Math.max(buttonRect.left - panelRect.left, minLeft), maxLeft);
	const top = buttonRect.bottom - panelRect.top + 4;
	const availableHeight = Math.max(160, viewportHeight - buttonRect.bottom - viewportPadding - 4);

	menu.style.position = 'absolute';
	menu.style.left = `${left}px`;
	menu.style.top = `${top}px`;
	menu.style.width = `${width}px`;
	menu.style.maxHeight = `${availableHeight}px`;
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CodeWindow } from '../../../../../base/browser/window.js';

export interface IScenarioPanelDropdownLayoutOptions {
	readonly preferredWidth?: number;
	readonly viewportWidth?: number;
	readonly viewportHeight?: number;
}

export interface IScenarioPanelPosition {
	readonly left: number;
	readonly top: number;
}

export function updateScenarioPanelDropdownHost(controller: HTMLElement, panel: HTMLElement, open: boolean): void {
	const targetParent = open ? controller.ownerDocument.body : controller;
	if (open) {
		applyScenarioPanelInheritedStyles(controller, panel);
	}
	if (panel.parentElement === targetParent) {
		return;
	}

	targetParent.appendChild(panel);
}

function applyScenarioPanelInheritedStyles(controller: HTMLElement, panel: HTMLElement): void {
	const view = controller.ownerDocument.defaultView;
	if (!view) {
		return;
	}

	const sourceStyle = view.getComputedStyle(controller);
	panel.style.fontFamily = sourceStyle.fontFamily;
	panel.style.fontSize = sourceStyle.fontSize;
	panel.style.fontWeight = sourceStyle.fontWeight;
	for (const property of [
		'--vscode-focusBorder',
		'--vscode-foreground',
		'--vscode-descriptionForeground',
		'--vscode-disabledForeground',
		'--vscode-icon-foreground',
		'--vscode-dropdown-foreground',
		'--vscode-dropdown-background',
		'--vscode-dropdown-border',
		'--vscode-widget-border',
		'--vscode-panel-border',
		'--vscode-toolbar-hoverBackground',
		'--vscode-input-foreground',
		'--vscode-input-background',
		'--vscode-input-placeholderForeground',
		'--vscode-inputValidation-warningBackground',
		'--vscode-inputValidation-warningBorder',
		'--vscode-button-foreground',
		'--vscode-button-background',
		'--vscode-button-secondaryForeground',
		'--vscode-button-secondaryBackground',
		'--vscode-button-secondaryHoverBackground',
		'--vscode-list-activeSelectionForeground',
		'--vscode-scrollbarSlider-background',
		'--vscode-testing-iconPassed',
		'--vscode-testing-iconFailed',
		'--vscode-macos-vibrant-surface-background',
	]) {
		const value = sourceStyle.getPropertyValue(property);
		if (value) {
			panel.style.setProperty(property, value);
		}
	}
}

export function positionScenarioPanelDropdown(button: HTMLElement, panel: HTMLElement, targetWindow: CodeWindow, options: IScenarioPanelDropdownLayoutOptions = {}): void {
	const viewportWidth = Math.max(options.viewportWidth ?? targetWindow.innerWidth, 0);
	const viewportHeight = Math.max(options.viewportHeight ?? targetWindow.innerHeight, 0);
	const preferredWidth = options.preferredWidth ?? 420;
	const viewportPadding = 8;
	const availableWidth = Math.max(0, viewportWidth - viewportPadding * 2);
	const width = Math.min(preferredWidth, availableWidth);
	const rect = button.getBoundingClientRect();
	const top = rect.bottom + 6;
	const left = Math.min(
		Math.max(rect.left, viewportPadding),
		Math.max(viewportPadding, viewportWidth - width - viewportPadding)
	);
	const availableHeight = Math.max(160, viewportHeight - top - viewportPadding);

	panel.style.position = 'fixed';
	panel.style.left = `${left}px`;
	panel.style.right = 'auto';
	panel.style.top = `${top}px`;
	panel.style.width = `${width}px`;
	panel.style.maxHeight = `${availableHeight}px`;
}

export function positionScenarioPanelAt(panel: HTMLElement, targetWindow: CodeWindow, position: IScenarioPanelPosition, options: IScenarioPanelDropdownLayoutOptions = {}): IScenarioPanelPosition {
	const viewportWidth = Math.max(options.viewportWidth ?? targetWindow.innerWidth, 0);
	const viewportHeight = Math.max(options.viewportHeight ?? targetWindow.innerHeight, 0);
	const viewportPadding = 8;
	const rect = panel.getBoundingClientRect();
	const width = rect.width || parseFloat(panel.style.width) || options.preferredWidth || 420;
	const height = rect.height || parseFloat(panel.style.height) || 260;
	const maxLeft = Math.max(viewportPadding, viewportWidth - width - viewportPadding);
	const maxTop = Math.max(viewportPadding, viewportHeight - height - viewportPadding);
	const left = Math.min(Math.max(position.left, viewportPadding), maxLeft);
	const top = Math.min(Math.max(position.top, viewportPadding), maxTop);

	panel.style.position = 'fixed';
	panel.style.left = `${left}px`;
	panel.style.right = 'auto';
	panel.style.top = `${top}px`;

	return { left, top };
}

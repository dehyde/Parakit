/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { BrowserOverlayManager, BrowserOverlayType } from '../../electron-browser/overlayManager.js';
import { BrowserWidgetLocation } from '../../electron-browser/browserEditor.js';
import { closeScenarioGroupMenuSurface, createScenarioPanelToolbarWidget, isScenarioPanelToolbarOpen, positionScenarioGroupMenu, SCENARIO_PANEL_TOOLBAR_ORDER, setScenarioPanelToolbarOpen } from '../../electron-browser/features/browserEditorScenarioPanel.js';

suite('BrowserEditorScenarioFeatures', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let elements: HTMLElement[] = [];

	teardown(() => {
		for (const element of elements) {
			element.remove();
		}
		elements = [];
	});

	test('contributes the variants panel as a toolbar widget below the URL bar', () => {
		const panel = $('.browser-scenario-panel');
		const widget = createScenarioPanelToolbarWidget(panel);

		assert.strictEqual(widget.location, BrowserWidgetLocation.Toolbar);
		assert.strictEqual(widget.order, SCENARIO_PANEL_TOOLBAR_ORDER);
		assert.strictEqual(widget.element, panel);
	});

	test('toggles the toolbar variants strip without reparenting it', () => {
		const root = $('.browser-root');
		const panel = $('.browser-scenario-panel');

		root.appendChild(panel);
		mainWindow.document.body.appendChild(root);
		elements.push(root);

		setScenarioPanelToolbarOpen(panel, false);

		assert.strictEqual(isScenarioPanelToolbarOpen(panel), false);
		assert.strictEqual(panel.parentElement, root);
		assert.strictEqual(panel.style.display, 'none');

		setScenarioPanelToolbarOpen(panel, true);

		assert.strictEqual(isScenarioPanelToolbarOpen(panel), true);
		assert.strictEqual(panel.parentElement, root);
		assert.strictEqual(panel.style.display, '');
	});

	test('positions a group menu below the one-line variants bar', () => {
		const panel = $('.browser-scenario-panel');
		const button = $('button.browser-scenario-group-tab') as HTMLButtonElement;
		const menu = $('.browser-scenario-group-menu');

		mainWindow.document.body.append(panel, button, menu);
		elements.push(panel, button, menu);

		panel.getBoundingClientRect = () => ({
			x: 100,
			y: 50,
			width: 600,
			height: 34,
			top: 50,
			right: 700,
			bottom: 84,
			left: 100,
			toJSON: () => undefined
		});
		button.getBoundingClientRect = () => ({
			x: 620,
			y: 55,
			width: 90,
			height: 24,
			top: 55,
			right: 710,
			bottom: 79,
			left: 620,
			toJSON: () => undefined
		});

		positionScenarioGroupMenu(panel, button, menu, mainWindow, { viewportWidth: 700, viewportHeight: 500 });

		assert.deepStrictEqual({
			position: menu.style.position,
			left: menu.style.left,
			top: menu.style.top,
			width: menu.style.width,
			maxHeight: menu.style.maxHeight,
		}, {
			position: 'absolute',
			left: '252px',
			top: '33px',
			width: '340px',
			maxHeight: '409px',
		});
	});

	test('does not report the toolbar variants strip as an overlay over the browser container', () => {
		const root = $('.browser-root');
		Object.assign(root.style, {
			position: 'relative',
			width: '640px',
			height: '420px',
		});

		const panel = $('.browser-scenario-panel');
		Object.assign(panel.style, {
			position: 'relative',
			width: '640px',
			height: '34px',
		});

		const browserContainer = $('.browser-container');
		Object.assign(browserContainer.style, {
			position: 'absolute',
			left: '0px',
			top: '34px',
			width: '640px',
			height: '386px',
		});

		root.append(panel, browserContainer);
		mainWindow.document.body.appendChild(root);
		elements.push(root);

		const manager = store.add(new BrowserOverlayManager(mainWindow));
		const overlays = manager.getOverlappingOverlays(browserContainer);

		assert.deepStrictEqual(overlays, []);
	});

	test('reports the open variants group menu as a pausing overlay over the browser container', () => {
		const browserContainer = $('.browser-container');
		Object.assign(browserContainer.style, {
			position: 'absolute',
			left: '0px',
			top: '40px',
			width: '640px',
			height: '386px',
		});

		const groupMenu = $('.browser-scenario-group-menu');
		Object.assign(groupMenu.style, {
			position: 'absolute',
			left: '260px',
			top: '34px',
			width: '340px',
			height: '260px',
		});

		mainWindow.document.body.append(browserContainer, groupMenu);
		elements.push(browserContainer, groupMenu);

		const manager = store.add(new BrowserOverlayManager(mainWindow));
		const overlays = manager.getOverlappingOverlays(browserContainer);

		assert.deepStrictEqual(overlays.map(overlay => ({
			type: overlay.type,
			pausesBrowser: overlay.pausesBrowser
		})), [{ type: BrowserOverlayType.Menu, pausesBrowser: true }]);
	});

	test('closes only the variants group menu surface when revealing the preview', () => {
		const panel = $('.browser-scenario-panel');
		const groupButton = $('button.browser-scenario-group-tab.open') as HTMLButtonElement;
		groupButton.setAttribute('aria-expanded', 'true');
		const groupMenu = $('.browser-scenario-group-menu');

		panel.append(groupButton, groupMenu);
		mainWindow.document.body.append(panel);
		elements.push(panel);

		setScenarioPanelToolbarOpen(panel, true);
		closeScenarioGroupMenuSurface(panel);

		assert.strictEqual(isScenarioPanelToolbarOpen(panel), true);
		assert.strictEqual(panel.querySelector('.browser-scenario-group-menu'), null);
		assert.strictEqual(groupButton.classList.contains('open'), false);
		assert.strictEqual(groupButton.getAttribute('aria-expanded'), 'false');
	});

});

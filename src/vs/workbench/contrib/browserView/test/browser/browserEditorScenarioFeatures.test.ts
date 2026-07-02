/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { BrowserOverlayManager, BrowserOverlayType } from '../../electron-browser/overlayManager.js';
import { updateScenarioPanelDropdownHost, positionScenarioPanelDropdown, positionScenarioPanelAt } from '../../electron-browser/features/browserEditorScenarioPanel.js';

suite('BrowserEditorScenarioFeatures', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let elements: HTMLElement[] = [];

	teardown(() => {
		for (const element of elements) {
			element.remove();
		}
		elements = [];
	});

	test('mounts the variants panel in the workbench dropdown host while open', () => {
		const themedRoot = $('.scenario-test-themed-root');
		const controller = $('.browser-scenario-controller');
		const panel = $('.browser-scenario-panel');

		themedRoot.appendChild(controller);
		mainWindow.document.body.appendChild(themedRoot);
		elements.push(themedRoot);

		updateScenarioPanelDropdownHost(controller, panel, true);

		assert.strictEqual(panel.parentElement, mainWindow.document.body);
		assert.strictEqual(controller.contains(panel), false);

		updateScenarioPanelDropdownHost(controller, panel, false);

		assert.strictEqual(panel.parentElement, controller);
	});

	test('positions the variants panel like a viewport dropdown', () => {
		const button = $('button.browser-scenario-button') as HTMLButtonElement;
		const panel = $('.browser-scenario-panel');

		mainWindow.document.body.appendChild(button);
		mainWindow.document.body.appendChild(panel);
		elements.push(button, panel);

		button.getBoundingClientRect = () => ({
			x: 1420,
			y: 40,
			width: 104,
			height: 24,
			top: 40,
			right: 1524,
			bottom: 64,
			left: 1420,
			toJSON: () => undefined
		});

		positionScenarioPanelDropdown(button, panel, mainWindow, { viewportWidth: 1600, viewportHeight: 900 });

		assert.deepStrictEqual({
			position: panel.style.position,
			left: panel.style.left,
			top: panel.style.top,
			right: panel.style.right,
			width: panel.style.width,
			maxHeight: panel.style.maxHeight,
		}, {
			position: 'fixed',
			left: '1172px',
			top: '70px',
			right: 'auto',
			width: '420px',
			maxHeight: '822px',
		});
	});

	test('reports the variants panel as a non-pausing menu overlay over the browser container', () => {
		const browserContainer = $('.browser-container');
		Object.assign(browserContainer.style, {
			position: 'absolute',
			left: '250px',
			top: '40px',
			width: '300px',
			height: '300px',
		});

		const panel = $('.browser-scenario-panel');
		Object.assign(panel.style, {
			position: 'fixed',
			left: '12px',
			top: '38px',
			width: '380px',
			height: '520px',
			zIndex: '100000',
		});

		mainWindow.document.body.append(browserContainer, panel);
		elements.push(browserContainer, panel);

		const manager = store.add(new BrowserOverlayManager(mainWindow));
		const overlays = manager.getOverlappingOverlays(browserContainer);

		assert.deepStrictEqual(overlays.map(overlay => ({
			type: overlay.type,
			pausesBrowser: overlay.pausesBrowser
		})), [{ type: BrowserOverlayType.Menu, pausesBrowser: false }]);
	});

	test('constrains a dragged variants panel inside the viewport', () => {
		const panel = $('.browser-scenario-panel');
		Object.assign(panel.style, {
			width: '420px',
			height: '260px',
		});

		mainWindow.document.body.appendChild(panel);
		elements.push(panel);

		const position = positionScenarioPanelAt(panel, mainWindow, { left: 500, top: 500 }, { viewportWidth: 600, viewportHeight: 400 });

		assert.deepStrictEqual(position, { left: 172, top: 132 });
		assert.deepStrictEqual({
			position: panel.style.position,
			left: panel.style.left,
			top: panel.style.top,
			right: panel.style.right,
		}, {
			position: 'fixed',
			left: '172px',
			top: '132px',
			right: 'auto',
		});
	});

});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IElementData } from '../../../../../platform/browserView/common/browserView.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ISearchService } from '../../../../services/search/common/search.js';
import { Extensions as ViewExtensions, IViewContainersRegistry, IViewsRegistry } from '../../../../common/views.js';
import { TestViewsService } from '../../../../test/browser/workbenchTestServices.js';
import '../../electron-browser/browserDesignElement.contribution.js';
import { BROWSER_DESIGN_ELEMENT_CONTAINER_ID, BROWSER_DESIGN_ELEMENT_VIEW_ID, BrowserDesignElementService, compactDesignElementDomPath, createDesignElementSelection, createClaudeDesignElementPrompt, extractDesignElementTokenDefinitions, getDesignElementAttributeRows, normalizeDesignElementTokenValue, parseStructuredTokenFile, resolveDesignElementProperties } from '../../common/browserDesignElementService.js';

suite('BrowserDesignElementService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const elementData: IElementData = {
		url: 'http://localhost:3000/settings',
		outerHTML: '<button class="primary px-4" data-testid="save">Save</button>',
		computedStyle: [
			'.primary { color: var(--button-fg); padding-inline: var(--space-4); }',
			'',
			'/* Resolved values */',
			'color: rgb(255, 255, 255);',
			'padding-inline: 16px;',
			'font-size: 14px;',
			'line-height: 20px;',
			'',
			'/* CSS variables */',
			'--button-fg: #ffffff;',
			'--space-4: 16px;'
		].join('\n'),
		bounds: { x: 20, y: 30, width: 120, height: 32 },
		dimensions: { top: 30, left: 20, width: 120, height: 32 },
		attributes: { class: 'primary px-4', 'data-testid': 'save' },
		computedStyles: {
			'font-size': '14px',
			'line-height': '20px',
			'padding-inline-start': '16px',
			'padding-inline-end': '16px',
			'color': 'rgb(255, 255, 255)',
			'--space-4': '16px',
			'--button-fg': '#ffffff'
		},
		ancestors: [
			{ tagName: 'body' },
			{ tagName: 'button', classNames: ['primary', 'px-4'] }
		],
		components: [{
			name: 'ItemActions',
			framework: 'react',
			props: [
				{ name: 'itemId', value: 'item-1' }
			]
		}, {
			name: 'PrimaryButton',
			framework: 'react',
			source: '@example/ui',
			props: [
				{ name: 'intent', value: 'primary' }
			]
		}],
		matchedStyleRules: [{
			selector: '.primary',
			origin: 'regular',
			cssText: 'color: var(--button-fg); padding-inline: var(--space-4);',
			properties: [
				{ name: 'color', value: 'var(--button-fg)' },
				{ name: 'padding-inline', value: 'var(--space-4)' }
			]
		}]
	};

	test('createDesignElementSelection summarizes the selected element', () => {
		const selection = createDesignElementSelection(elementData);

		assert.strictEqual(selection.displayName, 'button.primary.px-4');
		assert.strictEqual(selection.url, 'http://localhost:3000/settings');
		assert.deepStrictEqual(selection.classes, ['primary', 'px-4']);
		assert.strictEqual(selection.bounds.width, 120);
		assert.ok(selection.domPath.includes('button.primary.px-4'));
	});

	test('registers the Design element view only when a preview element is selected', () => {
		const container = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).get(BROWSER_DESIGN_ELEMENT_CONTAINER_ID);
		const view = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).getView(BROWSER_DESIGN_ELEMENT_VIEW_ID);

		assert.ok(container);
		assert.strictEqual(container.hideIfEmpty, true);
		assert.ok(view);
		assert.strictEqual(view.when?.serialize(), 'browserDesignElementSelected');
	});

	test('inspectElement marks the Design element view as selected until inspection closes', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const contextKeyService = store.add(new MockContextKeyService());
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IViewsService, new TestViewsService());
		instantiationService.stub(ICommandService, {} as unknown as ICommandService);
		instantiationService.stub(IClipboardService, {} as unknown as IClipboardService);
		instantiationService.stub(INotificationService, {} as unknown as INotificationService);
		instantiationService.stub(IWorkspaceContextService, { getWorkspace: () => ({ id: 'test', folders: [] }) } as unknown as IWorkspaceContextService);
		instantiationService.stub(IFileService, {} as unknown as IFileService);
		instantiationService.stub(ISearchService, { textSearch: async () => ({ results: [], limitHit: false, messages: [] }) } as unknown as ISearchService);

		const service = store.add(instantiationService.createInstance(BrowserDesignElementService));

		const result = await service.inspectElement(elementData);

		assert.strictEqual(contextKeyService.getContextKeyValue('browserDesignElementSelected'), true);
		assert.ok(result.propertyGroups.length > 0);
		assert.strictEqual(result.selection.displayName, service.selection?.displayName);

		service.closeInspection();

		assert.strictEqual(contextKeyService.getContextKeyValue('browserDesignElementSelected'), false);
	});

	test('createDesignElementSelection normalizes svg path selections to a meaningful ancestor', () => {
		const selection = createDesignElementSelection({
			url: 'http://localhost:3000/settings',
			outerHTML: '<path d="M12 0C18.6274 0 24 5.37258 24 12Z"></path>',
			computedStyle: 'display: inline;',
			bounds: { x: 4, y: 4, width: 24, height: 24 },
			attributes: { d: 'M12 0C18.6274 0 24 5.37258 24 12Z' },
			computedStyles: {},
			ancestors: [
				{ tagName: 'body' },
				{ tagName: 'button', classNames: ['ComponentRoot__Control-sc-abc123-0'] },
				{ tagName: 'svg' },
				{ tagName: 'path' }
			]
		});

		assert.strictEqual(selection.selectedNodeDisplayName, 'path');
		assert.strictEqual(selection.displayName, 'button.ComponentRoot__Control-sc-abc123-0');
		assert.strictEqual(selection.wasNormalized, true);
	});

	test('getDesignElementAttributeRows collapses long attributes', () => {
		const selection = createDesignElementSelection({
			...elementData,
			attributes: {
				class: 'primary px-4',
				'aria-label': 'Save',
				d: 'M12 0C18.6274 0 24 5.37258 24 12C24 18.6274 18.6274 24 12 24C5.37258 24 0 18.6274 0 12'
			}
		});
		const rows = getDesignElementAttributeRows(selection);

		assert.deepStrictEqual(rows.inline.map(row => row.name), ['aria-label']);
		assert.deepStrictEqual(rows.collapsed.map(row => row.name), ['d']);
	});

	test('compactDesignElementDomPath keeps full path available with compact display', () => {
		const compact = compactDesignElementDomPath('body > div#root > div.Layout > div.Surface__Root-sc-abc123-0 > button.ComponentRoot__Control-sc-abc123-0 > svg > path');

		assert.strictEqual(compact.full, 'body > div#root > div.Layout > div.Surface__Root-sc-abc123-0 > button.ComponentRoot__Control-sc-abc123-0 > svg > path');
		assert.strictEqual(compact.parts.join(' > '), 'body > ... > button.ComponentRoot__Control-sc-abc123-0 > svg > path');
	});

	test('resolveDesignElementProperties prefers css variables and token matches before raw values', () => {
		const selection = createDesignElementSelection({
			...elementData,
			attributes: { class: 'ComponentRoot__Control-sc-abc123-0 primary px-4', 'data-testid': 'save' },
			ancestors: [
				{ tagName: 'body' },
				{ tagName: 'button', classNames: ['ComponentRoot__Control-sc-abc123-0', 'primary', 'px-4'] }
			]
		});
		const groups = resolveDesignElementProperties(selection, new Map([['16px', ['spacing.4']]]), [{
			name: 'source',
			value: 'src/components/PrimaryButton.tsx:12 (component)',
			source: 'source',
			token: 'theme.space.4'
		}]);

		const source = groups.find(group => group.id === 'source');
		assert.ok(source);
		assert.deepStrictEqual(source.properties[0], {
			name: 'component',
			value: 'ItemActions',
			source: 'source',
			token: 'itemId=item-1'
		});
		assert.deepStrictEqual(source.properties[1], {
			name: 'package component',
			value: 'PrimaryButton from @example/ui',
			source: 'source',
			token: 'intent=primary'
		});
		assert.deepStrictEqual(source.properties[2], {
			name: 'selector',
			value: '.primary',
			source: 'source',
			token: '--button-fg, --space-4'
		});
		assert.deepStrictEqual(source.properties[3], {
			name: 'source',
			value: 'src/components/PrimaryButton.tsx:12 (component)',
			source: 'source',
			token: 'theme.space.4'
		});

		const code = groups.find(group => group.id === 'code');
		assert.ok(code);
		assert.deepStrictEqual(code.properties[0], {
			name: 'class',
			value: 'ComponentRoot__Control-sc-abc123-0',
			source: 'class',
			token: 'ComponentRoot.Control'
		});

		const spacing = groups.find(group => group.id === 'spacing');
		assert.ok(spacing);
		assert.deepStrictEqual(spacing.properties.find(property => property.name === 'padding-inline-start'), {
			name: 'padding-inline-start',
			value: '16px',
			source: 'token',
			token: 'spacing.4'
		});

		const color = groups.find(group => group.id === 'color');
		assert.ok(color);
		assert.deepStrictEqual(color.properties.find(property => property.name === 'color'), {
			name: 'color',
			value: 'rgb(255, 255, 255)',
			source: 'raw'
		});

		const variables = groups.find(group => group.id === 'tokens');
		assert.ok(variables);
		assert.deepStrictEqual(variables.properties.find(property => property.name === '--space-4'), {
			name: '--space-4',
			value: '16px',
			source: 'css-variable',
			token: '--space-4'
		});
	});

	test('resolveDesignElementProperties promotes matched style tokens before rendered fallback values', () => {
		const selection = createDesignElementSelection(elementData);
		const groups = resolveDesignElementProperties(selection, new Map());

		assert.deepStrictEqual(groups.slice(0, 2).map(group => group.id), ['source', 'tokens']);
		const matchedRules = groups.find(group => group.id === 'source');
		assert.ok(matchedRules);
		assert.deepStrictEqual(matchedRules.properties[0], {
			name: 'component',
			value: 'ItemActions',
			source: 'source',
			token: 'itemId=item-1'
		});
		assert.deepStrictEqual(matchedRules.properties[1], {
			name: 'package component',
			value: 'PrimaryButton from @example/ui',
			source: 'source',
			token: 'intent=primary'
		});
		assert.deepStrictEqual(matchedRules.properties[2], {
			name: 'selector',
			value: '.primary',
			source: 'source',
			token: '--button-fg, --space-4'
		});

		const tokens = groups.find(group => group.id === 'tokens');
		assert.ok(tokens);
		assert.ok(tokens.properties.some(property => property.token === '--space-4'));

		const spacing = groups.find(group => group.id === 'spacing');
		assert.ok(spacing);
		assert.strictEqual(spacing.properties.find(property => property.name === 'padding-inline-start')?.source, 'raw');
	});

	test('resolveDesignElementProperties maps normalized computed values to token names', () => {
		const selection = createDesignElementSelection(elementData);
		const groups = resolveDesignElementProperties(selection, new Map([
			['#ffffff', ['colors.foreground', 'colors.text.inverse']],
			['16px', ['spacing.4']]
		]));

		const color = groups.find(group => group.id === 'color');
		assert.ok(color);
		assert.deepStrictEqual(color.properties.find(property => property.name === 'color'), {
			name: 'color',
			value: 'rgb(255, 255, 255)',
			source: 'token',
			token: 'colors.foreground, colors.text.inverse'
		});

		const spacing = groups.find(group => group.id === 'spacing');
		assert.ok(spacing);
		assert.strictEqual(spacing.properties.find(property => property.name === 'padding-inline-start')?.token, 'spacing.4');
	});

	test('extractDesignElementTokenDefinitions reads nested token objects and css variables', () => {
		const definitions = extractDesignElementTokenDefinitions([
			'export const theme = {',
			'  colors: {',
			'    foreground: "#fff",',
			'  },',
			'  spacing: {',
			'    medium: "16px",',
			'  },',
			'};',
			':root {',
			'  --button-fg: rgb(255, 255, 255);',
			'}'
		].join('\n'));

		assert.ok(definitions.some(definition => definition.name === 'theme.colors.foreground' && definition.value === '#fff'));
		assert.ok(definitions.some(definition => definition.name === 'theme.spacing.medium' && definition.value === '16px'));
		assert.ok(definitions.some(definition => definition.name === '--button-fg' && definition.value === 'rgb(255, 255, 255)'));
		assert.strictEqual(normalizeDesignElementTokenValue('rgb(255, 255, 255)'), '#ffffff');
		assert.strictEqual(normalizeDesignElementTokenValue('#fff'), '#ffffff');
	});

	test('parseStructuredTokenFile reads W3C Design Tokens format', () => {
		const definitions = parseStructuredTokenFile(JSON.stringify({
			color: {
				brand: { $value: '#0057ff', $type: 'color' },
			},
			spacing: {
				medium: { $value: '16px', $type: 'dimension' },
			},
		}), 'tokens.json');

		assert.ok(definitions.some(definition => definition.name === 'color.brand' && definition.value === '#0057ff'));
		assert.ok(definitions.some(definition => definition.name === 'spacing.medium' && definition.value === '16px'));
	});

	test('parseStructuredTokenFile reads generic nested JSON theme objects', () => {
		const definitions = parseStructuredTokenFile(JSON.stringify({
			colors: { brand: '#0057ff' },
			spacing: { medium: '16px' },
		}), 'theme.json');

		assert.ok(definitions.some(definition => definition.name === 'colors.brand' && definition.value === '#0057ff'));
		assert.ok(definitions.some(definition => definition.name === 'spacing.medium' && definition.value === '16px'));
	});

	test('parseStructuredTokenFile returns empty array for non-JSON or non-object content', () => {
		assert.deepStrictEqual(parseStructuredTokenFile('not json', 'notes.json'), []);
		assert.deepStrictEqual(parseStructuredTokenFile('[]', 'array.json'), []);
		assert.deepStrictEqual(parseStructuredTokenFile('{}', 'not-a-token-file.ts'), []);
	});

	test('createClaudeDesignElementPrompt summarizes source-backed context before raw css details', () => {
		const selection = createDesignElementSelection(elementData);
		const prompt = createClaudeDesignElementPrompt(selection, resolveDesignElementProperties(selection, new Map()));

		assert.ok(prompt.includes('Source-backed design context:'));
		assert.ok(prompt.indexOf('Source-backed design context:') < prompt.indexOf('Rendered fallback details:'));
		assert.ok(prompt.includes('Raw CSS is fallback evidence only.'));
	});

	test('createClaudeDesignElementPrompt includes structured context for Claude Code', () => {
		const selection = createDesignElementSelection(elementData);
		const prompt = createClaudeDesignElementPrompt(selection, resolveDesignElementProperties(selection, new Map()));

		assert.ok(prompt.includes('Review this selected browser design element.'));
		assert.ok(prompt.includes('Element: button.primary.px-4'));
		assert.ok(prompt.includes('URL: http://localhost:3000/settings'));
		assert.ok(prompt.includes('Classes: primary px-4'));
		assert.ok(prompt.includes('```html\n<button class="primary px-4" data-testid="save">Save</button>\n```'));
	});
});

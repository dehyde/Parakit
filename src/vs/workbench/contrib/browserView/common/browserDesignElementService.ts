/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { localize } from '../../../../nls.js';
import { IElementData, IElementAncestor } from '../../../../platform/browserView/common/browserView.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ISearchService, ITextSearchMatch, isFileMatch, QueryType } from '../../../services/search/common/search.js';

export const BROWSER_DESIGN_ELEMENT_VIEW_ID = 'browser.designElement';
export const BROWSER_DESIGN_ELEMENT_CONTAINER_ID = 'browser-design-element-sidebar';
export const BROWSER_DESIGN_ELEMENT_SELECTED_CONTEXT = new RawContextKey<boolean>('browserDesignElementSelected', false, localize('browserDesignElementSelected', "Whether a browser design element is selected for inspection"));
export const DESIGN_ELEMENT_NOTIFICATION_SOURCE = { id: 'browser.designElement', label: localize('designElementSource', "Design element") };

export const IBrowserDesignElementService = createDecorator<IBrowserDesignElementService>('browserDesignElementService');

export interface IBrowserDesignElementService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeSelection: Event<IDesignElementSelection | undefined>;
	readonly onDidChangeInspectionActive: Event<boolean>;
	readonly selection: IDesignElementSelection | undefined;
	readonly propertyGroups: readonly IDesignElementPropertyGroup[];
	readonly inspectionActive: boolean;
	inspectElement(elementData: IElementData): Promise<void>;
	closeInspection(): void;
	sendToClaudeCode(sessionResource?: URI): Promise<void>;
}

export interface IDesignElementSelection {
	readonly displayName: string;
	readonly selectedNodeDisplayName: string;
	readonly wasNormalized: boolean;
	readonly url?: string;
	readonly domPath: string;
	readonly classes: readonly string[];
	readonly attributes: Readonly<Record<string, string>>;
	readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
	readonly outerHTML: string;
	readonly computedStyle: string;
	readonly computedStyles: Readonly<Record<string, string>>;
	readonly elementData: IElementData;
}

export interface IDesignElementProperty {
	readonly name: string;
	readonly value: string;
	readonly source: 'class' | 'css-variable' | 'source' | 'token' | 'raw';
	readonly token?: string;
}

export interface IDesignElementPropertyGroup {
	readonly id: 'source' | 'code' | 'tokens' | 'typography' | 'spacing' | 'layout' | 'color' | 'border' | 'other';
	readonly label: string;
	readonly properties: readonly IDesignElementProperty[];
}

export interface IDesignElementAttributeRow {
	readonly name: string;
	readonly value: string;
}

export interface ICompactDesignElementDomPath {
	readonly full: string;
	readonly parts: readonly string[];
}

const typographyProperties = [
	'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing',
	'text-align', 'text-transform', 'text-decoration', 'white-space'
];

const spacingProperties = [
	'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
	'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
	'padding-inline-start', 'padding-inline-end', 'padding-block-start', 'padding-block-end',
	'gap', 'row-gap', 'column-gap'
];

const layoutProperties = [
	'display', 'position', 'top', 'right', 'bottom', 'left', 'width', 'height', 'min-width',
	'min-height', 'max-width', 'max-height', 'box-sizing', 'align-items', 'justify-content',
	'flex-direction', 'flex-wrap', 'grid-template-columns', 'grid-template-rows', 'overflow'
];

const colorProperties = [
	'color', 'background', 'background-color', 'opacity', 'fill', 'stroke'
];

const borderProperties = [
	'border', 'border-color', 'border-width', 'border-style', 'border-radius',
	'border-top', 'border-right', 'border-bottom', 'border-left', 'box-shadow', 'outline'
];

const groupDefinitions: Array<{ id: IDesignElementPropertyGroup['id']; label: string; names: readonly string[] }> = [
	{ id: 'typography', label: localize('designElementTypography', "Typography"), names: typographyProperties },
	{ id: 'spacing', label: localize('designElementSpacing', "Spacing"), names: spacingProperties },
	{ id: 'layout', label: localize('designElementLayout', "Layout"), names: layoutProperties },
	{ id: 'color', label: localize('designElementColor', "Color"), names: colorProperties },
	{ id: 'border', label: localize('designElementBorder', "Border"), names: borderProperties }
];

export function createDesignElementSelection(elementData: IElementData): IDesignElementSelection {
	const attributes = elementData.attributes ?? {};
	const selectedAncestor = elementData.ancestors?.at(-1);
	const inspectedAncestor = getInspectedAncestor(elementData.ancestors);
	const wasNormalized = !!selectedAncestor && !!inspectedAncestor && selectedAncestor !== inspectedAncestor;
	const classes = getElementClasses(elementData, attributes, inspectedAncestor, wasNormalized);
	const displayName = getElementDisplayName(inspectedAncestor, classes);
	const selectedNodeDisplayName = getElementDisplayName(selectedAncestor, getElementClasses(elementData, attributes, selectedAncestor, false));
	const domPath = formatElementPath(elementData.ancestors);
	const computedStyles = elementData.computedStyles ?? {};

	return {
		displayName,
		selectedNodeDisplayName,
		wasNormalized,
		url: elementData.url,
		domPath,
		classes,
		attributes,
		bounds: elementData.bounds,
		outerHTML: elementData.outerHTML,
		computedStyle: elementData.computedStyle,
		computedStyles,
		elementData
	};
}

export function getDesignElementAttributeRows(selection: IDesignElementSelection): { readonly inline: readonly IDesignElementAttributeRow[]; readonly collapsed: readonly IDesignElementAttributeRow[] } {
	const inline: IDesignElementAttributeRow[] = [];
	const collapsed: IDesignElementAttributeRow[] = [];

	for (const [name, value] of Object.entries(selection.attributes)) {
		if (name === 'class') {
			continue;
		}
		const row = { name, value };
		if (isLongAttribute(name, value)) {
			collapsed.push(row);
		} else {
			inline.push(row);
		}
	}

	return { inline, collapsed };
}

export function compactDesignElementDomPath(domPath: string): ICompactDesignElementDomPath {
	const parts = domPath.split(' > ').filter(Boolean);
	if (parts.length <= 5) {
		return { full: domPath, parts };
	}

	return {
		full: domPath,
		parts: [parts[0], '...', ...parts.slice(-3)]
	};
}

export function resolveDesignElementProperties(selection: IDesignElementSelection, workspaceTokens: ReadonlyMap<string, readonly string[]>, sourceProperties: readonly IDesignElementProperty[] = []): readonly IDesignElementPropertyGroup[] {
	const groups: IDesignElementPropertyGroup[] = [];
	const computedStyles = selection.computedStyles;

	const reactComponentProperties = getReactComponentProperties(selection);
	const matchedStyleProperties = getMatchedStyleProperties(selection);
	const sourceBackedProperties = [...reactComponentProperties, ...matchedStyleProperties, ...sourceProperties];
	if (sourceBackedProperties.length) {
		groups.push({ id: 'source', label: localize('designElementSourceMatches', "Source matches"), properties: sourceBackedProperties.slice(0, 12) });
	}

	const codeProperties = getCodeReferenceProperties(selection);
	if (codeProperties.length) {
		groups.push({ id: 'code', label: localize('designElementCodeReferences', "Code references"), properties: codeProperties });
	}

	const variableProperties = Object.keys(computedStyles)
		.filter(name => name.startsWith('--'))
		.sort()
		.map(name => toProperty(name, computedStyles[name], workspaceTokens));

	if (variableProperties.length) {
		groups.push({ id: 'tokens', label: localize('designElementTokens', "Tokens"), properties: variableProperties });
	}

	const used = new Set<string>(variableProperties.map(property => property.name));
	for (const group of groupDefinitions) {
		const properties = group.names
			.filter(name => typeof computedStyles[name] === 'string' && computedStyles[name].length > 0)
			.map(name => {
				used.add(name);
				return toProperty(name, computedStyles[name], workspaceTokens);
			});

		if (properties.length) {
			groups.push({ id: group.id, label: group.label, properties });
		}
	}

	const other = Object.keys(computedStyles)
		.filter(name => !used.has(name) && !name.startsWith('--'))
		.sort()
		.slice(0, 24)
		.map(name => toProperty(name, computedStyles[name], workspaceTokens));
	if (other.length) {
		groups.push({ id: 'other', label: localize('designElementOther', "Other"), properties: other });
	}

	return groups;
}

function getCodeReferenceProperties(selection: IDesignElementSelection): readonly IDesignElementProperty[] {
	const properties: IDesignElementProperty[] = [];
	for (const className of selection.classes) {
		const token = getReadableClassToken(className);
		if (token) {
			properties.push({ name: localize('designElementClassName', "class"), value: className, source: 'class', token });
		}
	}
	return properties;
}

function getMatchedStyleProperties(selection: IDesignElementSelection): readonly IDesignElementProperty[] {
	const properties: IDesignElementProperty[] = [];
	for (const rule of selection.elementData.matchedStyleRules ?? []) {
		const tokens = extractSourceTokens(rule.cssText);
		properties.push({
			name: localize('designElementMatchedSelector', "selector"),
			value: rule.sourceURL ? `${rule.selector} (${rule.sourceURL})` : rule.selector,
			source: 'source',
			token: tokens.length ? tokens.join(', ') : rule.cssText
		});
	}
	return properties;
}

function getReactComponentProperties(selection: IDesignElementSelection): readonly IDesignElementProperty[] {
	const properties: IDesignElementProperty[] = [];
	for (const component of selection.elementData.reactComponents ?? []) {
		const propSummary = formatReactPropSummary(component.props);
		properties.push({
			name: component.source ? localize('designElementPackageComponent', "package component") : localize('designElementReactComponent', "component"),
			value: component.source ? `${component.name} from ${component.source}` : component.name,
			source: 'source',
			token: propSummary
		});
	}
	return properties.slice(0, 12);
}

function formatReactPropSummary(props: readonly { readonly name: string; readonly value: string }[] | undefined): string | undefined {
	if (!props?.length) {
		return undefined;
	}
	return props.slice(0, 5).map(prop => `${prop.name}=${prop.value}`).join(', ');
}

export function createClaudeDesignElementPrompt(selection: IDesignElementSelection, groups: readonly IDesignElementPropertyGroup[]): string {
	const lines: string[] = [];
	lines.push('Review this selected browser design element.');
	lines.push('Prefer source-backed component, class, and token evidence. Raw CSS is fallback evidence only.');
	lines.push('');
	lines.push(`Element: ${selection.displayName}`);
	if (selection.url) {
		lines.push(`URL: ${selection.url}`);
	}
	if (selection.classes.length) {
		lines.push(`Classes: ${selection.classes.join(' ')}`);
	}
	if (selection.wasNormalized) {
		lines.push(`Selected node: ${selection.selectedNodeDisplayName}`);
	}
	lines.push(`DOM Path: ${selection.domPath}`);
	lines.push(`Bounds: x=${Math.round(selection.bounds.x)}, y=${Math.round(selection.bounds.y)}, width=${Math.round(selection.bounds.width)}, height=${Math.round(selection.bounds.height)}`);
	lines.push('');
	const sourceGroups = groups.filter(group => group.id === 'source' || group.id === 'code' || group.id === 'tokens');
	const renderedGroups = groups.filter(group => group.id !== 'source' && group.id !== 'code' && group.id !== 'tokens');

	lines.push('Source-backed design context:');
	for (const group of sourceGroups) {
		lines.push(`- ${group.label}`);
		for (const property of group.properties) {
			const suffix = property.token ? ` (${property.token})` : '';
			lines.push(`  - ${property.name}: ${property.value}${suffix}`);
		}
	}
	if (!sourceGroups.length) {
		lines.push('- No source-backed component, class, or token evidence was found.');
	}
	lines.push('');
	lines.push('Rendered fallback details:');
	for (const group of renderedGroups) {
		lines.push(`- ${group.label}`);
		for (const property of group.properties) {
			const suffix = property.token ? ` (${property.token})` : '';
			lines.push(`  - ${property.name}: ${property.value}${suffix}`);
		}
	}
	lines.push('');
	lines.push('HTML:');
	lines.push('```html');
	lines.push(selection.outerHTML);
	lines.push('```');
	lines.push('');
	lines.push('Matched CSS and resolved values:');
	lines.push('```css');
	lines.push(selection.computedStyle);
	lines.push('```');
	return lines.join('\n');
}

function getElementClasses(elementData: IElementData, attributes: Readonly<Record<string, string>>, ancestor: IElementAncestor | undefined, wasNormalized: boolean): readonly string[] {
	if (!wasNormalized && attributes.class) {
		return attributes.class.trim().split(/\s+/).filter(Boolean);
	}

	return ancestor?.classNames ?? [];
}

function getElementDisplayName(ancestor: IElementAncestor | undefined, classes: readonly string[]): string {
	if (!ancestor) {
		return classes.length ? `element.${classes.join('.')}` : 'element';
	}

	const tagName = (ancestor.tagName || 'element').toLowerCase();
	const id = ancestor.id ? `#${ancestor.id}` : '';
	const classNames = classes.length ? `.${classes.join('.')}` : '';
	return `${tagName}${id}${classNames}`;
}

function getInspectedAncestor(ancestors: readonly IElementAncestor[] | undefined): IElementAncestor | undefined {
	if (!ancestors?.length) {
		return undefined;
	}

	const selected = ancestors.at(-1);
	if (!selected || !isLowLevelElement(selected.tagName)) {
		return selected;
	}

	for (let i = ancestors.length - 2; i >= 0; i--) {
		const ancestor = ancestors[i];
		const tagName = ancestor.tagName.toLowerCase();
		if (tagName === 'body' || tagName === 'html') {
			continue;
		}
		if (!isLowLevelElement(tagName) || ancestor.id || ancestor.classNames?.length) {
			return ancestor;
		}
	}

	return selected;
}

function isLowLevelElement(tagName: string): boolean {
	return ['path', 'svg', 'g', 'use', 'defs', 'clippath', 'mask', 'line', 'polyline', 'polygon', 'circle', 'ellipse', 'rect'].includes(tagName);
}

function formatElementPath(ancestors: readonly IElementAncestor[] | undefined): string {
	if (!ancestors?.length) {
		return 'element';
	}

	return ancestors.map(ancestor => {
		const tagName = (ancestor.tagName || 'element').toLowerCase();
		const id = ancestor.id ? `#${ancestor.id}` : '';
		const classes = ancestor.classNames?.length ? `.${ancestor.classNames.join('.')}` : '';
		return `${tagName}${id}${classes}`;
	}).join(' > ');
}

function toProperty(name: string, value: string, workspaceTokens: ReadonlyMap<string, readonly string[]>): IDesignElementProperty {
	if (name.startsWith('--')) {
		return { name, value, source: 'css-variable', token: name };
	}

	const tokens = workspaceTokens.get(normalizeDesignElementTokenValue(value));
	if (tokens?.length) {
		return { name, value, source: 'token', token: tokens.join(', ') };
	}

	return { name, value, source: 'raw' };
}

function isLongAttribute(name: string, value: string): boolean {
	return value.length > 80 || ['d', 'points', 'style'].includes(name);
}

function getReadableClassToken(className: string): string | undefined {
	const withoutHash = className.replace(/-sc-[\w-]+$/, '').replace(/^_+/, '');
	if (withoutHash.includes('__')) {
		return withoutHash.replace('__', '.');
	}
	if (/^[A-Z][\w-]*$/.test(withoutHash)) {
		return withoutHash;
	}
	return undefined;
}

interface ISourceEvidence {
	readonly term: string;
	readonly label: string;
	readonly weight: number;
}

function getSourceEvidence(selection: IDesignElementSelection): readonly ISourceEvidence[] {
	const evidence = new Map<string, ISourceEvidence>();
	const add = (term: string | undefined, label: string, weight: number) => {
		const normalized = term?.trim();
		if (!normalized || normalized.length < 3 || normalized.length > 120) {
			return;
		}
		const existing = evidence.get(normalized);
		if (!existing || existing.weight < weight) {
			evidence.set(normalized, { term: normalized, label, weight });
		}
	};

	for (const className of selection.classes) {
		add(className, localize('designElementSourceClass', "class"), 5);
		const readable = getReadableClassToken(className);
		if (readable) {
			add(readable, localize('designElementSourceComponent', "component"), 10);
			for (const part of readable.split('.')) {
				add(part, localize('designElementSourceComponent', "component"), 7);
			}
		}
	}

	for (const component of selection.elementData.reactComponents ?? []) {
		add(component.name, localize('designElementSourceReactComponent', "component"), component.source ? 12 : 10);
		if (component.source) {
			add(component.source, localize('designElementSourcePackage', "package"), 12);
		}
	}

	for (const rule of selection.elementData.matchedStyleRules ?? []) {
		add(rule.selector, localize('designElementSourceSelector', "selector"), 6);
		for (const property of rule.properties) {
			if (property.value.includes('var(') || /(?:theme|tokens|spacing|color|colors|typography|font|radii|radius|space|sizes)\./.test(property.value)) {
				add(property.value, localize('designElementSourceToken', "token"), 9);
			}
		}
		for (const token of extractSourceTokens(rule.cssText)) {
			add(token, localize('designElementSourceToken', "token"), 9);
		}
	}

	for (const [name, value] of Object.entries(selection.attributes)) {
		if (['id', 'data-testid', 'data-test-id', 'aria-label', 'name', 'role'].includes(name)) {
			add(value, name, name === 'id' || name.startsWith('data-') ? 8 : 5);
		}
	}

	add(extractOuterText(selection.outerHTML), localize('designElementSourceText', "text"), 4);
	return [...evidence.values()].sort((a, b) => b.weight - a.weight).slice(0, 24);
}

function extractOuterText(outerHTML: string): string | undefined {
	const text = outerHTML
		.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return text.length <= 80 ? text : undefined;
}

function extractSourceTokens(text: string): readonly string[] {
	const tokens = new Set<string>();
	for (const match of text.matchAll(/var\(\s*(--[\w-]+)/g)) {
		tokens.add(match[1]);
	}
	for (const match of text.matchAll(/\b(?:theme|tokens|spacing|color|colors|typography|font|radii|radius|space|sizes)\.([A-Za-z0-9_.-]+)/g)) {
		tokens.add(match[0]);
	}
	for (const match of text.matchAll(/\$[A-Za-z][\w-]*(?:-[\w]+)*/g)) {
		tokens.add(match[0]);
	}
	return [...tokens].slice(0, 12);
}

function getRelativePath(uri: URI, rootPaths: readonly string[]): string {
	const path = uri.path;
	const root = rootPaths.find(candidate => path.startsWith(candidate));
	if (!root) {
		return path;
	}
	return path.slice(root.length).replace(/^\//, '');
}

function isTextSearchMatch(result: unknown): result is ITextSearchMatch {
	return Array.isArray((result as ITextSearchMatch)?.rangeLocations) && typeof (result as ITextSearchMatch)?.previewText === 'string';
}

export class BrowserDesignElementService extends Disposable implements IBrowserDesignElementService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeSelection = this._register(new Emitter<IDesignElementSelection | undefined>());
	readonly onDidChangeSelection = this._onDidChangeSelection.event;

	private readonly _onDidChangeInspectionActive = this._register(new Emitter<boolean>());
	readonly onDidChangeInspectionActive = this._onDidChangeInspectionActive.event;

	private _selection: IDesignElementSelection | undefined;
	private _propertyGroups: readonly IDesignElementPropertyGroup[] = [];
	private _inspectionActive = false;
	private _workspaceTokens: Promise<Map<string, readonly string[]>> | undefined;
	private readonly _selectedContext: IContextKey<boolean>;

	get selection(): IDesignElementSelection | undefined {
		return this._selection;
	}

	get propertyGroups(): readonly IDesignElementPropertyGroup[] {
		return this._propertyGroups;
	}

	get inspectionActive(): boolean {
		return this._inspectionActive;
	}

	constructor(
		@IViewsService private readonly viewsService: IViewsService,
		@ICommandService private readonly commandService: ICommandService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@ISearchService private readonly searchService: ISearchService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this._selectedContext = BROWSER_DESIGN_ELEMENT_SELECTED_CONTEXT.bindTo(contextKeyService);
	}

	async inspectElement(elementData: IElementData): Promise<void> {
		const selection = createDesignElementSelection(elementData);
		this._selection = selection;
		this._selectedContext.set(true);
		this._setInspectionActive(true);
		const [workspaceTokens, sourceProperties] = await Promise.all([
			this._getWorkspaceTokens(),
			this._findWorkspaceSourceProperties(selection)
		]);
		this._propertyGroups = resolveDesignElementProperties(selection, workspaceTokens, sourceProperties);
		this._onDidChangeSelection.fire(selection);

		await this.viewsService.openView(BROWSER_DESIGN_ELEMENT_VIEW_ID, true);
	}

	closeInspection(): void {
		this._selectedContext.set(false);
		this._setInspectionActive(false);
	}

	async sendToClaudeCode(sessionResource?: URI): Promise<void> {
		if (!this._selection) {
			return;
		}

		const prompt = createClaudeDesignElementPrompt(this._selection, this._propertyGroups);
		if (sessionResource?.scheme === 'claude-code') {
			try {
				await this.commandService.executeCommand('workbench.action.chat.openSessionWithPrompt.claude-code', {
					resource: sessionResource,
					prompt
				});
				await this._revealClaudeCode();
				return;
			} catch {
				// Fall back to clipboard below. The fallback is visible to the user.
			}
		}

		await this.clipboardService.writeText(prompt);
		await this._revealClaudeCode();
		this.notificationService.notify({
			id: 'browser.designElement.copied',
			severity: Severity.Info,
			message: localize('designElementCopied', "Design element context copied. Paste it into Claude Code."),
			source: DESIGN_ELEMENT_NOTIFICATION_SOURCE
		});
	}

	private async _revealClaudeCode(): Promise<void> {
		try {
			await this.commandService.executeCommand('claude-vscode.sidebar.open');
			await this.commandService.executeCommand('claude-vscode.focus');
		} catch {
			// Best effort only; the clipboard fallback remains available when Claude Code is not active.
		}
	}

	private _setInspectionActive(active: boolean): void {
		if (this._inspectionActive === active) {
			return;
		}

		this._inspectionActive = active;
		this._onDidChangeInspectionActive.fire(active);
	}

	private _getWorkspaceTokens(): Promise<Map<string, readonly string[]>> {
		if (!this._workspaceTokens) {
			this._workspaceTokens = this._scanWorkspaceTokens();
		}
		return this._workspaceTokens;
	}

	private async _scanWorkspaceTokens(): Promise<Map<string, readonly string[]>> {
		const tokens = new Map<string, string[]>();
		const folders = this.workspaceContextService.getWorkspace().folders.slice(0, 3);
		await Promise.all(folders.map(folder => this._scanFolder(folder.uri, tokens, 0).catch(() => undefined)));
		return tokens;
	}

	private async _scanFolder(uri: URI, tokens: Map<string, string[]>, depth: number): Promise<void> {
		if (depth > 4 || tokens.size > 500) {
			return;
		}

		const stat = await this.fileService.resolve(uri);
		if (stat.children) {
			await Promise.all(stat.children
				.filter(child => !shouldSkipTokenPath(child.resource))
				.slice(0, 80)
				.map(child => (child.isDirectory ? this._scanFolder(child.resource, tokens, depth + 1) : this._readTokenFile(child.resource, tokens)).catch(() => undefined)));
		}
	}

	private async _readTokenFile(uri: URI, tokens: Map<string, string[]>): Promise<void> {
		if (!isTokenCandidate(uri)) {
			return;
		}

		const content = await this.fileService.readFile(uri, { limits: { size: 200_000 } });
		const text = content.value.toString();
		for (const definition of extractDesignElementTokenDefinitions(text)) {
			addToken(tokens, definition.value, definition.name);
		}
	}

	private async _findWorkspaceSourceProperties(selection: IDesignElementSelection): Promise<readonly IDesignElementProperty[]> {
		const evidence = getSourceEvidence(selection);
		if (!evidence.length) {
			return [];
		}

		const matches = new Map<string, { uri: URI; score: number; reasons: Set<string>; tokens: Set<string>; line: number | undefined }>();
		const folders = this.workspaceContextService.getWorkspace().folders.slice(0, 3);
		await Promise.all(evidence.slice(0, 10).map(item => this._searchSourceEvidence(item, matches).catch(() => undefined)));

		return [...matches.values()]
			.sort((a, b) => b.score - a.score)
			.slice(0, 8)
			.map(match => {
				const path = getRelativePath(match.uri, folders.map(folder => folder.uri.path));
				const line = match.line ? `:${match.line}` : '';
				const reasons = [...match.reasons].slice(0, 3).join(', ');
				const tokens = [...match.tokens].slice(0, 5);
				return {
					name: localize('designElementSourceMatch', "source"),
					value: `${path}${line}${reasons ? ` (${reasons})` : ''}`,
					source: 'source',
					token: tokens.length ? tokens.join(', ') : undefined
				};
			});
	}

	private async _searchSourceEvidence(evidence: ISourceEvidence, matches: Map<string, { uri: URI; score: number; reasons: Set<string>; tokens: Set<string>; line: number | undefined }>): Promise<void> {
		const folders = this.workspaceContextService.getWorkspace().folders.slice(0, 3);
		if (!folders.length) {
			return;
		}

		const complete = await this.searchService.textSearch({
			type: QueryType.Text,
			contentPattern: { pattern: evidence.term, isRegExp: false },
			folderQueries: folders.map(folder => ({
				folder: folder.uri,
				includePattern: { '**/*.{ts,tsx,js,jsx,css,scss,sass,less}': true },
				excludePattern: [{
					pattern: {
						'**/node_modules/**': true,
						'**/.git/**': true,
						'**/out/**': true,
						'**/dist/**': true,
						'**/build/**': true,
						'**/.next/**': true,
						'**/coverage/**': true
					}
				}]
			})),
			maxResults: 12,
			maxFileSize: 300_000,
			previewOptions: { matchLines: 1, charsPerLine: 240 },
			_reason: 'browserDesignElementSource'
		});

		for (const result of complete.results) {
			if (!isFileMatch(result) || !isSourceCandidate(result.resource)) {
				continue;
			}
			const key = result.resource.toString();
			const existing = matches.get(key) ?? { uri: result.resource, score: 0, reasons: new Set<string>(), tokens: new Set<string>(), line: undefined };
			existing.score += evidence.weight;
			existing.reasons.add(evidence.label);
			for (const match of result.results ?? []) {
				if (isTextSearchMatch(match)) {
					existing.line ??= match.rangeLocations[0]?.source.startLineNumber;
					for (const token of extractSourceTokens(match.previewText)) {
						existing.tokens.add(token);
					}
					for (const token of extractPackageImports(match.previewText)) {
						existing.tokens.add(token);
					}
				}
			}
			await this._readSourceEvidenceFile(result.resource, existing).catch(() => undefined);
			matches.set(key, existing);
		}
	}

	private async _readSourceEvidenceFile(uri: URI, match: { tokens: Set<string> }): Promise<void> {
		const content = await this.fileService.readFile(uri, { limits: { size: 300_000 } });
		const text = content.value.toString();
		for (const token of extractSourceTokens(text)) {
			match.tokens.add(token);
		}
		for (const token of extractPackageImports(text)) {
			match.tokens.add(token);
		}
	}

}

interface ITokenDefinition {
	readonly name: string;
	readonly value: string;
}

export function extractDesignElementTokenDefinitions(text: string): readonly ITokenDefinition[] {
	const definitions: ITokenDefinition[] = [];
	const stack: string[] = [];
	const lines = text.split(/\r?\n/);

	for (const line of lines) {
		const clean = line
			.replace(/\/\/.*$/, '')
			.replace(/\/\*.*?\*\//g, '')
			.trim();
		if (!clean) {
			continue;
		}

		if (/^[}\]]/.test(clean)) {
			stack.pop();
			if (/^[}\]],?;?$/.test(clean)) {
				continue;
			}
		}

		for (const match of clean.matchAll(/(?:^|[,{\s])['"]?([\w$.-]+|--[\w-]+)['"]?\s*:\s*['"]?((?:#[\da-fA-F]{3,8})|(?:-?\d+(?:\.\d+)?(?:px|rem|em|%))|(?:rgb[a]?\([^)]+\))|(?:rgba\([^)]+\)))['"]?/g)) {
			const key = match[1];
			const value = match[2];
			if (!key || !value) {
				continue;
			}
			definitions.push({ name: key.startsWith('--') ? key : [...stack, key].join('.'), value });
		}

		const opensObject = clean.match(/(?:^|[,{\s])['"]?([\w$.-]+)['"]?\s*:\s*[{[]\s*$/) ?? clean.match(/(?:export\s+)?(?:const|let|var)\s+([\w$.-]+)\s*=\s*[{[]\s*$/);
		if (opensObject?.[1]) {
			stack.push(opensObject[1]);
			continue;
		}

		const closeCount = (clean.match(/[}\]]/g) ?? []).length;
		const openCount = (clean.match(/[{[]/g) ?? []).length;
		for (let i = 0; i < Math.max(0, closeCount - openCount); i++) {
			stack.pop();
		}
	}

	return definitions;
}

function addToken(tokens: Map<string, string[]>, value: string, name: string): void {
	const normalized = normalizeDesignElementTokenValue(value);
	if (!normalized || !name) {
		return;
	}
	const existing = tokens.get(normalized) ?? [];
	if (!existing.includes(name)) {
		tokens.set(normalized, [...existing, name]);
	}
}

export function normalizeDesignElementTokenValue(value: string): string {
	const clean = value
		.replace(/\/\*.*?\*\//g, '')
		.trim()
		.toLowerCase();

	const hex = normalizeHexColor(clean);
	if (hex) {
		return hex;
	}

	const rgb = normalizeRgbColor(clean);
	if (rgb) {
		return rgb;
	}

	const length = clean.match(/^(-?\d+(?:\.\d+)?)(px|rem|em|%)$/);
	if (length) {
		const number = Number(length[1]);
		return `${Number.isInteger(number) ? number : Number(number.toFixed(3))}${length[2]}`;
	}

	return clean;
}

function normalizeHexColor(value: string): string | undefined {
	const match = value.match(/^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i);
	if (!match) {
		return undefined;
	}
	const hex = match[1].toLowerCase();
	if (hex.length === 3) {
		return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
	}
	return `#${hex.slice(0, 6)}`;
}

function normalizeRgbColor(value: string): string | undefined {
	const match = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
	if (!match) {
		return undefined;
	}
	const toHex = (part: string) => {
		const value = Math.max(0, Math.min(255, Math.round(Number(part))));
		return value.toString(16).padStart(2, '0');
	};
	return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
}

function isTokenCandidate(uri: URI): boolean {
	const path = uri.path.toLowerCase();
	return /\.(css|scss|sass|less|ts|tsx|js|jsx|json)$/.test(path)
		&& /(token|theme|tailwind|style|variable|color|spacing|typography|design)/.test(path);
}

function isSourceCandidate(uri: URI): boolean {
	const path = uri.path.toLowerCase();
	return /\.(ts|tsx|js|jsx|css|scss|sass|less)$/.test(path)
		&& !/(\.test\.|\.spec\.|\.stories\.)/.test(path);
}

function extractPackageImports(text: string): readonly string[] {
	const tokens = new Set<string>();
	for (const match of text.matchAll(/import\s+([^;]+?)\s+from\s+['"]([^'"]+)['"]/g)) {
		const imports = match[1].replace(/\s+/g, ' ').trim();
		const source = match[2];
		if (source.startsWith('.') || source.startsWith('/')) {
			continue;
		}
		const defaultImport = imports.match(/^([A-Za-z_$][\w$]*)/);
		if (defaultImport) {
			tokens.add(`${defaultImport[1]} from ${source}`);
		}
		const namespaceImport = imports.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
		if (namespaceImport) {
			tokens.add(`${namespaceImport[1]} from ${source}`);
		}
		const named = imports.match(/\{([^}]+)\}/);
		if (named) {
			for (const item of named[1].split(',')) {
				const parts = item.trim().split(/\s+as\s+/);
				const name = (parts[1] ?? parts[0])?.trim();
				if (name) {
					tokens.add(`${name} from ${source}`);
				}
			}
		}
	}
	return [...tokens].slice(0, 12);
}

function shouldSkipTokenPath(uri: URI): boolean {
	const path = uri.path.toLowerCase();
	return path.includes('/node_modules/')
		|| path.includes('/.git/')
		|| path.includes('/out/')
		|| path.includes('/dist/')
		|| path.includes('/build/');
}

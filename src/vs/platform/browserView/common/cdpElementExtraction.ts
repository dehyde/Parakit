/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../base/common/lifecycle.js';
import { IElementData, IElementAncestor, IElementMatchedStyleRule, IElementComponent, IElementStateStyles } from './browserView.js';
import { ICDPConnection } from './cdp/types.js';
import { collapseToShorthands, formatMatchedStyles, keyComputedProperties, type IMatchedStyles } from './cssHelpers.js';

type Quad = [number, number, number, number, number, number, number, number];

interface IBoxModel {
	content: Quad;
	padding: Quad;
	border: Quad;
	margin: Quad;
	width: number;
	height: number;
}

interface INode {
	nodeId: number;
	backendNodeId: number;
	parentId?: number;
	localName: string;
	attributes: string[];
	children?: INode[];
	pseudoElements?: INode[];
}

const FORCEABLE_PSEUDO_CLASSES = new Set(['active', 'focus', 'focus-visible', 'focus-within', 'hover', 'target', 'visited']);

function useScopedDisposal() {
	const store = new DisposableStore() as DisposableStore & { [Symbol.dispose](): void };
	store[Symbol.dispose] = () => store.dispose();
	return store;
}

export async function extractNodeData(connection: ICDPConnection, id: { readonly nodeId?: number; readonly backendNodeId?: number; readonly objectId?: string }, options?: { readonly states?: readonly string[] }): Promise<IElementData> {
	using store = useScopedDisposal();

	const discoveredNodesByNodeId: Record<number, INode> = {};
	store.add(connection.onEvent(event => {
		if (event.method === 'DOM.setChildNodes') {
			const { nodes } = event.params as { nodes: INode[] };
			for (const node of nodes) {
				discoveredNodesByNodeId[node.nodeId] = node;
				if (node.children) {
					for (const child of node.children) {
						discoveredNodesByNodeId[child.nodeId] = {
							...child,
							parentId: node.nodeId
						};
					}
				}
				if (node.pseudoElements) {
					for (const pseudo of node.pseudoElements) {
						discoveredNodesByNodeId[pseudo.nodeId] = {
							...pseudo,
							parentId: node.nodeId
						};
					}
				}
			}
		}
	}));

	await connection.sendCommand('DOM.getDocument');

	const { node } = await connection.sendCommand('DOM.describeNode', id) as { node: INode };
	if (!node) {
		throw new Error('Failed to describe node.');
	}
	let nodeId = node.nodeId;
	if (!nodeId) {
		const { nodeIds } = await connection.sendCommand('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: [node.backendNodeId] }) as { nodeIds: number[] };
		if (!nodeIds?.length) {
			throw new Error('Failed to get node ID.');
		}
		nodeId = nodeIds[0];
	}

	const { model } = await connection.sendCommand('DOM.getBoxModel', { nodeId }) as { model: IBoxModel };
	if (!model) {
		throw new Error('Failed to get box model.');
	}

	const content = model.content;
	const margin = model.margin;
	const x = Math.min(margin[0], content[0]);
	const y = Math.min(margin[1], content[1]);
	const width = Math.max(margin[2] - margin[0], content[2] - content[0]);
	const height = Math.max(margin[5] - margin[1], content[5] - content[1]);

	const matched = await connection.sendCommand('CSS.getMatchedStylesForNode', { nodeId });
	if (!matched) {
		throw new Error('Failed to get matched css.');
	}

	const { rulesText, referencedVars, authorPropertyNames, userAgentPropertyNames } = formatMatchedStyles(matched as IMatchedStyles);
	const matchedStyleRules = extractMatchedStyleRules(matched as IMatchedStyles);
	const { outerHTML } = await connection.sendCommand('DOM.getOuterHTML', { nodeId }) as { outerHTML: string };
	if (!outerHTML) {
		throw new Error('Failed to get outerHTML.');
	}
	const components = await extractComponents(connection, nodeId).catch(() => undefined);

	const attributes = attributeArrayToRecord(node.attributes);

	const ancestors: IElementAncestor[] = [];
	let currentNode: INode | undefined = discoveredNodesByNodeId[nodeId] ?? node;
	while (currentNode) {
		const currentAttributes = attributeArrayToRecord(currentNode.attributes);
		ancestors.unshift({
			tagName: currentNode.localName,
			id: currentAttributes.id,
			classNames: currentAttributes.class?.trim().split(/\s+/).filter(Boolean)
		});
		currentNode = currentNode.parentId ? discoveredNodesByNodeId[currentNode.parentId] : undefined;
	}

	let computedStyle = rulesText;
	let computedStyles: Record<string, string> | undefined;
	try {
		const { computedStyle: computedStyleArray } = await connection.sendCommand('CSS.getComputedStyleForNode', { nodeId }) as { computedStyle?: Array<{ name: string; value: string }> };
		if (computedStyleArray) {
			computedStyles = {};

			const resolvedMap = new Map<string, string>();
			const varLines: string[] = [];

			for (const prop of computedStyleArray) {
				if (!prop.name || typeof prop.value !== 'string') {
					continue;
				}

				if (referencedVars.has(prop.name) || keyComputedProperties.has(prop.name)) {
					computedStyles[prop.name] = prop.value;
				}

				if (authorPropertyNames.has(prop.name)) {
					resolvedMap.set(prop.name, prop.value);
				} else if (userAgentPropertyNames.has(prop.name)) {
					resolvedMap.set(prop.name, `${prop.value} /*UA*/`);
				}

				if (referencedVars.has(prop.name)) {
					varLines.push(`${prop.name}: ${prop.value};`);
				}
			}

			if (resolvedMap.size > 0) {
				const resolvedLines = collapseToShorthands(resolvedMap);
				computedStyle += '\n\n/* Resolved values */\n' + resolvedLines.join('\n');
			}
			if (varLines.length > 0) {
				computedStyle += '\n\n/* CSS variables */\n' + varLines.join('\n');
			}
		}
	} catch { }

	const states = options?.states?.length
		? await captureElementStates(connection, nodeId, options.states).catch(() => [])
		: undefined;

	return {
		outerHTML,
		computedStyle,
		bounds: { x, y, width, height },
		ancestors,
		attributes,
		computedStyles,
		dimensions: { top: y, left: x, width, height },
		matchedStyleRules,
		components,
		states
	};
}

export async function captureElementStates(connection: ICDPConnection, nodeId: number, states: readonly string[]): Promise<readonly IElementStateStyles[]> {
	const validStates = states.filter(state => FORCEABLE_PSEUDO_CLASSES.has(state));
	if (!validStates.length) {
		return [];
	}

	const results: IElementStateStyles[] = [];
	try {
		for (const state of validStates) {
			try {
				await connection.sendCommand('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [state] });

				const matched = await connection.sendCommand('CSS.getMatchedStylesForNode', { nodeId });
				const matchedStyleRules = extractMatchedStyleRules(matched as IMatchedStyles);

				const { computedStyle: computedStyleArray } = await connection.sendCommand('CSS.getComputedStyleForNode', { nodeId }) as { computedStyle?: Array<{ name: string; value: string }> };
				const computedStyles: Record<string, string> = {};
				if (computedStyleArray) {
					for (const prop of computedStyleArray) {
						if (prop.name && typeof prop.value === 'string' && prop.name.startsWith('--')) {
							computedStyles[prop.name] = prop.value;
						}
					}
				}

				results.push({ state, computedStyles, matchedStyleRules });
			} catch {
				// Best effort per state: some pseudo-classes may not apply to this element.
			}
		}
	} finally {
		await connection.sendCommand('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] }).catch(() => {
			// Best effort restore.
		});
	}

	return results;
}

// Svelte is intentionally not attempted: it has no stable, version-independent DOM handle
// to walk in production builds. DOM, style, and token inspection still work for Svelte apps.
async function extractComponents(connection: ICDPConnection, nodeId: number): Promise<readonly IElementComponent[] | undefined> {
	const { object } = await connection.sendCommand('DOM.resolveNode', { nodeId }) as { object?: { objectId?: string } };
	if (!object?.objectId) {
		return undefined;
	}

	const { result } = await connection.sendCommand('Runtime.callFunctionOn', {
		objectId: object.objectId,
		returnByValue: true,
		functionDeclaration: `function() {
			const scalar = value => {
				if (value === undefined || value === null) {
					return undefined;
				}
				const type = typeof value;
				if (type === 'string' || type === 'number' || type === 'boolean') {
					return String(value);
				}
				if (Array.isArray(value)) {
					return value.filter(item => ['string', 'number', 'boolean'].includes(typeof item)).slice(0, 4).join(', ');
				}
				return undefined;
			};
			const PROP_ALLOWLIST = ['variant', 'size', 'color', 'type', 'role', 'aria-label', 'className', 'style', 'status', 'disabled'];
			const propsFrom = rawProps => {
				const props = [];
				for (const key of PROP_ALLOWLIST) {
					const value = scalar((rawProps || {})[key]);
					if (value) {
						props.push({ name: key, value: value.length > 120 ? value.slice(0, 117) + '...' : value });
					}
				}
				return props;
			};

			const reactComponentName = type => {
				if (!type) {
					return undefined;
				}
				if (typeof type === 'string') {
					return type;
				}
				return type.displayName || type.name || type.render?.displayName || type.render?.name || type.type?.displayName || type.type?.name;
			};
			const reactSourceName = type => type?._context?.displayName || type?.Provider?._context?.displayName;
			const findReact = element => {
				const fiberKey = Object.keys(element).find(key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'));
				if (!fiberKey) {
					return [];
				}
				const components = [];
				const seen = new Set();
				for (let current = element[fiberKey]; current && components.length < 16; current = current.return) {
					const name = reactComponentName(current.elementType || current.type);
					if (!name || seen.has(name)) {
						continue;
					}
					seen.add(name);
					components.push({ name, framework: 'react', source: reactSourceName(current.elementType || current.type), props: propsFrom(current.memoizedProps || current.pendingProps) });
				}
				return components;
			};

			const findVue = element => {
				const instance = element.__vueParentComponent || element.__vnode?.component || element.__vue_app__?._instance;
				if (!instance) {
					return [];
				}
				const components = [];
				const seen = new Set();
				let current = instance;
				while (current && components.length < 16) {
					const name = current.type?.name || current.type?.__name || current.type?.displayName;
					if (name && !seen.has(name)) {
						seen.add(name);
						components.push({ name, framework: 'vue', props: propsFrom(current.props) });
					}
					current = current.parent;
				}
				return components;
			};

			const findCustomElement = element => {
				const tagName = element.tagName ? element.tagName.toLowerCase() : '';
				if (!tagName.includes('-') || typeof customElements === 'undefined' || !customElements.get(tagName)) {
					return [];
				}
				const ctor = customElements.get(tagName);
				return [{ name: ctor.name || tagName, framework: 'web-component', props: [] }];
			};

			for (let current = this; current; current = current.parentElement) {
				const react = findReact(current);
				if (react.length) {
					return react;
				}
				const vue = findVue(current);
				if (vue.length) {
					return vue;
				}
				const customElement = findCustomElement(current);
				if (customElement.length) {
					return customElement;
				}
			}
			return [];
		}`
	}) as { result?: { value?: IElementComponent[] } };

	return result?.value?.length ? result.value : undefined;
}

export function extractMatchedStyleRules(matched: IMatchedStyles): readonly IElementMatchedStyleRule[] {
	const rules: IElementMatchedStyleRule[] = [];
	const seen = new Set<string>();
	const addRule = (ruleEntry: unknown) => {
		const rule = (ruleEntry as { rule?: { ruleId?: { styleSheetId?: string }; selectorList?: { selectors?: Array<{ text?: string }> }; origin?: string; sourceURL?: string; style?: { cssText?: string; cssProperties?: Array<{ name?: string; value?: string; disabled?: boolean }> } } })?.rule;
		const cssText = rule?.style?.cssText?.trim();
		if (!rule || rule.origin === 'user-agent' || !cssText) {
			return;
		}
		const selector = rule.selectorList?.selectors?.map(selector => selector.text).filter(Boolean).join(', ') ?? '';
		const key = `${selector}\n${cssText}`;
		if (!selector || seen.has(key)) {
			return;
		}
		seen.add(key);
		const properties: Array<{ name: string; value: string }> = [];
		for (const property of rule.style?.cssProperties ?? []) {
			const name = property.name;
			const value = property.value;
			if (name && value && !property.disabled) {
				properties.push({ name, value });
			}
		}
		rules.push({
			selector,
			origin: rule.origin ?? 'regular',
			cssText,
			styleSheetId: rule.ruleId?.styleSheetId,
			sourceURL: rule.sourceURL,
			properties
		});
	};

	for (const ruleEntry of matched.matchedCSSRules ?? []) {
		addRule(ruleEntry);
	}
	for (const pseudo of matched.pseudoElements ?? []) {
		for (const ruleEntry of pseudo.matches ?? []) {
			addRule(ruleEntry);
		}
	}
	for (const inherited of matched.inherited ?? []) {
		for (const ruleEntry of inherited.matchedCSSRules ?? []) {
			addRule(ruleEntry);
		}
	}

	return rules.slice(0, 24);
}

function attributeArrayToRecord(attributes: readonly string[]): Record<string, string> {
	const record: Record<string, string> = {};
	for (let i = 0; i < attributes.length; i += 2) {
		const name = attributes[i];
		const value = attributes[i + 1];
		record[name] = value;
	}
	return record;
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/browserDesignElement.css';

import { localize, localize2 } from '../../../../nls.js';
import { $, clearNode, append } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IViewContainersRegistry, IViewsRegistry, ViewContainer, ViewContainerLocation, Extensions as ViewExtensions } from '../../../common/views.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';
import { BROWSER_DESIGN_ELEMENT_CONTAINER_ID, BROWSER_DESIGN_ELEMENT_SELECTED_CONTEXT, BROWSER_DESIGN_ELEMENT_VIEW_ID, compactDesignElementDomPath, getDesignElementAttributeRows, IBrowserDesignElementService, IDesignElementProperty, IDesignElementPropertyGroup, IDesignElementSelection } from '../common/browserDesignElementService.js';

class BrowserDesignElementViewPane extends ViewPane {
	private readonly renderStore = this._register(new DisposableStore());
	private bodyElement: HTMLElement | undefined;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IBrowserDesignElementService private readonly designElementService: IBrowserDesignElementService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
		this._register(this.designElementService.onDidChangeSelection(() => this.renderContent()));
		this._register(this.designElementService.onDidChangeInspectionActive(() => this.renderContent()));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this.bodyElement = append(container, $('.browser-design-element-view'));
		this.renderContent();
	}

	private renderContent(): void {
		if (!this.bodyElement) {
			return;
		}

		this.renderStore.clear();
		clearNode(this.bodyElement);

		const selection = this.designElementService.selection;
		if (!selection) {
			append(this.bodyElement, $('.browser-design-element-empty', undefined, localize('browserDesignElementEmpty', "Select a browser element to inspect its design properties.")));
			return;
		}

		const header = append(this.bodyElement, $('.browser-design-element-header'));
		const headerText = append(header, $('.browser-design-element-header-text'));
		append(headerText, $('.browser-design-element-title', { title: selection.displayName }, selection.displayName));
		if (selection.url) {
			append(headerText, $('.browser-design-element-url', { title: selection.url }, shortenMiddle(selection.url, 72)));
		}

		const actions = append(header, $('.browser-design-element-actions'));
		const sendButton = append(actions, $('button.browser-design-element-button.browser-design-element-primary', { type: 'button' }, localize('browserDesignElementSendToClaude', "Send"))) as HTMLButtonElement;
		sendButton.title = localize('browserDesignElementSendToClaudeTitle', "Send to Claude Code");
		this.renderStore.add({
			dispose: () => sendButton.onclick = null
		});
		sendButton.onclick = () => {
			void this.designElementService.sendToClaudeCode(this.getClaudeSessionResource());
		};

		const closeButton = append(actions, $('button.browser-design-element-button.browser-design-element-secondary', { type: 'button' }, localize('browserDesignElementCloseInspection', "Close"))) as HTMLButtonElement;
		closeButton.title = localize('browserDesignElementCloseInspectionTitle', "Close inspection");
		this.renderStore.add({
			dispose: () => closeButton.onclick = null
		});
		closeButton.onclick = () => this.designElementService.closeInspection();

		this.renderElementSummary(selection);

		for (const group of this.designElementService.propertyGroups) {
			this.renderGroup(group);
		}
		this.renderAttributes(selection);
		this.renderRawDetails(selection);
	}

	private renderElementSummary(selection: IDesignElementSelection): void {
		this.renderSectionTitle(localize('browserDesignElementSummary', "Element"));
		const summary = append(this.bodyElement!, $('.browser-design-element-summary'));
		this.renderSummaryRow(summary, localize('browserDesignElementInspectedElement', "Inspected element"), selection.displayName, { title: selection.displayName });
		if (selection.wasNormalized) {
			this.renderSummaryRow(summary, localize('browserDesignElementSelectedNode', "Selected node"), selection.selectedNodeDisplayName, { title: selection.selectedNodeDisplayName });
		}
		this.renderDomPath(summary, selection.domPath);
		this.renderSummaryRow(summary, localize('browserDesignElementDimensions', "Dimensions"), `${Math.round(selection.bounds.width)} x ${Math.round(selection.bounds.height)} at ${Math.round(selection.bounds.x)}, ${Math.round(selection.bounds.y)}`);
		if (selection.classes.length) {
			this.renderSummaryRow(summary, localize('browserDesignElementClasses', "Classes"), selection.classes.join(' '), { title: selection.classes.join(' ') });
		}
	}

	private renderSummaryRow(container: HTMLElement, label: string, value: string, options?: { readonly title?: string }): void {
		const row = append(container, $('.browser-design-element-row'));
		append(row, $('.browser-design-element-label', undefined, label));
		append(row, $('.browser-design-element-value', options?.title ? { title: options.title } : undefined, value));
	}

	private renderDomPath(container: HTMLElement, domPath: string): void {
		const row = append(container, $('.browser-design-element-row'));
		append(row, $('.browser-design-element-label', undefined, localize('browserDesignElementDomPath', "DOM path")));
		const value = append(row, $('.browser-design-element-value.browser-design-element-breadcrumbs', { title: domPath }));
		const compact = compactDesignElementDomPath(domPath);
		for (let i = 0; i < compact.parts.length; i++) {
			if (i > 0) {
				append(value, $('span.browser-design-element-breadcrumb-separator', undefined, '>'));
			}
			append(value, $('span.browser-design-element-breadcrumb', undefined, compact.parts[i]));
		}
	}

	private renderAttributes(selection: IDesignElementSelection): void {
		const attributes = getDesignElementAttributeRows(selection);
		if (!attributes.inline.length && !attributes.collapsed.length) {
			return;
		}

		this.renderSectionTitle(localize('browserDesignElementAttributes', "Attributes"));
		const container = append(this.bodyElement!, $('.browser-design-element-summary'));
		for (const { name, value } of attributes.inline.slice(0, 12)) {
			this.renderSummaryRow(container, name, value);
		}
		for (const { name, value } of attributes.collapsed) {
			this.renderCollapsedValue(container, name, value);
		}
	}

	private renderGroup(group: IDesignElementPropertyGroup): void {
		this.renderSectionTitle(group.label);
		const container = append(this.bodyElement!, $('.browser-design-element-properties'));
		for (const property of group.properties) {
			this.renderProperty(container, property);
		}
	}

	private renderProperty(container: HTMLElement, property: IDesignElementProperty): void {
		const row = append(container, $('.browser-design-element-property'));
		append(row, $('.browser-design-element-property-name', undefined, property.name));

		const value = append(row, $('.browser-design-element-property-value'));
		if (property.token) {
			append(value, $('span.browser-design-element-token', undefined, property.token));
		}
		append(value, $('span.browser-design-element-raw-value', undefined, property.value));
	}

	private renderCollapsedValue(container: HTMLElement, label: string, value: string): void {
		const row = append(container, $('.browser-design-element-row.browser-design-element-row-block'));
		append(row, $('.browser-design-element-label', undefined, label));
		const details = append(row, $('details.browser-design-element-inline-details'));
		append(details, $('summary', undefined, localize('browserDesignElementShowValue', "Show value")));
		append(details, $('pre', undefined, value));
	}

	private renderRawDetails(selection: IDesignElementSelection): void {
		this.renderSectionTitle(localize('browserDesignElementRawDetails', "Raw details"));
		const htmlDetails = append(this.bodyElement!, $('details.browser-design-element-raw'));
		append(htmlDetails, $('summary', undefined, localize('browserDesignElementRawHtml', "Raw HTML")));
		append(htmlDetails, $('pre', undefined, selection.outerHTML));

		const cssDetails = append(this.bodyElement!, $('details.browser-design-element-raw'));
		append(cssDetails, $('summary', undefined, localize('browserDesignElementRawCss', "Raw CSS")));
		append(cssDetails, $('pre', undefined, selection.computedStyle));
	}

	private renderSectionTitle(label: string): void {
		append(this.bodyElement!, $('.browser-design-element-section-title', undefined, label));
	}

	private getClaudeSessionResource(): URI | undefined {
		const focused = this.chatWidgetService.lastFocusedWidget?.viewModel?.sessionResource;
		if (focused?.scheme === 'claude-code') {
			return focused;
		}

		for (const widget of this.chatWidgetService.getAllWidgets()) {
			const sessionResource = widget.viewModel?.sessionResource;
			if (sessionResource?.scheme === 'claude-code') {
				return sessionResource;
			}
		}

		return undefined;
	}
}

function shortenMiddle(value: string, maxLength: number): string {
	if (value.length <= maxLength) {
		return value;
	}

	const edgeLength = Math.max(12, Math.floor((maxLength - 3) / 2));
	return `${value.slice(0, edgeLength)}...${value.slice(value.length - edgeLength)}`;
}

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const designElementContainer: ViewContainer = viewContainersRegistry.registerViewContainer({
	id: BROWSER_DESIGN_ELEMENT_CONTAINER_ID,
	title: localize2('browserDesignElementContainer', "Design element"),
	icon: ThemeIcon.fromId(Codicon.inspect.id),
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [BROWSER_DESIGN_ELEMENT_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: BROWSER_DESIGN_ELEMENT_CONTAINER_ID,
	hideIfEmpty: true,
	order: 1000,
}, ViewContainerLocation.AuxiliaryBar, { doNotRegisterOpenCommand: true });

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
	id: BROWSER_DESIGN_ELEMENT_VIEW_ID,
	name: localize2('browserDesignElementViewName', "Design element"),
	containerIcon: designElementContainer.icon,
	containerTitle: designElementContainer.title.value,
	singleViewPaneContainerTitle: localize('browserDesignElementViewName', "Design element"),
	ctorDescriptor: new SyncDescriptor(BrowserDesignElementViewPane),
	when: BROWSER_DESIGN_ELEMENT_SELECTED_CONTEXT,
	canToggleVisibility: true,
	canMoveView: true,
	hideByDefault: false,
	order: 20,
}], designElementContainer);

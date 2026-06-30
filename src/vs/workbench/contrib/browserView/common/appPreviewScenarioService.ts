/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../base/common/uri.js';
import { IBrowserViewModel } from './browserView.js';
import { AppPreviewScenarioControlValue, AppPreviewScenarioSupportStatus, IAppPreviewScenarioConfig, IAppPreviewScenarioValidationError } from './appPreviewScenario.js';

export const IAppPreviewScenarioService = createDecorator<IAppPreviewScenarioService>('appPreviewScenarioService');

export interface IAppPreviewScenarioConfigState {
	readonly config: IAppPreviewScenarioConfig;
	readonly source: 'file' | 'starter';
	readonly errors: readonly IAppPreviewScenarioValidationError[];
}

export interface IAppPreviewScenarioCleanupResult {
	readonly removed: readonly string[];
	readonly modified: readonly string[];
}

export interface IAppPreviewScenarioChangeEvent {
	readonly tabId?: string;
}

export interface IAppPreviewScenarioService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeScenario: Event<IAppPreviewScenarioChangeEvent>;
	readonly onDidChangeSupport: Event<string>;

	readScenarioConfig(repository?: URI, branch?: string): Promise<IAppPreviewScenarioConfigState>;
	saveScenarioConfig(repository: URI | undefined, config: IAppPreviewScenarioConfig): Promise<void>;
	getTabScenarioState(tabId: string): Promise<Record<string, AppPreviewScenarioControlValue>>;
	setTabControlValue(tabId: string, controlId: string, value: AppPreviewScenarioControlValue): Promise<void>;
	resetTabToDefault(tabId: string): Promise<void>;
	getScenarioChatContext(activeTabId: string): Promise<string | undefined>;
	getTabSupport(tabId: string): Promise<Record<string, AppPreviewScenarioSupportStatus>>;
	cleanupScenarioArtifacts(repository?: URI): Promise<IAppPreviewScenarioCleanupResult>;
	registerAppPreviewModel(model: IBrowserViewModel): void;
	applyScenarioToTab(tabId: string): Promise<void>;
}

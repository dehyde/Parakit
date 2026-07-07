/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IActionListDelegate, IActionListItem } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { ResolveSessionConfigResult, SessionConfigPropertySchema, SessionConfigValueItem } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IAgentHostSessionsProvider } from '../../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../../../../services/sessions/common/sessionsProvider.js';
import { IWorkbenchLayoutService } from '../../../../../../workbench/services/layout/browser/layoutService.js';
import { AgentHostSessionConfigPicker, IConfigPickerItem } from '../../browser/agentHostSessionConfigPicker.js';

const PROVIDER_ID = 'local-agent-host';
const SESSION_ID = 'local-agent-host:s1';

function branchSchema(): SessionConfigPropertySchema {
	return {
		title: 'Branch',
		description: 'Base branch',
		type: 'string',
		enumDynamic: true,
		sessionMutable: true,
	} as SessionConfigPropertySchema;
}

function makeConfig(value = 'main'): ResolveSessionConfigResult {
	return {
		schema: {
			type: 'object',
			properties: {
				[SessionConfigKey.Branch]: branchSchema(),
			},
		},
		values: { [SessionConfigKey.Branch]: value },
	} as ResolveSessionConfigResult;
}

class FakeProvider implements Pick<IAgentHostSessionsProvider, 'id' | 'onDidChangeSessionConfig' | 'getSessionConfig' | 'getCreateSessionConfig' | 'getSessionConfigCompletions' | 'setSessionConfigValue' | 'isSessionConfigResolving'> {
	readonly id = PROVIDER_ID;
	private readonly _onDidChange = new Emitter<string>();
	readonly onDidChangeSessionConfig: Event<string> = this._onDidChange.event;
	config = makeConfig();
	readonly queries: Array<string | undefined> = [];

	getSessionConfig(_sessionId: string): ResolveSessionConfigResult {
		return this.config;
	}

	getCreateSessionConfig(_sessionId: string): undefined {
		return undefined;
	}

	async getSessionConfigCompletions(_sessionId: string, _property: string, query?: string): Promise<SessionConfigValueItem[]> {
		this.queries.push(query);
		if (query) {
			return [{ value: query, label: `Create ${query}`, description: 'Create branch' }];
		}
		return [
			{ value: 'main', label: 'main' },
			{ value: 'develop', label: 'develop' },
		];
	}

	isSessionConfigResolving(_sessionId: string) {
		return constObservable(false);
	}

	async setSessionConfigValue(): Promise<void> { }

	fireChange(): void {
		this._onDidChange.fire(SESSION_ID);
	}

	dispose(): void {
		this._onDidChange.dispose();
	}
}

class FakeActionWidgetService implements Partial<IActionWidgetService> {
	declare readonly _serviceBrand: undefined;
	isVisible = false;
	showCount = 0;
	updateCount = 0;
	items: readonly IActionListItem<IConfigPickerItem>[] = [];
	delegate: IActionListDelegate<IConfigPickerItem> | undefined;
	options: { showFilter?: boolean; focusFilterOnOpen?: boolean } | undefined;

	show<T>(_user: string, _supportsPreview: boolean, items: readonly IActionListItem<T>[], delegate: IActionListDelegate<T>, _anchor: unknown, _container: unknown, _actionBarActions: readonly unknown[] | undefined, _accessibilityProvider: unknown, listOptions?: { showFilter?: boolean; focusFilterOnOpen?: boolean }): void {
		this.isVisible = true;
		this.showCount++;
		this.items = items as readonly IActionListItem<IConfigPickerItem>[];
		this.delegate = delegate as IActionListDelegate<IConfigPickerItem>;
		this.options = listOptions ? { showFilter: listOptions.showFilter, focusFilterOnOpen: listOptions.focusFilterOnOpen } : undefined;
	}

	updateItems<T>(items: readonly IActionListItem<T>[]): void {
		this.updateCount++;
		this.items = items as readonly IActionListItem<IConfigPickerItem>[];
	}

	hide(): void {
		this.isVisible = false;
	}

	focusItemById(): void { }
}

suite('AgentHostSessionConfigPicker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('refreshes an open dynamic branch picker in place and preserves the active query', async () => {
		const provider = new FakeProvider();
		store.add({ dispose: () => provider.dispose() });
		const actionWidgetService = new FakeActionWidgetService();
		const onDidChangeProviders = store.add(new Emitter<ISessionsProvidersChangeEvent>());
		const sessionObs = observableValue<IActiveSession | undefined>('activeSession', { providerId: PROVIDER_ID, sessionId: SESSION_ID } as IActiveSession);
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IActionWidgetService, actionWidgetService as IActionWidgetService);
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IContextKeyService, store.add(new MockContextKeyService()));
		instantiationService.stub(IDialogService, {} as IDialogService);
		instantiationService.stub(IHoverService, { setupDelayedHover: () => ({ dispose: () => { } }) } as Partial<IHoverService> as IHoverService);
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IWorkbenchLayoutService, {
			mainContainer: document.body,
		} as Partial<IWorkbenchLayoutService> as IWorkbenchLayoutService);
		instantiationService.stub(ISessionsProvidersService, new (class extends mock<ISessionsProvidersService>() {
			override readonly onDidChangeProviders = onDidChangeProviders.event;
			override getProviders(): ISessionsProvider[] { return [provider as unknown as ISessionsProvider]; }
			override getProvider<T extends ISessionsProvider>(id: string): T | undefined {
				return id === provider.id ? provider as unknown as T : undefined;
			}
		})());

		const picker = store.add(instantiationService.createInstance(AgentHostSessionConfigPicker, sessionObs));
		const container = document.createElement('div');
		store.add({ dispose: () => container.remove() });
		document.body.append(container);
		picker.render(container);

		container.querySelector<HTMLElement>('a.action-label')?.click();
		await timeout(0);
		assert.strictEqual(actionWidgetService.showCount, 1);
		assert.deepStrictEqual(actionWidgetService.options, {
			showFilter: true,
			focusFilterOnOpen: true,
		});

		const filteredItems = await actionWidgetService.delegate?.onFilter?.('feature/local-only', { isCancellationRequested: false, onCancellationRequested: Event.None });
		assert.ok(filteredItems?.some(item => item.item?.value === 'feature/local-only'));

		provider.config = makeConfig('develop');
		provider.fireChange();
		await timeout(250);

		assert.deepStrictEqual({
			showCount: actionWidgetService.showCount,
			updateCount: actionWidgetService.updateCount,
			latestQuery: provider.queries.at(-1),
			itemValues: actionWidgetService.items.map(item => item.item?.value),
		}, {
			showCount: 1,
			updateCount: 1,
			latestQuery: 'feature/local-only',
			itemValues: ['feature/local-only'],
		});
	});
});

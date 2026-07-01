/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { timeout } from '../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry, ICommandEvent, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ConfirmResult, IFileDialogService, IOpenDialogOptions, IPickAndOpenOptions, ISaveDialogOptions } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { IWorkspaceTrustRequestService, WorkspaceTrustRequestOptions, WorkspaceTrustUriResponse } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { DesignerBranchSwitcher } from '../../../../browser/parts/designerBranchSwitcher/designerBranchSwitcher.js';

suite('DesignerBranchSwitcher', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createSwitcher(parent: HTMLElement, commandService: ICommandService, dialogService = new TestDialogService(), trustService: IWorkspaceTrustRequestService = new StaticWorkspaceTrustRequestService(true), fileDialogService: IFileDialogService = new RecordingFileDialogService()): DesignerBranchSwitcher {
		return new DesignerBranchSwitcher(parent, commandService, dialogService, trustService, fileDialogService);
	}

	function getOpenDropdown(): HTMLElement {
		const dropdown = [...document.body.querySelectorAll('.designer-branch-switcher__dropdown')]
			.find(dropdown => !(dropdown as HTMLElement).hidden) as HTMLElement | undefined;
		assert.ok(dropdown, 'Expected open designer branch switcher dropdown');
		assert.strictEqual(dropdown.hidden, false);
		return dropdown;
	}

	function getVisibleDropdown(): HTMLElement | undefined {
		return [...document.body.querySelectorAll('.designer-branch-switcher__dropdown')]
			.find(dropdown => !(dropdown as HTMLElement).hidden) as HTMLElement | undefined;
	}

	test('updates from fallback branch label after startup branch state becomes available', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		const commandService = new RetryingBranchCommandService();
		disposables.add(createSwitcher(parent, commandService));

		assert.strictEqual(parent.querySelector('.designer-branch-switcher__project')?.textContent, 'Project');
		assert.strictEqual(parent.querySelector('.designer-branch-switcher__branch')?.textContent, 'Loading branch information...');

		await timeout(650);

		assert.strictEqual(parent.querySelector('.designer-branch-switcher__project')?.textContent, 'VSCode Fork');
		assert.strictEqual(parent.querySelector('.designer-branch-switcher__branch')?.textContent, 'design/test1');
		assert.ok(commandService.calls >= 2);
	});

	test('retries quietly while startup repository state is still loading', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		const commandService = new LoadingRepositoryCommandService();
		disposables.add(createSwitcher(parent, commandService));

		await timeout(0);

		assert.strictEqual(parent.querySelector('.designer-branch-switcher__project')?.textContent, 'repo-a');
		assert.strictEqual(parent.querySelector('.designer-branch-switcher__branch')?.textContent, 'Loading branch information...');

		await timeout(650);

		assert.strictEqual(parent.querySelector('.designer-branch-switcher__project')?.textContent, 'repo-a');
		assert.strictEqual(parent.querySelector('.designer-branch-switcher__branch')?.textContent, 'main');
		assert.strictEqual(parent.querySelector('.designer-branch-switcher__problem'), null);
		assert.ok(commandService.branchCalls >= 2);
	});

	test('renders repo and branch as separate controls', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		disposables.add(createSwitcher(parent, new DesignerSwitcherCommandService()));

		await timeout(0);

		assert.strictEqual(parent.querySelector('.designer-branch-switcher__repo-button')?.textContent?.trim(), 'VSCode Fork');
		assert.strictEqual(parent.querySelector('.designer-branch-switcher__branch-button')?.textContent?.trim(), 'design/test1');
	});

	test('updates branch control from live git branch state', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		disposables.add(createSwitcher(parent, new DesignerSwitcherCommandService()));

		await timeout(0);

		assert.strictEqual(parent.querySelector('.designer-branch-switcher__branch-button')?.textContent?.includes('design/test1'), true);

		CommandsRegistry.getCommand('_designerBranches.didChangeState')?.handler(undefined!, {
			projectName: 'VSCode Fork',
			defaultBranch: 'main',
			currentBranch: 'design/live-update',
			syncState: 'synced',
			repositoryReady: true,
			branches: [],
			tree: []
		});

		await timeout(0);

		assert.strictEqual(parent.querySelector('.designer-branch-switcher__branch-button')?.textContent?.includes('design/live-update'), true);
	});

	test('shows cloud problem icon and tooltip from git branch state', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		disposables.add(createSwitcher(parent, new CloudProblemCommandService()));

		await timeout(0);

		const activeIcon = parent.querySelector('.designer-branch-switcher__sync.codicon-cloud') as HTMLElement;
		assert.ok(activeIcon);
		assert.strictEqual(activeIcon.title, 'Remote rejected the push');

		(parent.querySelector('.designer-branch-switcher__branch-button') as HTMLButtonElement).click();
		await timeout(20);

		const badge = getOpenDropdown().querySelector('.designer-branch-switcher__badge--cloud-problem') as HTMLElement;
		assert.ok(badge);
		assert.strictEqual(badge.title, 'Remote rejected the push');
	});

	test('sizes repo control to its content instead of a fixed share', async () => {
		const parent = document.createElement('div');
		parent.style.position = 'absolute';
		parent.style.width = '420px';
		parent.style.height = '34px';
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		disposables.add(createSwitcher(parent, new DesignerSwitcherCommandService()));

		await timeout(0);

		const repoButton = parent.querySelector('.designer-branch-switcher__repo-button') as HTMLButtonElement;
		const branchButton = parent.querySelector('.designer-branch-switcher__branch-button') as HTMLButtonElement;
		const repoRect = repoButton.getBoundingClientRect();
		const branchRect = branchButton.getBoundingClientRect();

		assert.ok(repoRect.width < 150, `Expected repo control to fit content, got ${repoRect.width}px`);
		assert.ok(branchRect.left - repoRect.right < 12, 'Expected branch control to stay adjacent to repo control');
	});

	test('opens branch browser from branch control', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		disposables.add(createSwitcher(parent, new DesignerSwitcherCommandService()));

		await timeout(0);
		(parent.querySelector('.designer-branch-switcher__branch-button') as HTMLButtonElement).click();
		await timeout(20);

		const dropdown = getOpenDropdown();
		assert.ok(dropdown.querySelector('.designer-branch-switcher__filter-input'));
		assert.strictEqual(dropdown.querySelector('.designer-branch-switcher__repo-url-input'), null);
	});

	test('keeps local branch rows visible when remote branch refresh fails', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		disposables.add(createSwitcher(parent, new FailingRemoteRefreshCommandService()));

		await timeout(0);
		(parent.querySelector('.designer-branch-switcher__branch-button') as HTMLButtonElement).click();
		await timeout(20);

		const dropdown = getOpenDropdown();
		assert.strictEqual(dropdown.querySelector('.designer-branch-switcher__problem')?.textContent?.includes('Remote branch refresh failed'), true);
		assert.strictEqual([...dropdown.querySelectorAll('.designer-branch-switcher__row-label')].some(label => label.textContent === 'test1'), true);
		assert.strictEqual(dropdown.querySelector('.designer-branch-switcher__empty')?.textContent === 'Loading branches...', false);
	});

	test('positions branch browser as viewport popup', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		disposables.add(createSwitcher(parent, new DesignerSwitcherCommandService()));

		await timeout(0);
		const branchButton = parent.querySelector('.designer-branch-switcher__branch-button') as HTMLButtonElement;
		branchButton.getBoundingClientRect = () => ({
			x: 24,
			y: 42,
			width: 132,
			height: 22,
			top: 42,
			right: 156,
			bottom: 64,
			left: 24,
			toJSON: () => undefined
		});
		branchButton.click();
		await timeout(20);

		const dropdown = getOpenDropdown();
		assert.strictEqual(dropdown.parentElement, document.body);
		assert.strictEqual(parent.contains(dropdown), false);
		assert.deepStrictEqual({
			position: dropdown.style.position,
			left: dropdown.style.left,
			top: dropdown.style.top,
			right: dropdown.style.right,
			width: dropdown.style.width,
		}, {
			position: 'fixed',
			left: '24px',
			top: '68px',
			right: 'auto',
			width: '320px',
		});
	});

	test('closes branch browser when the window blurs', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		disposables.add(createSwitcher(parent, new DesignerSwitcherCommandService()));

		await timeout(0);
		const branchButton = parent.querySelector('.designer-branch-switcher__branch-button') as HTMLButtonElement;
		branchButton.click();
		await timeout(20);

		const dropdown = getOpenDropdown();
		window.dispatchEvent(new FocusEvent('blur'));
		await timeout(0);

		assert.strictEqual(dropdown.hidden, true);
		assert.strictEqual(dropdown.parentElement, parent.querySelector('.designer-branch-switcher'));
		assert.strictEqual(branchButton.getAttribute('aria-expanded'), 'false');
	});

	test('keeps branch browser open through transient focus loss while opening', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		disposables.add(createSwitcher(parent, new DesignerSwitcherCommandService()));

		await timeout(0);
		const branchButton = parent.querySelector('.designer-branch-switcher__branch-button') as HTMLButtonElement;
		branchButton.focus();
		branchButton.click();
		branchButton.blur();
		branchButton.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
		await timeout(20);

		assert.ok(getOpenDropdown().querySelector('.designer-branch-switcher__filter-input'));
		assert.strictEqual(branchButton.getAttribute('aria-expanded'), 'true');
	});

	test('opens repo browser from repo control', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		disposables.add(createSwitcher(parent, new DesignerSwitcherCommandService()));

		await timeout(0);
		(parent.querySelector('.designer-branch-switcher__repo-button') as HTMLButtonElement).click();
		await timeout(0);

		const dropdown = getOpenDropdown();
		assert.strictEqual(dropdown.querySelector('.designer-branch-switcher__repo-row')?.textContent?.includes('VSCode Fork'), true);
		const input = dropdown.querySelector('.designer-branch-switcher__repo-source-input') as HTMLInputElement;
		assert.ok(input);
		assert.strictEqual(input.placeholder, 'Add repo URL or local folder');
		assert.ok(dropdown.querySelector('.designer-branch-switcher__repo-source-folder'));
		assert.strictEqual((dropdown.querySelector('.designer-branch-switcher__repo-add') as HTMLButtonElement).disabled, true);
		assert.strictEqual(dropdown.querySelector('.designer-branch-switcher__filter-input'), null);
	});

	test('closes branch dropdown and shows immediate save state when switching branches', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		const commandService = new SlowBranchSwitchCommandService();
		disposables.add(createSwitcher(parent, commandService));

		await timeout(0);
		(parent.querySelector('.designer-branch-switcher__branch-button') as HTMLButtonElement).click();
		await timeout(20);

		const dropdown = getOpenDropdown();
		const mainBranch = [...dropdown.querySelectorAll('.designer-branch-switcher__row')]
			.find(row => row.textContent?.includes('main')) as HTMLButtonElement;
		mainBranch.click();
		await timeout(0);

		assert.strictEqual(getVisibleDropdown(), undefined);
		assert.strictEqual(parent.querySelector('.designer-branch-switcher__branch-button')?.textContent?.includes('Switching to main'), true);

		commandService.resolveSwitch();
		await timeout(0);
	});

	test('keeps branch dropdown closed with recovery actions under selector when cloud save is blocked', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		disposables.add(createSwitcher(parent, new BlockedBranchSwitchCommandService()));

		await timeout(0);
		(parent.querySelector('.designer-branch-switcher__branch-button') as HTMLButtonElement).click();
		await timeout(20);

		let dropdown = getOpenDropdown();
		const mainBranch = [...dropdown.querySelectorAll('.designer-branch-switcher__row')]
			.find(row => row.textContent?.includes('main')) as HTMLButtonElement;
		mainBranch.click();
		await timeout(0);

		assert.strictEqual(getVisibleDropdown(), undefined);
		assert.strictEqual(parent.querySelector('.designer-branch-switcher__branch-button')?.textContent?.includes('Couldn’t switch to main'), true);
		const status = parent.querySelector('.designer-branch-switcher__status') as HTMLElement;
		assert.ok(status);
		assert.strictEqual(status.textContent?.includes('Could not save to cloud'), true);
		assert.strictEqual(status.querySelector('.designer-branch-switcher__problem-action--retry')?.textContent, 'Retry save');
		assert.strictEqual(status.querySelector('.designer-branch-switcher__problem-action--switch')?.textContent, 'Switch without saving');
		assert.strictEqual(status.querySelector('.designer-branch-switcher__problem-action--copy')?.textContent, 'Copy issue for agent');
	});

	test('blocks app source repo branch switching without retry actions', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		disposables.add(createSwitcher(parent, new UnsafeHostBranchSwitchCommandService()));

		await timeout(0);
		(parent.querySelector('.designer-branch-switcher__branch-button') as HTMLButtonElement).click();
		await timeout(20);

		let dropdown = getOpenDropdown();
		const mainBranch = [...dropdown.querySelectorAll('.designer-branch-switcher__row')]
			.find(row => row.textContent?.includes('main')) as HTMLButtonElement;
		mainBranch.click();
		await timeout(0);

		assert.strictEqual(getVisibleDropdown(), undefined);
		const status = parent.querySelector('.designer-branch-switcher__status') as HTMLElement;
		assert.ok(status);
		assert.strictEqual(status.textContent?.includes('This project is running the app'), true);
		assert.strictEqual(status.querySelector('.designer-branch-switcher__problem-action--retry'), null);
		assert.strictEqual(status.querySelector('.designer-branch-switcher__problem-action--switch'), null);
		assert.strictEqual(status.querySelector('.designer-branch-switcher__problem-action--copy'), null);
		assert.ok(status.querySelector('.designer-branch-switcher__problem-dismiss'));
	});

	test('switch without saving uses explicit branch bypass command', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		const commandService = new BlockedBranchSwitchCommandService();
		disposables.add(createSwitcher(parent, commandService));

		await timeout(0);
		(parent.querySelector('.designer-branch-switcher__branch-button') as HTMLButtonElement).click();
		await timeout(20);

		let dropdown = getOpenDropdown();
		const mainBranch = [...dropdown.querySelectorAll('.designer-branch-switcher__row')]
			.find(row => row.textContent?.includes('main')) as HTMLButtonElement;
		mainBranch.click();
		await timeout(0);

		const switchWithoutSaving = parent.querySelector('.designer-branch-switcher__problem-action--switch') as HTMLButtonElement;
		assert.ok(switchWithoutSaving);
		switchWithoutSaving.click();
		await timeout(0);

		assert.deepStrictEqual(commandService.checkoutWithoutSavingRequests, ['main']);
	});

	test('repo switch uses save-first command and shows immediate save state', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		const commandService = new SlowRepoSwitchCommandService();
		disposables.add(createSwitcher(parent, commandService));

		await timeout(0);
		(parent.querySelector('.designer-branch-switcher__repo-button') as HTMLButtonElement).click();
		await timeout(0);

		const targetRepo = [...getOpenDropdown().querySelectorAll('.designer-branch-switcher__repo-row')]
			.find(row => row.textContent?.includes('Other Repo')) as HTMLElement;
		targetRepo.click();
		await timeout(0);

		assert.strictEqual(getVisibleDropdown(), undefined);
		assert.strictEqual(parent.querySelector('.designer-branch-switcher__repo-button')?.textContent?.includes('Switching to Other Repo'), true);
		assert.deepStrictEqual(commandService.saveAndSwitchRequests, ['/workspace/other-repo']);

		commandService.resolveSwitch();
		await timeout(0);
	});

	test('adds pasted repo URL from repo browser', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		const commandService = new DesignerSwitcherCommandService();
		disposables.add(createSwitcher(parent, commandService));

		await timeout(0);
		(parent.querySelector('.designer-branch-switcher__repo-button') as HTMLButtonElement).click();
		await timeout(0);

		let dropdown = getOpenDropdown();
		const input = dropdown.querySelector('.designer-branch-switcher__repo-source-input') as HTMLInputElement;
		input.value = 'https://github.com/workplan/design-system.git';
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		(dropdown.querySelector('.designer-branch-switcher__repo-add') as HTMLButtonElement).click();
		await timeout(10);

		assert.deepStrictEqual(commandService.addSources, ['https://github.com/workplan/design-system.git']);
		dropdown = getOpenDropdown();
		assert.strictEqual([...dropdown.querySelectorAll('.designer-branch-switcher__repo-row')].some(row => row.textContent?.includes('Design System')), true);
	});

	test('folder picker fills repo source input without submitting', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		const commandService = new DesignerSwitcherCommandService();
		const fileDialogService = new RecordingFileDialogService([URI.file('/workspace/local-app')]);
		disposables.add(createSwitcher(parent, commandService, new TestDialogService(), new StaticWorkspaceTrustRequestService(true), fileDialogService));

		await timeout(0);
		(parent.querySelector('.designer-branch-switcher__repo-button') as HTMLButtonElement).click();
		await timeout(0);

		const dropdown = getOpenDropdown();
		(dropdown.querySelector('.designer-branch-switcher__repo-source-folder') as HTMLButtonElement).click();
		await timeout(0);

		assert.strictEqual((dropdown.querySelector('.designer-branch-switcher__repo-source-input') as HTMLInputElement).value, '/workspace/local-app');
		assert.strictEqual((dropdown.querySelector('.designer-branch-switcher__repo-add') as HTMLButtonElement).disabled, false);
		assert.deepStrictEqual(commandService.addSources, []);
	});

	test('adds selected local folder path from repo browser', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		const commandService = new DesignerSwitcherCommandService();
		disposables.add(createSwitcher(parent, commandService));

		await timeout(0);
		(parent.querySelector('.designer-branch-switcher__repo-button') as HTMLButtonElement).click();
		await timeout(0);

		const dropdown = getOpenDropdown();
		const input = dropdown.querySelector('.designer-branch-switcher__repo-source-input') as HTMLInputElement;
		input.value = '/workspace/local-app';
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		(dropdown.querySelector('.designer-branch-switcher__repo-add') as HTMLButtonElement).click();
		await timeout(10);

		assert.deepStrictEqual(commandService.addSources, ['/workspace/local-app']);
	});

	test('shows inline error when repo source add fails', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		disposables.add(createSwitcher(parent, new FailingAddSourceCommandService()));

		await timeout(0);
		(parent.querySelector('.designer-branch-switcher__repo-button') as HTMLButtonElement).click();
		await timeout(0);

		const dropdown = getOpenDropdown();
		const input = dropdown.querySelector('.designer-branch-switcher__repo-source-input') as HTMLInputElement;
		input.value = '/missing/repo';
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		(dropdown.querySelector('.designer-branch-switcher__repo-add') as HTMLButtonElement).click();
		await timeout(10);

		assert.strictEqual(getOpenDropdown().querySelector('.designer-branch-switcher__problem')?.textContent?.includes('Folder could not be found'), true);
	});

	test('renders non-git setup action and connects current folder to remote', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		const commandService = new NonGitFolderCommandService();
		disposables.add(createSwitcher(parent, commandService));

		await timeout(0);
		(parent.querySelector('.designer-branch-switcher__branch-button') as HTMLButtonElement).click();
		await timeout(20);

		const connect = getOpenDropdown().querySelector('.designer-branch-switcher__setup-action--connect') as HTMLButtonElement;
		assert.ok(connect);
		connect.click();
		await timeout(10);

		assert.strictEqual(commandService.connectRequests, 1);
	});

	test('keeps existing repos visible when adding another repo', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		disposables.add(createSwitcher(parent, new ReplacingCloneRepoCommandService()));

		await timeout(0);
		(parent.querySelector('.designer-branch-switcher__repo-button') as HTMLButtonElement).click();
		await timeout(0);

		let dropdown = getOpenDropdown();
		const input = dropdown.querySelector('.designer-branch-switcher__repo-source-input') as HTMLInputElement;
		input.value = 'https://github.com/workplan/new-repo.git';
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		(dropdown.querySelector('.designer-branch-switcher__repo-add') as HTMLButtonElement).click();
		await timeout(10);

		dropdown = getOpenDropdown();
		const repoRows = [...dropdown.querySelectorAll('.designer-branch-switcher__repo-row')].map(row => row.textContent ?? '');
		assert.strictEqual(repoRows.some(row => row.includes('Current Repo')), true);
		assert.strictEqual(repoRows.some(row => row.includes('Existing Repo')), true);
		assert.strictEqual(repoRows.some(row => row.includes('New Repo')), true);
	});

	test('removes repo from list after confirmation', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		const commandService = new RemovableRepoCommandService();
		disposables.add(createSwitcher(parent, commandService));

		await timeout(0);
		(parent.querySelector('.designer-branch-switcher__repo-button') as HTMLButtonElement).click();
		await timeout(0);

		(getOpenDropdown().querySelector('.designer-branch-switcher__repo-remove') as HTMLButtonElement).click();
		await timeout(10);

		assert.deepStrictEqual(commandService.removeRequests, [{ repoPath: '/workspace/old-repo', deleteLocalFiles: false }]);
		const repoRows = [...getOpenDropdown().querySelectorAll('.designer-branch-switcher__repo-row')].map(row => row.textContent ?? '');
		assert.strictEqual(repoRows.some(row => row.includes('Old Repo')), false);
	});

	test('can remove repo and delete local files after confirmation', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		const commandService = new RemovableRepoCommandService();
		const dialogService = new TestDialogService(undefined, { result: 'delete' });
		disposables.add(createSwitcher(parent, commandService, dialogService));

		await timeout(0);
		(parent.querySelector('.designer-branch-switcher__repo-button') as HTMLButtonElement).click();
		await timeout(0);

		(getOpenDropdown().querySelector('.designer-branch-switcher__repo-remove') as HTMLButtonElement).click();
		await timeout(10);

		assert.deepStrictEqual(commandService.removeRequests, [{ repoPath: '/workspace/old-repo', deleteLocalFiles: true }]);
	});

	test('shows project access action when designer git commands are unavailable', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		const commandService = new RestrictedModeCommandService();
		const trustService = new RecordingWorkspaceTrustRequestService(() => commandService.trusted = true);
		disposables.add(createSwitcher(parent, commandService, new TestDialogService(), trustService));

		await timeout(0);
		(parent.querySelector('.designer-branch-switcher__branch-button') as HTMLButtonElement).click();
		await timeout(20);

		let dropdown = getOpenDropdown();
		assert.strictEqual(dropdown.querySelector('.designer-branch-switcher__problem')?.textContent?.includes('Project access is limited'), true);
		assert.strictEqual(dropdown.querySelector('.designer-branch-switcher__problem-action--trust')?.textContent, 'Allow this project');

		(dropdown.querySelector('.designer-branch-switcher__problem-action--trust') as HTMLButtonElement).click();
		await timeout(20);

		assert.strictEqual(trustService.requests, 1);
		assert.strictEqual(parent.querySelector('.designer-branch-switcher__branch-button')?.textContent?.includes('design/test1'), true);
		dropdown = getOpenDropdown();
		assert.strictEqual(dropdown.querySelector('.designer-branch-switcher__problem'), null);
	});

	test('repo rows use separate controls instead of nested buttons', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		disposables.add(createSwitcher(parent, new RemovableRepoCommandService()));

		await timeout(0);
		(parent.querySelector('.designer-branch-switcher__repo-button') as HTMLButtonElement).click();
		await timeout(0);

		const oldRepoRow = [...getOpenDropdown().querySelectorAll('.designer-branch-switcher__repo-row')]
			.find(row => row.textContent?.includes('Old Repo')) as HTMLElement;

		assert.strictEqual(oldRepoRow.tagName, 'DIV');
		assert.strictEqual(oldRepoRow.querySelectorAll('button').length, 2);
		assert.ok(oldRepoRow.querySelector('.designer-branch-switcher__repo-open'));
		assert.ok(oldRepoRow.querySelector('.designer-branch-switcher__repo-remove'));
	});

	test('opening branch dropdown during startup refresh still requests remote refresh', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		const commandService = new DeferredStartupRefreshCommandService();
		disposables.add(createSwitcher(parent, commandService));

		await timeout(0);
		(parent.querySelector('.designer-branch-switcher__branch-button') as HTMLButtonElement).click();
		await timeout(0);
		commandService.resolveInitialRefresh();
		await timeout(20);

		assert.deepStrictEqual(commandService.branchRefreshRequests, [
			{ updateRemotes: false },
			{ updateRemotes: true }
		]);
	});

	test('keeps branch search input mounted and focused while typing', async () => {
		const parent = document.createElement('div');
		disposables.add({ dispose: () => parent.remove() });
		document.body.appendChild(parent);

		disposables.add(createSwitcher(parent, new DesignerSwitcherCommandService()));

		await timeout(0);
		(parent.querySelector('.designer-branch-switcher__branch-button') as HTMLButtonElement).click();
		await timeout(20);

		const input = getOpenDropdown().querySelector('.designer-branch-switcher__filter-input') as HTMLInputElement;
		input.focus();
		input.value = 'ma';
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		await timeout(20);

		assert.strictEqual(getOpenDropdown().querySelector('.designer-branch-switcher__filter-input'), input);
		assert.strictEqual(document.activeElement, input);
		assert.strictEqual([...getOpenDropdown().querySelectorAll('.designer-branch-switcher__row-label')].some(row => row.textContent === 'main'), true);
	});
});

class RetryingBranchCommandService implements ICommandService {
	declare readonly _serviceBrand: undefined;

	private readonly _onWillExecuteCommand = new Emitter<ICommandEvent>();
	readonly onWillExecuteCommand: Event<ICommandEvent> = this._onWillExecuteCommand.event;

	private readonly _onDidExecuteCommand = new Emitter<ICommandEvent>();
	readonly onDidExecuteCommand: Event<ICommandEvent> = this._onDidExecuteCommand.event;

	private _calls = 0;
	get calls(): number {
		return this._calls;
	}

	async executeCommand<T>(commandId: string): Promise<T | undefined> {
		this._calls++;

		if (commandId !== '_designerBranches.getState') {
			throw new Error(`Unexpected command: ${commandId}`);
		}

		if (this._calls === 1) {
			throw new Error('Git repository is not ready yet.');
		}

		return {
			projectName: 'VSCode Fork',
			defaultBranch: 'main',
			currentBranch: 'design/test1',
			syncState: 'synced',
			branches: [],
			tree: []
		} as T;
	}
}

class LoadingRepositoryCommandService implements ICommandService {
	declare readonly _serviceBrand: undefined;

	private readonly _onWillExecuteCommand = new Emitter<ICommandEvent>();
	readonly onWillExecuteCommand: Event<ICommandEvent> = this._onWillExecuteCommand.event;

	private readonly _onDidExecuteCommand = new Emitter<ICommandEvent>();
	readonly onDidExecuteCommand: Event<ICommandEvent> = this._onDidExecuteCommand.event;

	private _calls = 0;
	get calls(): number {
		return this._calls;
	}
	private _branchCalls = 0;
	get branchCalls(): number {
		return this._branchCalls;
	}

	async executeCommand<T>(commandId: string): Promise<T | undefined> {
		this._calls++;

		if (commandId !== '_designerBranches.getState' && commandId !== '_designerRepos.getState') {
			throw new Error(`Unexpected command: ${commandId}`);
		}

		if (commandId === '_designerRepos.getState') {
			return {
				currentRepoPath: '/workspace/repo-a',
				repos: [
					{ name: 'repo-a', path: '/workspace/repo-a', status: 'ready', isCurrent: true },
				]
			} as T;
		}

		this._branchCalls++;

		if (this._branchCalls === 1) {
			return {
				projectName: 'repo-a',
				defaultBranch: undefined,
				currentBranch: undefined,
				syncState: 'syncing',
				repositoryReady: false,
				branches: [],
				tree: []
			} as T;
		}

		return {
			projectName: 'repo-a',
			defaultBranch: 'main',
			currentBranch: 'main',
			syncState: 'synced',
			repositoryReady: true,
			branches: [],
			tree: []
		} as T;
	}
}

class DesignerSwitcherCommandService implements ICommandService {
	declare readonly _serviceBrand: undefined;

	private readonly _onWillExecuteCommand = new Emitter<ICommandEvent>();
	readonly onWillExecuteCommand: Event<ICommandEvent> = this._onWillExecuteCommand.event;

	private readonly _onDidExecuteCommand = new Emitter<ICommandEvent>();
	readonly onDidExecuteCommand: Event<ICommandEvent> = this._onDidExecuteCommand.event;

	readonly addSources: string[] = [];

	async executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
		if (commandId === '_designerBranches.getState') {
			return {
				projectName: 'VSCode Fork',
				defaultBranch: 'main',
				currentBranch: 'design/test1',
				syncState: 'synced',
				branches: [
					{ name: 'main', path: ['main'], status: 'synced', isCurrent: false, isDefault: true },
					{ name: 'design/test1', path: ['design', 'test1'], status: 'synced', isCurrent: true, isDefault: false },
				],
				tree: [
					{ name: 'main', path: ['main'], branch: { name: 'main', path: ['main'], status: 'synced', isCurrent: false, isDefault: true }, children: [] },
					{ name: 'design', path: ['design'], children: [{ name: 'test1', path: ['design', 'test1'], branch: { name: 'design/test1', path: ['design', 'test1'], status: 'synced', isCurrent: true, isDefault: false }, children: [] }] },
				]
			} as T;
		}

		if (commandId === '_designerRepos.getState') {
			return {
				currentRepoPath: '/workspace/vscode-fork',
				repos: [
					{ name: 'VSCode Fork', path: '/workspace/vscode-fork', status: 'ready', isCurrent: true },
				]
			} as T;
		}

		if (commandId === '_designerRepos.addSource') {
			const source = (args[0] as { source: string }).source;
			this.addSources.push(source);
			return {
				currentRepoPath: '/workspace/vscode-fork',
				repos: [
					{ name: 'VSCode Fork', path: '/workspace/vscode-fork', status: 'ready', isCurrent: true },
					source === '/workspace/local-app'
						? { name: 'local-app', path: '/workspace/local-app', status: 'ready', isCurrent: false }
						: { name: 'Design System', path: '/workspace/design-system', status: 'ready', isCurrent: false },
				]
			} as T;
		}

		throw new Error(`Unexpected command: ${commandId}`);
	}
}

class DeferredStartupRefreshCommandService extends DesignerSwitcherCommandService {

	readonly branchRefreshRequests: { updateRemotes: boolean }[] = [];
	private initialRefreshResolver: (() => void) | undefined;
	private initialRefreshResolved = false;

	resolveInitialRefresh(): void {
		this.initialRefreshResolved = true;
		this.initialRefreshResolver?.();
	}

	override async executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
		if (commandId === '_designerBranches.getState') {
			const updateRemotes = (args[0] as { updateRemotes?: boolean } | undefined)?.updateRemotes === true;
			this.branchRefreshRequests.push({ updateRemotes });
			if (!this.initialRefreshResolved && !updateRemotes) {
				await new Promise<void>(resolve => this.initialRefreshResolver = resolve);
			}
		}

		return super.executeCommand(commandId, ...args);
	}
}

class FailingRemoteRefreshCommandService extends DesignerSwitcherCommandService {

	override async executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
		if (commandId === '_designerBranches.getState' && (args[0] as { updateRemotes?: boolean } | undefined)?.updateRemotes) {
			throw new Error('Remote branch refresh failed');
		}

		return super.executeCommand(commandId, ...args);
	}
}

class CloudProblemCommandService extends DesignerSwitcherCommandService {

	override async executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
		if (commandId === '_designerBranches.getState') {
			return {
				projectName: 'VSCode Fork',
				defaultBranch: 'main',
				currentBranch: 'design/test1',
				syncState: 'synced',
				repositoryReady: true,
				cloudProblem: { message: 'Remote rejected the push' },
				branches: [
					{ name: 'main', path: ['main'], status: 'synced', isCurrent: false, isDefault: true },
					{ name: 'design/test1', path: ['design', 'test1'], status: 'synced', isCurrent: true, isDefault: false, cloudProblem: { message: 'Remote rejected the push' } },
				],
				tree: [
					{ name: 'main', path: ['main'], branch: { name: 'main', path: ['main'], status: 'synced', isCurrent: false, isDefault: true }, children: [] },
					{ name: 'design', path: ['design'], children: [{ name: 'test1', path: ['design', 'test1'], branch: { name: 'design/test1', path: ['design', 'test1'], status: 'synced', isCurrent: true, isDefault: false, cloudProblem: { message: 'Remote rejected the push' } }, children: [] }] },
				]
			} as T;
		}

		return super.executeCommand(commandId, ...args);
	}
}

class SlowBranchSwitchCommandService extends DesignerSwitcherCommandService {

	private switchResolver: (() => void) | undefined;

	resolveSwitch(): void {
		this.switchResolver?.();
	}

	override async executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
		if (commandId === '_designerBranches.saveAndCheckout') {
			await new Promise<void>(resolve => this.switchResolver = resolve);
			const branchName = (args[0] as { branchName: string }).branchName;
			return {
				state: this.createBranchState(branchName),
				sync: {
					state: 'synced',
					targetBranch: branchName
				}
			} as T;
		}

		return super.executeCommand(commandId, ...args);
	}

	protected createBranchState(currentBranch: string): unknown {
		return {
			projectName: 'VSCode Fork',
			defaultBranch: 'main',
			currentBranch,
			syncState: 'synced',
			branches: [
				{ name: 'main', path: ['main'], status: 'synced', isCurrent: currentBranch === 'main', isDefault: true },
				{ name: 'design/test1', path: ['design', 'test1'], status: 'synced', isCurrent: currentBranch === 'design/test1', isDefault: false },
			],
			tree: [
				{ name: 'main', path: ['main'], branch: { name: 'main', path: ['main'], status: 'synced', isCurrent: currentBranch === 'main', isDefault: true }, children: [] },
				{ name: 'design', path: ['design'], children: [{ name: 'test1', path: ['design', 'test1'], branch: { name: 'design/test1', path: ['design', 'test1'], status: 'synced', isCurrent: currentBranch === 'design/test1', isDefault: false }, children: [] }] },
			]
		};
	}
}

class BlockedBranchSwitchCommandService extends SlowBranchSwitchCommandService {

	readonly checkoutWithoutSavingRequests: string[] = [];

	override async executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
		if (commandId === '_designerBranches.saveAndCheckout') {
			const branchName = (args[0] as { branchName: string }).branchName;
			return {
				state: this.createBranchState('design/test1'),
				blocked: {
					reason: 'pushRejected',
					message: 'Could not save to cloud'
				},
				sync: {
					state: 'blocked',
					message: 'Could not save to cloud',
					previousBranch: 'design/test1',
					targetBranch: branchName,
					agentPrompt: 'Resolve push rejection for design/test1'
				}
			} as T;
		}

		if (commandId === '_designerBranches.checkout') {
			this.checkoutWithoutSavingRequests.push((args[0] as { branchName: string; skipSave: boolean }).branchName);
			return {
				state: this.createBranchState((args[0] as { branchName: string }).branchName),
				sync: {
					state: 'synced'
				}
			} as T;
		}

		return super.executeCommand(commandId, ...args);
	}
}

class UnsafeHostBranchSwitchCommandService extends SlowBranchSwitchCommandService {

	override async executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
		if (commandId === '_designerBranches.saveAndCheckout') {
			return {
				state: this.createBranchState('design/test1'),
				blocked: {
					reason: 'unsafeHostRepository',
					message: 'This project is running the app.'
				},
				sync: {
					state: 'blocked',
					message: 'This project is running the app.',
					previousBranch: 'design/test1',
					targetBranch: (args[0] as { branchName: string }).branchName
				}
			} as T;
		}

		return super.executeCommand(commandId, ...args);
	}
}

class SlowRepoSwitchCommandService extends DesignerSwitcherCommandService {

	readonly saveAndSwitchRequests: string[] = [];
	private switchResolver: (() => void) | undefined;

	resolveSwitch(): void {
		this.switchResolver?.();
	}

	override async executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
		if (commandId === '_designerRepos.getState') {
			return {
				currentRepoPath: '/workspace/vscode-fork',
				repos: [
					{ name: 'VSCode Fork', path: '/workspace/vscode-fork', status: 'ready', isCurrent: true },
					{ name: 'Other Repo', path: '/workspace/other-repo', status: 'ready', isCurrent: false },
				]
			} as T;
		}

		if (commandId === '_designerRepos.saveAndSwitch') {
			const repoPath = (args[0] as { repoPath: string }).repoPath;
			this.saveAndSwitchRequests.push(repoPath);
			await new Promise<void>(resolve => this.switchResolver = resolve);
			return {
				state: {
					currentRepoPath: repoPath,
					repos: [
						{ name: 'VSCode Fork', path: '/workspace/vscode-fork', status: 'ready', isCurrent: false },
						{ name: 'Other Repo', path: '/workspace/other-repo', status: 'ready', isCurrent: true },
					]
				},
				sync: {
					state: 'synced',
					targetRepoPath: repoPath
				}
			} as T;
		}

		return super.executeCommand(commandId, ...args);
	}
}

class ReplacingCloneRepoCommandService extends DesignerSwitcherCommandService {

	override async executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
		if (commandId === '_designerRepos.getState') {
			return {
				currentRepoPath: '/workspace/current-repo',
				repos: [
					{ name: 'Current Repo', path: '/workspace/current-repo', status: 'ready', isCurrent: true },
					{ name: 'Existing Repo', path: '/workspace/existing-repo', status: 'ready', isCurrent: false },
				]
			} as T;
		}

		if (commandId === '_designerRepos.addSource') {
			this.addSources.push((args[0] as { source: string }).source);
			return {
				currentRepoPath: '/workspace/current-repo',
				repos: [
					{ name: 'New Repo', path: '/workspace/new-repo', status: 'ready', isCurrent: false },
				]
			} as T;
		}

		return super.executeCommand(commandId, ...args);
	}
}

class FailingAddSourceCommandService extends DesignerSwitcherCommandService {

	override async executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
		if (commandId === '_designerRepos.addSource') {
			throw new Error('Folder could not be found.');
		}

		return super.executeCommand(commandId, ...args);
	}
}

class NonGitFolderCommandService extends DesignerSwitcherCommandService {

	connectRequests = 0;

	override async executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
		if (commandId === '_designerBranches.getState') {
			return {
				projectName: 'Loose Folder',
				defaultBranch: undefined,
				currentBranch: undefined,
				syncState: 'problem',
				repositoryReady: false,
				setup: { reason: 'notGitRepository' },
				branches: [],
				tree: []
			} as T;
		}

		if (commandId === '_designerRepos.connectCurrentFolderToRemote') {
			this.connectRequests++;
			return {
				projectName: 'Loose Folder',
				defaultBranch: 'main',
				currentBranch: 'main',
				syncState: 'synced',
				repositoryReady: true,
				branches: [],
				tree: []
			} as T;
		}

		return super.executeCommand(commandId, ...args);
	}
}

class RemovableRepoCommandService extends DesignerSwitcherCommandService {

	readonly removeRequests: { repoPath: string; deleteLocalFiles: boolean }[] = [];

	override async executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
		if (commandId === '_designerRepos.getState') {
			return {
				currentRepoPath: '/workspace/current-repo',
				repos: [
					{ name: 'Current Repo', path: '/workspace/current-repo', status: 'ready', isCurrent: true },
					{ name: 'Old Repo', path: '/workspace/old-repo', status: 'ready', isCurrent: false },
				]
			} as T;
		}

		if (commandId === '_designerRepos.remove') {
			const request = args[0] as { repoPath: string; deleteLocalFiles: boolean };
			this.removeRequests.push(request);
			return {
				state: {
					currentRepoPath: '/workspace/current-repo',
					repos: [
						{ name: 'Current Repo', path: '/workspace/current-repo', status: 'ready', isCurrent: true },
					]
				}
			} as T;
		}

		return super.executeCommand(commandId, ...args);
	}
}

class RestrictedModeCommandService extends DesignerSwitcherCommandService {

	trusted = false;

	override async executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
		if (!this.trusted && (commandId === '_designerBranches.getState' || commandId === '_designerRepos.getState')) {
			throw new Error(`command '${commandId}' not found`);
		}

		return super.executeCommand(commandId, ...args);
	}
}

class StaticWorkspaceTrustRequestService implements IWorkspaceTrustRequestService {
	declare readonly _serviceBrand: undefined;

	readonly onDidInitiateOpenFilesTrustRequest = Event.None;
	readonly onDidInitiateResourcesTrustRequest = Event.None;
	readonly onDidInitiateWorkspaceTrustRequest = Event.None;
	readonly onDidInitiateWorkspaceTrustRequestOnStartup = Event.None;

	constructor(private readonly trusted: boolean) { }

	async requestOpenFilesTrust(): Promise<WorkspaceTrustUriResponse> {
		return WorkspaceTrustUriResponse.Open;
	}

	async completeOpenFilesTrustRequest(): Promise<void> { }

	async completeResourcesTrustRequest(): Promise<void> { }

	async requestResourcesTrust(): Promise<boolean | undefined> {
		return this.trusted;
	}

	cancelWorkspaceTrustRequest(): void { }

	async completeWorkspaceTrustRequest(): Promise<void> { }

	async requestWorkspaceTrust(): Promise<boolean | undefined> {
		return this.trusted;
	}

	requestWorkspaceTrustOnStartup(): void { }
}

class RecordingWorkspaceTrustRequestService extends StaticWorkspaceTrustRequestService {

	requests = 0;

	constructor(private readonly onRequest: () => void) {
		super(false);
	}

	override async requestWorkspaceTrust(options?: WorkspaceTrustRequestOptions): Promise<boolean> {
		this.requests++;
		this.onRequest();
		return true;
	}
}

class RecordingFileDialogService implements IFileDialogService {
	declare readonly _serviceBrand: undefined;

	constructor(private readonly openDialogResult: URI[] | undefined = undefined) { }

	async defaultFilePath(): Promise<URI> { return URI.file('/'); }
	async defaultFolderPath(): Promise<URI> { return URI.file('/'); }
	async defaultWorkspacePath(): Promise<URI> { return URI.file('/'); }
	async preferredHome(): Promise<URI> { return URI.file('/'); }
	async pickFileFolderAndOpen(_options: IPickAndOpenOptions): Promise<void> { }
	async pickFileAndOpen(_options: IPickAndOpenOptions): Promise<void> { }
	async pickFolderAndOpen(_options: IPickAndOpenOptions): Promise<void> { }
	async pickWorkspaceAndOpen(_options: IPickAndOpenOptions): Promise<void> { }
	async pickFileToSave(): Promise<URI | undefined> { return undefined; }
	async showSaveDialog(_options: ISaveDialogOptions): Promise<URI | undefined> { return undefined; }
	async showOpenDialog(_options: IOpenDialogOptions): Promise<URI[] | undefined> { return this.openDialogResult; }
	async showSaveConfirm(): Promise<ConfirmResult> { return ConfirmResult.CANCEL; }
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { adaptWorkbenchAppPreviewUrlToPort, applyWorkbenchAppPreviewDevPort, canStartWorkbenchAppPreviewServerWithoutInstall, classifyWorkbenchAppPreviewTerminalFailure, getWorkbenchAppPreviewClaudeReconciliationCommands, getWorkbenchAppPreviewDevConfigFixedPort, getWorkbenchAppPreviewHealthFetchMode, getWorkbenchAppPreviewServerStateAfterCommandExit, getWorkbenchAppPreviewServerStateAfterHealthTimeout, getWorkbenchAppPreviewStartupPageKey, hasWorkbenchAppPreviewPortTemplate, isWorkbenchAppPreviewManagedLocalUrl, isWorkbenchAppPreviewPathUnderRoot, isWorkbenchAppPreviewPortConflict, isWorkbenchAppPreviewUrlForBranch, normalizeWorkbenchAppPreviewLoopbackUrl, observeWorkbenchAppPreviewBranch, parseWorkbenchAppPreviewEnv, resolveWorkbenchAppPreviewAdvertisedUrl, resolveWorkbenchAppPreviewDiscoveredPortReconciliation, resolveWorkbenchAppPreviewHomeTargets, resolveWorkbenchAppPreviewInferredStartupUrl, resolveWorkbenchAppPreviewPreferredUrl, resolveWorkbenchAppPreviewStaticHtmlConfig, resolveWorkbenchAppPreviewUrlOnOrigin, selectWorkbenchAppPreviewStaticHtmlFile, shouldFallbackFromWorkbenchAppPreviewDevConfig, shouldIgnoreWorkbenchAppPreviewLoadEvent, shouldRestartWorkbenchAppPreviewAfterHealthFailures, shouldRestartWorkbenchAppPreviewAfterLoadError, shouldShowWorkbenchAppPreviewSetupBeforeServerStart, resolveWorkbenchAppPreviewDevConfig, resolveWorkbenchAppPreviewHeuristicDevConfig, resolveWorkbenchAppPreviewUrl, shouldForceNavigateWorkbenchAppPreview, shouldNavigateWorkbenchAppPreview, shouldRecoverWorkbenchAppPreviewLoadError } from '../../common/appPreviewConfig.js';
import { APP_PREVIEW_STARTUP_ANIMATION_SRC, createWorkbenchAppPreviewStartupDataUrl, getWorkbenchAppPreviewStartupTitle, WORKBENCH_APP_PREVIEW_STARTUP_HEALTH_TIMEOUT } from '../../common/appPreviewStartupPage.js';
import { getSerializableBrowserEditorInputData } from '../../common/browserEditorInput.js';

function decodeDataUrlHtml(dataUrl: string): string {
	const marker = 'data:text/html;base64,';
	assert.ok(dataUrl.startsWith(marker));
	return atob(dataUrl.slice(marker.length));
}

function decodeDataUrlSvg(dataUrl: string): string {
	const marker = 'data:image/svg+xml;base64,';
	assert.ok(dataUrl.startsWith(marker));
	return atob(dataUrl.slice(marker.length));
}

suite('Workbench App Preview', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('local branch override beats repo branch URL', () => {
		assert.strictEqual(resolveWorkbenchAppPreviewUrl({
			localBranchOverride: 'http://localhost:4000/local-branch',
			localDefaultOverride: 'http://localhost:4000/local-default',
			repoBranchUrl: 'http://localhost:3000/repo-branch',
			repoDefaultUrl: 'http://localhost:3000/repo-default',
			discoveredUrl: 'http://localhost:5173/'
		}), 'http://localhost:4000/local-branch');
	});

	test('local default override beats repo default URL', () => {
		assert.strictEqual(resolveWorkbenchAppPreviewUrl({
			localDefaultOverride: 'http://localhost:4000/local-default',
			repoDefaultUrl: 'http://localhost:3000/repo-default',
			discoveredUrl: 'http://localhost:5173/'
		}), 'http://localhost:4000/local-default');
	});

	test('repo branch URL beats repo default URL', () => {
		assert.strictEqual(resolveWorkbenchAppPreviewUrl({
			repoBranchUrl: 'http://localhost:3000/repo-branch',
			repoDefaultUrl: 'http://localhost:3000/repo-default',
			discoveredUrl: 'http://localhost:5173/'
		}), 'http://localhost:3000/repo-branch');
	});

	test('repo default URL beats discovered localhost URL', () => {
		assert.strictEqual(resolveWorkbenchAppPreviewUrl({
			repoDefaultUrl: 'http://localhost:3000/repo-default',
			runningServerUrl: 'http://localhost:4173/',
			discoveredUrl: 'http://localhost:5173/'
		}), 'http://localhost:3000/repo-default');
	});

	test('running server URL beats discovered localhost URL', () => {
		assert.strictEqual(resolveWorkbenchAppPreviewUrl({
			runningServerUrl: 'http://localhost:4173/',
			discoveredUrl: 'http://localhost:5173/'
		}), 'http://localhost:4173/');
	});

	test('missing config falls back to discovered localhost URL', () => {
		assert.strictEqual(resolveWorkbenchAppPreviewUrl({
			discoveredUrl: 'http://localhost:5173/'
		}), 'http://localhost:5173/');
	});

	test('preferred URL can suppress raw running server fallback', () => {
		assert.strictEqual(resolveWorkbenchAppPreviewPreferredUrl({
			runningServerUrl: 'http://127.0.0.1:15761/',
			allowRunningServerFallback: false,
		}), undefined);
	});

	test('preferred URL still uses configured routes when running server fallback is suppressed', () => {
		assert.strictEqual(resolveWorkbenchAppPreviewPreferredUrl({
			repoBranchUrl: 'https://local.preview.example.test:3001/app/projects/abc',
			runningServerUrl: 'http://127.0.0.1:15761/',
			allowRunningServerFallback: false,
		}), 'https://local.preview.example.test:3001/app/projects/abc');
	});

	test('preferred URL suppresses discovered URL when it only repeats the running server', () => {
		assert.strictEqual(resolveWorkbenchAppPreviewPreferredUrl({
			runningServerUrl: 'http://127.0.0.1:15761/',
			discoveredUrl: 'http://127.0.0.1:15761/',
			allowRunningServerFallback: false,
		}), 'http://127.0.0.1:15761/');
	});

	test('preferred URL keeps advertised local canonical URL when fallback is suppressed', () => {
		assert.strictEqual(resolveWorkbenchAppPreviewPreferredUrl({
			runningServerUrl: 'https://local.preview.example.test:15761/',
			discoveredUrl: 'https://local.preview.example.test:15761/',
			allowRunningServerFallback: false,
		}), 'https://local.preview.example.test:15761/');
	});

	test('preferred URL keeps configured default over duplicate running server fallback', () => {
		assert.strictEqual(resolveWorkbenchAppPreviewPreferredUrl({
			localDefaultOverride: 'https://local.preview.example.test:3001/app/projects/abc',
			repoDefaultUrl: 'https://local.preview.example.test:3001/',
			runningServerUrl: 'http://127.0.0.1:15761/',
			discoveredUrl: 'http://127.0.0.1:15761/',
			allowRunningServerFallback: false,
		}), 'https://local.preview.example.test:3001/app/projects/abc');
	});

	test('home targets use local overrides before canonical config', () => {
		assert.deepStrictEqual(resolveWorkbenchAppPreviewHomeTargets({
			localBranchOverride: 'http://localhost:4000/local-branch',
			localDefaultOverride: 'http://localhost:4000/local-default',
			repoBranchUrl: 'http://localhost:3000/repo-branch',
			repoDefaultUrl: 'http://localhost:3000/repo-default',
			runningServerUrl: 'http://localhost:4173/',
			discoveredUrl: 'http://localhost:5173/'
		}), [
			{ source: 'localBranchOverride', url: 'http://localhost:4000/local-branch' },
			{ source: 'localCanonicalBranchUrl', url: 'http://localhost:4000/repo-branch' },
			{ source: 'localCanonicalDefaultUrl', url: 'http://localhost:4000/repo-default' },
			{ source: 'localDefaultOverride', url: 'http://localhost:4000/local-default' },
			{ source: 'repoBranchUrl', url: 'http://localhost:3000/repo-branch' },
			{ source: 'repoDefaultUrl', url: 'http://localhost:3000/repo-default' },
		]);
	});

	test('home targets preserve canonical branch route on local preview origin', () => {
		assert.deepStrictEqual(resolveWorkbenchAppPreviewHomeTargets({
			localDefaultOverride: 'https://local.preview.example.test:3001/',
			repoBranchUrl: 'https://local.preview.example.test:15382/app/projects/abc',
			repoDefaultUrl: 'https://preview.example.test/projects',
		}), [
			{ source: 'localCanonicalBranchUrl', url: 'https://local.preview.example.test:3001/app/projects/abc' },
			{ source: 'localDefaultOverride', url: 'https://local.preview.example.test:3001/' },
			{ source: 'repoBranchUrl', url: 'https://local.preview.example.test:15382/app/projects/abc' },
			{ source: 'repoDefaultUrl', url: 'https://preview.example.test/projects' },
		]);
	});

	test('home targets use running local server as canonical route origin', () => {
		assert.deepStrictEqual(resolveWorkbenchAppPreviewHomeTargets({
			runningServerUrl: 'https://local.preview.example.test:3001/',
			repoBranchUrl: 'https://local.preview.example.test:15382/app/projects/abc',
		}), [
			{ source: 'localCanonicalBranchUrl', url: 'https://local.preview.example.test:3001/app/projects/abc' },
			{ source: 'repoBranchUrl', url: 'https://local.preview.example.test:15382/app/projects/abc' },
		]);
	});

	test('home targets trim and deduplicate by URL', () => {
		assert.deepStrictEqual(resolveWorkbenchAppPreviewHomeTargets({
			localBranchOverride: ' http://localhost:4000/home ',
			localDefaultOverride: 'http://localhost:4000/home',
			repoDefaultUrl: ' http://localhost:3000/ '
		}), [
			{ source: 'localBranchOverride', url: 'http://localhost:4000/home' },
			{ source: 'localCanonicalDefaultUrl', url: 'http://localhost:4000/' },
			{ source: 'repoDefaultUrl', url: 'http://localhost:3000/' },
		]);
	});

	test('preview navigation policy navigates newly created preview to preferred URL', () => {
		assert.strictEqual(shouldNavigateWorkbenchAppPreview({
			currentUrl: '',
			preferredUrl: 'http://localhost:3000/',
			isNewPreview: true,
			branchChanged: false,
		}), true);
	});

	test('preview navigation policy leaves user navigation alone on same branch', () => {
		assert.strictEqual(shouldNavigateWorkbenchAppPreview({
			currentUrl: 'http://localhost:3000/current-page',
			preferredUrl: 'http://localhost:3000/',
			isNewPreview: false,
			branchChanged: false,
			branchOpenedInSession: true,
		}), false);
	});

	test('preview navigation policy navigates when branch opens for the first time this session', () => {
		assert.strictEqual(shouldNavigateWorkbenchAppPreview({
			currentUrl: 'http://localhost:3000/current-page',
			preferredUrl: 'http://localhost:4000/new-branch',
			isNewPreview: false,
			branchChanged: false,
			branchOpenedInSession: false,
		}), true);
	});

	test('preview navigation policy does not restore preferred URL after branch is already open this session', () => {
		assert.strictEqual(shouldNavigateWorkbenchAppPreview({
			currentUrl: 'http://localhost:3000/current-page',
			preferredUrl: 'http://localhost:4000/stale-restore',
			isNewPreview: false,
			branchChanged: false,
			branchOpenedInSession: true,
		}), false);
	});

	test('preview navigation policy navigates when branch changes to a branch not opened this session', () => {
		assert.strictEqual(shouldNavigateWorkbenchAppPreview({
			currentUrl: 'http://localhost:3000/current-page',
			preferredUrl: 'http://localhost:4000/new-branch',
			isNewPreview: false,
			branchChanged: true,
			branchOpenedInSession: false,
		}), true);
	});

	test('preview navigation policy does not restore preferred URL when switching back to an opened branch', () => {
		assert.strictEqual(shouldNavigateWorkbenchAppPreview({
			currentUrl: 'http://localhost:3000/current-page',
			preferredUrl: 'http://localhost:4000/previous-branch-home',
			isNewPreview: false,
			branchChanged: true,
			branchOpenedInSession: true,
		}), false);
	});

	test('preview navigation policy ignores override changes on same branch', () => {
		assert.strictEqual(shouldNavigateWorkbenchAppPreview({
			currentUrl: 'http://localhost:3000/current-page',
			preferredUrl: 'http://localhost:5000/new-override',
			isNewPreview: false,
			branchChanged: false,
			branchOpenedInSession: true,
		}), false);
	});

	test('preview navigation policy does not force discovered URL after user navigation', () => {
		assert.strictEqual(shouldNavigateWorkbenchAppPreview({
			currentUrl: 'http://localhost:3000/user-page',
			preferredUrl: 'http://localhost:5173/discovered',
			isNewPreview: false,
			branchChanged: false,
			branchOpenedInSession: true,
		}), false);
	});

	test('branch observation treats duplicate checkout polls as unchanged', () => {
		assert.deepStrictEqual(observeWorkbenchAppPreviewBranch({
			hasObservedBranchName: true,
			lastBranchName: 'design/old',
			currentBranchName: 'design/new',
		}), {
			hasObservedBranchName: true,
			branchName: 'design/new',
			changed: true,
			previousBranchName: 'design/old',
		});

		assert.deepStrictEqual(observeWorkbenchAppPreviewBranch({
			hasObservedBranchName: true,
			lastBranchName: 'design/new',
			currentBranchName: 'design/new',
		}), {
			hasObservedBranchName: true,
			branchName: 'design/new',
			changed: false,
			previousBranchName: undefined,
		});
	});

	test('preview navigation policy navigates from blank setup state on same branch', () => {
		assert.strictEqual(shouldNavigateWorkbenchAppPreview({
			currentUrl: 'about:blank',
			preferredUrl: 'http://localhost:5173/discovered',
			isNewPreview: false,
			branchChanged: false,
		}), true);
	});

	test('preview navigation policy navigates from startup setup state on same branch', () => {
		assert.strictEqual(shouldNavigateWorkbenchAppPreview({
			currentUrl: 'data:text/html;base64,PHRpdGxlPlN0YXJ0aW5nIHByZXZpZXcuLi48L3RpdGxlPg==',
			preferredUrl: 'http://localhost:5173/discovered',
			isNewPreview: false,
			branchChanged: false,
			branchOpenedInSession: true,
		}), true);
	});

	test('preview force navigation policy does not override opened branch URL', () => {
		assert.strictEqual(shouldForceNavigateWorkbenchAppPreview({
			currentUrl: 'https://local.preview.example.test:3001/',
			isNewPreview: false,
			branchOpenedInSession: true,
		}), false);
	});

	test('preview force navigation policy can leave startup setup state', () => {
		assert.strictEqual(shouldForceNavigateWorkbenchAppPreview({
			currentUrl: 'data:text/html;base64,PHRpdGxlPlN0YXJ0aW5nIHByZXZpZXcuLi48L3RpdGxlPg==',
			isNewPreview: false,
			branchOpenedInSession: true,
		}), true);
	});

	test('startup page key ignores elapsed timer state', () => {
		const baseState = {
			phase: 'healthChecking',
			title: 'Starting preview...',
			message: 'Waiting for app response.',
			stages: [
				{ label: 'Prepare preview', status: 'done', startedAt: 100 },
				{ label: 'Wait for app response', status: 'current', startedAt: 100 },
			],
			branchName: 'design/ux-secondary-cta-spacing',
			repoPath: '/repo',
			port: 3001,
			url: 'https://local.preview.example.test:3001/',
			healthUrl: 'https://local.preview.example.test:3001/health',
			actions: ['copy'],
			currentStageStartedAt: 100,
			lastServerOutputAt: 100,
		};

		assert.strictEqual(
			getWorkbenchAppPreviewStartupPageKey(baseState),
			getWorkbenchAppPreviewStartupPageKey({
				...baseState,
				stages: [
					{ label: 'Prepare preview', status: 'done', startedAt: 200 },
					{ label: 'Wait for app response', status: 'current', startedAt: 200 },
				],
				currentStageStartedAt: 200,
				lastServerOutputAt: 200,
			})
		);
	});

	test('startup page key changes when visible startup state changes', () => {
		const baseState = {
			phase: 'healthChecking',
			title: 'Starting preview...',
			message: 'Waiting for app response.',
			stages: [{ label: 'Wait for app response', status: 'current' }],
			actions: ['copy'],
		};

		assert.notStrictEqual(
			getWorkbenchAppPreviewStartupPageKey(baseState),
			getWorkbenchAppPreviewStartupPageKey({
				...baseState,
				message: 'The server is starting.',
			})
		);
	});

	test('startup title includes the branch being previewed', () => {
		assert.strictEqual(getWorkbenchAppPreviewStartupTitle('healthChecking', 'feature/cart'), 'Starting preview of feature/cart');
	});

	test('startup title names the workspace when branch is unavailable', () => {
		assert.strictEqual(getWorkbenchAppPreviewStartupTitle('healthChecking', undefined), 'Starting preview of this workspace');
	});

	test('startup title names the empty repo state', () => {
		assert.strictEqual(getWorkbenchAppPreviewStartupTitle('emptyRepo', undefined), 'Add a repo to preview your app');
	});

	test('startup title names dependency install states', () => {
		assert.deepStrictEqual([
			getWorkbenchAppPreviewStartupTitle('installingDependencies', 'main'),
			getWorkbenchAppPreviewStartupTitle('missingDependencies', undefined),
		], [
			'Installing dependencies for main',
			'Preview dependencies need attention',
		]);
	});

	test('startup page renders empty repo add actions', () => {
		const html = decodeDataUrlHtml(createWorkbenchAppPreviewStartupDataUrl({
			phase: 'emptyRepo',
			title: getWorkbenchAppPreviewStartupTitle('emptyRepo', undefined),
			message: 'Parakit needs a repo before it can show an app preview.',
			actions: ['pasteRepoUrl', 'openLocalFolder'],
		}));

		assert.match(html, /<div class="icon">\+<\/div>/);
		assert.match(html, /Paste repo URL/);
		assert.match(html, /data-action="pasteRepoUrl"/);
		assert.match(html, /Open local folder/);
		assert.match(html, /data-action="openLocalFolder"/);
		assert.doesNotMatch(html, /Copy context for agent/);
	});

	test('startup page renders dependency install actions after install failure', () => {
		const html = decodeDataUrlHtml(createWorkbenchAppPreviewStartupDataUrl({
			phase: 'missingDependencies',
			title: getWorkbenchAppPreviewStartupTitle('missingDependencies', undefined),
			message: 'Install failed.',
			command: 'yarn install',
			actions: ['retry', 'restart', 'logs'],
		}));

		assert.match(html, /Preview dependencies need attention/);
		assert.match(html, /data-action="retry"/);
		assert.match(html, /data-action="restart"/);
		assert.match(html, /data-action="logs"/);
	});

	test('startup page keeps preview details collapsed behind show more info', () => {
		const html = decodeDataUrlHtml(createWorkbenchAppPreviewStartupDataUrl({
			phase: 'healthChecking',
			title: 'Starting preview of feature/cart',
			message: 'Waiting for app response.',
			branchName: 'feature/cart',
			previousBranchName: 'main',
			port: 3001,
			healthUrl: 'http://127.0.0.1:3001/health',
			url: 'http://127.0.0.1:3001/',
		}));

		assert.match(html, /<details class="more-info">/);
		assert.match(html, /<summary>Show more info<\/summary>/);
		assert.match(html, /<p class="caption">Branch: feature\/cart\nPrevious branch: main\nPort: 3001\nHealth check: http:\/\/127\.0\.0\.1:3001\/health\nPreview URL: http:\/\/127\.0\.0\.1:3001\/<\/p>/);
	});

	test('startup page renders current stage marker as an animated spinner', () => {
		const html = decodeDataUrlHtml(createWorkbenchAppPreviewStartupDataUrl({
			phase: 'healthChecking',
			title: 'Starting preview of feature/cart',
			message: 'Waiting for app response.',
			stages: [{ label: 'Wait for app response', status: 'current' }],
		}));

		assert.match(html, /@keyframes app-preview-stage-spinner/);
		assert.match(html, /<span class="stage-spinner" aria-hidden="true"><\/span>/);
		assert.match(html, /\.stage-spinner \{[^}]*animation: app-preview-stage-spinner 900ms linear infinite;/);
		assert.doesNotMatch(html, /<span class="stage-icon">&bull;<\/span>/);
	});

	test('startup page renders the startup animation in an unclipped frame', () => {
		const html = decodeDataUrlHtml(createWorkbenchAppPreviewStartupDataUrl({
			phase: 'healthChecking',
			title: 'Starting preview of feature/cart',
			message: 'Waiting for app response.',
		}));

		assert.match(html, /\.startup-animation-frame \{ width: 54px; height: 76px; display: grid; place-items: center; flex: 0 0 auto; overflow: visible; \}/);
		assert.match(html, /\.startup-animation \{ width: 54px; height: 76px; object-fit: contain; overflow: visible; display: block; \}/);
		assert.match(html, /<span class="startup-animation-frame"><img class="startup-animation"/);
	});

	test('startup animation svg keeps stroke padding inside the image viewport', () => {
		const svg = decodeDataUrlSvg(APP_PREVIEW_STARTUP_ANIMATION_SRC);

		assert.match(svg, /<svg width="99" height="167" viewBox="0 0 99 167"/);
		assert.match(svg, /<g id="parakit_animation_white" transform="translate\(4 4\)">/);
	});

	test('startup page uses workbench typography and pure blue accent styling', () => {
		const html = decodeDataUrlHtml(createWorkbenchAppPreviewStartupDataUrl({
			phase: 'slow',
			title: 'Preview is taking longer than expected',
			message: 'The server is still starting.',
			actions: ['copy'],
		}));

		assert.match(html, /--app-preview-accent: #0000ff;/);
		assert.match(html, /font-family: "IBM Plex Mono", monospace;/);
		assert.match(html, /\.stage-current \.stage-icon \{ color: var\(--app-preview-accent\); \}/);
		assert.match(html, /button \{ appearance: none; border: 0; border-radius: 4px; background: var\(--app-preview-accent\); color: #ffffff;/);
	});

	test('startup page always renders with the dark preview background', () => {
		const html = decodeDataUrlHtml(createWorkbenchAppPreviewStartupDataUrl({
			phase: 'installingDependencies',
			title: 'Installing dependencies for feature/cart',
			message: 'Installing dependencies before starting the preview server.',
		}));

		assert.match(html, /:root \{ color-scheme: dark;[^}]*--app-preview-background: #1e1e1e;/);
		assert.doesNotMatch(html, /color-scheme: light dark/);
		assert.doesNotMatch(html, /--app-preview-background: #ffffff/);
		assert.doesNotMatch(html, /prefers-color-scheme/);
	});

	test('startup install page sets expectations for fresh dependency installs', () => {
		const html = decodeDataUrlHtml(createWorkbenchAppPreviewStartupDataUrl({
			phase: 'installingDependencies',
			title: 'Installing dependencies for feature/cart',
			message: 'Installing dependencies before starting the preview server. A fresh install can take a few minutes.',
		}));

		assert.match(html, /fresh install can take a few minutes/);
	});

	test('startup page hides agent context copy before the slow state', () => {
		const html = decodeDataUrlHtml(createWorkbenchAppPreviewStartupDataUrl({
			phase: 'healthChecking',
			title: 'Starting preview of feature/cart',
			message: 'Waiting for app response.',
			actions: ['copy'],
		}));

		assert.doesNotMatch(html, /Copy context for agent/);
		assert.doesNotMatch(html, /data-action="copy"/);
	});

	test('startup page shows agent context copy in the slow state', () => {
		const html = decodeDataUrlHtml(createWorkbenchAppPreviewStartupDataUrl({
			phase: 'slow',
			title: 'Preview is taking longer than expected',
			message: 'The server is still starting.',
			actions: ['copy'],
		}));

		assert.match(html, /Copy context for agent/);
		assert.match(html, /data-action="copy"/);
	});

	test('startup setup page renders configure action without retry or restart', () => {
		const html = decodeDataUrlHtml(createWorkbenchAppPreviewStartupDataUrl({
			phase: 'setup',
			title: getWorkbenchAppPreviewStartupTitle('setup', 'feature/cart'),
			message: 'Set the URL that opens by default for this branch.',
			actions: ['configure'],
		}));

		assert.match(html, /Set default URL/);
		assert.doesNotMatch(html, /Configure URL/);
		assert.match(html, /data-action="configure"/);
		assert.doesNotMatch(html, /data-action="retry"/);
		assert.doesNotMatch(html, /data-action="restart"/);
	});

	test('startup setup page renders as a static configuration prompt', () => {
		const html = decodeDataUrlHtml(createWorkbenchAppPreviewStartupDataUrl({
			phase: 'setup',
			title: getWorkbenchAppPreviewStartupTitle('setup', 'feature/cart'),
			message: 'Set the URL that opens by default for this branch.',
			stages: [{ label: 'Set default URL', status: 'current', startedAt: 12345 }],
			actions: ['configure'],
		}, APP_PREVIEW_STARTUP_ANIMATION_SRC));

		assert.match(html, /Set the URL that opens by default for this branch\./);
		assert.doesNotMatch(html, /startup-animation/);
		assert.doesNotMatch(html, /stage-spinner/);
		assert.doesNotMatch(html, /stage-elapsed/);
		assert.doesNotMatch(html, /app-preview-stage-spinner/);
		assert.doesNotMatch(html, /setInterval\(updateTimers, 1000\)/);
		assert.doesNotMatch(html, /<ol class="stages">/);
		assert.doesNotMatch(html, /<div class="icon">/);
		assert.match(html, /Set default URL/);
		assert.doesNotMatch(html, /Configure URL/);
	});

	test('transient App Preview auth tabs are not serialized', () => {
		assert.strictEqual(getSerializableBrowserEditorInputData({
			id: 'auth-tab',
			url: 'https://login.example.com/oauth',
			title: 'Sign in',
			isSessionAppPreviewAuth: true,
		}), undefined);
	});

	test('serialized App Preview tabs do not restore runtime URLs', () => {
		assert.deepStrictEqual(getSerializableBrowserEditorInputData({
			id: 'app-preview',
			url: 'https://local.preview.example.test:3001/app/projects/123',
			title: 'Project details',
			favicon: 'data:image/svg+xml;base64,abc',
			isSessionAppPreview: true,
		}), {
			id: 'app-preview',
			isSessionAppPreview: true,
		});
	});

	test('startup health timeout waits two and a half minutes before showing the slow state', () => {
		assert.strictEqual(WORKBENCH_APP_PREVIEW_STARTUP_HEALTH_TIMEOUT, 150_000);
	});

	test('preview discovered URL belongs only to the branch that produced it', () => {
		assert.strictEqual(isWorkbenchAppPreviewUrlForBranch('main', 'main'), true);
		assert.strictEqual(isWorkbenchAppPreviewUrlForBranch('main', 'feature/new-ui'), false);
	});

	test('managed local preview URLs must use a local host and the assigned branch port', () => {
		assert.strictEqual(isWorkbenchAppPreviewManagedLocalUrl('https://local.preview.example.test:15761/', 15761), true);
		assert.strictEqual(isWorkbenchAppPreviewManagedLocalUrl('http://127.0.0.1:15761/', 15761), true);
		assert.strictEqual(isWorkbenchAppPreviewManagedLocalUrl('https://local.preview.example.test:3001/', 15761), false);
		assert.strictEqual(isWorkbenchAppPreviewManagedLocalUrl('https://preview.example.test:15761/', 15761), false);
	});

	test('preview load recovery ignores stale assigned-port failures for fixed preview URLs', () => {
		assert.strictEqual(shouldRecoverWorkbenchAppPreviewLoadError({
			errorUrl: 'https://local.preview.example.test:15382/app/projects/abc',
			errorCode: -102,
			serverUrl: 'https://local.preview.example.test:3001/',
		}), false);
	});

	test('preview load recovery handles failures on the active preview origin', () => {
		assert.strictEqual(shouldRecoverWorkbenchAppPreviewLoadError({
			errorUrl: 'https://local.preview.example.test:3001/app/projects/abc',
			errorCode: -102,
			serverUrl: 'https://local.preview.example.test:3001/',
		}), true);
	});

	test('preview load recovery handles timeouts on the active preview origin', () => {
		assert.strictEqual(shouldRecoverWorkbenchAppPreviewLoadError({
			errorUrl: 'https://local.preview.example.test:3001/app/projects/abc',
			errorCode: -7,
			serverUrl: 'https://local.preview.example.test:3001/',
		}), true);
	});

	test('preview load recovery handles failures on the active managed preview URL before server URL is known', () => {
		assert.strictEqual(shouldRecoverWorkbenchAppPreviewLoadError({
			errorUrl: 'https://local.preview.example.test:15761/',
			errorCode: -102,
			serverUrl: undefined,
			activeManagedPreviewUrl: 'https://local.preview.example.test:15761/',
		}), true);
	});

	test('preview load recovery ignores active managed preview failures on another origin', () => {
		assert.strictEqual(shouldRecoverWorkbenchAppPreviewLoadError({
			errorUrl: 'https://local.preview.example.test:15761/',
			errorCode: -102,
			serverUrl: undefined,
			activeManagedPreviewUrl: 'https://local.preview.example.test:3001/',
		}), false);
	});

	test('preview load recovery ignores unrelated error codes', () => {
		assert.strictEqual(shouldRecoverWorkbenchAppPreviewLoadError({
			errorUrl: 'https://local.preview.example.test:3001/',
			errorCode: -3,
			serverUrl: 'https://local.preview.example.test:3001/',
		}), false);
	});

	test('preview load recovery waits instead of restarting while managed server process is alive', () => {
		assert.strictEqual(shouldRestartWorkbenchAppPreviewAfterLoadError({
			recoverableLoadError: shouldRecoverWorkbenchAppPreviewLoadError({
				errorUrl: 'https://local.preview.example.test:3001/app/projects/abc',
				errorCode: -102,
				serverUrl: 'https://local.preview.example.test:3001/',
			}),
			serverProcessAlive: true,
		}), false);
	});

	test('preview load recovery can restart after the managed server process exits', () => {
		assert.strictEqual(shouldRestartWorkbenchAppPreviewAfterLoadError({
			recoverableLoadError: shouldRecoverWorkbenchAppPreviewLoadError({
				errorUrl: 'https://local.preview.example.test:3001/app/projects/abc',
				errorCode: -102,
				serverUrl: 'https://local.preview.example.test:3001/',
			}),
			serverProcessAlive: false,
		}), true);
	});

	test('preview load recovery can restart after managed startup has failed even if the terminal is still alive', () => {
		assert.strictEqual(shouldRestartWorkbenchAppPreviewAfterLoadError({
			recoverableLoadError: shouldRecoverWorkbenchAppPreviewLoadError({
				errorUrl: 'https://local.preview.example.test:3001/app/projects/abc',
				errorCode: -102,
				serverUrl: 'https://local.preview.example.test:3001/',
			}),
			serverProcessAlive: true,
			serverState: 'failed',
		}), true);
	});

	test('preview server command exit before health marks startup failed', () => {
		assert.strictEqual(getWorkbenchAppPreviewServerStateAfterCommandExit({
			serverState: 'running',
			serverHealth: 'unhealthy',
		}), 'failed');
	});

	test('preview server command exit after health marks server stopped', () => {
		assert.strictEqual(getWorkbenchAppPreviewServerStateAfterCommandExit({
			serverState: 'running',
			serverHealth: 'healthy',
		}), 'stopped');
	});

	test('preview startup health timeout fails when command is no longer active', () => {
		assert.strictEqual(getWorkbenchAppPreviewServerStateAfterHealthTimeout({
			serverState: 'running',
			serverHealth: 'unhealthy',
			serverTerminalExited: false,
			serverCommandActive: false,
		}), 'failed');
	});

	test('preview startup health timeout can keep waiting when command activity is unknown', () => {
		assert.strictEqual(getWorkbenchAppPreviewServerStateAfterHealthTimeout({
			serverState: 'running',
			serverHealth: 'unhealthy',
			serverTerminalExited: false,
			serverCommandActive: undefined,
		}), undefined);
	});

	test('unresolved preview configuration shows setup before starting a server', () => {
		assert.strictEqual(shouldShowWorkbenchAppPreviewSetupBeforeServerStart({
			configuredUrl: undefined,
			needsConfigurationPrompt: true,
		}), true);
	});

	test('unresolved preview configuration allows server start when dependencies are ready', () => {
		const policy = {
			configuredUrl: undefined,
			needsConfigurationPrompt: true,
			canStartServerWithoutInstall: true,
		};

		assert.strictEqual(shouldShowWorkbenchAppPreviewSetupBeforeServerStart(policy), false);
	});

	test('unresolved preview configuration allows server start before installing dependencies', () => {
		const policy = {
			configuredUrl: undefined,
			inferredStartupUrl: undefined,
			needsConfigurationPrompt: true,
			hasRunnableServerConfig: true,
			canStartServerWithoutInstall: false,
		};

		assert.strictEqual(shouldShowWorkbenchAppPreviewSetupBeforeServerStart(policy), false);
	});

	test('unresolved preview configuration allows server start with inferred startup URL', () => {
		assert.strictEqual(shouldShowWorkbenchAppPreviewSetupBeforeServerStart({
			configuredUrl: undefined,
			inferredStartupUrl: 'https://local.preview.example.test:3001/app',
			needsConfigurationPrompt: true,
			canStartServerWithoutInstall: false,
		}), false);
	});

	test('resolved preview configuration does not block server start', () => {
		assert.strictEqual(shouldShowWorkbenchAppPreviewSetupBeforeServerStart({
			configuredUrl: 'https://local.preview.example.test:3001/',
			needsConfigurationPrompt: true,
		}), false);
	});

	test('inferred startup URL prefers current branch verified URL adapted to assigned port', () => {
		assert.strictEqual(resolveWorkbenchAppPreviewInferredStartupUrl({
			port: 3002,
			branchRuntime: {
				lastSuccessfulUrl: 'https://local.preview.example.test:3001/branch-route',
				lastSuccessfulAt: 200,
			},
			repoRuntimes: [{
				lastSuccessfulUrl: 'https://local.preview.example.test:3003/repo-route',
				lastSuccessfulAt: 300,
			}],
		}), 'https://local.preview.example.test:3002/branch-route');
	});

	test('inferred startup URL falls back to newest verified repo URL adapted to assigned port', () => {
		assert.strictEqual(resolveWorkbenchAppPreviewInferredStartupUrl({
			port: 3002,
			branchRuntime: {},
			repoRuntimes: [
				{
					lastSuccessfulUrl: 'https://local.preview.example.test:3001/older',
					lastSuccessfulAt: 100,
				},
				{
					lastSuccessfulUrl: 'https://local.preview.example.test:3003/newer',
					lastSuccessfulAt: 300,
				},
			],
		}), 'https://local.preview.example.test:3002/newer');
	});

	test('advertised preview URLs preserve route on the active preview origin', () => {
		assert.strictEqual(resolveWorkbenchAppPreviewAdvertisedUrl({
			currentServerUrl: 'https://local.preview.example.test:3001/',
			advertisedUrl: 'https://local.preview.example.test:15382/app/projects/abc',
		}), 'https://local.preview.example.test:3001/app/projects/abc');
	});

	test('advertised preview URLs can update the active preview path on the same origin', () => {
		assert.strictEqual(resolveWorkbenchAppPreviewAdvertisedUrl({
			currentServerUrl: 'https://local.preview.example.test:3001/',
			advertisedUrl: 'https://local.preview.example.test:3001/app/projects/abc',
		}), 'https://local.preview.example.test:3001/app/projects/abc');
	});

	test('advertised local canonical URLs can replace loopback server URLs on the same port', () => {
		assert.strictEqual(resolveWorkbenchAppPreviewAdvertisedUrl({
			currentServerUrl: 'http://127.0.0.1:15761/',
			advertisedUrl: 'https://local.preview.example.test:15761/',
		}), 'https://local.preview.example.test:15761/');
	});

	test('advertised local canonical URLs cannot replace a different server port', () => {
		assert.strictEqual(resolveWorkbenchAppPreviewAdvertisedUrl({
			currentServerUrl: 'http://127.0.0.1:15761/',
			advertisedUrl: 'https://local.preview.example.test:3001/',
		}), undefined);
	});

	test('advertised preview URLs can initialize when no server URL exists yet', () => {
		assert.strictEqual(resolveWorkbenchAppPreviewAdvertisedUrl({
			currentServerUrl: undefined,
			advertisedUrl: 'http://localhost:5173/',
		}), 'http://localhost:5173/');
	});

	test('URL origin resolution preserves path, query, and hash', () => {
		assert.strictEqual(
			resolveWorkbenchAppPreviewUrlOnOrigin(
				'https://local.preview.example.test:3001/',
				'https://local.preview.example.test:15382/app/projects/abc?tab=overview#details'
			),
			'https://local.preview.example.test:3001/app/projects/abc?tab=overview#details'
		);
	});

	test('Claude reconciliation tries workbench sessions before Anthropic extension fallback', () => {
		assert.deepStrictEqual(getWorkbenchAppPreviewClaudeReconciliationCommands(), [
			{ commandId: 'workbench.action.chat.openNewChatSessionInPlace.claude-code', args: ['sidebar'] },
			{ commandId: 'workbench.action.chat.openNewChatSessionInPlace.agent-host-claude', args: ['sidebar'] },
			{ commandId: 'claude-vscode.newConversation', args: [] },
			{ commandId: 'claude-vscode.sidebar.open', args: [] },
		]);
	});

	test('dev config resolves branch values over defaults', () => {
		assert.deepStrictEqual(resolveWorkbenchAppPreviewDevConfig({
			default: {
				command: 'npm run dev',
				cwd: '.',
				portEnv: 'PORT',
				url: 'http://127.0.0.1:${PORT}/',
				healthPath: '/',
			},
			branches: {
				'design/home': {
					url: 'http://127.0.0.1:${PORT}/home',
				}
			}
		}, 'design/home'), {
			command: 'npm run dev',
			cwd: '.',
			portEnv: 'PORT',
			url: 'http://127.0.0.1:${PORT}/home',
			healthPath: '/',
		});
	});

	test('dev config rejects missing command', () => {
		assert.strictEqual(resolveWorkbenchAppPreviewDevConfig({
			default: {
				url: 'http://127.0.0.1:${PORT}/',
			}
		}, undefined), undefined);
	});

	test('dev config no-op placeholder allows package script fallback', () => {
		const devConfig = {
			default: {
				command: 'sleep 86400',
				url: 'https://local.preview.example.test:3001/',
				healthPath: '/health',
			}
		};

		assert.strictEqual(resolveWorkbenchAppPreviewDevConfig(devConfig, undefined), undefined);
		assert.strictEqual(shouldFallbackFromWorkbenchAppPreviewDevConfig(devConfig, undefined), true);
	});

	test('dev config applies allocated port to URL and environment', () => {
		assert.deepStrictEqual(applyWorkbenchAppPreviewDevPort({
			command: 'npm run dev',
			portEnv: 'PORT',
			url: 'http://127.0.0.1:${PORT}/',
			healthPath: '/ready',
		}, 4321), {
			command: 'npm run dev',
			env: { BROWSER: 'none', PORT: '4321' },
			url: 'http://127.0.0.1:4321/',
			healthUrl: 'http://127.0.0.1:4321/ready',
		});
	});

	test('dev config without portEnv does not inject PORT for literal URL', () => {
		const resolvedConfig = resolveWorkbenchAppPreviewDevConfig({
			default: {
				command: 'npm run dev',
				url: 'https://local.preview.example.test:3001/',
				healthPath: '/',
			}
		}, undefined);

		assert.ok(resolvedConfig);
		assert.deepStrictEqual(applyWorkbenchAppPreviewDevPort(resolvedConfig, 4321), {
			command: 'npm run dev',
			env: { BROWSER: 'none' },
			url: 'https://local.preview.example.test:3001/',
			healthUrl: 'https://local.preview.example.test:3001/',
		});
	});

	test('heuristic dev config can use a configured branch preview URL', () => {
		assert.deepStrictEqual(resolveWorkbenchAppPreviewHeuristicDevConfig({
			start: 'RSBUILD_ENV=dev rsbuild dev',
		}, 'https://local.preview.example.test:${PORT}/app/projects/abc'), {
			command: 'npm run start -- --port ${PORT}',
			portEnv: 'PORT',
			url: 'https://local.preview.example.test:${PORT}/app/projects/abc',
			healthPath: '/',
		});
	});

	test('heuristic dev config passes assigned port to rsbuild scripts', () => {
		assert.deepStrictEqual(resolveWorkbenchAppPreviewHeuristicDevConfig({
			start: 'rsbuild dev',
		}), {
			command: 'npm run start -- --port ${PORT}',
			portEnv: 'PORT',
			url: 'http://127.0.0.1:${PORT}/',
			healthPath: '/',
		});
	});

	test('heuristic dev config uses fixed app port from repo environment', () => {
		const env = parseWorkbenchAppPreviewEnv([
			"HOST='local.preview.example.test'",
			'HTTPS=true',
			'PORT=3001',
			'PUBLIC_URL=https://local.preview.example.test:3001/',
		].join('\n'));

		const config = resolveWorkbenchAppPreviewHeuristicDevConfig({
			start: 'RSBUILD_ENV=dev rsbuild dev',
		}, undefined, env);

		assert.deepStrictEqual(config, {
			command: 'npm run start -- --port ${PORT}',
			portEnv: 'PORT',
			url: 'https://local.preview.example.test:3001/',
			healthPath: '/',
			fixedPort: 3001,
		});
		assert.strictEqual(config ? getWorkbenchAppPreviewDevConfigFixedPort(config) : undefined, 3001);
	});

	test('static HTML config serves the detected directory with Python', () => {
		assert.deepStrictEqual(resolveWorkbenchAppPreviewStaticHtmlConfig('public'), {
			command: 'python3 -m http.server ${PORT} --directory public',
			portEnv: 'PORT',
			url: 'http://127.0.0.1:${PORT}/',
			healthPath: '/',
		});
	});

	test('static HTML config can open a detected document path', () => {
		const resolveStaticHtmlConfig = resolveWorkbenchAppPreviewStaticHtmlConfig as unknown as (serveDir: string, initialPath?: string) => ReturnType<typeof resolveWorkbenchAppPreviewStaticHtmlConfig>;

		assert.deepStrictEqual(resolveStaticHtmlConfig('docs/architecture', 'forma-architecture.html'), {
			command: 'python3 -m http.server ${PORT} --directory docs/architecture',
			portEnv: 'PORT',
			url: 'http://127.0.0.1:${PORT}/forma-architecture.html',
			healthPath: '/',
		});
	});

	test('static HTML selection prefers architecture docs over lower-signal pages', () => {
		assert.strictEqual(selectWorkbenchAppPreviewStaticHtmlFile([
			'docs/architecture/repo-map.diagram.html',
			'docs/architecture/forma-composable-model.html',
			'docs/architecture/forma-architecture.html',
			'docs/architecture/forma-containment-model.html',
		]), 'docs/architecture/forma-architecture.html');
	});

	test('preview server config can start without install when it has no install commands', () => {
		assert.strictEqual(canStartWorkbenchAppPreviewServerWithoutInstall(resolveWorkbenchAppPreviewStaticHtmlConfig('public')), true);
	});

	test('preview server config cannot start without install when dependencies need setup', () => {
		assert.strictEqual(canStartWorkbenchAppPreviewServerWithoutInstall({
			command: 'npm run dev',
			portEnv: 'PORT',
			url: 'http://127.0.0.1:${PORT}/',
			healthPath: '/',
			installCommand: 'npm install',
		}), false);
		assert.strictEqual(canStartWorkbenchAppPreviewServerWithoutInstall(undefined), false);
	});

	test('normalizes wildcard bind hosts to loopback preview URLs', () => {
		assert.strictEqual(normalizeWorkbenchAppPreviewLoopbackUrl('http://[::]:10036/'), 'http://127.0.0.1:10036/');
		assert.strictEqual(normalizeWorkbenchAppPreviewLoopbackUrl('http://0.0.0.0:5173/path?x=1#top'), 'http://127.0.0.1:5173/path?x=1#top');
		assert.strictEqual(normalizeWorkbenchAppPreviewLoopbackUrl('http://localhost:3000/'), 'http://localhost:3000/');
	});

	test('uses no-cors health checks for loopback preview URLs', () => {
		assert.strictEqual(getWorkbenchAppPreviewHealthFetchMode('http://127.0.0.1:10036/'), 'no-cors');
		assert.strictEqual(getWorkbenchAppPreviewHealthFetchMode('http://localhost:5173/'), 'no-cors');
		assert.strictEqual(getWorkbenchAppPreviewHealthFetchMode('https://example.com/'), 'cors');
	});

	test('adapts local preview URL by preserving route and swapping only the port', () => {
		assert.strictEqual(
			adaptWorkbenchAppPreviewUrlToPort('https://local.preview.example.test:3007/app/projects?tab=overview#details', 4821),
			'https://local.preview.example.test:4821/app/projects?tab=overview#details'
		);
	});

	test('adapts shared preview URL templates with branch-local ports', () => {
		assert.strictEqual(
			adaptWorkbenchAppPreviewUrlToPort('http://127.0.0.1:${PORT}/app/projects?tab=overview#details', 4821),
			'http://127.0.0.1:4821/app/projects?tab=overview#details'
		);
	});

	test('detects preview URL templates that still require a port assignment', () => {
		assert.strictEqual(hasWorkbenchAppPreviewPortTemplate('http://127.0.0.1:${PORT}/'), true);
		assert.strictEqual(hasWorkbenchAppPreviewPortTemplate('file:///tmp/index.html'), false);
		assert.strictEqual(hasWorkbenchAppPreviewPortTemplate('./index.html'), false);
	});

	test('detects preview port conflicts for the assigned port', () => {
		assert.strictEqual(isWorkbenchAppPreviewPortConflict('Error: listen EADDRINUSE: address already in use 127.0.0.1:4821', 4821), true);
		assert.strictEqual(isWorkbenchAppPreviewPortConflict('Error: listen EADDRINUSE: address already in use 127.0.0.1:5173', 4821), false);
		assert.strictEqual(isWorkbenchAppPreviewPortConflict('Compiled successfully on port 4821', 4821), false);
	});

	test('detects whether a process cwd belongs to the repo root', () => {
		assert.strictEqual(isWorkbenchAppPreviewPathUnderRoot('/Users/dev/repos/acs-schedule', '/Users/dev/repos/acs-schedule'), true);
		assert.strictEqual(isWorkbenchAppPreviewPathUnderRoot('/Users/dev/repos/acs-schedule/apps/demo', '/Users/dev/repos/acs-schedule'), true);
		assert.strictEqual(isWorkbenchAppPreviewPathUnderRoot('/Users/dev/repos/acs-schedule/', '/Users/dev/repos/acs-schedule'), true);
		assert.strictEqual(isWorkbenchAppPreviewPathUnderRoot('/Users/dev/repos/other-project', '/Users/dev/repos/acs-schedule'), false);
		assert.strictEqual(isWorkbenchAppPreviewPathUnderRoot('/Users/dev/repos/acs-schedule-other', '/Users/dev/repos/acs-schedule'), false);
	});

	test('classifies terminal startup failures', () => {
		assert.deepStrictEqual([
			classifyWorkbenchAppPreviewTerminalFailure('Error: listen EADDRINUSE: address already in use 127.0.0.1:4821', 4821),
			classifyWorkbenchAppPreviewTerminalFailure('zsh: command not found: yarn', 4821),
			classifyWorkbenchAppPreviewTerminalFailure('Error: Cannot find module vite', 4821),
			classifyWorkbenchAppPreviewTerminalFailure('sh: ./node_modules/.bin/vite: Permission denied', 4821),
			classifyWorkbenchAppPreviewTerminalFailure('ready in 1.2s', 4821),
		], ['portConflict', 'missingBinary', 'moduleNotFound', 'permissionDenied', 'unknown']);
	});

	test('health failures do not restart a live preview server process', () => {
		assert.strictEqual(shouldRestartWorkbenchAppPreviewAfterHealthFailures({
			previewStartupInProgress: false,
			backgroundRestartInFlight: false,
			serverProcessAlive: true,
			backgroundRestartAttempts: 0,
			maxBackgroundRestartAttempts: 3,
		}), false);
	});

	test('health failures can restart after the preview server process exits', () => {
		assert.strictEqual(shouldRestartWorkbenchAppPreviewAfterHealthFailures({
			previewStartupInProgress: false,
			backgroundRestartInFlight: false,
			serverProcessAlive: false,
			backgroundRestartAttempts: 0,
			maxBackgroundRestartAttempts: 3,
		}), true);
	});

	test('load events are ignored while still loading', () => {
		assert.strictEqual(shouldIgnoreWorkbenchAppPreviewLoadEvent({
			eventLoading: true,
			hasError: true,
			previewStartupInProgress: false,
			previewLoadFailureRecoveryInFlight: false,
			serverStartInFlight: false,
		}), true);
	});

	test('load events with no error are ignored', () => {
		assert.strictEqual(shouldIgnoreWorkbenchAppPreviewLoadEvent({
			eventLoading: false,
			hasError: false,
			previewStartupInProgress: false,
			previewLoadFailureRecoveryInFlight: false,
			serverStartInFlight: false,
		}), true);
	});

	test('load errors are ignored while the loud startup sequence is in progress', () => {
		assert.strictEqual(shouldIgnoreWorkbenchAppPreviewLoadEvent({
			eventLoading: false,
			hasError: true,
			previewStartupInProgress: true,
			previewLoadFailureRecoveryInFlight: false,
			serverStartInFlight: false,
		}), true);
	});

	test('load errors are ignored while a previous recovery attempt is still in flight', () => {
		assert.strictEqual(shouldIgnoreWorkbenchAppPreviewLoadEvent({
			eventLoading: false,
			hasError: true,
			previewStartupInProgress: false,
			previewLoadFailureRecoveryInFlight: true,
			serverStartInFlight: false,
		}), true);
	});

	test('load errors are ignored while a quiet (background) server start is in flight', () => {
		assert.strictEqual(shouldIgnoreWorkbenchAppPreviewLoadEvent({
			eventLoading: false,
			hasError: true,
			previewStartupInProgress: false,
			previewLoadFailureRecoveryInFlight: false,
			serverStartInFlight: true,
		}), true);
	});

	test('a genuine, isolated load error is not ignored', () => {
		assert.strictEqual(shouldIgnoreWorkbenchAppPreviewLoadEvent({
			eventLoading: false,
			hasError: true,
			previewStartupInProgress: false,
			previewLoadFailureRecoveryInFlight: false,
			serverStartInFlight: false,
		}), false);
	});

	test('discovered port reconciliation updates url, health url, and port when the server bound elsewhere', () => {
		assert.deepStrictEqual(resolveWorkbenchAppPreviewDiscoveredPortReconciliation({
			serverUrl: 'http://127.0.0.1:3001/',
			serverHealthUrl: 'http://127.0.0.1:3001/health',
			serverBranch: 'feature/foo',
			serverFixedPort: undefined,
			discoveredUrl: 'http://127.0.0.1:3002/',
			discoveredBranchName: 'feature/foo',
		}), {
			port: 3002,
			url: 'http://127.0.0.1:3002/',
			healthUrl: 'http://127.0.0.1:3002/health',
		});
	});

	test('discovered port reconciliation treats localhost and 127.0.0.1 as the same host', () => {
		assert.deepStrictEqual(resolveWorkbenchAppPreviewDiscoveredPortReconciliation({
			serverUrl: 'http://127.0.0.1:3000/',
			serverHealthUrl: 'http://127.0.0.1:3000/health',
			serverBranch: 'feature/foo',
			serverFixedPort: undefined,
			discoveredUrl: 'http://localhost:3001/',
			discoveredBranchName: 'feature/foo',
		}), {
			port: 3001,
			url: 'http://127.0.0.1:3001/',
			healthUrl: 'http://127.0.0.1:3001/health',
		});
	});

	test('discovered port reconciliation does nothing when the port already matches', () => {
		assert.strictEqual(resolveWorkbenchAppPreviewDiscoveredPortReconciliation({
			serverUrl: 'http://127.0.0.1:3001/',
			serverHealthUrl: 'http://127.0.0.1:3001/health',
			serverBranch: 'feature/foo',
			serverFixedPort: undefined,
			discoveredUrl: 'http://127.0.0.1:3001/some/deep/path',
			discoveredBranchName: 'feature/foo',
		}), undefined);
	});

	test('discovered port reconciliation does nothing when the discovery is for a different branch', () => {
		assert.strictEqual(resolveWorkbenchAppPreviewDiscoveredPortReconciliation({
			serverUrl: 'http://127.0.0.1:3001/',
			serverHealthUrl: 'http://127.0.0.1:3001/health',
			serverBranch: 'feature/foo',
			serverFixedPort: undefined,
			discoveredUrl: 'http://127.0.0.1:3002/',
			discoveredBranchName: 'feature/bar',
		}), undefined);
	});

	test('discovered port reconciliation does nothing when the repo has a fixed port configured', () => {
		assert.strictEqual(resolveWorkbenchAppPreviewDiscoveredPortReconciliation({
			serverUrl: 'http://127.0.0.1:3001/',
			serverHealthUrl: 'http://127.0.0.1:3001/health',
			serverBranch: 'feature/foo',
			serverFixedPort: 3001,
			discoveredUrl: 'http://127.0.0.1:3002/',
			discoveredBranchName: 'feature/foo',
		}), undefined);
	});

	test('discovered port reconciliation does nothing when the discovered host differs', () => {
		assert.strictEqual(resolveWorkbenchAppPreviewDiscoveredPortReconciliation({
			serverUrl: 'http://127.0.0.1:3001/',
			serverHealthUrl: 'http://127.0.0.1:3001/health',
			serverBranch: 'feature/foo',
			serverFixedPort: undefined,
			discoveredUrl: 'http://example.test:3002/',
			discoveredBranchName: 'feature/foo',
		}), undefined);
	});

	test('discovered port reconciliation does nothing when there is no current server url yet', () => {
		assert.strictEqual(resolveWorkbenchAppPreviewDiscoveredPortReconciliation({
			serverUrl: undefined,
			serverHealthUrl: undefined,
			serverBranch: undefined,
			serverFixedPort: undefined,
			discoveredUrl: 'http://127.0.0.1:3002/',
			discoveredBranchName: undefined,
		}), undefined);
	});
});

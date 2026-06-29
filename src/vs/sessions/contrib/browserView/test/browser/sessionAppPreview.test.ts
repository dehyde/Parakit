/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../../../../platform/files/common/files.js';
import { ILocalGitService } from '../../../../../platform/git/common/localGitService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService, ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { BrowserEditorInput, IBeforeDisposeBrowserEditorEvent } from '../../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { extractLocalhostUrls } from '../../../../../workbench/contrib/browserView/common/appPreviewUrl.js';
import { IBrowserViewWorkbenchService } from '../../../../../workbench/contrib/browserView/common/browserView.js';
import { ITerminalInstance, ITerminalService } from '../../../../../workbench/contrib/terminal/browser/terminal.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChat, ISessionFolder, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsTasksService } from '../../../chat/browser/sessionsTasksService.js';
import { SessionAppPreviewController } from '../../browser/sessionAppPreview.js';

function tick(): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, 0));
}

async function waitFor(condition: () => boolean, message?: () => string): Promise<void> {
	for (let i = 0; i < 20; i++) {
		if (condition()) {
			return;
		}
		await tick();
	}
	assert.ok(condition(), message?.());
}

function makeSession(opts: { sessionId?: string; resource?: URI; repository?: URI; worktree?: URI; branchName?: string; loading?: boolean } = {}): IActiveSession {
	const repository = opts.repository ?? URI.file('/repo');
	const folder = {
		root: repository,
		workingDirectory: opts.worktree ?? repository,
		name: 'test',
		description: undefined,
		gitRepository: { uri: repository, workTreeUri: opts.worktree, branchName: opts.branchName, baseBranchName: undefined, gitHubInfo: constObservable(undefined) },
	} satisfies ISessionFolder;
	const chat: IChat = {
		resource: opts.resource ?? URI.parse('file:///session'),
		createdAt: new Date(),
		title: observableValue('title', 'session'),
		updatedAt: observableValue('updatedAt', new Date()),
		status: observableValue('status', SessionStatus.Untitled),
		changes: observableValue('changes', []),
		modelId: observableValue('modelId', undefined),
		mode: observableValue('mode', undefined),
		isArchived: observableValue('isArchived', false),
		isRead: observableValue('isRead', true),
		checkpoints: observableValue('checkpoints', undefined),
		lastTurnEnd: observableValue('lastTurnEnd', undefined),
		description: observableValue('description', undefined),
	} satisfies IChat;
	return {
		sessionId: opts.sessionId ?? 'test:session',
		resource: chat.resource,
		providerId: 'test',
		sessionType: 'background',
		icon: Codicon.copilot,
		createdAt: chat.createdAt,
		workspace: observableValue('workspace', {
			uri: repository,
			label: 'test',
			icon: Codicon.repo,
			folders: [folder],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false
		} satisfies ISessionWorkspace),
		title: chat.title,
		updatedAt: chat.updatedAt,
		status: chat.status,
		changesets: constObservable([]),
		changes: chat.changes,
		modelId: chat.modelId,
		mode: chat.mode,
		loading: observableValue('loading', opts.loading ?? false),
		isArchived: chat.isArchived,
		isRead: chat.isRead,
		lastTurnEnd: chat.lastTurnEnd,
		description: chat.description,
		chats: observableValue('chats', [chat]),
		activeChat: observableValue('activeChat', chat),
		mainChat: constObservable(chat),
		capabilities: { supportsMultipleChats: false },
		isCreated: observableValue('isCreated', true),
		sticky: observableValue('sticky', false),
	} satisfies IActiveSession;
}

class TestPreviewInput {
	private readonly _onBeforeDispose = new Emitter<IBeforeDisposeBrowserEditorEvent>();
	readonly onBeforeDispose = this._onBeforeDispose.event;
	private readonly _onWillDispose = new Emitter<void>();
	readonly onWillDispose = this._onWillDispose.event;
	readonly isSessionAppPreview = true;
	private _disposed = false;
	url: string | undefined;
	navigations: string[] = [];

	constructor(readonly id: string, initialUrl: string | undefined) {
		this.url = initialUrl;
	}

	isDisposed(): boolean {
		return this._disposed;
	}

	navigate(url: string): void {
		this.url = url;
		this.navigations.push(url);
	}

	dispose(force?: boolean): void {
		if (!force) {
			let vetoed = false;
			this._onBeforeDispose.fire({ veto: () => { vetoed = true; } });
			if (vetoed) {
				return;
			}
		}
		this._disposed = true;
		this._onWillDispose.fire();
	}
}

suite('Session App Preview', () => {

	test('extractLocalhostUrls finds localhost dev server URLs', () => {
		assert.deepStrictEqual(
			extractLocalhostUrls('  Local:   http://localhost:5173/'),
			['http://localhost:5173/']
		);
	});

	test('extractLocalhostUrls returns multiple localhost URLs in order', () => {
		assert.deepStrictEqual(
			extractLocalhostUrls('ready on http://localhost:3000 and http://127.0.0.1:3001/app'),
			['http://localhost:3000/', 'http://127.0.0.1:3001/app']
		);
	});

	test('extractLocalhostUrls ignores non-localhost URLs', () => {
		assert.deepStrictEqual(
			extractLocalhostUrls('ready on https://example.com and http://vscode.dev'),
			[]
		);
	});

	test('extractLocalhostUrls normalizes all-interface URLs to localhost', () => {
		assert.deepStrictEqual(
			extractLocalhostUrls('Network: http://0.0.0.0:4173/ and http://[::]:4174'),
			['http://localhost:4173/', 'http://localhost:4174/']
		);
	});

	suite('SessionAppPreviewController', () => {
		const store = new DisposableStore();
		let activeSession: ReturnType<typeof observableValue<IActiveSession | undefined>>;
		let terminalData: Emitter<{ instance: ITerminalInstance; data: string }>;
		let previews: TestPreviewInput[];
		let opened: { editor: TestPreviewInput; options: { pinned?: boolean; index?: number } | undefined; group: unknown }[];
		let browserUrls: Map<string, ReturnType<typeof observableValue<string | undefined>>>;
		let files: Map<string, string>;
		let currentBranch: string | undefined;
		let controller: SessionAppPreviewController;
		const activeGroup = { id: 1, pinEditor: () => { } };
		const workspaceRepository = URI.file('/repo');

		function activePreviews(): TestPreviewInput[] {
			return previews.filter(preview => !preview.isDisposed());
		}

		setup(() => {
			activeSession = observableValue('activeSession', undefined);
			terminalData = store.add(new Emitter<{ instance: ITerminalInstance; data: string }>());
			previews = [];
			opened = [];
			browserUrls = new Map();
			files = new Map();
			currentBranch = undefined;

			const instantiationService = store.add(new TestInstantiationService());
			instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
				override readonly activeSession = activeSession;
			});
			instantiationService.stub(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() {
				override getWorkspace(): any {
					return {
						id: 'workspace',
						folders: [{ uri: workspaceRepository, name: 'repo', index: 0 }],
					};
				}
				override getWorkbenchState(): WorkbenchState {
					return WorkbenchState.FOLDER;
				}
			});
			instantiationService.stub(ISessionsTasksService, new class extends mock<ISessionsTasksService>() {
				override getBrowserUrl(repository: URI | undefined) {
					const key = repository?.toString() ?? 'none';
					let value = browserUrls.get(key);
					if (!value) {
						value = observableValue('browserUrl', undefined);
						browserUrls.set(key, value);
					}
					return value;
				}
				override setBrowserUrl(repository: URI | undefined, url: string | undefined): void {
					this.getBrowserUrl(repository).set(url, undefined);
				}
			});
			instantiationService.stub(IBrowserViewWorkbenchService, new class extends mock<IBrowserViewWorkbenchService>() {
				override getOrCreateLazy(id: string, initialState?: { url?: string }): BrowserEditorInput {
					let preview = previews.find(p => p.id === id);
					if (!preview) {
						preview = new TestPreviewInput(id, initialState?.url);
						previews.push(preview);
					}
					return preview as unknown as BrowserEditorInput;
				}
			});
			instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
				override async openEditor(editor: any, options?: any, group?: unknown): Promise<any> {
					opened.push({ editor: editor as unknown as TestPreviewInput, options, group });
					return undefined;
				}
			});
			instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
				override get activeGroup(): any { return activeGroup; }
			});
			instantiationService.stub(ITerminalService, new class extends mock<ITerminalService>() {
				override readonly onAnyInstanceData = terminalData.event;
			});
			instantiationService.stub(IFileService, new class extends mock<IFileService>() {
				override async readFile(resource: URI): Promise<any> {
					const content = files.get(resource.toString());
					if (content === undefined) {
						throw new FileOperationError('File not found', FileOperationResult.FILE_NOT_FOUND);
					}
					return { value: VSBuffer.fromString(content) };
				}
			});
			instantiationService.stub(ILocalGitService, new class extends mock<ILocalGitService>() {
				override async currentBranch(): Promise<string | undefined> {
					return currentBranch;
				}
			});
			instantiationService.stub(ILogService, new NullLogService());
			controller = store.add(instantiationService.createInstance(SessionAppPreviewController));
		});

		teardown(() => {
			store.clear();
		});

		test('creates a pinned workspace preview at index zero when no session is active yet', async () => {
			await tick();

			assert.strictEqual(activePreviews().length, 1);
			assert.strictEqual(opened.length, 1);
			assert.strictEqual(opened[0].options?.pinned, true);
			assert.strictEqual(opened[0].options?.index, 0);
			assert.strictEqual(opened[0].group, activeGroup);
		});

		test('creates and reuses one pinned preview at index zero for a session', async () => {
			await tick();
			const session = makeSession();
			activeSession.set(session, undefined);
			await tick();
			activeSession.set(session, undefined);
			await tick();

			const [preview] = activePreviews();
			assert.ok(preview);
			assert.strictEqual(activePreviews().length, 1);
			assert.strictEqual(opened.length, 2);
			assert.strictEqual(opened[1].editor, preview);
			assert.strictEqual(opened[1].options?.pinned, true);
			assert.strictEqual(opened[1].options?.index, 0);
			assert.strictEqual(opened[1].group, activeGroup);
		});

		test('vetoes normal close attempts for the app preview', async () => {
			await tick();
			activeSession.set(makeSession(), undefined);
			await tick();

			const [preview] = activePreviews();
			preview.dispose();

			assert.strictEqual(preview.isDisposed(), false);
		});

		test('navigates to a discovered localhost URL from the active session terminal cwd', async () => {
			await tick();
			const session = makeSession({ worktree: URI.file('/worktree') });
			activeSession.set(session, undefined);
			await tick();

			terminalData.fire({
				instance: { instanceId: 1, getInitialCwd: () => Promise.resolve('/worktree') } as unknown as ITerminalInstance,
				data: 'Local: http://localhost:5173/'
			});
			await tick();

			assert.deepStrictEqual(activePreviews()[0].navigations, ['http://localhost:5173/']);
		});

		test('does not navigate to a discovered URL when an override is configured', async () => {
			await tick();
			const repository = URI.file('/repo');
			const session = makeSession({ repository, worktree: URI.file('/worktree') });
			browserUrls.set(repository.toString(), observableValue('browserUrl', 'http://localhost:3000/'));
			activeSession.set(session, undefined);
			await tick();

			terminalData.fire({
				instance: { instanceId: 1, getInitialCwd: () => Promise.resolve('/worktree') } as unknown as ITerminalInstance,
				data: 'Local: http://localhost:5173/'
			});
			await tick();

			const [preview] = activePreviews();
			assert.strictEqual(preview.url, 'http://localhost:3000/');
			assert.deepStrictEqual(preview.navigations, []);
		});

		test('navigates to branch preview target from repo config', async () => {
			await tick();
			const repository = URI.file('/repo');
			const session = makeSession({ repository, worktree: URI.file('/worktree'), branchName: 'feature/calendar' });
			files.set(URI.file('/worktree/.designer/preview.json').toString(), JSON.stringify({
				default: { url: 'http://localhost:3000/' },
				branches: {
					'feature/calendar': { url: 'http://localhost:3000/calendar?mode=prototype' }
				}
			}));
			assert.strictEqual(await (controller as any)._resolvePreviewConfigUrl(URI.file('/worktree'), 'feature/calendar'), 'http://localhost:3000/calendar?mode=prototype');

			activeSession.set(session, undefined);
			await waitFor(
				() => activePreviews()[0]?.url === 'http://localhost:3000/calendar?mode=prototype',
				() => JSON.stringify(activePreviews().map(preview => ({ id: preview.id, url: preview.url, navigations: preview.navigations, disposed: preview.isDisposed() })))
			);

			assert.strictEqual(activePreviews()[0].url, 'http://localhost:3000/calendar?mode=prototype');
			assert.deepStrictEqual(activePreviews()[0].navigations, ['http://localhost:3000/calendar?mode=prototype']);
		});

		test('branch preview target wins over stale configured browser URL', async () => {
			await tick();
			const repository = URI.file('/repo');
			const session = makeSession({ repository, worktree: URI.file('/worktree'), branchName: 'feature/new-ui' });
			browserUrls.set(repository.toString(), observableValue('browserUrl', 'http://localhost:3000/old-branch'));
			files.set(URI.file('/worktree/.designer/preview.json').toString(), JSON.stringify({
				branches: {
					'feature/new-ui': 'http://localhost:3000/new-branch'
				}
			}));

			activeSession.set(session, undefined);
			await waitFor(() => activePreviews()[0]?.url === 'http://localhost:3000/new-branch');

			assert.strictEqual(activePreviews()[0].url, 'http://localhost:3000/new-branch');
		});

		test('reloads active session preview when branch changes but URL stays the same', async () => {
			await tick();
			const repository = URI.file('/repo');
			const session = makeSession({ repository, worktree: URI.file('/worktree'), branchName: 'main' });
			files.set(URI.file('/worktree/.designer/preview.json').toString(), JSON.stringify({
				default: 'http://localhost:3000/',
			}));

			activeSession.set(session, undefined);
			await waitFor(() => activePreviews()[0]?.url === 'http://localhost:3000/');

			const [preview] = activePreviews();
			assert.deepStrictEqual(preview.navigations, ['http://localhost:3000/']);

			const workspace = session.workspace.get()!;
			const folder = workspace.folders[0];
			(session.workspace as ReturnType<typeof observableValue<ISessionWorkspace | undefined>>).set({
				...workspace,
				folders: [{
					...folder,
					gitRepository: {
						...folder.gitRepository!,
						branchName: 'feature/a',
					},
				}],
			}, undefined);
			await waitFor(() => preview.navigations.length === 2);

			assert.deepStrictEqual(preview.navigations, ['http://localhost:3000/', 'http://localhost:3000/']);
		});

		test('workspace preview updates when current git branch changes', async () => {
			currentBranch = 'main';
			files.set(URI.file('/repo/.designer/preview.json').toString(), JSON.stringify({
				default: 'http://localhost:3000/',
				branches: {
					main: 'http://localhost:3000/main',
					'feature/a': 'http://localhost:3000/feature-a'
				}
			}));
			await waitFor(() => activePreviews()[0]?.url === 'http://localhost:3000/main');

			assert.strictEqual(activePreviews()[0].url, 'http://localhost:3000/main');

			currentBranch = 'feature/a';
			await (controller as any)._refreshWorkspacePreviewFromGit();

			assert.strictEqual(activePreviews()[0].url, 'http://localhost:3000/feature-a');
		});
	});
});

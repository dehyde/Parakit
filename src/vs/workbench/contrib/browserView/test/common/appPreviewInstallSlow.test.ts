/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { resolveWorkbenchAppPreviewInstallOutcome, shouldSkipWorkbenchAppPreviewAutoStart } from '../../common/appPreviewConfig.js';

suite('AppPreviewInstallSlow', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('shouldSkipWorkbenchAppPreviewAutoStart', () => {
		test('an idle (stopped) preview is eligible for auto-start', () => {
			assert.strictEqual(
				shouldSkipWorkbenchAppPreviewAutoStart({ previewStartupInProgress: false, previewAutoStartInFlight: false, serverState: 'stopped' }),
				false,
			);
		});

		test('a server already starting is not re-triggered', () => {
			assert.strictEqual(
				shouldSkipWorkbenchAppPreviewAutoStart({ previewStartupInProgress: false, previewAutoStartInFlight: false, serverState: 'starting' }),
				true,
			);
		});

		test('a running server is not re-triggered', () => {
			assert.strictEqual(
				shouldSkipWorkbenchAppPreviewAutoStart({ previewStartupInProgress: false, previewAutoStartInFlight: false, serverState: 'running' }),
				true,
			);
		});

		test('a failed preview is not silently auto-restarted by the next poll tick (the observed incident)', () => {
			assert.strictEqual(
				shouldSkipWorkbenchAppPreviewAutoStart({ previewStartupInProgress: false, previewAutoStartInFlight: false, serverState: 'failed' }),
				true,
			);
		});

		test('an in-progress startup is not re-triggered even if the server state looks stopped', () => {
			assert.strictEqual(
				shouldSkipWorkbenchAppPreviewAutoStart({ previewStartupInProgress: true, previewAutoStartInFlight: false, serverState: 'stopped' }),
				true,
			);
		});

		test('an in-flight auto-start is not re-triggered concurrently', () => {
			assert.strictEqual(
				shouldSkipWorkbenchAppPreviewAutoStart({ previewStartupInProgress: false, previewAutoStartInFlight: true, serverState: 'stopped' }),
				true,
			);
		});
	});

	suite('resolveWorkbenchAppPreviewInstallOutcome', () => {
		test('a clean exit is a success', () => {
			assert.strictEqual(
				resolveWorkbenchAppPreviewInstallOutcome({ serverTerminalExited: false, exitCode: 0 }),
				'succeeded',
			);
		});

		test('an install that never reports an exit code (e.g. still running when checked) is treated as success, not slow', () => {
			assert.strictEqual(
				resolveWorkbenchAppPreviewInstallOutcome({ serverTerminalExited: false, exitCode: undefined }),
				'succeeded',
			);
		});

		test('a non-zero exit code is a real failure', () => {
			assert.strictEqual(
				resolveWorkbenchAppPreviewInstallOutcome({ serverTerminalExited: false, exitCode: 1 }),
				'failed',
			);
		});

		test('the terminal actually exiting is a crash, even with no exit code yet', () => {
			assert.strictEqual(
				resolveWorkbenchAppPreviewInstallOutcome({ serverTerminalExited: true, exitCode: undefined }),
				'crashed',
			);
		});

		test('a terminal exit takes priority over a reported exit code', () => {
			assert.strictEqual(
				resolveWorkbenchAppPreviewInstallOutcome({ serverTerminalExited: true, exitCode: 0 }),
				'crashed',
			);
		});
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { DesignerAutoSaveScheduler, getDesignerAutoSavePolicy, isDesignerBranchName } from '../designerAutoSave';

suite('designer auto-save', () => {
	suite('policy', () => {
		test('recognizes design branches', () => {
			assert.strictEqual(isDesignerBranchName('design/card'), true);
			assert.strictEqual(isDesignerBranchName('design/nested/card'), true);
			assert.strictEqual(isDesignerBranchName('main'), false);
			assert.strictEqual(isDesignerBranchName('designer/card'), false);
			assert.strictEqual(isDesignerBranchName(undefined), false);
		});

		test('pushes design branches automatically', () => {
			assert.deepStrictEqual(getDesignerAutoSavePolicy('design/card', 'background'), {
				branchKind: 'design',
				commit: true,
				push: true,
				requiresRemoteConfirmation: false
			});
		});

		test('commits non-design branches locally without automatic push', () => {
			assert.deepStrictEqual(getDesignerAutoSavePolicy('main', 'background'), {
				branchKind: 'shared',
				commit: true,
				push: false,
				requiresRemoteConfirmation: true
			});
		});

		test('allows confirmed shared branch remote push', () => {
			assert.deepStrictEqual(getDesignerAutoSavePolicy('main', 'manualRemote', true), {
				branchKind: 'shared',
				commit: true,
				push: true,
				requiresRemoteConfirmation: true
			});
		});
	});

	suite('scheduler', () => {
		test('collapses changes within the idle window into one save', async () => {
			const clock = new ManualClock();
			let saves = 0;
			const scheduler = new DesignerAutoSaveScheduler({
				idleMs: 30_000,
				maxMs: 120_000,
				setTimeout: clock.setTimeout,
				clearTimeout: clock.clearTimeout,
				run: async () => { saves++; }
			});

			scheduler.markDirty();
			clock.tick(10_000);
			scheduler.markDirty();
			clock.tick(29_999);
			assert.strictEqual(saves, 0);

			clock.tick(1);
			await Promise.resolve();
			assert.strictEqual(saves, 1);
		});

		test('runs at max delay during continuous changes', async () => {
			const clock = new ManualClock();
			let saves = 0;
			const scheduler = new DesignerAutoSaveScheduler({
				idleMs: 30_000,
				maxMs: 120_000,
				setTimeout: clock.setTimeout,
				clearTimeout: clock.clearTimeout,
				run: async () => { saves++; }
			});

			scheduler.markDirty();
			for (let i = 0; i < 11; i++) {
				clock.tick(10_000);
				scheduler.markDirty();
			}

			assert.strictEqual(saves, 0);
			clock.tick(10_000);
			await Promise.resolve();
			assert.strictEqual(saves, 1);
		});

		test('serializes concurrent saves and reruns when changes arrive during a save', async () => {
			const clock = new ManualClock();
			let saves = 0;
			let finishSave: (() => void) | undefined;
			const scheduler = new DesignerAutoSaveScheduler({
				idleMs: 30_000,
				maxMs: 120_000,
				setTimeout: clock.setTimeout,
				clearTimeout: clock.clearTimeout,
				run: async () => {
					saves++;
					await new Promise<void>(resolve => finishSave = resolve);
				}
			});

			scheduler.markDirty();
			clock.tick(30_000);
			await Promise.resolve();
			assert.strictEqual(saves, 1);

			scheduler.markDirty();
			clock.tick(30_000);
			await Promise.resolve();
			assert.strictEqual(saves, 1);

			finishSave?.();
			await Promise.resolve();
			await Promise.resolve();
			assert.strictEqual(saves, 2);
		});
	});
});

class ManualClock {
	private now = 0;
	private nextHandle = 1;
	private readonly timers = new Map<number, { time: number; callback: () => void }>();

	readonly setTimeout = (callback: () => void, delay: number): number => {
		const handle = this.nextHandle++;
		this.timers.set(handle, { time: this.now + delay, callback });
		return handle;
	};

	readonly clearTimeout = (handle: unknown): void => {
		this.timers.delete(handle as number);
	};

	tick(ms: number): void {
		this.now += ms;

		while (true) {
			const next = [...this.timers.entries()]
				.filter(([, timer]) => timer.time <= this.now)
				.sort((a, b) => a[1].time - b[1].time)[0];

			if (!next) {
				return;
			}

			this.timers.delete(next[0]);
			next[1].callback();
		}
	}
}

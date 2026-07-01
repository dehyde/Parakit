/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const DesignerAutoSaveCommitMessage = 'chore(design): auto-save changes';
export const DesignerAutoSaveIdleDelayMs = 30_000;
export const DesignerAutoSaveMaxDelayMs = 120_000;
export const DesignerMainlineManualRemoteApprovalText = 'I approve';

export type DesignerAutoSaveTrigger = 'background' | 'manual' | 'preSwitch' | 'preCriticalAction' | 'manualRemote';
export type DesignerAutoSaveBranchKind = 'design' | 'shared' | 'mainline';

export interface DesignerAutoSavePolicy {
	readonly branchKind: DesignerAutoSaveBranchKind;
	readonly commit: boolean;
	readonly push: boolean;
	readonly requiresRemoteConfirmation: boolean;
	readonly requiresMainlineApproval: boolean;
	readonly promptForManualCommit: boolean;
}

export function isDesignerBranchName(branchName: string | undefined): boolean {
	return branchName?.startsWith('design/') === true;
}

export function isDesignerMainlineBranchName(branchName: string | undefined): boolean {
	return branchName === 'main' || branchName === 'master';
}

export function getDesignerAutoSavePolicy(branchName: string | undefined, trigger: DesignerAutoSaveTrigger, remoteConfirmed = false, mainlineApproved = false): DesignerAutoSavePolicy {
	const branchKind: DesignerAutoSaveBranchKind = isDesignerBranchName(branchName)
		? 'design'
		: isDesignerMainlineBranchName(branchName)
			? 'mainline'
			: 'shared';
	const requiresRemoteConfirmation = branchKind !== 'design';
	const requiresMainlineApproval = branchKind === 'mainline';
	const remotePushConfirmed = trigger === 'manualRemote' && remoteConfirmed;

	return {
		branchKind,
		commit: branchKind === 'design',
		push: branchKind === 'design' ||
			(branchKind === 'shared' && remotePushConfirmed) ||
			(branchKind === 'mainline' && remotePushConfirmed && mainlineApproved),
		requiresRemoteConfirmation,
		requiresMainlineApproval,
		promptForManualCommit: branchKind === 'shared'
	};
}

export interface DesignerAutoSaveSchedulerOptions {
	readonly idleMs: number;
	readonly maxMs: number;
	readonly setTimeout: (callback: () => void, delay: number) => unknown;
	readonly clearTimeout: (handle: unknown) => void;
	readonly run: () => Promise<void>;
}

export class DesignerAutoSaveScheduler {
	private idleTimer: unknown | undefined;
	private maxTimer: unknown | undefined;
	private running = false;
	private dirtyWhileRunning = false;

	constructor(private readonly options: DesignerAutoSaveSchedulerOptions) { }

	markDirty(): void {
		if (this.running) {
			this.dirtyWhileRunning = true;
			return;
		}

		this.clearIdleTimer();
		this.idleTimer = this.options.setTimeout(() => this.run(), this.options.idleMs);

		if (this.maxTimer === undefined) {
			this.maxTimer = this.options.setTimeout(() => this.run(), this.options.maxMs);
		}
	}

	dispose(): void {
		this.clearIdleTimer();
		this.clearMaxTimer();
	}

	private async run(): Promise<void> {
		if (this.running) {
			this.dirtyWhileRunning = true;
			return;
		}

		this.clearIdleTimer();
		this.clearMaxTimer();
		this.running = true;

		try {
			await this.options.run();
		} finally {
			this.running = false;

			if (this.dirtyWhileRunning) {
				this.dirtyWhileRunning = false;
				this.run();
			}
		}
	}

	private clearIdleTimer(): void {
		if (this.idleTimer !== undefined) {
			this.options.clearTimeout(this.idleTimer);
			this.idleTimer = undefined;
		}
	}

	private clearMaxTimer(): void {
		if (this.maxTimer !== undefined) {
			this.options.clearTimeout(this.maxTimer);
			this.maxTimer = undefined;
		}
	}
}

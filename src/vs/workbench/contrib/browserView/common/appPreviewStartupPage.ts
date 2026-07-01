/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';

export const WORKBENCH_APP_PREVIEW_STARTUP_HEALTH_TIMEOUT = 150_000;

export type WorkbenchAppPreviewStartupPhase = 'starting' | 'serverStarting' | 'healthChecking' | 'opening' | 'slow' | 'failed' | 'setup';
export type WorkbenchAppPreviewStartupStageStatus = 'done' | 'current' | 'pending';
export type WorkbenchAppPreviewStartupAction = 'retry' | 'restart' | 'logs' | 'copy';

export interface IWorkbenchAppPreviewStartupStage {
	readonly label: string;
	readonly status: WorkbenchAppPreviewStartupStageStatus;
	readonly startedAt?: number;
}

export interface IWorkbenchAppPreviewStartupPageState {
	readonly phase: WorkbenchAppPreviewStartupPhase;
	readonly title: string;
	readonly message: string;
	readonly stages?: readonly IWorkbenchAppPreviewStartupStage[];
	readonly currentStageStartedAt?: number;
	readonly lastServerOutputAt?: number;
	readonly branchName?: string;
	readonly previousBranchName?: string;
	readonly repoPath?: string;
	readonly port?: number;
	readonly url?: string;
	readonly healthUrl?: string;
	readonly command?: string;
	readonly cwd?: string;
	readonly details?: readonly string[];
	readonly agentContext?: string;
	readonly actions?: readonly WorkbenchAppPreviewStartupAction[];
}

function escapeHtml(value: string | undefined): string {
	return (value ?? '').replace(/[&<>"']/g, ch => {
		switch (ch) {
			case '&': return '&amp;';
			case '<': return '&lt;';
			case '>': return '&gt;';
			case '"': return '&quot;';
			case '\'': return '&#39;';
			default: return ch;
		}
	});
}

export function getWorkbenchAppPreviewStartupTitle(phase: WorkbenchAppPreviewStartupPhase, branchName: string | undefined): string {
	const subject = branchName?.trim() || 'this workspace';
	if (phase === 'slow') {
		return 'Preview is taking longer than expected';
	}
	if (phase === 'failed') {
		return 'Preview could not start';
	}
	if (phase === 'setup') {
		return 'Preview needs configuration';
	}
	if (phase === 'opening') {
		return `Opening preview of ${subject}`;
	}
	return `Starting preview of ${subject}`;
}

export function createWorkbenchAppPreviewStartupDataUrl(state: IWorkbenchAppPreviewStartupPageState, startupAnimationSrc = ''): string {
	const details = state.details?.filter(Boolean) ?? [];
	const actions = new Set<WorkbenchAppPreviewStartupAction>();
	for (const action of state.actions ?? []) {
		if (action !== 'copy' || state.phase === 'slow') {
			actions.add(action);
		}
	}
	const agentContext = state.agentContext ?? '';
	const stages = state.stages ?? [];
	const showActivity = !!state.command && (state.phase === 'serverStarting' || state.phase === 'healthChecking' || state.phase === 'slow' || state.phase === 'failed');
	const detailRows = [
		state.branchName ? `Branch: ${state.branchName}` : undefined,
		state.previousBranchName && state.previousBranchName !== state.branchName ? `Previous branch: ${state.previousBranchName}` : undefined,
		state.port ? `Port: ${state.port}` : undefined,
		state.healthUrl ? `Health check: ${state.healthUrl}` : undefined,
		state.url ? `Preview URL: ${state.url}` : undefined,
		...details
	].filter((value): value is string => !!value);

	const actionButton = (action: WorkbenchAppPreviewStartupAction, label: string): string =>
		actions.has(action) ? `<button type="button" data-action="${action}">${escapeHtml(label)}</button>` : '';
	const stageIcon = (status: WorkbenchAppPreviewStartupStageStatus): string => status === 'done' ? '&#10003;' : status === 'current' ? '&bull;' : '';
	const stageRows = stages.map(stage => `<li class="stage stage-${stage.status}">
		<span class="stage-icon">${stageIcon(stage.status)}</span>
		<span class="stage-label">${escapeHtml(stage.label)}</span>
		${stage.status === 'current' && stage.startedAt ? `<span class="stage-elapsed" data-started-at="${stage.startedAt}">0s</span>` : ''}
	</li>`).join('');

	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<title>${escapeHtml(state.title)}</title>
<style>
	:root { color-scheme: light dark; --app-preview-accent: #0000ff; --app-preview-accent-hover: #0000d6; --app-preview-background: #ffffff; --app-preview-foreground: #1f1f1f; --app-preview-muted: rgba(31, 31, 31, 0.64); --app-preview-subtle: rgba(31, 31, 31, 0.48); --app-preview-border: rgba(31, 31, 31, 0.18); font-family: "IBM Plex Mono", monospace; font-size: 13px; }
	@media (prefers-color-scheme: dark) { :root { --app-preview-background: #1e1e1e; --app-preview-foreground: #f3f3f3; --app-preview-muted: rgba(243, 243, 243, 0.68); --app-preview-subtle: rgba(243, 243, 243, 0.5); --app-preview-border: rgba(243, 243, 243, 0.18); } }
	body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--app-preview-background); color: var(--app-preview-foreground); font-family: inherit; font-size: 13px; }
	main { width: min(560px, calc(100vw - 48px)); display: grid; gap: 18px; }
	.status { display: flex; align-items: center; gap: 14px; }
	.startup-animation { width: 54px; height: 54px; object-fit: contain; flex: 0 0 auto; }
	.icon { width: 24px; height: 24px; display: grid; place-items: center; border: 1px solid var(--app-preview-accent); border-radius: 50%; color: var(--app-preview-accent); font-size: 14px; font-weight: 600; }
	h1 { margin: 0; font-size: 20px; font-weight: 600; line-height: 26px; letter-spacing: 0; }
	p { margin: 0; line-height: 1.45; color: var(--app-preview-muted); }
	.stages { margin: 2px 0 0; padding: 0; list-style: none; display: grid; gap: 8px; }
	.stage { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; gap: 8px; align-items: center; font-size: 13px; color: var(--app-preview-subtle); }
	.stage-current { color: var(--app-preview-foreground); font-weight: 600; }
	.stage-current .stage-icon { color: var(--app-preview-accent); }
	.stage-done { color: var(--app-preview-muted); }
	.stage-done .stage-icon { color: var(--app-preview-accent); }
	.stage-pending { color: var(--app-preview-subtle); }
	.stage-icon { width: 20px; text-align: center; font-size: 13px; }
	.stage-label { overflow-wrap: anywhere; }
	.stage-elapsed { font-weight: 500; color: var(--app-preview-muted); font-variant-numeric: tabular-nums; }
	.activity { min-height: 18px; font-size: 12px; color: var(--app-preview-muted); }
	.actions { display: flex; flex-wrap: wrap; gap: 8px; }
	button { appearance: none; border: 0; border-radius: 4px; background: var(--app-preview-accent); color: #ffffff; padding: 6px 10px; font: inherit; font-size: 13px; font-weight: 500; line-height: 18px; cursor: pointer; }
	button:hover { background: var(--app-preview-accent-hover); }
	button:focus-visible { outline: 1px solid var(--app-preview-accent); outline-offset: 2px; }
	.copied { min-height: 18px; font-size: 12px; color: var(--app-preview-muted); white-space: pre-wrap; }
	.more-info { margin-top: 8px; font-size: 12px; color: var(--app-preview-subtle); }
	.more-info > summary { cursor: pointer; width: fit-content; list-style: none; }
	.more-info > summary::-webkit-details-marker { display: none; }
	.more-info > summary:hover { color: var(--app-preview-accent); }
	.caption { margin-top: 8px; color: var(--app-preview-subtle); font-size: 12px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
</head>
<body>
<main>
	<section class="status">
		${state.phase === 'slow' || state.phase === 'failed' ? '<div class="icon">!</div>' : `<img class="startup-animation" src="${escapeHtml(startupAnimationSrc)}" alt="" aria-hidden="true">`}
		<div>
			<h1>${escapeHtml(state.title)}</h1>
			<p>${escapeHtml(state.message)}</p>
		</div>
	</section>
	${stages.length ? `<ol class="stages">${stageRows}</ol>` : ''}
	${showActivity ? `<div class="activity" data-last-output-at="${state.lastServerOutputAt ?? ''}" aria-live="polite"></div>` : ''}
	${actions.size ? `<section class="actions">
		${actionButton('retry', 'Retry')}
		${actionButton('restart', 'Restart preview server')}
		${actionButton('logs', 'Show terminal logs')}
		${actionButton('copy', 'Copy context for agent')}
	</section>` : ''}
	<div class="copied" aria-live="polite"></div>
	${detailRows.length ? `<details class="more-info"><summary>Show more info</summary><p class="caption">${escapeHtml(detailRows.join('\n'))}</p></details>` : ''}
</main>
<script>
	const agentContext = ${JSON.stringify(agentContext)};
	const formatElapsed = (startedAt) => {
		const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
		return elapsed < 60 ? elapsed + 's' : Math.floor(elapsed / 60) + 'm ' + String(elapsed % 60).padStart(2, '0') + 's';
	};
	const updateTimers = () => {
		for (const element of document.querySelectorAll('.stage-elapsed[data-started-at]')) {
			const startedAt = Number(element.getAttribute('data-started-at'));
			if (Number.isFinite(startedAt) && startedAt > 0) {
				element.textContent = formatElapsed(startedAt);
			}
		}
		const activity = document.querySelector('.activity[data-last-output-at]');
		const lastOutputAt = Number(activity?.getAttribute('data-last-output-at'));
		if (activity && Number.isFinite(lastOutputAt) && lastOutputAt > 0) {
			activity.textContent = 'Last server output ' + formatElapsed(lastOutputAt) + ' ago';
		} else if (activity) {
			activity.textContent = 'Waiting for server output...';
		}
	};
	updateTimers();
	setInterval(updateTimers, 1000);
	for (const button of document.querySelectorAll('button[data-action]')) {
		button.addEventListener('click', async () => {
			const action = button.getAttribute('data-action');
			if (action === 'copy') {
				document.querySelector('.copied').textContent = 'Copying context for agent...';
				location.href = 'about:blank#app-preview-action=copy&nonce=' + Date.now();
				return;
			}
			location.href = 'about:blank#app-preview-action=' + encodeURIComponent(action ?? '') + '&nonce=' + Date.now();
		});
	}
</script>
</body>
</html>`;

	return `data:text/html;base64,${encodeBase64(VSBuffer.fromString(html))}`;
}

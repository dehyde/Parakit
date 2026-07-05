/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const DEFAULT_DEV_PORT_ENV = 'PORT';
const DEFAULT_DEV_URL_TEMPLATE = 'http://127.0.0.1:${PORT}/';
const LOOPBACK_PREVIEW_HOST = '127.0.0.1';
const WILDCARD_PREVIEW_HOSTS = new Set(['0.0.0.0', '::', '[::]']);
const LOOPBACK_PREVIEW_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export interface IPreviewConfigTarget {
	url?: string;
}

export interface IPreviewConfig {
	url?: string;
	defaultUrl?: string;
	default?: string | IPreviewConfigTarget;
	branches?: Record<string, string | IPreviewConfigTarget>;
}

export interface IWorkbenchAppPreviewUrlCandidates {
	readonly localBranchOverride?: string;
	readonly localDefaultOverride?: string;
	readonly repoBranchUrl?: string;
	readonly repoDefaultUrl?: string;
	readonly runningServerUrl?: string;
	readonly discoveredUrl?: string;
}

export interface IWorkbenchAppPreviewPreferredUrlCandidates extends IWorkbenchAppPreviewUrlCandidates {
	readonly allowRunningServerFallback: boolean;
}

export type WorkbenchAppPreviewHomeTargetSource = 'localBranchOverride' | 'localCanonicalBranchUrl' | 'localCanonicalDefaultUrl' | 'localDefaultOverride' | 'repoBranchUrl' | 'repoDefaultUrl';

export interface IWorkbenchAppPreviewHomeTarget {
	readonly source: WorkbenchAppPreviewHomeTargetSource;
	readonly url: string;
}

export interface IWorkbenchAppPreviewNavigationPolicy {
	readonly currentUrl: string | undefined;
	readonly preferredUrl: string | undefined;
	readonly isNewPreview: boolean;
	readonly branchChanged: boolean;
	readonly branchOpenedInSession?: boolean;
}

export interface IWorkbenchAppPreviewForcedNavigationPolicy {
	readonly currentUrl: string | undefined;
	readonly isNewPreview: boolean;
	readonly branchOpenedInSession?: boolean;
}

export interface IWorkbenchAppPreviewDevConfigTarget {
	command?: string;
	cwd?: string;
	portEnv?: string;
	url?: string;
	healthPath?: string;
}

export interface IWorkbenchAppPreviewDevConfig {
	default?: IWorkbenchAppPreviewDevConfigTarget;
	branches?: Record<string, IWorkbenchAppPreviewDevConfigTarget>;
}

export interface IResolvedWorkbenchAppPreviewDevConfig {
	command: string;
	corepackCommand?: string;
	cwd?: string;
	portEnv?: string;
	url: string;
	healthPath?: string;
	fixedPort?: number;
	installCommand?: string;
	corepackInstallCommand?: string;
	dependencyReadiness?: 'ready' | 'missing' | 'stale';
}

export interface IWorkbenchAppPreviewResolvedServer {
	command: string;
	env: Record<string, string>;
	url: string;
	healthUrl: string;
}

export interface IWorkbenchAppPreviewBranchRuntime {
	readonly port?: number;
	readonly lastUrl?: string;
	readonly lastSuccessfulUrl?: string;
	readonly lastSuccessfulAt?: number;
}

export interface IWorkbenchAppPreviewCommandAttempt {
	readonly commandId: string;
	readonly args: readonly unknown[];
}

export interface IWorkbenchAppPreviewEnv {
	readonly [key: string]: string | undefined;
}

export interface IWorkbenchAppPreviewHealthFailureRestartPolicy {
	readonly previewStartupInProgress: boolean;
	readonly backgroundRestartInFlight: boolean;
	readonly serverProcessAlive: boolean;
	readonly backgroundRestartAttempts: number;
	readonly maxBackgroundRestartAttempts: number;
}

export interface IWorkbenchAppPreviewLoadErrorRecoveryPolicy {
	readonly errorUrl: string | undefined;
	readonly errorCode: number;
	readonly serverUrl: string | undefined;
	readonly activeManagedPreviewUrl?: string | undefined;
}

export type WorkbenchAppPreviewServerState = 'stopped' | 'starting' | 'running' | 'failed';
export type WorkbenchAppPreviewHealthState = 'unknown' | 'healthy' | 'reachable' | 'unhealthy';

export interface IWorkbenchAppPreviewLoadErrorRestartPolicy {
	readonly recoverableLoadError: boolean;
	readonly serverProcessAlive: boolean;
	readonly serverState?: WorkbenchAppPreviewServerState;
}

export interface IWorkbenchAppPreviewLoadEventGatePolicy {
	readonly eventLoading: boolean;
	readonly hasError: boolean;
	readonly previewStartupInProgress: boolean;
	readonly previewLoadFailureRecoveryInFlight: boolean;
	readonly serverStartInFlight: boolean;
}

export interface IWorkbenchAppPreviewLoadErrorOverlayPolicy {
	readonly previewStartupInProgress: boolean;
	readonly errorUrl: string | undefined;
	readonly errorCode: number;
}

export interface IWorkbenchAppPreviewServerCommandExitPolicy {
	readonly serverState: WorkbenchAppPreviewServerState;
	readonly serverHealth: WorkbenchAppPreviewHealthState;
}

export interface IWorkbenchAppPreviewHealthTimeoutPolicy {
	readonly serverState: WorkbenchAppPreviewServerState;
	readonly serverHealth: WorkbenchAppPreviewHealthState;
	readonly serverTerminalExited: boolean;
	readonly serverCommandActive?: boolean;
}

export interface IWorkbenchAppPreviewAutoStartGatePolicy {
	readonly previewStartupInProgress: boolean;
	readonly previewAutoStartInFlight: boolean;
	readonly serverState: WorkbenchAppPreviewServerState;
}

export interface IWorkbenchAppPreviewInstallOutcomePolicy {
	readonly serverTerminalExited: boolean;
	readonly exitCode?: number;
}

export type WorkbenchAppPreviewInstallOutcome = 'succeeded' | 'crashed' | 'failed';

export interface IWorkbenchAppPreviewServerStartConfigurationPolicy {
	readonly configuredUrl: string | undefined;
	readonly inferredStartupUrl?: string | undefined;
	readonly needsConfigurationPrompt: boolean;
	readonly hasRunnableServerConfig?: boolean;
	readonly canStartServerWithoutInstall?: boolean;
}

export interface IWorkbenchAppPreviewInferredStartupUrlPolicy {
	readonly port?: number;
	readonly branchRuntime?: IWorkbenchAppPreviewBranchRuntime;
	readonly repoRuntimes?: readonly IWorkbenchAppPreviewBranchRuntime[];
}

export interface IWorkbenchAppPreviewAdvertisedUrlResolutionPolicy {
	readonly currentServerUrl: string | undefined;
	readonly advertisedUrl: string;
}

export interface IWorkbenchAppPreviewHeuristicPackageManagerConfig {
	readonly scriptCommandPrefix: string;
	readonly corepackScriptCommandPrefix?: string;
	readonly installCommand?: string;
	readonly corepackInstallCommand?: string;
	readonly dependencyReadiness?: 'ready' | 'missing' | 'stale';
}

export type WorkbenchAppPreviewTerminalFailure = 'portConflict' | 'missingBinary' | 'moduleNotFound' | 'permissionDenied' | 'unknown';

export interface IWorkbenchAppPreviewStartupPageKeyStage {
	readonly label: string;
	readonly status: string;
	readonly startedAt?: number;
}

export interface IWorkbenchAppPreviewStartupPageKeyState {
	readonly phase: string;
	readonly title: string;
	readonly message: string;
	readonly stages?: readonly IWorkbenchAppPreviewStartupPageKeyStage[];
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
	readonly actions?: readonly string[];
}

export function hasWorkbenchAppPreviewPortTemplate(url: string | undefined): boolean {
	return !!url?.includes('${PORT}');
}

export function normalizeWorkbenchAppPreviewLoopbackUrl(url: string): string {
	try {
		const parsed = new URL(url);
		if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && WILDCARD_PREVIEW_HOSTS.has(parsed.hostname)) {
			parsed.hostname = LOOPBACK_PREVIEW_HOST;
			return parsed.toString();
		}
	} catch {
		// Leave invalid/non-URL input unchanged for existing validation paths.
	}

	return url;
}

export function getWorkbenchAppPreviewHealthFetchMode(url: string): 'cors' | 'no-cors' {
	try {
		const parsed = new URL(url);
		if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && isWorkbenchAppPreviewLocalHost(parsed.hostname)) {
			return 'no-cors';
		}
	} catch {
		// Preserve the default fetch mode for invalid input so callers keep existing error handling.
	}

	return 'cors';
}

export interface IWorkbenchAppPreviewHealthSignals {
	/** The dev server answered an HTTP request (transport reachability). */
	readonly httpReachable: boolean;
	/** The preview tab is currently pointed at the dev server origin (i.e. we can see the app). */
	readonly previewOnServerOrigin: boolean;
	/** Whether the app actually rendered: true/false when probed, undefined when it could not be. */
	readonly renderVerified: boolean | undefined;
}

/**
 * Derive the reported health from independent signals so a reachable transport can never be
 * mistaken for a rendered app (the "healthy but blank" failure):
 * - not reachable -> `unhealthy`.
 * - reachable but not looking at the app yet (still on the startup/blank page) -> `reachable`.
 * - reachable and the app is confirmed rendered -> `healthy`.
 * - reachable but the app is confirmed NOT rendered (empty root / document not complete) -> `reachable`.
 * - reachable and render could not be determined (no probe available) -> `healthy` (fail open, so a
 *   missing/blocked probe never regresses an otherwise working preview).
 */
export function resolveWorkbenchAppPreviewHealthFromSignals(signals: IWorkbenchAppPreviewHealthSignals): WorkbenchAppPreviewHealthState {
	if (!signals.httpReachable) {
		return 'unhealthy';
	}
	if (!signals.previewOnServerOrigin) {
		return 'reachable';
	}
	if (signals.renderVerified === false) {
		return 'reachable';
	}
	return 'healthy';
}

export function getTargetUrl(target: string | IPreviewConfigTarget | undefined): string | undefined {
	return typeof target === 'string' ? target : target?.url;
}

export function getDefaultPreviewUrl(config: IPreviewConfig): string | undefined {
	return getTargetUrl(config.default) ?? config.defaultUrl ?? config.url;
}

export function getPreviewUrlForBranch(config: IPreviewConfig, branchName: string | undefined): string | undefined {
	if (!branchName) {
		return getDefaultPreviewUrl(config);
	}

	return getTargetUrl(config.branches?.[branchName]) ?? getDefaultPreviewUrl(config);
}

export function getPreviewBranchUrl(config: IPreviewConfig, branchName: string | undefined): string | undefined {
	return branchName ? getTargetUrl(config.branches?.[branchName]) : undefined;
}

export function resolveWorkbenchAppPreviewUrl(candidates: IWorkbenchAppPreviewUrlCandidates): string | undefined {
	return candidates.localBranchOverride?.trim() ||
		candidates.localDefaultOverride?.trim() ||
		candidates.repoBranchUrl?.trim() ||
		candidates.repoDefaultUrl?.trim() ||
		candidates.runningServerUrl?.trim() ||
		candidates.discoveredUrl?.trim() ||
		undefined;
}

export function resolveWorkbenchAppPreviewPreferredUrl(candidates: IWorkbenchAppPreviewPreferredUrlCandidates): string | undefined {
	const duplicateDiscoveredRunningServerUrl = !candidates.allowRunningServerFallback && isWorkbenchAppPreviewLoopbackUrl(candidates.runningServerUrl) && areWorkbenchAppPreviewUrlsEqual(candidates.discoveredUrl, candidates.runningServerUrl);
	const runningServerUrl = candidates.allowRunningServerFallback ? candidates.runningServerUrl : undefined;
	const discoveredUrl = duplicateDiscoveredRunningServerUrl
		? undefined
		: candidates.discoveredUrl;

	const resolved = resolveWorkbenchAppPreviewUrl({
		localBranchOverride: candidates.localBranchOverride,
		localDefaultOverride: candidates.localDefaultOverride,
		repoBranchUrl: candidates.repoBranchUrl,
		repoDefaultUrl: candidates.repoDefaultUrl,
		runningServerUrl,
		discoveredUrl,
	});

	return resolved ?? (duplicateDiscoveredRunningServerUrl ? candidates.runningServerUrl?.trim() || undefined : undefined);
}

function areWorkbenchAppPreviewUrlsEqual(first: string | undefined, second: string | undefined): boolean {
	const firstTrimmed = first?.trim();
	const secondTrimmed = second?.trim();
	if (!firstTrimmed || !secondTrimmed) {
		return false;
	}

	try {
		return new URL(firstTrimmed).toString() === new URL(secondTrimmed).toString();
	} catch {
		return firstTrimmed === secondTrimmed;
	}
}

export function isWorkbenchAppPreviewLoopbackUrl(url: string | undefined): boolean {
	if (!url) {
		return false;
	}

	try {
		const parsed = new URL(url);
		return isWorkbenchAppPreviewLoopbackHost(parsed.hostname);
	} catch {
		return false;
	}
}

function isWorkbenchAppPreviewLocalUrl(url: string | undefined): boolean {
	if (!url) {
		return false;
	}

	try {
		const parsed = new URL(url);
		return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && isWorkbenchAppPreviewLocalHost(parsed.hostname);
	} catch {
		return false;
	}
}

function isWorkbenchAppPreviewLoopbackHost(hostname: string): boolean {
	return LOOPBACK_PREVIEW_HOSTS.has(hostname.toLowerCase());
}

function isWorkbenchAppPreviewLocalHost(hostname: string): boolean {
	const normalized = hostname.toLowerCase();
	return isWorkbenchAppPreviewLoopbackHost(normalized) || normalized.startsWith('local.');
}

function getWorkbenchAppPreviewComparablePort(url: URL): string {
	return url.port || (url.protocol === 'https:' ? '443' : url.protocol === 'http:' ? '80' : '');
}

export function isWorkbenchAppPreviewManagedLocalUrl(url: string | undefined, port: number | undefined): boolean {
	if (!url || port === undefined) {
		return false;
	}

	try {
		const parsed = new URL(url);
		return isWorkbenchAppPreviewLocalHost(parsed.hostname) && getWorkbenchAppPreviewComparablePort(parsed) === String(port);
	} catch {
		return false;
	}
}

export function resolveWorkbenchAppPreviewHomeTargets(candidates: IWorkbenchAppPreviewUrlCandidates): readonly IWorkbenchAppPreviewHomeTarget[] {
	const targets: IWorkbenchAppPreviewHomeTarget[] = [];
	const seen = new Set<string>();
	const add = (source: WorkbenchAppPreviewHomeTargetSource, url: string | undefined) => {
		const trimmed = url?.trim();
		if (!trimmed || seen.has(trimmed)) {
			return;
		}

		seen.add(trimmed);
		targets.push({ source, url: trimmed });
	};

	const localBranchOverride = candidates.localBranchOverride?.trim();
	const localDefaultOverride = candidates.localDefaultOverride?.trim();
	const repoBranchUrl = candidates.repoBranchUrl?.trim();
	const repoDefaultUrl = candidates.repoDefaultUrl?.trim();
	const localBaseUrl = localBranchOverride ?? localDefaultOverride ?? candidates.runningServerUrl?.trim() ?? candidates.discoveredUrl?.trim();

	add('localBranchOverride', localBranchOverride);
	add('localCanonicalBranchUrl', resolveWorkbenchAppPreviewUrlOnOrigin(localBaseUrl, repoBranchUrl));
	add('localCanonicalDefaultUrl', resolveWorkbenchAppPreviewUrlOnOrigin(localBaseUrl, repoDefaultUrl));
	add('localDefaultOverride', localDefaultOverride);
	add('repoBranchUrl', repoBranchUrl);
	add('repoDefaultUrl', repoDefaultUrl);
	return targets;
}

export function resolveWorkbenchAppPreviewUrlOnOrigin(originUrl: string | undefined, routeUrl: string | undefined): string | undefined {
	if (!originUrl || !routeUrl) {
		return undefined;
	}

	let origin: URL;
	let route: URL;
	try {
		origin = new URL(originUrl);
		route = new URL(routeUrl);
	} catch {
		return undefined;
	}

	if (origin.protocol !== route.protocol || origin.hostname !== route.hostname) {
		return undefined;
	}

	origin.pathname = route.pathname;
	origin.search = route.search;
	origin.hash = route.hash;
	return origin.toString();
}

export function shouldNavigateWorkbenchAppPreview(policy: IWorkbenchAppPreviewNavigationPolicy): boolean {
	if (!policy.preferredUrl || policy.currentUrl === policy.preferredUrl) {
		return false;
	}

	return policy.isNewPreview || !policy.branchOpenedInSession || isWorkbenchAppPreviewBlankOrStartupUrl(policy.currentUrl);
}

export function shouldForceNavigateWorkbenchAppPreview(policy: IWorkbenchAppPreviewForcedNavigationPolicy): boolean {
	return policy.isNewPreview || !policy.branchOpenedInSession || isWorkbenchAppPreviewBlankOrStartupUrl(policy.currentUrl);
}

export function getWorkbenchAppPreviewStartupPageKey(state: IWorkbenchAppPreviewStartupPageKeyState): string {
	return JSON.stringify({
		phase: state.phase,
		title: state.title,
		message: state.message,
		stages: state.stages?.map(stage => ({ label: stage.label, status: stage.status })) ?? [],
		branchName: state.branchName,
		previousBranchName: state.previousBranchName,
		repoPath: state.repoPath,
		port: state.port,
		url: state.url,
		healthUrl: state.healthUrl,
		command: state.command,
		cwd: state.cwd,
		details: state.details ?? [],
		actions: state.actions ?? []
	});
}

function isWorkbenchAppPreviewBlankOrStartupUrl(url: string | undefined): boolean {
	return !url || url === 'about:blank' || url.startsWith('data:text/html;base64,');
}

export function isWorkbenchAppPreviewUrlForBranch(urlBranchName: string | undefined, currentBranchName: string | undefined): boolean {
	return urlBranchName === currentBranchName;
}

export interface IWorkbenchAppPreviewBranchObservationPolicy {
	readonly hasObservedBranchName: boolean;
	readonly lastBranchName: string | undefined;
	readonly currentBranchName: string | undefined;
}

export interface IWorkbenchAppPreviewBranchObservation {
	readonly hasObservedBranchName: boolean;
	readonly branchName: string | undefined;
	readonly changed: boolean;
	readonly previousBranchName: string | undefined;
}

export function observeWorkbenchAppPreviewBranch(policy: IWorkbenchAppPreviewBranchObservationPolicy): IWorkbenchAppPreviewBranchObservation {
	const changed = policy.hasObservedBranchName && policy.currentBranchName !== policy.lastBranchName;
	return {
		hasObservedBranchName: true,
		branchName: policy.currentBranchName,
		changed,
		previousBranchName: changed ? policy.lastBranchName : undefined,
	};
}

export function shouldRecoverWorkbenchAppPreviewLoadError(policy: IWorkbenchAppPreviewLoadErrorRecoveryPolicy): boolean {
	const referenceUrl = policy.serverUrl ?? policy.activeManagedPreviewUrl;
	if (!policy.errorUrl || !referenceUrl) {
		return false;
	}

	let errorUrl: URL;
	let referencePreviewUrl: URL;
	try {
		errorUrl = new URL(policy.errorUrl);
		referencePreviewUrl = new URL(referenceUrl);
	} catch {
		return false;
	}

	if (errorUrl.origin !== referencePreviewUrl.origin) {
		return false;
	}

	return isWorkbenchAppPreviewConnectionLoadErrorCode(policy.errorCode);
}

export function shouldShowWorkbenchAppPreviewLoadErrorOverlay(policy: IWorkbenchAppPreviewLoadErrorOverlayPolicy): boolean {
	if (!policy.previewStartupInProgress) {
		return true;
	}

	if (!isWorkbenchAppPreviewConnectionLoadErrorCode(policy.errorCode)) {
		return true;
	}

	return !isWorkbenchAppPreviewLocalUrl(policy.errorUrl);
}

export function shouldRestartWorkbenchAppPreviewAfterLoadError(policy: IWorkbenchAppPreviewLoadErrorRestartPolicy): boolean {
	if (!policy.recoverableLoadError) {
		return false;
	}

	if (!policy.serverProcessAlive) {
		return true;
	}

	return policy.serverState === 'failed' || policy.serverState === 'stopped';
}

export function shouldIgnoreWorkbenchAppPreviewLoadEvent(policy: IWorkbenchAppPreviewLoadEventGatePolicy): boolean {
	return policy.eventLoading
		|| !policy.hasError
		|| policy.previewStartupInProgress
		|| policy.previewLoadFailureRecoveryInFlight
		|| policy.serverStartInFlight;
}

function isWorkbenchAppPreviewConnectionLoadErrorCode(errorCode: number): boolean {
	return errorCode === -7 || errorCode === -102 || errorCode === -105 || errorCode === -106;
}

export function getWorkbenchAppPreviewServerStateAfterCommandExit(policy: IWorkbenchAppPreviewServerCommandExitPolicy): WorkbenchAppPreviewServerState | undefined {
	if (policy.serverState !== 'starting' && policy.serverState !== 'running') {
		return undefined;
	}

	return policy.serverHealth === 'healthy' ? 'stopped' : 'failed';
}

export function getWorkbenchAppPreviewServerStateAfterHealthTimeout(policy: IWorkbenchAppPreviewHealthTimeoutPolicy): WorkbenchAppPreviewServerState | undefined {
	if (policy.serverState !== 'starting' && policy.serverState !== 'running') {
		return undefined;
	}

	if (policy.serverHealth === 'healthy') {
		return undefined;
	}

	if (policy.serverTerminalExited || policy.serverCommandActive === false) {
		return 'failed';
	}

	return undefined;
}

/**
 * A background poll (branch/workspace refresh) periodically tries to auto-start the preview
 * server whenever it looks idle. Only 'stopped' is actually idle - 'starting'/'running' are
 * already in flight, and 'failed' must wait for the user to explicitly retry/restart from the
 * startup page rather than being silently retried on the next poll tick. Without excluding
 * 'failed' here, a still-installing terminal that merely looked "failed" for a moment (e.g. right
 * after a slow-install notice) would get torn down and restarted from zero by the very next poll.
 */
export function shouldSkipWorkbenchAppPreviewAutoStart(policy: IWorkbenchAppPreviewAutoStartGatePolicy): boolean {
	return policy.previewStartupInProgress
		|| policy.previewAutoStartInFlight
		|| policy.serverState === 'starting'
		|| policy.serverState === 'running'
		|| policy.serverState === 'failed';
}

/**
 * Classifies how a dependency install ended, once it has actually ended. A merely slow install
 * (still running) is never passed to this function - only a real terminal exit or a completed
 * command's exit code reach here - so "slow" can never be conflated with "crashed" or "failed".
 */
export function resolveWorkbenchAppPreviewInstallOutcome(policy: IWorkbenchAppPreviewInstallOutcomePolicy): WorkbenchAppPreviewInstallOutcome {
	if (policy.serverTerminalExited) {
		return 'crashed';
	}

	if (policy.exitCode !== undefined && policy.exitCode !== 0) {
		return 'failed';
	}

	return 'succeeded';
}

export function shouldShowWorkbenchAppPreviewSetupBeforeServerStart(policy: IWorkbenchAppPreviewServerStartConfigurationPolicy): boolean {
	const hasRunnableServerConfig = policy.hasRunnableServerConfig || policy.canStartServerWithoutInstall;
	return !policy.configuredUrl?.trim() && !policy.inferredStartupUrl?.trim() && policy.needsConfigurationPrompt && !hasRunnableServerConfig;
}

export function canStartWorkbenchAppPreviewServerWithoutInstall(config: IResolvedWorkbenchAppPreviewDevConfig | undefined): boolean {
	return !!config && !config.installCommand && !config.corepackInstallCommand;
}

export function resolveWorkbenchAppPreviewInferredStartupUrl(policy: IWorkbenchAppPreviewInferredStartupUrlPolicy): string | undefined {
	const branchUrl = getWorkbenchAppPreviewVerifiedRuntimeUrl(policy.branchRuntime, policy.port);
	if (branchUrl) {
		return branchUrl;
	}

	let latest: IWorkbenchAppPreviewBranchRuntime | undefined;
	for (const runtime of policy.repoRuntimes ?? []) {
		if (!runtime.lastSuccessfulUrl?.trim()) {
			continue;
		}
		if (!latest || (runtime.lastSuccessfulAt ?? 0) > (latest.lastSuccessfulAt ?? 0)) {
			latest = runtime;
		}
	}

	return getWorkbenchAppPreviewVerifiedRuntimeUrl(latest, policy.port);
}

function getWorkbenchAppPreviewVerifiedRuntimeUrl(runtime: IWorkbenchAppPreviewBranchRuntime | undefined, port: number | undefined): string | undefined {
	const url = runtime?.lastSuccessfulUrl?.trim();
	if (!url) {
		return undefined;
	}

	return adaptWorkbenchAppPreviewUrlToPort(url, port);
}

export function resolveWorkbenchAppPreviewAdvertisedUrl(policy: IWorkbenchAppPreviewAdvertisedUrlResolutionPolicy): string | undefined {
	if (!policy.currentServerUrl) {
		return policy.advertisedUrl;
	}

	let currentServerUrl: URL;
	let advertisedUrl: URL;
	try {
		currentServerUrl = new URL(policy.currentServerUrl);
		advertisedUrl = new URL(policy.advertisedUrl);
	} catch {
		return undefined;
	}

	if (
		isWorkbenchAppPreviewLocalHost(currentServerUrl.hostname) &&
		isWorkbenchAppPreviewLocalHost(advertisedUrl.hostname) &&
		getWorkbenchAppPreviewComparablePort(currentServerUrl) === getWorkbenchAppPreviewComparablePort(advertisedUrl)
	) {
		return advertisedUrl.toString();
	}

	return resolveWorkbenchAppPreviewUrlOnOrigin(currentServerUrl.toString(), advertisedUrl.toString());
}

export function getWorkbenchAppPreviewClaudeReconciliationCommands(): readonly IWorkbenchAppPreviewCommandAttempt[] {
	return [
		{ commandId: 'workbench.action.chat.openNewChatSessionInPlace.claude-code', args: ['sidebar'] },
		{ commandId: 'workbench.action.chat.openNewChatSessionInPlace.agent-host-claude', args: ['sidebar'] },
		{ commandId: 'claude-vscode.newConversation', args: [] },
		{ commandId: 'claude-vscode.sidebar.open', args: [] },
	];
}

function stripWorkbenchAppPreviewEnvValue(value: string): string {
	const trimmed = value.trim();
	const quote = trimmed[0];
	if ((quote === '\'' || quote === '"' || quote === '`') && trimmed.endsWith(quote)) {
		return trimmed.slice(1, -1);
	}

	return trimmed.replace(/\s+#.*$/, '').trim();
}

export function parseWorkbenchAppPreviewEnv(content: string): IWorkbenchAppPreviewEnv {
	const env: Record<string, string> = {};
	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) {
			continue;
		}

		const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
		if (!match) {
			continue;
		}

		env[match[1]] = stripWorkbenchAppPreviewEnvValue(match[2]);
	}

	return env;
}

function mergeDevConfigTarget(base: IWorkbenchAppPreviewDevConfigTarget | undefined, branch: IWorkbenchAppPreviewDevConfigTarget | undefined): IWorkbenchAppPreviewDevConfigTarget {
	return { ...base, ...branch };
}

function getWorkbenchAppPreviewDevConfigTarget(config: IWorkbenchAppPreviewDevConfig, branchName: string | undefined): IWorkbenchAppPreviewDevConfigTarget {
	return mergeDevConfigTarget(config.default, branchName ? config.branches?.[branchName] : undefined);
}

export function isWorkbenchAppPreviewNoopDevCommand(command: string | undefined): boolean {
	const trimmed = command?.trim();
	if (!trimmed) {
		return false;
	}

	return /^sleep\s+\d+$/i.test(trimmed) ||
		/^tail\s+-f\s+\/dev\/null$/i.test(trimmed) ||
		/^true$/i.test(trimmed) ||
		trimmed === ':';
}

export function shouldFallbackFromWorkbenchAppPreviewDevConfig(config: IWorkbenchAppPreviewDevConfig, branchName: string | undefined): boolean {
	return isWorkbenchAppPreviewNoopDevCommand(getWorkbenchAppPreviewDevConfigTarget(config, branchName).command);
}

export function resolveWorkbenchAppPreviewDevConfig(config: IWorkbenchAppPreviewDevConfig, branchName: string | undefined): IResolvedWorkbenchAppPreviewDevConfig | undefined {
	const target = getWorkbenchAppPreviewDevConfigTarget(config, branchName);
	const command = target.command?.trim();
	if (!command || isWorkbenchAppPreviewNoopDevCommand(command)) {
		return undefined;
	}

	return {
		command,
		cwd: target.cwd,
		portEnv: target.portEnv?.trim() || undefined,
		url: target.url?.trim() || DEFAULT_DEV_URL_TEMPLATE,
		healthPath: target.healthPath,
	};
}

function parseWorkbenchAppPreviewPort(value: string | undefined): number | undefined {
	if (!value || !/^[0-9]+$/.test(value.trim())) {
		return undefined;
	}

	const port = Number(value.trim());
	return Number.isInteger(port) && port > 0 && port <= 65535 ? port : undefined;
}

function getWorkbenchAppPreviewUrlFixedPort(url: string | undefined): number | undefined {
	if (!url || url.includes('${PORT}')) {
		return undefined;
	}

	try {
		const parsed = new URL(url);
		return parseWorkbenchAppPreviewPort(parsed.port);
	} catch {
		return undefined;
	}
}

function getWorkbenchAppPreviewPublicEnvUrl(env: IWorkbenchAppPreviewEnv | undefined): string | undefined {
	const publicUrl = env?.PUBLIC_URL?.trim();
	if (!publicUrl) {
		return undefined;
	}

	try {
		const parsed = new URL(publicUrl);
		return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : undefined;
	} catch {
		return undefined;
	}
}

export function getWorkbenchAppPreviewDevConfigFixedPort(config: IResolvedWorkbenchAppPreviewDevConfig): number | undefined {
	return config.fixedPort ?? getWorkbenchAppPreviewUrlFixedPort(config.url);
}

export function resolveWorkbenchAppPreviewHeuristicDevConfig(scripts: Record<string, unknown> | undefined, url?: string, env?: IWorkbenchAppPreviewEnv, packageManager?: IWorkbenchAppPreviewHeuristicPackageManagerConfig): IResolvedWorkbenchAppPreviewDevConfig | undefined {
	if (!scripts) {
		return undefined;
	}

	const envUrl = getWorkbenchAppPreviewPublicEnvUrl(env);
	const resolvedUrl = url?.trim() || envUrl || DEFAULT_DEV_URL_TEMPLATE;
	const configuredFixedPort = getWorkbenchAppPreviewUrlFixedPort(resolvedUrl) ?? parseWorkbenchAppPreviewPort(env?.PORT);
	const scriptCommandPrefix = packageManager?.scriptCommandPrefix?.trim() || 'npm run';
	const corepackScriptCommandPrefix = packageManager?.corepackScriptCommandPrefix?.trim();
	const installCommand = packageManager?.dependencyReadiness && packageManager.dependencyReadiness !== 'ready'
		? packageManager.installCommand?.trim()
		: undefined;
	const corepackInstallCommand = installCommand ? packageManager?.corepackInstallCommand?.trim() : undefined;
	for (const scriptName of ['dev', 'start:ci', 'start', 'serve']) {
		const script = scripts[scriptName];
		if (typeof script === 'string') {
			const fixedPort = configuredFixedPort ?? getWorkbenchAppPreviewScriptFixedPort(script);
			const scriptArgs = getWorkbenchAppPreviewDevServerScriptArgs(script);
			return {
				command: `${scriptCommandPrefix} ${scriptName}${scriptArgs}`,
				...(corepackScriptCommandPrefix ? { corepackCommand: `${corepackScriptCommandPrefix} ${scriptName}${scriptArgs}` } : {}),
				portEnv: DEFAULT_DEV_PORT_ENV,
				url: resolvedUrl,
				healthPath: '/',
				...(fixedPort !== undefined ? { fixedPort } : {}),
				...(installCommand ? { installCommand } : {}),
				...(corepackInstallCommand ? { corepackInstallCommand } : {}),
				...(installCommand && packageManager?.dependencyReadiness ? { dependencyReadiness: packageManager.dependencyReadiness } : {}),
			};
		}
	}

	return undefined;
}

function getWorkbenchAppPreviewScriptFixedPort(script: string): number | undefined {
	const ports = new Set<number>();
	collectWorkbenchAppPreviewScriptPorts(script, /(?:^|[\s"'`(;&|])(?:--port|-p)(?:=|\s+)([0-9]{1,5})(?=$|[\s"'`);&|])/gi, ports);
	collectWorkbenchAppPreviewScriptPorts(script, /(?:^|[\s"'`(;&|])PORT=([0-9]{1,5})(?=$|[\s"'`);&|])/g, ports);
	collectWorkbenchAppPreviewScriptPorts(script, /\b(?:tcp|https?|https?-get):(?:(?:\/\/)?[^:\s"'`;&|)]*:)?([0-9]{1,5})(?=$|[\/\s"'`);&|])/gi, ports);

	if (ports.size !== 1) {
		return undefined;
	}

	return ports.values().next().value;
}

function collectWorkbenchAppPreviewScriptPorts(script: string, pattern: RegExp, ports: Set<number>): void {
	for (const match of script.matchAll(pattern)) {
		const port = parseWorkbenchAppPreviewPort(match[1]);
		if (port !== undefined) {
			ports.add(port);
		}
	}
}

function getWorkbenchAppPreviewDevServerScriptArgs(script: string): string {
	const normalized = script.trim().toLowerCase();
	if (!/\brsbuild(?:\s|$)/.test(normalized)) {
		return '';
	}

	if (/(^|\s)(--port(?:=|\s)|-p(?:=|\s))/.test(normalized)) {
		return '';
	}

	return ' -- --port ${PORT}';
}

function normalizeWorkbenchAppPreviewStaticHtmlPath(path: string): string | undefined {
	const withoutLeadingSlash = path.trim().replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '');
	const segments = withoutLeadingSlash.split('/').filter(segment => segment && segment !== '.');
	if (!segments.length || segments.some(segment => segment === '..')) {
		return undefined;
	}

	const normalized = segments.join('/');
	return normalized.toLowerCase().endsWith('.html') ? normalized : undefined;
}

function getWorkbenchAppPreviewStaticHtmlPathScore(path: string): number {
	const lower = path.toLowerCase();
	const segments = lower.split('/');
	const basename = segments[segments.length - 1] ?? lower;
	let score = segments.length * 10;

	if (basename === 'index.html') {
		score -= 1000;
	}
	if (segments.includes('docs')) {
		score -= 20;
	}
	if (segments.includes('architecture')) {
		score -= 20;
	}
	if (basename.includes('architecture')) {
		score -= 12;
	}
	if (basename.includes('overview') || basename.includes('home') || basename.includes('readme')) {
		score -= 8;
	}
	if (basename.includes('diagram') || basename.includes('map')) {
		score += 8;
	}

	return score;
}

export function selectWorkbenchAppPreviewStaticHtmlFile(paths: readonly string[]): string | undefined {
	const candidates = paths
		.map(path => normalizeWorkbenchAppPreviewStaticHtmlPath(path))
		.filter((path): path is string => !!path);

	candidates.sort((first, second) => {
		const scoreDifference = getWorkbenchAppPreviewStaticHtmlPathScore(first) - getWorkbenchAppPreviewStaticHtmlPathScore(second);
		return scoreDifference || first.localeCompare(second);
	});

	return candidates[0];
}

function encodeWorkbenchAppPreviewStaticHtmlPath(path: string | undefined): string {
	const normalized = path ? normalizeWorkbenchAppPreviewStaticHtmlPath(path) : undefined;
	return normalized?.split('/').map(encodeURIComponent).join('/') ?? '';
}

export function resolveWorkbenchAppPreviewStaticHtmlConfig(serveDir: string, initialPath?: string): IResolvedWorkbenchAppPreviewDevConfig {
	const encodedInitialPath = encodeWorkbenchAppPreviewStaticHtmlPath(initialPath);
	return {
		command: `python3 -m http.server \${PORT} --directory ${serveDir}`,
		portEnv: DEFAULT_DEV_PORT_ENV,
		url: encodedInitialPath ? `${DEFAULT_DEV_URL_TEMPLATE}${encodedInitialPath}` : DEFAULT_DEV_URL_TEMPLATE,
		healthPath: '/',
	};
}

export function applyWorkbenchAppPreviewDevPort(config: IResolvedWorkbenchAppPreviewDevConfig, port: number): IWorkbenchAppPreviewResolvedServer {
	const portValue = String(port);
	const replacePort = (value: string) => value.replace(/\$\{PORT\}/g, portValue);
	const url = replacePort(config.url);
	const healthUrl = config.healthPath ? new URL(config.healthPath, url).toString() : url;
	return {
		command: replacePort(config.command),
		// CRA, webpack, and Vite honor BROWSER=none. Rsbuild may log a benign failed launch for
		// a browser named "none", but it still prevents the OS-level browser from opening.
		env: { BROWSER: 'none', ...(config.portEnv ? { [config.portEnv]: portValue } : {}) },
		url,
		healthUrl,
	};
}

export function adaptWorkbenchAppPreviewUrlToPort(url: string | undefined, port: number | undefined): string | undefined {
	if (!url || !port) {
		return url;
	}

	const concreteUrl = url.replace(/\$\{PORT\}/g, String(port));
	let parsed: URL;
	try {
		parsed = new URL(concreteUrl);
	} catch {
		return url;
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		return url;
	}

	parsed.port = String(port);
	return parsed.href;
}

export interface IWorkbenchAppPreviewDiscoveredPortReconciliationPolicy {
	readonly serverUrl: string | undefined;
	readonly serverHealthUrl: string | undefined;
	readonly serverBranch: string | undefined;
	readonly serverFixedPort: number | undefined;
	readonly discoveredUrl: string;
	readonly discoveredBranchName: string | undefined;
}

export interface IWorkbenchAppPreviewDiscoveredPortReconciliation {
	readonly port: number;
	readonly url: string;
	readonly healthUrl: string | undefined;
}

function getWorkbenchAppPreviewUrlPort(url: URL): number {
	return Number(url.port || (url.protocol === 'https:' ? 443 : 80));
}

/**
 * Many dev servers silently bind to a different port than the one they were asked for
 * (e.g. "port 3001 is in use, using 3002 instead") without failing or printing a
 * recognizable port-conflict error. When a discovered URL from the server's own terminal
 * output disagrees with the port we assumed, trust the terminal over our assumption so
 * navigation, health checks, and status reporting all point at the server that is actually
 * running - regardless of which project/tool produced it.
 */
export function resolveWorkbenchAppPreviewDiscoveredPortReconciliation(policy: IWorkbenchAppPreviewDiscoveredPortReconciliationPolicy): IWorkbenchAppPreviewDiscoveredPortReconciliation | undefined {
	if (!policy.serverUrl || policy.serverFixedPort || policy.serverBranch !== policy.discoveredBranchName) {
		return undefined;
	}

	let discovered: URL;
	let expected: URL;
	try {
		discovered = new URL(policy.discoveredUrl);
		expected = new URL(policy.serverUrl);
	} catch {
		return undefined;
	}

	const sameHost = discovered.hostname === expected.hostname
		|| (isWorkbenchAppPreviewLoopbackHost(discovered.hostname) && isWorkbenchAppPreviewLoopbackHost(expected.hostname));
	if (!sameHost) {
		return undefined;
	}

	const discoveredPort = getWorkbenchAppPreviewUrlPort(discovered);
	if (!discoveredPort || discoveredPort === getWorkbenchAppPreviewUrlPort(expected)) {
		return undefined;
	}

	return {
		port: discoveredPort,
		url: adaptWorkbenchAppPreviewUrlToPort(policy.serverUrl, discoveredPort) ?? policy.serverUrl,
		healthUrl: adaptWorkbenchAppPreviewUrlToPort(policy.serverHealthUrl, discoveredPort) ?? policy.serverHealthUrl,
	};
}

export function isWorkbenchAppPreviewPortConflict(output: string, port: number | undefined): boolean {
	if (!port) {
		return false;
	}

	const lowerOutput = output.toLowerCase();
	if (!lowerOutput.includes('eaddrinuse') && !lowerOutput.includes('address already in use')) {
		return false;
	}

	return new RegExp(`(^|[^0-9])${port}([^0-9]|$)`).test(output);
}

export function isWorkbenchAppPreviewPathUnderRoot(candidatePath: string, rootPath: string): boolean {
	const normalize = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
	const candidate = normalize(candidatePath);
	const root = normalize(rootPath);
	return candidate === root || candidate.startsWith(`${root}/`);
}

export interface IWorkbenchAppPreviewPortOwner {
	readonly pid: number;
	readonly cwd?: string;
}

export interface IWorkbenchAppPreviewFixedPortPolicy {
	/** Whether the required port currently has nothing bound to it. */
	readonly portFree: boolean;
	/** The process currently listening on the port, if known. */
	readonly owner: IWorkbenchAppPreviewPortOwner | undefined;
	/** Absolute path of the workspace whose dev server needs the port. */
	readonly rootPath: string;
}

/**
 * A repo-fixed port cannot be swapped for a free one (the built HTML pins its asset URLs to it), so
 * before launching we must make the port ours. This decides what to do about whoever holds it:
 *
 * - `ready` - nothing is bound; launch immediately.
 * - `reuseRepoLocal` - a process running out of this same repo owns it (our own server tearing down,
 *   or an independently started dev server per the .designer/dev.json no-op pattern); reuse it.
 * - `closeForeign` - a process from a different repo is squatting on the port; close it so the
 *   correct app can bind (opening/switching must never land on a stale/foreign server).
 * - `waitUnknownOwner` - the port is occupied but the owner could not be identified; wait for it.
 */
export type WorkbenchAppPreviewFixedPortAction = 'ready' | 'reuseRepoLocal' | 'closeForeign' | 'waitUnknownOwner';

export function resolveWorkbenchAppPreviewFixedPortAction(policy: IWorkbenchAppPreviewFixedPortPolicy): WorkbenchAppPreviewFixedPortAction {
	if (policy.portFree) {
		return 'ready';
	}
	if (policy.owner?.cwd && isWorkbenchAppPreviewPathUnderRoot(policy.owner.cwd, policy.rootPath)) {
		return 'reuseRepoLocal';
	}
	if (policy.owner && Number.isInteger(policy.owner.pid) && policy.owner.pid > 0) {
		return 'closeForeign';
	}
	return 'waitUnknownOwner';
}

export function classifyWorkbenchAppPreviewTerminalFailure(output: string, port: number | undefined): WorkbenchAppPreviewTerminalFailure {
	if (isWorkbenchAppPreviewPortConflict(output, port)) {
		return 'portConflict';
	}

	const lowerOutput = output.toLowerCase();
	if (lowerOutput.includes('command not found') ||
		lowerOutput.includes('not recognized as an internal or external command') ||
		lowerOutput.includes('enoent')) {
		return 'missingBinary';
	}

	if (lowerOutput.includes('cannot find module') ||
		lowerOutput.includes('module not found') ||
		lowerOutput.includes('err_module_not_found') ||
		lowerOutput.includes('cannot find package')) {
		return 'moduleNotFound';
	}

	if (lowerOutput.includes('permission denied') ||
		lowerOutput.includes('eacces')) {
		return 'permissionDenied';
	}

	return 'unknown';
}

export function shouldRestartWorkbenchAppPreviewAfterHealthFailures(policy: IWorkbenchAppPreviewHealthFailureRestartPolicy): boolean {
	if (policy.previewStartupInProgress || policy.backgroundRestartInFlight || policy.serverProcessAlive) {
		return false;
	}

	return policy.backgroundRestartAttempts < policy.maxBackgroundRestartAttempts;
}

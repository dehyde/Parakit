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

export interface IWorkbenchAppPreviewLoadErrorRestartPolicy {
	readonly recoverableLoadError: boolean;
	readonly serverProcessAlive: boolean;
}

export interface IWorkbenchAppPreviewServerStartConfigurationPolicy {
	readonly configuredUrl: string | undefined;
	readonly needsConfigurationPrompt: boolean;
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
		if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && isWorkbenchAppPreviewLoopbackHost(parsed.hostname)) {
			return 'no-cors';
		}
	} catch {
		// Preserve the default fetch mode for invalid input so callers keep existing error handling.
	}

	return 'cors';
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
	const runningServerUrl = candidates.allowRunningServerFallback ? candidates.runningServerUrl : undefined;
	const discoveredUrl = !candidates.allowRunningServerFallback && isWorkbenchAppPreviewLoopbackUrl(candidates.runningServerUrl) && areWorkbenchAppPreviewUrlsEqual(candidates.discoveredUrl, candidates.runningServerUrl)
		? undefined
		: candidates.discoveredUrl;

	return resolveWorkbenchAppPreviewUrl({
		localBranchOverride: candidates.localBranchOverride,
		localDefaultOverride: candidates.localDefaultOverride,
		repoBranchUrl: candidates.repoBranchUrl,
		repoDefaultUrl: candidates.repoDefaultUrl,
		runningServerUrl,
		discoveredUrl,
	});
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

	return policy.errorCode === -7 || policy.errorCode === -102 || policy.errorCode === -105 || policy.errorCode === -106;
}

export function shouldRestartWorkbenchAppPreviewAfterLoadError(policy: IWorkbenchAppPreviewLoadErrorRestartPolicy): boolean {
	return policy.recoverableLoadError && !policy.serverProcessAlive;
}

export function shouldShowWorkbenchAppPreviewSetupBeforeServerStart(policy: IWorkbenchAppPreviewServerStartConfigurationPolicy): boolean {
	return !policy.configuredUrl?.trim() && policy.needsConfigurationPrompt;
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
	const fixedPort = getWorkbenchAppPreviewUrlFixedPort(resolvedUrl) ?? parseWorkbenchAppPreviewPort(env?.PORT);
	const scriptCommandPrefix = packageManager?.scriptCommandPrefix?.trim() || 'npm run';
	const corepackScriptCommandPrefix = packageManager?.corepackScriptCommandPrefix?.trim();
	const installCommand = packageManager?.dependencyReadiness && packageManager.dependencyReadiness !== 'ready'
		? packageManager.installCommand?.trim()
		: undefined;
	const corepackInstallCommand = installCommand ? packageManager?.corepackInstallCommand?.trim() : undefined;
	for (const scriptName of ['dev', 'start', 'serve']) {
		if (typeof scripts[scriptName] === 'string') {
			return {
				command: `${scriptCommandPrefix} ${scriptName}`,
				...(corepackScriptCommandPrefix ? { corepackCommand: `${corepackScriptCommandPrefix} ${scriptName}` } : {}),
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

export function resolveWorkbenchAppPreviewStaticHtmlConfig(serveDir: string): IResolvedWorkbenchAppPreviewDevConfig {
	return {
		command: `python3 -m http.server \${PORT} --directory ${serveDir}`,
		portEnv: DEFAULT_DEV_PORT_ENV,
		url: DEFAULT_DEV_URL_TEMPLATE,
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
		env: config.portEnv ? { [config.portEnv]: portValue } : {},
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

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';

const DiscoveryFileName = 'parakit-app-preview-bridge.json';
const RequestLimit = 2 * 1024 * 1024;
const AppPreviewSkillPath = path.join('resources', 'app-preview-skill', 'SKILL.md');
const ClaudePluginMarketplace = 'parakit';
const ClaudePluginName = 'parakit-app-preview';
const ClaudePluginVersion = '0.1.0';

interface BridgeDiscovery {
	version: 1;
	port: number;
	token: string;
	baseUrl: string;
	pid: number;
	updatedAt: string;
}

interface ClaudeSettings {
	permissions?: {
		allow?: string[];
		[key: string]: unknown;
	};
	enabledPlugins?: Record<string, boolean>;
	mcpServers?: Record<string, unknown>;
	[key: string]: unknown;
}

interface ClaudeInstalledPlugins {
	version?: number;
	plugins?: Record<string, ClaudeInstalledPluginInstall[]>;
	[key: string]: unknown;
}

interface ClaudeInstalledPluginInstall {
	scope: string;
	installPath: string;
	version: string;
	installedAt: string;
	lastUpdated: string;
	gitCommitSha?: string;
	[key: string]: unknown;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const token = crypto.randomBytes(32).toString('hex');
	const server = http.createServer((request, response) => {
		void handleRequest(request, response, token).catch(error => {
			sendJson(response, 500, {
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			});
		});
	});

	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			server.off('error', reject);
			resolve();
		});
	});

	const address = server.address();
	if (!address || typeof address === 'string') {
		server.close();
		throw new Error('Could not determine App Preview bridge address.');
	}

	context.subscriptions.push(new vscode.Disposable(() => server.close()));
	await writeDiscovery(context, address.port, token);
	await ensureClaudeMcpConfig(context);
	await ensureClaudePlugin(context);
	await ensureClaudeAppPreviewSkill(context);
	console.info(`Parakit App Preview bridge listening on 127.0.0.1:${address.port}.`);
}

async function handleRequest(request: http.IncomingMessage, response: http.ServerResponse, token: string): Promise<void> {
	if (request.method !== 'POST') {
		sendJson(response, 405, { ok: false, error: 'Only POST requests are supported.' });
		return;
	}

	if (request.headers.authorization !== `Bearer ${token}`) {
		sendJson(response, 401, { ok: false, error: 'Invalid App Preview bridge token.' });
		return;
	}

	const body = await readBody(request);
	const payload = body ? JSON.parse(body) : {};
	const result = await runOperation(request.url?.split('?')[0] ?? '', payload);
	sendJson(response, 200, { ok: true, result });
}

async function runOperation(route: string, payload: unknown): Promise<unknown> {
	const args = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {};
	switch (route) {
		case '/get_app_preview_status':
		case '/status':
			return vscode.commands.executeCommand('workbench.action.appPreview.getStatus');
		case '/run_preview_server':
			await vscode.commands.executeCommand('workbench.action.appPreview.runServer');
			return vscode.commands.executeCommand('workbench.action.appPreview.getStatus');
		case '/restart_preview_server':
			await vscode.commands.executeCommand('workbench.action.appPreview.restartServer');
			return vscode.commands.executeCommand('workbench.action.appPreview.getStatus');
		case '/navigate_app_preview':
		case '/navigate':
			return vscode.commands.executeCommand('workbench.action.appPreview.navigate', { url: typeof args.url === 'string' ? args.url : undefined });
		case '/read_app_preview':
		case '/readPage':
			return vscode.commands.executeCommand('workbench.action.appPreview.readPage');
		case '/screenshot_app_preview':
		case '/screenshot':
			return vscode.commands.executeCommand('workbench.action.appPreview.screenshot', args);
		case '/click_app_preview':
		case '/click':
			return vscode.commands.executeCommand('workbench.action.appPreview.click', args);
		case '/type_in_app_preview':
		case '/type':
			return vscode.commands.executeCommand('workbench.action.appPreview.type', args);
		default:
			throw new Error(`Unknown App Preview bridge operation: ${route}`);
	}
}

async function readBody(request: http.IncomingMessage): Promise<string> {
	let body = '';
	for await (const chunk of request) {
		body += chunk;
		if (body.length > RequestLimit) {
			throw new Error('App Preview bridge request body is too large.');
		}
	}
	return body;
}

function sendJson(response: http.ServerResponse, statusCode: number, payload: unknown): void {
	if (response.headersSent) {
		return;
	}
	response.writeHead(statusCode, {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store',
	});
	response.end(JSON.stringify(payload));
}

async function writeDiscovery(context: vscode.ExtensionContext, port: number, token: string): Promise<void> {
	const discovery: BridgeDiscovery = {
		version: 1,
		port,
		token,
		baseUrl: `http://127.0.0.1:${port}`,
		pid: process.pid,
		updatedAt: new Date().toISOString(),
	};
	const content = `${JSON.stringify(discovery, undefined, 2)}\n`;
	await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(context.logUri, DiscoveryFileName), Buffer.from(content));
	const stablePath = getStableDiscoveryPath();
	await fs.promises.mkdir(path.dirname(stablePath), { recursive: true });
	await fs.promises.writeFile(stablePath, content);
}

async function ensureClaudeMcpConfig(context: vscode.ExtensionContext): Promise<void> {
	const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
	const settings = await readClaudeSettings(settingsPath);
	const pluginKey = `${ClaudePluginName}@${ClaudePluginMarketplace}`;
	settings.mcpServers = {
		...settings.mcpServers,
		app_preview: getAppPreviewMcpServerConfig(context),
	};
	settings.enabledPlugins = {
		...settings.enabledPlugins,
		[pluginKey]: true,
	};

	const permissions = settings.permissions ?? {};
	const allow = Array.isArray(permissions.allow) ? permissions.allow : [];
	if (!allow.includes('mcp__app_preview__*')) {
		allow.push('mcp__app_preview__*');
	}
	settings.permissions = { ...permissions, allow };

	await fs.promises.mkdir(path.dirname(settingsPath), { recursive: true });
	await fs.promises.writeFile(settingsPath, `${JSON.stringify(settings, undefined, 2)}\n`);
}

async function ensureClaudePlugin(context: vscode.ExtensionContext): Promise<void> {
	const pluginPath = getClaudePluginPath();
	const marketplacePluginPath = path.join(getClaudeMarketplacePath(), 'plugins', ClaudePluginName);
	await writeClaudePluginFiles(context, pluginPath);
	await writeClaudePluginFiles(context, marketplacePluginPath);
	await ensureClaudeMarketplace();
	await ensureClaudePluginInstalled(pluginPath);
}

async function writeClaudePluginFiles(context: vscode.ExtensionContext, pluginPath: string): Promise<void> {
	const mcpConfig = {
		mcpServers: {
			app_preview: getAppPreviewMcpServerConfig(context),
		},
	};
	const pluginManifest = {
		name: ClaudePluginName,
		version: ClaudePluginVersion,
		description: 'Parakit internal App Preview MCP bridge.',
		author: {
			name: 'Parakit',
		},
		keywords: ['parakit', 'app-preview', 'mcp'],
		skills: './skills/',
		mcpServers: './.mcp.json',
	};

	await fs.promises.mkdir(path.join(pluginPath, '.claude-plugin'), { recursive: true });
	await fs.promises.mkdir(path.join(pluginPath, 'skills', 'app-preview'), { recursive: true });
	await fs.promises.writeFile(
		path.join(pluginPath, '.claude-plugin', 'plugin.json'),
		`${JSON.stringify(pluginManifest, undefined, 2)}\n`,
	);
	await fs.promises.writeFile(
		path.join(pluginPath, '.mcp.json'),
		`${JSON.stringify(mcpConfig, undefined, 2)}\n`,
	);

	const skillContent = await fs.promises.readFile(context.asAbsolutePath(AppPreviewSkillPath), 'utf8');
	await fs.promises.writeFile(path.join(pluginPath, 'skills', 'app-preview', 'SKILL.md'), skillContent);
}

async function ensureClaudeMarketplace(): Promise<void> {
	const marketplacePath = getClaudeMarketplacePath();
	const marketplaceManifest = {
		$schema: 'https://anthropic.com/claude-code/marketplace.schema.json',
		name: ClaudePluginMarketplace,
		description: 'Parakit managed Claude Code tools.',
		owner: {
			name: 'Parakit',
		},
		plugins: [
			{
				name: ClaudePluginName,
				source: `./plugins/${ClaudePluginName}`,
				description: 'Internal App Preview MCP bridge for Parakit.',
				category: 'preview',
				keywords: ['parakit', 'app-preview', 'mcp'],
			},
		],
	};
	const knownMarketplacesPath = path.join(os.homedir(), '.claude', 'plugins', 'known_marketplaces.json');
	const knownMarketplaces = await readJsonObject(knownMarketplacesPath);
	knownMarketplaces[ClaudePluginMarketplace] = {
		source: {
			source: 'git',
			url: pathToFileURL(marketplacePath).toString(),
		},
		installLocation: marketplacePath,
		lastUpdated: new Date().toISOString(),
	};

	await fs.promises.mkdir(path.join(marketplacePath, '.claude-plugin'), { recursive: true });
	await fs.promises.writeFile(
		path.join(marketplacePath, '.claude-plugin', 'marketplace.json'),
		`${JSON.stringify(marketplaceManifest, undefined, 2)}\n`,
	);
	await fs.promises.mkdir(path.dirname(knownMarketplacesPath), { recursive: true });
	await fs.promises.writeFile(knownMarketplacesPath, `${JSON.stringify(knownMarketplaces, undefined, 2)}\n`);
}

async function ensureClaudePluginInstalled(pluginPath: string): Promise<void> {
	const installedPluginsPath = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
	const installedPlugins = await readInstalledPlugins(installedPluginsPath);
	const plugins = installedPlugins.plugins ?? {};
	const pluginKey = `${ClaudePluginName}@${ClaudePluginMarketplace}`;
	const now = new Date().toISOString();
	const existing = plugins[pluginKey]?.find(entry => entry.scope === 'user');
	const install: ClaudeInstalledPluginInstall = {
		...(existing ?? {}),
		scope: 'user',
		installPath: pluginPath,
		version: ClaudePluginVersion,
		installedAt: existing?.installedAt ?? now,
		lastUpdated: now,
	};

	plugins[pluginKey] = [
		install,
		...(plugins[pluginKey] ?? []).filter(entry => entry.scope !== 'user'),
	];

	installedPlugins.version = installedPlugins.version ?? 2;
	installedPlugins.plugins = plugins;
	await fs.promises.mkdir(path.dirname(installedPluginsPath), { recursive: true });
	await fs.promises.writeFile(installedPluginsPath, `${JSON.stringify(installedPlugins, undefined, 2)}\n`);
}

async function ensureClaudeAppPreviewSkill(context: vscode.ExtensionContext): Promise<void> {
	const sourcePath = context.asAbsolutePath(AppPreviewSkillPath);
	const targetPath = path.join(os.homedir(), '.claude', 'skills', 'app-preview', 'SKILL.md');
	const content = await fs.promises.readFile(sourcePath, 'utf8');
	await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
	await fs.promises.writeFile(targetPath, content);
}

async function readClaudeSettings(settingsPath: string): Promise<ClaudeSettings> {
	try {
		const parsed = JSON.parse(await fs.promises.readFile(settingsPath, 'utf8'));
		return typeof parsed === 'object' && parsed !== null ? parsed as ClaudeSettings : {};
	} catch {
		return {};
	}
}

async function readInstalledPlugins(installedPluginsPath: string): Promise<ClaudeInstalledPlugins> {
	try {
		const parsed = JSON.parse(await fs.promises.readFile(installedPluginsPath, 'utf8'));
		return typeof parsed === 'object' && parsed !== null ? parsed as ClaudeInstalledPlugins : {};
	} catch {
		return {};
	}
}

async function readJsonObject(filePath: string): Promise<Record<string, unknown>> {
	try {
		const parsed = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
		return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
	} catch {
		return {};
	}
}

function getAppPreviewMcpServerConfig(context: vscode.ExtensionContext): Record<string, unknown> {
	return {
		command: process.execPath,
		args: [context.asAbsolutePath(path.join('resources', 'app-preview-mcp-server.cjs'))],
		env: {
			ELECTRON_RUN_AS_NODE: '1',
			PARAKIT_APP_PREVIEW_BRIDGE_FILE: getStableDiscoveryPath(),
		},
	};
}

function getClaudePluginPath(): string {
	return path.join(
		os.homedir(),
		'.claude',
		'plugins',
		'cache',
		ClaudePluginMarketplace,
		ClaudePluginName,
		ClaudePluginVersion,
	);
}

function getClaudeMarketplacePath(): string {
	return path.join(os.homedir(), '.claude', 'plugins', 'marketplaces', ClaudePluginMarketplace);
}

function getStableDiscoveryPath(): string {
	return path.join(os.homedir(), '.claude', DiscoveryFileName);
}

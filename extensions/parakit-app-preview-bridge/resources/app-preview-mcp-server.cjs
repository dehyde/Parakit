#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const SERVER_NAME = 'app_preview';
const REQUEST_TIMEOUT_MS = 30000;
const TOOL_DEFINITIONS = [
	{
		name: 'get_app_preview_status',
		description: 'Get the current Parakit App Preview state, URL, branch, command, health, and configuration status.',
		inputSchema: { type: 'object', properties: {} },
	},
	{
		name: 'run_preview_server',
		description: 'Start the configured local preview server and open it in the pinned Parakit App Preview tab.',
		inputSchema: { type: 'object', properties: {} },
	},
	{
		name: 'restart_preview_server',
		description: 'Restart the configured local preview server and reopen it in the pinned Parakit App Preview tab.',
		inputSchema: { type: 'object', properties: {} },
	},
	{
		name: 'navigate_app_preview',
		description: 'Navigate the pinned Parakit App Preview tab to a URL.',
		inputSchema: {
			type: 'object',
			properties: {
				url: { type: 'string', description: 'The http or https URL to open in App Preview.' },
			},
			required: ['url'],
		},
	},
	{
		name: 'read_app_preview',
		description: 'Read an accessibility-style summary of the current Parakit App Preview page.',
		inputSchema: { type: 'object', properties: {} },
	},
	{
		name: 'screenshot_app_preview',
		description: 'Capture the Parakit App Preview viewport or a selected element.',
		inputSchema: {
			type: 'object',
			properties: {
				ref: { type: 'string' },
				selector: { type: 'string' },
				element: { type: 'string' },
				scrollIntoViewIfNeeded: { type: 'boolean' },
			},
		},
	},
	{
		name: 'click_app_preview',
		description: 'Click an element inside Parakit App Preview. Use read_app_preview first to identify refs or selectors.',
		inputSchema: {
			type: 'object',
			properties: {
				ref: { type: 'string' },
				selector: { type: 'string' },
				element: { type: 'string' },
				doubleClick: { type: 'boolean' },
				dblClick: { type: 'boolean' },
				button: { type: 'string', enum: ['left', 'right', 'middle'] },
			},
		},
	},
	{
		name: 'inspect_app_preview_element',
		description: 'Inspect an element inside Parakit App Preview: returns component identity, matched CSS rules, resolved design evidence, and optional forced interactive-state styles. Use read_app_preview first to identify refs or selectors.',
		inputSchema: {
			type: 'object',
			properties: {
				ref: { type: 'string' },
				selector: { type: 'string' },
				states: {
					type: 'array',
					items: { type: 'string', enum: ['hover', 'focus', 'focus-visible', 'focus-within', 'active', 'target', 'visited'] },
				},
			},
		},
	},
	{
		name: 'type_in_app_preview',
		description: 'Type text or press a key inside Parakit App Preview.',
		inputSchema: {
			type: 'object',
			properties: {
				text: { type: 'string' },
				key: { type: 'string' },
				ref: { type: 'string' },
				selector: { type: 'string' },
				element: { type: 'string' },
				submit: { type: 'boolean' },
			},
		},
	},
];

function writeMessage(message) {
	process.stdout.write(`${JSON.stringify(message)}\n`);
}

function writeResult(id, result) {
	writeMessage({ jsonrpc: '2.0', id, result });
}

function writeError(id, code, message) {
	writeMessage({ jsonrpc: '2.0', id, error: { code, message } });
}

function toolText(text, isError = false) {
	return {
		content: [{ type: 'text', text }],
		isError,
	};
}

function findDiscoveryFile() {
	const candidates = [
		process.env.PARAKIT_APP_PREVIEW_BRIDGE_FILE,
		path.join(os.homedir(), '.claude', 'parakit-app-preview-bridge.json'),
	].filter(Boolean);

	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}
	return candidates[0];
}

function readDiscovery() {
	const discoveryFile = findDiscoveryFile();
	if (!discoveryFile || !fs.existsSync(discoveryFile)) {
		throw new Error('Parakit App Preview is not available. Restart Parakit and start a fresh Claude session.');
	}

	const parsed = JSON.parse(fs.readFileSync(discoveryFile, 'utf8'));
	if (!parsed || typeof parsed !== 'object' || typeof parsed.port !== 'number' || typeof parsed.token !== 'string') {
		throw new Error('Parakit App Preview discovery file is invalid. Restart Parakit and start a fresh Claude session.');
	}
	return parsed;
}

async function postToBridge(toolName, args) {
	const discovery = readDiscovery();
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		const response = await fetch(`http://127.0.0.1:${discovery.port}/${toolName}`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${discovery.token}`,
				'content-type': 'application/json',
			},
			body: JSON.stringify(args ?? {}),
			signal: controller.signal,
		});
		const payload = await response.json().catch(() => undefined);
		if (!response.ok || !payload?.ok) {
			throw new Error(payload?.error || `Parakit App Preview bridge returned HTTP ${response.status}.`);
		}
		return payload.result;
	} catch (error) {
		if (error?.name === 'AbortError') {
			throw new Error('Parakit App Preview did not respond in time.');
		}
		throw error;
	} finally {
		clearTimeout(timeout);
	}
}

async function callTool(name, args) {
	if (!TOOL_DEFINITIONS.some(tool => tool.name === name)) {
		throw new Error(`Unknown App Preview tool: ${name}`);
	}
	const result = await postToBridge(name, args);
	if (name === 'screenshot_app_preview' && typeof result?.data === 'string') {
		return {
			content: [{
				type: 'image',
				data: result.data,
				mimeType: result.mimeType || 'image/jpeg',
			}],
		};
	}
	return toolText(JSON.stringify(result, undefined, 2));
}

async function handleRequest(message) {
	if (message.method === 'initialize') {
		writeResult(message.id, {
			protocolVersion: message.params?.protocolVersion || '2024-11-05',
			capabilities: { tools: {} },
			serverInfo: { name: SERVER_NAME, version: '0.1.0' },
		});
		return;
	}

	if (message.method === 'notifications/initialized') {
		return;
	}

	if (message.method === 'ping') {
		writeResult(message.id, {});
		return;
	}

	if (message.method === 'tools/list') {
		writeResult(message.id, { tools: TOOL_DEFINITIONS });
		return;
	}

	if (message.method === 'tools/call') {
		try {
			const toolResult = await callTool(message.params?.name, message.params?.arguments);
			writeResult(message.id, toolResult);
		} catch (error) {
			writeResult(message.id, toolText(error instanceof Error ? error.message : String(error), true));
		}
		return;
	}

	if (message.id !== undefined) {
		writeError(message.id, -32601, `Unsupported MCP method: ${message.method}`);
	}
}

const input = readline.createInterface({ input: process.stdin });
input.on('line', line => {
	const trimmed = line.trim();
	if (!trimmed) {
		return;
	}

	let message;
	try {
		message = JSON.parse(trimmed);
	} catch {
		return;
	}

	void handleRequest(message).catch(error => {
		if (message.id !== undefined) {
			writeError(message.id, -32000, error instanceof Error ? error.message : String(error));
		}
	});
});

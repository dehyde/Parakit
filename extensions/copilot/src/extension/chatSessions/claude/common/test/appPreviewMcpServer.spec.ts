/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppPreviewMcpServerContributor, AppPreviewMcpToolNames, AppPreviewWorkbenchCommandIds } from '../mcpServers/appPreviewMcpServer';

const mockState = vi.hoisted(() => ({
	executeCommand: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(),
}));

vi.mock('vscode', () => ({
	commands: {
		executeCommand: (command: string, args?: unknown) => mockState.executeCommand(command, args),
	},
}));

interface TestTool {
	readonly name: string;
	readonly description: string;
	readonly schema: unknown;
	readonly handler: (args?: unknown) => Promise<unknown>;
}

function createContributor(): AppPreviewMcpServerContributor {
	const sdkLoader = {
		load: async () => ({
			tool: (name: string, description: string, schema: unknown, handler: (args?: unknown) => Promise<unknown>): TestTool => ({
				name,
				description,
				schema,
				handler,
			}),
			createSdkMcpServer: (server: unknown) => server,
		}),
	};
	return new AppPreviewMcpServerContributor(sdkLoader as never);
}

describe('AppPreviewMcpServerContributor', () => {
	beforeEach(() => {
		mockState.executeCommand.mockReset().mockResolvedValue({ ok: true });
	});

	it('registers the app_preview server with all expected tools', async () => {
		const servers = await createContributor().getMcpServers();
		const server = servers.app_preview as unknown as { name: string; tools: TestTool[] };

		expect(server.name).toBe('app_preview');
		expect(server.tools.map(tool => tool.name)).toEqual([
			AppPreviewMcpToolNames.GetStatus,
			AppPreviewMcpToolNames.RunServer,
			AppPreviewMcpToolNames.RestartServer,
			AppPreviewMcpToolNames.Navigate,
			AppPreviewMcpToolNames.Read,
			AppPreviewMcpToolNames.Screenshot,
			AppPreviewMcpToolNames.Click,
			AppPreviewMcpToolNames.Type,
		]);
	});

	it('routes each tool to the matching workbench command', async () => {
		mockState.executeCommand.mockImplementation(async command => {
			if (command === AppPreviewWorkbenchCommandIds.Screenshot) {
				return { mimeType: 'image/jpeg', data: 'abc' };
			}
			return { command };
		});

		const server = (await createContributor().getMcpServers()).app_preview as unknown as { tools: TestTool[] };
		const tools = new Map(server.tools.map(tool => [tool.name, tool]));

		await tools.get(AppPreviewMcpToolNames.GetStatus)!.handler();
		expect(mockState.executeCommand).toHaveBeenLastCalledWith(AppPreviewWorkbenchCommandIds.GetStatus, undefined);

		await tools.get(AppPreviewMcpToolNames.RunServer)!.handler();
		expect(mockState.executeCommand).toHaveBeenLastCalledWith(AppPreviewWorkbenchCommandIds.RunServer, undefined);

		await tools.get(AppPreviewMcpToolNames.RestartServer)!.handler();
		expect(mockState.executeCommand).toHaveBeenLastCalledWith(AppPreviewWorkbenchCommandIds.RestartServer, undefined);

		const navigateArgs = { url: 'http://localhost:3000/' };
		await tools.get(AppPreviewMcpToolNames.Navigate)!.handler(navigateArgs);
		expect(mockState.executeCommand).toHaveBeenLastCalledWith(AppPreviewWorkbenchCommandIds.Navigate, navigateArgs);

		await tools.get(AppPreviewMcpToolNames.Read)!.handler();
		expect(mockState.executeCommand).toHaveBeenLastCalledWith(AppPreviewWorkbenchCommandIds.ReadPage, undefined);

		const screenshotArgs = { selector: 'main' };
		const screenshotResult = await tools.get(AppPreviewMcpToolNames.Screenshot)!.handler(screenshotArgs);
		expect(mockState.executeCommand).toHaveBeenLastCalledWith(AppPreviewWorkbenchCommandIds.Screenshot, screenshotArgs);
		expect(screenshotResult).toEqual({ content: [{ type: 'image', data: 'abc', mimeType: 'image/jpeg' }] });

		const clickArgs = { selector: 'button' };
		await tools.get(AppPreviewMcpToolNames.Click)!.handler(clickArgs);
		expect(mockState.executeCommand).toHaveBeenLastCalledWith(AppPreviewWorkbenchCommandIds.Click, clickArgs);

		const typeArgs = { selector: 'input', text: 'hello' };
		await tools.get(AppPreviewMcpToolNames.Type)!.handler(typeArgs);
		expect(mockState.executeCommand).toHaveBeenLastCalledWith(AppPreviewWorkbenchCommandIds.Type, typeArgs);
	});
});

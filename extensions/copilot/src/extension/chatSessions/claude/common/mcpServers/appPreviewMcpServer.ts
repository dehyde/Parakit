/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import * as vscode from 'vscode';
import { z } from 'zod';
import { IClaudeAgentSdkLoaderService } from '../claudeAgentSdkLoaderService';
import { IClaudeMcpServerContributor, registerClaudeMcpServerContributor } from '../claudeMcpServerRegistry';

export const AppPreviewWorkbenchCommandIds = {
	GetStatus: 'workbench.action.appPreview.getStatus',
	RunServer: 'workbench.action.appPreview.runServer',
	RestartServer: 'workbench.action.appPreview.restartServer',
	Navigate: 'workbench.action.appPreview.navigate',
	ReadPage: 'workbench.action.appPreview.readPage',
	Screenshot: 'workbench.action.appPreview.screenshot',
	Click: 'workbench.action.appPreview.click',
	Type: 'workbench.action.appPreview.type',
} as const;

export const AppPreviewMcpToolNames = {
	GetStatus: 'get_app_preview_status',
	RunServer: 'run_preview_server',
	RestartServer: 'restart_preview_server',
	Navigate: 'navigate_app_preview',
	Read: 'read_app_preview',
	Screenshot: 'screenshot_app_preview',
	Click: 'click_app_preview',
	Type: 'type_in_app_preview',
} as const;

function jsonToolResult(value: unknown): { content: { type: 'text'; text: string }[] } {
	return {
		content: [{
			type: 'text',
			text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
		}],
	};
}

async function executeWorkbenchCommand<T>(commandId: string, args?: unknown): Promise<T> {
	try {
		return await vscode.commands.executeCommand<T>(commandId, args);
	} catch (error) {
		throw new Error(error instanceof Error ? error.message : String(error));
	}
}

export class AppPreviewMcpServerContributor implements IClaudeMcpServerContributor {

	constructor(
		@IClaudeAgentSdkLoaderService private readonly sdkLoader: IClaudeAgentSdkLoaderService,
	) { }

	async getMcpServers(): Promise<Record<string, McpServerConfig>> {
		const { tool, createSdkMcpServer } = await this.sdkLoader.load();

		const getStatusTool = tool(
			AppPreviewMcpToolNames.GetStatus,
			'Get the integrated App Preview status, including URL, branch, server state, health, command, message, and whether configuration is needed.',
			{},
			async () => jsonToolResult(await executeWorkbenchCommand(AppPreviewWorkbenchCommandIds.GetStatus))
		);

		const runServerTool = tool(
			AppPreviewMcpToolNames.RunServer,
			'Start the project preview server through the IDE and open it in the integrated App Preview tab.',
			{},
			async () => jsonToolResult(await executeWorkbenchCommand(AppPreviewWorkbenchCommandIds.RunServer))
		);

		const restartServerTool = tool(
			AppPreviewMcpToolNames.RestartServer,
			'Restart the project preview server through the IDE and reopen it in the integrated App Preview tab.',
			{},
			async () => jsonToolResult(await executeWorkbenchCommand(AppPreviewWorkbenchCommandIds.RestartServer))
		);

		const navigateTool = tool(
			AppPreviewMcpToolNames.Navigate,
			'Navigate the integrated App Preview tab to a URL. Use this instead of opening Chrome or another external browser.',
			{
				url: z.string().describe('Absolute http:// or https:// URL to open in the integrated App Preview tab.'),
			},
			async (args: { url: string }) => jsonToolResult(await executeWorkbenchCommand(AppPreviewWorkbenchCommandIds.Navigate, args))
		);

		const readTool = tool(
			AppPreviewMcpToolNames.Read,
			'Read the current integrated App Preview page and return an accessibility/DOM summary for inspection and element selection.',
			{},
			async () => jsonToolResult(await executeWorkbenchCommand(AppPreviewWorkbenchCommandIds.ReadPage))
		);

		const screenshotTool = tool(
			AppPreviewMcpToolNames.Screenshot,
			'Capture a screenshot of the integrated App Preview viewport, or a specific element when a ref or selector is provided.',
			{
				ref: z.string().optional().describe('Element reference from read_app_preview.'),
				selector: z.string().optional().describe('Playwright selector to capture when ref is unavailable.'),
				element: z.string().optional().describe('Human-readable element description.'),
				scrollIntoViewIfNeeded: z.boolean().optional().describe('Scroll the element into view before capturing.'),
			},
			async (args: { ref?: string; selector?: string; element?: string; scrollIntoViewIfNeeded?: boolean }) => {
				const result = await executeWorkbenchCommand<{ mimeType: string; data: string }>(AppPreviewWorkbenchCommandIds.Screenshot, args);
				return {
					content: [{
						type: 'image' as const,
						data: result.data,
						mimeType: result.mimeType,
					}],
				};
			}
		);

		const clickTool = tool(
			AppPreviewMcpToolNames.Click,
			'Click an element inside the integrated App Preview. Operates only on the App Preview page.',
			{
				ref: z.string().optional().describe('Element reference from read_app_preview.'),
				selector: z.string().optional().describe('Playwright selector to click when ref is unavailable.'),
				element: z.string().optional().describe('Human-readable element description.'),
				doubleClick: z.boolean().optional().describe('Double-click instead of single-click.'),
				button: z.enum(['left', 'right', 'middle']).optional().describe('Mouse button. Defaults to left.'),
			},
			async (args: { ref?: string; selector?: string; element?: string; doubleClick?: boolean; button?: 'left' | 'right' | 'middle' }) => jsonToolResult(await executeWorkbenchCommand(AppPreviewWorkbenchCommandIds.Click, args))
		);

		const typeTool = tool(
			AppPreviewMcpToolNames.Type,
			'Type text or press a key inside the integrated App Preview. Operates only on the App Preview page.',
			{
				text: z.string().optional().describe('Text to type. One of text or key is required.'),
				key: z.string().optional().describe('Key or key combination to press, such as Enter, Tab, or Control+c.'),
				ref: z.string().optional().describe('Element reference from read_app_preview.'),
				selector: z.string().optional().describe('Playwright selector to target when ref is unavailable.'),
				element: z.string().optional().describe('Human-readable element description.'),
				submit: z.boolean().optional().describe('Press Enter after typing text.'),
			},
			async (args: { text?: string; key?: string; ref?: string; selector?: string; element?: string; submit?: boolean }) => jsonToolResult(await executeWorkbenchCommand(AppPreviewWorkbenchCommandIds.Type, args))
		);

		const server = createSdkMcpServer({
			name: 'app_preview',
			version: '0.0.1',
			tools: [
				getStatusTool,
				runServerTool,
				restartServerTool,
				navigateTool,
				readTool,
				screenshotTool,
				clickTool,
				typeTool,
			],
		});

		return { app_preview: server };
	}
}

registerClaudeMcpServerContributor(AppPreviewMcpServerContributor);

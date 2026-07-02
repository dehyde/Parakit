/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { IElementData, IBrowserViewTheme } from '../common/browserView.js';
import { ICDPConnection } from '../common/cdp/types.js';
import { extractNodeData as extractNodeDataFromConnection } from '../common/cdpElementExtraction.js';

export { captureElementStates, extractMatchedStyleRules, extractNodeData } from '../common/cdpElementExtraction.js';

export interface IFrameElementHandle extends IDisposable {
	addToChat(): Promise<void>;
	highlight(): Promise<void>;
	hideHighlight(): Promise<void>;
}

interface ILayoutMetricsResult {
	cssVisualViewport?: {
		scale?: number;
	};
}

/** Slightly customised CDP debugger inspect highlight colours. */
export const inspectHighlightConfig = {
	showInfo: true,
	showRulers: false,
	showStyles: true,
	showAccessibilityInfo: true,
	showExtensionLines: false,
	contrastAlgorithm: 'aa',
	contentColor: { r: 173, g: 216, b: 255, a: 0.8 },
	paddingColor: { r: 150, g: 200, b: 255, a: 0.5 },
	borderColor: { r: 120, g: 180, b: 255, a: 0.7 },
	marginColor: { r: 200, g: 220, b: 255, a: 0.4 },
	eventTargetColor: { r: 130, g: 160, b: 255, a: 0.8 },
	shapeColor: { r: 130, g: 160, b: 255, a: 0.8 },
	shapeMarginColor: { r: 130, g: 160, b: 255, a: 0.5 },
	gridHighlightConfig: {
		rowGapColor: { r: 140, g: 190, b: 255, a: 0.3 },
		rowHatchColor: { r: 140, g: 190, b: 255, a: 0.7 },
		columnGapColor: { r: 140, g: 190, b: 255, a: 0.3 },
		columnHatchColor: { r: 140, g: 190, b: 255, a: 0.7 },
		rowLineColor: { r: 120, g: 180, b: 255 },
		columnLineColor: { r: 120, g: 180, b: 255 },
		rowLineDash: true,
		columnLineDash: true
	},
	flexContainerHighlightConfig: {
		containerBorder: { color: { r: 120, g: 180, b: 255 }, pattern: 'solid' },
		itemSeparator: { color: { r: 140, g: 190, b: 255 }, pattern: 'solid' },
		lineSeparator: { color: { r: 140, g: 190, b: 255 }, pattern: 'solid' },
		mainDistributedSpace: { hatchColor: { r: 140, g: 190, b: 255, a: 0.7 }, fillColor: { r: 140, g: 190, b: 255, a: 0.4 } },
		crossDistributedSpace: { hatchColor: { r: 140, g: 190, b: 255, a: 0.7 }, fillColor: { r: 140, g: 190, b: 255, a: 0.4 } },
		rowGapSpace: { hatchColor: { r: 140, g: 190, b: 255, a: 0.7 }, fillColor: { r: 140, g: 190, b: 255, a: 0.4 } },
		columnGapSpace: { hatchColor: { r: 140, g: 190, b: 255, a: 0.7 }, fillColor: { r: 140, g: 190, b: 255, a: 0.4 } },
	},
	flexItemHighlightConfig: {
		baseSizeBox: { hatchColor: { r: 130, g: 170, b: 255, a: 0.6 } },
		baseSizeBorder: { color: { r: 120, g: 180, b: 255 }, pattern: 'solid' },
		flexibilityArrow: { color: { r: 130, g: 190, b: 255 } }
	},
};

/**
 * Per-frame element inspector backed by a dedicated CDP session.
 *
 * Owns the full lifecycle of element inspection for a single frame:
 * CDP domain initialization, element picking (overlay + CDP modes),
 * node data extraction, and highlight management.
 *
 * Fires {@link onDidInspectElement} when an element is selected via
 * CDP inspect mode (debugger paused).
 */
export class BrowserViewFrameInspector extends Disposable {

	private _isDisposed = false;
	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose: Event<void> = this._onWillDispose.event;

	private readonly _onDidInspectElement = this._register(new Emitter<IElementData>());
	readonly onDidInspectElement: Event<IElementData> = this._onDidInspectElement.event;

	private readonly _onDidStopPicking = this._register(new Emitter<void>());
	readonly onDidStopPicking: Event<void> = this._onDidStopPicking.event;

	private _isPaused = false;
	private readonly _activeInspection = this._register(new MutableDisposable<IDisposable>());

	/** Whether this frame's JavaScript execution is currently paused by the debugger. */
	get isPaused(): boolean { return this._isPaused; }

	/** Whether element inspection is currently active on this frame. */
	get isInspecting(): boolean { return !!this._activeInspection.value; }

	/** The CDP frame ID for this frame. */
	get frameId(): string { return this._frameId; }

	/**
	 * @param connection The CDP session that owns this frame's target.
	 * @param frame The Electron WebFrameMain for this frame.
	 * @param _uniqueContextId The unique execution context ID for Runtime calls in this frame.
	 * @param _frameId The CDP frame ID for this frame.
	 */
	constructor(
		readonly connection: ICDPConnection,
		readonly frame: Electron.WebFrameMain,
		private readonly _uniqueContextId: string,
		private readonly _frameId: string,
	) {
		super();

		this._register(connection.onClose(() => {
			this.dispose();
		}));

		this._register(connection.onEvent(async event => {
			switch (event.method) {
				case 'Overlay.inspectNodeRequested': {
					const params = event.params as { backendNodeId: number };
					// Only handle this event when VS Code's own element picker is active.
					// This event also fires when the user inspects elements via the
					// DevTools built-in inspect cursor — in that case we must not
					// silently add the element to Copilot Chat as context.
					if (params?.backendNodeId && this.isInspecting) {
						try {
							// Verify the node belongs to this frame (important when
							// sharing a session with same-origin siblings).
							const { node } = await this.connection.sendCommand('DOM.describeNode', {
								backendNodeId: params.backendNodeId,
							}) as { node: { frameId?: string } };
							if (node.frameId && node.frameId !== this._frameId) {
								break;
							}
							const nodeData = await this.extractNodeData({ backendNodeId: params.backendNodeId });
							this._onDidInspectElement.fire(nodeData);
						} catch {
							// Best effort.
						}
					}
					break;
				}
				case 'Debugger.paused':
					this._isPaused = true;
					break;
				case 'Debugger.resumed':
					this._isPaused = false;
					break;
			}
		}));

		// Listen for element-picked IPC from this frame's preload
		const onPicked = async (event: Electron.IpcMainEvent, pickId: string) => {
			if (!pickId || event.senderFrame !== this.frame) {
				return;
			}
			try {
				const nodeData = await this.extractNodeDataById(pickId);
				this._onDidInspectElement.fire(nodeData);
			} catch {
				// Best effort; user can re-pick.
			}
		};
		frame.ipc.on('vscode:browserView:elementPicked', onPicked);
		this._register({ dispose: () => frame.ipc.removeListener('vscode:browserView:elementPicked', onPicked) });

		// Listen for pick-stopped IPC from this frame's preload
		const onPickStopped = (event: Electron.IpcMainEvent) => {
			if (event.senderFrame !== this.frame) {
				return;
			}
			this._onDidStopPicking.fire();
		};
		frame.ipc.on('vscode:browserView:elementPickStopped', onPickStopped);
		this._register({ dispose: () => frame.ipc.removeListener('vscode:browserView:elementPickStopped', onPickStopped) });

		this._enableDomains().catch(() => { });
	}

	private async _enableDomains(): Promise<void> {
		await this.connection.sendCommand('DOM.enable');
		await this.connection.sendCommand('Overlay.enable');
		await this.connection.sendCommand('CSS.enable');
		await this.connection.sendCommand('Runtime.enable');
		await this.connection.sendCommand('Page.enable');
	}

	override dispose() {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		this._onWillDispose.fire();
		super.dispose();
	}

	/**
	 * Send the theme to this frame's preload.
	 */
	setTheme(theme: IBrowserViewTheme): void {
		this.frame.postMessage('vscode:browserView:setTheme', theme);
	}

	/**
	 * Start element inspection on this frame.
	 * Uses CDP inspect mode if paused, otherwise the preload picker.
	 * Stores a disposable so stop always tears down the correct mode.
	 */
	async startInspection(): Promise<void> {
		if (this._isPaused) {
			await this.connection.sendCommand('Overlay.setInspectMode', {
				mode: 'searchForNode',
				highlightConfig: inspectHighlightConfig,
			});
			this._activeInspection.value = {
				dispose: async () => {
					if (this.frame.isDestroyed()) {
						return;
					}
					try {
						await this.connection.sendCommand('Overlay.setInspectMode', {
							mode: 'none',
							highlightConfig: { showInfo: false, showStyles: false }
						});
						await this.connection.sendCommand('Overlay.hideHighlight');
					} catch {
						// Best effort.
					}
				}
			};
		} else {
			this.frame.postMessage('vscode:browserView:startElementPicker', {});
			this._activeInspection.value = {
				dispose: () => {
					if (this.frame.isDestroyed()) {
						return;
					}
					this.frame.postMessage('vscode:browserView:stopElementPicker', {});
				}
			};
		}
	}

	/**
	 * Stop element inspection on this frame.
	 */
	async stopInspection(): Promise<void> {
		this._activeInspection.clear();
	}

	/**
	 * Resolve an element by its preload-tracked id and extract full node data.
	 */
	async extractNodeDataById(elementId: string): Promise<IElementData> {
		const { result } = await this.connection.sendCommand('Runtime.evaluate', {
			expression: `window.__vscode_helpers?.getElement(${JSON.stringify(elementId)})`,
			returnByValue: false,
			uniqueContextId: this._uniqueContextId,
		}) as { result: { objectId?: string } };

		if (!result?.objectId) {
			throw new Error(`Element not found: ${elementId}`);
		}

		return this.extractNodeData({ objectId: result.objectId });
	}

	/**
	 * Extract full element data from a CDP node reference.
	 */
	async extractNodeData(id: { nodeId?: number; backendNodeId?: number; objectId?: string }, options?: { readonly states?: readonly string[] }): Promise<IElementData> {
		const data = await extractNodeDataFromConnection(this.connection, id, options);
		return { ...data, url: this.frame.url };
	}

	/**
	 * Get the visual viewport scale for this frame.
	 */
	async getVisualViewportScale(): Promise<number> {
		try {
			const result = await this.connection.sendCommand('Page.getLayoutMetrics') as ILayoutMetricsResult;
			if (typeof result.cssVisualViewport?.scale === 'number') {
				const scale = Number(result.cssVisualViewport.scale);
				if (Number.isFinite(scale) && scale > 0) {
					return scale;
				}
			}
		} catch {
			// Ignore execution errors while loading and use defaults.
		}
		return 1;
	}

	/**
	 * Create a handle to an element tracked by the preload script.
	 */
	getElementHandle(elementId: string): IFrameElementHandle {
		let disposed = false;
		return {
			addToChat: async () => {
				const nodeData = await this.extractNodeDataById(elementId);
				this._onDidInspectElement.fire(nodeData);
			},
			highlight: async () => {
				this.frame.postMessage('vscode:browserView:highlightElement', { elementId });
			},
			hideHighlight: async () => {
				this.frame.postMessage('vscode:browserView:hideHighlight', {});
			},
			dispose: () => {
				if (disposed) {
					return;
				}
				disposed = true;
				this.frame.postMessage('vscode:browserView:hideHighlight', {});
			}
		};
	}
}

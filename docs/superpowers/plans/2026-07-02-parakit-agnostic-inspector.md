# Parakit Agnostic Element Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Parakit's App Preview element inspector return real interactive-state styles (hover/focus/active), real component identity for any UI framework (not just React), and real design-token names resolved from structured sources (not text-scanning guesses) — and expose all of it both to AI agents (a new MCP tool) and directly to designers (a new floating panel in the preview itself), without hardcoding any specific design system, framework, or company.

**Architecture:** The existing CDP-based inspection pipeline (`browserViewFrameInspector.ts` + `browserDesignElementService.ts`) already does real, source-backed extraction — it is just (a) missing interactive-state capture, (b) reachable only from a human UI action inside the VS Code-native "Browser editor", not from the separate Playwright-driven "App Preview" surface the MCP tools automate, (c) React-only for component identity, and (d) guessing tokens via regex-scanned file text instead of parsing structured token sources. Five independent, sequentially-buildable slices close each gap, in priority order (cheapest/highest-value first): (1) forced pseudo-state capture in the CDP layer, (2) a bridge from Playwright's ref/selector world into that CDP layer, exposed as a new agent-facing tool, (3) structured (not regex-guessed) token resolution, (4) framework-agnostic component identification, (5) a floating panel so a human gets the same answer without going through chat.

**Tech Stack:** TypeScript (VS Code source conventions: no `any`, no non-null assertions, `Promise<ConcreteType>` everywhere), Chrome DevTools Protocol (CDP) via the existing `ICDPConnection` abstraction, Playwright (already a dependency, used only for its ref/selector resolution), Mocha unit tests run via `scripts/test.sh`, plain DOM rendering (`base/browser/dom.js` — this subsystem has no React/JSX anywhere, don't introduce any).

## Global Constraints

- Never hardcode or assume any specific design system, component library, framework, or company name anywhere in this code — all detection/resolution must work on any web app. This is a hard product requirement, not a style preference.
- Match existing code style exactly: `async fn(...): Promise<ConcreteType>` (never `Promise<any>`), cast `sendCommand`'s `unknown` result inline at the call site (`as { ... }`), fatal failures `throw new Error('...')`, non-fatal failures `try { } catch { }` or `.catch(() => fallback)`.
- No `any`, no `!` non-null assertions, no `@ts-ignore`.
- Every Promise must be handled (`.catch(...)` or `try/catch`) — this repo enforces it the same way strict downstream ESLint configs do.
- Test runner for anything under `src/vs/.../test/electron-browser/` or `test/electron-main/`: `./scripts/test.sh --run <path-to-test-file>` (add `--grep "<name>"` to narrow further). This spins up a real Electron build, so it is slower than a plain Node test — run it once per task, not after every micro-edit.
- Do not reformat or restructure files beyond the lines a task actually changes.
- Every new field added to a shared interface (`IElementData` etc.) must be optional (`readonly foo?:`) so existing callers that construct these objects (tests, other call sites) keep compiling untouched.

---

## Priority 1 — Force real interactive states via CDP

**Why first:** `CSS.forcePseudoState` is a native, standard Chrome DevTools Protocol capability — no framework or design-system knowledge required — and a full grep of the codebase confirms it is used nowhere today. This is the cheapest, highest-value, zero-architectural-risk change: it only touches one file plus its type definitions.

### Task 1: Add the `IElementStateStyles` type and `states` field to `IElementData`

**Files:**
- Modify: `src/vs/platform/browserView/common/browserView.ts:66-78`

**Interfaces:**
- Produces: `IElementStateStyles { state: string; computedStyles: Record<string, string>; matchedStyleRules: readonly IElementMatchedStyleRule[] }`, and `IElementData.states?: readonly IElementStateStyles[]`, both consumed by Task 2.

- [ ] **Step 1: Add the new interface and field**

Open `src/vs/platform/browserView/common/browserView.ts`. Find the existing `IElementData` interface (lines 66-78):

```ts
export interface IElementData {
	readonly url?: string;
	readonly outerHTML: string;
	readonly computedStyle: string;
	readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
	readonly ancestors?: IElementAncestor[];
	readonly attributes?: Record<string, string>;
	readonly computedStyles?: Record<string, string>;
	readonly dimensions?: { readonly top: number; readonly left: number; readonly width: number; readonly height: number };
	readonly innerText?: string;
	readonly matchedStyleRules?: readonly IElementMatchedStyleRule[];
	readonly reactComponents?: readonly IElementReactComponent[];
}
```

Replace it with (new interface added just above, new field added at the end of `IElementData`):

```ts
export interface IElementStateStyles {
	readonly state: string;
	readonly computedStyles: Record<string, string>;
	readonly matchedStyleRules: readonly IElementMatchedStyleRule[];
}

export interface IElementData {
	readonly url?: string;
	readonly outerHTML: string;
	readonly computedStyle: string;
	readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
	readonly ancestors?: IElementAncestor[];
	readonly attributes?: Record<string, string>;
	readonly computedStyles?: Record<string, string>;
	readonly dimensions?: { readonly top: number; readonly left: number; readonly width: number; readonly height: number };
	readonly innerText?: string;
	readonly matchedStyleRules?: readonly IElementMatchedStyleRule[];
	readonly reactComponents?: readonly IElementReactComponent[];
	readonly states?: readonly IElementStateStyles[];
}
```

- [ ] **Step 2: Compile-check**

Run: `cd /Users/tombar-gal/Documents/DesignerRepos/VSCodeFork && npx tsc --noEmit -p src/tsconfig.json`
Expected: no new errors (this is a pure additive/optional change — nothing consumes the old shape exhaustively).

- [ ] **Step 3: Commit**

```bash
git add src/vs/platform/browserView/common/browserView.ts
git commit -m "Add IElementStateStyles type for forced pseudo-state capture"
```

---

### Task 2: Implement `captureElementStates` and wire it into `extractNodeData`

**Files:**
- Modify: `src/vs/platform/browserView/electron-main/browserViewFrameInspector.ts`

**Interfaces:**
- Consumes: `ICDPConnection.sendCommand(method: string, params?: unknown, sessionId?: string): Promise<unknown>` (existing), `IElementStateStyles` (Task 1), the file's own existing `extractMatchedStyleRules(matched: IMatchedStyles): readonly IElementMatchedStyleRule[]` (already defined at line 556 in this same file — no new import needed).
- Produces: `export async function captureElementStates(connection: ICDPConnection, nodeId: number, states: readonly string[]): Promise<readonly IElementStateStyles[]>`, consumed directly by Task 5. Also widens `extractNodeData`'s `id` parameter type to accept an optional `nodeId`, and adds an optional third `options` parameter — both consumed by Task 5.

- [ ] **Step 1: Write the failing unit test first**

Create `src/vs/platform/browserView/test/electron-main/browserViewFrameInspector.test.ts` (new file — the `test/electron-main/` folder does not exist yet under `platform/browserView/`; create it):

```ts
import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CDPEvent, ICDPConnection } from '../../common/cdp/types.js';
import { captureElementStates } from '../../electron-main/browserViewFrameInspector.js';

class FakeCDPConnection implements ICDPConnection {
	readonly sessionId = 'fake-session';
	readonly targetId = 'fake-target';

	private readonly _onEvent = new Emitter<CDPEvent>();
	readonly onEvent: Event<CDPEvent> = this._onEvent.event;

	private readonly _onClose = new Emitter<void>();
	readonly onClose: Event<void> = this._onClose.event;

	readonly calls: Array<{ method: string; params: unknown }> = [];

	constructor(private readonly _responses: Record<string, unknown>) { }

	dispose(): void {
		this._onEvent.dispose();
		this._onClose.dispose();
	}

	async sendCommand(method: string, params?: unknown): Promise<unknown> {
		this.calls.push({ method, params });
		return method in this._responses ? this._responses[method] : {};
	}
}

suite('captureElementStates', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('forces each requested pseudo-state, captures matched CSS variables and rules, then restores', async () => {
		const connection = store.add(new FakeCDPConnection({
			'CSS.getMatchedStylesForNode': {
				matchedCSSRules: [{
					rule: {
						origin: 'regular',
						style: { cssText: 'color: var(--brand-color);', cssProperties: [{ name: 'color', value: 'var(--brand-color)' }] },
						selectorList: { selectors: [{ text: '.btn:hover' }] },
					},
				}],
			},
			'CSS.getComputedStyleForNode': {
				computedStyle: [
					{ name: 'color', value: 'rgb(255, 0, 0)' },
					{ name: '--brand-color', value: '#ff0000' },
				],
			},
		}));

		const states = await captureElementStates(connection, 42, ['hover', 'focus']);

		assert.strictEqual(states.length, 2);
		assert.strictEqual(states[0].state, 'hover');
		assert.strictEqual(states[0].computedStyles['--brand-color'], '#ff0000');
		assert.strictEqual(states[0].matchedStyleRules.length, 1);
		assert.strictEqual(states[0].matchedStyleRules[0].selector, '.btn:hover');

		const forceCalls = connection.calls.filter(call => call.method === 'CSS.forcePseudoState');
		assert.strictEqual(forceCalls.length, 3, 'hover, focus, then a final restore-to-empty call');
		assert.deepStrictEqual(forceCalls[0].params, { nodeId: 42, forcedPseudoClasses: ['hover'] });
		assert.deepStrictEqual(forceCalls[1].params, { nodeId: 42, forcedPseudoClasses: ['focus'] });
		assert.deepStrictEqual(forceCalls[2].params, { nodeId: 42, forcedPseudoClasses: [] });
	});

	test('silently drops pseudo-state names the CDP protocol does not support', async () => {
		const connection = store.add(new FakeCDPConnection({}));

		const states = await captureElementStates(connection, 1, ['made-up-state']);

		assert.strictEqual(states.length, 0);
		assert.strictEqual(connection.calls.length, 0, 'an unsupported state name should never reach sendCommand');
	});

	test('always restores state even if a forced-state read throws', async () => {
		let call = 0;
		const connection: ICDPConnection = {
			sessionId: 'fake', targetId: 'fake',
			onEvent: Event.None, onClose: Event.None,
			dispose: () => { },
			sendCommand: async (method: string, params?: unknown) => {
				call++;
				if (method === 'CSS.getMatchedStylesForNode') {
					throw new Error('boom');
				}
				return {};
			},
		};

		const states = await captureElementStates(connection, 1, ['hover']);

		assert.strictEqual(states.length, 0, 'the failed state is skipped, not thrown');
		assert.ok(call >= 2, 'forcePseudoState(hover) and the restore-to-empty call both still happened');
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./scripts/test.sh --run src/vs/platform/browserView/test/electron-main/browserViewFrameInspector.test.ts`
Expected: FAIL — `captureElementStates` is not exported from `browserViewFrameInspector.ts` (module has no export of that name).

- [ ] **Step 3: Implement `captureElementStates`**

Open `src/vs/platform/browserView/electron-main/browserViewFrameInspector.ts`. Add this new exported function directly below the existing `extractMatchedStyleRules` function (which ends at line 598 — insert after it, before `extractNodeData` at line 348 stays where it is; place the new function anywhere at module scope, e.g. right after `extractMatchedStyleRules`):

```ts
const FORCEABLE_PSEUDO_CLASSES = new Set(['active', 'focus', 'focus-visible', 'focus-within', 'hover', 'target', 'visited']);

/**
 * Forces each requested CSS pseudo-class one at a time via CDP (no real mouse/keyboard
 * event needed) and captures the resulting matched rules + CSS-variable-relevant computed
 * styles for that state. Always restores the node to its un-forced state afterward, even
 * if a per-state read fails.
 */
export async function captureElementStates(connection: ICDPConnection, nodeId: number, states: readonly string[]): Promise<readonly IElementStateStyles[]> {
	const validStates = states.filter(state => FORCEABLE_PSEUDO_CLASSES.has(state));
	if (!validStates.length) {
		return [];
	}

	const results: IElementStateStyles[] = [];
	try {
		for (const state of validStates) {
			try {
				await connection.sendCommand('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [state] });

				const matched = await connection.sendCommand('CSS.getMatchedStylesForNode', { nodeId });
				const matchedStyleRules = extractMatchedStyleRules(matched as IMatchedStyles);

				const { computedStyle: computedStyleArray } = await connection.sendCommand('CSS.getComputedStyleForNode', { nodeId }) as { computedStyle?: Array<{ name: string; value: string }> };
				const computedStyles: Record<string, string> = {};
				if (computedStyleArray) {
					for (const prop of computedStyleArray) {
						if (prop.name && typeof prop.value === 'string' && prop.name.startsWith('--')) {
							computedStyles[prop.name] = prop.value;
						}
					}
				}

				results.push({ state, computedStyles, matchedStyleRules });
			} catch {
				// Best effort per state — some pseudo-classes may not apply to this element.
			}
		}
	} finally {
		await connection.sendCommand('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] }).catch(() => {
			// Best effort restore.
		});
	}

	return results;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `./scripts/test.sh --run src/vs/platform/browserView/test/electron-main/browserViewFrameInspector.test.ts`
Expected: 3 passing tests.

- [ ] **Step 5: Wire `captureElementStates` into `extractNodeData` and widen its `id` parameter**

Still in `browserViewFrameInspector.ts`, find the exported `extractNodeData` function signature (line 348):

```ts
export async function extractNodeData(connection: ICDPConnection, id: { backendNodeId?: number; objectId?: string }): Promise<IElementData> {
```

Replace the signature with (adds `nodeId` as a third alternative locator — CDP's real `DOM.describeNode` command already accepts it; this codebase's type just hadn't needed it before — and adds an optional third `options` parameter):

```ts
export async function extractNodeData(connection: ICDPConnection, id: { nodeId?: number; backendNodeId?: number; objectId?: string }, options?: { readonly states?: readonly string[] }): Promise<IElementData> {
```

Find the final `return` statement of this function (the object literal that currently ends with `reactComponents`):

```ts
	return {
		outerHTML,
		computedStyle,
		bounds: { x, y, width, height },
		ancestors,
		attributes,
		computedStyles,
		dimensions: { top: y, left: x, width, height },
		matchedStyleRules,
		reactComponents
	};
```

Replace it with (captures states right before returning, using the already-resolved `nodeId` local variable from earlier in the function):

```ts
	const states = options?.states?.length
		? await captureElementStates(connection, nodeId, options.states).catch(() => [])
		: undefined;

	return {
		outerHTML,
		computedStyle,
		bounds: { x, y, width, height },
		ancestors,
		attributes,
		computedStyles,
		dimensions: { top: y, left: x, width, height },
		matchedStyleRules,
		reactComponents,
		states
	};
```

Also update the class method that wraps this function (`BrowserViewFrameInspector.extractNodeData`, currently):

```ts
	async extractNodeData(id: { backendNodeId?: number; objectId?: string }): Promise<IElementData> {
		const data = await extractNodeData(this.connection, id);
		return { ...data, url: this.frame.url };
	}
```

to:

```ts
	async extractNodeData(id: { nodeId?: number; backendNodeId?: number; objectId?: string }, options?: { readonly states?: readonly string[] }): Promise<IElementData> {
		const data = await extractNodeData(this.connection, id, options);
		return { ...data, url: this.frame.url };
	}
```

- [ ] **Step 6: Run the full file's tests again to confirm nothing broke**

Run: `./scripts/test.sh --run src/vs/platform/browserView/test/electron-main/browserViewFrameInspector.test.ts`
Expected: still 3 passing tests (this step only changed signatures/plumbing, not `captureElementStates` itself).

- [ ] **Step 7: Commit**

```bash
git add src/vs/platform/browserView/electron-main/browserViewFrameInspector.ts src/vs/platform/browserView/test/electron-main/browserViewFrameInspector.test.ts
git commit -m "Add CSS.forcePseudoState-based interactive state capture to the CDP inspector"
```

---

## Priority 2 — Expose rich inspection (including states) to AI agents via a new MCP tool

**Why second:** this is the biggest functional gap found during research — the rich, source-backed inspector (`browserDesignElementService.inspectElement` + the CDP pipeline from Priority 1) exists today but is only reachable by a human clicking "Add element to chat" inside the VS Code-native **Browser editor**. It is architecturally disconnected from the separate **App Preview** surface that `read_app_preview`/`click_app_preview`/etc. actually automate — those tools resolve elements purely through Playwright's internal `aria-ref=` selector engine, which never produces a CDP node handle. This priority builds the missing bridge and exposes it as a new tool, `inspect_app_preview_element`.

**Confirmed by research (do not re-derive):** Playwright's CDP session and the platform's own `ICDPConnection`/`BrowserViewFrameInspector` both attach to the *same* Electron `webContents.debugger` for a given tab (`electron-main/browserViewCDPTarget.ts:64-68`), just as separate CDP *sessions*. Electron permits multiple `Target.attachToTarget` sessions from one `webContents.debugger.attach()`. A CDP `backendNodeId` is stable across sessions to the same target; a `nodeId` is only valid within the session that requested `DOM.getDocument`. There is currently no code path that converts a Playwright-resolved element into any kind of CDP handle — this must be built.

### Task 3: Add a way to obtain the Electron CDP `targetId` for a given App Preview page

**Files:**
- Modify: `src/vs/platform/browserView/electron-main/browserViewMainService.ts`

**Interfaces:**
- Consumes: `IBrowserViewMainService.tryGetBrowserView(id: string): BrowserView | undefined` (already exists at `electron-main/browserViewMainService.ts:31`); `BrowserView.debugger: BrowserViewDebugger` with a `.targetId: string` field (already exists, `electron-main/browserViewDebugger.ts:62,75`).
- Produces: `getTargetId(viewId: string): string | undefined`, consumed by Task 5.

- [ ] **Step 1: Add the method**

Open `src/vs/platform/browserView/electron-main/browserViewMainService.ts`. Find the class implementing `IBrowserViewMainService` and the existing `tryGetBrowserView` method. Add a new method right after it:

```ts
	getTargetId(viewId: string): string | undefined {
		return this.tryGetBrowserView(viewId)?.debugger.targetId;
	}
```

Add the same method to the `IBrowserViewMainService` interface declaration (wherever `tryGetBrowserView(id: string): BrowserView | undefined;` is declared in that same file):

```ts
	getTargetId(viewId: string): string | undefined;
```

- [ ] **Step 2: Compile-check**

Run: `cd /Users/tombar-gal/Documents/DesignerRepos/VSCodeFork && npx tsc --noEmit -p src/tsconfig.json`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/vs/platform/browserView/electron-main/browserViewMainService.ts
git commit -m "Expose the Electron CDP targetId for a BrowserView by id"
```

**Note for the implementer — bounded spike required next:** `IBrowserViewMainService` is main-process-only today; nothing exposes `getTargetId` across the IPC boundary to the shared process (`IPlaywrightService` lives there) or to the workbench (where the new command in Task 5 will run). Before Task 4, spend at most 30 minutes on this investigation:

```bash
cd /Users/tombar-gal/Documents/DesignerRepos/VSCodeFork
grep -rn "class BrowserViewGroupChannel\|registerMainProcessRemoteService(IBrowserViewGroupService\|ProxyChannel.toService" src/vs/platform/browserView/
```

This will show you the exact IPC-channel class that already exposes sibling methods like `sendCDPMessage`/`createGroup` on `IBrowserViewGroupService` (`common/browserViewGroup.ts:49-91`) across the main↔renderer boundary. Do not invent new IPC plumbing — copy the exact pattern used for one of those existing methods (same file, same class, same registration call), just naming your new method `getTargetId(viewId: string): Promise<string | undefined>` and having its body call `this.browserViewMainService.getTargetId(viewId)` (main-process side) or forward the call (client side), mirroring whichever adjacent method is structurally simplest (one that takes a single string argument and returns a primitive, not a stream/event).

### Task 4: Expose `getTargetId` on `IBrowserViewGroupService` following the mirrored pattern

**Files:**
- Modify: `src/vs/platform/browserView/common/browserViewGroup.ts` (interface + channel, exact location found via Task 3's spike)
- Modify: whichever main-process channel-implementation file the spike identifies (likely `electron-main/browserViewGroup.ts` or a dedicated channel file in the same folder)

**Interfaces:**
- Consumes: `getTargetId(viewId: string): string | undefined` from Task 3.
- Produces: `IBrowserViewGroupService.getTargetId(viewId: string): Promise<string | undefined>`, callable from workbench/shared-process code, consumed by Task 5.

- [ ] **Step 1: Run the grep from Task 3's note and read the matched file(s) in full before writing any code.** Identify the exact existing method to mirror (prefer one shaped like `(id: string) => Promise<primitive>`).

- [ ] **Step 2: Add `getTargetId` to the `IBrowserViewGroupService` interface**, copying the exact JSDoc/formatting style of the neighboring method you chose to mirror.

- [ ] **Step 3: Add the channel-side implementation**, structured identically to the mirrored method — same `case` statement shape in the channel's `call()`/`listen()` switch, same argument marshalling.

- [ ] **Step 4: Add the main-process implementation**, calling `this.browserViewMainService.getTargetId(viewId)` and wrapping the (possibly `undefined`) result in a resolved `Promise`.

- [ ] **Step 5: Compile-check**

Run: `cd /Users/tombar-gal/Documents/DesignerRepos/VSCodeFork && npx tsc --noEmit -p src/tsconfig.json`
Expected: no new errors.

- [ ] **Step 6: Manual verification (no automated test — this is thin IPC plumbing with no pure-function surface to unit test)**

Start the dev build (`./scripts/code.sh` or the project's existing dev-run script), open an App Preview tab, and in the Electron DevTools console for the **main process** (Help > Toggle Developer Tools, or attach via `--inspect`), confirm the method is reachable by temporarily adding a one-line `console.log` inside your new main-process implementation and observing it fire when Task 5's command runs (Task 5 must exist first — come back to this manual check after Task 5's Step 1 is in place, then remove the temporary log).

- [ ] **Step 7: Commit**

```bash
git add src/vs/platform/browserView/common/browserViewGroup.ts src/vs/platform/browserView/electron-main/browserViewGroup.ts
git commit -m "Expose getTargetId across the browserView IPC boundary"
```

### Task 5: Add the `inspectAppPreviewElement` workbench command — the ref/selector → CDP bridge

**Files:**
- Modify: `src/vs/workbench/contrib/browserView/electron-browser/workbenchAppPreview.contribution.ts`

**Interfaces:**
- Consumes: `this._requireTrackedPreview(): Promise<BrowserEditorInput>` (existing, line 2114); `this._playwrightService.invokeFunctionRaw`/`playwrightInvokeRaw` helper (existing, imported from `./tools/browserToolHelpers.js`); `this._browserViewGroupService.getTargetId(viewId): Promise<string | undefined>` (Task 4); `extractNodeData(connection, id, options?)` and `IElementData` (Priority 1, already exported from `browserViewFrameInspector.ts` — this file is `electron-browser`, so it must reach the `electron-main`-side function via whatever existing cross-process call convention the surrounding file already uses for CDP — see Step 0 below).
- Produces: command `workbench.action.appPreview.inspectElement`, taking `{ ref?: string; selector?: string; states?: readonly string[] }` and resolving to `IElementData`. Consumed by Task 6 and Task 7.

- [ ] **Step 0: Confirm how this file already reaches CDP-layer functions from the electron-browser/workbench side**

`browserViewFrameInspector.ts` lives under `platform/browserView/electron-main/` (Electron **main** process). `workbenchAppPreview.contribution.ts` lives under `electron-browser/` (renderer/workbench process). These are different processes — you cannot call `extractNodeData` as a plain function import across that boundary. Before writing code, run:

```bash
grep -n "browserViewCDPService\|IBrowserViewCDPService\|sendCDPMessage\|onCDPMessage" src/vs/workbench/contrib/browserView/electron-browser/workbenchAppPreview.contribution.ts | head -30
```

`IBrowserViewCDPService` (`platform/browserView/common/browserView.ts:211-233`) is the existing renderer-facing service for sending/receiving raw CDP messages through a group. Use it (or whatever this grep shows is already imported in this file) to build a minimal `ICDPConnection`-shaped wrapper in the workbench process: an object with a `sendCommand(method, params)` method that calls this service's existing "send a CDP command and await the matching response" primitive, plus `onEvent`/`onClose` wired to the service's existing CDP-message event. Since `extractNodeData`/`captureElementStates` only depend on the `ICDPConnection` interface shape (not on anything Electron-main-specific), once you have a same-shaped object in the workbench process, you can call the **same exported functions** — but you must import them from a module that is safe to load in the workbench process. `browserViewFrameInspector.ts` is in `electron-main/` and is almost certainly NOT loadable there (it likely imports `electron` main-process-only APIs). **Do not import it directly.** Instead:

- Move `captureElementStates`, `extractMatchedStyleRules`, and the pure CDP-command-sequence portion of `extractNodeData` (everything from `await connection.sendCommand('DOM.getDocument')` down to building the return object) into `src/vs/platform/browserView/common/cdpElementExtraction.ts` (new file) — this is the layer-agnostic `common/` folder already used for `browserView.ts` and `cssHelpers.ts`, safe to import from both `electron-main/` and `electron-browser/`.
- Have `browserViewFrameInspector.ts` import `extractNodeData`/`captureElementStates` from this new `common/cdpElementExtraction.ts` file instead of defining them locally (pure move, no behavior change — re-run Task 2's test after moving, pointing its import at the new path).
- Now `workbenchAppPreview.contribution.ts` can import the same functions from `../../../../platform/browserView/common/cdpElementExtraction.js`.

This refactor must land as its own commit before continuing, so Task 2's tests keep passing against the new location.

- [ ] **Step 0a: Move the code and re-run Task 2's tests**

Create `src/vs/platform/browserView/common/cdpElementExtraction.ts` containing exactly the functions `extractNodeData`, `extractReactComponents`, `extractMatchedStyleRules`, `captureElementStates`, `FORCEABLE_PSEUDO_CLASSES`, and the private helper types (`INode`, `IBoxModel`) they depend on, cut verbatim from `browserViewFrameInspector.ts`. In `browserViewFrameInspector.ts`, replace those definitions with an import:

```ts
import { extractNodeData, extractReactComponents, extractMatchedStyleRules, captureElementStates } from '../common/cdpElementExtraction.js';
```

(Keep re-exporting `extractNodeData`/`captureElementStates` from `browserViewFrameInspector.ts` too, via `export { extractNodeData, captureElementStates } from '../common/cdpElementExtraction.js';`, so nothing else that already imports them from the old path breaks.)

Update the test file's import path if needed (`../../electron-main/browserViewFrameInspector.js` still works because of the re-export, so no change is required there — verify this explicitly by re-running the test).

Run: `./scripts/test.sh --run src/vs/platform/browserView/test/electron-main/browserViewFrameInspector.test.ts`
Expected: still 3 passing tests.

Commit:
```bash
git add src/vs/platform/browserView/common/cdpElementExtraction.ts src/vs/platform/browserView/electron-main/browserViewFrameInspector.ts
git commit -m "Move CDP element extraction into common/ so both processes can use it"
```

- [ ] **Step 1: Write the new command**

In `workbenchAppPreview.contribution.ts`, find where `ClickWorkbenchAppPreviewCommandId` is declared and registered (lines 83 and 2100) — add a sibling command right after it, following the exact same registration shape:

```ts
export const InspectElementWorkbenchAppPreviewCommandId = 'workbench.action.appPreview.inspectElement';
```

And in the class body, alongside `clickAppPreview`:

**Before writing this method, check two things in this class's constructor (search for the existing `@IPlaywrightService`/`@ICommandService`-style injected parameters):**
1. Is `IBrowserViewGroupService` already injected? If not, add `@IBrowserViewGroupService private readonly _browserViewGroupService: IBrowserViewGroupService` as a new constructor parameter, importing it from `../../../../../platform/browserView/common/browserViewGroup.js`.
2. Is `generateUuid` already imported in this file (it is a very commonly-used VS Code base util, so check before adding a duplicate import)? If not, add `import { generateUuid } from '../../../../../base/common/uuid.js';` at the top.

```ts
async inspectAppPreviewElement(args?: IAppPreviewInspectElementCommandArgs): Promise<IElementData> {
	const preview = await this._requireTrackedPreview();

	// Resolved inline (not via the existing `_resolveSelector`, which is typed for
	// `IAppPreviewClickCommandArgs` — keep this command's arg type independent rather
	// than relying on structural compatibility between the two interfaces).
	let selector = args?.selector;
	if (args?.ref) {
		selector = `aria-ref=${args.ref}`;
	}
	if (!selector) {
		throw new Error('Either a "ref" or "selector" parameter is required.');
	}

	const targetId = await this._browserViewGroupService.getTargetId(preview.id);
	if (!targetId) {
		throw new Error('Could not resolve a CDP target for this App Preview tab.');
	}

	const markerId = generateUuid();
	const markerAttribute = 'data-parakit-inspect-marker';

	await playwrightInvokeRaw(this._playwrightService, APP_PREVIEW_PLAYWRIGHT_SESSION_ID, preview.id, (page, sel, attr, id) => page.locator(sel).evaluate((el, [attrName, value]) => el.setAttribute(attrName, value), [attr, id]), selector, markerAttribute, markerId);

	const connection = await this._browserViewGroupService.attachElementInspectorSession(preview.id, targetId);
	try {
		await connection.sendCommand('DOM.enable');
		await connection.sendCommand('CSS.enable');
		await connection.sendCommand('Runtime.enable');

		const { root } = await connection.sendCommand('DOM.getDocument') as { root: { nodeId: number } };
		const { nodeId } = await connection.sendCommand('DOM.querySelector', {
			nodeId: root.nodeId,
			selector: `[${markerAttribute}="${markerId}"]`,
		}) as { nodeId: number };

		if (!nodeId) {
			throw new Error(`Could not locate an element matching "${selector}" for inspection.`);
		}

		return await extractNodeData(connection, { nodeId }, { states: args?.states });
	} finally {
		await playwrightInvokeRaw(this._playwrightService, APP_PREVIEW_PLAYWRIGHT_SESSION_ID, preview.id, (page, sel, attr) => page.locator(sel).evaluate((el, attrName) => el.removeAttribute(attrName), attr), selector, markerAttribute).catch(() => {
			// Best effort cleanup.
		});
		connection.dispose();
	}
}
```

Add the args interface near `IAppPreviewClickCommandArgs`:

```ts
interface IAppPreviewInspectElementCommandArgs {
	readonly ref?: string;
	readonly selector?: string;
	readonly states?: readonly string[];
}
```

Add the import for `extractNodeData` at the top of the file:

```ts
import { extractNodeData } from '../../../../../platform/browserView/common/cdpElementExtraction.js';
```

Register the command right after `ClickWorkbenchAppPreviewCommandId`'s registration:

```ts
this._register(CommandsRegistry.registerCommand(InspectElementWorkbenchAppPreviewCommandId, (_accessor, args?: IAppPreviewInspectElementCommandArgs) => this.inspectAppPreviewElement(args)));
```

**Note:** `this._browserViewGroupService.attachElementInspectorSession(preview.id, targetId)` above is a **new method you must also add** in Task 4 alongside `getTargetId` — it should call `attachToTarget` a second time on the same debugger (mirroring `electron-main/browserViewCDPTarget.ts:64-68`'s own `this.view.debugger.attachToTarget(this.targetInfo.targetId)`) and return an `ICDPConnection`-shaped object over the existing CDP-message IPC bridge (same bridging approach as Step 0). Add this to Task 4 before continuing — it follows the exact same "mirror the sibling method, forward across the IPC channel" process as `getTargetId`, just returning a session handle instead of a string.

- [ ] **Step 2: Manual verification**

Start the dev build, open an App Preview tab pointed at any local page with a `<button>` on it. Open the main-process DevTools console and run:

```js
await require('electron').ipcMain // (or however this build exposes command invocation for manual testing — check an existing manual-test doc for this repo's convention)
```

Simpler: temporarily bind this command to a keyboard shortcut or a scratch command-palette entry, trigger it with `{selector: 'button', states: ['hover']}`, and confirm the resolved value (log it) contains `outerHTML`, `reactComponents` (if the page is React), and a `states: [{state: 'hover', ...}]` entry whose `computedStyles`/`matchedStyleRules` differ from the resting `computedStyle`.

- [ ] **Step 3: Commit**

```bash
git add src/vs/workbench/contrib/browserView/electron-browser/workbenchAppPreview.contribution.ts
git commit -m "Add workbench.action.appPreview.inspectElement command bridging Playwright refs to the CDP inspector"
```

### Task 6: Enrich the response with resolved design-token/source evidence

**Files:**
- Modify: `src/vs/workbench/contrib/browserView/common/browserDesignElementService.ts:547-560`
- Modify: `src/vs/workbench/contrib/browserView/test/electron-browser/browserDesignElementService.test.ts` (the one existing test that calls `inspectElement` and asserts only on the context key — extend it)

**Interfaces:**
- Consumes: `IElementData` (Priority 1), `createDesignElementSelection`, `resolveDesignElementProperties`, `this._getWorkspaceTokens()`, `this._findWorkspaceSourceProperties()` (all existing, unchanged).
- Produces: `inspectElement(elementData: IElementData): Promise<IDesignElementInspectionResult>` (return type changed from `Promise<void>`; the only existing caller, `browserEditorChatFeatures.ts:360`, already discards the return value with a bare `await`, so this is source-compatible). Consumed by Task 5 (call `inspectElement` after `extractNodeData` and merge its `propertyGroups` into the tool's response) and Task 11.

- [ ] **Step 1: Extend the existing test to assert on a return value**

Open `src/vs/workbench/contrib/browserView/test/electron-browser/browserDesignElementService.test.ts`. Find the test `'inspectElement marks the Design element view as selected until inspection closes'` (around line 103). Add one assertion right after `await service.inspectElement(elementData);`:

```ts
		const result = await service.inspectElement(elementData);

		assert.ok(result.propertyGroups.length > 0, 'expected at least one resolved property group for the fixture element');
		assert.strictEqual(result.selection.displayName, service.selection?.displayName);
```

(Replace the existing bare `await service.inspectElement(elementData);` line with the `const result = await service.inspectElement(elementData);` line above — keep everything else in the test unchanged.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `./scripts/test.sh --run src/vs/workbench/contrib/browserView/test/electron-browser/browserDesignElementService.test.ts --grep "marks the Design element view"`
Expected: FAIL — `result` is `undefined` (current return type is `Promise<void>`), so `result.propertyGroups` throws.

- [ ] **Step 3: Change the return type**

Open `src/vs/workbench/contrib/browserView/common/browserDesignElementService.ts`. Add a new exported interface near `IDesignElementPropertyGroup` (line 62):

```ts
export interface IDesignElementInspectionResult {
	readonly selection: IDesignElementSelection;
	readonly propertyGroups: readonly IDesignElementPropertyGroup[];
}
```

Find `inspectElement` (lines 547-560):

```ts
	async inspectElement(elementData: IElementData): Promise<void> {
		const selection = createDesignElementSelection(elementData);
		this._selection = selection;
		this._selectedContext.set(true);
		this._setInspectionActive(true);
		const [workspaceTokens, sourceProperties] = await Promise.all([
			this._getWorkspaceTokens(),
			this._findWorkspaceSourceProperties(selection)
		]);
		this._propertyGroups = resolveDesignElementProperties(selection, workspaceTokens, sourceProperties);
		this._onDidChangeSelection.fire(selection);

		await this.viewsService.openView(BROWSER_DESIGN_ELEMENT_VIEW_ID, true);
	}
```

Replace with:

```ts
	async inspectElement(elementData: IElementData): Promise<IDesignElementInspectionResult> {
		const selection = createDesignElementSelection(elementData);
		this._selection = selection;
		this._selectedContext.set(true);
		this._setInspectionActive(true);
		const [workspaceTokens, sourceProperties] = await Promise.all([
			this._getWorkspaceTokens(),
			this._findWorkspaceSourceProperties(selection)
		]);
		this._propertyGroups = resolveDesignElementProperties(selection, workspaceTokens, sourceProperties);
		this._onDidChangeSelection.fire(selection);

		await this.viewsService.openView(BROWSER_DESIGN_ELEMENT_VIEW_ID, true);

		return { selection, propertyGroups: this._propertyGroups };
	}
```

Also update the `IBrowserDesignElementService` interface declaration in the same file (wherever `inspectElement(elementData: IElementData): Promise<void>;` is declared) to `inspectElement(elementData: IElementData): Promise<IDesignElementInspectionResult>;`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `./scripts/test.sh --run src/vs/workbench/contrib/browserView/test/electron-browser/browserDesignElementService.test.ts`
Expected: all tests in this file pass.

- [ ] **Step 5: Update Task 5's command to use the returned data**

Back in `workbenchAppPreview.contribution.ts`, in `inspectAppPreviewElement`, change the final line inside the `try` block from:

```ts
		return await extractNodeData(connection, { nodeId }, { states: args?.states });
```

to:

```ts
		const elementData = await extractNodeData(connection, { nodeId }, { states: args?.states });
		const { propertyGroups } = await this._browserDesignElementService.inspectElement(elementData);
		return { ...elementData, propertyGroups };
```

(This requires `this._browserDesignElementService: IBrowserDesignElementService` to be injected in this class's constructor if it is not already — check the constructor's existing `@IFoo` parameters first; add `@IBrowserDesignElementService private readonly _browserDesignElementService: IBrowserDesignElementService` if missing, importing `IBrowserDesignElementService` from `../../common/browserDesignElementService.js`.)

Widen the command's declared return type from `Promise<IElementData>` to `Promise<IElementData & { propertyGroups: readonly IDesignElementPropertyGroup[] }>` on both the `inspectAppPreviewElement` method signature and re-run the manual verification from Task 5 Step 2 — confirm the logged result now also has a `propertyGroups` array with `source`/`token` fields on each property (this is the same shape already rendered by the existing AuxiliaryBar "Design element" panel).

- [ ] **Step 6: Commit**

```bash
git add src/vs/workbench/contrib/browserView/common/browserDesignElementService.ts src/vs/workbench/contrib/browserView/test/electron-browser/browserDesignElementService.test.ts src/vs/workbench/contrib/browserView/electron-browser/workbenchAppPreview.contribution.ts
git commit -m "Return resolved token/source evidence from inspectElement and wire it into the App Preview inspect command"
```

### Task 7: Register the new MCP tool

**Files:**
- Modify: `extensions/parakit-app-preview-bridge/resources/app-preview-mcp-server.cjs`
- Modify: `extensions/parakit-app-preview-bridge/src/extension.ts`
- Modify: `extensions/parakit-app-preview-bridge/resources/app-preview-skill/SKILL.md`

**Interfaces:**
- Consumes: `workbench.action.appPreview.inspectElement` command (Task 5/6).
- Produces: MCP tool `inspect_app_preview_element`.

- [ ] **Step 1: Add the tool definition**

Open `extensions/parakit-app-preview-bridge/resources/app-preview-mcp-server.cjs`. In the `TOOL_DEFINITIONS` array, add a new entry (matching the exact style of the existing `click_app_preview` entry):

```js
{
    name: 'inspect_app_preview_element',
    description: 'Inspect an element inside Parakit App Preview: returns its real component name (for any UI framework), matched CSS rules, resolved design tokens, and — if "states" is given — its computed styles under forced interactive states (hover, focus, active, etc.) without needing a real mouse/keyboard event. Use read_app_preview first to identify a ref.',
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
```

- [ ] **Step 2: Wire the extension-host route**

Open `extensions/parakit-app-preview-bridge/src/extension.ts`. In `runOperation`'s `switch`, add a case next to the existing `click_app_preview`/`click` cases:

```ts
case '/inspect_app_preview_element':
    return vscode.commands.executeCommand('workbench.action.appPreview.inspectElement', args);
```

- [ ] **Step 3: Update the skill doc**

Open `extensions/parakit-app-preview-bridge/resources/app-preview-skill/SKILL.md`. In the "Preferred Tools" list (currently 8 tools), add:

```
- `inspect_app_preview_element` — get an element's real component name, matched CSS, design tokens, and (optionally) its hover/focus/active styles. Prefer this over reading raw computed CSS when you need to explain *why* something looks the way it does.
```

- [ ] **Step 4: Manual end-to-end verification**

Restart the dev build so the extension host reloads the bridge extension. From a fresh Claude Code session with the `app_preview` MCP server configured, run `read_app_preview` to get a `ref` for a button, then call `inspect_app_preview_element({ ref: '<ref>', states: ['hover'] })`. Confirm the JSON result contains `reactComponents` (or whatever Task 10 renames this to — revisit this call site after Priority 4), `matchedStyleRules`, `propertyGroups`, and a `states` array with one entry for `hover`.

- [ ] **Step 5: Commit**

```bash
git add extensions/parakit-app-preview-bridge/resources/app-preview-mcp-server.cjs extensions/parakit-app-preview-bridge/src/extension.ts extensions/parakit-app-preview-bridge/resources/app-preview-skill/SKILL.md
git commit -m "Add inspect_app_preview_element MCP tool"
```

---

## Priority 3 — Resolve design tokens from structured sources instead of guessing from scanned text

**Why third:** `extractDesignElementTokenDefinitions` (the existing regex/brace-tracking scanner in `browserDesignElementService.ts:748-797`) works, but it is a heuristic: it can misattribute a value shared by two different tokens, and it cannot parse a `.json` token file's real structure (it treats JSON the same as JS object-literal text). Most design systems that publish tokens at all do so in one of a few well-known, structured, publicly documented formats. Parsing those exactly (when present) and falling back to the existing regex scan otherwise is strictly more accurate and stays fully generic.

### Task 8: Add structured token-file parsing (W3C Design Tokens format + generic JSON theme object)

**Files:**
- Modify: `src/vs/workbench/contrib/browserView/common/browserDesignElementService.ts`

**Interfaces:**
- Consumes: `this.fileService.readFile(resource: URI, options?): Promise<IFileContent>` (already injected at line 539), `addToken(tokens, value, name)` and `normalizeDesignElementTokenValue(value)` (both already exist, lines 799-833).
- Produces: `parseStructuredTokenFile(text: string, filePath: string): readonly ITokenDefinition[]`, called from `_readTokenFile` before falling back to `extractDesignElementTokenDefinitions`.

- [ ] **Step 1: Write the failing tests**

Open `src/vs/workbench/contrib/browserView/test/electron-browser/browserDesignElementService.test.ts`. Add this import to the existing import list at the top (extend the destructured import from `../../common/browserDesignElementService.js`):

```ts
	parseStructuredTokenFile,
```

Add a new test, placed right after the existing `'extractDesignElementTokenDefinitions reads nested token objects and css variables'` test (around line 324):

```ts
	test('parseStructuredTokenFile reads W3C Design Tokens format ($value/$type)', () => {
		const definitions = parseStructuredTokenFile(JSON.stringify({
			color: {
				brand: { $value: '#0057ff', $type: 'color' },
			},
			spacing: {
				medium: { $value: '16px', $type: 'dimension' },
			},
		}), 'tokens.json');

		assert.ok(definitions.some(definition => definition.name === 'color.brand' && definition.value === '#0057ff'));
		assert.ok(definitions.some(definition => definition.name === 'spacing.medium' && definition.value === '16px'));
	});

	test('parseStructuredTokenFile reads a generic nested JSON theme object with no $value wrapper', () => {
		const definitions = parseStructuredTokenFile(JSON.stringify({
			colors: { brand: '#0057ff' },
			spacing: { medium: '16px' },
		}), 'theme.json');

		assert.ok(definitions.some(definition => definition.name === 'colors.brand' && definition.value === '#0057ff'));
		assert.ok(definitions.some(definition => definition.name === 'spacing.medium' && definition.value === '16px'));
	});

	test('parseStructuredTokenFile returns an empty array for non-JSON or non-object content', () => {
		assert.deepStrictEqual(parseStructuredTokenFile('not json', 'notes.json'), []);
		assert.deepStrictEqual(parseStructuredTokenFile('[]', 'array.json'), []);
		assert.deepStrictEqual(parseStructuredTokenFile('{}', 'not-a-token-file.ts'), []);
	});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `./scripts/test.sh --run src/vs/workbench/contrib/browserView/test/electron-browser/browserDesignElementService.test.ts --grep "parseStructuredTokenFile"`
Expected: FAIL — `parseStructuredTokenFile` is not exported.

- [ ] **Step 3: Implement `parseStructuredTokenFile`**

Open `src/vs/workbench/contrib/browserView/common/browserDesignElementService.ts`. Add this new exported function directly above `extractDesignElementTokenDefinitions` (line 748):

```ts
const TOKEN_VALUE_PATTERN = /^(?:#[\da-fA-F]{3,8}|-?\d+(?:\.\d+)?(?:px|rem|em|%)|rgb[a]?\([^)]+\))$/;

/**
 * Parses a `.json` file as a structured design-token source: either the W3C Design Tokens
 * Community Group format (nested objects whose leaves are `{ $value, $type }`) or a plain
 * nested theme object whose leaves are already primitive color/length strings. Exact tree
 * walk — no regex guessing, no value-matching. Returns [] for anything that isn't valid
 * JSON or isn't a plain object at the top level.
 */
export function parseStructuredTokenFile(text: string, filePath: string): readonly ITokenDefinition[] {
	if (!filePath.toLowerCase().endsWith('.json')) {
		return [];
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return [];
	}

	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return [];
	}

	const definitions: ITokenDefinition[] = [];

	const walk = (node: unknown, path: readonly string[]): void => {
		if (!node || typeof node !== 'object' || Array.isArray(node)) {
			return;
		}

		const record = node as Record<string, unknown>;

		if (typeof record.$value === 'string') {
			definitions.push({ name: path.join('.'), value: record.$value });
			return;
		}

		for (const [key, value] of Object.entries(record)) {
			if (key.startsWith('$')) {
				continue;
			}
			if (typeof value === 'string' && TOKEN_VALUE_PATTERN.test(value)) {
				definitions.push({ name: [...path, key].join('.'), value });
			} else if (value && typeof value === 'object') {
				walk(value, [...path, key]);
			}
		}
	};

	walk(parsed, []);
	return definitions;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./scripts/test.sh --run src/vs/workbench/contrib/browserView/test/electron-browser/browserDesignElementService.test.ts --grep "parseStructuredTokenFile"`
Expected: 3 passing tests.

- [ ] **Step 5: Prefer structured parsing in `_readTokenFile`**

Find `_readTokenFile` (lines 642-652):

```ts
	private async _readTokenFile(uri: URI, tokens: Map<string, string[]>): Promise<void> {
		if (!isTokenCandidate(uri)) {
			return;
		}

		const content = await this.fileService.readFile(uri, { limits: { size: 200_000 } });
		const text = content.value.toString();
		for (const definition of extractDesignElementTokenDefinitions(text)) {
			addToken(tokens, definition.value, definition.name);
		}
	}
```

Replace with (tries the exact structured parse first; only falls back to the regex scanner if the structured parse finds nothing — e.g. the file is `.ts`/`.css`, or a `.json` file that isn't a token file at all):

```ts
	private async _readTokenFile(uri: URI, tokens: Map<string, string[]>): Promise<void> {
		if (!isTokenCandidate(uri)) {
			return;
		}

		const content = await this.fileService.readFile(uri, { limits: { size: 200_000 } });
		const text = content.value.toString();

		const structured = parseStructuredTokenFile(text, uri.path);
		const definitions = structured.length ? structured : extractDesignElementTokenDefinitions(text);

		for (const definition of definitions) {
			addToken(tokens, definition.value, definition.name);
		}
	}
```

- [ ] **Step 6: Also try the standard `*.tokens.json` naming convention regardless of the existing path-keyword filter**

`isTokenCandidate` (lines 859-863) requires the path to contain a keyword like `token`/`theme`/`design`. The W3C format's own file-extension convention, `*.tokens.json`, already satisfies this (`tokens` matches). No change needed here — confirmed by re-reading the regex: `/(token|theme|tailwind|style|variable|color|spacing|typography|design)/` already matches `.tokens.json`. Skip this step; it's a no-op, recorded here so you don't spend time on it.

- [ ] **Step 7: Run the full test file to confirm nothing regressed**

Run: `./scripts/test.sh --run src/vs/workbench/contrib/browserView/test/electron-browser/browserDesignElementService.test.ts`
Expected: all tests pass, including the original `'extractDesignElementTokenDefinitions reads nested token objects and css variables'` test (unaffected — that test calls `extractDesignElementTokenDefinitions` directly, not through `_readTokenFile`).

- [ ] **Step 8: Commit**

```bash
git add src/vs/workbench/contrib/browserView/common/browserDesignElementService.ts src/vs/workbench/contrib/browserView/test/electron-browser/browserDesignElementService.test.ts
git commit -m "Prefer exact structured design-token parsing over regex-scanned guesses"
```

---

## Priority 4 — Framework-agnostic component identification

**Why fourth:** `extractReactComponents` (now living in `common/cdpElementExtraction.ts` after Task 5's move) only understands React's fiber tree. Every non-React app gets nothing. The fix is additive and self-contained — it only changes the injected in-page function string, nothing else in the extraction pipeline.

### Task 9: Generalize component detection to Vue, Svelte, and native Custom Elements, alongside React

**Files:**
- Modify: `src/vs/platform/browserView/common/browserView.ts` (rename/extend the component type)
- Modify: `src/vs/platform/browserView/common/cdpElementExtraction.ts` (the injected function, post-Task-5-move location)
- Modify: `src/vs/workbench/contrib/browserView/common/browserDesignElementService.ts` (the two read sites: `getSourceEvidence`, `getReactComponentProperties`)
- Modify: `src/vs/workbench/contrib/browserView/test/electron-browser/browserDesignElementService.test.ts` (fixture + assertions)

**Interfaces:**
- Consumes: nothing new.
- Produces: `IElementData.components?: readonly IElementComponent[]` replacing `reactComponents?: readonly IElementReactComponent[]`; `IElementComponent { name: string; framework: 'react' | 'vue' | 'svelte' | 'web-component'; source?: string; props?: readonly IElementReactProp[] }`. This is a breaking rename — every call site is listed below, so there is nothing left dangling.

- [ ] **Step 1: Rename the type in `browserView.ts`**

Find (lines 95-104):

```ts
export interface IElementReactComponent {
	readonly name: string;
	readonly source?: string;
	readonly props?: readonly IElementReactProp[];
}

export interface IElementReactProp {
	readonly name: string;
	readonly value: string;
}
```

Replace with:

```ts
export type IElementComponentFramework = 'react' | 'vue' | 'svelte' | 'web-component';

export interface IElementComponent {
	readonly name: string;
	readonly framework: IElementComponentFramework;
	readonly source?: string;
	readonly props?: readonly IElementReactProp[];
}

export interface IElementReactProp {
	readonly name: string;
	readonly value: string;
}
```

In `IElementData` (same file, lines 66-78, already edited by Task 1 — find your `states?` addition), change:

```ts
	readonly reactComponents?: readonly IElementReactComponent[];
```

to:

```ts
	readonly components?: readonly IElementComponent[];
```

- [ ] **Step 2: Write the failing test for the generalized detection**

Open `src/vs/workbench/contrib/browserView/test/electron-browser/browserDesignElementService.test.ts`. Update the shared `elementData` fixture (lines 28-81): rename its `reactComponents` field to `components`, and change each entry to include `framework: 'react'`:

```ts
		components: [{
			name: 'ItemActions',
			framework: 'react',
			props: [
				{ name: 'itemId', value: 'item-1' }
			]
		}, {
			name: 'PrimaryButton',
			framework: 'react',
			source: '@example/ui',
			props: [
				{ name: 'intent', value: 'primary' }
			]
		}],
```

Every existing test in this file that references `elementData.reactComponents` or asserts against a component's shape must be updated to use `.components` and expect a `framework` field — grep the file for `reactComponents` and fix each occurrence the same way.

- [ ] **Step 3: Run the tests to verify they fail on the rename**

Run: `./scripts/test.sh --run src/vs/workbench/contrib/browserView/test/electron-browser/browserDesignElementService.test.ts`
Expected: FAIL — TypeScript compile error, `reactComponents` does not exist on `IElementData` (you renamed the field but haven't updated `browserDesignElementService.ts`'s two read sites yet).

- [ ] **Step 4: Update the two read sites in `browserDesignElementService.ts`**

Find `getSourceEvidence` (lines 410-467), the block:

```ts
	for (const component of selection.elementData.reactComponents ?? []) {
		add(component.name, localize('designElementSourceReactComponent', "component"), component.source ? 12 : 10);
		if (component.source) {
			add(component.source, localize('designElementSourcePackage', "package"), 12);
		}
	}
```

Replace `selection.elementData.reactComponents` with `selection.elementData.components`. No other change needed in this block — it already only reads `.name`/`.source`, both still present on `IElementComponent`.

Find `getReactComponentProperties` (search the file for its definition — it builds `IDesignElementProperty[]` from components for the "Source matches" group). Update its internal reference from `.reactComponents` to `.components`, and update its property-name label if it hardcodes "React" anywhere (e.g. change a label like `localize('designElementReactComponent', "React component")` to a framework-aware one):

```ts
	return (selection.elementData.components ?? []).map(component => ({
		name: component.framework === 'web-component' ? 'element' : 'component',
		value: component.source ? `${component.name} (${component.source})` : component.name,
		source: 'class' as const,
	}));
```

(Match this to whatever the existing function's exact return shape was — the point is: replace the field name and stop assuming React in any label text. Read the existing function body first and change only the `.reactComponents` reference and any literal "React" wording.)

- [ ] **Step 5: Update `createDesignElementSelection`** if it references `reactComponents` when building `IDesignElementSelection` (grep the file for any other occurrence beyond the two above — fix each the same way).

- [ ] **Step 6: Run the tests to verify they pass**

Run: `./scripts/test.sh --run src/vs/workbench/contrib/browserView/test/electron-browser/browserDesignElementService.test.ts`
Expected: all tests pass.

- [ ] **Step 7: Generalize the injected in-page function**

Open `src/vs/platform/browserView/common/cdpElementExtraction.ts` (post-Task-5 location of `extractReactComponents`). Replace the whole function with:

```ts
async function extractComponents(connection: ICDPConnection, nodeId: number): Promise<readonly IElementComponent[] | undefined> {
	const { object } = await connection.sendCommand('DOM.resolveNode', { nodeId }) as { object?: { objectId?: string } };
	if (!object?.objectId) {
		return undefined;
	}

	const { result } = await connection.sendCommand('Runtime.callFunctionOn', {
		objectId: object.objectId,
		returnByValue: true,
		functionDeclaration: `function() {
			const scalar = value => {
				if (value === undefined || value === null) { return undefined; }
				const type = typeof value;
				if (type === 'string' || type === 'number' || type === 'boolean') { return String(value); }
				if (Array.isArray(value)) {
					return value.filter(item => ['string', 'number', 'boolean'].includes(typeof item)).slice(0, 4).join(', ');
				}
				return undefined;
			};
			const PROP_ALLOWLIST = ['variant', 'size', 'color', 'type', 'role', 'aria-label', 'className', 'style', 'status', 'disabled'];
			const propsFrom = rawProps => {
				const props = [];
				for (const key of PROP_ALLOWLIST) {
					const value = scalar((rawProps || {})[key]);
					if (value) { props.push({ name: key, value: value.length > 120 ? value.slice(0, 117) + '...' : value }); }
				}
				return props;
			};

			// React: walk the fiber tree (works for any React 16+ renderer).
			const reactComponentName = type => {
				if (!type) { return undefined; }
				if (typeof type === 'string') { return type; }
				return type.displayName || type.name || type.render?.displayName || type.render?.name || type.type?.displayName || type.type?.name;
			};
			const reactSourceName = type => type?._context?.displayName || type?.Provider?._context?.displayName;
			const findReact = element => {
				const fiberKey = Object.keys(element).find(key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'));
				if (!fiberKey) { return []; }
				const components = [];
				const seen = new Set();
				for (let current = element[fiberKey]; current && components.length < 16; current = current.return) {
					const name = reactComponentName(current.elementType || current.type);
					if (!name || seen.has(name)) { continue; }
					seen.add(name);
					components.push({ name, framework: 'react', source: reactSourceName(current.elementType || current.type), props: propsFrom(current.memoizedProps || current.pendingProps) });
				}
				return components;
			};

			// Vue 3: walk the component instance's $parent chain via the internal vnode.
			const findVue = element => {
				const vueKey = Object.keys(element).find(key => key.startsWith('__vueParentComponent') || key === '__vue_app__' || key === '__vnode');
				if (!vueKey) { return []; }
				const components = [];
				const seen = new Set();
				for (let current = element[vueKey]?.component ?? element[vueKey]; current && components.length < 16; current = current.parent) {
					const name = current.type?.name || current.type?.__name || current.type?.displayName;
					if (!name || seen.has(name)) { current = current.parent; continue; }
					seen.add(name);
					components.push({ name, framework: 'vue', props: propsFrom(current.props) });
					current = current.parent;
				}
				return components;
			};

			// Native custom elements: the tag name IS the real source component name.
			const findCustomElement = element => {
				const tagName = element.tagName ? element.tagName.toLowerCase() : '';
				if (!tagName.includes('-') || typeof customElements === 'undefined' || !customElements.get(tagName)) { return []; }
				const ctor = customElements.get(tagName);
				return [{ name: ctor.name || tagName, framework: 'web-component', props: [] }];
			};

			let element = this;
			for (let current = element; current; current = current.parentElement) {
				const react = findReact(current);
				if (react.length) { return react; }
				const vue = findVue(current);
				if (vue.length) { return vue; }
			}
			return findCustomElement(this);
		}`
	}) as { result?: { value?: IElementComponent[] } };

	return result?.value?.length ? result.value : undefined;
}
```

Note: this preserves the exact original React-walk semantics (same fiber-key detection, same prop allowlist, same 16-ancestor cap) and adds two purely additive detection paths that only run if React detection found nothing on that DOM node or any of its ancestors — so behavior for React apps is unchanged, and non-React apps now get real answers instead of `undefined`. Svelte is intentionally not attempted here: Svelte does not attach any stable, documented per-element handle to the DOM by default (only optional dev-mode `__svelte_meta` exists, is compiler-flag-gated, and its shape has changed across Svelte major versions) — leave it as a documented gap rather than shipping a guess; note this explicitly in a comment directly above the function:

```ts
// Svelte is intentionally not attempted: it has no stable, version-independent DOM handle
// to walk (unlike React's fiber or Vue's component instance). Revisit if Svelte ships one.
```

- [ ] **Step 8: Update the call site inside `extractNodeData`**

In the same file, find:

```ts
	const reactComponents = await extractReactComponents(connection, nodeId).catch(() => undefined);
```

and the final return object's `reactComponents` field. Change both to `components`/`extractComponents`:

```ts
	const components = await extractComponents(connection, nodeId).catch(() => undefined);
```

```ts
	return {
		outerHTML,
		computedStyle,
		bounds: { x, y, width, height },
		ancestors,
		attributes,
		computedStyles,
		dimensions: { top: y, left: x, width, height },
		matchedStyleRules,
		components,
		states
	};
```

- [ ] **Step 9: Compile-check the whole affected surface**

Run: `cd /Users/tombar-gal/Documents/DesignerRepos/VSCodeFork && npx tsc --noEmit -p src/tsconfig.json`
Expected: no errors. If any remain, they are additional call sites of `.reactComponents`/`IElementReactComponent`/`extractReactComponents` this plan's grep passes missed — fix each the same way (rename to `.components`/`IElementComponent`/`extractComponents`).

- [ ] **Step 10: Run all affected tests**

Run:
```bash
./scripts/test.sh --run src/vs/platform/browserView/test/electron-main/browserViewFrameInspector.test.ts
./scripts/test.sh --run src/vs/workbench/contrib/browserView/test/electron-browser/browserDesignElementService.test.ts
```
Expected: all pass.

- [ ] **Step 11: Commit**

```bash
git add src/vs/platform/browserView/common/browserView.ts src/vs/platform/browserView/common/cdpElementExtraction.ts src/vs/workbench/contrib/browserView/common/browserDesignElementService.ts src/vs/workbench/contrib/browserView/test/electron-browser/browserDesignElementService.test.ts
git commit -m "Generalize component identification beyond React (Vue, native custom elements)"
```

- [ ] **Step 12: Update the MCP tool description for the new field name**

In `extensions/parakit-app-preview-bridge/resources/app-preview-mcp-server.cjs`, the `inspect_app_preview_element` description added in Task 7 already says "real component name (for any UI framework)" — no change needed there. If any downstream consumer (e.g. a saved prompt template) referenced `reactComponents` literally, update it to `components`. Search:

```bash
grep -rn "reactComponents" extensions/parakit-app-preview-bridge/ src/vs/workbench/contrib/browserView/
```
Expected after this task: zero matches outside of git history/comments.

---

## Priority 5 — Floating inspector panel directly in the App Preview surface

**Why fifth:** highest UI effort, and it depends on Priorities 2–4 already returning correct data — no point building the display before the data is trustworthy. This gives a human the same "click and immediately see the answer" experience XFKit's `AlloyInspector` panel provides, without requiring a chat round-trip.

### Task 10: Render a floating panel in the previewed page, fed by resolved property groups

**Files:**
- Modify: `src/vs/platform/browserView/electron-browser/preload-browserView.ts` (`ElementPicker` class)
- Modify: `src/vs/platform/browserView/electron-main/browserViewFrameInspector.ts` (or wherever `getElementHandle`/pin-flow now lives after Task 5's move — the `postMessage` sender side)

**Interfaces:**
- Consumes: `IDesignElementPropertyGroup[]` (already produced by `resolveDesignElementProperties`, returned from Task 6's `inspectElement`).
- Produces: new outbound IPC channel `vscode:browserView:showInspectorPanel` with payload `{ elementId: string; componentName?: string; groups: readonly IDesignElementPropertyGroup[] }`; new preload rendering method `ElementPicker.showInspectorPanel(payload)` / `hideInspectorPanel()`.

- [ ] **Step 1: Add the panel DOM to `ElementPicker`'s constructor**

Open `preload-browserView.ts`. In the `ElementPicker` constructor (lines 337-430 region), alongside the existing `this._highlight`, `this._pinnedHighlight`, `this._label` element creation, add:

```ts
		const inspectorPanel = document.createElement('div');
		inspectorPanel.className = 'inspector-panel';
		inspectorPanel.style.display = 'none';
		root.appendChild(inspectorPanel);
		this._inspectorPanel = inspectorPanel;
```

Add the corresponding private field declaration alongside the others:

```ts
	private readonly _inspectorPanel: HTMLDivElement;
```

- [ ] **Step 2: Add panel CSS to `_buildStyle()`**

In the same file's `_buildStyle()` static method (lines 905-926 region), add, inside the existing template-literal style block, right after the `.pinned-highlight` rule:

```css
		.inspector-panel {
			position: fixed;
			pointer-events: none;
			max-width: 280px;
			max-height: 360px;
			overflow-y: auto;
			background: rgba(30, 30, 30, 0.95);
			color: #fff;
			border-radius: 6px;
			padding: 8px 10px;
			font-size: 11px;
			line-height: 1.5;
			font-family: ui-monospace, "SF Mono", Menlo, monospace;
			z-index: 2147483647;
		}
		.inspector-panel .component-name {
			font-weight: 600;
			font-size: 12px;
			margin-bottom: 4px;
			display: block;
		}
		.inspector-panel .group-heading {
			opacity: 0.6;
			text-transform: uppercase;
			font-size: 9px;
			letter-spacing: 0.04em;
			margin: 6px 0 2px;
		}
		.inspector-panel .property-row {
			display: flex;
			justify-content: space-between;
			gap: 8px;
		}
		.inspector-panel .property-token {
			color: #7ee787;
		}
```

- [ ] **Step 3: Add render/hide methods**

Add these two public methods to `ElementPicker` (near `highlight()`/`hideHighlight()` if this class has them, or near `_renderPinnedHighlight`):

```ts
	showInspectorPanel(payload: { componentName?: string; groups: ReadonlyArray<{ id: string; label: string; properties: ReadonlyArray<{ name: string; value: string; token?: string }> }> }): void {
		if (!this._pinnedTarget) {
			return;
		}

		const panel = this._inspectorPanel;
		panel.replaceChildren();

		if (payload.componentName) {
			const nameEl = document.createElement('span');
			nameEl.className = 'component-name';
			nameEl.textContent = payload.componentName;
			panel.appendChild(nameEl);
		}

		for (const group of payload.groups) {
			const heading = document.createElement('div');
			heading.className = 'group-heading';
			heading.textContent = group.label;
			panel.appendChild(heading);

			for (const property of group.properties) {
				const row = document.createElement('div');
				row.className = 'property-row';
				const nameEl = document.createElement('span');
				nameEl.textContent = property.name;
				const valueEl = document.createElement('span');
				valueEl.className = property.token ? 'property-token' : '';
				valueEl.textContent = property.token ?? property.value;
				row.append(nameEl, valueEl);
				panel.appendChild(row);
			}
		}

		const rect = this._pinnedTarget.getBoundingClientRect();
		const preferRight = rect.left < window.innerWidth / 2;
		panel.style.display = 'block';
		panel.style.top = `${Math.max(8, Math.min(window.innerHeight - 8, rect.top))}px`;
		panel.style.left = preferRight ? `${rect.right + 8}px` : 'auto';
		panel.style.right = preferRight ? 'auto' : `${window.innerWidth - rect.left + 8}px`;
	}

	hideInspectorPanel(): void {
		this._inspectorPanel.style.display = 'none';
	}
```

(This mirrors XFKit's `AlloyInspector`/`ElementPicker.jsx` layout logic — panel opposite the clicked element horizontally, clamped vertically — but implemented in the codebase's own plain-DOM style instead of React, since nothing else in this subsystem uses React.)

- [ ] **Step 4: Wire an inbound `postMessage` listener to call these methods**

Find where this file already listens for inbound `postMessage` from the main process (search for `window.addEventListener('message'` or `frame.postMessage` consumption — likely near where `'vscode:browserView:setTheme'`/`'vscode:browserView:highlightElement'` are handled). Add a case for the new channel:

```ts
			case 'vscode:browserView:showInspectorPanel':
				elementPicker.showInspectorPanel(event.data.payload);
				break;
			case 'vscode:browserView:hideInspectorPanel':
				elementPicker.hideInspectorPanel();
				break;
```

(Match the exact `event.data`/channel-name destructuring convention already used by the neighboring `case` for `'vscode:browserView:highlightElement'` in this same listener — copy its shape exactly rather than inventing a new payload convention.)

- [ ] **Step 5: Send the panel data after inspection resolves**

In `browserViewFrameInspector.ts`'s `getElementHandle(elementId)` (or wherever the pin/"Add to chat" flow now fires after Task 5's refactor), find the `addToChat` handler:

```ts
			addToChat: async () => {
				const nodeData = await this.extractNodeDataById(elementId);
				this._onDidInspectElement.fire(nodeData);
			},
```

This fires `IElementData` up to `browserEditorChatFeatures.ts`, which calls `browserDesignElementService.inspectElement(elementData)` (Task 6, now returning `{selection, propertyGroups}`). After that call resolves, forward the panel payload back down to the guest page:

In `browserEditorChatFeatures.ts`'s `_inspectElementData` (lines 359-372), change:

```ts
	private async _inspectElementData(elementData: IElementData, model: IBrowserViewModel) {
		await this.browserDesignElementService.inspectElement(elementData);
```

to:

```ts
	private async _inspectElementData(elementData: IElementData, model: IBrowserViewModel) {
		const { selection, propertyGroups } = await this.browserDesignElementService.inspectElement(elementData);
		model.showInspectorPanel({ componentName: selection.displayName, groups: propertyGroups });
```

Add `showInspectorPanel(payload: { componentName?: string; groups: readonly IDesignElementPropertyGroup[] }): void` to `IBrowserViewModel` (`browserView.ts:240-296` region) and its implementation, following the exact same pattern as the existing `layout`/`findInPage` methods on that interface — each of those already forwards to a main-process `postMessage` call via the model's underlying view reference; mirror whichever of those two is structurally simplest (a fire-and-forget void call, not one awaiting a reply), sending on the new `'vscode:browserView:showInspectorPanel'` channel with `{ payload }`.

- [ ] **Step 6: Hide the panel when inspection closes**

Find `closeInspection()` on `BrowserDesignElementService` (grep for it — referenced by the AuxiliaryBar panel's "Close" button in Task-adjacent research). Add a call to hide the panel there too, following the same `model.showInspectorPanel`/model-forwarding pattern but for a `hideInspectorPanel()` call — this requires the service to have a reference to the active `IBrowserViewModel`, which it may not currently hold; if it doesn't, instead have `browserEditorChatFeatures.ts` subscribe to `designElementService.onDidChangeInspectionActive` and call `model.hideInspectorPanel()` when it fires `false` (this keeps `BrowserDesignElementService` itself free of any UI/model dependency, consistent with its existing design — it only fires events and lets subscribers act on them).

- [ ] **Step 7: Manual verification**

Start the dev build, open an App Preview tab, trigger "Add element to chat" on a button. Confirm: (a) the existing tag/id/dimensions label still renders as before (unchanged), (b) the new floating panel appears near the element with the component name and grouped color/spacing/typography/token rows, positioned on whichever side keeps it fully on-screen, (c) closing the AuxiliaryBar "Design element" view via its "Close" button hides the panel too.

- [ ] **Step 8: Commit**

```bash
git add src/vs/platform/browserView/electron-browser/preload-browserView.ts src/vs/platform/browserView/electron-main/browserViewFrameInspector.ts src/vs/workbench/contrib/browserView/electron-browser/features/browserEditorChatFeatures.ts src/vs/platform/browserView/common/browserView.ts
git commit -m "Render a floating design-token inspector panel directly in the App Preview surface"
```

---

## Rollout order recap

1. Priority 1 (Tasks 1-2) — self-contained, ship independently, no risk.
2. Priority 2 (Tasks 3-7) — the load-bearing bridge; Task 3/4's IPC spike is the plan's single genuine unknown, bounded to ~30 minutes of investigation before proceeding.
3. Priority 3 (Task 8) — self-contained, ship independently, no risk.
4. Priority 4 (Task 9) — a mechanical, fully-specified rename plus additive detection; touches the same files as Priority 2, so land it after Priority 2 to avoid merge conflicts in `cdpElementExtraction.ts`.
5. Priority 5 (Task 10) — depends on Priorities 2 and 4's data shape (`propertyGroups`, `components`) being final.

## Self-review notes (per the writing-plans process)

- **Spec coverage:** forced states → Task 1-2; agent-facing exposure → Tasks 3-7; structured tokens → Task 8; framework-agnostic components → Task 9; floating panel → Task 10. All five prioritized items from the prior comparison are covered.
- **Placeholder scan:** the only intentionally-open items are the two explicitly-bounded spikes (Task 3's IPC-channel-pattern lookup, Task 4 Step 1) — both have exact grep commands and exact decision criteria, not vague "figure it out" instructions, so they are spikes, not placeholders.
- **Type consistency:** `IElementStateStyles` (Task 1) is used identically in Task 2's implementation and test. `IElementComponent`/`components` (Task 9) is renamed consistently across `browserView.ts`, `cdpElementExtraction.ts`, `browserDesignElementService.ts`, and the test fixture — Task 9 Step 12's grep is the final backstop against a missed call site. `IDesignElementInspectionResult` (Task 6) is the return type both the test (Task 6 Step 1) and Task 5's command (Task 5 Step 5) consume.

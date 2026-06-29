# Robust Branch Workspace Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every branch create/switch converge Git, App Preview, and Claude to one active repo-and-branch context with visible evidence and recoverable failures.

**Architecture:** Git branch commands remain the single source of branch mutations and emit `_designerWorkspaceContext.didChange` only after successful checkout/create. The App Preview workbench contribution is the reconciler: it owns branch-scoped preview runtime state, restarts/navigates preview, and requests a fresh Claude surface. Claude reconciliation uses the registered provider command for the active Claude implementation, then falls back through compatible commands while logging exact failures.

**Tech Stack:** VS Code workbench TypeScript, Git extension command service, App Preview browser view, Anthropic Claude Code extension commands, workbench chat session commands, Parakit launcher, Playwright/CDP live verification.

---

## Current Evidence

- Branch dropdown switching now emits `_designerWorkspaceContext.didChange`.
- Live switch `design/test-branch-2` -> `design/test-branch` changed App Preview from `http://127.0.0.1:16150/` to `http://127.0.0.1:4709/`.
- Live switch back restored `design/test-branch-2` and `http://127.0.0.1:16150/`.
- App Preview no longer reuses a discovered URL from another branch.
- Claude still does not start a fresh branch session because these commands were not registered in the running window:
  - `workbench.action.chat.openNewChatSessionInPlace.claude-code`
  - `workbench.action.chat.openNewChatSessionInPlace.agent-host-claude`
- The running Anthropic extension contributes `claude-vscode.newConversation`, which is the correct command for the current Claude surface.

## Desired Model

Every branch create/switch should run this sequence:

1. Preflight active Claude work.
2. Save current branch if needed.
3. Checkout/create target branch.
4. Emit `DesignerWorkspaceContext`.
5. App Preview reconciles:
   - Stop previous branch server in this window.
   - Resolve or assign branch port.
   - Start server when possible.
   - Navigate to branch URL/port.
   - Show setup/failure state instead of old branch URL when no valid target exists.
6. Claude reconciles:
   - Try workbench `claude-code` session command if contributed.
   - Try workbench `agent-host-claude` session command if contributed.
   - Try Anthropic `claude-vscode.newConversation`.
   - Open Anthropic sidebar only as a last fallback.
7. Log one structured success/failure line for each downstream surface.

## Task 1: Encode Claude Command Chain

**Files:**
- Modify: `src/vs/workbench/contrib/browserView/electron-browser/workbenchAppPreview.contribution.ts`
- Test: `src/vs/workbench/contrib/browserView/test/browser/workbenchAppPreview.test.ts`

- [ ] **Step 1: Add failing unit coverage for command ordering**

Add a pure helper test that expects Claude reconciliation attempts in this order:

```ts
assert.deepStrictEqual(getWorkbenchAppPreviewClaudeReconciliationCommands(), [
	{ commandId: 'workbench.action.chat.openNewChatSessionInPlace.claude-code', args: ['sidebar'] },
	{ commandId: 'workbench.action.chat.openNewChatSessionInPlace.agent-host-claude', args: ['sidebar'] },
	{ commandId: 'claude-vscode.newConversation', args: [] },
	{ commandId: 'claude-vscode.sidebar.open', args: [] },
]);
```

Run:

```bash
/Users/tombar-gal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit --pretty false --project src/tsconfig.json
```

Expected before implementation: FAIL because the helper does not exist.

- [ ] **Step 2: Implement the helper**

Create and export:

```ts
export interface IWorkbenchAppPreviewCommandAttempt {
	readonly commandId: string;
	readonly args: readonly unknown[];
}

export function getWorkbenchAppPreviewClaudeReconciliationCommands(): readonly IWorkbenchAppPreviewCommandAttempt[] {
	return [
		{ commandId: 'workbench.action.chat.openNewChatSessionInPlace.claude-code', args: ['sidebar'] },
		{ commandId: 'workbench.action.chat.openNewChatSessionInPlace.agent-host-claude', args: ['sidebar'] },
		{ commandId: 'claude-vscode.newConversation', args: [] },
		{ commandId: 'claude-vscode.sidebar.open', args: [] },
	];
}
```

- [ ] **Step 3: Use the helper in `_reconcileClaudeWorkspaceContext`**

Replace hard-coded Claude command handling with a loop over all attempts. Stop on first success. Log the command that succeeded. If every command fails, log all failure messages.

- [ ] **Step 4: Run typechecks**

Run:

```bash
/Users/tombar-gal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit --pretty false --project src/tsconfig.json
/Users/tombar-gal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/typescript/bin/tsc --noEmit --pretty false --project extensions/git/tsconfig.json
```

Expected: both pass.

## Task 2: Rebuild And Live Verify

**Files:**
- Runtime output: `out/`
- Launcher: `scripts/designer-launch.sh`

- [ ] **Step 1: Transpile**

Run:

```bash
/Users/tombar-gal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node build/next/index.ts transpile
```

Expected: completes; the no-HEAD warning is acceptable in this source checkout.

- [ ] **Step 2: Restart Parakit**

Run:

```bash
./scripts/designer-launch.sh --restart
```

Expected: one Parakit main process, startup repo `sample-preview-app`, CDP port printed.

- [ ] **Step 3: Switch branch through the dropdown**

Use Playwright/CDP to select a real branch row in `.designer-branch-switcher__dropdown`.

Expected:
- Branch button changes.
- `git branch --show-current` matches.
- App Preview URL changes to the branch's remembered or newly assigned port.
- Renderer log contains `Reconciling workspace context`.
- Renderer log contains `Requested Claude branch session with claude-vscode.newConversation` or another successful command.

## Task 3: Known Follow-Up After This Patch

**Files:**
- Modify later: `src/vs/workbench/contrib/chat/...` or Anthropic extension integration if a public command is insufficient.

- [ ] **Step 1: If `claude-vscode.newConversation` opens a fresh session but not branch-labeled**

Add branch-context display in Parakit's wrapper/header or inject a startup/welcome state. Preserve old sessions in history.

- [ ] **Step 2: If `claude-vscode.newConversation` is not enough**

Implement a small internal Parakit command that talks to the active Claude provider directly, rather than relying on extension command names.

## Self-Review

- Covers branch switch/create convergence through the existing `DesignerWorkspaceContext`.
- Covers preview URL/port convergence and stale URL prevention already implemented.
- Covers the current Claude failure with a real command contributed by the running Anthropic extension.
- Avoids new libraries.
- Keeps the immediate patch small and testable.

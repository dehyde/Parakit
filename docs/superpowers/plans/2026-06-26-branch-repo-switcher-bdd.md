# Branch And Repo Switcher BDD Test Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that every repo and branch switcher action converges Git, App Preview, and Claude Code to the same active workspace context.

**Architecture:** Git branch/repo commands are the source of workspace-context changes. After successful mutation, they emit one `DesignerWorkspaceContext` event that the workbench reconciler consumes to restart/navigate App Preview and open the branch-appropriate Claude Code surface. App Preview stores branch runtime metadata by `repoPath + branchName`.

**Tech Stack:** VS Code workbench TypeScript, Git extension commands, App Preview browser view, Claude Code chat/session commands, Parakit launcher, Playwright/CDP or command/log based verification.

---

## Shared Invariants

- The branch dropdown, App Preview tab, and visible Claude Code session must represent the same `repoPath + branchName`.
- A successful branch create or checkout must request downstream reconciliation before the command is considered behaviorally complete.
- A repo switch must open the target repo in the same Parakit window and then converge App Preview and Claude Code for that repo.
- App Preview must never silently keep showing a URL that belongs to a previous branch.
- If the active branch has a runnable preview config, App Preview must restart the preview server on that branch's assigned port and navigate the pinned preview tab.
- If the active branch has no runnable preview config or no known branch URL, App Preview must show a clear configure state instead of preserving the previous branch URL.
- If a remembered branch port is occupied, App Preview must assign a new available port, update the branch runtime mapping, restart the server, and navigate the preview to the new URL.
- Claude Code sessions must be preserved in history, but the visible session after a branch or repo switch must be scoped to the active `repoPath + branchName`.

## Scenario Matrix

### Feature: Branch Creation

#### Scenario: Create a branch from a clean worktree

Given the active repo is `repoA` on branch `main`
And App Preview is showing `repoA#main`
And Claude Code is showing a `repoA#main` session
When the user creates branch `feature/new-ui` from the branch dropdown
Then Git checks out `feature/new-ui`
And the branch dropdown shows `feature/new-ui`
And App Preview stores or reuses runtime metadata for `repoA#feature/new-ui`
And App Preview stops the `main` preview server in the current window
And App Preview starts or navigates to the `feature/new-ui` preview URL
And Claude Code opens or reveals a `repoA#feature/new-ui` session

#### Scenario: Create a branch while Claude Code has active work

Given Claude Code has an in-progress turn in `repoA#main`
When the user creates branch `feature/new-ui`
Then Parakit shows a confirmation dialog before Git changes branch
And choosing Cancel leaves Git, App Preview, and Claude Code on `repoA#main`
And choosing Switch Branch creates and checks out `feature/new-ui`
And App Preview and Claude Code reconcile to `repoA#feature/new-ui`

#### Scenario: Create a branch with no preview config

Given the target branch has no `.designer/dev.json` and no runnable package script
When the user creates and switches to the branch
Then Git switches successfully
And Claude Code reconciles to the new branch
And App Preview does not keep the previous branch URL
And App Preview shows a configure prompt or failed-preview state explaining no runnable preview config exists

### Feature: Branch Switching

#### Scenario: Switch to an existing branch with a runnable preview

Given the active repo is `repoA`
And the current branch is `main`
And branch `feature/new-ui` exists locally or remotely
When the user selects `feature/new-ui` from the branch dropdown
Then Git checks out `feature/new-ui`
And the branch dropdown shows `feature/new-ui`
And App Preview restarts on the stored or newly assigned `feature/new-ui` port
And the pinned preview tab navigates to the `feature/new-ui` URL
And Claude Code opens or reveals a `repoA#feature/new-ui` session

#### Scenario: Switch back to a previous branch

Given `repoA#main` and `repoA#feature/new-ui` both have stored preview runtime metadata
When the user switches from `feature/new-ui` back to `main`
Then App Preview stops the `feature/new-ui` server in the current window
And App Preview restarts or navigates to the remembered `main` URL and port
And Claude Code opens or reveals the `repoA#main` session

#### Scenario: Switch branches after pasting a local URL

Given the user pasted `https://local.preview.example.test:3007/app/projects?tab=overview#details` on branch `main`
When the user switches to branch `feature/new-ui`
Then App Preview preserves scheme, host, path, query, and hash
And App Preview replaces only the port with the assigned `feature/new-ui` port
And the pinned preview tab navigates to the adapted branch URL

#### Scenario: Switch branch when remembered port is occupied before launch

Given branch `feature/new-ui` has remembered port `4821`
And an unrelated process owns port `4821`
When the user switches to `feature/new-ui`
Then App Preview detects the port is unavailable before launching
And App Preview assigns a new available port
And App Preview updates the stored runtime mapping for `repoA#feature/new-ui`
And App Preview starts the server and navigates to the new port

#### Scenario: Switch branch when dev server reports EADDRINUSE after launch

Given branch `feature/new-ui` has assigned port `4821`
And the dev command starts but reports `EADDRINUSE` for `4821`
When App Preview receives that terminal output
Then App Preview stops the failed server terminal
And App Preview assigns a new available port
And App Preview restarts the branch preview on the new port
And App Preview shows a status message explaining the reassignment

### Feature: Repository Switching

#### Scenario: Switch to another repo with clean current repo

Given the active repo is `repoA`
And repo `repoB` is in the repo switcher
When the user selects `repoB`
Then Parakit opens `repoB` in the same window
And the repo dropdown shows `repoB`
And the branch dropdown shows `repoB`'s current branch
And App Preview reconciles to `repoB#currentBranch`
And Claude Code opens or reveals a `repoB#currentBranch` session

#### Scenario: Save and switch repo with dirty worktree

Given `repoA` has unsaved Git changes
When the user selects `repoB`
Then Parakit saves and pushes the current branch when possible
And if save succeeds, Parakit opens `repoB`
And if save is blocked, Parakit stays on `repoA`
And App Preview and Claude Code remain on `repoA`

#### Scenario: Switch repo with no preview config

Given repo `repoB` has no runnable preview config
When the user switches to `repoB`
Then repo switching succeeds
And Claude Code reconciles to `repoB#currentBranch`
And App Preview shows configure state for `repoB`
And App Preview does not keep `repoA`'s preview URL

### Feature: Repository Management

#### Scenario: Clone a repo from the switcher

Given the user enters a valid repo URL
When clone completes
Then Parakit trusts and opens the new repo in the same window
And branch, App Preview, and Claude Code reconcile to the new repo's current branch

#### Scenario: Switch to an existing cloned repo URL

Given the pasted repo URL already exists in known repos
When the user submits that URL
Then Parakit opens the existing local repo in the same window
And App Preview and Claude Code reconcile to that repo

#### Scenario: Remove a repo from the switcher

Given repo `repoB` is known
When the user removes repo `repoB`
Then `repoB` disappears from the repo switcher
And if `repoB` is not active, the current repo context does not change
And if `repoB` is active, Parakit moves to a clear fallback state without stale App Preview or Claude context

## Live Verification Checklist

- [ ] Restart Parakit after transpiling so the renderer loads the latest `out/` bundle.
- [ ] Confirm Git log has no new `Failed to resolve module specifier 'net'` after branch switch.
- [ ] Switch from branch A to branch B using the dropdown.
- [ ] Confirm Git current branch equals branch B.
- [ ] Confirm App Preview status command reports branch B.
- [ ] Confirm App Preview current URL changed away from branch A's URL.
- [ ] Confirm preview server terminal was restarted or configure state is visible.
- [ ] Confirm Claude Code sidebar/session changes or logs a reconciliation failure.
- [ ] Switch back from branch B to branch A and repeat the same checks.
- [ ] Create a temporary branch and confirm create behaves the same as checkout.
- [ ] Switch repos and confirm repo switching still reconciles all surfaces.

## Commands For Manual Evidence

```bash
git -C "/Users/tombar-gal/Documents/Designer Repos/sample-preview-app" branch --show-current
rg -n "DesignerBranches|WorkbenchAppPreview|_designerWorkspaceContext|Failed to request workspace context|Failed to resolve module specifier 'net'" /tmp/vsc-code-open-u/logs -S
curl -s "http://127.0.0.1:<cdpPort>/json/list"
```

## Known Risk To Validate

The App Preview reconciler currently lives in a workbench contribution and the Git event originates from the extension host. The event must cross the command service boundary successfully. If the command reaches the workbench but App Preview still does not navigate, the next fix should add explicit telemetry/logging at the start and end of `_designerWorkspaceContext.didChange` handling.

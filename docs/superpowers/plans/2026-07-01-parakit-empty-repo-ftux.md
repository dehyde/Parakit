# Parakit Empty Repo FTUX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` while implementing this plan.

## Goal

Build and test the Parakit first-time experience shown when the Parakit repo list is empty:

- Show a startup modal titled "Welcome to Parakit".
- Let the user choose only "Paste repo URL" or "Open local folder".
- Snooze the startup modal for the current session when dismissed.
- Show empty states in the repo list, branch list, and App Preview.
- Highlight the repo selector as a pure-blue "Add repo" CTA.
- Add a component fixture mock for visual testing.

## Approach

- Add shared repo FTUX command IDs, choice types, repo-state types, and empty-state detection in `src/vs/workbench/services/workspaces/common/designerRepoCommands.ts`.
- Add `src/vs/workbench/contrib/welcomeEmptyRepo/browser/emptyRepoFtux.contribution.ts` to own the startup modal and shared `workbench.action.parakit.addRepo` command.
- Wire the contribution from `src/vs/workbench/workbench.common.main.ts`.
- Update `DesignerBranchSwitcher` so an empty repo list renders the pure-blue "Add repo" selector CTA, a repo-list empty state, and a branch-list empty state.
- Extend App Preview startup pages with an `emptyRepo` phase and route page actions to the shared add-repo command.
- Add browser tests for the helper/command behavior, selector empty states, and App Preview empty page.
- Add `src/vs/workbench/test/browser/componentFixtures/designerEmptyRepoFtux.fixture.ts` as the visual mock.

## Verification

- `npm run compile-client`
- `npm run test-browser-no-install -- --browser chromium --run src/vs/workbench/contrib/welcomeEmptyRepo/test/browser/emptyRepoFtux.test.ts`
- `npm run test-browser-no-install -- --browser chromium --run src/vs/workbench/test/browser/parts/designerBranchSwitcher/designerBranchSwitcher.test.ts`
- `npm run test-browser-no-install -- --browser chromium --run src/vs/workbench/contrib/browserView/test/browser/workbenchAppPreview.test.ts`
- Component fixture smoke test for the empty-repo FTUX mock.

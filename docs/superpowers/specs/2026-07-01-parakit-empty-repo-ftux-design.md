# Parakit Empty Repo FTUX Design

## Goal

When Parakit loads and the Parakit repo list is empty, guide the user to add their first repo without exposing unrelated VS Code setup options. The experience should make Parakit feel approachable for PMs and designers while still using the existing repo plumbing.

## Trigger

The empty-repo FTUX is active when `_designerRepos.getState` returns `repos.length === 0`.

This is intentionally based on the Parakit repo list, not on whether VS Code has a workspace folder. The existing repo state already excludes the host VS Code repo and includes stored or discovered repos under the Designer Repos folder.

## Startup Modal

On each new app session, if the repo list is empty, Parakit shows a startup modal.

The modal title is `Welcome to Parakit`.

The body copy explains that Parakit makes codebases accessible to PMs and designers, and asks the user to add a repo to explore, preview, and collaborate from a shared workspace.

The modal offers exactly two primary actions:

- `Paste repo URL`
- `Open local folder`

Closing the modal snoozes it for the current app session only. If the user starts a later app session and the repo list is still empty, the modal appears again.

## Persistent Empty States

While the repo list is empty, Parakit keeps non-modal empty states visible:

- The repo selector is rendered as a pure blue CTA labeled `Add repo`.
- The repo dropdown shows an empty state with actions to paste a repo URL or open a local folder.
- The branch selector shows an empty state explaining that branches appear after a repo is added.
- The main browser view shows an empty state with the same add-repo action.

The repo selector CTA opens the same add-repo modal. It should not only open an empty dropdown, because the CTA should take the user directly into the setup task.

## Add Repo Flow

The add-repo modal is a thin workbench UI over existing repo commands.

`Paste repo URL` prompts for a repository URL and delegates to `_designerRepos.clone`.

`Open local folder` uses the native folder picker and delegates to `_designerRepos.addSource` with the selected absolute folder path.

Existing command behavior remains responsible for validation, trust registration, storing the repo in the Parakit known repo list, and opening the repo in the same window.

## Error Handling

Invalid or empty repo URLs stay in the paste-url flow with a clear validation message.

Canceled folder picking returns to the modal without mutating repo state.

Command failures surface through the existing notification/error path and leave the empty-repo FTUX active.

If a repo is added successfully, the modal closes and all empty states are replaced by the normal repo, branch, and browser preview surfaces after the window opens the repo.

## Testing

Add unit coverage for the empty-repo state helper or contribution logic that decides whether the FTUX is active.

Add browser or workbench tests for:

- Empty repo state shows the startup modal once per app session.
- Closing the modal suppresses it until the next app session.
- Repo selector renders as `Add repo` when the repo list is empty.
- Branch selector and main browser view show empty states when no repo exists.
- `Paste repo URL` delegates to `_designerRepos.clone`.
- `Open local folder` delegates to `_designerRepos.addSource`.

Manual verification should launch Parakit with no stored or discovered repos, confirm the modal appears, close it, confirm it does not reappear in the same session, relaunch with no repos, and confirm it appears again.

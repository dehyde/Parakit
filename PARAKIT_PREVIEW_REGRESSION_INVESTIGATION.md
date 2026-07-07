# Parakit App Preview Regression — Investigation Summary

**Status:** Regression identified and root-caused. Fix approach is clear.

---

## What Broke

On **July 2, 2026**, the App Preview feature stopped working for projects that previously ran seamlessly — including `designwithai` (has `docs/index.html` ready to show) and `team-dashboard` (dependencies already installed, can start immediately).

Instead of launching, these repos hit a "configure a preview URL" setup screen and do nothing.

---

## Root Cause

Commit `99207889` ("fix: improve app preview startup reliability") added a new **configuration gate** that checks: *"Does this branch have a saved preview URL?"*

If the answer is no, it shows the setup screen and stops — **before ever checking** whether the project could actually run on its own without a saved URL.

### The Three-Case Policy (Intended)

Earlier that same day, the decision was made to handle three distinct situations:

| Case | Saved URL exists? | Repo is runnable as-is? | Action |
|------|-------------------|------------------------|--------|
| **A** | Yes | — | Use the saved URL |
| **B** | No | Yes | Auto-start it (no saved URL needed) |
| **C** | No | No | Show setup screen, ask for a URL |

### What Got Implemented

The code only implemented cases A and C:

| Case | Saved URL exists? | What happens now |
|------|-------------------|------------------|
| **A** | Yes | ✅ Works fine |
| **B** | No | ❌ Shows setup screen (should auto-start) |
| **C** | No | ✅ Shows setup screen (correct) |

**Result:** Case B projects (like `designwithai` and `team-dashboard`) are now treated as Case C, even though they don't need setup.

---

## Why This Happened

The design document (`docs/superpowers/specs/2026-07-02-parakit-preview-reliability-design.md`) stated the gate rule as:

> "whenever `needsConfigurationPrompt` would be true today ... never attempts to start a server until configuration resolves"

This was written as an absolute rule, missing the nuance: *"never attempt to start until config resolves, **unless** the server can already start without config."*

The implementation followed the document exactly as written, so this wasn't a coding mistake — the gap was in the plan itself.

---

## The Fix

Parakit already has working code that discovers runnable projects: `_resolveRunnablePreviewServerConfig()` and `resolveHeuristicDevConfig()` (in `workbenchAppPreview.contribution.ts`). These check for:

- Installed dependencies + runnable npm/yarn scripts
- Static HTML in well-known directories (`docs/`, `public/`, `dist/`, etc.)

**The fix:** Run this discovery **before** the configuration gate fires. Only show the setup screen if discovery returns "not runnable without install or setup."

---

## Evaluation: Auto-Install Question

Earlier conversation reached consensus: **Do not auto-install dependencies for unconfigured repos.**

**This conclusion is still correct.** The regression didn't happen because auto-install was missing — it happened because the check for "already runnable" was skipped entirely.

- ✅ Keep: Don't auto-install for unconfigured repos
- ❌ Remove: The blanket "if no config, show setup" rule
- ✅ Restore: "But if the project is already runnable without install, just run it"

---

## What Needs to Happen

In `_maybeStartPreviewServerForCurrentBranch()` and the related call site (~line 1931):

1. Check if a saved URL exists → if yes, use it (existing logic, fine)
2. Check if the project is runnable without install → if yes, start it (missing now, needs to be restored)
3. Only then check "does the user want to configure a URL?" → if no saved URL and not runnable, show setup (existing logic, fine)

File to modify: `src/vs/workbench/contrib/browserView/electron-browser/workbenchAppPreview.contribution.ts`

---

## Appendix: Why This Matters

The auto-install avoidance rule exists for this reason: if Parakit auto-installs for every unconfigured repo it touches, it could spend 10–25 minutes installing dependencies for a repo the user only wanted to glance at — without ever asking. By gating auto-install behind a saved-URL configuration step, Parakit makes sure: "The user explicitly chose this repo as a preview target before we spend time installing."

That reasoning is sound and should remain. The fix just refines it to: "Auto-install stays gated. But auto-start stays open — if the project can already run, we don't need to ask the user to save a URL first."

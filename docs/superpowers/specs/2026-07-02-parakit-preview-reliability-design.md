# Parakit Preview Reliability Design

## Goal

Reduce App Preview loading time and loading failures, generically — with no logic specific to any particular project, product, company, or framework. The mechanism must work equally well for a tiny toy project and a huge, slow-installing monorepo, using safe generic defaults rather than per-project configuration.

## Current Behavior & Root Causes

App Preview's process/health lifecycle lives almost entirely in one file, `src/vs/workbench/contrib/browserView/electron-browser/workbenchAppPreview.contribution.ts` (~3500 lines), with pure decision logic split out into `src/vs/workbench/contrib/browserView/common/appPreviewConfig.ts`. Investigation of this code, cross-checked against live reproductions, found four concrete, generic problems:

1. **The preview webview can navigate before the server has any chance to be listening.** `runPreviewServer()` / `restartPreviewServer()` call `_startPreviewServer(...)` with `waitForHealthy` defaulted to `false`. In that path, `navigateDiscoveredUrl(resolvedServer.url)` runs before the terminal running the dev server command is even created. The navigation is expected to fail with a connection-refused error on the very first attempt of any preview.

2. **That failure alone can force a restart, with no check for "is this actually still just starting."** `shouldRecoverWorkbenchAppPreviewLoadError` treats Chromium net error codes `-102`/`-105`/`-106` (connection refused, DNS failure, offline) as unconditionally recoverable and force-restarts, with no liveness check — unlike the separate background-health-failure path, which does correctly refuse to restart a still-alive process. This is the direct cause of the "stuck on Install dependencies, then flickers and starts over" symptom.

3. **All timing is fixed and generic-unaware.** `MAX_BACKGROUND_HEALTH_FAILURES` (3), `PREVIEW_DEPENDENCY_INSTALL_TIMEOUT` (5 minutes), and `WORKBENCH_APP_PREVIEW_STARTUP_HEALTH_TIMEOUT` (150 seconds) are constants that apply identically to a project that installs in 10 seconds and one that takes 25 minutes. There is no backoff and no way for a slow-but-normal project to get more grace without hitting a false "failure."

4. **Local health checks can't see real HTTP status.** For loopback hosts, health checks run in `'no-cors'` fetch mode (chosen to tolerate self-signed local HTTPS certs), which returns an opaque response — "healthy" is decided by "the fetch didn't throw," not by reading a status code. A project's own readiness signal (e.g. a `/health` endpoint returning 503 while still compiling) is invisible to Parakit in this mode.

There is also a fifth, related gap surfaced live during this investigation: when a brand-new branch has no resolved preview URL yet (`needsConfigurationPrompt: true`), Parakit still attempts the normal startup flow instead of surfacing a distinct "this branch needs configuration" state — compounding problem 1/2 above into a loop that looks identical to a hung install.

## Architecture: Explicit State Machine

Replace the scattered boolean/counter state with one explicit, named state list that both the restart logic and the startup UI read from directly — a single source of truth instead of two things that can drift apart.

States: `ResolvingConfig` → `InstallingDependencies` → `StartingServer` → `WaitingForFirstResponse` → `Healthy` → `Degraded` → `Restarting` → `Failed` (with a specific reason: `configUnresolved`, `dependenciesFailed`, or `neverBecameHealthy`).

Governing rule (fixes root causes 1, 2, and 5): **the preview webview may only navigate to the server URL once state has reached `Healthy`.** Connection errors observed while in any earlier state are expected and are ignored outright — they cannot trigger a restart. The existing "don't restart a live process" liveness check (`_isManagedPreviewServerProcessAlive`) is preserved and extended to gate `Degraded → Restarting` as well, so a slow-but-alive process is never torn down.

`ResolvingConfig` is a new, explicit state entered whenever `needsConfigurationPrompt` would be true today; it renders its own distinct message and never attempts to start a server until configuration resolves, closing the fifth gap above.

## Adaptive Timing

Parakit records, per project (keyed by repo root path — not per branch, since install/compile speed is a property of the environment and dependency graph, not the branch name), a small rolling history of how long `InstallingDependencies` and `WaitingForFirstResponse` actually took on previous runs. This is local-only machine state — never committed, never leaves the machine.

Each new run computes its grace-period budget from that history:

- `budget = clamp(historicalP90 * 1.5, currentFixedConstant, historicalP90 * 3)` — i.e. budget 50% above the slowest-typical recent run, floored at today's constant, capped at 3x that same recent-typical measurement.
- The floor is today's exact current constant — the adaptive budget can never be *shorter* than today's behavior, so this can only add grace, never take it away.
- The ceiling bounds the budget to 3x the historical P90, so a bad reading can't mean waiting forever.
- "Historical P90" is computed over the last 5 successful runs for that project (fewer than 5 recorded → use all available; 0 available → no history, use the fixed constant as described below).
- No history yet (new project, cleared cache) → falls back byte-for-byte to today's fixed constants. Day-one behavior for any project Parakit has never seen is unchanged.
- A missing or corrupt history file is treated identically to "no history" and never blocks startup.

## UI Communication

The startup page (`appPreviewStartupPage.ts`) renders directly from the current state plus its timing context (elapsed time, current budget, historical median), enabling specific, honest messages instead of a generic spinner — e.g. "Installing dependencies — usually about 4m30s here; you're at 2m10s," or, once over budget, "This is taking longer than usual (normally ~4m30s) — still alive, still waiting."

`Degraded` is a new state with its own UI treatment: today, background health failures are invisible until a restart already happened. Surfacing "having trouble getting a response, retrying quietly" *before* any restart means a restart, if it does happen, is never an unexplained flicker.

`Failed` states are specific (`configUnresolved` / `dependenciesFailed` / `neverBecameHealthy`) rather than one generic failure screen, each with an actionable message and a manual retry action.

## Error Handling

- Unresolved config (new branch, no saved URL) → `ResolvingConfig` state, no startup attempt, no restart loop.
- Dependency install genuinely fails (non-zero exit, not just slow) → `Failed: dependenciesFailed` with the real error output surfaced; no retry loop, since retrying a hard failure is pointless.
- Retry budget exhausted after repeated genuine health failures from a `Healthy`/`Degraded` state → `Failed: neverBecameHealthy` with a manual retry action, rather than looping forever.
- Corrupt/unreadable timing-history file → treated as no history; never throws, never blocks startup.

## Testing

All new decision logic (state transition function, budget calculator, history read/write) is kept as pure, dependency-free functions in `appPreviewConfig.ts`, consistent with the existing pattern there — testable without spinning up Electron or a terminal.

- **Phase 1 tests** (bug fixes): a red/green test per bug — first a test proving today's actual buggy behavior, then the fix that turns it green. This is the regression fence for the highest-risk, most-shared code path.
- **Phase 2 tests** (adaptive budgets): fully deterministic pure-function tests over the clamp/fallback logic, including corrupt-file and no-history cases. No timers, no real waiting.
- **Phase 3 tests** (state machine + UI): an exhaustive table of "given this state and this event, expect this resulting state," plus a small number of true end-to-end tests for the highest-value real scenarios (slow first install, a background flake that recovers, a genuinely broken install).
- **Shadow-mode validation**: before the new state machine drives real behavior, it runs silently alongside the current live code, logging what it would have decided; only once that log shows agreement with real-world outcomes does the live path switch over.

## Rollout Phases

1. **Phase 1 — correctness fixes.** Root causes 1, 2, and 5. Small, isolated, independently revertible patches at exact call sites. No new persisted state. Lowest risk, addresses the exact symptom observed live during this investigation.
2. **Phase 2 — adaptive timing.** Root cause 3. Strictly additive; falls back to unchanged behavior with no history. Floor/ceiling clamps make a bad reading fail safe.
3. **Phase 3 — state machine + UI communication.** Root cause 4 (via moving the health probe off the browser-`fetch`/no-cors path) plus the full state-machine/UI rework. Delivered last, and only after shadow-mode validation, since it touches the shared control flow every preview goes through.

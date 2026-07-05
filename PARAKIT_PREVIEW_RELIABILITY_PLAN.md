# Parakit App Preview — Reliability Implementation Plan

**Audience:** implementing engineer (junior-friendly). Every task lists the exact file/function, the change, the test to add, how to verify, and its regression risk.
**Branch:** `design/parakit-preview-reliability` (PR #3). Do all work here; one commit per task.
**Status of prior work (already shipped on this branch — do NOT redo):** fixed-port ownership pre-flight with auto-close, and render-aware health (`resolveWorkbenchAppPreviewHealthFromSignals` + the `reachable` state). These are the foundation the tasks below build on.

> **Prime directive: no regressions.** The single most important repo — `acs-schedule` — already works today. Nothing in this plan may break it. See [§3 Regression Safety](#3-regression-safety) and run the [§4 Regression Test Matrix](#4-regression-test-matrix) before every merge.

---

## 1. Working setup (read once)

1.a — **The two files that hold almost everything:**
- `src/vs/workbench/contrib/browserView/common/appPreviewConfig.ts` — **pure logic**. Easy and safe to unit-test. Put new decision functions here.
- `src/vs/workbench/contrib/browserView/electron-browser/workbenchAppPreview.contribution.ts` — the **controller** (imperative, ~4000 lines). Harder; keep changes minimal and delegate logic to pure functions in the file above.

1.b — **Dev loop for every change:**
- 1.b.1 — Typecheck: run the background transpile watch (`npm run watch-client-transpile`) or `npx tsgo --noEmit -p src/tsconfig.json`. Fix all errors.
- 1.b.2 — Unit tests: `npm run test-node -- --grep 'AppPreview'` runs the `AppPreview*` suites. One suite: e.g. `--grep 'AppPreviewUrl'`.
- 1.b.3 — Build + smoke: `npm run compile`, launch the fork, run the task's **Verify** step.

1.c — **Code rules (strict ESLint):** no `any`, no non-null `!`, `===`/`!==`, `const`, include all React/hook deps, `default-case` on switches. New tests go in `src/vs/workbench/contrib/browserView/test/common/` next to `appPreviewUrl.test.ts`; copy the header + `ensureNoDisposablesAreLeakedInTestSuite()` pattern from `test/common/appPreviewFixedPort.test.ts`.

1.d — **Definition of done (every task):** tsgo clean · new tests pass · all `AppPreview*` suites still pass · the task's Verify passes · the relevant [§4](#4-regression-test-matrix) rows re-run green · one `fix(app-preview): …` commit.

---

## 2. Overview (ordered simplest → hardest)

| Task | Fixes | Difficulty | Regression risk | Must re-test (§4) |
|------|-------|-----------|-----------------|-------------------|
| [A1](#a1) | Confirm config-page animation already fixed (rebuild, no code) | trivial | none | R1 |
| [A2](#a2) | Dev server opens an external browser | easy | low | R1 R2 R3 |
| [A3](#a3) | "Default URL not set" flash on switch | easy–moderate | low | R1 R3 R4 |
| [A4](#a4) | 5-min install looks frozen (feedback) | easy | low | R3 |
| [B1](#b1) | Unnecessary reinstall on branch switch | medium | medium | R2 R3 R5 |
| [B2](#b2) | ACS `local.*` host not treated as local → won't route into preview tab / weak health | medium | medium (platform) | R1 R2 R3 |
| [B3](#b3) | ~10s Chromium error screen on switch | medium | medium | R1 R2 R5 |
| [C1](#c1) | `running` set before server verified | medium | medium | R1 R2 R3 |
| [C2](#c2) | No terminal state for "up but never rendered" | medium | medium | R3 |
| [C3](#c3) | Load-error recovery misses JS/mount failures | medium | medium | R2 R3 |
| [C4](#c4) | Configured override silently dropped | medium | low | R4 |

---

## 3. Regression Safety

These principles are **binding** for every task. Reviewers must reject changes that violate them.

3.a — **Fail-open.** A new check that cannot determine its answer (e.g. a render probe that can't run, a port owner that can't be read) must fall back to today's behavior — never to a harder failure. Precedent: the shipped render probe treats "can't probe" as "don't block".

3.b — **Preserve the happy path.** `acs-schedule` (R1) uses a **no-op command** (`"command": "sleep 86400"`), a **pre-configured** `https://local.acc-qa.autodesk.com:3001/` URL, and `healthPath: "/health"`. It works today. Every change must keep it: loads in the preview tab, health passes, no reinstall, no external browser, no error/flash screens.

3.c — **Additive over destructive.** Prefer adding a fallback branch or a new state to rewriting an existing branch. Example: A3 adds a last-resort fallback rather than changing the resolver's ordering.

3.d — **Pure-function discipline.** Put new logic in `appPreviewConfig.ts` as a pure function with exhaustive unit tests (happy path + each edge + the "unknown/undefined input" case). The controller only wires inputs → function → effect. This keeps risk in tested code, not in the 4000-line controller.

3.e — **Scope platform changes narrowly.** `src/vs/platform/browserView/common/browserView.ts` and `src/vs/platform/url/common/trustedDomains.ts` are shared beyond App Preview. Only B2 touches platform code; scope it to the browser-view predicates, never `isLocalhostAuthority`, and comment the rationale.

3.f — **Gate risky behavior changes.** B3 changes what the user sees during startup — gate it strictly on "a Parakit startup page is active" so steady-state browsing is untouched.

3.g — **One task per commit/PR** for bisectability and isolated review.

3.h — **Never regress a passing test.** If an existing assertion must change, that is a signal you changed behavior — justify it explicitly in the PR and confirm with the reviewer.

---

## 4. Regression Test Matrix

Re-run the rows listed in each task's "Must re-test" column. R1 is the golden baseline and is re-run for almost everything.

4.R1 — **acs-schedule (golden baseline).** No-op command (`sleep 86400`), pre-configured `local.acc-qa.autodesk.com:3001` URL, `/health`. Expected: opens in the preview tab, health passes, no external browser, no reinstall, no error/flash screens. **Must remain identical.**
4.R2 — **Localhost managed repo.** rsbuild/CRA on `localhost:PORT`, has a `start` script, dependencies already installed. Expected: server starts, loads internally, no external browser, no reinstall on second open.
4.R3 — **No-config managed repo (cold).** Needs configuration, `node_modules` absent. Expected: install shows the "can take a few minutes" feedback, then loads internally; no external browser; no "Default URL not set" flash.
4.R4 — **Repo with a saved default-URL override.** Expected: the override is honored (A3/C4 must not override the override).
4.R5 — **Branch switch A→B→A (same repo).** Expected: no reinstall, no stale error screen, lands on the correct branch's app.
4.R6 — **Foreign server squatting on the fixed port.** Expected: auto-closed (already shipped) and still works after these changes.

---

## PHASE A — simple, isolated, low-risk

<a id="a1"></a>
### A1 — Rebuild and confirm the config-page animation is already fixed (no code)

A1.a — **Why:** the animated SVG on the *needs-configuration* page was a real bug, but it was already fixed in commit `1cb4d6a4` (an ancestor of HEAD). The animation you saw was a stale build. This step prevents chasing a fixed bug and sets a clean baseline.
A1.b — **Do:** `npm run compile`, relaunch the fork, trigger the setup/config page, confirm it is text-only.
A1.c — **Verify (test already exists):** `npm run test-node -- --grep 'workbenchAppPreview'` — the assertion in `test/browser/workbenchAppPreview.test.ts` (~line 516) already locks "setup page has no `startup-animation`". It must pass.
A1.d — **Regression risk:** none (no code).

<a id="a2"></a>
### A2 — Stop the dev server from opening an external browser

A2.a — **Why:** the app opened in the system browser because the managed dev server (rsbuild/CRA/Vite) auto-opens a browser on start and Parakit never disables it. That open happens at the OS level and bypasses every in-app guardrail — so this is *separate* from "why didn't it open in the preview tab" (see B2/B3).
A2.b — **File/loc:** `appPreviewConfig.ts` → `applyWorkbenchAppPreviewDevPort` (currently lines 841–852; env built at line 848).
A2.c — **Change:** inject `BROWSER=none` into the managed-server env:
```ts
env: { BROWSER: 'none', ...(config.portEnv ? { [config.portEnv]: portValue } : {}) },
```
A2.d — **Caveat (put in the PR + a code comment):** CRA/webpack/Vite honor `BROWSER=none` cleanly (via the `open` npm package). rsbuild misreads it as a browser *name* and logs a benign "failed to launch browser" line — it still suppresses the real browser, so the symptom is fixed. Optional follow-up (not required): also append the framework's own `--no-open` flag.
A2.e — **Tests** (`test/common/appPreviewUrl.test.ts`):
- A2.e.1 — with `portEnv:'PORT'`, `applyWorkbenchAppPreviewDevPort(cfg, 3001).env` deep-equals `{ BROWSER:'none', PORT:'3001' }`.
- A2.e.2 — with no `portEnv`, env equals `{ BROWSER:'none' }`.
A2.f — **Verify (manual, R2/R3):** switch to a managed rsbuild repo → the system browser must NOT pop open.
A2.g — **Regression risk:** low — only the managed dev-server env; user terminals untouched. R1 (no-op command) is unaffected because its command never launches a browser.

<a id="a3"></a>
### A3 — Fix the "Default URL not set" flash

A3.a — **Why:** when the healthy server is finally opened (`preferRunningServer:true`), the URL resolver drops both the running and discovered URLs (they are identical) and, with no saved default URL, returns `undefined` → the controller paints the "Default URL not set" setup page for ~0.5s before a later navigation loads the app.
A3.b — **File/loc:** `appPreviewConfig.ts` → `resolveWorkbenchAppPreviewPreferredUrl` (lines 297–311).
A3.c — **Change:** never collapse to `undefined` when a running-server URL exists — keep it as a last resort even in prefer-running mode:
```ts
const resolved = resolveWorkbenchAppPreviewUrl({
    localBranchOverride: candidates.localBranchOverride,
    localDefaultOverride: candidates.localDefaultOverride,
    repoBranchUrl: candidates.repoBranchUrl,
    repoDefaultUrl: candidates.repoDefaultUrl,
    runningServerUrl,
    discoveredUrl,
});
return resolved ?? candidates.runningServerUrl?.trim() ?? undefined;
```
A3.d — **Optional hardening (belt-and-suspenders):** in `contribution.ts` → `_navigatePreferredUrl` (line ~1453), only call `_showPreviewSetupState` when there is genuinely no running server for the current branch (`!(this._serverBranch === branchName && this._serverUrl)`). A3.c alone fixes it; skip this if short on time.
A3.e — **Tests** (`test/common/appPreviewUrl.test.ts`):
- A3.e.1 — `resolveWorkbenchAppPreviewPreferredUrl({ runningServerUrl:'http://localhost:3001/', discoveredUrl:'http://localhost:3001/', allowRunningServerFallback:false })` returns `'http://localhost:3001/'` (was `undefined` — this is the bug).
- A3.e.2 — when a `repoDefaultUrl`/override exists, it is still preferred over the running URL (guards against over-correction — protects R4).
- A3.e.3 — `allowRunningServerFallback:true` behavior is unchanged (existing tests stay green).
A3.f — **Verify (manual, R3):** switch to a repo with no saved default URL → no "Default URL not set" flash between health-pass and load.
A3.g — **Regression risk:** low; pure function, additive fallback. R4 is the one to watch — confirm a saved override still wins (A3.e.2).

<a id="a4"></a>
### A4 — Make the install step not look frozen

A4.a — **Why:** a real (sometimes cold) `npm/yarn` install can take minutes; the "installing dependencies" page renders once and never updates, so it looks hung.
A4.b — **File/loc:** `contribution.ts` — the `installingDependencies` startup-page state (search `appPreviewInstallPreparingMessage`, ~line 2839).
A4.c — **Change (minimum):** update the localized message to set expectations, e.g. `"Installing dependencies. A fresh install can take a few minutes…"`.
A4.d — **Change (better, optional):** while the install command is awaited, re-render the page every ~5s with elapsed time and the last line of `this._serverRecentOutput` (already tracked). Use a `disposableTimeout`/interval cleared when the install resolves — no new lifecycle.
A4.e — **Test:** extract the message/elapsed formatting into a pure helper (recommended) and unit-test it in `test/common/`; otherwise assert the new message via the startup-page test in `test/browser/workbenchAppPreview.test.ts`.
A4.f — **Verify (manual, R3):** trigger a cold install → the page shows the "can take a few minutes" hint (and, if you did A4.d, a ticking elapsed/output line).
A4.g — **Regression risk:** low; copy/UX + an optional timer that is always disposed.

---

## PHASE B — medium, needs care

<a id="b1"></a>
### B1 — Don't reinstall dependencies unnecessarily on branch switch

B1.a — **Why:** install is gated by comparing file **timestamps** (lockfile mtime vs `node_modules` mtime). A `git checkout`/pull (i.e. switching branches) bumps the lockfile mtime, so readiness reads "stale" and reinstalls even when nothing changed → the recurring multi-minute waits.
B1.b — **Files:** `common/appPreviewPackageManager.ts` → `resolveWorkbenchAppPreviewDependencyReadiness` (~lines 89–98); `contribution.ts` → the readiness-signal builder (~lines 389–433) and the post-install site (~lines 2847–2867).
B1.c — **Change:** add a **content-hash** signal. After a *successful* install, write a marker (e.g. `node_modules/.parakit-install-hash` = hash of the resolved lockfile contents). On start, if the marker matches the current lockfile hash, treat readiness as `'ready'` even when mtime is newer. Keep mtime as a fallback when no marker exists.
B1.d — **Tests** (`test/common/appPreviewPackageManager.test.ts`): readiness returns `'ready'` when `installedHash === lockfileHash` regardless of mtimes; `'stale'` when hashes differ; `'missing'` when no artifact. (Pure function — pass hashes/mtimes as inputs.)
B1.e — **Verify (manual, R5):** install once, then switch branches back and forth with no dependency change → no reinstall on subsequent switches.
B1.f — **Regression risk:** medium — a wrong "ready" skips a needed install. **Mitigation:** only trust the hash marker when `node_modules` actually exists; fall back to mtime otherwise. R2/R3 confirm real installs still run when needed.

<a id="b2"></a>
### B2 — Recognize ACS loopback-alias hosts (`local.*`) as local dev URLs

B2.a — **Why (shared root cause):** ACS uses `local.acc-qa.autodesk.com:PORT` — a hostname that resolves to loopback but carries a real domain for auth cookies. The fork already has a `local.`-aware predicate, `isWorkbenchAppPreviewLocalHost` (`appPreviewConfig.ts:344`), but the health-fetch-mode and the browser-view link router use the **strict** localhost check. So ACS URLs are treated as "foreign": links route to a separate tab instead of the App Preview tab, and health takes the weak path.
B2.b — **Change 1 (health):** `appPreviewConfig.ts` → `getWorkbenchAppPreviewHealthFetchMode` (line 225): use `isWorkbenchAppPreviewLocalHost(parsed.hostname)` instead of `isWorkbenchAppPreviewLoopbackHost`. Export `isWorkbenchAppPreviewLocalHost` if needed.
B2.c — **Change 2 (routing):** `platform/browserView/common/browserView.ts` → `isBrowserViewLocalHttpUrl` (264) / `isBrowserViewLocalOrAllInterfacesHttpUrl` (277): also accept a `local.`-prefixed https host so `getBrowserViewExternalLinkAction` returns `openAppPreview` for ACS URLs when a preview exists.
B2.d — **Blast-radius note (critical for review):** `browserView.ts` is platform-shared. Scope the change to the browser-view predicates only; do **not** touch `trustedDomains.isLocalhostAuthority`. Add a comment explaining the ACS loopback-alias rationale. There is precedent — `isWorkbenchAppPreviewLocalHost` already treats `local.*` as local — so this is consistency, not a new heuristic.
B2.e — **Tests:**
- B2.e.1 — `test/common/appPreviewUrl.test.ts`: `getWorkbenchAppPreviewHealthFetchMode('https://local.acc-qa.autodesk.com:3001/')` returns `'no-cors'`; a plain `https://acc-qa.autodesk.com/` (no `local.`) still returns `'cors'`.
- B2.e.2 — a `browserView` test: `getBrowserViewExternalLinkAction({ targetUrl:'https://local.acc-qa.autodesk.com:3001/x', hasAppPreview:true, openLocalhostLinks:false })` returns `'openAppPreview'`; a genuinely external `https://example.com/` still returns `'openInternal'`/`'allowExternal'` as before.
B2.f — **Verify (manual, R1/R2):** in an ACS repo, a same-host link/redirect lands in the App Preview tab, not a new tab or the external browser; R1 health still passes.
B2.g — **Regression risk:** medium — anything served from a `local.*` host is now treated as local. Given the existing precedent, this is consistent; still, call it out for review and confirm no non-ACS `local.*` usage is affected.

<a id="b3"></a>
### B3 — Kill the ~10s Chromium "problem loading page" screen on switch

B3.a — **Why:** on switch the reused preview view still points at the previous (now-dead) server URL, or is navigated before the new server is listening; Chromium paints its full-pane error overlay, and the controller ignores load events during startup so the overlay lingers until the server boots (~10s, matching `PREVIEW_TERMINAL_READY_TIMEOUT`).
B3.b — **Files:** `electron-browser/features/browserEditorErrorFeatures.ts` (`_updateError`, ~line 85) and `contribution.ts` (navigation ordering; the reused-view / `_shouldOpenConfiguredPreviewWithoutServer` path ~line 2222; `_handlePreviewLoadingState` ~line 3279; the invariant comment ~line 2781).
B3.c — **Change (approach):** (i) while a Parakit startup page is active (`_previewStartupInProgress` / `serverStartInFlight`), suppress the raw Chromium error overlay so the startup page stays visible; (ii) on switch, do not navigate the reused view to a stale/expected URL until the server is confirmed (honor the invariant at ~2781). Extract the "should we show the error overlay?" decision into a pure function so it is testable.
B3.d — **Tests** (`test/common/`): pure decision — "startup in progress + a loopback connection-refused error → do NOT show the full-pane error overlay"; "startup complete + real error → DO show it".
B3.e — **Verify (manual, R5):** switch to a repo whose server takes a few seconds → no ~10s red error screen; Parakit's startup page stays visible until the app loads.
B3.f — **Regression risk:** medium — over-suppressing could hide genuine load errors. **Mitigation (per 3.f):** suppress ONLY while a startup page is active AND the error is a loopback connection error; always show errors once startup completes. R1/R2 confirm real errors still surface.
B3.g — **Recommendation:** senior review before merge — this touches navigation ordering that overlaps recently shipped work.

---

## PHASE C — remaining audit hardening (state machine; senior review recommended)

These come from the determinism audit and are partly mitigated by the shipped render-aware health work. They are real, but they are state-machine changes — schedule after Phase A/B and pair-review with a senior. Each still follows §3 (fail-open, additive, pure-function, one PR each).

<a id="c1"></a>
### C1 — Stop marking the server `running` before it is verified (audit G3)
C1.a — **Why:** `state` is forced `starting → running` the instant the launch command is *sent* (`contribution.ts` ~lines 2855–2860), before any process-alive or serving check — so a crash-on-boot or an occupied port is reported `running`.
C1.b — **Files:** `contribution.ts` (the `running` assignment); `appPreviewConfig.ts` `WorkbenchAppPreviewServerState` type and `getWorkbenchAppPreviewServerStateAfterCommandExit`.
C1.c — **Change:** introduce a staged progression `launched (process alive) → serving (HTTP 200) → ready (rendered)`; only report `running` once at least `serving`. Model transitions as a pure function.
C1.d — **Tests:** pure transition table (each input state → expected next state, incl. the crash/occupied cases).
C1.e — **Verify (R1/R2/R3):** status never reads `running` while the process is dead or nothing serves.
C1.f — **Regression risk:** medium — many call-sites read `state==='running'`. **Mitigation:** keep `running` as the umbrella once `serving`; add the finer stages as an additional field so existing readers don't break.

<a id="c2"></a>
### C2 — Add a terminal state for "server up but app never rendered" (audit G4)
C2.a — **Why:** an alive process serving a blank shell has no failing timeout — it sits on a "slow" overlay and polls forever.
C2.b — **File/loc:** `appPreviewConfig.ts` → `getWorkbenchAppPreviewServerStateAfterHealthTimeout` (lines 498–512) — currently returns `'failed'` only on process death.
C2.c — **Change:** using the already-shipped render signal, return `'failed'` (message: "server responded but the app did not mount") on render-timeout with a live process. Fail-open: if render could not be probed, keep today's behavior (do NOT fail).
C2.d — **Tests:** extend the health-timeout tests: render-verified=false + alive + timeout → `'failed'`; render-verified=undefined → unchanged.
C2.e — **Verify (R3):** point the preview at a 200-shell that never mounts → it reaches a clear failed state instead of spinning forever.
C2.f — **Regression risk:** medium — a false "not rendered" would fail a working app. **Mitigation:** fail-open on unknown; require the render signal to be a definite `false`.

<a id="c3"></a>
### C3 — Recover from JS/mount load failures, not just network errors (audit G6)
C3.a — **Why:** `shouldRecoverWorkbenchAppPreviewLoadError` only fires for specific net error codes; a 200 whose bundle threw or never mounted is not a "load error", so recovery never triggers — exactly the blank-page class.
C3.b — **File/loc:** `appPreviewConfig.ts` → `shouldRecoverWorkbenchAppPreviewLoadError` (~lines 448–468).
C3.c — **Change:** also treat "reachable but render-verified === false on the server origin" as recoverable (tie into the render probe). Keep it additive — do not change the existing net-code branches.
C3.d — **Tests:** add cases for render-failed-but-200 → recover; unchanged net-code cases still behave identically.
C3.e — **Verify (R2/R3):** a repo that transiently fails to mount recovers on the next cycle.
C3.f — **Regression risk:** medium — could loop-restart a genuinely-broken app. **Mitigation:** reuse the existing bounded restart-attempt counter; do not add an unbounded path.

<a id="c4"></a>
### C4 — Surface (don't silently drop) a configured override that can't be mapped (audit G8)
C4.a — **Why:** `resolveWorkbenchAppPreviewHomeTargets` drops a configured override on origin/protocol mismatch and can fall through to the bare dev origin, so the user's configured URL is silently ignored.
C4.b — **File/loc:** `appPreviewConfig.ts` → `resolveWorkbenchAppPreviewHomeTargets` (line 366+).
C4.c — **Change:** when an override is dropped, return a *reason*; rebase by port/path onto the running origin rather than discarding; surface "using X because your configured override Y could not be mapped" in `_serverMessage`. Overlaps A3 — do A3 first.
C4.d — **Tests:** override that can be rebased → rebased URL returned; override that can't → reason returned, not silent.
C4.e — **Verify (R4):** a configured override is either honored or the UI explains why it wasn't.
C4.f — **Regression risk:** low — mostly additive messaging; keep the resolved-URL output unchanged where a mapping already succeeded.

---

## 5. Review Guidelines (for the reviewer — not limited to these)

Reject or request changes if any of the following is not satisfied. This list is a floor, not a ceiling — apply judgment beyond it.

5.a — **Regression first.** The relevant [§4](#4-regression-test-matrix) rows were re-run and pass, and **R1 (acs-schedule) behaves identically**. If any existing test assertion changed, the PR explains why (per 3.h).
5.b — **Fail-open verified.** For every new check, there is a test proving the "cannot determine" / undefined-input path degrades to prior behavior (per 3.a).
5.c — **Logic is pure and tested.** New decision logic lives in `appPreviewConfig.ts` (or another pure module) with tests covering happy path, each edge, and the unknown-input case. The controller only wires it (per 3.d).
5.d — **Blast radius acknowledged.** Any edit under `src/vs/platform/**` (only B2 should have one) is called out explicitly, scoped narrowly, and does not alter shared security predicates like `isLocalhostAuthority`.
5.e — **Behavior change is gated.** User-visible changes during startup (B3, C1) are gated so steady-state is untouched (per 3.f).
5.f — **Scope is one task.** The PR implements exactly one plan task and its tests — no drive-by refactors (per 3.g).
5.g — **Strict ESLint + types.** No `any`, no `!`, `===`, `const`, all deps listed; tsgo clean.
5.h — **Manual evidence.** The PR description includes what was manually verified (which repo archetype, what was observed) — not just "tests pass".
5.i — **No silent truncation/guessing.** If a change bounds behavior (retry caps, sampling, skipping install), it is logged/surfaced, never silent.
5.j — **Reversibility.** The change is easy to revert in isolation (small, additive, one commit) should a regression surface in the field.

---

## 6. Quick reference — key symbols

- `applyWorkbenchAppPreviewDevPort` — builds the dev-server command/env/urls (A2). `appPreviewConfig.ts:841`.
- `resolveWorkbenchAppPreviewPreferredUrl` — chooses the URL to navigate (A3). `appPreviewConfig.ts:297`.
- `getWorkbenchAppPreviewHealthFetchMode` — cors vs no-cors (B2). `appPreviewConfig.ts:222`.
- `isWorkbenchAppPreviewLocalHost` — the existing `local.`-aware predicate to reuse (B2). `appPreviewConfig.ts:344`.
- `getBrowserViewExternalLinkAction` / `isBrowserViewLocalHttpUrl` — internal-vs-external routing (B2). `platform/browserView/common/browserView.ts:319` / `:264`.
- `resolveWorkbenchAppPreviewDependencyReadiness` — install gating (B1). `appPreviewPackageManager.ts:89`.
- `getWorkbenchAppPreviewServerStateAfterHealthTimeout` — timeout → state (C2). `appPreviewConfig.ts:498`.
- `shouldRecoverWorkbenchAppPreviewLoadError` — load-error recovery (C3). `appPreviewConfig.ts:448`.
- `resolveWorkbenchAppPreviewHomeTargets` — URL/override resolution (C4). `appPreviewConfig.ts:366`.
- `_doStartPreviewServer` / `_navigatePreferredUrl` / `_checkServerHealthNow` — controller flow. `contribution.ts:~2665 / ~1423 / ~3250`.
- Tests live in `src/vs/workbench/contrib/browserView/test/common/` (pure) and `test/browser/` (component). Run: `npm run test-node -- --grep 'AppPreview'`.

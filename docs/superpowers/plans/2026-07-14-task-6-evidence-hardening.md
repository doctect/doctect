# Task 6 Evidence Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen Task 6 browser evidence with server-observed markers, authoritative cloud/MR state, and stable pane selectors.

**Architecture:** A self-contained Node marker server records attack hits on an ephemeral loopback port and is managed by Playwright test fixtures. Browser helpers read active local state and authenticated cloud HEAD commits for exact comparisons. Editor panes expose stable test attributes without changing accessibility semantics.

**Tech Stack:** Playwright, Node HTTP, React 19, Vitest, Express cloud API.

## Global Constraints

- Keep production timeout fixed at 10,000 ms.
- Preserve CORS fix and existing publish/open/fork/MR workflows.
- Keep task report ignored/workspace-only and do not touch progress ledger.
- Use isolated temporary Playwright services outside repository; do not alter occupied ports.
- WebKit may remain explicitly unrun only when executable is absent.

---

### Task 1: Marker Server

**Files:**
- Create: `tests/e2e/markerServer.js`
- Create: `tests/unit/e2eMarkerServer.test.js`

**Interfaces:**
- Produces: `startMarkerServer(): Promise<{ url(path): string, hits: Array<{ method: string, url: string }>, close(): Promise<void> }>`.

- [ ] **Step 1: Write failing unit test**

Import `startMarkerServer`, start it, fetch `marker.url('/attack')`, assert one server-side hit, and close in `finally`.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run tests/unit/e2eMarkerServer.test.js`

Expected: FAIL because `tests/e2e/markerServer.js` does not exist.

- [ ] **Step 3: Implement marker server**

Use `node:http`, bind `127.0.0.1` port `0`, record every request, return JavaScript-safe `204` responses, track sockets, and close all connections reliably.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --run tests/unit/e2eMarkerServer.test.js`

Expected: PASS.

### Task 2: Stable Active Pane Contract

**Files:**
- Modify: `pages/EditorPage.tsx`
- Modify: `tests/e2e/editor_advanced.spec.js`
- Modify: `tests/e2e/gallery.spec.js`
- Modify: `tests/e2e/fork.spec.js`
- Modify: `tests/e2e/merge_requests.spec.js`

**Interfaces:**
- Produces: `[data-testid="project-pane"][data-active="true"]` for active editor pane.

- [ ] **Step 1: Replace one Tailwind selector first**

Change an existing focused case to use `page.getByTestId('project-pane').filter({ has: ... })` or `[data-active="true"]` before adding attributes.

- [ ] **Step 2: Verify RED**

Run focused Chromium case and expect locator-not-found failure.

- [ ] **Step 3: Add production attributes**

Add `data-testid="project-pane"` and `data-active={project.id === activeProjectId ? 'true' : 'false'}` to pane wrapper. Do not add roles or alter aria behavior.

- [ ] **Step 4: Replace remaining Tailwind selectors and verify GREEN**

Run focused Chromium pane-dependent cases and expect PASS.

### Task 3: Sandbox Evidence

**Files:**
- Modify: `tests/e2e/editor_advanced.spec.js`

**Interfaces:**
- Consumes: marker server and stable active-pane contract.
- Produces: explicit one-page fixture plus exact pre/post project state evidence.

- [ ] **Step 1: Add explicit fixture and snapshots**

Define fixed one-template/one-node scripts. Apply them before attack/timeout, then capture `nodes`, `rootId`, `variants`, `activeVariantId`, and `generator` from active project state.

- [ ] **Step 2: Replace request listeners**

Use absolute marker URLs from test-owned server for dynamic import and exposed-fetch timeout probes. Assert `marker.hits` remains empty after each preview settles.

- [ ] **Step 3: Tighten timeout bound**

Require elapsed time at least 9,500 ms and below 12,500 ms, retaining CI scheduling margin around fixed 10,000 ms.

- [ ] **Step 4: Verify focused GREEN**

Run Chromium sandbox cases and expect all pass with exact state equality.

### Task 4: Gallery And Cloud Authority

**Files:**
- Modify: `tests/e2e/gallery.spec.js`
- Modify: `tests/e2e/helpers.js`

**Interfaces:**
- Produces: fresh authenticated context login and cloud HEAD state reader.

- [ ] **Step 1: Seed inert trap metadata**

Apply valid generated output, then replace saved source metadata in persisted active state with an absolute marker signal wrapped in an unconditional throw. Reload before saving to cloud.

- [ ] **Step 2: Assert inert open/reload/fork**

For each operation assert exact trap source, Apply disabled, no alert and no ready preview summary, and zero marker-server hits.

- [ ] **Step 3: Verify authoritative save**

After edited source is applied and saved, create a fresh context, sign in with user credentials, fetch project then HEAD commit, and compare both scripts byte-for-byte.

- [ ] **Step 4: Verify focused GREEN**

Run Chromium gallery/fork suites and expect PASS.

### Task 5: Merge Authority

**Files:**
- Modify: `tests/e2e/merge_requests.spec.js`

**Interfaces:**
- Consumes: authenticated cloud HEAD reader.
- Produces: exact fork-before/target-after generated-state equality.

- [ ] **Step 1: Capture fork HEAD before MR**

Read fork project and HEAD commit after source/output save; select `nodes`, `rootId`, `variants`, `activeVariantId`, and `generator`.

- [ ] **Step 2: Compare target HEAD after merge**

Read target HEAD after merge and deep-compare selected generated fields to captured fork fields. Keep screenshot/title/count checks supplemental.

- [ ] **Step 3: Verify focused GREEN**

Run Chromium MR suite and expect both merge and conflict paths pass.

### Task 6: Complete Verification

**Files:**
- Modify: `.superpowers/sdd/task-6-report.md` (ignored, workspace-only)

- [ ] **Step 1: Run focused Chromium suites**

Run all Task 6 focused browser files against isolated temporary services.

- [ ] **Step 2: Commit implementation**

Inspect status/diff and commit new tests/selectors without amend.

- [ ] **Step 3: Run full verification**

Run `npm test -- --run`, `npm run build`, and complete Chromium/Firefox browser suite. Attempt WebKit only if installed.

- [ ] **Step 4: Append report and cleanup**

Record RED/GREEN, marker-server hits, authoritative state comparisons, totals, commits, missing browser coverage, and cleanup. Remove temporary config, SQLite files, result output, and marker listeners.

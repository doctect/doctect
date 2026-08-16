# Task 12 Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Task 12 Critical and Important review findings with adversarial static-policy coverage, production-seam blocked-upgrade evidence, complete CI triggers, a clean typecheck, and supported-host browser proof.

**Architecture:** Keep policy analysis test-local and use the repository TypeScript parser. Add a direct-module-only store factory for requested-version browser injection while leaving the public barrel and production v1 factory unchanged. Run final browsers in the matching official Playwright image.

**Tech Stack:** TypeScript 5.8.3 compiler API, Vitest, React 19, Playwright 1.57, IndexedDB/idb, GitHub Actions, Docker.

## Global Constraints

- Preserve epoch-1 legacy keys and all no-cleanup behavior.
- Production IndexedDB version remains exactly 1.
- Preference `localStorage.setItem` and `removeItem` calls outside `services/localWorkspace/**` remain legal.
- No TypeScript suppressions or skipped checks.
- Final Playwright evidence must use a supported host without host override or host-validation bypass variables.
- Reviewer Minor magic read count remains unchanged.

---

### Task 1: AST Boundary Policy

**Files:**
- Modify: `tests/unit/localWorkspaceBoundary.test.ts`

**Interfaces:**
- Produces: `analyzeSource(path: string, source: string): string[]` for virtual and repository scans.
- Consumes: TypeScript compiler API from installed `typescript` dependency.

- [ ] **Step 1: Add adversarial virtual-source tests**

Cover static, side-effect, dynamic, multiline, import-equals, and `require` imports; aliased/computed/bracket/destructured mutators; all six script extensions; parser failure; `createIndex`; production `localStorage.clear`; and allowed preference writes.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/localWorkspaceBoundary.test.ts`

Expected: virtual cases fail because regex-only scan misses AST forms.

- [ ] **Step 3: Implement AST analysis**

Use `ts.createSourceFile`, extension-specific `ScriptKind`, static string evaluation, declaration/assignment alias resolution, callable alias tracking, and AST source positions. Parse diagnostics produce violations. Under `services/localWorkspace/**`, reject every statically named `setItem`, `removeItem`, or `clear` invocation regardless receiver. Outside it, reject only `clear` when receiver or callable alias resolves to `localStorage`. Keep exact-key text confinement and schema `createIndex` policy.

- [ ] **Step 4: Run GREEN**

Run: `npx vitest run tests/unit/localWorkspaceBoundary.test.ts`

Expected: all repository and adversarial cases pass.

---

### Task 2: Production-Seam Blocked Upgrade

**Files:**
- Modify: `services/localWorkspace/indexedDbAdapter.ts`
- Modify: `services/localWorkspace/LocalWorkspaceStore.ts`
- Modify: `tests/unit/localWorkspace/indexedDbAdapter.test.ts`
- Create: `tests/e2e/fixtures/workspaceBlockedUpgradeHarness.tsx`
- Modify: `tests/e2e/fixtures/localWorkspaceMigration.js`
- Modify: `tests/e2e/local_workspace_migration.spec.js`

**Interfaces:**
- Produces: `createLocalWorkspaceStoreForTesting(environment, requestedIndexedDbVersion)` exported only from `LocalWorkspaceStore.ts`.
- Production `createLocalWorkspaceStore(environment)` remains unchanged and requests `WORKSPACE_DB_VERSION`.

- [ ] **Step 1: Add unit and browser RED coverage**

Unit test opens the default adapter and observes database version 1. Browser test holds an empty six-store raw v1 connection, mounts real `WorkspaceBootstrapGate` around a production store requesting v2, and asserts unavailable state, no editor, unchanged legacy bytes, and zero records.

- [ ] **Step 2: Run RED**

Run unit test and focused Chromium browser case. Expected browser failure: requested-version production seam does not exist.

- [ ] **Step 3: Add private requested-version seam**

Pass an internal requested version into `createIndexedDbAdapter`; default to `WORKSPACE_DB_VERSION`. Wrap the existing store implementation with public production and direct-module test factories. Do not export the test factory from `services/localWorkspace/index.ts`.

- [ ] **Step 4: Replace tautological raw upgrade helper**

Keep the raw v1 connection only as the blocker. Render the real gate through the TSX fixture and inspect the held connection for zero records. Release resources after assertions.

- [ ] **Step 5: Run GREEN**

Run focused unit and browser commands. Expected: default v1 and blocked production v2 path pass.

---

### Task 3: Workflow and Typecheck

**Files:**
- Modify: `.github/workflows/local-workspace-migration.yml`
- Modify: `tests/unit/changePassword.test.tsx`
- Modify: `tests/unit/loginEmailVerification.test.tsx`
- Modify: `tests/unit/svgEditing.test.ts`

**Interfaces:**
- Workflow path filter covers `pages/**`, `components/**`, `hooks/**`, `services/**`, `docs-capture/**`, `tests/**`, `App.tsx`, `package.json`, `playwright.config.cjs`, and itself.

- [ ] **Step 1: Capture typecheck RED**

Run: `npx tsc --noEmit`

Expected: four TS2556 spread diagnostics and one SvgValidation narrowing diagnostic.

- [ ] **Step 2: Apply behavior-neutral type fixes**

Give delegated Vitest mocks rest-parameter signatures and narrow SVG failure with `result.ok === false`. Add no assertions, casts, or suppressions.

- [ ] **Step 3: Broaden workflow filter**

Replace narrow source/test entries with complete static-root globs while retaining app/config/workflow paths.

- [ ] **Step 4: Run typecheck GREEN**

Run: `npx tsc --noEmit`

Expected: exit 0 with no diagnostics.

---

### Task 4: Complete Verification and Report

**Files:**
- Modify: `.superpowers/sdd/task-12-report.md` (ignored evidence file)

**Interfaces:**
- Consumes official image `mcr.microsoft.com/playwright:v1.57.0-noble`.

- [ ] **Step 1: Run focused gates**

Run boundary/adversarial unit, blocked-upgrade browser, and typecheck.

- [ ] **Step 2: Run sequential repository gates**

Run full Vitest, then production build. Do not overlap them.

- [ ] **Step 3: Run supported-host full E2E**

Run the complete suite inside matching Playwright Docker image on isolated ports without `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE` or `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS`.

- [ ] **Step 4: Append exact evidence**

Record image digest/version, command, counts, diagnostics, and any blocker in Task 12 report. Do not claim release-ready if supported-host execution cannot complete.

- [ ] **Step 5: Review and commit**

Inspect status/diff/log, restore generated `server/analytics.db`, stage only intended files, and commit with a concise conventional message.

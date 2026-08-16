# Task 12 Static Policy Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local-workspace static policy lexical, source-position-aware, capable of reconstructing legacy storage keys, and complete for `.mts`/`.cts`.

**Architecture:** Replace identifier-text maps with a batched in-memory TypeScript `Program` and `TypeChecker` symbols. Record conservative source-positioned origins per symbol, then reuse one candidate resolver for aliases, storage receivers, callable methods, require aliases, static strings, and localStorage key arguments.

**Tech Stack:** TypeScript 5.8 compiler API, Vitest, Node.js filesystem APIs.

## Global Constraints

- Keep `services/localWorkspace/legacyTypes.ts` and `tests/e2e/fixtures/localWorkspaceMigration.js` as the exact two-file legacy-access allowlist.
- Modify no production code.
- Keep every prior possible origin tainted across reassignment; ignore assignments positioned after the inspected use.
- Keep legitimate preference storage calls legal.
- Parse `.mts` and `.cts` as TypeScript while preserving their filenames.
- Do not address the magic-read Minor.
- Supported-host E2E need not rerun when only test-policy code changes.

---

### Task 1: Adversarial RED Coverage

**Files:**
- Modify: `tests/unit/localWorkspaceBoundary.test.ts`

**Interfaces:**
- Consumes: existing `analyzeSource(path: string, source: string): string[]` test seam.
- Produces: failing examples for lexical identity, temporal origins, reconstructed keys, and `.mts`/`.cts`.

- [ ] **Step 1: Add lexical and temporal tests**

Add table cases proving:

```ts
const storage = localStorage;
storage.clear();
function later() { const storage = supplied; return storage; }
```

is rejected; nested shadow symbols do not overwrite outer symbols; `localStorage -> supplied` before a call remains tainted; and `supplied` called before a later `localStorage` assignment stays allowed. Repeat representative cases for callable, destructured, require, and static-string aliases.

- [ ] **Step 2: Add reconstructed-key tests**

Cover `getItem`, `setItem`, and `removeItem` using concatenation, templates, constants, computed members, destructured methods, `.bind`, `.call`, and `.apply`. Ensure at least one preference call for each invocation family remains allowed.

- [ ] **Step 3: Add module-extension tests**

Add import and mutator violations in both `.mts` and `.cts` virtual sources.

- [ ] **Step 4: Run RED**

Run: `npm run check:workspace-boundary`

Expected: new cases fail because current global text maps lose lexical identity, exact-text scanning misses reconstructed keys, and `.mts`/`.cts` are not parsed.

---

### Task 2: Symbol-Aware Analyzer

**Files:**
- Modify: `tests/unit/localWorkspaceBoundary.test.ts`

**Interfaces:**
- Produces: `analyzeSources(inputs: readonly SourceInput[]): Map<string, string[]>` and retained `analyzeSource(path, source)` wrapper.
- Internal origin model:

```ts
interface SourceInput { path: string; source: string }
type OriginValue =
  | { kind: 'expression'; expression: ts.Expression }
  | { kind: 'member'; receiver: ts.Expression; propertyName: ts.PropertyName };
interface Origin { position: number; value: OriginValue }
```

- [ ] **Step 1: Batch source parsing through a TypeScript program**

Create a virtual compiler host with `allowJs`, `noLib`, and `noResolve`; preserve each input filename. Add `.mts` and `.cts` to source extensions and map both to `ts.ScriptKind.TS`.

- [ ] **Step 2: Collect symbol origins**

Use `checker.getSymbolAtLocation` for declarations, binding elements, identifier assignments, and object destructuring assignments. Store origins by `ts.Symbol`; never key by identifier text. Record assignment-end positions so only origins established before a use are eligible.

- [ ] **Step 3: Resolve conservative candidates**

Implement symbol-and-position cycle guards. Resolving an identifier unions every eligible origin. Resolve an origin expression at its own position so later mutations cannot flow backward through an alias. Preserve all prior candidates rather than selecting the latest assignment.

- [ ] **Step 4: Resolve calls and legacy keys**

Return all possible callable members, including invocation mode:

```ts
interface InvokedMember {
  method: string;
  localStorage: boolean;
  invocation: 'direct' | 'call' | 'apply';
}
```

For direct calls inspect argument zero; for `.call` inspect argument one; for `.apply` inspect element zero of every statically resolved argument-array origin. Outside the exact allowlist, report `accesses legacy document key through localStorage` when any static candidate matches a legacy key.

- [ ] **Step 5: Run GREEN**

Run: `npm run check:workspace-boundary`

Expected: repository scan and all adversarial cases pass.

- [ ] **Step 6: Commit implementation**

```bash
git add tests/unit/localWorkspaceBoundary.test.ts docs/superpowers/plans/2026-08-15-task-12-static-policy-gaps.md
git commit -m "test(storage): close static policy gaps"
```

---

### Task 3: Verification and Evidence

**Files:**
- Modify: `.superpowers/sdd/task-12-report.md` (ignored evidence file)

**Interfaces:**
- Consumes: final analyzer and adversarial suite.
- Produces: exact RED/GREEN and repository-gate evidence.

- [ ] **Step 1: Run sequential verification**

Run in order:

```bash
npm run check:workspace-boundary
npm test -- --run
npx tsc --noEmit
npm run build
```

Expected: all commands exit 0; only existing build chunk-size warning may remain.

- [ ] **Step 2: Append report evidence**

Record adversarial RED count/reasons, boundary test count and duration, full Vitest file/test counts, typecheck result, build module count/duration, skipped E2E rationale, commit, and concerns.

- [ ] **Step 3: Final repository checks**

Run `git diff --check`, inspect `git status --short`, and verify no generated files or production changes remain.

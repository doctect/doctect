# Browser Preference Fourth Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close five reviewed escape hatches in production browser-storage policy and scroll-lock expiry without reintroducing provenance analysis.

**Architecture:** Keep `analyzeSources` as policy module seam. Deepen implementation with exact syntax reservation, symbol-bound exception recognition, normalized executable-edge checks, and exact preference/bundle statement shapes; callers and production modules remain unchanged. Keep scroll-lock behavior local to `OverlayTextEditor` by expiring both captured element and window positions together.

**Tech Stack:** TypeScript 5.8 compiler AST/checker, Vitest 4, React 19 Testing Library, Node ESM onboarding generator.

## Global Constraints

- Keep closed syntax; do not add receiver, callee, value, or provenance tracing.
- Reserve executable identifier, string-literal, and no-substitution-template syntax exactly equal to `localStorage`.
- Permit only exact approved storage calls and exact inert `generatorSandbox` blocked-global data.
- Bind reflection exceptions to unshadowed built-ins or immutable trusted aliases and exact enclosing declarations.
- Reject production executable edges resolving into `tests/` or any repository scan-excluded directory.
- Keep browser preference declarations, helpers, operations, uses, exports, and onboarding exposure exact.
- Preserve `server/analytics.db` untouched and unstaged.
- Create one separate correction commit; do not amend `2bc9690`.

---

### Task 1: Add RED Closed-Syntax Probes

**Files:**
- Modify: `tests/unit/localWorkspaceBoundary.test.ts`

**Interfaces:**
- Consumes: `analyzeProductionSource(path, source)` and `analyzeSources(inputs)`.
- Produces: regression probes for all four static-policy findings while retaining current-module and generated-bundle positive controls.

- [ ] **Step 1: Add exact reserved-token probes**

Add table cases equivalent to:

```ts
[
  'const localStorage = {};',
  "const key = 'localStorage';",
  'const key = `localStorage`;',
  'const value = { localStorage: true };',
]
```

Each `components/ClosedStorage.ts` case must contain `accesses production localStorage outside approved persistence modules`. Add a positive assertion for the unchanged `services/generatorSandbox.ts` blocked-global entry.

- [ ] **Step 2: Add symbol-binding exception probes**

Append `function Object() {}` to `services/generatorSandbox.ts` and `function Reflect() {}` to `services/localWorkspace/indexedDbAdapter.ts`. Require browser-global escape findings. Keep unchanged files as positive controls.

- [ ] **Step 3: Add normalized executable-edge probes**

Cover static import, re-export, dynamic import, `require`, `Worker`, `SharedWorker`, HTML external script, SVG external script, `@/` alias, and `../components/../tests/` normalization. Require `loads executable code from excluded repository paths`. Add positive controls for `../services/browserPreferences`, Blob worker variables, `/index.tsx`, and an HTTPS script.

- [ ] **Step 4: Add exact preference-shape probes**

Mutate the real preference source with these exact changes and require `does not match the approved exact syntax` or the existing storage/export finding:

```ts
source.replace('  try {\n    if (typeof window', '  void key;\n  try {\n    if (typeof window')
source.replace('`${migrationReceiptPrefix}${receiptId}`', '`${migrationReceiptPrefix}x${receiptId}`')
source.replace('isBrowserPreferenceKey(key)\n  ||', 'isBrowserPreferenceKey(key) || true\n  ||')
source.replace('readRuntimeBrowserPreference(key) : null', '(readRuntimeBrowserPreference(key)) : null')
```

Wrap `buildBrowserPreferencesBundle(root)` in `if (true) { ... }` inside onboarding HTML and require rejection. Keep exact source and direct generated bundle positive controls.

- [ ] **Step 5: Run policy test and capture RED**

Run: `npx vitest run tests/unit/localWorkspaceBoundary.test.ts --maxWorkers=4`

Expected: new probes fail because current scanner misses reserved declaration/data tokens, trusts shadowed spellings, ignores excluded executable edges, accepts loose preference shapes, and accepts wrapped generated bundle.

### Task 2: Deepen Static Policy Implementation

**Files:**
- Modify: `tests/unit/localWorkspaceBoundary.test.ts`

**Interfaces:**
- Consumes: TypeScript `Program`, `TypeChecker`, source path, source AST, and generated preference bundle.
- Produces: findings from existing `analyzeSources` interface; no new production interface.

- [ ] **Step 1: Reserve exact executable `localStorage` syntax**

Replace selected-use detection with a predicate over identifiers, string literals, and no-substitution templates. Skip type nodes, exact approved storage access descendants, and only the exact `'localStorage'` array element in `generatorEvaluatorMain`'s `blockedGlobals` declaration.

```ts
const reservedLocalStorageSyntax = (node: ts.Node): boolean => (
  ts.isIdentifier(node) && node.text === 'localStorage'
  || ts.isStringLiteralLike(node) && node.text === 'localStorage'
);
```

- [ ] **Step 2: Bind trusted reflection calls**

Use `checker.getSymbolAtLocation` to accept `Object` and `Reflect` only when unresolved to a source declaration. Resolve trusted const aliases only when initialized from the required unshadowed built-in member. Require unique top-level `generatorEvaluatorMain`, `restoreGlobalIndexedDB`, or `openWithFactory` enclosing declarations and existing exact call arguments.

```ts
const unshadowedGlobal = (node: ts.Expression, name: string): boolean => {
  const expression = unwrapExpression(node);
  return ts.isIdentifier(expression)
    && expression.text === name
    && checker.getSymbolAtLocation(expression) === undefined;
};
```

- [ ] **Step 3: Reject excluded executable edges after normalization**

Normalize query/hash-free, percent-decoded, slash-normalized relative, root, and `@/` paths against `policyPath`. Reject when resolved first segment belongs to `excludedDirectories`. Invoke for module specifiers, direct/new-URL worker arguments, and HTML/SVG `script[src]`; ignore URL-scheme and protocol-relative external resources.

```ts
const resolvedRepositoryEdge = (specifier: string): string | undefined => {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(specifier)) return undefined;
  const clean = decodeURIComponent(specifier.split(/[?#]/, 1)[0]).replace(/\\/g, '/');
  if (clean.startsWith('@/')) return posix.normalize(clean.slice(2));
  if (clean.startsWith('/')) return posix.normalize(clean.slice(1));
  return posix.normalize(posix.join(posix.dirname(policyPath), clean));
};
```

- [ ] **Step 4: Enforce exact preference and generated statement shapes**

Compare a trivia-insensitive token fingerprint for all `services/browserPreferences.ts` declarations and uses against the approved source. For onboarding, require one byte-exact generated bundle region and an exact compiled declaration whose parent is either the source file or the generated runtime's direct outer IIFE block; reject control-flow/function wrappers.

- [ ] **Step 5: Run policy test GREEN**

Run: `npx vitest run tests/unit/localWorkspaceBoundary.test.ts --maxWorkers=4`

Expected: all old and new policy cases pass in one worker and four-worker modes.

### Task 3: Expire Window Scroll Lock

**Files:**
- Modify: `tests/unit/OverlayTextEditorPadding.test.tsx`
- Modify: `components/canvas/OverlayTextEditor.tsx`

**Interfaces:**
- Consumes: input-triggered 150 ms scroll lock.
- Produces: active lock restores captured window position; expired lock no longer restores it.

- [ ] **Step 1: Write fake-timer RED assertions**

Use fake timers around the existing window scroll test. Assert one pre-expiry scroll restores `(10, 20)`, advance by 151 ms, dispatch another window scroll from `(30, 40)`, and assert `scrollTo` is not called again.

- [ ] **Step 2: Run focused test and capture RED**

Run: `npx vitest run tests/unit/OverlayTextEditorPadding.test.tsx --maxWorkers=1`

Expected: post-expiry assertion fails because `lockedWindowScrollRef.current` remains populated.

- [ ] **Step 3: Expire both lock stores**

```ts
lockBufferRef.current = setTimeout(() => {
    lockedScrollsRef.current.clear();
    lockedWindowScrollRef.current = null;
}, 150);
```

- [ ] **Step 4: Run focused test GREEN**

Run: `npx vitest run tests/unit/OverlayTextEditorPadding.test.tsx --maxWorkers=1`

Expected: padding and active/expired scroll-lock tests pass.

### Task 4: Regenerate, Verify, Report, and Commit

**Files:**
- Modify generated: `onboarding/index.html`
- Modify: `onboarding/src/content/playground.mjs`
- Create: `.superpowers/sdd/final-review-browser-preferences-fourth-correction.md`
- Include: `docs/superpowers/plans/2026-08-17-browser-preference-fourth-correction.md`

**Interfaces:**
- Consumes: corrected policy and Overlay behavior.
- Produces: reproducible generated HTML, verification evidence, correction report, and separate commit.

- [ ] **Step 1: Regenerate onboarding**

Run: `node onboarding/build.mjs`

Expected: `onboarding/index.html written (...)`; generated preference seam matches source.

- [ ] **Step 2: Run targeted and complete verification**

Run sequentially:

```bash
npx vitest run tests/unit/localWorkspaceBoundary.test.ts --maxWorkers=1
npx vitest run tests/unit/localWorkspaceBoundary.test.ts --maxWorkers=4
npx vitest run tests/unit/browserPreferences.test.ts tests/unit/OverlayTextEditorPadding.test.tsx tests/unit/onboarding/bundle.test.js tests/unit/onboarding/chrome.test.js --maxWorkers=4
npx vitest run --maxWorkers=4
npx tsc --noEmit
npm run build
git diff --check
```

Expected: all commands exit zero.

- [ ] **Step 3: Write correction report**

Record each reviewed finding, RED evidence, implementation, GREEN evidence, full verification counts, and unchanged `server/analytics.db` status in `.superpowers/sdd/final-review-browser-preferences-fourth-correction.md`.

- [ ] **Step 4: Review intended diff and commit once**

Run `git status --short`, `git diff --check`, `git diff --stat`, and inspect all intended changes. Stage only plan, policy test, Overlay source/test, generated onboarding, and report. Commit with:

```text
fix(storage): seal closed syntax boundary
```

- [ ] **Step 5: Verify post-commit state**

Run `git status --short` and `git log -1 --oneline`.

Expected: only pre-existing ` M server/analytics.db` remains; new commit is separate from `2bc9690`.

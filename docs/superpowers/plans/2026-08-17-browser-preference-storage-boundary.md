# Browser Preference Storage Boundary Plan

**Goal:** Replace direct production `localStorage` access with one closed preference module, then make repository policy reject direct browser-storage access outside approved persistence modules.

**Context:** Final Standards review showed static key reconstruction can always lag JavaScript mutation semantics. Existing migration policy must not depend on interpreting every possible expression before deciding whether production code may touch browser storage.

## Fixed invariants

- Legacy document keys remain readable only through `services/localWorkspace` migration code.
- Non-document browser preferences use a closed, runtime-validated key set.
- Production callers cannot pass arbitrary strings to browser storage.
- Migration receipt keys may vary only by the approved receipt prefix.
- Storage unavailability never crashes preference-only UI.
- Direct production `localStorage` access outside approved modules fails repository policy regardless of key construction.
- No migration, IndexedDB, cloud, analytics, or public `LocalWorkspaceStore` contract changes.

## Module interface

Create `services/browserPreferences.ts` with a closed `BrowserPreferenceKey` union covering:

- editor text defaults;
- gallery explainer dismissal;
- migration receipt IDs through dedicated receipt helpers.

Expose:

```ts
readBrowserPreference(key: BrowserPreferenceKey): string | null
writeBrowserPreference(key: BrowserPreferenceKey, value: string): boolean
wasMigrationReceiptSeen(receiptId: string): boolean
markMigrationReceiptSeen(receiptId: string): boolean
```

Implementation validates every runtime key before touching `window.localStorage`, catches browser-storage failures, and contains no legacy document key.

## Task 1: Write RED module and policy tests

- Add `tests/unit/browserPreferences.test.ts` for approved keys, receipt prefix, arbitrary/legacy runtime rejection, and unavailable storage.
- Add boundary regressions proving direct production reads/writes fail for literal, joined, mutated-array, overridden-join, aliased, and computed access.
- Prove approved modules remain the only direct-access locations and exact legacy literals stay confined to their existing two-file allowlist.

Run targeted tests and observe failure before production edits.

## Task 2: Implement and migrate callers

- Add `services/browserPreferences.ts`.
- Replace direct preference access in:
  - `components/Canvas.tsx`;
  - `components/properties/SingleElementEditor.tsx`;
  - `components/gallery/GalleryExplainer.tsx`;
  - `components/workspace/WorkspaceBootstrapGate.tsx`.
- Preserve existing preference defaults and receipt behavior.
- Keep `services/localWorkspace/index.ts` as approved legacy migration access.

## Task 3: Simplify repository policy

- Reject direct production `localStorage` member access outside:
  - `services/browserPreferences.ts`;
  - approved `services/localWorkspace` migration implementation.
- Keep existing exact-key and HTML/source discovery checks as defense in depth.
- Stop claiming unresolved mutable-array `.join` calls are statically safe; generic direct-access rejection owns that case.

## Task 4: Verify and review

Run sequentially:

```bash
npx vitest run tests/unit/browserPreferences.test.ts tests/unit/localWorkspaceBoundary.test.ts --maxWorkers=4
npx vitest run --maxWorkers=4
npx tsc --noEmit
npm run build
git diff --check
```

Then run an independent task review. Commit implementation as:

```text
refactor(storage): centralize browser preferences
```

Do not stage or restore `server/analytics.db`.

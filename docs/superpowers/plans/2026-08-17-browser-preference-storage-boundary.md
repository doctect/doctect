# Browser Preference Storage Boundary Plan

**Goal:** Replace direct production `localStorage` access with one closed preference module, then make repository policy reject reserved browser-storage and capability-acquisition syntax outside approved persistence modules and exact seams.

**Context:** Final Standards review showed static key reconstruction can always lag JavaScript mutation semantics. Existing migration policy must not depend on interpreting every possible expression before deciding whether production code may touch browser storage.

## Fixed invariants

- Legacy document keys remain readable only through `services/localWorkspace` migration code.
- Non-document browser preferences use a closed, runtime-validated key set.
- Production callers cannot pass arbitrary strings to browser storage.
- Migration receipt keys may vary only by the approved receipt prefix.
- Storage unavailability never crashes preference-only UI.
- Outside approved persistence modules and exact capability seams, repository policy rejects exact `localStorage` syntax, browser-root escapes, exact executable `defaultView`/`contentWindow`/`storageArea` member acquisition, unbound `frames`/`top`/`parent`/`opener` value use, and direct unbound `open()` calls. These sites fail even when later storage access uses a computed key.
- This is a bounded parsed-source claim, not whole-program capability analysis. Dynamic code, import maps, runtime-computed property names containing no reserved syntax, and Window capabilities supplied through parameters remain outside static semantics; encountering any reserved syntax above still requires rejection.
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
- Reject the enumerated browser-root and capability-acquisition syntax at its use or acquisition site, except exact fingerprinted production seams.
- Keep existing exact-key and HTML/source discovery checks as defense in depth.
- Do not trace aliases or evaluate property-key expressions. Stop claiming unresolved mutable-array `.join` calls, dynamic code, import maps, or supplied Window parameters are covered; reserved-syntax rejection owns only its bounded cases.

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

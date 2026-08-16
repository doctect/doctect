# IndexedDB Local Persistence Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace document-bearing `localStorage` persistence with a verified, recoverable IndexedDB workspace without silently losing, replacing, skipping, or partially migrating existing local data.

**Architecture:** Introduce one deep `LocalWorkspaceStore` module whose three-method interface owns bootstrap, semantic commits, and recovery exports. Pure preparation code validates and hashes complete legacy snapshots before a private `idb` adapter atomically copies records; React mounts the editor only after independent read-back changes the migration ledger from `copied` to `verified`. Normal editor, preset, and gallery flows issue semantic commands while the module hides IndexedDB stores, revisions, per-project queues, transaction scopes, and drift recovery.

**Tech Stack:** React 19, TypeScript 5.8, IndexedDB, `idb` 8.0.3, `fake-indexeddb` 6.2.5, Web Crypto SHA-256, Vitest/jsdom, Playwright Chromium/Firefox/WebKit.

## Global Constraints

- Source design: `docs/superpowers/specs/2026-08-14-indexeddb-local-persistence-migration-design.md`.
- Database name is exactly `doctect-local-workspace`; initial IndexedDB version is exactly `1`.
- Migration ID is exactly `local-storage-to-indexeddb-v1`; initial persistence-rollout epoch is exactly `1`.
- Migrate exactly `hype_projects`, `hype_active_project`, `hype_custom_presets`, and `hype_import_pending`.
- Legacy document keys are read-only in this cutover release. No production call may set, remove, clear, or rewrite them.
- Use one immediate, all-or-nothing cutover. No shadow-writing, lazy per-project migration, dual-writing, or silent fallback to legacy editing.
- Legacy `localStorage` remains authoritative until a complete IndexedDB copy commits, independent read-back succeeds, and ledger state becomes `verified`.
- Every data-bearing parse, migration, validation, or normalization warning stops initial migration. Valid entries are never migrated around an invalid entry.
- Hashing, schema migration, validation, and target construction occur outside active IndexedDB transactions.
- Object keys are stable-sorted for canonical hashes; array order remains meaningful.
- Project wrappers retain complete state, cloud linkage, UI revision, generator source, and unknown JSON-compatible wrapper fields.
- `storageRevision`, optional `consumedImportId`, optional `consumedImportCreatedAt`, and optional `consumedImportDigest` are private persistence metadata. None enters public `WorkspaceProject` content or its canonical digest, and `storageRevision` remains distinct from optional `WorkspaceProject.revision`.
- `MAX_STATE_BYTES` is unchanged. IndexedDB records are not compressed or split in version 1.
- Cloud commit storage, cloud quotas, and cloud synchronization behavior are unchanged; IndexedDB is not presented as backup or sync.
- No indexes are created until a real query requires one.
- Every npm install/CI command uses `--legacy-peer-deps` because the repository intentionally pins `better-sqlite3@9` while `better-auth@1.4.10` declares optional peer `better-sqlite3@^12`.
- No editor or default blank project mounts while bootstrap, verification, recovery, or storage unavailability is unresolved.
- Normal failures retain current in-memory work, report `Not saved` or `Storage conflict`, and offer JSON export.
- Hashes, names, scripts, raw values, and document content never leave the browser through analytics.
- Cleanup is intentionally excluded. Earliest cleanup is a separately approved rollout at epoch `3` or later, after this release and one following production release. This plan must ship no legacy deletion path.
- Existing unrelated untracked `.superpowers/brainstorm/` and `scratch/` files remain untouched.

## File Structure

### Public seam

- Create `services/localWorkspace/contracts.ts`: public project, snapshot, command, bootstrap, recovery, and typed-error contracts.
- Create `services/localWorkspace/LocalWorkspaceStore.ts`: deep module implementation and factory.
- Create `services/localWorkspace/index.ts`: only supported production import surface and singleton.

### Private implementation

- Create `services/localWorkspace/canonical.ts`: strict JSON compatibility, canonical serialization, SHA-256 helpers, source and target digests.
- Create `services/localWorkspace/legacy.ts`: exact four-key capture, stable reread, parsing, and filtered `storage` event monitoring.
- Create `services/localWorkspace/validation.ts`: strict project, preset, import, stored-record, and migration validation.
- Create `services/localWorkspace/schema.ts`: private IndexedDB record and ledger types plus database constants.
- Create `services/localWorkspace/indexedDbAdapter.ts`: open lifecycle, schema creation, atomic copy/read/command transactions, and compare-and-swap checks.
- Create `services/localWorkspace/migration.ts`: pure source preparation, target reconstruction, and independent verification.
- Create `services/localWorkspace/mutationQueue.ts`: one coalescing queue per project, exclusive structural-command barrier, freeze, and drain.
- Create `services/localWorkspace/recovery.ts`: raw bundle encoding and explicit changed/new legacy recovery preparation.
- Create `services/localWorkspace/faults.ts`: closed synchronous fault points used by adapter tests.

### UI and caller modules

- Create `components/workspace/WorkspaceBootstrapGate.tsx`: `/app` authority gate and live authority-loss transition.
- Create `components/workspace/WorkspaceBootstrapScreen.tsx`: named migration phases.
- Create `components/workspace/WorkspaceRecoveryScreen.tsx`: retry, export, and explicit split-brain recovery.
- Create `components/workspace/MigrationReceipt.tsx`: one-time counts, retention policy, and original-backup download.
- Create `components/workspace/LocalSaveStatus.tsx`: saving, saved, failed, and conflict states.
- Create `components/workspace/UnsavedNavigationDialog.tsx`: SPA navigation confirmation.
- Create `hooks/useWorkspaceProjectWrites.ts`: working-copy overlay and save-state generation tracking.
- Create `services/browserDownload.ts`: Blob-based JSON and recovery downloads.
- Modify `App.tsx`, `pages/EditorPage.tsx`, `components/ProjectEditor.tsx`, generated-project modals, preset modals, gallery callers, and existing tests listed in their tasks.

### Test support

- Create `tests/helpers/localWorkspaceFixtures.ts`: valid historical states, complete legacy snapshots, deterministic IDs/clocks, and store factories.
- Create `tests/helpers/fakeLocalWorkspaceStore.ts`: deterministic public-seam fake and authority event driver.
- Create `tests/e2e/fixtures/localWorkspaceMigration.js`: sole browser fixture allowed to seed document-bearing legacy keys.
- Create `tests/e2e/localWorkspaceHelpers.js`: ordinary browser setup and inspection through public store interface.

## Public Interface

Task 1 defines these names once. Later tasks import them without aliases or parallel variants.

```ts
import type { AppState } from '../../types';

export interface WorkspaceProject {
  id: string;
  name: string;
  initialState: AppState;
  cloud?: { projectId: string; lastSyncedCommitId: string };
  revision?: number;
  [unknownField: string]: unknown;
}

export interface WorkspaceCustomPreset {
  id: string;
  title: string;
  desc: string;
  color?: string;
  isCustom: true;
  initialState: AppState;
  [unknownField: string]: unknown;
}

export interface WorkspaceImportInput {
  id: string;
  targetProjectId: string;
  name: string;
  state: unknown;
  cloud?: { projectId: string; lastSyncedCommitId: string };
  createdAt: string;
}

export interface WorkspacePendingImport extends Omit<WorkspaceImportInput, 'state'> {
  state: AppState;
  warnings: string[];
}

export interface WorkspaceSnapshot {
  projects: WorkspaceProject[];
  activeProjectId: string;
  customPresets: WorkspaceCustomPreset[];
  pendingImports: WorkspacePendingImport[];
}

export type WorkspaceCommand =
  | { type: 'save-project'; project: WorkspaceProject }
  | { type: 'create-and-activate-project'; project: WorkspaceProject }
  | { type: 'activate-project'; projectId: string }
  | { type: 'close-project'; projectId: string; successor?: WorkspaceProject }
  | { type: 'save-custom-preset'; preset: WorkspaceCustomPreset }
  | { type: 'delete-custom-preset'; presetId: string }
  | { type: 'stage-import'; pendingImport: WorkspaceImportInput }
  | { type: 'consume-import'; importId: string }
  | { type: 'recover-legacy-as-copies'; recoveryId: string };

export type WorkspaceBootstrapPhase =
  | 'opening-local-storage'
  | 'checking-existing-projects'
  | 'copying-projects'
  | 'verifying-projects'
  | 'finishing-upgrade';

export interface MigrationReceipt {
  id: string;
  projectCount: number;
  customPresetCount: number;
  pendingImportPreserved: boolean;
  migratedAt: string;
}

export type RecoverySource =
  | 'legacy-current'
  | 'legacy-original'
  | 'indexeddb-workspace';

export interface WorkspaceRecovery {
  recoveryId: string;
  kind:
    | 'migration-failed'
    | 'legacy-changing'
    | 'split-brain'
    | 'unrecognized-target'
    | 'verification-failed'
    | 'unsupported-cleanup-state';
  category: string;
  message: string;
  affectedKey?: string;
  affectedItem?: string;
  availableExports: RecoverySource[];
  canRetry: boolean;
  canRecoverLegacyAsCopies: boolean;
}

export type WorkspaceBootstrapResult =
  | { status: 'ready'; snapshot: WorkspaceSnapshot; receipt?: MigrationReceipt }
  | { status: 'recovery'; recovery: WorkspaceRecovery }
  | {
      status: 'unavailable';
      message: string;
      availableExports: RecoverySource[];
    };

export interface WorkspaceBootstrapObserver {
  signal?: AbortSignal;
  onPhase?: (phase: WorkspaceBootstrapPhase) => void;
  onAuthorityLost?: (
    result: Extract<WorkspaceBootstrapResult, { status: 'recovery' | 'unavailable' }>,
  ) => void;
}

export class WorkspaceStoreError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'unavailable'
      | 'quota'
      | 'clone'
      | 'io'
      | 'validation'
      | 'conflict'
      | 'authority-lost',
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'WorkspaceStoreError';
  }
}

export interface LocalWorkspaceStore {
  bootstrap(observer?: WorkspaceBootstrapObserver): Promise<WorkspaceBootstrapResult>;
  commit(command: WorkspaceCommand): Promise<WorkspaceSnapshot>;
  exportRecoveryBundle(source: RecoverySource): Promise<Blob>;
}
```

Optional bootstrap observer keeps the approved three-method interface while supplying truthful progress and live old-tab drift. `recover-legacy-as-copies` is added to the closed command union because the approved recovery flow requires one explicit atomic resolution command.

---

### Task 1: Shared Validation, Contracts, and Canonical Digests

**Files:**
- Create: `shared/validateAppState.js`
- Create: `services/localWorkspace/contracts.ts`
- Create: `services/localWorkspace/canonical.ts`
- Create: `services/localWorkspace/legacyTypes.ts`
- Create: `services/localWorkspace/schema.ts`
- Create: `services/localWorkspace/validation.ts`
- Create: `tests/helpers/localWorkspaceFixtures.ts`
- Create: `tests/unit/localWorkspace/canonical.test.ts`
- Create: `tests/unit/localWorkspace/validation.test.ts`
- Modify: `server/validateAppState.js`
- Modify: `tests/unit/server/validateAppState.test.js`
- Modify: `onboarding/src/content/code-map.mjs`
- Modify: `onboarding/src/content/tours.mjs`
- Modify: `onboarding/src/content/playground.mjs`
- Modify: `tests/unit/onboarding/content.test.js`

**Interfaces:**
- Produces the complete public interface above.
- Produces private legacy snapshot and IndexedDB record contracts used by every later core task.
- Produces `canonicalStringify`, `sha256Hex`, `digestLegacySnapshot`, and `digestWorkspaceContent`.
- Produces strict `validateMigratedState`, `prepareProjectState`, `validateWorkspaceProject`, `validateCustomPreset`, and `preparePendingImport` functions.
- Preserves existing `server/validateAppState.js` import path by re-exporting the shared validator.

- [ ] **Step 1: Write failing canonical and validation tests**

Create `tests/helpers/localWorkspaceFixtures.ts` with a re-export of `LEGACY_KEYS` plus exported pure builders `legacySnapshot(overrides)`, `historicalState(version)`, `currentState()`, and `workspaceSnapshot(overrides?)`; every call returns a fresh deep-cloned value. Then add golden-vector coverage before implementation:

```ts
import { describe, expect, it } from 'vitest';
import {
  canonicalStringify,
  digestLegacySnapshot,
  digestWorkspaceContent,
} from '../../../services/localWorkspace/canonical';
import { LEGACY_KEYS } from '../../helpers/localWorkspaceFixtures';
import { prepareProjectState } from '../../../services/localWorkspace/validation';
import { CURRENT_SCHEMA_VERSION } from '../../../services/migration';

it('distinguishes absent and present-empty legacy keys', async () => {
  const absent = legacySnapshot({});
  const empty = legacySnapshot({ [LEGACY_KEYS.projects]: '' });
  expect(await digestLegacySnapshot(absent)).not.toBe(await digestLegacySnapshot(empty));
});

it('sorts object keys but preserves array order', () => {
  expect(canonicalStringify({ z: 1, a: { y: 2, x: 3 }, rows: ['b', 'a'] }))
    .toBe('{"a":{"x":3,"y":2},"rows":["b","a"],"z":1}');
});

it.each([undefined, NaN, Infinity, -Infinity, 1n, () => 1])(
  'rejects non-JSON value %s',
  value => expect(() => canonicalStringify({ value } as never)).toThrow(/JSON-compatible/),
);

it('rejects future project schema before loadProjectState can pass it through', () => {
  expect(() => prepareProjectState({
    ...currentState(),
    schemaVersion: CURRENT_SCHEMA_VERSION + 1,
  }, { warningPolicy: 'reject' })).toThrow(/future schema/i);
});

it('rejects every data-detaching loader warning during migration', () => {
  expect(() => prepareProjectState({
    ...historicalState(8),
    generator: { formatVersion: 2 },
  }, { warningPolicy: 'reject' })).toThrow(/detached/i);
});

it('includes order, cloud metadata, UI revisions, presets, and imports in target digest', async () => {
  const base = workspaceSnapshot();
  expect(await digestWorkspaceContent(base)).not.toBe(
    await digestWorkspaceContent({ ...base, projects: [...base.projects].reverse() }),
  );
  expect(await digestWorkspaceContent(base)).not.toBe(
    await digestWorkspaceContent({
      ...base,
      projects: [{ ...base.projects[0], revision: 9 }, ...base.projects.slice(1)],
    }),
  );
});
```

Also pin Unicode, emoji, lone-surrogate, `-0`, sparse-array, accessor, custom-prototype, cycle, duplicate ID, empty ID, active-ID mismatch, malformed cloud metadata, malformed current-schema fields, and every supported historical schema version from `0` through `11`.

- [ ] **Step 2: Run focused tests to verify RED**

Run:

```bash
npx vitest run tests/unit/localWorkspace/canonical.test.ts tests/unit/localWorkspace/validation.test.ts tests/unit/server/validateAppState.test.js tests/unit/onboarding/content.test.js
```

Expected: FAIL because local-workspace modules and shared validator do not exist.

- [ ] **Step 3: Extract the browser-safe shared AppState validator**

Move the implementation from `server/validateAppState.js` to `shared/validateAppState.js`. Replace Node-only byte counting with:

```js
const utf8ByteLength = value => new TextEncoder().encode(value).byteLength;

let serialized;
try { serialized = JSON.stringify(state); }
catch { return fail('state is not serializable'); }
if (serialized === undefined) return fail('state is not serializable');
if (utf8ByteLength(serialized) > MAX_STATE_BYTES) {
  return fail(`state exceeds ${MAX_STATE_BYTES} bytes`);
}
```

Keep every existing structural, generator, node, variant, template, layer, element, overflow, padding, and size rule unchanged. Replace `server/validateAppState.js` with:

```js
export { validateAppState } from '../shared/validateAppState.js';
export { MAX_STATE_BYTES } from '../shared/projectLimits.js';
```

Update onboarding source anchors and prose to identify `shared/validateAppState.js` as implementation and `server/validateAppState.js` as compatibility re-export. Keep server call-site count exactly three.

- [ ] **Step 4: Add public, legacy-key, and private record contracts**

Implement the public interface shown above. Put the only production legacy key literals in `legacyTypes.ts`:

```ts
export const LEGACY_KEYS = {
  projects: 'hype_projects',
  activeProject: 'hype_active_project',
  customPresets: 'hype_custom_presets',
  pendingImport: 'hype_import_pending',
} as const;

export const LEGACY_DOCUMENT_KEYS = [
  LEGACY_KEYS.projects,
  LEGACY_KEYS.activeProject,
  LEGACY_KEYS.customPresets,
  LEGACY_KEYS.pendingImport,
] as const;
export type LegacyDocumentKey = typeof LEGACY_DOCUMENT_KEYS[number];
export type LegacySnapshot = Record<LegacyDocumentKey, {
  present: boolean;
  raw: string | null;
}>;
```

Create database constants and record types in `schema.ts` without importing `idb` yet:

```ts
export const WORKSPACE_DB_NAME = 'doctect-local-workspace';
export const WORKSPACE_DB_VERSION = 1;
export const WORKSPACE_MIGRATION_ID = 'local-storage-to-indexeddb-v1';
export const PERSISTENCE_ROLLOUT_EPOCH = 1;

export interface StoredProject {
  id: string;
  project: WorkspaceProject;
  storageRevision: number;
  updatedAt: string;
  consumedImportId?: string;
  consumedImportCreatedAt?: string;
  consumedImportDigest?: string;
}

export interface StoredWorkspace {
  id: 'current';
  projectOrder: string[];
  activeProjectId: string;
  revision: number;
}

export interface StoredPreset {
  id: string;
  preset: WorkspaceCustomPreset;
  position: number;
}

export interface StoredPendingImport {
  id: string;
  pendingImport: WorkspacePendingImport;
  position: number;
}

export interface KeyFingerprint {
  key: LegacyDocumentKey;
  present: boolean;
  digest: string;
}

export interface ItemFingerprint {
  sourceIndex: number;
  id: string;
  digest: string;
}

export interface RecoveryMarker {
  id: string;
  kind: 'legacy-drift' | 'target-mismatch' | 'unknown-target';
  detectedAt: string;
  observedLegacyDigest?: string;
}

export interface MigrationLedger {
  id: 'local-storage-to-indexeddb-v1';
  indexedDbVersion: 1;
  state: 'copied' | 'verified' | 'cleanup-started' | 'cleanup-complete';
  origin: 'legacy' | 'native';
  ledgerRevision: number;
  sourceDigest: string;
  expectedTargetDigest: string;
  acceptedLegacyDigest: string;
  originalLegacyBackupId: string;
  acceptedLegacyBackupId: string;
  keyFingerprints: KeyFingerprint[];
  projectFingerprints: ItemFingerprint[];
  presetFingerprints: ItemFingerprint[];
  counts: {
    sourceProjects: number;
    targetProjects: number;
    customPresets: number;
    pendingImports: number;
  };
  migratedAt: string;
  verifiedAt: string | null;
  persistenceRolloutEpoch: 1;
  unresolvedRecovery: RecoveryMarker | null;
}

export interface LegacyBackupRecord {
  id: string;
  kind: 'original' | 'conflict';
  capturedAt: string;
  snapshot: LegacySnapshot;
  digest: string;
}
```

- [ ] **Step 5: Add strict canonical serialization**

In `canonical.ts`, expose:

```ts
export function canonicalStringify(value: unknown): string;
export async function sha256Hex(
  value: string,
  subtle?: SubtleCrypto,
): Promise<string>;
export async function digestLegacySnapshot(
  snapshot: LegacySnapshot,
  subtle?: SubtleCrypto,
): Promise<string>;
export async function digestWorkspaceContent(
  snapshot: WorkspaceSnapshot,
  subtle?: SubtleCrypto,
): Promise<string>;
```

`canonicalStringify` must recursively inspect property descriptors, reject getters/setters, symbols, custom prototypes, sparse arrays, cycles, non-finite numbers, `BigInt`, functions, and `undefined`, cap nesting at 512, normalize `-0` to `0`, stable-sort object keys, and preserve array order. Hash helpers default `subtle` to `globalThis.crypto.subtle`; the store passes its injected `environment.crypto.subtle`. `sha256Hex` uses `subtle.digest('SHA-256', new TextEncoder().encode(value))` and lowercase two-character hex bytes.

Use this exact source envelope order:

```ts
{
  format: 'doctect-legacy-source',
  version: 1,
  entries: LEGACY_DOCUMENT_KEYS.map(key => ({
    key,
    present: snapshot[key].present,
    raw: snapshot[key].present ? snapshot[key].raw : null,
  })),
}
```

Use this logical target envelope, excluding storage revisions and timestamps:

```ts
{
  format: 'doctect-indexeddb-workspace',
  version: 1,
  projectOrder: snapshot.projects.map(project => project.id),
  projects: snapshot.projects,
  activeProjectId: snapshot.activeProjectId,
  customPresets: snapshot.customPresets,
  pendingImports: snapshot.pendingImports.map(({ createdAt: _createdAt, ...pending }) => pending),
}
```

Only persistence-level timestamps/revisions are excluded. Nested project/preset/import state remains complete, including document fields such as generator `generatedAt` and existing `WorkspaceProject.revision`.

- [ ] **Step 6: Implement strict migration validation**

`prepareProjectState(raw, { warningPolicy })` must:

1. Require a plain JSON-compatible object.
2. Treat missing `schemaVersion` as historical version `0`.
3. Reject non-integer, negative, or future schema versions.
4. For schema `10` or newer, validate source before migration so malformed current fields cannot be silently normalized.
5. Call `loadProjectState(raw)` on a clone.
6. Reject every warning when `warningPolicy === 'reject'`.
7. Require output schema `CURRENT_SCHEMA_VERSION` and pass shared structural validation.
8. Re-run strict JSON compatibility on output.

`validateWorkspaceProject` must require a non-empty string `id`, a string `name` (empty names remain preserved), exact cloud strings when present, finite non-negative integer `revision` when present, and valid prepared state while preserving unknown JSON-compatible wrapper fields. `validateCustomPreset` requires a unique non-empty ID, string title/description, `isCustom: true`, and a valid state. `preparePendingImport(input, { warningPolicy })` requires non-empty IDs, a string name, ISO timestamp, and valid cloud metadata, then prepares its state and returns a `WorkspacePendingImport` containing the resulting `AppState` and warnings.

- [ ] **Step 7: Run focused tests to verify GREEN**

Run:

```bash
npx vitest run tests/unit/localWorkspace/canonical.test.ts tests/unit/localWorkspace/validation.test.ts tests/unit/server/validateAppState.test.js tests/unit/onboarding/content.test.js
```

Expected: all focused tests PASS; server validator behavior and call-site guards remain unchanged.

- [ ] **Step 8: Commit**

```bash
git add shared/validateAppState.js server/validateAppState.js services/localWorkspace/contracts.ts services/localWorkspace/legacyTypes.ts services/localWorkspace/schema.ts services/localWorkspace/canonical.ts services/localWorkspace/validation.ts tests/helpers/localWorkspaceFixtures.ts tests/unit/localWorkspace/canonical.test.ts tests/unit/localWorkspace/validation.test.ts tests/unit/server/validateAppState.test.js onboarding/src/content/code-map.mjs onboarding/src/content/tours.mjs onboarding/src/content/playground.mjs tests/unit/onboarding/content.test.js
git commit -m "feat(storage): add validation and digest contracts"
```

---

### Task 2: Exact Legacy Capture and Migration Preparation

**Files:**
- Create: `services/localWorkspace/legacy.ts`
- Create: `services/localWorkspace/migration.ts`
- Modify: `tests/helpers/localWorkspaceFixtures.ts`
- Create: `tests/unit/localWorkspace/legacy.test.ts`
- Create: `tests/unit/localWorkspace/migrationPreparation.test.ts`

**Interfaces:**
- Consumes Task 1 contracts, canonical hashes, and strict validators.
- Produces `captureLegacySnapshot`, `captureStableLegacySnapshot`, `monitorLegacyKeys`, `prepareInitialCopy`, `reconstructWorkspace`, and `verifyPreparedCopy`.
- Produces complete target records for Task 3 without opening IndexedDB.

- [ ] **Step 1: Write failing exact-capture and preparation tests**

Use a `MemoryStorage` test adapter rather than jsdom global storage:

```ts
import { LEGACY_KEYS } from '../../helpers/localWorkspaceFixtures';

it('captures key presence separately from exact raw text', async () => {
  const storage = memoryStorage({
    [LEGACY_KEYS.projects]: ' [{"name":"Café ☕"}]\r\n',
    [LEGACY_KEYS.activeProject]: '',
  });
  const snapshot = captureLegacySnapshot(storage);
  expect(snapshot[LEGACY_KEYS.projects]).toEqual({
    present: true,
    raw: ' [{"name":"Café ☕"}]\r\n',
  });
  expect(snapshot[LEGACY_KEYS.activeProject]).toEqual({ present: true, raw: '' });
  expect(snapshot[LEGACY_KEYS.customPresets]).toEqual({ present: false, raw: null });
});

it('stops when source changes during preparation', async () => {
  const storage = changingStorage(validLegacyValues(), {
    afterRead: 4,
    key: LEGACY_KEYS.projects,
    value: JSON.stringify([secondProject()]),
  });
  await expect(captureStableLegacySnapshot(storage, prepareInitialCopy))
    .rejects.toMatchObject({ category: 'legacy-changing' });
});

it.each([
  [LEGACY_KEYS.projects, ''],
  [LEGACY_KEYS.projects, '{'],
  [LEGACY_KEYS.projects, '{}'],
  [LEGACY_KEYS.customPresets, '[{"id":"same"},{"id":"same"}]'],
  [LEGACY_KEYS.pendingImport, 'null'],
])('rejects invalid legacy %s without producing target records', async (key, raw) => {
  const source = legacySnapshot({ ...validLegacyValues(), [key]: raw });
  await expect(prepareInitialCopy(source, deterministicEnvironment()))
    .rejects.toMatchObject({ affectedKey: key });
});
```

Add assertions for one/many projects, all historical state versions, order, active project, Unicode/emoji, generator source, cloud fields, revisions, ordered presets, pending import, duplicate/empty IDs, malformed project/preset state, future schema, every loader warning, presets-only source, and all-four-keys-absent native initialization.

- [ ] **Step 2: Run tests to verify RED**

```bash
npx vitest run tests/unit/localWorkspace/legacy.test.ts tests/unit/localWorkspace/migrationPreparation.test.ts
```

Expected: FAIL because capture and preparation modules do not exist.

- [ ] **Step 3: Implement read-only legacy capture and monitoring**

Import Task 1's sole key definitions into `legacy.ts`:

```ts
import {
  LEGACY_DOCUMENT_KEYS,
  type LegacyDocumentKey,
  type LegacySnapshot,
} from './legacyTypes';
```

`captureLegacySnapshot(storage)` calls `getItem` exactly once per key in constant order and never calls `setItem`, `removeItem`, or `clear`. `captureStableLegacySnapshot` captures once, prepares/hashes outside storage reads, captures again, and rejects unless both exact source digests match. `monitorLegacyKeys` listens only for `StorageEvent.key === null` or one of the four exact keys and returns an unsubscribe function.

- [ ] **Step 4: Implement strict source parsing and in-memory target construction**

Use exact parsing rules:

- A present empty JSON-bearing key is invalid JSON; an empty active-project key behaves as absent.
- Missing projects or an empty projects array means zero migrated projects. After preserving the source snapshot, target construction creates one fresh blank project so the verified native workspace is usable.
- `hype_projects` must be an array of complete wrappers with unique non-empty IDs.
- `hype_active_project`, when non-empty, must resolve to a source project; when absent/empty, activate the first source project or the freshly created blank project.
- `hype_custom_presets` must be an array with unique non-empty IDs and valid complete states.
- `hype_import_pending` must be one object. Give it stable ID `legacy-import-v1` and deterministic target project ID `proj_migrated_import_<first 16 source-digest hex characters>`; if that ID already exists, append the first collision-free numeric suffix in source-independent ascending order.
- Preserve project and preset source order with explicit positions in target records.
- Run every project, preset, and pending state through `prepareProjectState(..., { warningPolicy: 'reject' })` before creating any target record.
- Preserve unknown JSON-compatible wrapper fields with object spread; replace only migrated `initialState`/`state` fields.
- Build exact per-key, per-project, and per-preset source fingerprints before any transaction.

Define pure preparation output:

```ts
export interface PreparedInitialCopy {
  origin: 'legacy' | 'native';
  source: LegacySnapshot;
  sourceDigest: string;
  targetDigest: string;
  projects: StoredProject[];
  workspace: StoredWorkspace;
  presets: StoredPreset[];
  pendingImports: StoredPendingImport[];
  backup: LegacyBackupRecord;
  ledger: MigrationLedger;
  receipt?: MigrationReceipt;
}
```

All initial `storageRevision` and workspace `revision` values are `0`; ledger state is `copied`, never `verified`. Initial ledger `originalLegacyBackupId` and `acceptedLegacyBackupId` both equal the exact backup record ID.

- [ ] **Step 5: Implement reconstruction and independent verification**

`reconstructWorkspace(records)` must reject missing/extra/duplicate records, invalid positions, order references, active-ID mismatch, malformed states, negative or non-integer revisions, and unknown pending payload shapes. It returns one ordered `WorkspaceSnapshot`.

`verifyPreparedCopy(prepared, records, currentLegacy)` must compare:

```ts
{
  targetDigest: await digestWorkspaceContent(reconstructed),
  sourceDigest: await digestLegacySnapshot(currentLegacy),
  projectCount: records.projects.length,
  presetCount: records.presets.length,
  pendingImportCount: records.pendingImports.length,
  projectOrder: records.workspace.projectOrder,
  activeProjectId: records.workspace.activeProjectId,
}
```

against ledger expectations. It returns the reconstructed snapshot only when every comparison succeeds.

- [ ] **Step 6: Run focused tests**

```bash
npx vitest run tests/unit/localWorkspace/legacy.test.ts tests/unit/localWorkspace/migrationPreparation.test.ts tests/unit/loadProjectState.test.ts tests/unit/migration.test.ts
```

Expected: all focused tests PASS, including every historical project migration.

- [ ] **Step 7: Commit**

```bash
git add services/localWorkspace/legacy.ts services/localWorkspace/migration.ts tests/helpers/localWorkspaceFixtures.ts tests/unit/localWorkspace/legacy.test.ts tests/unit/localWorkspace/migrationPreparation.test.ts
git commit -m "feat(storage): prepare exact legacy migration"
```

---

### Task 3: IndexedDB Schema and Atomic Adapter

**Files:**
- Modify: `services/localWorkspace/schema.ts`
- Create: `services/localWorkspace/faults.ts`
- Create: `services/localWorkspace/indexedDbAdapter.ts`
- Create: `tests/unit/localWorkspace/indexedDbAdapter.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes `PreparedInitialCopy` and private record types.
- Produces `createIndexedDbAdapter(environment)` with semantic copy, read, ledger-transition, and command transactions.
- Keeps `idb` database/store names private from every React and caller module.

- [ ] **Step 1: Install pinned IndexedDB dependencies**

Run:

```bash
npm install --legacy-peer-deps idb@8.0.3
npm install --legacy-peer-deps --save-dev fake-indexeddb@6.2.5
```

Expected: `package.json` and `package-lock.json` add exactly these packages; no other direct dependency changes.

- [ ] **Step 2: Write failing schema, lifecycle, race, and fault tests**

Each test gets a fresh `new IDBFactory()` from `fake-indexeddb`:

```ts
it('creates exactly six stores and no indexes', async () => {
  const adapter = createTestAdapter();
  await adapter.open();
  const schema = await adapter.describeSchema();
  expect(schema).toEqual({
    projects: [],
    workspace: [],
    presets: [],
    pendingImports: [],
    migrationLedger: [],
    legacyBackup: [],
  });
});

it.each(COPY_TRANSACTION_FAULTS)(
  'aborts the whole initial copy at %s',
  async faultPoint => {
    const adapter = createTestAdapter({ faultPoint });
    await expect(adapter.writeInitialCopy(preparedCopy())).rejects.toThrow();
    expect(await adapter.inspect()).toEqual(emptyInspection());
  },
);

it('lets only one concurrent tab create the initial copy', async () => {
  const indexedDB = new IDBFactory();
  const left = createTestAdapter({ indexedDB });
  const right = createTestAdapter({ indexedDB });
  await Promise.all([left.open(), right.open()]);
  const results = await Promise.all([
    left.writeInitialCopy(preparedCopy()),
    right.writeInitialCopy(preparedCopy()),
  ]);
  expect(results.map(result => result.status).sort())
    .toEqual(['copied', 'existing-ledger']);
});
```

Cover `QuotaExceededError`, `DataCloneError`, generic I/O failure, explicit abort, blocked open, terminated connection, `versionchange`, orphan target records, copied-ledger CAS, stale project revision, stale workspace revision, and transaction completion before result resolution.

- [ ] **Step 3: Run adapter tests to verify RED**

```bash
npx vitest run tests/unit/localWorkspace/indexedDbAdapter.test.ts
```

Expected: FAIL because adapter and database mapping do not exist.

- [ ] **Step 4: Map Task 1 records to the exact IndexedDB schema**

Append the private `DBSchema` mapping to `schema.ts`; do not change Task 1 record shapes:

```ts
import type { DBSchema } from 'idb';

export interface LocalWorkspaceDatabase extends DBSchema {
  projects: { key: string; value: StoredProject };
  workspace: { key: 'current'; value: StoredWorkspace };
  presets: { key: string; value: StoredPreset };
  pendingImports: { key: string; value: StoredPendingImport };
  migrationLedger: { key: typeof WORKSPACE_MIGRATION_ID; value: MigrationLedger };
  legacyBackup: { key: string; value: LegacyBackupRecord };
}
```

Object-store key paths are `id`; singleton workspace key is `'current'`.

- [ ] **Step 5: Implement open lifecycle and atomic initial copy**

Use `openDB<LocalWorkspaceDatabase>(name, 1, { upgrade, blocked, blocking, terminated })`. `upgrade` creates only missing version-1 stores. Wrap the open promise in an event-driven race: `blocked` rejects a private deferred with `new WorkspaceStoreError('IndexedDB upgrade is blocked.', 'unavailable')`; if the underlying open later resolves, close that stale connection immediately. Do not use an arbitrary timeout. `blocking` closes the active connection and reports authority loss. `terminated` reports storage unavailability.

`writeInitialCopy` opens one read-write transaction across all six stores, reads the ledger and store counts first, and behaves exactly as follows:

- recognized ledger exists: return `existing-ledger` without writes;
- any target record exists without recognized ledger: return `orphaned-target` without clearing anything;
- all stores empty: queue every project, workspace, preset, pending import, exact backup, and `copied` ledger in the same transaction;
- any request/fault failure: abort and reject;
- resolve only after transaction completion.

Fault hooks inside a transaction are synchronous and use this closed union:

```ts
export type WorkspaceFaultPoint =
  | 'copy.before-transaction'
  | 'copy.after-projects'
  | 'copy.after-workspace'
  | 'copy.after-presets'
  | 'copy.after-pending-imports'
  | 'copy.after-backup'
  | 'copy.after-ledger'
  | 'copy.before-complete'
  | 'mutation.before-complete'
  | 'recovery.before-complete';
```

- [ ] **Step 6: Implement independent reads and compare-and-swap mutations**

Add separate read-only transactions for full record reconstruction and exact backup reads. `markVerified` runs a new small transaction, requires matching ledger state `copied`, revision, source digest, and expected target digest, then writes state `verified`, `verifiedAt`, and incremented ledger revision.

Every normal mutation transaction reads ledger first and rejects unless `state === 'verified'` and `unresolvedRecovery === null`. Project saves compare private expected `storageRevision`; structural commands compare private expected workspace revision. Convert DOM errors to stable error codes: quota, clone, conflict, unavailable, or I/O.

- [ ] **Step 7: Run focused adapter tests**

```bash
npx vitest run tests/unit/localWorkspace/indexedDbAdapter.test.ts
```

Expected: all schema, lifecycle, atomicity, and fault tests PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json services/localWorkspace/schema.ts services/localWorkspace/faults.ts services/localWorkspace/indexedDbAdapter.ts tests/unit/localWorkspace/indexedDbAdapter.test.ts
git commit -m "feat(storage): add atomic indexeddb adapter"
```

---

### Task 4: Bootstrap, Copy, and Independent Verification State Machine

**Files:**
- Create: `services/localWorkspace/LocalWorkspaceStore.ts`
- Create: `services/localWorkspace/index.ts`
- Create: `tests/unit/localWorkspace/bootstrap.test.ts`

**Interfaces:**
- Consumes Task 2 preparation and Task 3 adapter.
- Produces `createLocalWorkspaceStore(environment)` and singleton `localWorkspaceStore`.
- Implements `bootstrap(observer?)` through `none -> copied -> verified` without exposing records or revisions.

- [ ] **Step 1: Write failing bootstrap state-machine tests**

```ts
it('never returns ready before independent read-back and verified CAS', async () => {
  const events: string[] = [];
  const store = createTestStore({
    onAdapterCall: call => events.push(call),
  });
  const result = await store.bootstrap();
  expect(events).toEqual([
    'open',
    'inspect',
    'capture-legacy',
    'prepare-copy',
    'write-copied',
    'read-all-separate-transaction',
    'rehash-legacy',
    'mark-verified',
  ]);
  expect(result.status).toBe('ready');
});

it('resumes a committed copied ledger after a crash', async () => {
  const environment = sharedTestEnvironment();
  const first = createTestStore({ ...environment, faultAfterCopyCommit: true });
  await expect(first.bootstrap()).rejects.toThrow('fault after committed copy');
  const second = createTestStore(environment);
  await expect(second.bootstrap()).resolves.toMatchObject({ status: 'ready' });
  expect(await environment.adapter.countLedgers()).toBe(1);
});

it('returns recovery for target records without a recognized ledger', async () => {
  const store = createTestStore({ seedTargetWithoutLedger: true });
  await expect(store.bootstrap()).resolves.toMatchObject({
    status: 'recovery',
    recovery: { kind: 'unrecognized-target' },
  });
});
```

Cover all-absent native initialization, presets-only data, one/many projects, legacy mutation before/during/after preparation, copy faults, read-back mismatch, source mismatch after copy, idempotent retry, two concurrent new-version stores, copied ledger reload, verified reload, unknown ledger, cleanup states, blocked open, unavailable IDB, and default project creation only inside the copied transaction.

- [ ] **Step 2: Run bootstrap tests to verify RED**

```bash
npx vitest run tests/unit/localWorkspace/bootstrap.test.ts
```

Expected: FAIL because store factory does not exist.

- [ ] **Step 3: Implement injected environment and private authority state**

Use an internal environment so tests control every side effect:

```ts
export interface LocalWorkspaceEnvironment {
  indexedDB: IDBFactory;
  legacyStorage: Pick<Storage, 'getItem'>;
  addStorageListener(listener: (event: StorageEvent) => void): () => void;
  crypto: Crypto;
  now(): string;
  randomUUID(): string;
  createBlankProject(): AppState;
  fault?: FaultInjector;
}
```

Production defaults use `window.indexedDB`, `window.localStorage`, `window.addEventListener('storage', ...)`, `globalThis.crypto`, `new Date().toISOString()`, `crypto.randomUUID()`, and `createBlankProject`. Private authority states are `cold | bootstrapping | ready | frozen | recovery | unavailable`; `commit` accepts writes only in `ready`.

Install `monitorLegacyKeys` before the first legacy read and retain it through the store lifetime. During bootstrap, record matching events and require the final retained-source rehash to match the prepared source; a changed digest returns `legacy-changing`/verification recovery before authority can switch.

- [ ] **Step 4: Implement the exact bootstrap decision table**

```text
No ledger + all target stores empty + all legacy keys absent
  -> prepare native blank workspace and exact all-absent backup as copied
No ledger + all target stores empty + any legacy key present
  -> stable capture, strict prepare, atomic copied transaction
No ledger + any target record
  -> recovery: unrecognized-target
copied + matching retained legacy
  -> independent read, reconstruct, digest/count/order checks, mark verified
copied + any mismatch
  -> recovery: verification-failed
verified + no recovery + accepted legacy digest + valid target
  -> ready
verified + changed legacy digest
  -> recovery: split-brain
verified + unresolved recovery
  -> return stored recovery
cleanup-started or cleanup-complete at rollout epoch 1
  -> recovery: unsupported-cleanup-state; never delete keys
unknown/malformed ledger
  -> recovery: unrecognized-target
```

`expectedTargetDigest` is a copy-verification checkpoint only. After normal verified edits, bootstrap validates current records, order, active ID, revisions, and referential integrity but does not compare current logical content to the migration-era target digest.

Emit phases in order with duplicate phase notifications suppressed:

```ts
observer?.onPhase?.('opening-local-storage');
observer?.onPhase?.('checking-existing-projects');
observer?.onPhase?.('copying-projects');
observer?.onPhase?.('verifying-projects');
observer?.onPhase?.('finishing-upgrade');
```

Native initialization follows the same `copied`, separate read-back, and `verified` sequence but returns no migration receipt. Legacy origin returns a receipt containing source project count, source custom-preset count, pending-import presence, and migration timestamp. Receipt ID is stable: `local-storage-to-indexeddb-v1:${ledger.sourceDigest}`; every verified bootstrap can reconstruct it, while Task 7's preference decides whether UI has already shown it.

- [ ] **Step 5: Make bootstrap concurrency and retry deterministic**

Cache only an in-flight bootstrap promise and a successful ready snapshot. A recovery or unavailable result may be retried and never leaves a rejected promise cached. Register each supplied observer before returning either in-flight or cached-ready data, so a gallery-triggered cold bootstrap can later gain the `/app` gate's authority-loss observer. If another tab wins initial copy, reread its recognized ledger and follow that ledger rather than writing. Observer callbacks check `signal?.aborted` before firing. Multiple callers share one in-flight operation but each active observer receives later phases and authority loss.

- [ ] **Step 6: Run bootstrap and prior core suites**

```bash
npx vitest run tests/unit/localWorkspace/bootstrap.test.ts tests/unit/localWorkspace/migrationPreparation.test.ts tests/unit/localWorkspace/indexedDbAdapter.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 7: Commit**

```bash
git add services/localWorkspace/LocalWorkspaceStore.ts services/localWorkspace/index.ts tests/unit/localWorkspace/bootstrap.test.ts
git commit -m "feat(storage): verify workspace bootstrap"
```

---

### Task 5: Semantic Commands, Private Revisions, and Coalescing Queues

**Files:**
- Create: `services/localWorkspace/mutationQueue.ts`
- Create: `tests/unit/localWorkspace/commit.test.ts`
- Modify: `services/localWorkspace/schema.ts`
- Modify: `services/localWorkspace/migration.ts`
- Modify: `services/localWorkspace/indexedDbAdapter.ts`
- Modify: `services/localWorkspace/LocalWorkspaceStore.ts`

**Interfaces:**
- Consumes verified store state from Task 4.
- Produces every normal `WorkspaceCommand` except recovery.
- Keeps expected project/workspace revisions and debounce timing private.

- [ ] **Step 1: Write failing command and queue tests**

```ts
it('coalesces rapid saves and persists only the newest project', async () => {
  vi.useFakeTimers();
  const store = await readyStore();
  const first = store.commit({ type: 'save-project', project: projectNamed('A') });
  const second = store.commit({ type: 'save-project', project: projectNamed('B') });
  await vi.advanceTimersByTimeAsync(1_000);
  await Promise.all([first, second]);
  expect(await readStoredProjectName(store, 'project-1')).toBe('B');
  expect(transactionCount(store, 'save-project')).toBe(1);
});

it('serializes an edit that arrives during an in-flight save', async () => {
  const deferred = deferFirstProjectTransaction();
  const store = await readyStore({ deferred });
  const first = store.commit({ type: 'save-project', project: projectNamed('A') });
  await deferred.started;
  const second = store.commit({ type: 'save-project', project: projectNamed('B') });
  deferred.resolve();
  await Promise.all([first, second]);
  expect(await readStoredProjectName(store, 'project-1')).toBe('B');
});

it('consumes one import exactly once', async () => {
  const store = await readyStore({ pendingImports: [pendingImport('import-1')] });
  const first = await store.commit({ type: 'consume-import', importId: 'import-1' });
  const second = await store.commit({ type: 'consume-import', importId: 'import-1' });
  expect(first.projects.filter(project => project.id === 'target-1')).toHaveLength(1);
  expect(second.projects.filter(project => project.id === 'target-1')).toHaveLength(1);
  expect(second.pendingImports).toEqual([]);
});
```

Cover create-and-activate atomicity, activate validation, close with existing successor, close-last with supplied blank successor, close canceling a queued-but-not-started save without resurrection, save/delete preset order, stage import order and warnings, quota/clone/I/O rollback, stale same-version-tab project save, stale workspace command, post-commit read-back failure freezing authority, restart-safe consume idempotency, failed command leaving cached snapshot unchanged, and commands rejected before `verified` or after freeze.

- [ ] **Step 2: Run command tests to verify RED**

```bash
npx vitest run tests/unit/localWorkspace/commit.test.ts
```

Expected: FAIL because semantic command transactions and queues are incomplete.

- [ ] **Step 3: Implement private keyed queues**

Expose no queue type from the public index. Internal interface:

```ts
interface MutationQueue {
  enqueueProjectSave(project: WorkspaceProject): Promise<WorkspaceSnapshot>;
  runExclusive(command: Exclude<WorkspaceCommand, { type: 'save-project' }>): Promise<WorkspaceSnapshot>;
  freeze(): void;
  drain(): Promise<void>;
  hasPending(): boolean;
}
```

For each project, retain one queued latest value and all callers waiting for it. Start a 1,000 ms timer when idle; replacement before start coalesces. If a save is in flight, retain exactly one next value. Assign expected storage revisions from the last independently validated record and increment only after successful transactions. Exclusive structural commands normally drain project saves first. `close-project` cancels the target project's queued-but-not-started save, waits for any already-started save, runs deletion, and resolves canceled save callers with the post-close snapshot so no delayed write can recreate the project.

- [ ] **Step 4: Implement semantic adapter transactions**

Exact transaction scopes and outcomes:

- `save-project`: `projects` + `migrationLedger`; compare storage revision, replace one record, increment revision.
- `create-and-activate-project`: `projects` + `workspace` + ledger; require unique project ID, append order, activate atomically.
- `activate-project`: `projects` + `workspace` + ledger; require target exists, update active ID/revision atomically.
- `close-project`: `projects` + `workspace` + ledger; delete target, remove order entry, activate previous remaining project; if no project remains, require supplied successor and create/activate it in the same transaction.
- `save-custom-preset`: `presets` + ledger; preserve existing position or append after current maximum.
- `delete-custom-preset`: `presets` + ledger; delete and rewrite later positions contiguously in one transaction.
- `stage-import`: call `preparePendingImport(input, { warningPolicy: 'retain' })` outside the transaction, then use `pendingImports` + ledger; reject duplicate import/target IDs, persist normalized `AppState` plus warnings, and append position.
- `consume-import`: prepare and validate the target project outside the transaction from the cached pending import, then use `pendingImports` + `projects` + `workspace` + ledger. Re-read and compare the pending payload inside the transaction, create the prepared target with private `consumedImportId`, append/activate, and delete pending atomically. If pending is absent, scan stored projects for exactly one matching `consumedImportId` and return the current snapshot as restart-safe idempotent success; reject missing or ambiguous provenance. `consumedImportId` never enters the public project wrapper or workspace digest.

Every transaction rechecks verified authority and private expected revision. Read the complete post-command workspace after commit, validate it, update private revision maps, then resolve callers with a clone.

- [ ] **Step 5: Map failures without hiding in-memory work**

Map adapter errors to `WorkspaceStoreError`. A private revision mismatch becomes `conflict`; old-tab authority loss becomes `authority-lost`; no conflict retries occur automatically. Failed transactions leave private cached snapshot and expected revisions unchanged.

- [ ] **Step 6: Run focused command tests**

```bash
npx vitest run tests/unit/localWorkspace/commit.test.ts tests/unit/localWorkspace/indexedDbAdapter.test.ts tests/unit/localWorkspace/bootstrap.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 7: Commit**

```bash
git add services/localWorkspace/mutationQueue.ts services/localWorkspace/schema.ts services/localWorkspace/migration.ts services/localWorkspace/indexedDbAdapter.ts services/localWorkspace/LocalWorkspaceStore.ts tests/unit/localWorkspace/commit.test.ts
git commit -m "feat(storage): add atomic workspace commands"
```

---

### Task 6: Old-Tab Drift, Recovery Bundles, and Explicit Recovery Copies

**Files:**
- Create: `services/localWorkspace/recovery.ts`
- Create: `tests/unit/localWorkspace/drift.test.ts`
- Create: `tests/unit/localWorkspace/recovery.test.ts`
- Modify: `services/localWorkspace/legacy.ts`
- Modify: `services/localWorkspace/indexedDbAdapter.ts`
- Modify: `services/localWorkspace/LocalWorkspaceStore.ts`

**Interfaces:**
- Consumes freeze/drain and accepted backup metadata.
- Produces live authority-loss callbacks, all three `RecoverySource` exports, and `recover-legacy-as-copies`.
- Preserves both authorities; no automatic winner or merge exists.

- [ ] **Step 1: Write failing drift and exact-bundle tests**

```ts
it('drains already-pending saves, rejects new writes, and reports old-tab drift', async () => {
  const authorityLost = vi.fn();
  const store = await readyStore({ authorityLost });
  const pending = store.commit({ type: 'save-project', project: projectNamed('latest') });
  writeLegacyFromOtherTab({ [LEGACY_KEYS.projects]: JSON.stringify([oldTabProject()]) });
  await pending;
  await waitFor(() => expect(authorityLost).toHaveBeenCalled());
  await expect(store.commit({ type: 'save-project', project: projectNamed('newer') }))
    .rejects.toMatchObject({ code: 'authority-lost' });
});

it('round-trips every raw legacy value byte-identically', async () => {
  const store = await migratedStore(unicodeRawLegacyValues());
  const blob = await store.exportRecoveryBundle('legacy-original');
  const bundle = JSON.parse(await blob.text());
  expect(decodeLegacyRecoveryBundle(bundle)).toEqual(captureLegacySnapshot(sourceStorage));
});

it('recovers only changed and new records as local copies', async () => {
  const store = await migratedStore(originalLegacyValues());
  writeLegacyFromOtherTab(changedLegacyValues());
  const recovery = await waitForRecovery(store);
  const snapshot = await store.commit({
    type: 'recover-legacy-as-copies',
    recoveryId: recovery.recoveryId,
  });
  const recovered = snapshot.projects.filter(project => project.name.startsWith('Recovered — '));
  expect(recovered).toHaveLength(2);
  expect(recovered.every(project => project.cloud === undefined)).toBe(true);
  expect(snapshot.projects.find(project => project.id === 'deleted-by-old-tab')).toBeDefined();
});
```

Cover drift before snapshot, during preparation, after copy, after verification, missed event caught on reload, `StorageEvent.key === null`, byte-identical rewrite, malformed changed legacy source, current/original/IndexedDB exports, project/preset/import ID collisions, cloud removal, deletions ignored, active-only drift, recurrent drift after resolution, transaction abort, and connection `versionchange`.

- [ ] **Step 2: Run recovery suites to verify RED**

```bash
npx vitest run tests/unit/localWorkspace/drift.test.ts tests/unit/localWorkspace/recovery.test.ts
```

Expected: FAIL because drift freeze and recovery functions do not exist.

- [ ] **Step 3: Implement drift freeze and persisted recovery marker**

On a matching storage event:

1. Change private authority from `ready` to `frozen` synchronously.
2. Freeze queues against new enqueue/commit requests. Saves already queued or in flight remain drainable and may start transactions.
3. Drain every save that was already queued or in flight when authority froze.
4. Capture and hash all four current legacy values.
5. If digest still equals accepted digest, return to ready; otherwise atomically set ledger `unresolvedRecovery` with recovery ID, detected timestamp, and observed digest.
6. Call active observer `onAuthorityLost` with split-brain recovery.

Every bootstrap also rehashes retained legacy values, so missed events enter the same recovery path. `versionchange` closes the database, freezes writes, and reports unavailable without touching either source.

- [ ] **Step 4: Implement exact recovery bundle formats**

Legacy bundle:

```ts
interface LegacyRecoveryBundle {
  format: 'doctect.legacy-workspace-recovery';
  version: 1;
  capturedAt: string;
  entries: Array<{ key: LegacyDocumentKey; present: boolean; raw: string | null }>;
  digest: string;
}
```

IndexedDB bundle:

```ts
interface IndexedDbRecoveryBundle {
  format: 'doctect.indexeddb-workspace-recovery';
  version: 1;
  capturedAt: string;
  workspace: WorkspaceSnapshot;
}
```

`legacy-current` uses a stable double capture of live raw values and rejects with a retryable `legacy-changing` issue rather than exporting a mixed read; `legacy-original` always reads ledger `originalLegacyBackupId`; `indexeddb-workspace` independently reads and validates current target records. `acceptedLegacyBackupId` is used only as the baseline for the next drift comparison. Blobs use MIME `application/json;charset=utf-8`. Hashes remain inside raw legacy bundles only as integrity metadata and are never sent to analytics.

`legacy-current` remains exportable when IndexedDB never opened. Other sources are advertised only when their records can be read; requesting an unavailable source rejects with typed `unavailable` rather than returning an empty bundle.

- [ ] **Step 5: Implement explicit recover-as-copies preparation and transaction**

Capture current legacy source twice around recovery preparation and require matching digests. Compare that stable exact source against ledger `acceptedLegacyBackupId`. Strictly parse both. For each current project/preset/import whose per-item canonical digest is new or changed:

- generate collision-safe IDs with injected `randomUUID`;
- project name becomes `Recovered — ${originalName}`;
- project working copy omits `cloud` but retains state, generator, revision, and unknown JSON fields;
- preset gets a fresh ID and appends after current IndexedDB preset order;
- pending import gets fresh import and target project IDs, omits stale cloud linkage from the working copy, and appends after existing imports;
- legacy deletions never delete IndexedDB records;
- active-ID-only change creates no project and requires the same explicit confirmation.

One transaction requires the command's `recoveryId`, ledger recovery marker, observed digest, and ledger revision to match; it then writes recovered records, conflict raw backup, accepted digest/backup pointer, incremented ledger revision, and `unresolvedRecovery: null`. It keeps current IndexedDB active project unchanged. After commit, independently read/validate target and rehash legacy. Immediate further drift reopens recovery.

- [ ] **Step 6: Run drift, recovery, and command suites**

```bash
npx vitest run tests/unit/localWorkspace/drift.test.ts tests/unit/localWorkspace/recovery.test.ts tests/unit/localWorkspace/commit.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 7: Commit**

```bash
git add services/localWorkspace/recovery.ts services/localWorkspace/legacy.ts services/localWorkspace/indexedDbAdapter.ts services/localWorkspace/LocalWorkspaceStore.ts tests/unit/localWorkspace/drift.test.ts tests/unit/localWorkspace/recovery.test.ts
git commit -m "feat(storage): preserve divergent local copies"
```

---

### Task 7: Bootstrap Gate, Recovery UI, Receipt, and Blob Downloads

**Files:**
- Create: `PRODUCT.md`
- Create: `components/workspace/WorkspaceBootstrapGate.tsx`
- Create: `components/workspace/WorkspaceBootstrapScreen.tsx`
- Create: `components/workspace/WorkspaceRecoveryScreen.tsx`
- Create: `components/workspace/MigrationReceipt.tsx`
- Create: `services/browserDownload.ts`
- Create: `tests/helpers/fakeLocalWorkspaceStore.ts`
- Create: `tests/unit/WorkspaceBootstrapGate.test.tsx`
- Create: `tests/unit/browserDownload.test.ts`

**Interfaces:**
- Consumes public store interface only.
- Produces a renderer-agnostic gate that passes a ready snapshot to a caller-supplied editor renderer and never imports `EditorPage` or private schema files.
- Produces `downloadBlob(blob, filename)` and `downloadJson(value, filename)`.

- [ ] **Step 1: Write failing gate and download tests**

```tsx
const fakeEditorRenderer = ({ initialWorkspace }: WorkspaceEditorMount) => (
  <div data-testid="editor-page">{initialWorkspace.activeProjectId}</div>
);

it('does not mount the editor while bootstrap is pending', async () => {
  const store = fakeStore({ bootstrap: deferred<WorkspaceBootstrapResult>() });
  render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);
  expect(screen.getByRole('status')).toHaveTextContent('Opening local storage');
  expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
});

it('shows receipt before editor and downloads original backup', async () => {
  const store = fakeReadyStore({ receipt: migrationReceipt({ projectCount: 3 }) });
  render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);
  expect(await screen.findByRole('heading', { name: 'Local projects upgraded' })).toBeVisible();
  expect(screen.getByText('3 projects')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Download original backup' }));
  expect(store.exportRecoveryBundle).toHaveBeenCalledWith('legacy-original');
  expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
});

it('switches from mounted editor to split-brain recovery on authority loss', async () => {
  const store = fakeReadyStore();
  render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);
  expect(await screen.findByTestId('editor-page')).toBeVisible();
  store.emitAuthorityLost(splitBrainRecovery());
  expect(await screen.findByRole('heading', { name: 'Project copies changed in another tab' })).toBeVisible();
  expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
});
```

Cover all five phase labels, stale retry suppression, initial migration failure, unavailable storage, all export combinations, split-brain confirmation, recover command failure, receipt singular/plural counts, pending import wording, receipt preference write failure, aborted observer on unmount, object URL creation/revocation, and exact Blob text.

- [ ] **Step 2: Run UI tests to verify RED**

```bash
npx vitest run tests/unit/WorkspaceBootstrapGate.test.tsx tests/unit/browserDownload.test.ts
```

Expected: FAIL because workspace UI and download modules do not exist.

- [ ] **Step 3: Implement accessible phase and recovery surfaces**

Map phases exactly:

```ts
const PHASE_LABELS: Record<WorkspaceBootstrapPhase, string> = {
  'opening-local-storage': 'Opening local storage',
  'checking-existing-projects': 'Checking existing projects',
  'copying-projects': 'Copying projects',
  'verifying-projects': 'Verifying projects',
  'finishing-upgrade': 'Finishing upgrade',
};
```

Bootstrap screen uses `<main>`, heading `Preparing your local projects`, and `role="status" aria-live="polite" aria-atomic="true"`. Supporting copy: `Keep this tab open. Existing projects remain untouched until verification finishes.` Do not render a fake percentage.

Initial failure uses `role="alert"`, heading `We couldn't upgrade local projects`, and copy `Your existing projects remain untouched. The upgrade did not finish, and the editor did not create replacement data.` Provide Retry and Download backup.

Unavailable uses heading `Local project storage is unavailable` and copy `The editor cannot open safely. No existing project data was changed.`

Split-brain uses heading `Project copies changed in another tab` and copy `Nothing was overwritten. Download either copy before choosing how to continue.` Provide available export buttons and a confirmation dialog for recovery copies. Confirmation states that cloud links are removed from working copies.

- [ ] **Step 4: Implement gate lifecycle and receipt acknowledgement preference**

Use this gate seam so Task 7 compiles before EditorPage is refactored:

```ts
export interface WorkspaceEditorMount {
  store: LocalWorkspaceStore;
  initialWorkspace: WorkspaceSnapshot;
  initialWarnings: string[];
}

export interface WorkspaceBootstrapGateProps {
  store: LocalWorkspaceStore;
  renderEditor: (mount: WorkspaceEditorMount) => React.ReactElement;
}
```

`WorkspaceBootstrapGate` creates one `AbortController`, calls `store.bootstrap({ signal, onPhase, onAuthorityLost })`, ignores stale async completions with an attempt counter, and aborts on unmount. Only a `ready` result may call `renderEditor({ store, initialWorkspace: result.snapshot, initialWarnings: [] })`.

Receipt heading is `Local projects upgraded`. Retention copy is `Original browser-storage values will stay unchanged for this release and the next release.` Continue writes preference key `doctect_workspace_migration_receipt_seen:${receipt.id}` with value `1`; this is a small non-document preference allowed to remain in `localStorage`. If writing fails, allow entry and show the receipt again next bootstrap. Download uses `legacy-original`.

- [ ] **Step 5: Implement Blob download helpers**

```ts
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  queueMicrotask(() => URL.revokeObjectURL(url));
}

export function downloadJson(value: unknown, filename: string): void {
  downloadBlob(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' }),
    filename,
  );
}
```

Do not use data URLs; projects near `MAX_STATE_BYTES` must remain exportable.

- [ ] **Step 6: Keep gate imports at the public seam**

`WorkspaceBootstrapGate.tsx` may import only React, sibling workspace UI, `services/browserDownload.ts`, and exports from `services/localWorkspace/index.ts`. It must not import `EditorPage`, `schema.ts`, `indexedDbAdapter.ts`, `legacy.ts`, or `migration.ts`. Task 8 wires the renderer after EditorPage accepts a verified snapshot.

- [ ] **Step 7: Run focused UI tests**

```bash
npx vitest run tests/unit/WorkspaceBootstrapGate.test.tsx tests/unit/browserDownload.test.ts
```

Expected: all focused tests PASS; gate compiles without changing application routes.

- [ ] **Step 8: Commit**

```bash
git add PRODUCT.md components/workspace/WorkspaceBootstrapGate.tsx components/workspace/WorkspaceBootstrapScreen.tsx components/workspace/WorkspaceRecoveryScreen.tsx components/workspace/MigrationReceipt.tsx services/browserDownload.ts tests/helpers/fakeLocalWorkspaceStore.ts tests/unit/WorkspaceBootstrapGate.test.tsx tests/unit/browserDownload.test.ts
git commit -m "feat(storage): add workspace bootstrap surfaces"
```

---

### Task 8: Editor Working Copies, Save States, and Navigation Protection

**Files:**
- Create: `hooks/useWorkspaceProjectWrites.ts`
- Create: `components/workspace/LocalSaveStatus.tsx`
- Create: `components/workspace/UnsavedNavigationDialog.tsx`
- Create: `tests/unit/useWorkspaceProjectWrites.test.tsx`
- Create: `tests/unit/EditorPageWorkspaceCommands.test.tsx`
- Modify: `pages/EditorPage.tsx`
- Modify: `components/ProjectEditor.tsx`
- Modify: `components/GeneratorVisualPreviewModal.tsx`
- Modify: `components/HierarchyGeneratorModal.tsx`
- Modify: `components/TabBar.tsx`
- Modify: `components/CloseProjectConfirmModal.tsx`
- Modify: `components/cloud/CloudMenu.tsx`
- Modify: `components/cloud/PublishModal.tsx`
- Modify: `App.tsx`
- Modify: `tests/unit/adminModerationRouting.test.tsx`
- Modify: `tests/unit/GeneratorVisualPreviewModal.test.tsx`
- Modify: `tests/unit/HierarchyGeneratorModal.test.tsx`
- Modify: `tests/unit/EditorPageGeneratedProject.test.tsx`
- Modify: `tests/unit/ProjectEditor.generatorHistory.test.tsx`
- Modify: `tests/unit/ProjectEditor.exportAllVariants.test.tsx`

**Interfaces:**
- Consumes ready `WorkspaceSnapshot` and semantic commands.
- Produces immediate working copies overlaid on durable snapshots plus per-project save status.
- Moves `WorkspaceProject` imports away from `pages/EditorPage.tsx` to the public store seam.

- [ ] **Step 1: Write failing editor command and save-generation tests**

```tsx
it('renders initial snapshot without issuing a write', () => {
  const store = fakeReadyStore();
  renderEditor({ store, initialWorkspace: workspaceSnapshot() });
  expect(store.commit).not.toHaveBeenCalled();
});

it('keeps newer working state when an older save resolves', async () => {
  const first = deferred<WorkspaceSnapshot>();
  const second = deferred<WorkspaceSnapshot>();
  const store = fakeReadyStore({ commitResults: [first, second] });
  renderHook(() => useWorkspaceProjectWrites(store, workspaceSnapshot()));
  act(() => controller.updateProject(projectNamed('first')));
  act(() => controller.updateProject(projectNamed('second')));
  first.resolve(snapshotWithProject(projectNamed('first')));
  await first.promise;
  expect(controller.getProject('project-1')?.name).toBe('second');
  expect(controller.getSaveState('project-1').status).toBe('saving');
});

it.each([
  ['quota', 'Not saved'],
  ['io', 'Not saved'],
  ['conflict', 'Storage conflict'],
])('surfaces %s without discarding working state', async (code, label) => {
  const store = rejectingStore(new WorkspaceStoreError('failed', code as never));
  renderEditor({ store, initialWorkspace: workspaceSnapshot() });
  editActiveProject();
  expect(await screen.findByText(label)).toBeVisible();
  expect(latestWorkingProject().initialState).toEqual(editedState());
});
```

Cover create/activate/close commands, last-project successor, failed structural command preserving UI, generated-project create success/failure, cloud-link and restore saves, JSON export from newest working copy, analytics only after durable success, saving/saved/failed/conflict statuses, retry with latest copy, and initial state not saved again.

- [ ] **Step 2: Run editor tests to verify RED**

```bash
npx vitest run tests/unit/useWorkspaceProjectWrites.test.tsx tests/unit/EditorPageWorkspaceCommands.test.tsx
```

Expected: FAIL because EditorPage still reads/writes legacy storage.

- [ ] **Step 3: Remove legacy project loading and ordinary autosave from EditorPage**

Delete `persistProjects`, `persistGeneratedProject`, `loadSavedProjects`, both persistence effects, active-project localStorage initialization, blank repair effect, and direct `consumeImport`. Change EditorPage signature to:

```ts
export interface EditorPageProps {
  store: LocalWorkspaceStore;
  initialWorkspace: WorkspaceSnapshot;
  initialWarnings: string[];
}

export function EditorPage({
  store,
  initialWorkspace,
  initialWarnings,
}: EditorPageProps): React.ReactElement;
```

All IDs use `proj_${crypto.randomUUID()}`. Create, activate, close, cloud link, and restore await one semantic command and apply its returned snapshot only on success. Close-last supplies one fresh blank successor. Missing custom preset is an error; it never silently creates blank content.

Change the generated-project callback type through `GeneratorVisualPreviewModal`, `HierarchyGeneratorModal`, and `ProjectEditor` so the branch remains type-consistent:

```ts
onCreateGeneratedProject: (
  name: string,
  project: GeneratedProject,
  source: GeneratorSourceDraft,
) => Promise<boolean>;
```

EditorPage builds the generated wrapper, awaits `create-and-activate-project`, applies the returned snapshot, and emits analytics only after success. Both modal layers await the promise before treating the callback result as success. Task 9 adds pending-state interaction hardening.

- [ ] **Step 4: Implement working-copy overlay and save generations**

`useWorkspaceProjectWrites` maintains:

```ts
export type ProjectSaveState =
  | { status: 'saved' }
  | { status: 'saving' }
  | { status: 'failed'; message: string }
  | { status: 'conflict'; message: string };

export interface WorkspaceProjectWrites {
  workspace: WorkspaceSnapshot;
  saveStates: ReadonlyMap<string, ProjectSaveState>;
  hasUnsavedWork: boolean;
  updateProject(project: WorkspaceProject): void;
  retryProject(projectId: string): void;
  applyDurableSnapshot(snapshot: WorkspaceSnapshot): void;
  discardProject(projectId: string): void;
}
```

Each update changes memory immediately, increments a project generation, sets saving, and calls `store.commit({ type: 'save-project', project })`; Task 5 coalesces physical writes. A completion marks saved only when its captured generation is still current. Older returned snapshots are overlaid with newer working copies. Failure retains the copy; conflict stops automatic retries.

Change `ProjectEditor` state notification from the existing 1,000 ms timeout to an immediate post-render effect that skips the initial state, including React StrictMode effect replay. The store owns debounce and queueing. Track the last reported state initialized to the initial state and emit only after its identity changes:

```ts
const lastReportedStateRef = useRef(state);
useEffect(() => {
  if (lastReportedStateRef.current === state) return;
  lastReportedStateRef.current = state;
  onStateChangeRef.current?.(state);
}, [state]);
```

- [ ] **Step 5: Add truthful save state and export actions**

`LocalSaveStatus` renders:

- saving: `role="status" aria-live="polite"`, `Saving locally…`;
- saved: `role="status"`, `Saved locally`;
- failed: `role="alert"`, `Not saved`, detail `Your work remains open in this tab, but local storage failed.` plus Retry and Download JSON;
- conflict: `role="alert"`, `Storage conflict`, detail `Another save changed this project. Your open work was not overwritten.` plus Download JSON.

Use `downloadJson` with the newest working `initialState`. Never report saved because React state changed.

- [ ] **Step 6: Convert app router and add navigation guards**

`useBlocker` requires a data router. Replace the top-level `BrowserRouter` with a `createBrowserRouter` root catch-all that renders current `PageTracker` and `AppRoutes`, preserving background gallery modal logic:

```tsx
const router = createBrowserRouter([
  { path: '*', element: <RoutedApp /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
```

Replace direct `/app` rendering only after the new EditorPage props exist:

```tsx
<Route
  path="/app"
  element={(
    <WorkspaceBootstrapGate
      store={localWorkspaceStore}
      renderEditor={({ store, initialWorkspace, initialWarnings }) => (
        <EditorPage
          store={store}
          initialWorkspace={initialWorkspace}
          initialWarnings={initialWarnings}
        />
      )}
    />
  )}
/>
```

No other route bootstraps local workspace unless it explicitly stages an import in Task 11.

In EditorPage, call `useBlocker(hasUnsavedWork)` and register `beforeunload` only while saving, failed, or conflict. `UnsavedNavigationDialog` is `role="alertdialog" aria-modal="true"`, initially focuses Stay, uses heading `Leave editor?`, copy `Changes are still saving or are not saved. Leaving now may lose them.`, and calls `blocker.reset()` or `blocker.proceed()`.

Unit tests that need EditorPage use `createMemoryRouter`/`RouterProvider`, not `MemoryRouter`, so blocker context exists.

- [ ] **Step 7: Run editor and routing suites**

```bash
npx vitest run tests/unit/useWorkspaceProjectWrites.test.tsx tests/unit/EditorPageWorkspaceCommands.test.tsx tests/unit/EditorPageGeneratedProject.test.tsx tests/unit/GeneratorVisualPreviewModal.test.tsx tests/unit/HierarchyGeneratorModal.test.tsx tests/unit/ProjectEditor.generatorHistory.test.tsx tests/unit/ProjectEditor.exportAllVariants.test.tsx tests/unit/adminModerationRouting.test.tsx tests/unit/galleryModalRouting.test.tsx
```

Expected: all focused tests PASS; initial editor render emits no persistence command.

- [ ] **Step 8: Commit**

```bash
git add App.tsx pages/EditorPage.tsx hooks/useWorkspaceProjectWrites.ts components/workspace/LocalSaveStatus.tsx components/workspace/UnsavedNavigationDialog.tsx components/ProjectEditor.tsx components/GeneratorVisualPreviewModal.tsx components/HierarchyGeneratorModal.tsx components/TabBar.tsx components/CloseProjectConfirmModal.tsx components/cloud/CloudMenu.tsx components/cloud/PublishModal.tsx tests/unit/useWorkspaceProjectWrites.test.tsx tests/unit/EditorPageWorkspaceCommands.test.tsx tests/unit/GeneratorVisualPreviewModal.test.tsx tests/unit/HierarchyGeneratorModal.test.tsx tests/unit/EditorPageGeneratedProject.test.tsx tests/unit/ProjectEditor.generatorHistory.test.tsx tests/unit/ProjectEditor.exportAllVariants.test.tsx tests/unit/adminModerationRouting.test.tsx
git commit -m "feat(storage): persist editor through workspace commands"
```

---

### Task 9: Generated-Project Pending UX

**Files:**
- Modify: `components/GeneratorVisualPreviewModal.tsx`
- Modify: `components/HierarchyGeneratorModal.tsx`
- Modify: `tests/unit/GeneratorVisualPreviewModal.test.tsx`
- Modify: `tests/unit/HierarchyGeneratorModal.test.tsx`

**Interfaces:**
- Consumes Task 8's durable `Promise<boolean>` callback.
- Prevents duplicate submissions and keeps naming UI open until durable success.
- Keeps original project and modal state unchanged when creation fails.

- [ ] **Step 1: Rewrite generated-project tests against a deferred store command**

```tsx
it('keeps naming dialog open and prevents duplicate submit while creation is pending', async () => {
  const commit = deferred<WorkspaceSnapshot>();
  renderGeneratedFlow({ commit });
  await user.type(screen.getByLabelText('Project name'), 'Separate Generated');
  await user.click(screen.getByRole('button', { name: 'Create project' }));
  expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Creating…' }));
  expect(store.commit).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('dialog')).toBeVisible();
});

it('leaves source project and modal intact when durable creation fails', async () => {
  renderGeneratedFlow({ reject: new WorkspaceStoreError('quota', 'quota') });
  await submitGeneratedProject();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not create project. Your current project is unchanged. Try again.',
  );
  expect(currentWorkspace()).toEqual(originalWorkspace());
});
```

Retain Task 8's regression assertions for distinct IDs, duplicate names, exact generator source, current schema, no cloud linkage, revision `0`, and analytics after success.

- [ ] **Step 2: Run generated suites to verify RED**

```bash
npx vitest run tests/unit/GeneratorVisualPreviewModal.test.tsx tests/unit/HierarchyGeneratorModal.test.tsx tests/unit/EditorPageGeneratedProject.test.tsx tests/unit/ProjectEditor.generatorHistory.test.tsx tests/unit/ProjectEditor.exportAllVariants.test.tsx
```

Expected: FAIL because naming UI has no pending state or duplicate-submit guard.

- [ ] **Step 3: Add pending and failure interaction states**

Naming UI tracks `creating`; disables input, cancel, and submit while pending; labels submit `Creating…`; ignores repeat submit events; and catches false/rejection with exact error copy from Step 1. Close only after awaited success. Failure resets `creating`, retains entered name and preview, and leaves source workspace untouched.

- [ ] **Step 4: Run generated suites**

```bash
npx vitest run tests/unit/GeneratorVisualPreviewModal.test.tsx tests/unit/HierarchyGeneratorModal.test.tsx tests/unit/EditorPageGeneratedProject.test.tsx tests/unit/ProjectEditor.generatorHistory.test.tsx tests/unit/ProjectEditor.exportAllVariants.test.tsx
```

Expected: all focused tests PASS without document-key access.

- [ ] **Step 5: Commit**

```bash
git add components/GeneratorVisualPreviewModal.tsx components/HierarchyGeneratorModal.tsx tests/unit/GeneratorVisualPreviewModal.test.tsx tests/unit/HierarchyGeneratorModal.test.tsx
git commit -m "feat(storage): guard generated project creation"
```

---

### Task 10: Transactional Custom Presets

**Files:**
- Modify: `services/presets.ts`
- Modify: `components/NewProjectModal.tsx`
- Modify: `components/SavePresetModal.tsx`
- Modify: `components/ProjectEditor.tsx`
- Modify: `pages/EditorPage.tsx`
- Create: `tests/unit/NewProjectModal.test.tsx`
- Create: `tests/unit/SavePresetModal.test.tsx`
- Modify: `tests/unit/presets.test.ts`
- Modify: `tests/unit/textOverflowPersistence.test.ts`

**Interfaces:**
- Keeps `services/presets.ts` pure: built-in state factories, `loadPreset`, and presentation types only.
- Consumes ordered `customPresets` from `WorkspaceSnapshot`.
- Produces async save/delete/create behavior through store commands.

- [ ] **Step 1: Write failing modal and pure-service tests**

Cover ordered cards, save/delete command shape, busy duplicate prevention, failure retention, missing preset, and state cloning:

```tsx
it('does not remove a preset card until delete commits', async () => {
  const pending = deferred<WorkspaceSnapshot>();
  renderModal({ customPresets: [customPreset()], deleteResult: pending });
  await requestPresetDelete('custom-1');
  expect(screen.getByText('My Custom Preset')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
  pending.resolve(snapshotWithoutPreset('custom-1'));
  expect(screen.queryByText('My Custom Preset')).not.toBeInTheDocument();
});

it('does not silently create blank when selected custom preset vanished', async () => {
  renderEditor({ customPresets: [] });
  await selectPresetId('missing-custom');
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'This preset is no longer available. Nothing was created.',
  );
  expect(store.commit).not.toHaveBeenCalled();
});
```

`tests/unit/presets.test.ts` must no longer call `localStorage.clear` or test persistence helpers.

- [ ] **Step 2: Run preset suites to verify RED**

```bash
npx vitest run tests/unit/presets.test.ts tests/unit/NewProjectModal.test.tsx tests/unit/SavePresetModal.test.tsx tests/unit/textOverflowPersistence.test.ts
```

Expected: FAIL because presets still own legacy storage and modal callbacks are synchronous.

- [ ] **Step 3: Remove persistence from the preset module**

Delete `STORAGE_KEY`, `saveCustomPreset`, `deleteCustomPreset`, and `getCustomPresets`. Retain `ProjectPreset`, `PresetDefinition`, `loadPreset`, and three built-in factories. Add no store import to this pure module.

- [ ] **Step 4: Make preset UI controlled and asynchronous**

Use this modal contract:

```ts
interface NewProjectModalProps {
  isOpen: boolean;
  customPresets: readonly WorkspaceCustomPreset[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSelectPreset: (presetId: ProjectPreset) => Promise<void>;
  onDeleteCustomPreset: (presetId: string) => Promise<void>;
}
```

`SavePresetModal.onSave` returns `Promise<boolean>` and owns saving/error state. ProjectEditor passes a clone of cleaned current state to EditorPage. EditorPage generates `custom_${crypto.randomUUID()}`, awaits `save-custom-preset`, and applies returned preset order. Failure copy: `Preset was not saved. Try again or download the project as JSON.` Delete failure copy: `Preset was not deleted. Nothing was changed.`

Creating from custom preset uses `structuredClone(found.initialState)`, a fresh project ID, and one `create-and-activate-project` command. Built-in presets use the same durable command.

- [ ] **Step 5: Run preset suites**

```bash
npx vitest run tests/unit/presets.test.ts tests/unit/NewProjectModal.test.tsx tests/unit/SavePresetModal.test.tsx tests/unit/textOverflowPersistence.test.ts tests/unit/EditorPageWorkspaceCommands.test.tsx
```

Expected: all focused tests PASS; pure preset tests have no storage setup.

- [ ] **Step 6: Commit**

```bash
git add services/presets.ts components/NewProjectModal.tsx components/SavePresetModal.tsx components/ProjectEditor.tsx pages/EditorPage.tsx tests/unit/NewProjectModal.test.tsx tests/unit/SavePresetModal.test.tsx tests/unit/presets.test.ts tests/unit/textOverflowPersistence.test.ts tests/unit/EditorPageWorkspaceCommands.test.tsx
git commit -m "feat(storage): persist custom presets transactionally"
```

---

### Task 11: Durable Gallery Staging and Exactly-Once Import Consumption

**Files:**
- Modify: `services/cloudApi.ts`
- Modify: `services/importProject.ts`
- Modify: `hooks/useGalleryDetail.ts`
- Modify: `components/gallery/Spotlight.tsx`
- Modify: `components/cloud/HistoryModal.tsx`
- Modify: `components/gallery/GalleryDetailBody.tsx`
- Modify: `components/workspace/WorkspaceBootstrapGate.tsx`
- Modify: `pages/EditorPage.tsx`
- Modify: `services/localWorkspace/schema.ts`
- Modify: `services/localWorkspace/migration.ts`
- Modify: `services/localWorkspace/indexedDbAdapter.ts`
- Modify: `services/localWorkspace/LocalWorkspaceStore.ts`
- Modify: `server/migrations/index.js`
- Modify: `server/routes/projects.js`
- Create: `tests/unit/importProject.test.ts`
- Modify: `tests/unit/GalleryDetailPage.test.tsx`
- Modify: `tests/unit/Spotlight.test.tsx`
- Modify: `tests/unit/HistoryModal.test.tsx`
- Modify: `tests/unit/EditorPageGeneratorMetadata.test.tsx`
- Modify: `tests/unit/WorkspaceBootstrapGate.test.tsx`
- Modify: `tests/unit/localWorkspace/commit.test.ts`
- Modify: `tests/unit/localWorkspace/indexedDbAdapter.test.ts`
- Modify: `tests/unit/server/fork.test.js`

**Interfaces:**
- `stageImport(payload): Promise<string>` bootstraps if cold, stages before navigation, and returns import ID.
- Gate consumes ordered pending imports through atomic commands before mounting EditorPage.
- Preserves normalization warnings for display exactly once.

- [ ] **Step 1: Write failing stage/navigation/consume tests**

```ts
it('does not navigate until stage-import commits', async () => {
  const staged = deferred<WorkspaceSnapshot>();
  mockStore.commit.mockReturnValue(staged.promise);
  await openGalleryProject();
  expect(navigate).not.toHaveBeenCalled();
  staged.resolve(snapshotWithPendingImport());
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/app'));
});

it('keeps remote project available when staging fails', async () => {
  mockStore.commit.mockRejectedValue(new WorkspaceStoreError('quota', 'quota'));
  await openGalleryProject();
  expect(navigate).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Could not prepare this project for the editor. Nothing was removed; try again.',
  );
});

it('consumes pending import once under React StrictMode', async () => {
  const store = fakeReadyStore({ pendingImports: [pendingImport('import-1')] });
  render(
    <StrictMode>
      <WorkspaceBootstrapGate
        store={store}
        renderEditor={({ initialWorkspace }) => (
          <div>{initialWorkspace.projects.map(project => project.name).join(', ')}</div>
        )}
      />
    </StrictMode>,
  );
  await screen.findByText('Imported Project');
  expect(store.commit).toHaveBeenCalledWith({ type: 'consume-import', importId: 'import-1' });
  expect(store.commit.mock.calls.filter(([command]) => command.type === 'consume-import')).toHaveLength(1);
});
```

Cover gallery open, fork cloud metadata, history clone, spotlight, cold bootstrap recovery/unavailable, ambiguous post-commit stage retry, server-idempotent fork retry, multiple pending imports in position order including imports appearing during consumption, consume failure retaining pending record and blocking editor, successful warning display once across stale attempts/remounts, analytics exactly once after consume, and reload without duplicates.

- [ ] **Step 2: Run import suites to verify RED**

```bash
npx vitest run tests/unit/importProject.test.ts tests/unit/GalleryDetailPage.test.tsx tests/unit/Spotlight.test.tsx tests/unit/HistoryModal.test.tsx tests/unit/EditorPageGeneratorMetadata.test.tsx tests/unit/WorkspaceBootstrapGate.test.tsx
```

Expected: FAIL because staging is synchronous legacy storage and consume removes before parsing.

- [ ] **Step 3: Replace import service with async store facade**

Keep `ImportPayload.state` as `unknown` at the network seam:

```ts
export interface ImportPayload {
  name: string;
  state: unknown;
  cloud?: { projectId: string; lastSyncedCommitId: string };
}

export async function stageImport(payload: ImportPayload): Promise<string> {
  const bootstrap = await localWorkspaceStore.bootstrap();
  if (bootstrap.status !== 'ready') {
    throw new WorkspaceStoreError('Workspace is not ready.', 'authority-lost');
  }
  const importId = `import_${crypto.randomUUID()}`;
  await localWorkspaceStore.commit({
    type: 'stage-import',
    pendingImport: {
      id: importId,
      targetProjectId: `proj_${crypto.randomUUID()}`,
      name: payload.name,
      state: payload.state,
      ...(payload.cloud ? { cloud: payload.cloud } : {}),
      createdAt: new Date().toISOString(),
    },
  });
  return importId;
}
```

Store validates/migrates the raw state before opening its stage transaction. Initial legacy migration uses warning policy `reject`; new remote staging may retain `loadProjectState` warnings on the pending record so existing non-fatal import behavior remains visible.

Callers may supply a private stable source key while preserving the ordinary one-argument API. After ready bootstrap, the import facade stores only compact per-source attempt metadata (IDs, timestamp, source key, canonical payload digest), never raw document content. Exact pending repeats and already-consumed records with matching private `consumedImportDigest` are idempotent; conflicting reuse rejects. Consumed digests include the complete normalized pending payload and warnings, survive later project edits, and remain outside public snapshots and analytics.

Fork requests use a persisted client idempotency key and the server stores that key privately with the created fork. Retrying the same authenticated user/source/key returns the original fork without another project, commit, quota charge, or fork-count increment. Missing keys preserve existing API behavior; malformed keys reject. This changes no cloud synchronization or quota policy.

- [ ] **Step 4: Await staging in every caller**

`useGalleryDetail.openInEditor`, fork, history clone, and Spotlight await `stageImport` before `navigate('/app')`. Busy state remains true. On failure they remain on the source page and show the exact Step 1 message with `role="alert"`. Change history clone callback to `Promise<void>` through `GalleryDetailBody` and `HistoryModal`.

- [ ] **Step 5: Consume pending imports in the gate before editor mount**

After ready bootstrap, show any unseen migration receipt first. Once the receipt is acknowledged (or when no receipt is due), consume pending imports in stored position order. Track IDs in a ref to survive StrictMode effect replay; adapter idempotency remains the second defense. Each successful command returns next snapshot. Collect that pending record's warnings. Only after all consume commands succeed render:

```tsx
renderEditor({
  store,
  initialWorkspace: consumedSnapshot,
  initialWarnings: importWarnings,
})
```

If consume fails, keep editor unmounted and show unavailable/retry UI. The pending record remains stored because creation, activation, and deletion share one transaction. Emit `project_imported_from_gallery` only after command success and never include project name/content.

- [ ] **Step 6: Run import and gate suites**

```bash
npx vitest run tests/unit/importProject.test.ts tests/unit/GalleryDetailPage.test.tsx tests/unit/Spotlight.test.tsx tests/unit/HistoryModal.test.tsx tests/unit/EditorPageGeneratorMetadata.test.tsx tests/unit/WorkspaceBootstrapGate.test.tsx
```

Expected: all focused tests PASS; no consume path removes data before validation or project creation.

- [ ] **Step 7: Commit**

```bash
git add services/cloudApi.ts services/importProject.ts hooks/useGalleryDetail.ts components/gallery/Spotlight.tsx components/cloud/HistoryModal.tsx components/gallery/GalleryDetailBody.tsx components/workspace/WorkspaceBootstrapGate.tsx pages/EditorPage.tsx services/localWorkspace/schema.ts services/localWorkspace/migration.ts services/localWorkspace/indexedDbAdapter.ts services/localWorkspace/LocalWorkspaceStore.ts server/migrations/index.js server/routes/projects.js tests/unit/importProject.test.ts tests/unit/GalleryDetailPage.test.tsx tests/unit/Spotlight.test.tsx tests/unit/HistoryModal.test.tsx tests/unit/EditorPageGeneratorMetadata.test.tsx tests/unit/WorkspaceBootstrapGate.test.tsx tests/unit/localWorkspace/commit.test.ts tests/unit/localWorkspace/indexedDbAdapter.test.ts tests/unit/server/fork.test.js
git commit -m "feat(storage): stage and consume imports atomically"
```

---

### Task 12: Static Boundary, Browser Migration Gates, and Final Verification

**Files:**
- Create: `tests/unit/localWorkspaceBoundary.test.ts`
- Create: `tests/e2e/fixtures/localWorkspaceMigration.js`
- Create: `tests/e2e/localWorkspaceHelpers.js`
- Create: `tests/e2e/local_workspace_migration.spec.js`
- Create: `.github/workflows/local-workspace-migration.yml`
- Modify: `package.json`
- Modify: `playwright.config.cjs`
- Modify: `tests/e2e/editor.spec.js`
- Modify: `tests/e2e/editor_canvas.spec.js`
- Modify: `tests/e2e/editor_advanced.spec.js`
- Modify: `tests/e2e/element_properties.spec.js`
- Modify: `tests/e2e/text_overflow.spec.js`
- Modify: `tests/e2e/gallery.spec.js`
- Modify: `tests/e2e/fork.spec.js`
- Modify: `tests/e2e/merge_requests.spec.js`
- Modify: `docs-capture/scenarios/gallery.js`

**Interfaces:**
- Produces an executable guard against document-key access outside migration internals and fixtures.
- Produces real-browser evidence for migration, recovery, size, and no-default-write release gates.

- [ ] **Step 1: Write the failing static boundary guard**

Recursively scan tracked and untracked source files under `pages`, `components`, `hooks`, `services`, `docs-capture`, and `tests`, excluding `node_modules`, worktrees, generated output, and approved migration fixtures. Construct forbidden strings from fragments so the guard does not allowlist itself:

```ts
const legacyKeys = [
  ['hype', 'projects'].join('_'),
  ['hype', 'active', 'project'].join('_'),
  ['hype', 'custom', 'presets'].join('_'),
  ['hype', 'import', 'pending'].join('_'),
];

const allowed = new Set([
  'services/localWorkspace/legacyTypes.ts',
  'tests/e2e/fixtures/localWorkspaceMigration.js',
]);
```

Fail when an exact key appears elsewhere or when code outside `services/localWorkspace/**` and `tests/helpers/localWorkspaceFixtures.ts` imports `legacyTypes`. Also fail when production local-workspace files contain `.setItem(`, `.removeItem(`, or `.clear(` against legacy storage, when any production file calls `localStorage.clear()`, or when schema source calls `.createIndex(`. Add script:

```json
"check:workspace-boundary": "vitest run tests/unit/localWorkspaceBoundary.test.ts"
```

Run it now; expected RED with a path:line list of every current direct access.

- [ ] **Step 2: Convert ordinary unit, browser, and docs-capture setup**

Move true legacy migration setup into `tests/e2e/fixtures/localWorkspaceMigration.js`. Ordinary tests create/reset native workspaces through fake/public store helpers. Replace broad `localStorage.clear()` with helper that closes/deletes `doctect-local-workspace` and removes only known non-document test preferences. Update gallery docs capture to await production `stageImport` rather than writing `hype_import_pending`.

Run:

```bash
npm run check:workspace-boundary
```

Expected: PASS with exact document-key strings confined to two approved files; unit fixtures import `LEGACY_KEYS` instead of repeating literals.

- [ ] **Step 3: Add real-browser migration tests**

Create these Playwright cases:

1. Valid legacy workspace with Unicode, emoji, generator scripts, cloud linkage, revisions, project order, active ID, preset order, and pending import migrates, verifies, reloads, and remains equivalent.
2. Receipt reports exact source project/preset counts and pending import preservation; original raw keys remain byte-identical.
3. Pending import creates one project and is consumed exactly once across reload.
4. Malformed outer JSON, duplicate IDs, malformed state, future schema, and data-detaching warning each block editor, identify safe category/item, and download exact raw backup.
5. Unavailable IndexedDB and terminated/open failure never mount editor or create a replacement project.
6. A direct browser adapter upgrade test keeps a version-1 connection open and verifies a version-2 open reports blocked without fallback.
7. Crash after `copied` resumes independent verification and reaches one `verified` ledger.
8. Target read-back mismatch never reaches `verified`.
9. Two concurrent new-version pages produce one initial copy.
10. Old-tab writes before, during, and after cutover enter recovery.
11. After IndexedDB edits, rollback write exposes original, changed, and IndexedDB downloads; recover-as-copies uses fresh IDs, `Recovered — ` names, no working cloud linkage, and no deletion.
12. A second rollback write reopens recovery.
13. Bootstrap held at each named phase never renders `project-pane` or writes blank data.
14. Aggregate legacy JSON above 5 MiB and one project near `MAX_STATE_BYTES` migrate and reload exactly.
15. Migration duration and supported `PerformanceObserver` long-task entries attach to Playwright report without inventing a pass/fail threshold.

Normal assertions inspect state only through:

```js
await page.evaluate(async () => {
  const { localWorkspaceStore } = await import('/services/localWorkspace/index.ts');
  const result = await localWorkspaceStore.bootstrap();
  if (result.status !== 'ready') throw new Error(`workspace ${result.status}`);
  return result.snapshot;
});
```

Only migration fixture reads or writes legacy keys directly.

- [ ] **Step 4: Configure large-source browser profiles and CI release gate**

Keep standard Chromium/Firefox/WebKit projects. Add dedicated `workspace-large-chromium` with Chromium `--unlimited-storage` and `workspace-large-firefox` with `firefoxUserPrefs: { 'dom.storage.default_quota': 20480 }`. Both dedicated projects set `testMatch: /local_workspace_migration\.spec\.js/` and `grep: /aggregate legacy JSON above 5 MiB/`; that test skips in standard projects. Assert seed success and actual UTF-8 byte count before navigation. Standard projects still run normal migration/recovery cases once each.

```js
{
  name: 'workspace-large-chromium',
  testMatch: /local_workspace_migration\.spec\.js/,
  grep: /aggregate legacy JSON above 5 MiB/,
  use: {
    ...devices['Desktop Chrome'],
    launchOptions: { args: ['--unlimited-storage'] },
  },
},
{
  name: 'workspace-large-firefox',
  testMatch: /local_workspace_migration\.spec\.js/,
  grep: /aggregate legacy JSON above 5 MiB/,
  use: {
    ...devices['Desktop Firefox'],
    launchOptions: { firefoxUserPrefs: { 'dom.storage.default_quota': 20480 } },
  },
},
```

Create `.github/workflows/local-workspace-migration.yml` triggered on pull requests touching local-workspace, editor, preset, import, App, or migration test paths. Steps: `npm ci --legacy-peer-deps`, `npx playwright install --with-deps chromium firefox webkit`, boundary guard, focused unit suites, build, then the migration spec on Chromium, Firefox, WebKit, `workspace-large-chromium`, and `workspace-large-firefox`. Upload `playwright-report/` and test attachments on failure.

- [ ] **Step 5: Run focused browser gates**

```bash
npx playwright test tests/e2e/local_workspace_migration.spec.js --project=chromium
npx playwright test tests/e2e/local_workspace_migration.spec.js --project=firefox
npx playwright test tests/e2e/local_workspace_migration.spec.js --project=webkit
npx playwright test tests/e2e/local_workspace_migration.spec.js --project=workspace-large-chromium
npx playwright test tests/e2e/local_workspace_migration.spec.js --project=workspace-large-firefox
```

Expected: all migration cases PASS in designated projects; raw legacy values remain byte-identical after every failed migration.

- [ ] **Step 6: Run full static, type, unit, and build verification**

```bash
npm run check:workspace-boundary
npx tsc --noEmit
npm test -- --run
npm run build
```

Expected: boundary guard, TypeScript, full Vitest suite, and Vite production build PASS. Existing chunk-size warning may remain; no new build error is allowed.

- [ ] **Step 7: Run full browser verification**

```bash
npm run test:e2e
```

Expected: complete configured Playwright suite PASS across Chromium, Firefox, WebKit, and dedicated large-source projects.

- [ ] **Step 8: Inspect final state and commit verification work**

```bash
git status --short
git diff --check
```

Expected: no unintended files and no whitespace errors. Leave unrelated pre-existing untracked `.superpowers/brainstorm/` and `scratch/` files untouched.

```bash
git add package.json playwright.config.cjs .github/workflows/local-workspace-migration.yml tests/unit/localWorkspaceBoundary.test.ts tests/e2e/fixtures/localWorkspaceMigration.js tests/e2e/localWorkspaceHelpers.js tests/e2e/local_workspace_migration.spec.js tests/e2e/editor.spec.js tests/e2e/editor_canvas.spec.js tests/e2e/editor_advanced.spec.js tests/e2e/element_properties.spec.js tests/e2e/text_overflow.spec.js tests/e2e/gallery.spec.js tests/e2e/fork.spec.js tests/e2e/merge_requests.spec.js docs-capture/scenarios/gallery.js
git commit -m "test(storage): enforce migration release gates"
```

Do not create an empty commit if verification required no tracked fixes.

## Spec Coverage

| Design requirement | Plan coverage |
|---|---|
| Exact authority model and no editor before verification | Tasks 2–4 and 7–8 |
| Three-method deep module and private schema/revisions/queues | Tasks 1 and 3–6 |
| Six-store IndexedDB version 1 layout with no indexes | Tasks 1 and 3 |
| Exact source digest, canonical logical target digest, and independent read-back | Tasks 1–4 |
| Strict all-or-nothing migration for projects, active order, presets, and pending import | Tasks 1–4 |
| Atomic per-project, create/activate, close, preset, and import writes | Task 5 |
| Saving/saved/not-saved/conflict UI and navigation warning | Task 8 |
| Generated project, preset, and gallery caller cutover | Tasks 8–11 |
| Old-tab/rollback detection, freeze/drain, and no silent winner | Task 6 |
| Exact original/current bundles and explicit changed/new recovery copies | Tasks 6–7 |
| Blocking progress, failure, recovery, and one-time receipt UX | Task 7 |
| Static ban on document-bearing legacy access and deletion | Task 12 |
| Unit faults, concurrency, real-browser parity, >5 MiB aggregate, near-limit state, and performance evidence | Tasks 1–6 and 12 |
| Legacy retention through two releases | Global constraints and Task 12 no-deletion guard |
| Cleanup crash recovery and raw-backup retirement | Deliberately deferred to epoch 3 or later because cutover release must contain no deletion path |

Optional `navigator.storage.estimate()` and `navigator.storage.persist()` requests are omitted from version 1: neither authorizes writes or changes migration safety, and the design marks both optional.

## Deferred Cleanup Rollout

Do not implement legacy deletion while executing this plan. After the migration release and one following production release have shipped, write a separate epoch-3-or-later spec and plan for `cleanup-started -> cleanup-complete`, partial-removal resume, recreated-key recovery, and eventual raw-backup retirement. That future plan must begin with fresh production evidence that retained legacy digests remain stable and target read-back succeeds.

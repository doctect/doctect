# IndexedDB Local Persistence Migration — design

**Date:** 2026-08-14
**Status:** design approved; implementation plan at `docs/superpowers/plans/2026-08-14-indexeddb-local-persistence-migration.md`

## Goal

Move document-bearing local persistence from `localStorage` to IndexedDB without
silently losing, replacing, skipping, or partially migrating any existing local
project data.

The migration covers:

- `hype_projects`
- `hype_active_project`
- `hype_custom_presets`
- `hype_import_pending`

Small independent preferences such as recent font choices, dismissed notices,
and onboarding flags remain in `localStorage`.

## Why this is necessary

The current editor stores every project in one `hype_projects` JSON string.
Every debounced editor update stringifies and rewrites the complete project
array synchronously. Generated projects also retain both generator scripts in
their `AppState`, custom presets duplicate complete states, and gallery imports
temporarily place another complete state in `hype_import_pending`.

This creates four related problems:

1. Document data is approaching the practical `localStorage` ceiling.
2. Large synchronous serialization and writes can block the main thread.
3. Separate project and active-project writes require manual rollback logic.
4. Ordinary autosave failures can be logged without being shown to the user.

IndexedDB provides asynchronous record storage, per-project writes, structured
cloning, and atomic transactions across the document-bearing records. It does
not provide guaranteed backup: users can clear browser data, private browsing
is ephemeral, and best-effort storage can be evicted. Cloud saves and JSON
exports remain the disaster-recovery mechanisms.

Moving persistence does not change `MAX_STATE_BYTES`. That remains an
independent cloud, validation, and denial-of-service limit.

## Approved decisions

- Use one immediate cutover release; there is no preparatory shadow-write release.
- Use an all-or-nothing migration, not lazy per-project migration.
- Do not dual-write IndexedDB and legacy document keys after cutover.
- Stop before opening the editor if any document-bearing legacy value cannot be
  parsed, migrated, or validated without discarding data.
- Show a blocking migration screen followed by a one-time migration receipt.
- Keep original legacy values unchanged through the migration release and the
  following release.
- Detect writes from already-open old tabs or a deployed rollback and enter
  recovery instead of automatically choosing a winner.
- Migrate projects, active project/order, custom presets, and pending imports.
- Write this design document without committing it; implementation remains a
  separate approved plan.

## Safety model

### Authority states

There is exactly one document authority at a time.

1. **Before verification:** legacy `localStorage` is authoritative.
2. **After verification:** IndexedDB is authoritative.
3. **During recovery:** neither source is allowed to overwrite the other.

The editor must never mount while authority is unresolved. In particular, it
must not create and persist a default blank project while IndexedDB is opening,
migration is running, or recovery is required.

### Hard invariants

1. Migration never edits or removes a legacy document key.
2. Every legacy document-bearing value is snapshotted before migration.
3. Every project and preset is validated before any target record is written.
4. All target records and the exact raw backup are committed atomically.
5. A committed copy is not authoritative until independent read-back succeeds.
6. Any data-bearing warning is a migration failure, not a successful repair.
7. Legacy and IndexedDB divergence is never merged or resolved silently.
8. A failed or interrupted migration remains safely retryable.

These are application-level guarantees. They cannot protect against deletion
of the complete browser profile, explicit clearing of all site data, disk loss,
or browser defects.

## Persistence module

Introduce one deep `LocalWorkspaceStore` module. UI code must not know the
IndexedDB schema, transaction scopes, migration state machine, or legacy-key
layout.

The module interface exposes three concepts:

```ts
interface LocalWorkspaceStore {
  bootstrap(): Promise<WorkspaceBootstrapResult>;
  commit(command: WorkspaceCommand): Promise<WorkspaceSnapshot>;
  exportRecoveryBundle(source: RecoverySource): Promise<Blob>;
}
```

`bootstrap()` returns one of:

- `ready`: an ordered workspace snapshot, optionally with a migration receipt.
- `recovery`: both sources remain preserved and user action is required.
- `unavailable`: storage could not be opened; no document source was modified.

`WorkspaceCommand` is a closed union covering the semantic writes callers need:

- save one project
- create and activate a project
- activate a project
- close a project and select or create its successor
- save or delete a custom preset
- stage an import
- consume an import, create its project, and activate it

The module hides write queues, record revisions, transaction boundaries, and
typed failures. It rejects stale project writes rather than allowing an older
asynchronous completion to overwrite a newer one.

Document-key access outside this module is prohibited, except migration test
fixtures and temporary compatibility tooling.

## IndexedDB layout

Database name: `doctect-local-workspace`

Initial database version: `1`

### `projects`

One record per project ID:

```ts
interface StoredProject {
  id: string;
  project: Project;
  storageRevision: number;
  updatedAt: string;
  consumedImportId?: string;
  consumedImportCreatedAt?: string;
  consumedImportDigest?: string;
}
```

`storageRevision` belongs to persistence and is separate from the existing
optional `Project.revision` UI field.

`consumedImportId` is private import provenance written atomically with a
consumed target project. It supports idempotent retry after a crash or reload
without entering the public project wrapper or canonical workspace digest.
`consumedImportCreatedAt` and `consumedImportDigest` pin the immutable normalized
pending payload, including retained warnings, so exact stage retries remain
idempotent after later edits to the imported project.

### `workspace`

One singleton record:

```ts
interface StoredWorkspace {
  id: 'current';
  projectOrder: string[];
  activeProjectId: string;
  revision: number;
}
```

The explicit order preserves the order currently encoded by the
`hype_projects` array.

### `presets`

One custom preset per ID, with an explicit position so existing order survives
record separation.

### `pendingImports`

Pending payloads keyed by generated import ID. The migrated singleton uses a
stable migration ID. New gallery flows await staging before navigation, then
consume the payload in the same transaction that creates and activates the
new project.

### `migrationLedger`

One record per persistence migration. The initial record includes:

- migration ID and IndexedDB schema version
- state: `copied`, `verified`, `cleanup-started`, or `cleanup-complete`
- exact legacy-source digest
- expected canonical target digest
- key-presence and per-key digest metadata
- per-project and per-preset source digests when parseable
- migrated counts
- migration timestamp
- persistence-rollout epoch
- accepted legacy digest after any explicit recovery
- unresolved recovery status

### `legacyBackup`

Exact raw legacy values, including the difference between an absent key and an
empty string. The initial snapshot and any later conflict snapshot use separate
IDs. This backup is written in the same transaction as the migrated records.

No indexes are added until an actual query requires one.

## Digests

The source digest is SHA-256 over a canonical envelope containing the four key
names, their presence flags, and their exact raw strings. It detects byte-level
legacy changes without parsing them.

The target digest is SHA-256 over canonical logical content:

- ordered project IDs
- each complete project wrapper and state
- active project ID
- ordered custom presets
- pending imports
- cloud metadata and revisions

Object keys are stable-sorted; array order remains meaningful. Hashing occurs
outside active IndexedDB transactions so transactions cannot auto-close while
waiting for unrelated asynchronous work.

Hashes are migration-integrity metadata, not analytics. They must never leave
the browser.

## Bootstrap and migration state machine

### 1. Enter bootstrap

Mount a blocking bootstrap surface before `EditorPage`. Install legacy-key
change monitoring before reading source data.

### 2. Open IndexedDB

Handle upgrade blocking and `versionchange` explicitly. If storage cannot be
opened, show unavailable/recovery UI. Do not fall back to silent legacy
editing.

### 3. Inspect the ledger

- `verified`: validate IndexedDB and check retained legacy fingerprints.
- `copied`: resume independent read-back verification.
- no ledger and legacy document data exists: start migration.
- no ledger and no legacy document data exists: create a native IndexedDB
  workspace atomically.
- target records without a recognized ledger: enter recovery; never clear them
  automatically.

### 4. Snapshot legacy source

Read all four raw values and compute the source digest. Read them again after
preparation; a changed digest means another tab is writing and migration stops.

The four legacy reads cannot be made transactionally. Stability checks,
`storage` events, retained raw values, and later drift recovery provide the
no-loss response to this unavoidable limitation.

### 5. Parse and validate everything

Validation occurs before opening a target write transaction.

Required checks include:

- valid outer JSON and expected container types
- unique, non-empty project and preset IDs
- active project ID resolves to a migrated project
- project wrappers preserve name, cloud linkage, and revision metadata
- every `AppState` migrates to the current supported schema
- future schema versions are rejected
- migrated states are structurally valid and JSON-compatible
- `loadProjectState` returns no warning that removes or detaches data
- custom preset states pass the same checks
- pending import payload and state are valid

Schema migrations that preserve document meaning are allowed. Repairs that
discard source or document-bearing fields are not.

### 6. Build target in memory

Produce all IndexedDB records, exact raw backup, source metadata, and expected
target digest before starting the transaction.

### 7. Commit the copy

One read-write transaction spans `projects`, `workspace`, `presets`,
`pendingImports`, `migrationLedger`, and `legacyBackup`.

The transaction rechecks the ledger to serialize concurrent new-version tabs.
Only the first tab writes. It stores ledger state `copied`, never `verified`.
Quota, clone, I/O, or explicit fault aborts the complete transaction.

### 8. Verify independently

After transaction completion:

1. Read every target record through the normal module interface.
2. Reconstruct the logical workspace.
3. Compare target digest, counts, order, active ID, cloud metadata, revisions,
   preset order, and pending imports.
4. Rehash retained legacy keys.

Any mismatch enters recovery while legacy remains untouched.

### 9. Switch authority

A separate small transaction changes ledger state from `copied` to `verified`.
Only then may the editor mount and IndexedDB writes begin.

### 10. Show receipt

Show one-time success receipt containing:

- migrated project count
- migrated custom preset count
- whether a pending import was preserved
- legacy-backup retention policy
- action to download the exact legacy backup

No project names or content appear in telemetry.

## Normal persistence after cutover

- Save only the changed project record, not the complete project array.
- Serialize project writes through one queue per project.
- Require expected `storageRevision`; stale writes return a conflict.
- Create-and-activate writes project, order, and active ID atomically.
- Close-project writes deletion, successor order, active ID, and optional new
  blank project atomically.
- Stage imports before navigation.
- Consume-import writes project, private import provenance, order, active ID,
  and pending-import deletion atomically; persisted provenance makes retries
  idempotent after reload.
- Gallery fork retries use a private server-backed idempotency key so an
  ambiguous response never creates or counts a second cloud fork.
- Preset save/delete preserves ordering transactionally.
- Surface saving, saved, failed, and conflict states to the user.
- On storage failure, retain in-memory work, show that it is not saved, and
  offer JSON export. Never report success solely because React state changed.

`navigator.storage.estimate()` may inform warnings but never authorizes a
write. Actual writes remain the authority. `navigator.storage.persist()` may
be requested after meaningful local-only creation or successful migration;
denial does not block editing.

## Old tabs and deployed rollbacks

An already-open pre-migration tab cannot understand the IndexedDB cutover and
may continue writing the original keys. A deployed rollback can do the same.
The new application therefore treats retained legacy values as monitored
backup, not ignored leftovers.

While the backup window is open:

- compare current legacy digest on every bootstrap
- listen for `storage` events affecting document keys
- finish already-pending IndexedDB writes when drift appears
- reject new writes and enter recovery

Missed live events are caught by the next bootstrap digest check.

No old-version write automatically wins. IndexedDB changes and changed legacy
values both remain preserved.

## Recovery

Recovery runs before the editor and does not modify either authority without
an explicit user action.

### Initial migration failure

Offer:

- retry after closing other tabs
- exact raw legacy-bundle download
- clear error category and affected key/item when safely identifiable

Valid entries are not silently migrated around an invalid one. After the raw
bundle is captured, a future explicit salvage action may quarantine invalid
content and migrate valid entries, but that is never the default path.

### Split-brain recovery

Offer:

- IndexedDB workspace export
- changed legacy bundle export
- original migration snapshot export
- explicit recovery of changed/new legacy records as copies

Recovered projects receive new IDs and `Recovered — ` names. They are local
only: cloud linkage is retained in the recovery bundle but removed from the
working copy so stale metadata cannot overwrite a cloud project. Legacy
deletions never delete IndexedDB records. Presets receive collision-safe IDs;
pending imports receive new pending IDs.

After explicit resolution, store the conflict snapshot, update the accepted
legacy digest, and continue monitoring. Another old-tab write reopens recovery.

### Recovery bundle format

A raw bundle is a JSON envelope containing:

- format identifier and version
- capture timestamp
- key names and presence flags
- exact raw strings
- SHA-256 digest

The bundle itself must round-trip byte-identically back to the original raw key
values.

## Backup retention and cleanup

The cutover ships in one release. It does not delete any legacy key.

Epoch-1 implementation deliberately contains no cleanup function;
`cleanup-started` crash recovery belongs to a separately approved epoch-3-or-later
rollout.

The original values remain throughout:

1. the migration release
2. the following production release

The earliest cleanup is an explicit later release. Because `package.json`
currently reports version `0.0.0`, cleanup uses a deliberately incremented
persistence-rollout epoch rather than semantic version or elapsed time.

Cleanup requires all of:

- ledger state `verified`
- fresh successful target read-back
- no unresolved recovery
- current legacy digest equals the accepted digest
- cleanup-eligible rollout epoch

Cleanup is idempotent:

1. Set ledger state `cleanup-started` while exact raw backup remains in
   IndexedDB.
2. Remove the four legacy keys.
3. Confirm every key is absent.
4. Set ledger state `cleanup-complete`.
5. Perform one later successful bootstrap and target verification before the
   raw IndexedDB backup becomes eligible for retirement.

A crash during key removal resumes cleanup. A key whose contents differ from
the accepted digest stops cleanup and enters recovery. Any document key
recreated after cleanup is treated as old-version data and also enters
recovery.

Tiny preference keys are never part of this cleanup.

## User experience

### Migration progress

Show named phases rather than invented percentages:

- Opening local storage
- Checking existing projects
- Copying projects
- Verifying projects
- Finishing upgrade

### Failure state

Use plain language: existing projects remain untouched, migration did not
complete, and the editor has not created replacement data. Provide Retry and
Download backup actions directly in the state.

### Save state after migration

The editor must visibly distinguish:

- saving
- saved
- not saved
- storage conflict

Closing or navigating away while a write remains pending must warn the user.

## Testing

### Unit and fault-injection tests

- absent and empty legacy keys
- one and many projects
- every supported historical schema version
- Unicode and emoji content
- retained generator source
- cloud-linked projects and revisions
- ordered custom presets
- pending import preservation
- duplicate project or preset IDs
- malformed outer JSON
- malformed project or preset state
- unsupported future schema
- any data-discarding `loadProjectState` warning
- failure before, during, and after each target transaction phase
- quota, clone, blocked-upgrade, and I/O failures
- transaction abort leaves no partial target and no verified ledger
- crash after `copied` resumes verification
- target read-back mismatch never reaches `verified`
- migration idempotency across retries and reloads
- two concurrent new-version migration tabs produce one copy
- old-tab writes before, during, and after cutover enter recovery
- create-and-activate atomicity
- import-and-consume exactly once
- preset save/delete atomicity
- stale asynchronous project save rejection
- cleanup ledger states block safely without deleting legacy keys
- recovery-bundle exact round-trip
- static guard against document-key access outside the module and fixtures

### Real-browser tests

- seed legacy data, migrate, reload, and compare in Chromium and Firefox
- run WebKit in CI
- migrate aggregate document data above 5 MiB
- migrate projects near `MAX_STATE_BYTES`
- simulate unavailable IndexedDB and blocked upgrades
- simulate a deployed rollback writing legacy data after IndexedDB edits
- recover changed legacy projects as copies
- verify bootstrap never writes a blank project while pending or failed
- verify migration receipt counts
- verify original raw keys remain byte-identical after every failed migration
- verify the migration release contains no legacy deletion path
- measure migration duration and main-thread long tasks

## Release gates

Migration may ship only when:

1. Every valid fixture preserves all document fields, order, metadata,
   generator source, and pending imports.
2. Every injected failure leaves exact legacy strings unchanged.
3. `verified` can be reached only after independent read-back succeeds.
4. No normal editor path writes document-bearing legacy keys.
5. Old-tab divergence always enters recovery.
6. The migration release contains no cleanup path for legacy document keys.
7. Chromium and Firefox real-browser migrations pass; WebKit passes in CI.

Optional analytics may record only migration state, item counts, duration, and
coarse error category. It must never include project names, content, scripts,
raw values, or hashes.

## Non-goals

- Raising `MAX_STATE_BYTES`
- Changing cloud commit storage or quotas
- Compressing IndexedDB project records before profiling demonstrates need
- Splitting individual `AppState` nodes/templates across stores in v1
- Permanent dual-writing to legacy document keys
- Automatic semantic merge between IndexedDB and changed legacy projects
- Treating IndexedDB as backup or synchronization
- Solving malicious same-origin script access; IndexedDB has the same origin
  trust model as `localStorage`

## Success definition

A user with valid existing local projects can load the migration release and
see the same projects, tab order, active project, custom presets, pending
import, cloud metadata, revisions, and generator source after reload.

At every point before that equivalence is independently verified, exact legacy
data remains untouched and downloadable. If old and new application versions
diverge, both versions remain recoverable and the application refuses to
choose silently.

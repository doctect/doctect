# IndexedDB Final Review Fixes — Design

**Date:** 2026-08-16
**Status:** approved
**Parent design:** `docs/superpowers/specs/2026-08-14-indexeddb-local-persistence-migration-design.md`
**Parent plan:** `docs/superpowers/plans/2026-08-14-indexeddb-local-persistence-migration.md`

## Goal

Close final whole-branch review findings without weakening migration authority,
changing cloud behavior, or expanding the public three-method
`LocalWorkspaceStore` interface.

The fixes cover four failures:

1. A command can adopt another project's foreign storage revision while React
   retains that project's stale bytes, allowing a later stale edit to pass CAS.
2. Authority loss unmounts the editor without preserving failed or pending
   working copies that exist only in memory.
3. A changed legacy source after an initial `copied` commit produces a Retry
   action that can never progress because every retry verifies the obsolete
   copy against the new authoritative source.
4. Static policy treats `index.html` as covered but does not analyze executable
   inline scripts, and CI path filtering can omit future production roots.

## Fixed invariants

- Project bytes and their private storage revisions move together.
- A complete command snapshot keeps every project's bytes coupled to the
  private revisions installed from the same readback.
- Active working copies overlay authoritative snapshots; stale durable bytes do
  not overlay authoritative revisions.
- Authority loss blocks and unmounts the editor, but the latest open workspace
  remains available for a user-triggered local download.
- Legacy `localStorage` remains authoritative while ledger state is `copied`.
- Replacing an unverified copy is atomic, CAS-protected, and initiated only by
  explicit Retry after a blocking failure.
- Retrying never edits or deletes a legacy document key.
- Static policy covers executable browser code even when embedded in HTML.
- Migration release gates run for every pull request, so future source roots
  cannot bypass them through an omitted path filter.

## 1. Monotonic snapshot authority

### Store publication

Project transactions may remain concurrent across different project queues.
After each durable transaction commits, its independent full-workspace readback
continues to validate and install one complete snapshot plus the private
revisions read with it. IndexedDB orders overlapping read/write transactions by
creation, so a read created before a later write completes before that write; a
read created after it observes the write. A real-IndexedDB regression pins this
ordering without adding a redundant application queue.

Readback failure freezes authority exactly as today. The store never installs
revisions from one readback while returning project bytes from another.

`LocalWorkspaceStore` still exposes only:

```ts
bootstrap(observer?): Promise<WorkspaceBootstrapResult>;
commit(command): Promise<WorkspaceSnapshot>;
exportRecoveryBundle(source): Promise<Blob>;
```

### React reconciliation

Every successful command result replaces the hook's complete durable snapshot.
The hook then overlays only entries in its live working-copy map.

- Current-generation save success removes that project's working copy before
  overlay and marks it saved.
- Older-generation save success retains the newer working copy and saving state,
  but still adopts authoritative bytes for every project without a working copy.
- Structural results replace order, active ID, presets, imports, and all durable
  project bytes before working-copy overlay.
- Removed projects invalidate and discard their working-copy generations.

This makes each visible non-working project match the private revision held by
the store.

## 2. Open-work capture on authority loss

### Editor-to-gate seam

`WorkspaceEditorMount` gains a UI-only callback for publishing the latest open
`WorkspaceSnapshot`. This does not change `LocalWorkspaceStore`.

`useWorkspaceProjectWrites` centralizes workspace publication. It invokes the
callback synchronously whenever durable state or a working-copy ref changes,
then updates React state. `EditorPage` passes the callback through from the gate.

The gate retains a structured clone in a ref. On `onAuthorityLost`, it snapshots
that ref before changing to blocked state and unmounting the editor.

### Recovery action

When an open snapshot was captured, `WorkspaceRecoveryScreen` shows
**Download open work**. The action downloads:

```ts
{
  format: 'doctect.open-workspace-recovery',
  version: 1,
  capturedAt: string,
  workspace: WorkspaceSnapshot,
}
```

The file name is `doctect-open-workspace.json`. It is generated locally with
`downloadJson`; no content, name, hash, or script reaches analytics.

Store-backed original/current/IndexedDB recovery exports remain unchanged.
Retry or recovery completion clears the captured blocked-state action only
after a new editor mount publishes its workspace.

## 3. Retryable unverified copy

### First failure

A mismatch while verifying a newly written or previously found `copied` ledger
continues to return blocking `verification-failed`. Existing copied records and
legacy values remain untouched. The store records only private in-memory intent
that the next explicit bootstrap Retry may rebuild this copied target.

After reload, initial bootstrap reports the same blocking failure; pressing
Retry in that store instance enables rebuild. No automatic winner is chosen.

### Retry preparation

Retry captures the four current legacy keys twice around strict preparation.
Parsing, schema migration, validation, hashing, target construction, and backup
construction happen outside IndexedDB transactions. Invalid or changing legacy
data returns recovery and leaves the old copied target intact.

### Atomic replacement

The adapter adds a private operation accepting:

- the exact expected copied ledger; and
- a complete newly prepared initial copy.

One read-write transaction spans all six stores. It:

1. Reads and exactly compares the current ledger with the expected copied
   ledger.
2. Reads keys for all six stores.
3. Deletes existing unverified target records inside the transaction.
4. Writes all newly prepared records, exact backup, and new `copied` ledger.
5. Commits or aborts as one unit.

The transaction never calls or exposes legacy-storage mutators. Any fault leaves
the prior copied target complete. Concurrent retry losers receive a conflict,
inspect the winner ledger, and follow normal verification.

After replacement, independent readback and `copied -> verified` CAS run through
the existing path.

## 4. Static and CI closure

### Repository discovery

Static policy discovers executable source recursively from repository root.
Explicit exclusions cover generated output, dependencies, worktrees, reports,
scratch data, archives, and documentation-only trees. Executable extensions are
JavaScript/TypeScript variants and HTML; tests and tooling remain included.

Exact legacy literals remain allowed only in:

- `services/localWorkspace/legacyTypes.ts`
- `tests/e2e/fixtures/localWorkspaceMigration.js`

### Inline HTML

For each HTML file, executable inline `<script>` bodies become virtual
JavaScript inputs for the existing TypeScript symbol/candidate analyzer.
Import maps and scripts with non-JavaScript data MIME types are skipped. Source
line offsets are retained in reported violations.

Split strings, aliases, destructuring, `.bind`, `.call`, and `.apply` receive the
same analysis inside HTML as standalone scripts.

### CI trigger

The migration workflow removes its `paths` filter and runs on every pull
request. Policy tests assert absence of a pull-request path filter rather than
duplicating a production-root list.

## Error handling

- Stale or conflicting replacement ledger: inspect winner; never overwrite it.
- Replacement quota/clone/I/O/fault: abort transaction and return retryable
  migration recovery.
- Open-work download failure: keep blocked recovery visible and show a local
  download error; do not alter either authority.
- Missing open snapshot: omit only the open-work action; store-backed recovery
  actions remain truthful.
- Inline script parse failure: report a policy violation instead of silently
  skipping executable code.

## TDD requirements

Each behavior begins RED and turns GREEN separately:

1. Cross-project foreign bytes are adopted with the revision observed after a
   different project saves.
2. Newer working copies remain over complete returned snapshots.
3. Authority loss captures failed/pending open work and downloads exact JSON
   after editor unmount.
4. First copied-ledger mismatch blocks; explicit Retry atomically rebuilds and
   verifies changed stable legacy data.
5. Retry preparation failure and every replacement fault preserve the previous
   copy and exact legacy strings.
6. Concurrent retries produce one replacement and one winner-following path.
7. Inline HTML reconstructed-key access fails policy.
8. New executable root directories are discovered without allowlist edits.
9. Workflow test proves the gate has no pull-request path filter.

After focused GREEN runs: full Vitest, TypeScript, build, static boundary,
supported migration browser matrix, and independent two-axis review.

## Non-goals

- Changing the public `LocalWorkspaceStore` method count.
- Keeping an interactive or read-only editor mounted during recovery.
- Automatically downloading files without user action.
- Replacing or merging verified IndexedDB data from legacy input.
- Changing cloud persistence, quotas, fork behavior, or analytics payloads.
- Implementing legacy cleanup or any epoch-1 legacy deletion path.
- Addressing retained nonblocking Minors or pre-existing mobile editor layout.

## Success criteria

- No stale project can pass CAS using a foreign revision paired with stale bytes.
- Authority loss always offers the latest captured open workspace when one was
  mounted, while editor content is absent from the active tree.
- Retry can reach `verified` from a stable changed legacy source after a copied
  mismatch, with atomic failure and concurrency evidence.
- Reconstructed legacy access in inline HTML fails the boundary test.
- Migration CI cannot be skipped by adding or changing a production path.
- All existing release gates remain green.

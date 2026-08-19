# IndexedDB v2 Lineage Repair and Recovery UX — Design

**Date:** 2026-08-18
**Status:** approved in conversation; written review pending
**Parent design:** `docs/superpowers/specs/2026-08-14-indexeddb-local-persistence-migration-design.md`
**Parent plan:** `docs/superpowers/plans/2026-08-14-indexeddb-local-persistence-migration.md`

## Goal

Automatically repair databases created by the earlier version-1 IndexedDB
implementation when project records lack only private `incarnation` metadata.
Preserve every user project byte and retain the existing independent authority
verification before the editor opens.

At the same time, replace recovery terminology such as “backup,” “original
backup,” and “browser copy” with plain descriptions of what each downloadable
project set contains and why a user might save it.

## Problem

The initial IndexedDB schema stored each project without an `incarnation`:

```ts
interface HistoricalStoredProjectV1 {
  id: string;
  project: WorkspaceProject;
  storageRevision: number;
  updatedAt: string;
}
```

Commit `7896c30` made lineage non-reusable by adding required, durable private
`incarnation` metadata. It did not increment `WORKSPACE_DB_VERSION`, which
remained `1`. A browser that had already created the database therefore opened
version 1 without an IndexedDB upgrade event. Strict independent readback then
rejected the historical record with an error such as:

```text
Project record 0 is missing incarnation.
```

The safety stop is correct for unknown corruption, but this particular shape is
a known application schema transition. Blocking users indefinitely or asking
them to clear site data would strand valid project content because of private
metadata omitted by an earlier build.

The recovery screen compounds the problem by exposing storage vocabulary
without explaining which project set each action contains. Downloaded recovery
files also have no user-facing restore flow in this scope, so calling them
“backups” implies capabilities the product does not currently provide.

## Approved decisions

- Increment `WORKSPACE_DB_VERSION` from `1` to `2`.
- Keep database name `doctect-local-workspace`.
- Keep migration ID `local-storage-to-indexeddb-v1` and rollout epoch `1`.
- Automatically repair only a fully recognized historical version-1 ledger
  whose project records are either current-valid or exact historical records
  whose sole schema gap is absent `incarnation` metadata.
- Preserve existing valid incarnations; never replace an incarnation that is
  present but invalid.
- Generate new incarnations only for records where the property is absent.
- Do not change project payloads, storage revisions, timestamps, workspace
  order, presets, pending imports, backups, fingerprints, or content digests.
- Perform metadata repair atomically and protect it with exact compare-and-swap
  checks.
- Continue using strict independent readback before granting editor authority.
- Explain every available project set; do not hide secondary sets behind an
  advanced disclosure.
- Keep downloaded files as safety/support artifacts. Do not add recovery-file
  import or restore UI in this correction.
- Do not clear browser data, replace a workspace, select a conflict winner, or
  mutate legacy document keys.

This design supersedes the parent plan only where that plan requires the current
database version to remain exactly `1`. The parent migration safety model and
all no-loss constraints remain in force.

## Non-goals

- Generic repair of malformed or unknown IndexedDB records.
- Automatic repair of an empty, non-string, or otherwise invalid existing
  `incarnation`.
- User-facing import of recovery bundles.
- Legacy-key cleanup or rollout-epoch advancement.
- Cloud persistence, synchronization, quota, fork, or analytics changes.
- A fourth public `LocalWorkspaceStore` method.
- Changes to canonical workspace content or digest format.

## Version-2 architecture

### Physical database open

Fresh browsers open database version 2 and create the same six stores with no
indexes. A version `1 -> 2` open retains all records. The physical version
upgrade does not create a replacement workspace or assign authority.

Existing `blocking` and `versionchange` handlers remain authoritative:

- a version-1 connection blocks the new open until it closes;
- a version-1 Doctect tab receiving `versionchange` closes its connection,
  freezes writes, and reports authority loss; and
- future or otherwise unsupported database versions remain unavailable.

Data repair deliberately follows the physical version open in a separate
application transaction. This creates one supported crash-intermediate state:
physical database version 2 with a historical version-1 ledger. Keeping that
state recognizable makes metadata repair retryable and keeps validated recovery
exports available if the process closes between the two steps.

### Ledger classification

Bootstrap classifies an inspection into four closed states:

1. **empty** — all six stores are empty;
2. **current** — exactly one fully valid ledger with `indexedDbVersion: 2`;
3. **historical-lineage** — exactly one fully valid historical ledger whose
   only ledger-version difference is `indexedDbVersion: 1`; or
4. **unrecognized** — every other non-empty shape.

The ledger validator must retain all existing exact-key, timestamp, digest,
count, state, origin, fingerprint, and recovery-marker checks. Version 1 is not
accepted by ordinary authority checks. It is accepted only by the private
lineage-repair path and for validating recovery sources after that path fails.
It never grants write authority by itself.

An empty version-2 database follows normal initial migration or native-workspace
creation. A current database follows normal bootstrap. An unrecognized target
enters existing recovery without mutation.

Historical `cleanup-started` and `cleanup-complete` ledgers follow the existing
unsupported-cleanup recovery path without lineage repair. Every other retained
recovery marker survives repair byte-for-byte; adding private lineage metadata
never clears a marker, resolves a divergence, or chooses an authority winner.

## Compatibility preparation

Preparation runs outside an active write transaction.

For each project record:

1. Require the current exact key set, allowing `incarnation` to be absent.
2. Validate every non-lineage field through existing strict target validation.
3. If `incarnation` is absent, generate a non-empty UUID.
4. If `incarnation` is present and valid, preserve it exactly.
5. If `incarnation` is present but invalid, reject compatibility repair.

Preparation also validates workspace, presets, pending imports, migration
backup, and logical reconstruction. It computes the logical workspace digest
before and after adding private metadata and requires both to equal the ledger’s
existing expected target digest.

Prepared output contains:

- exact expected historical ledger;
- exact expected project key set and records;
- replacement records only for projects missing `incarnation`;
- current ledger with `indexedDbVersion: 2` and `ledgerRevision + 1`; and
- reconstructed logical snapshot for protected recovery export.

Project `updatedAt` and `storageRevision` do not change because adding private
lineage metadata is not a user edit. Schema repair creates no second migration
receipt; the existing receipt identity and acknowledgement behavior remain
unchanged.

Before attempting the write, bootstrap creates a protected in-memory IndexedDB
workspace recovery bundle from the validated logical snapshot. If the metadata
transaction fails, valid editor project content remains downloadable without
loosening durable authority checks.

## Atomic lineage-repair transaction

One read-write transaction spans `projects` and `migrationLedger`. It:

1. Reads and exactly compares the current ledger with the prepared historical
   ledger.
2. Reads and exactly compares the complete project key set and every project
   record with preparation input.
3. Writes only project records whose `incarnation` was absent.
4. Writes the version-2 ledger with incremented ledger revision.
5. Commits or aborts as one unit.

The transaction does not read or write legacy `localStorage`, hash content,
generate UUIDs, or normalize project payloads. Faults and request failures abort
all writes.

Concurrent version-2 tabs serialize on the transaction. One repair may commit;
a conflicting caller inspects the winner. It follows normal bootstrap when the
winner is current, retries preparation only when the exact historical state
still exists, and never overwrites an unknown result.

After commit, bootstrap discards historical preparation and uses the normal
strict version-2 readback path. Ledger state remains `copied` or `verified` as
it was before repair. A copied ledger still requires the existing complete
verification and `copied -> verified` CAS before authority switches.

## Crash and failure behavior

| Condition | Required result |
| --- | --- |
| Close after physical version bump, before repair | Version-2 database retains exact v1 ledger and records; next bootstrap resumes. |
| Preparation or UUID failure | No durable repair writes; blocking retryable recovery. |
| Fault during repair transaction | Whole transaction aborts; historical records and ledger remain exact. |
| Close after repair commit, before readback | Current records and ledger remain; next bootstrap independently verifies. |
| Competing repair wins | Loser inspects and follows winner without rewriting it. |
| Missing `incarnation` only | Assign private UUID and continue verification. |
| Valid existing `incarnation` | Preserve exact value. |
| Present but invalid `incarnation` | Do not replace; enter recovery. |
| Other malformed project field | Do not repair; enter recovery. |
| Malformed or unknown ledger | Treat as unrecognized target; do not repair. |
| Blocked version upgrade | Keep editor closed; advise retry after closing other tabs. |

Every failure keeps legacy document keys untouched. No path clears IndexedDB or
silently falls back to legacy editing.

## Bootstrap data flow

```text
open database version 2
  -> inspect all stores
  -> empty: existing initial-copy flow
  -> current ledger: existing strict bootstrap flow
  -> historical v1 ledger:
       prepare exact compatibility repair
       create protected editor-project export
       commit CAS metadata transaction
       inspect current winner
       run existing independent verification
  -> unrecognized: existing blocking recovery
```

Successful repair is transparent. The affected browser profile opens its exact
projects after reload without clearing site data, downloading files, or making
a repair choice.

## Recovery UX

### Primary states

Use user outcomes before storage implementation details.

| State | Heading | Supporting copy |
| --- | --- | --- |
| Initial or verification failure | **We couldn’t finish preparing your projects** | Editor stayed closed to protect your work. Your saved projects were not replaced or deleted. |
| Storage unavailable | **Doctect can’t open your saved projects** | Local project storage could not be opened. No saved project data was changed. |
| Divergent saved sets | **We found two different saved project sets** | Another tab or an older Doctect version may have saved different changes. Nothing was overwritten. |

The exact internal message moves from the primary body into a closed
**Technical details** disclosure. It remains available for support and
diagnosis, but is not announced as the user’s first explanation.

On retryable initial failures, **Try again** is the primary action. Divergent
saved sets retain an explicit non-destructive recovery action, renamed **Add
changed projects without replacing anything**. Its confirmation heading is
**Add changed projects as separate copies?** and its confirm action is **Add
separate copies**. Place the primary next-step action before optional project
downloads so the screen does not make file selection appear mandatory.

### Project-set downloads

Replace **Recovery downloads** with **Save project copies**. Show every
available source as a separate card with a title, explanation, and unique
download action.

| Internal source | User title | Explanation | Action | Filename |
| --- | --- | --- | --- | --- |
| open workspace | **Work from this tab** | Latest workspace captured before the editor closed. It may include changes not yet saved. | **Download work from this tab** | `doctect-work-from-this-tab.json` |
| `indexeddb-workspace` | **Projects saved by this editor** | Project set stored by the current Doctect editor. | **Download editor projects** | `doctect-editor-projects.json` |
| `legacy-current` | **Projects from an older app version** | Latest project set still present in storage used by an older Doctect version. | **Download older-version projects** | `doctect-older-version-projects.json` |
| `legacy-original` | **Projects from before the update** | Exact project set Doctect found when it first started moving local projects. | **Download projects from before the update** | `doctect-projects-before-update.json` |

Section helper text states:

> Each file preserves a different project set. Keep any set you may need. These
> files are for safekeeping or support; this version of Doctect cannot open them
> directly.

Available sources remain controlled by validated store capabilities. UI copy
must never advertise or enable a source the store has not validated.

A shared UI presentation map owns source title, explanation, action label, and
filename so the recovery screen and bootstrap gate cannot drift. Internal
`RecoverySource` names and bundle formats remain unchanged.

Download failures use **Project download failed. Nothing changed. Try again.**
The changed-project recovery failure uses **We couldn’t add the separate
copies. Nothing was overwritten. Try again or save the project copies first.**

### Successful migration receipt

The receipt heading becomes **Your projects are ready** with supporting copy
**Doctect moved and checked your local projects.** Count rows remain truthful.

Replace release-specific retention language with:

> Doctect kept the previous saved project data unchanged in case recovery is
> needed.

The optional download action becomes **Download projects from before the
update** and uses the same source presentation and filename as
`legacy-original`. Loading text becomes **Preparing project file**.

User-facing paths no longer use these unexplained labels:

- Backup download
- Download backup
- Download original backup
- Download current browser copy
- Download editor copy
- Recovery downloads
- Storage detail

Internal types, comments, and recovery-format identifiers may retain precise
engineering terms where users cannot see them.

## Accessibility and interaction

- Keep the blocking surface associated with one visible heading.
- Keep the heading and outcome summary in one assertive alert region. Keep
  download cards, actions, and technical details outside that live region.
- Give every download action a unique accessible name matching its source.
- Use native `details`/`summary` semantics for technical information.
- Preserve dialog focus entry, focus trap, Escape handling, focus return, and
  background inertness.
- Preserve minimum 44-pixel actions, visible focus rings, disabled busy state,
  and reduced-motion spinner behavior.
- Keep all available project-set cards visible; do not use color alone to
  distinguish their sources.

## Testing strategy

Implementation follows red-green-refactor. Each behavior receives a failing
test before production code changes.

### Pure compatibility preparation

- Exact historical project records receive non-empty incarnations.
- Project payloads, IDs, revisions, timestamps, ordering, optional import
  provenance, presets, pending imports, backups, and expected digest remain
  exact.
- Existing valid incarnations remain exact.
- Mixed historical/current records add metadata only where absent.
- Present empty or non-string incarnations fail instead of being replaced.
- Unknown keys or any malformed non-lineage field fail compatibility.
- UUID generation failure performs no write preparation.
- Ledger version becomes 2 and ledger revision increments exactly once.

### IndexedDB adapter

- Seed a real fake-IndexedDB database at version 1 with historical raw records,
  then open at version 2.
- Prove six stores and no indexes remain unchanged.
- Prove exact CAS repair and strict version-2 readback.
- Inject faults before transaction, after each project write, after ledger
  write, and before completion; every point preserves exact historical records
  and supports retry.
- Prove two adapters produce one winner and one winner-following result.
- Prove blocked opens, old-connection `versionchange`, termination, and future
  version rejection still freeze or reject authority correctly.

### Store bootstrap

- Historical `verified` and `copied` ledgers both repair automatically and
  follow their existing verification paths.
- Historical unsupported-cleanup states remain untouched, while other
  unresolved recovery markers remain exact across metadata repair.
- Physical version 2 plus historical ledger resumes after simulated crash.
- Historical records already containing valid incarnations preserve them while
  ledger metadata advances.
- Unknown ledgers, orphan records, and malformed compatibility candidates remain
  blocked without default creation.
- Failed repair exposes current legacy, captured pre-update, and protected
  editor project files only when each source validates.
- No bootstrap path mutates a legacy document key.

### React UI

- Render all advertised source combinations for recovery and unavailable states.
- Assert each source title, explanation, unique action label, and filename
  routing.
- Assert technical details are present but closed initially.
- Assert approved headings, primary action hierarchy, receipt language, and
  download errors.
- Assert removed user-facing terms do not appear in rendered migration,
  recovery, or receipt paths.
- Retain keyboard-dialog, focus-return, live-region, busy-state, touch-target,
  and reduced-motion coverage.

### Browser proof

Playwright seeds an actual database version 1 containing a recognized ledger
and projects without `incarnation` before application load. Chromium, Firefox,
and WebKit must prove:

- exact projects, order, active project, presets, and pending imports open;
- database version is 2;
- every project has durable non-empty incarnation metadata;
- expected content digest and legacy values remain unchanged;
- recovery screen does not appear; and
- a reload follows the normal current-ledger path without regenerating
  incarnations.

After focused tests pass, run the static persistence boundary twice, full
Vitest suite, TypeScript, production build, supported browser matrix, built
Worker save proof, and independent Standards and Spec reviews.

## Success criteria

- Browser profiles affected by the missing-incarnation regression open
  automatically after reload with exact project content.
- No user must clear site data or choose between project sets to resolve this
  known metadata transition.
- Metadata repair is exact, atomic, crash-retryable, and concurrency-safe.
- Unknown or malformed targets are never silently repaired.
- Existing authority, drift, CAS, no-fallback, no-dual-write, and no-cleanup
  invariants remain intact.
- Recovery surfaces explain every available project set without requiring users
  to understand IndexedDB, legacy storage, migration ledgers, or “original
  backups.”
- Download copy states truthfully that files are safety/support artifacts and
  are not directly restorable in this scope.
- All focused, full, static, build, browser, Worker, and review gates pass.

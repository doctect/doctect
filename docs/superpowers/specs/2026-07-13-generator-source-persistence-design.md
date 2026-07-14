# Generator Source Persistence Design

**Date:** 2026-07-13
**Status:** Approved design
**Scope:** Persist, publish, reopen, edit, and safely rerun Hierarchy Generator source. Reverse synchronization from manual template edits is explicitly excluded.

## 1. Problem

Hierarchy Generator currently keeps `templateScript` and `hierarchyScript` only in modal-local React state. Running the generator imports its normalized templates, variants, nodes, and root into `AppState`, but discards both scripts. Local saves, cloud commits, gallery publishing, gallery opens, and forks preserve the generated document but cannot recover its generator.

Manual canvas edits mutate `AppState.variants[*].templates` directly. The DOM is rendered output, not project source. Reconstructing readable, human-authored JavaScript from those edits would require fragile source rewriting or would replace the original abstractions with a generated snapshot.

## 2. Goals

- Store the exact scripts last used to generate the current project lineage.
- Preserve scripts through local save, JSON download/import, cloud commits, version history, gallery publishing/opening, and forks.
- Let gallery users view, edit, preview, and rerun saved scripts.
- Never execute saved or gallery-provided source automatically.
- Execute generator source in an isolated, disposable sandbox.
- Preview generated output before replacing the current document.
- Preserve generator-source changes correctly through three-way merge requests.
- Introduce project JSON schema v9 through the existing sequential migration pattern.
- Publish an explicit immutable cloud commit snapshot; later saves and merges remain private until republished.

## 3. Non-goals

- Do not update generator JavaScript in response to manual canvas, template, hierarchy, or DOM edits.
- Do not infer generator source for projects published before this feature.
- Do not preserve un-applied source drafts after the generator modal closes.
- Do not merge individual lines or fields from two conflicting generator sources.
- Do not expose generator source as a separate gallery-detail artifact in this iteration.
- Do not permit network, storage, DOM, or parent-application access from generator code.

## 4. Persisted Data Model

`AppState` gains one optional project-level field:

```ts
export interface GeneratorProvenance {
  formatVersion: 1;
  templateScript: string;
  hierarchyScript: string;
  generatedAt: string;
}

export interface AppState {
  // Existing document and UI fields.
  generator?: GeneratorProvenance;
  schemaVersion?: number;
}
```

Serialized JSON stores both scripts as normal JSON strings. `JSON.stringify` escapes newlines, quotes, and other source characters. Cloud commit storage already serializes and gzip-compresses the full state, so no database column or separate binary artifact is needed. Generator source is subject to the existing full-state storage ceiling and compresses with the rest of the project.

`formatVersion` versions the nested generator metadata independently. `generatedAt` is assigned by the parent application only when generated output is applied. It is an ISO 8601 UTC timestamp.

The metadata records the exact source used by the last successful generator apply. Manual document edits do not alter it. Source edits inside the modal remain drafts until a successful preview is applied.

## 5. Project Schema v9

`CURRENT_SCHEMA_VERSION` increases from 8 to 9. Migration remains sequential and follows the repository's established pattern.

`migrateV8ToV9` must:

1. Deep-clone its input.
2. Preserve every existing field and value.
3. Leave `generator` absent when no valid source existed previously.
4. Set `schemaVersion` to `9`.
5. Avoid mutating its input.

The migration runner adds the explicit `version < 9` step. Existing v0–v8 documents continue through every prior migration before v8→v9. New projects, presets, and successful generator applies stamp schema v9.

The nested field is optional because old projects have no source to recover. Project schema still advances so persisted model changes remain explicit and documented.

Documentation updates are required in:

- `SCHEMA_CHANGELOG.md` — v9 entry and compatibility notes.
- `docs/2-core-data-models.md` — `GeneratorProvenance` and `AppState.generator`.
- `docs/3-state-management.md` — v8→v9 migration and persistence behavior.
- Hierarchy Generator help/documentation — source retention, public visibility, rerun replacement, and no reverse synchronization.

## 6. Metadata Validation

One shared metadata contract governs client imports, editor state, sandbox requests, and server saves.

- `generator` must be a plain object when present.
- `formatVersion` must equal `1`.
- `templateScript` and `hierarchyScript` must be strings.
- Each script may contain at most 512 KiB of UTF-8 source.
- Combined source may contain at most 1 MiB of UTF-8 source.
- `generatedAt` must be a valid ISO 8601 timestamp string.
- Unknown nested fields are ignored when normalizing imported metadata and rejected by strict server validation.

Local or downloaded project import must not lose an otherwise valid document because optional generator metadata is malformed. The document opens with generator metadata detached and a recoverable warning. Cloud save rejects malformed or oversized metadata with a specific validation error. Existing projects without `generator` remain valid.

Publishing a project containing `generator` makes both scripts public through the gallery project state. The publish flow must state this explicitly and direct the owner to review source for secrets or private comments. Hierarchy Generator provides a destructive, separately confirmed **Detach Saved Generator** action for owners who want to remove source before publishing without changing the generated document.

## 7. Secure Execution Boundary

Saved source is inert text in the parent application. The existing same-realm `new Function` path must not execute persisted or gallery-provided scripts.

Generator preview uses a disposable sandbox with these layers:

1. Parent creates a sandboxed iframe without `allow-same-origin`.
2. Iframe receives `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:; connect-src 'none'`. Only the trusted inline bootloader runs in the iframe; `unsafe-eval` exists solely because the disposable worker must evaluate generator text.
3. Trusted bootloader starts a disposable Worker so long-running source cannot block the parent indefinitely and can be terminated.
4. Parent sends only the two scripts, allowlisted page-size constants, and generation limits.
5. Worker supplies the documented generator API, including `createId`; it receives no project state or application services.
6. Result crosses the boundary through structured cloning.
7. Parent accepts only plain JSON-compatible objects and arrays, then runs normal template normalization, hierarchy validation, schema migration, and project limits.
8. Iframe and worker are destroyed after success, failure, cancellation, or timeout.

Generator code must have no access to parent DOM, cookies, local/session storage, IndexedDB, caches, network requests, WebSockets, dynamic imports, or application state. A preview has a fixed ten-second execution timeout; callers cannot shorten or extend it. Timeout, cloning failure, non-plain output, malformed output, or generated state above the existing 5 MiB/20,000-node/50-variant/50,000-element ceilings fails safely. The trusted Worker serializes and enforces the 5 MiB ceiling before sending output over a closure-private `MessagePort`; the parent independently revalidates size and structure.

Sandbox failure never mutates current project state or saved generator metadata.

## 8. Generator Modal Experience

### 8.1 Opening

- Project with valid metadata opens the exact saved scripts and shows **Saved Generator**.
- Project without metadata opens the current default preset flow.
- Gallery-opened and forked source is treated identically to all saved source: inert until explicit preview.
- No modal-open, project-load, gallery-open, or fork path executes source.

### 8.2 Drafting

- Editing either script changes modal-local draft state only.
- Switching presets with dirty drafts requires confirmation.
- Closing with dirty drafts requires discard confirmation.
- Drafts are not autosaved because saved metadata must identify source that successfully produced an applied result.

### 8.3 Preview

**Preview** runs drafts in the sandbox without changing the project. A successful preview shows:

- variant count and names;
- template count;
- node count;
- estimated exported page count;
- validation warnings;
- clear statement that applying replaces generated document fields and may discard manual edits.

Errors stay in the modal with actionable source/runtime/validation categories. A failed preview has no Apply action.

### 8.4 Apply

**Apply Generated Project** requires explicit confirmation. It creates one undo checkpoint and atomically replaces:

- `nodes`;
- `rootId`;
- `variants`;
- `activeVariantId`;
- schema version and generated-document selection fields required by the existing import path;
- `generator`, using the exact successfully previewed scripts and a parent-created timestamp.

Apply closes the preview only after the state update succeeds. Undo restores the prior document and prior generator metadata together. Cancel leaves both unchanged.

### 8.5 Manual Edits

After Apply, normal manual edits remain supported. They do not rewrite or invalidate saved source. The modal explains:

> Saved source is from the last generator apply. Manual project edits are not written back to JavaScript. Preview before applying; applying replaces the current generated document.

No DOM inspection, AST rewriting, generated patch layer, or reverse synchronization is introduced.

## 9. Persistence and Gallery Data Flow

Because metadata is inside `AppState`, existing full-state paths carry it:

1. Editor state updates include `generator`.
2. Local project autosave and JSON download serialize it.
3. JSON import migrates and validates it.
4. Cloud commits gzip and hash it with document state.
5. Version-history restore restores matching source and output snapshot.
6. Gallery publish pins the exact inspected head commit, including source after owner warning.
7. Gallery **Open in editor** stages and migrates it unchanged.
8. Gallery fork copies the pinned published commit into the fork's first commit.
9. PDF/ZIP generation ignores it.

Private cloud projects keep source private under existing project authorization. Published gallery projects expose source to anyone who can fetch and open the public project.

### 9.1 Explicit publication snapshots

`projects.head_commit_id` remains the owner's mutable cloud head. `projects.published_commit_id` separately identifies the only commit exposed by gallery detail/state, Open in editor, PDF/ZIP download, and fork. Publishing uses a strong quoted `If-Match` precondition and atomically records that commit, public metadata, and thumbnails. Ordinary saves and merge-request merges advance only `head_commit_id`; public content does not change until the owner explicitly republishes and receives the source disclosure again.

Each successful publish records its commit in `project_publications`. Anonymous and non-owner history APIs expose only these explicitly published commits, never intervening private cloud commits or their identifiers. Existing public projects migrate with their then-current head as the initial published snapshot. Unpublishing clears current public visibility and `published_commit_id`; retained publication history remains inaccessible while private.

Ordinary saves also require a strong quoted `If-Match` containing the editor's `lastSyncedCommitId`. Project creation, save, fork, and merge commit insertion plus head advancement are transaction-scoped; stale saves return stable `409 PROJECT_HEAD_CHANGED` without an orphan commit. Public-project forks always use `published_commit_id`, including forks requested by the owner.

## 10. Three-way Diff and Merge

The current structured merge ignores unknown top-level fields. It must explicitly model generator metadata so a fork cannot merge regenerated output while silently dropping corresponding source.

Diff behavior:

- Report generator added, changed, or removed relative to base.
- Surface one human-readable summary item: **Generator source changed**.
- Treat all nested metadata as one atomic value.

Merge behavior:

- Source-only change: apply source generator metadata to target.
- Target-only change: preserve target generator metadata.
- Same change on both sides: accept it once.
- Different changes on both sides: report merge conflict.
- Source removal with unchanged target: remove metadata.
- Source removal versus target modification, or source modification versus target removal: report conflict.

The merged state uses the normal current project schema. No line-level JavaScript merge is attempted.

## 11. Component Boundaries

Implementation should keep responsibilities separate:

- **Generator metadata module:** types, byte-size checks, normalization, and equality.
- **Sandbox runner:** lifecycle, message protocol, timeout, structured result, and teardown. It does not know editor state.
- **Generated-output validator:** existing normalization and hierarchy checks, callable by both modal preview and tests.
- **Hierarchy Generator modal:** source drafts, preset switching, preview status, summary, confirmation, and error presentation.
- **Project editor integration:** provides saved source, owns atomic apply/undo, and persists provenance.
- **Migration service:** v8→v9 only.
- **Server validation:** optional metadata shape/limits.
- **Structured diff/merge:** atomic generator change tracking and conflicts.

These units communicate through typed plain-data interfaces. Sandbox code does not import editor or cloud services.

## 12. Testing Strategy

### 12.1 Migration and model

- `CURRENT_SCHEMA_VERSION === 9`.
- v8→v9 preserves content and leaves generator absent.
- v0/legacy input reaches v9 through all sequential migrations.
- Migration does not mutate input and is idempotent.
- Valid source survives migration exactly, including whitespace and Unicode.
- New projects and presets carry v9.

### 12.2 Validation and persistence

- Valid optional metadata passes client/server validation.
- Wrong version/type/timestamp and per-script/combined byte-limit cases fail as specified.
- Malformed imported metadata detaches with warning while document opens.
- Local JSON, cloud compressed commit, publish/open, fork, and version-history round trips preserve exact source.
- A private save or MR merge after publication leaves gallery state/PDF/open/fork pinned until republish.
- Public history lists only explicitly published commits; private intermediate commits remain owner-only.
- Gallery PDF/ZIP behavior remains unchanged.

### 12.3 Sandbox

- Valid existing simple, complex, and gallery generators produce expected normalized output.
- DOM, parent, storage, network, dynamic-import, and application-state access fail.
- Infinite loops terminate on timeout.
- Functions, cyclic values, custom prototypes, oversized output, unknown templates, invalid roots, and excessive counts fail without state mutation.
- Success and every failure path tear down worker and iframe.

### 12.4 Modal and editor

- Saved source loads; absent source uses default preset.
- Opening never runs source.
- Dirty close and preset switch require confirmation.
- Preview displays counts without changing state.
- Failed preview disables Apply.
- Apply makes one atomic state change and stores exact source.
- Undo restores prior document and prior metadata.
- Manual element edits do not alter source.
- Detach requires confirmation and removes only metadata.

### 12.5 Diff and merge

- Generator add/change/remove appears in summaries.
- One-sided changes merge.
- Identical two-sided changes merge once.
- Divergent edits and remove-versus-edit cases conflict.
- Unchanged source preserves target metadata.
- Existing node/template merge behavior remains unchanged.

### 12.6 Browser verification

1. Generate and apply a project; save and reload; source remains exact.
2. Publish with source warning; open gallery copy; source is visible but inert.
3. Save an edited published project and verify gallery remains on the old snapshot; republish and verify it advances.
4. Fork project and verify source in initial fork commit.
5. Create merge request changing source/output and verify summary and merge result.
6. Attempt network/storage access and an infinite loop; verify isolation, timeout, and unchanged project.
7. Make manual template tweaks; reopen generator; verify source remains unchanged and Apply warns before replacement.

## 13. Acceptance Criteria

- Every newly applied generator project can reopen its exact scripts after local save, cloud save, gallery open, or fork.
- Published source never executes without explicit Preview.
- Preview runs in the specified sandbox and cannot access application/browser capabilities outside its allowlist.
- Current project remains unchanged until explicit Apply.
- Apply stores source and generated output atomically and is undoable once.
- Project JSON is schema v9 with tested sequential v8→v9 migration and updated schema documentation.
- Merge requests preserve or conflict generator metadata correctly instead of silently dropping it.
- Manual edits never attempt reverse synchronization.
- Legacy projects, projects without generator metadata, and PDF exports retain current behavior.
- Gallery state, public history, metadata, PDF/open, and forks resolve only the explicit published snapshot.

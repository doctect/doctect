# 3. State Management

PDF Architect uses a relatively standard React `useState` architecture, but concentrated primarily at the `ProjectEditor.tsx` component level to act as a localized store for the currently active project.

## Architecture

1.  **Verified Workspace (`WorkspaceBootstrapGate.tsx`)**:
    The `/app` route mounts `WorkspaceBootstrapGate` first. It calls `LocalWorkspaceStore.bootstrap()` and mounts `EditorPage` only for a verified `ready` result. Migration and recovery remain blocking states rather than alternate editor data sources.

2.  **Active Project Context (`ProjectEditor.tsx`)**:
    For the active project, `EditorPage` mounts a `ProjectEditor` component, passing the project's `AppState` as a prop (`initialState`). `ProjectEditor` maintains this in its own local `state`.

3.  **Persisted Workspace Writes (`useWorkspaceProjectWrites.ts`)**:
    `EditorPage` receives the verified snapshot and sends project or structural changes through `useWorkspaceProjectWrites`. The hook keeps failed working copies visible, reports saving/conflict states, and serializes structural commands. `LocalWorkspaceStore` coalesces edits through a per-project queue, then checks the private project incarnation and storage revision with compare-and-swap (CAS) before writing only that project record. Every successful command is followed by a complete durable read-back.

4.  **Prop Drilling**:
    `ProjectEditor` passes subset state and setter callbacks down the tree. Given the depth of the tree (e.g., `ProjectEditor` -> `Canvas` -> `CanvasElement`), prop drilling is used over a Context API setup to ensure predictable re-rendering cycles during high-frequency events like dragging elements.

## Undo/Redo History System

Implementing history involves capturing the state of the document before a mutation occurs. In `ProjectEditor`, this is managed via `saveToHistory()`.

```typescript
const historyRef = useRef<HistoryState>({ past: [], future: [] });

const saveToHistory = useCallback(() => {
    // We strictly deep-clone only the data that constitutes the "document"
    // UI state (like zoom, tool, panel widths) is ignored.
    historyRef.current.past.push({
        nodes: JSON.parse(JSON.stringify(state.nodes)),
        variants: JSON.parse(JSON.stringify(state.variants))
    });
    // Cap history size to prevent memory bloat (limit to 50 actions)
    if (historyRef.current.past.length > 50) historyRef.current.past.shift();
    historyRef.current.future = [];
}, [state.nodes, state.variants]);
```

*   **When is it called?**: `saveToHistory` is typically invoked at the *start* of an interaction (e.g., `onInteractionStart` from the Canvas on `mousedown` on a handle or during `handleDeleteElements`).
*   It avoids capturing state continuously during a mouse drag (which would create thousands of history entries).

## Document Schema Migration (`services/migration.ts`)

Stored and imported documents can use older `AppState` schemas even though IndexedDB is the current document authority.

`LocalWorkspaceStore` performs source-shape validation first (including full `AppState` validation for schema v10/v11), then schema migration through `loadProjectState` and `migrateState(state)`, final validation and normalization, and only then persistence.

*   **Versioning**: The state object includes a `schemaVersion` flag.
*   **Upgrades**: `migration.ts` contains sequential upgrade functions (e.g., `v3_to_v4`). Example: Migrating an old project that had `{ templates: {...} }` at the root object into the new `{ variants: { default: { templates: {...} } } }` structure introduced in `schemaVersion = 4`.
*   **Schema v9**: The explicit v8 → v9 step adds support for optional project-level `generator` provenance. Legacy v0–v8 projects run through each migration in order and remain valid without this field. Older projects cannot recover generator source discarded before v9.
*   **Load normalization**: External project-load paths use `loadProjectState`. After migration, it validates optional generator metadata. Invalid metadata is detached and returned as a non-fatal warning while the document itself continues loading; valid script text is retained byte-exactly and is never executed during load.

## Local Save Flow

`ProjectEditor` reports a changed `AppState` to `EditorPage`. The page updates the matching working copy through the hook rather than writing IndexedDB directly:

```typescript
void updateProject(
    projectId,
    project => ({ ...project, initialState }),
    authorityEpoch,
);
```

`useWorkspaceProjectWrites` immediately overlays that working copy in React, while `LocalWorkspaceStore.commit({ type: 'save-project', project })` enters the one-second per-project mutation queue. The queue coalesces pending edits, preserves ordering with structural commands, and supplies the expected private lineage to IndexedDB. A stale incarnation or revision fails CAS instead of overwriting newer bytes; a failed write leaves the working copy available for Retry or JSON download.

## Storage Cutover and Recovery

The IndexedDB database has six stores: `projects`, `workspace`, `presets`, `pendingImports`, `migrationLedger`, and `legacyBackup`. Initial migration validates all projects and presets in memory, writes all six stores atomically, independently reads them back, and switches authority only after the ledger becomes `verified`.

Legacy `localStorage` document keys are retained only as read-only migration and recovery input. They are monitored for old-tab or rollback drift but never become a silent editing fallback. This rollout performs no legacy cleanup and no dual write; divergence blocks editing and preserves both sources for explicit recovery.

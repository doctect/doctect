# 3. State Management

PDF Architect uses a relatively standard React `useState` architecture, but concentrated primarily at the `ProjectEditor.tsx` component level to act as a localized store for the currently active project.

## Architecture

1.  **Global Persisted Projects (`EditorPage.tsx`)**: 
    The `EditorPage` component reads the `hype_projects` array from `localStorage`. It manages adding new projects (from presets), closing projects, and selecting the active project.

2.  **Active Project Context (`ProjectEditor.tsx`)**:
    For the active project, `EditorPage` mounts a `ProjectEditor` component, passing the project's `AppState` as a prop (`initialState`). `ProjectEditor` maintains this in its own local `state`.

3.  **Prop Drilling**:
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

## Migration System (`services/migration.ts`)

Because project state is persisted in `localStorage` indefinitely, users might have projects saved using older data schemas. 

When a project is loaded, it is passed through `migrateState(state)`.

*   **Versioning**: The state object includes a `schemaVersion` flag.
*   **Upgrades**: `migration.ts` contains sequential upgrade functions (e.g., `v3_to_v4`). Example: Migrating an old project that had `{ templates: {...} }` at the root object into the new `{ variants: { default: { templates: {...} } } }` structure introduced in `schemaVersion = 4`.
*   **Schema v9**: The explicit v8 → v9 step adds support for optional project-level `generator` provenance. Legacy v0–v8 projects run through each migration in order and remain valid without this field. Older projects cannot recover generator source discarded before v9.
*   **Load normalization**: External project-load paths use `loadProjectState`. After migration, it validates optional generator metadata. Invalid metadata is detached and returned as a non-fatal warning while the document itself continues loading; valid script text is retained byte-exactly and is never executed during load.

## Auto-Save implementation

Auto-save is achieved via a `useEffect` hook in `ProjectEditor` that debounces state propagation back up to the `EditorPage` parent.

```typescript
// Debounce state changes to parent for persistence
useEffect(() => {
    const timer = setTimeout(() => {
        if (onStateChangeRef.current) {
            onStateChangeRef.current(state); // Calls back to EditorPage to persist to localStorage
        }
    }, 1000);
    return () => clearTimeout(timer);
}, [state]);
```

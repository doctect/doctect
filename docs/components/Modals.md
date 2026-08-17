# Modals (`components/Modals`)

PDF Architect uses a suite of modal components to handle complex interactions that overlay the main `ProjectEditor` interface without unmounting the canvas state.

## Core Modals

### 1. `HierarchyGeneratorModal.tsx`
The most complex modal in the system. It provides a sandboxed Javascript execution environment for power-users to generate thousands of linked nodes instantly.
*   **Editor**: Instantiates a syntax-highlighted code editor (`HighlightedCode.tsx`) using basic textarea interception.
*   **Execution**: On clicking "Generate", it safely wraps the string in a `new Function()` context injecting the `templates` API and the `createId` utility.
*   **State Injection**: If the script returns valid `{ nodes, rootId }`, it merges the newly generated tree into `AppState` using functional state updates within the parent `ProjectEditor`.
*   **Presets**: Provides built-in generation examples (`generatorPresets.ts`) like a 365-day 2026 Planner.

### 2. `JsonModal.tsx`
A diagnostic and expert-level tool. It serializes the entire `AppState` object into a collapsible, syntax-highlighted tree view.
*   It delegates complex rendering recursively to `json/JsonTreeItem.tsx` and `json/MainCollectionItem.tsx`.
*   It supports lazy-evaluation so rendering a 5MB JSON object doesn't lock the UI thread natively on mount.

### 3. `NodeSelectorModal.tsx` / `GridSourceModal.tsx`
Used when a component on the canvas (like a Grid or a linked Button) needs to point to a specific `AppNode` rather than a relative path (like "sibling").
*   It renders a searchable pseudo-sidebar mimicking the visual styling of the main hierarchy tree.
*   Returns the absolute UUID of the selected node to the instantiating component.

### 4. Lifecycle Modals
*   **`NewProjectModal.tsx`**: Provides the UI for creating a blank project or initializing from a system template variant (handled by `services/presets.ts`).
*   **`CloseProjectConfirmModal.tsx` & `DeleteConfirmModal.tsx`**: Standard interceptors preventing destructive mutations resulting in unrecoverable data loss. 
*   **`SavePresetModal.tsx`**: Validates the title and starts a preset save; `ProjectEditor` removes volatile UI state, then `EditorPage` routes the `save-custom-preset` command through `LocalWorkspaceStore` into IndexedDB's `presets` store. It never writes legacy `localStorage`; those document keys remain read-only migration and recovery inputs.

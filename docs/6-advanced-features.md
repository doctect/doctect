# 6. Advanced Features

## Smart Contextual Linking

PDF Architect is designed for densely hyperlinked documents (like Planners). Hardcoding thousands of links is impractical. The linking system relies on context.

### Relative Navigation
*   **Parent**: Links to the `parentId` of the current node. Useful for "Back" buttons (e.g., Month -> Quarter).
*   **Sibling**: Links to `current_index + linkValue`. If a node is the 3rd child of its parent, a sibling link of `1` points to the 4th child. Useful for "Next/Prev Day" tabs.
*   **Child Index**: Links to the Nth child of the current node. (e.g., "0" = 1st child).
*   **Ancestor**: Walks up the parent tree `N` steps.

### The Problem of "Shared" Context
A strict tree is insufficient for a planner. A "January 1" page logically belongs inside "January", but it *also* belongs inside "Week 1".

We solve this using **Reference Nodes** (`referenceId`).
1.  The real "Jan 1" node `node_1` is created under Parent `Month_Jan`.
2.  Under Parent `Week_1`, we create a pointer node `node_2` with `referenceId: "node_1"`.
3.  The Generator treats `node_2` identically to `node_1` (using its title, template, and data) but considers its structural placement under `Week_1`.

### `child_referrer` Linking
When on "Jan 1", you want a button pointing to "Back to Week".
*   "Jan 1" knows its parent is "January". It does *not* know about "Week 1" directly.
*   The `child_referrer` link executes a search query across the entire `nodes` state: *"Find a node who's `referenceId` points to ME (or one of my children), and whose parent matches the type 'Week'."*
*   This dynamic resolution (in `findChildReferrerNode`) is what enables complex cross-linking without explicit UUID maps.

## Automation Scripting (Hierarchy Generator)

The Scripting feature (`HierarchyGeneratorModal.tsx`) allows users to define massive node structures in seconds using JavaScript.

*   **Source retention**: Replacing the current project or creating a separate project saves the exact template and hierarchy scripts with it. Local saves, JSON files, cloud history, gallery copies, and forks retain them.
*   **Public visibility**: Publishing a project with saved generator source makes both scripts public. The publish warning asks you to review them for secrets, private comments, and identifying information.
*   **Inert opening**: Opening a local, downloaded, historical, gallery, or forked project never runs its saved scripts.
*   **Sandboxed visual Preview**: **Preview** is the only action that runs draft scripts. It uses an isolated, disposable browser sandbox with a fixed 10-second timeout, validates output, then opens live canvas template previews.
*   **Template inspection**: Variant tabs show one representative page for every template. Usage counts identify used templates, **Unused** badges identify preview-only synthetic pages, and large sets load in batches. Select any thumbnail for a lightbox view.
*   **Preview decisions**: **Back to Scripts** preserves exact drafts and the validated preview. **View Preview** reopens it without rerunning scripts. **Create New Project** asks for a name, retains source, and leaves the original project unchanged. **Replace Current Project** confirms before replacing generated fields and creates one undo checkpoint.
*   **No reverse synchronization**: Manual canvas, template, hierarchy, and JSON edits do not rewrite saved JavaScript. Saved source remains the source from the last successful generator apply.
*   **Variables**: It injects specific context variables (`templates`, `createId`, `RM_PP_WIDTH`).
*   The script must return exactly two structures:
    1.  A dictionary of `nodes`
    2.  The string ID of the `rootId`.
*   **Execution**: The sandbox evaluates both script blocks; validated output can then create a separate project or replace the current generated project state.

## Grid Traversal Paths

A Grid doesn't just display immediate children; it can drill down.
If a "Year" page wants to show all "Days" (to build a 365-day heat map), it uses a `traversalPath`.

```typescript
const path: TraversalStep[] = [
    { sliceStart: 0, sliceCount: undefined }, // Year -> Quarters (no slice, all 4)
    { sliceStart: 0, sliceCount: undefined }, // Quarters -> Months (all 3 per quarter)
    { sliceStart: 0, sliceCount: undefined }  // Months -> Days (all days)
];
```
The `traverseGridData` algorithm recursively walks this path. The slice options allow you to build UI like "Show me days 1-15 of Month 1" vs "Show me days 16-31 of Month 1" by applying an index subset during the traversal iteration.

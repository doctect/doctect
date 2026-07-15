# Generator Visual Preview Design

**Date:** 2026-07-14

**Status:** Approved

## Goal

Make Hierarchy Generator's **Preview** action visually meaningful. After sandboxed generation and validation, show a centered popup containing live, read-only canvas thumbnails for every generated template. Let users return to scripts, replace the current project, or create a separate project while leaving the original unchanged.

## Current Problem

Current Preview validates generated output and reports variant, template, node, and estimated-page counts. The label implies visual inspection, but users cannot see generated layouts before applying them.

Generator output is already validated and held separately from editor state. Existing canvas rendering can display templates with real node data. This design adds a visual decision step without weakening sandboxing or mutating the current project.

## User Experience

### Preview flow

1. User edits template and hierarchy scripts.
2. User selects **Preview**.
3. Existing sandbox executes source with the fixed 10-second timeout.
4. Existing parent validator normalizes and validates generated JSON.
5. On success, a centered **Generated Project Preview** dialog opens over the script editor.
6. User inspects one representative page for every template, switches variants, and optionally opens any thumbnail in a larger lightbox.
7. User chooses one action:
   - **Back to Scripts**: close visual preview, preserve drafts, change no project state.
   - **Create New Project**: ask for a name, create and open a separate local project, preserve the original project unchanged.
   - **Replace Current Project**: use existing replacement confirmation and atomic apply/undo behavior.

The count summary moves into the preview dialog header. Preview no longer ends at a count-only banner.

### Layout

Use the approved centered thumbnail-grid layout:

- Dialog header: title, selected variant summary, template count, node count, estimated page count, close control.
- Variant tabs: one tab per generated variant.
- Scrollable responsive card grid.
- Each card: live canvas thumbnail, template name, representative page title when used, usage count, and **Unused** badge when applicable.
- Footer: **Back to Scripts**, **Create New Project**, and **Replace Current Project**.
- Render cards in batches of 24, with **Load more** for the selected variant.

After **Back to Scripts**, the validated payload remains ready and the toolbar action reads **View Preview**. Selecting it reopens the same immutable visual preview without rerunning source. Any source edit, preset switch, or reset invalidates that payload and restores the action to **Preview**.

### Lightbox

Selecting a thumbnail opens a larger read-only canvas preview.

- Show template name, page title or **Unused template**, usage count, and variant name.
- Previous/next buttons and Left/Right Arrow keys navigate templates in the selected variant.
- Escape closes only the lightbox and returns focus to its thumbnail.

## Rendering Architecture

### Shared read-only page surface

Extract Canvas's display-only page layer into a reusable `ReadOnlyPagePreview` component.

It must use the same production display path as the editor:

- `CanvasElement`
- element z-order and layers
- node data bindings
- reference/grid resolution
- SVG sanitization and text behavior
- page dimensions and background

It must not include editor interaction state:

- selection or handles
- inline editing
- drag, resize, rotate, creation, panning, or context menus
- mutation/history callbacks

`Canvas` composes this shared display surface and adds editing overlays/interactions. Visual generator previews compose the same surface in a pointer-safe, scaled container. This avoids a second renderer and keeps ordinary canvas behavior and generator previews aligned.

### Representative nodes

For each variant:

1. Enumerate templates in stable object-key order.
2. Compute generated page order once.
3. For each template, select the first page-order node whose `type` equals the template ID.
4. Count all generated nodes using that template.
5. If no node uses the template, create a preview-only synthetic node:
   - collision-safe generated ID
   - `parentId: null`
   - `type: templateId`
   - template title
   - empty `data` and `children`

Synthetic nodes exist only in preview rendering input. They never enter the validated project or application state. Preview preparation must not mutate generated nodes, variants, templates, elements, or source.

### Scale and batching

Thumbnail scale is derived from template dimensions and card bounds while preserving aspect ratio. The lightbox derives a larger fit scale from available viewport dimensions.

Only the first 24 cards for the selected variant mount initially. **Load more** adds another 24. Switching variants resets that variant's visible batch and closes any open lightbox. This prevents thousands of live canvases from mounting at once while still allowing all templates to be inspected.

## State and Interfaces

### Preview state

Extend the existing ready preview state with visual-dialog visibility; do not regenerate or revalidate when opening or closing the visual dialog.

Define and retain this immutable ready payload:

```ts
{
  project: GeneratedProject;
  summary: GeneratedProjectSummary;
  source: {
    formatVersion: 1;
    templateScript: string;
    hierarchyScript: string;
  };
}
```

Any script edit, preset switch, reset, close, or replacement preview keeps existing cancellation/invalidation rules and removes the old visual preview payload.

### Replace current project

Keep existing `onApplyGenerated(project, source)` behavior:

- Explicit confirmation.
- Exact previewed source, not mutable current draft.
- Generated document fields and provenance updated atomically.
- One undo checkpoint.
- Dialogs close after success.

### Create new project

Add this callback from `ProjectEditor` to `EditorPage`:

```ts
onCreateGeneratedProject(
  name: string,
  project: GeneratedProject,
  source: {
    formatVersion: 1;
    templateScript: string;
    hierarchyScript: string;
  },
): boolean
```

When selected:

1. Open a small accessible naming dialog.
2. Prefill `Current Project Name – Generated`.
3. Require a trimmed non-empty name of at most 100 characters. Duplicate names are allowed because project identity uses a generated ID.
4. Build a new local project from the exact immutable preview:
   - fresh project ID
   - generated nodes/root/variants/active variant/schema
   - exact scripts with `formatVersion: 1`
   - new `generatedAt` timestamp at acceptance time
   - safe default editor selections/view state
5. Append it to local projects and open it.
6. Do not change the original project's state, saved source, undo/redo history, or cloud linkage.

The new project retains generator source so it can be reopened, edited, previewed, and rerun.

## Detach Removal and Publishing

Remove end-user **Detach Saved Generator** controls from Hierarchy Generator and visual preview. Remove its component callback/interface if no other UI uses it.

Saved generator source remains attached to projects. Publishing a source-bearing project continues to publish source and must show the existing explicit public-source/secrets warning. Update warning/help copy so it no longer instructs users to detach source before publishing.

No schema migration is required. Existing projects whose source was previously detached remain valid without provenance.

## Error Handling

### Generation and validation errors

Sandbox, protocol, timeout, source-size, and generated-project validation failures remain in the script editor. The visual dialog does not open, and current project state remains unchanged.

### Canvas rendering errors

Each template preview is isolated by an error boundary. A failure renders an error card containing the template name and a concise message. Other cards, variant tabs, and decision actions remain usable because generated JSON already passed validation.

Canvas preview errors do not prevent **Create New Project** or **Replace Current Project**. They indicate display failure, not invalid generated state.

### Creation errors

Invalid names remain in the naming dialog with inline errors. Project creation failure leaves both preview and original project intact and keeps the naming dialog open with an alert.

## Accessibility

- Main preview uses `role="dialog"`, `aria-modal="true"`, labelled title, focus trap, and focus restoration.
- Variant selector uses `tablist`, `tab`, and `tabpanel` semantics with Arrow-key navigation.
- Thumbnail cards are buttons with accessible names containing template, variant, usage count, and unused status.
- Lightbox is a labelled dialog; Escape closes only lightbox; Left/Right Arrow navigates.
- Main-dialog Escape behaves like **Back to Scripts** and changes no project state.
- Naming dialog has labelled input, inline validation, focus trap/restoration, and Escape back to visual preview.
- Render errors use non-disruptive accessible status text; action failures use `role="alert"`.

## Security and Data Integrity

- Visual rendering receives only parent-validated generated data.
- Generator source never executes during thumbnail rendering, variant switching, lightbox navigation, naming, create, or replace.
- Preview rendering cannot mutate generated output or application state.
- Existing sandbox isolation, fixed timeout, source/output size limits, reference/traversal bounds, and cancellation remain unchanged.
- Synthetic unused-template nodes are preview-local and collision-safe.
- Create and Replace use exact source bound to the successful preview.

## Testing

### Unit tests

- Representative node selection follows page order.
- Usage counts include all matching nodes.
- Unused templates receive synthetic nodes and badges.
- Synthetic IDs cannot overwrite real nodes.
- Variants remain isolated.
- Batch size is exactly 24 and Load more reveals the next batch.
- Preparation does not mutate preview state.
- Shared read-only surface preserves layer ordering, hidden-layer behavior, bindings, grids, SVG, and text without editor controls.
- Per-card error boundary isolates failures.

### Component tests

- Successful Preview opens visual dialog with counts, tabs, and cards.
- Count-only banner is removed.
- Back retains scripts and changes no project state.
- Thumbnail opens lightbox; keyboard navigation and focus restoration work.
- Variant switching changes cards and resets batching/lightbox.
- Replace confirms and checkpoints once.
- Create asks for name, creates/open separate project, preserves original and its history/cloud linkage, and retains exact source.
- Invalid names and creation errors remain recoverable.
- Detach controls are absent.
- Publish warning no longer references Detach.

### Browser tests

- Generate, inspect thumbnails, open lightbox, and return to scripts without project mutation.
- Create named separate project and verify original remains unchanged.
- Replace current project and verify Undo restores original document and provenance.
- Multi-variant preview switches tabs correctly.
- Unused template appears with badge and empty preview.
- Saved source still produces public-source warning during publish.

## Documentation

Update advanced features, in-app docs, and Hierarchy Generator help text:

- Preview now provides live canvas template previews.
- Explain Back, Create New Project, and Replace Current Project.
- Explain source retention in created projects.
- Remove end-user Detach guidance.
- Keep public-source warning and no-reverse-sync explanation.

## Out of Scope

- Full generated-page browser for every node.
- Before/after structural diff against current project.
- Raster image export or thumbnail persistence from this popup.
- Editing generated templates inside preview.
- Per-template acceptance or partial apply.
- Generator-provided project names.
- Publication-only source stripping.

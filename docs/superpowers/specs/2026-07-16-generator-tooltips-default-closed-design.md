# Generator Tooltips Default-Closed Design

**Date:** 2026-07-16
**Status:** Approved, pending written-spec review

## Goal

Open the Hierarchy Generator without covering its editing surface with help panels, while preserving all existing on-demand help.

## Current Behavior

`HierarchyGeneratorModal` renders the **Template Structure** and **Node Structure** `InfoTooltip` instances with `defaultPinned` enabled. Both panels therefore open automatically whenever the modal mounts. Other generator tooltips are already closed until the user hovers over or clicks their help control.

Tooltip pin state is modal-local. It is not stored in a project, account, browser storage, or cloud state.

## Chosen Behavior

- **Template Structure** and **Node Structure** start closed whenever the generator opens.
- Hovering over either help control temporarily shows its tooltip.
- Clicking a help control pins its tooltip; its close control unpins it.
- Closing and reopening the generator starts with both tooltips closed again.
- No preference, storage field, or settings control is added.
- Tooltip content, placement, accessibility behavior, and other generator help remain unchanged.

## Implementation Boundary

Remove the two default-pinned inputs in `components/HierarchyGeneratorModal.tsx`. Do not change the shared `InfoTooltip` interaction model or generator state persistence.

## Testing

Add focused component coverage proving that:

1. Neither tooltip panel is visible on initial modal render.
2. Hover reveals the associated help panel.
3. Click pins the panel and its close control hides it.
4. Remounting the generator starts with the panels closed.

Existing generator preview, source persistence, focus, and accessibility tests must continue to pass.

## Acceptance Criteria

1. Opening the Hierarchy Generator shows no automatically pinned tooltip.
2. Existing hover and click-to-pin help remains available.
3. No new persisted state or user setting is introduced.
4. Existing generator behavior does not regress.

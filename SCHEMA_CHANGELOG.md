# JSON Schema Changelog

This document tracks changes to the AppState JSON schema used by the project.

---

## Version 2
**Date:** 2026-01-07

### Changes
- Added `templatePreviewNodeId?: string` to AppState

### Purpose
Enables template preview node selection. When editing templates in Templates view, users can select which node's data to use for the preview (data bindings, grid children, etc.).

### Migration Notes
- Field is optional; older JSONs without this field will work without modification
- No data transformation required

---

## Version 1
**Date:** 2026-01-07

### Changes
- Added `schemaVersion?: number` to AppState
- Added `autoWidth?: boolean` to TemplateElement (for text elements)

### Purpose
- Introduced schema versioning system for future-proof migrations
- `autoWidth` enables auto-sizing text boxes based on content

### Migration Notes
- Text elements without `autoWidth` field get `autoWidth: false` during migration
- This preserves the original behavior (fixed-width text boxes)

---

## Version 0 (Legacy)
**Date:** Prior to 2026-01-07

### Structure
Original schema without versioning. Any JSON file without a `schemaVersion` field is treated as version 0.

### Migration Path
v0 → v1 → v2 (sequential migration through all versions)
